import { db } from '../db/index.ts';
import { 
  expenses, 
  accounts, 
  journalEntries, 
  journalLines, 
  auditLogs, 
  users 
} from '../db/schema.ts';
import { eq, and, desc, sql, asc, inArray, like, or, gte, lte } from 'drizzle-orm';
import { validateAccountingPeriod, postJournalEntry, voidJournalEntry } from './accounting.ts';

export interface ExpenseInput {
  expenseDate: string; // YYYY-MM-DD
  description: string;
  reference?: string; // Receipt number, scan ref, external invoice
  expenseAccountId: string; // Must be active account with type 'Expense'
  paymentAccountId: string; // Must be active account with type 'Asset'
  amount: number; // Stored in integer cents (e.g. RM 50.00 -> 5000)
  notes?: string;
  status?: 'Draft' | 'Posted';
}

/**
 * Generates sequential server-side expense number: EXP-YYYY-XXXXXX
 */
export async function generateExpenseNumber(expenseDate: string): Promise<string> {
  const year = new Date(expenseDate).getFullYear() || new Date().getFullYear();
  const prefix = `EXP-${year}-`;

  const latest = await db.select({ expenseNumber: expenses.expenseNumber })
    .from(expenses)
    .where(sql`${expenses.expenseNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(expenses.expenseNumber))
    .limit(1);

  let seq = 1;
  if (latest.length > 0 && latest[0].expenseNumber) {
    const parts = latest[0].expenseNumber.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) seq = parsed + 1;
    }
  }

  return `${prefix}${String(seq).padStart(6, '0')}`;
}

/**
 * Validates accounts for direct expense transactions
 */
async function validateExpenseAccounts(
  expenseAccountId: string, 
  paymentAccountId: string, 
  tx: any
): Promise<{ expenseAccount: any; paymentAccount: any }> {
  if (expenseAccountId === paymentAccountId) {
    throw new Error("Validation Error: Expense account and Payment account cannot be the same account.");
  }

  // 1. Verify Expense Account
  const expAccList = await tx.select().from(accounts).where(eq(accounts.id, expenseAccountId));
  if (expAccList.length === 0) {
    throw new Error(`Validation Error: Selected expense account '${expenseAccountId}' does not exist.`);
  }
  const expenseAccount = expAccList[0];
  if (!expenseAccount.active) {
    throw new Error(`Validation Error: Expense account '${expenseAccount.name}' (${expenseAccount.code}) is inactive.`);
  }
  if (expenseAccount.type !== 'Expense') {
    throw new Error(`Validation Error: Selected expense account '${expenseAccount.name}' (${expenseAccount.code}) must be of type 'Expense'. Found: '${expenseAccount.type}'.`);
  }

  // 2. Verify Payment Account (Must be Asset e.g. Cash or Bank)
  const payAccList = await tx.select().from(accounts).where(eq(accounts.id, paymentAccountId));
  if (payAccList.length === 0) {
    throw new Error(`Validation Error: Selected payment account '${paymentAccountId}' does not exist.`);
  }
  const paymentAccount = payAccList[0];
  if (!paymentAccount.active) {
    throw new Error(`Validation Error: Payment account '${paymentAccount.name}' (${paymentAccount.code}) is inactive.`);
  }
  if (paymentAccount.type !== 'Asset') {
    throw new Error(`Validation Error: Selected payment account '${paymentAccount.name}' (${paymentAccount.code}) must be an Asset account (Cash or Bank). Found: '${paymentAccount.type}'.`);
  }

  return { expenseAccount, paymentAccount };
}

/**
 * Creates a Direct Expense (Draft or directly Posted)
 */
export async function createExpense(input: ExpenseInput, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create expenses.");
  }

  if (!input.description || !input.description.trim()) {
    throw new Error("Validation Error: Description is required.");
  }

  if (!input.expenseDate) {
    throw new Error("Validation Error: Expense date is required.");
  }

  if (!input.expenseAccountId || !input.paymentAccountId) {
    throw new Error("Validation Error: Both Expense Account and Payment Account are required.");
  }

  if (input.amount === undefined || input.amount === null) {
    throw new Error("Validation Error: Amount is required.");
  }

  if (!Number.isInteger(input.amount)) {
    throw new Error("Amount Error: Decimals are not allowed. Financial amounts must be represented as integer minor units (cents).");
  }

  if (input.amount <= 0) {
    throw new Error("Validation Error: Expense amount must be a positive value greater than zero.");
  }

  return await db.transaction(async (tx) => {
    // 1. Accounting period check
    await validateAccountingPeriod(input.expenseDate);

    // 2. Validate accounts
    await validateExpenseAccounts(input.expenseAccountId, input.paymentAccountId, tx);

    // 3. Generate sequential expense number
    const expenseNumber = await generateExpenseNumber(input.expenseDate);

    // If directly posted upon creation
    if (input.status === 'Posted') {
      // Create balanced journal entry (Debit Expense, Credit Cash/Bank)
      const journalId = await postJournalEntry({
        entryDate: input.expenseDate,
        reference: input.reference ? `${expenseNumber} (${input.reference.trim()})` : expenseNumber,
        description: `Direct Expense: ${input.description.trim()}`,
        lines: [
          {
            accountId: input.expenseAccountId,
            debit: input.amount,
            credit: 0,
            description: input.description.trim(),
          },
          {
            accountId: input.paymentAccountId,
            debit: 0,
            credit: input.amount,
            description: input.description.trim(),
          }
        ]
      }, creatorUid, userRole, tx);

      // Insert Expense record
      const inserted = await tx.insert(expenses).values({
        expenseNumber,
        expenseDate: input.expenseDate,
        description: input.description.trim(),
        reference: input.reference ? input.reference.trim() : null,
        expenseAccountId: input.expenseAccountId,
        paymentAccountId: input.paymentAccountId,
        amount: input.amount,
        notes: input.notes ? input.notes.trim() : null,
        status: 'Posted',
        postedJournalId: journalId,
        createdBy: creatorUid,
      }).returning();

      // Audit Log
      await tx.insert(auditLogs).values({
        userId: creatorUid,
        action: 'EXPENSE_CREATE_AND_POST',
        tableName: 'expenses',
        recordId: inserted[0].id,
        newValues: {
          expenseNumber,
          amount: input.amount,
          postedJournalId: journalId,
          expenseAccountId: input.expenseAccountId,
          paymentAccountId: input.paymentAccountId,
        }
      });

      return inserted[0];
    } else {
      // Insert as Draft
      const inserted = await tx.insert(expenses).values({
        expenseNumber,
        expenseDate: input.expenseDate,
        description: input.description.trim(),
        reference: input.reference ? input.reference.trim() : null,
        expenseAccountId: input.expenseAccountId,
        paymentAccountId: input.paymentAccountId,
        amount: input.amount,
        notes: input.notes ? input.notes.trim() : null,
        status: 'Draft',
        createdBy: creatorUid,
      }).returning();

      // Audit Log
      await tx.insert(auditLogs).values({
        userId: creatorUid,
        action: 'EXPENSE_CREATE',
        tableName: 'expenses',
        recordId: inserted[0].id,
        newValues: {
          expenseNumber,
          amount: input.amount,
          status: 'Draft',
        }
      });

      return inserted[0];
    }
  });
}

/**
 * Edits a Draft Expense
 */
export async function editDraftExpense(
  id: string, 
  input: Partial<ExpenseInput>, 
  actorUid: string, 
  userRole: string
) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot edit expenses.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(expenses).where(eq(expenses.id, id));
    if (currentList.length === 0) {
      throw new Error("Expense record not found.");
    }
    const current = currentList[0];

    if (current.status !== 'Draft') {
      throw new Error(`Validation Error: Only Draft expenses can be edited. Current Status: '${current.status}'. Posted and Voided expenses are immutable.`);
    }

    const updatedExpenseDate = input.expenseDate || current.expenseDate;
    const updatedExpenseAccountId = input.expenseAccountId || current.expenseAccountId;
    const updatedPaymentAccountId = input.paymentAccountId || current.paymentAccountId;
    const updatedAmount = input.amount !== undefined ? input.amount : current.amount;
    const updatedDesc = input.description !== undefined ? input.description.trim() : current.description;

    if (!updatedDesc) {
      throw new Error("Validation Error: Description cannot be empty.");
    }

    if (!Number.isInteger(updatedAmount)) {
      throw new Error("Amount Error: Decimals are not allowed. Financial amounts must be represented as integer minor units (cents).");
    }

    if (updatedAmount <= 0) {
      throw new Error("Validation Error: Expense amount must be a positive value greater than zero.");
    }

    // Period check
    await validateAccountingPeriod(updatedExpenseDate);

    // Account validation
    await validateExpenseAccounts(updatedExpenseAccountId, updatedPaymentAccountId, tx);

    const updated = await tx.update(expenses).set({
      expenseDate: updatedExpenseDate,
      description: updatedDesc,
      reference: input.reference !== undefined ? (input.reference ? input.reference.trim() : null) : current.reference,
      expenseAccountId: updatedExpenseAccountId,
      paymentAccountId: updatedPaymentAccountId,
      amount: updatedAmount,
      notes: input.notes !== undefined ? (input.notes ? input.notes.trim() : null) : current.notes,
      updatedAt: new Date(),
    }).where(eq(expenses.id, id)).returning();

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: actorUid,
      action: 'EXPENSE_UPDATE',
      tableName: 'expenses',
      recordId: id,
      oldValues: {
        amount: current.amount,
        description: current.description,
        expenseAccountId: current.expenseAccountId,
        paymentAccountId: current.paymentAccountId,
      },
      newValues: {
        amount: updatedAmount,
        description: updatedDesc,
        expenseAccountId: updatedExpenseAccountId,
        paymentAccountId: updatedPaymentAccountId,
      }
    });

    return updated[0];
  });
}

/**
 * Posts a Draft Expense to the General Ledger atomically
 */
export async function postExpense(id: string, actorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot post expenses.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(expenses).where(eq(expenses.id, id));
    if (currentList.length === 0) {
      throw new Error("Expense record not found.");
    }
    const expense = currentList[0];

    if (expense.status === 'Posted') {
      throw new Error(`Validation Error: Expense ${expense.expenseNumber} is already posted. Duplicate posting is strictly prohibited.`);
    }

    if (expense.status === 'Voided') {
      throw new Error(`Validation Error: Cannot post a Voided expense (${expense.expenseNumber}).`);
    }

    if (expense.status !== 'Draft') {
      throw new Error(`Validation Error: Only Draft expenses can be posted. Current Status: '${expense.status}'.`);
    }

    // 1. Accounting period check
    await validateAccountingPeriod(expense.expenseDate);

    // 2. Validate accounts are still valid and active
    await validateExpenseAccounts(expense.expenseAccountId, expense.paymentAccountId, tx);

    // 3. Post balanced journal entry: Debit Expense, Credit Cash/Bank
    const journalId = await postJournalEntry({
      entryDate: expense.expenseDate,
      reference: expense.reference ? `${expense.expenseNumber} (${expense.reference})` : expense.expenseNumber,
      description: `Direct Expense: ${expense.description}`,
      lines: [
        {
          accountId: expense.expenseAccountId,
          debit: expense.amount,
          credit: 0,
          description: expense.description,
        },
        {
          accountId: expense.paymentAccountId,
          debit: 0,
          credit: expense.amount,
          description: expense.description,
        }
      ]
    }, actorUid, userRole, tx);

    // 4. Update Expense record to Posted
    const updated = await tx.update(expenses).set({
      status: 'Posted',
      postedJournalId: journalId,
      updatedAt: new Date(),
    }).where(eq(expenses.id, id)).returning();

    // 5. Audit Log
    await tx.insert(auditLogs).values({
      userId: actorUid,
      action: 'EXPENSE_POST',
      tableName: 'expenses',
      recordId: id,
      newValues: {
        expenseNumber: expense.expenseNumber,
        postedJournalId: journalId,
        amount: expense.amount,
      }
    });

    return {
      expense: updated[0],
      journalId,
    };
  });
}

/**
 * Voids a Posted Expense and creates compensating reversal journal entry
 */
export async function voidExpense(
  id: string, 
  reason: string, 
  actorUid: string, 
  userRole: string
) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot void expenses.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("Validation Error: A specific reason must be provided when voiding an expense.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(expenses).where(eq(expenses.id, id));
    if (currentList.length === 0) {
      throw new Error("Expense record not found.");
    }
    const expense = currentList[0];

    if (expense.status === 'Draft') {
      throw new Error(`Validation Error: Draft expenses cannot be voided; delete them instead.`);
    }

    if (expense.status === 'Voided') {
      throw new Error(`Validation Error: Expense ${expense.expenseNumber} has already been voided. Secondary void is prohibited.`);
    }

    if (expense.status !== 'Posted' || !expense.postedJournalId) {
      throw new Error(`Validation Error: Only Posted expenses can be voided. Current Status: '${expense.status}'.`);
    }

    // Bank Reconciliation Interlock Check
    const { checkGLJournalReconciled } = await import('./bankReconciliationService.ts');
    const reconCheck = await checkGLJournalReconciled(expense.postedJournalId);
    if (reconCheck.reconciled) {
      throw new Error(`Reconciled Transaction Interlock: Cannot void Expense ${expense.expenseNumber} because its GL line belongs to Completed Bank Reconciliation Session #${reconCheck.sessionId}. The session must be reopened by an Admin first.`);
    }

    // 1. Accounting period check
    await validateAccountingPeriod(expense.expenseDate);

    // 2. Void linked journal entry (inverts debit/credit lines into compensating journal)
    const reversalJournalId = await voidJournalEntry(
      expense.postedJournalId,
      `Voided Direct Expense ${expense.expenseNumber}. Reason: ${reason.trim()}`,
      actorUid,
      userRole,
      tx
    );

    // 3. Mark Expense as Voided
    const updated = await tx.update(expenses).set({
      status: 'Voided',
      reversalJournalId,
      voidedAt: new Date(),
      voidedBy: actorUid,
      voidReason: reason.trim(),
      updatedAt: new Date(),
    }).where(eq(expenses.id, id)).returning();

    // 4. Audit Log
    await tx.insert(auditLogs).values({
      userId: actorUid,
      action: 'EXPENSE_VOID',
      tableName: 'expenses',
      recordId: id,
      newValues: {
        expenseNumber: expense.expenseNumber,
        voidReason: reason.trim(),
        reversalJournalId,
      }
    });

    return {
      expense: updated[0],
      reversalJournalId,
    };
  });
}

