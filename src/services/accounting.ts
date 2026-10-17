import { db } from '../db/index.ts';
import { journalEntries, journalLines, accounts, accountingPeriods, auditLogs } from '../db/schema.ts';
import { eq, and, lte, gte } from 'drizzle-orm';

export interface JournalLineInput {
  accountId: string;
  debit: number; // stored in cents
  credit: number; // stored in cents
  description?: string;
}

export interface JournalEntryInput {
  entryDate: string; // YYYY-MM-DD
  reference?: string;
  description: string;
  lines: JournalLineInput[];
}

/**
 * Validates a journal entry date falls within an Open accounting period
 */
export async function validateAccountingPeriod(entryDate: string): Promise<string> {
  const periods = await db.select()
    .from(accountingPeriods)
    .where(
      and(
        lte(accountingPeriods.startDate, entryDate),
        gte(accountingPeriods.endDate, entryDate)
      )
    );

  if (periods.length === 0) {
    throw new Error(`No accounting period defined for the date ${entryDate}`);
  }

  const activePeriod = periods[0];
  if (activePeriod.status === 'Closed') {
    throw new Error(`The accounting period '${activePeriod.name}' covering ${entryDate} is Closed. Posting is blocked.`);
  }

  return activePeriod.id;
}

/**
 * Atomic double-entry posting engine
 */
export async function postJournalEntry(input: JournalEntryInput, creatorUid: string, userRole: string, txClient?: any) {
  // 1. Role Authorization
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create or post journal entries.");
  }

  // 2. Base Lines Validation
  if (!input.lines || input.lines.length < 2) {
    throw new Error("Accounting Rule: A journal entry must contain at least two lines.");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of input.lines) {
    // Stored as integer minor units (no decimals)
    if (!Number.isInteger(line.debit) || !Number.isInteger(line.credit)) {
      throw new Error("Amount Error: Decimals are not allowed. Financial amounts must be represented as integer minor units (cents).");
    }

    if (line.debit < 0 || line.credit < 0) {
      throw new Error("Amount Error: Debit and Credit values must be non-negative.");
    }

    if (line.debit > 0 && line.credit > 0) {
      throw new Error("Validation Error: A single journal line cannot contain both a Debit and a Credit.");
    }

    if (line.debit === 0 && line.credit === 0) {
      throw new Error("Validation Error: Each journal line must contain either a non-zero Debit or Credit.");
    }

    totalDebit += line.debit;
    totalCredit += line.credit;
  }

  if (totalDebit !== totalCredit) {
    throw new Error(`Parity Error: Journal entry is unbalanced. Total Debit (RM ${(totalDebit/100).toFixed(2)}) must equal Total Credit (RM ${(totalCredit/100).toFixed(2)}). Difference is RM ${((totalDebit - totalCredit)/100).toFixed(2)}.`);
  }

  if (totalDebit <= 0) {
    throw new Error("Validation Error: Transaction total amount must be greater than zero.");
  }

  const execute = async (tx: any) => {
    // A. Validate Accounting Period status
    await validateAccountingPeriod(input.entryDate);

    // B. Validate Account states
    for (const line of input.lines) {
      const dbAccounts = await tx.select().from(accounts).where(eq(accounts.id, line.accountId));
      if (dbAccounts.length === 0) {
        throw new Error(`Validation Error: Account ID ${line.accountId} does not exist.`);
      }
      const account = dbAccounts[0];
      if (!account.active) {
        throw new Error(`Validation Error: Account '${account.name}' (${account.code}) is Inactive. Postings to inactive accounts are blocked.`);
      }
    }

    // C. Create Journal Entry
    const newEntries = await tx.insert(journalEntries)
      .values({
        entryDate: input.entryDate,
        postingDate: new Date().toISOString().split('T')[0],
        reference: input.reference || null,
        description: input.description,
        status: 'Posted',
        createdBy: creatorUid,
      })
      .returning();

    const entryId = newEntries[0].id;

    // D. Create Journal Lines
    for (const line of input.lines) {
      await tx.insert(journalLines)
        .values({
          entryId,
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description || null,
        });
    }

    // E. Create Audit Log Record
    await tx.insert(auditLogs)
      .values({
        userId: creatorUid,
        action: 'POST_JOURNAL',
        tableName: 'journal_entries',
        recordId: entryId,
        newValues: {
          entryDate: input.entryDate,
          reference: input.reference,
          description: input.description,
          totalAmount: totalDebit,
          lineCount: input.lines.length,
        },
      });

    return entryId;
  };

  if (txClient) {
    return await execute(txClient);
  } else {
    return await db.transaction(async (tx) => {
      return await execute(tx);
    });
  }
}