/**
 * Deletes a Draft Expense (destructive delete permitted only for drafts)
 */
export async function deleteDraftExpense(id: string, actorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot delete expenses.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(expenses).where(eq(expenses.id, id));
    if (currentList.length === 0) {
      throw new Error("Expense record not found.");
    }
    const expense = currentList[0];

    if (expense.status !== 'Draft') {
      throw new Error(`Validation Error: Cannot delete a ${expense.status} expense (${expense.expenseNumber}). Posted and Voided accounting records are immutable.`);
    }

    await tx.delete(expenses).where(eq(expenses.id, id));

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: actorUid,
      action: 'EXPENSE_DELETE',
      tableName: 'expenses',
      recordId: id,
      oldValues: {
        expenseNumber: expense.expenseNumber,
        description: expense.description,
        amount: expense.amount,
      }
    });

    return true;
  });
}

/**
 * Fetches expenses with filtering and joined account metadata
 */
export async function getExpenses(filters?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  expenseAccountId?: string;
  paymentAccountId?: string;
  search?: string;
}) {
  const expAccAlias = accounts;
  
  let conditions: any[] = [];

  if (filters?.status && filters.status !== 'All') {
    conditions.push(eq(expenses.status, filters.status));
  }

  if (filters?.startDate) {
    conditions.push(gte(expenses.expenseDate, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(expenses.expenseDate, filters.endDate));
  }

  if (filters?.expenseAccountId) {
    conditions.push(eq(expenses.expenseAccountId, filters.expenseAccountId));
  }

  if (filters?.paymentAccountId) {
    conditions.push(eq(expenses.paymentAccountId, filters.paymentAccountId));
  }

  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(expenses.expenseNumber, term),
        like(expenses.description, term),
        like(expenses.reference, term)
      )
    );
  }

  const query = db.select({
    id: expenses.id,
    expenseNumber: expenses.expenseNumber,
    expenseDate: expenses.expenseDate,
    description: expenses.description,
    reference: expenses.reference,
    amount: expenses.amount,
    notes: expenses.notes,
    status: expenses.status,
    postedJournalId: expenses.postedJournalId,
    reversalJournalId: expenses.reversalJournalId,
    voidedAt: expenses.voidedAt,
    voidedBy: expenses.voidedBy,
    voidReason: expenses.voidReason,
    createdBy: expenses.createdBy,
    createdAt: expenses.createdAt,
    updatedAt: expenses.updatedAt,
    expenseAccountId: expenses.expenseAccountId,
    paymentAccountId: expenses.paymentAccountId,
  })
  .from(expenses)
  .where(conditions.length > 0 ? and(...conditions) : undefined)
  .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));

  const list = await query;

  if (list.length === 0) return [];

  // Fetch accounts lookup
  const allAccounts = await db.select().from(accounts);
  const accountMap = new Map(allAccounts.map(a => [a.id, a]));

  // Fetch users lookup
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map(u => [u.uid, u]));

  return list.map(e => ({
    ...e,
    expenseAccount: accountMap.get(e.expenseAccountId) || null,
    paymentAccount: accountMap.get(e.paymentAccountId) || null,
    creator: userMap.get(e.createdBy) || null,
    voider: e.voidedBy ? userMap.get(e.voidedBy) || null : null,
  }));
}

/**
 * Fetches single expense full detail with journals, lines, and audit history
 */
export async function getExpenseDetail(id: string) {
  const expenseList = await db.select().from(expenses).where(eq(expenses.id, id));
  if (expenseList.length === 0) {
    throw new Error("Expense record not found.");
  }
  const expense = expenseList[0];

  // Fetch accounts
  const accList = await db.select().from(accounts).where(
    inArray(accounts.id, [expense.expenseAccountId, expense.paymentAccountId])
  );
  const accountMap = new Map(accList.map(a => [a.id, a]));

  // Fetch posted journal and lines
  let postedJournal: any = null;
  if (expense.postedJournalId) {
    const jList = await db.select().from(journalEntries).where(eq(journalEntries.id, expense.postedJournalId));
    if (jList.length > 0) {
      const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, expense.postedJournalId));
      postedJournal = {
        ...jList[0],
        lines: lines.map(l => ({
          ...l,
          account: accountMap.get(l.accountId) || null,
        }))
      };
    }
  }

  // Fetch reversal journal and lines
  let reversalJournal: any = null;
  if (expense.reversalJournalId) {
    const rList = await db.select().from(journalEntries).where(eq(journalEntries.id, expense.reversalJournalId));
    if (rList.length > 0) {
      const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, expense.reversalJournalId));
      reversalJournal = {
        ...rList[0],
        lines: lines.map(l => ({
          ...l,
          account: accountMap.get(l.accountId) || null,
        }))
      };
    }
  }

  // Fetch users
  const userUids = [expense.createdBy];
  if (expense.voidedBy) userUids.push(expense.voidedBy);
  const userList = await db.select().from(users).where(inArray(users.uid, userUids));
  const userMap = new Map(userList.map(u => [u.uid, u]));

  // Fetch audit logs
  const logs = await db.select().from(auditLogs)
    .where(and(eq(auditLogs.tableName, 'expenses'), eq(auditLogs.recordId, id)))
    .orderBy(desc(auditLogs.timestamp));

  return {
    ...expense,
    expenseAccount: accountMap.get(expense.expenseAccountId) || null,
    paymentAccount: accountMap.get(expense.paymentAccountId) || null,
    creator: userMap.get(expense.createdBy) || null,
    voider: expense.voidedBy ? userMap.get(expense.voidedBy) || null : null,
    postedJournal,
    reversalJournal,
    auditLogs: logs,
  };
}