/**
 * Void a posted journal entry by creating compensating reversing entries
 */
export async function voidJournalEntry(entryId: string, reason: string, voidedByUid: string, userRole: string, txClient?: any) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot void journal entries.");
  }

  if (!reason || reason.trim() === '') {
    throw new Error("Validation Error: A reason must be provided to void a posted journal entry.");
  }

  const execute = async (tx: any) => {
    // 1. Fetch original entry
    const entries = await tx.select().from(journalEntries).where(eq(journalEntries.id, entryId));
    if (entries.length === 0) {
      throw new Error("Journal entry not found.");
    }
    const originalEntry = entries[0];

    if (originalEntry.status !== 'Posted') {
      throw new Error(`Journal entry cannot be voided because its status is '${originalEntry.status}'. Only Posted entries can be voided.`);
    }

    // Bank Reconciliation Interlock Check
    const { checkGLJournalReconciled } = await import('./bankReconciliationService.ts');
    const reconCheck = await checkGLJournalReconciled(entryId);
    if (reconCheck.reconciled) {
      throw new Error(`Reconciled Transaction Interlock: Cannot void Journal Entry #${entryId} because its GL line belongs to Completed Bank Reconciliation Session #${reconCheck.sessionId}. The session must be reopened by an Admin first.`);
    }

    // Check if the accounting period covering the original entryDate is Closed.
    await validateAccountingPeriod(originalEntry.entryDate);

    // 2. Fetch original lines
    const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, entryId));
    if (lines.length === 0) {
      throw new Error("No lines found for original journal entry.");
    }

    // 3. Mark original entry as Voided
    await tx.update(journalEntries)
      .set({
        status: 'Voided',
        voidedAt: new Date(),
        voidedBy: voidedByUid,
        voidReason: reason,
      })
      .where(eq(journalEntries.id, entryId));

    // 4. Create compensating reversing Journal Entry
    const reversingEntries = await tx.insert(journalEntries)
      .values({
        entryDate: originalEntry.entryDate,
        postingDate: new Date().toISOString().split('T')[0],
        reference: originalEntry.reference ? `REVERSAL-${originalEntry.reference}` : 'REVERSAL',
        description: `Compensating reversal for voided entry: ${originalEntry.description}. Reason: ${reason}`,
        status: 'Posted',
        createdBy: voidedByUid,
      })
      .returning();

    const reversalId = reversingEntries[0].id;

    // 5. Insert inverted journal lines (debits become credits, credits become debits)
    for (const line of lines) {
      await tx.insert(journalLines)
        .values({
          entryId: reversalId,
          accountId: line.accountId,
          debit: line.credit, // Debit is original Credit
          credit: line.debit, // Credit is original Debit
          description: `Compensating line. ${line.description || ''}`,
        });
    }

    // 6. Record voiding in audit logs
    await tx.insert(auditLogs)
      .values({
        userId: voidedByUid,
        action: 'VOID_JOURNAL',
        tableName: 'journal_entries',
        recordId: entryId,
        oldValues: { entryId, description: originalEntry.description },
        newValues: { voidReason: reason, reversalId },
      });

    return reversalId;
  };

  if (txClient) {
    return await execute(txClient);
  } else {
    return await db.transaction(async (tx) => {
      return await execute(tx);
    });
  }
}