/**
 * Calculates summary metrics for the Expense module
 */
export async function getExpenseMetrics() {
  const allExpenses = await db.select({
    id: expenses.id,
    amount: expenses.amount,
    status: expenses.status,
    expenseAccountId: expenses.expenseAccountId,
  }).from(expenses);

  let totalPostedCents = 0;
  let draftCount = 0;
  let postedCount = 0;
  let voidedCount = 0;

  const categoryTotals = new Map<string, number>();

  for (const exp of allExpenses) {
    if (exp.status === 'Posted') {
      totalPostedCents += exp.amount;
      postedCount++;
      categoryTotals.set(exp.expenseAccountId, (categoryTotals.get(exp.expenseAccountId) || 0) + exp.amount);
    } else if (exp.status === 'Draft') {
      draftCount++;
    } else if (exp.status === 'Voided') {
      voidedCount++;
    }
  }

  // Fetch account names for categories
  const categoryBreakdown: Array<{
    accountId: string;
    accountName: string;
    accountCode: string;
    totalCents: number;
  }> = [];

  if (categoryTotals.size > 0) {
    const accIds = Array.from(categoryTotals.keys());
    const accList = await db.select().from(accounts).where(inArray(accounts.id, accIds));
    for (const acc of accList) {
      categoryBreakdown.push({
        accountId: acc.id,
        accountName: acc.name,
        accountCode: acc.code,
        totalCents: categoryTotals.get(acc.id) || 0,
      });
    }
    // Sort descending by total amount
    categoryBreakdown.sort((a, b) => b.totalCents - a.totalCents);
  }

  return {
    totalPostedCents,
    draftCount,
    postedCount,
    voidedCount,
    categoryBreakdown,
  };
}
