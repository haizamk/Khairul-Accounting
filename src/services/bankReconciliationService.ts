import { db } from '../db/index.ts';
import { 
  accounts, 
  accountingPeriods, 
  users, 
  journalEntries, 
  journalLines, 
  auditLogs,
  bankImportBatches,
  bankReconciliationSessions,
  bankStatementLines,
  bankReconciliationMatches
} from '../db/schema.ts';
import { eq, and, sql, desc, inArray, lte } from 'drizzle-orm';
import crypto from 'crypto';

export interface CreateSessionParams {
  bankAccountId: string;
  statementStartDate: string;
  statementEndDate: string;
  statementOpeningBalance: number; // in integer cents
  statementEndingBalance: number;  // in integer cents
}

export interface CSVRowInput {
  transactionDate: string;
  description: string;
  reference?: string;
  amount: number; // in integer cents (positive = deposit, negative = withdrawal)
}

// Helper: Assert RBAC role authorization
export function checkReconRole(role: string, allowedRoles: string[] = ['Admin', 'Accountant']) {
  if (!allowedRoles.includes(role)) {
    throw new Error(`Unauthorized: User role '${role}' is not permitted to perform this bank reconciliation action.`);
  }
}

// Helper: Validate Asset Cash/Bank Account
export async function validateBankAccount(bankAccountId: string) {
  const accList = await db.select().from(accounts).where(eq(accounts.id, bankAccountId));
  if (accList.length === 0) {
    throw new Error(`Validation Error: Selected bank account '${bankAccountId}' does not exist.`);
  }
  const acc = accList[0];
  if (!acc.active) {
    throw new Error(`Validation Error: Bank account '${acc.name}' (${acc.code}) is inactive.`);
  }
  if (acc.type !== 'Asset') {
    throw new Error(`Validation Error: Selected account '${acc.name}' (${acc.code}) must be an Asset account. Found: '${acc.type}'.`);
  }
  const eligibleSubTypes = ['Checking', 'CashBox', 'Savings'];
  if (!eligibleSubTypes.includes(acc.subType)) {
    throw new Error(`Validation Error: Account '${acc.name}' (${acc.code}) subtype '${acc.subType}' is not an eligible Bank/Cash account (${eligibleSubTypes.join(', ')}).`);
  }
  return acc;
}

// -----------------------------------------------------------------------------
// 1. SESSION MANAGEMENT
// -----------------------------------------------------------------------------

export async function createBankReconciliationSession(
  params: CreateSessionParams,
  userId: string,
  userRole: string
) {
  checkReconRole(userRole, ['Admin', 'Accountant']);

  const bankAccount = await validateBankAccount(params.bankAccountId);

  // Validate integer bounds
  if (!Number.isInteger(params.statementOpeningBalance) || !Number.isInteger(params.statementEndingBalance)) {
    throw new Error("Validation Error: Opening and Ending balances must be integer cents.");
  }

  // Validate dates
  if (!params.statementStartDate || !params.statementEndDate) {
    throw new Error("Validation Error: Statement start and end dates are required.");
  }
  if (params.statementStartDate > params.statementEndDate) {
    throw new Error("Validation Error: Statement start date cannot be later than end date.");
  }

  // Check no active session exists for this bank account
  const activeSessions = await db.select().from(bankReconciliationSessions).where(
    and(
      eq(bankReconciliationSessions.bankAccountId, params.bankAccountId),
      eq(bankReconciliationSessions.status, 'In_Progress')
    )
  );
  if (activeSessions.length > 0) {
    throw new Error(`Validation Error: Bank account '${bankAccount.name}' already has an active reconciliation session in progress.`);
  }

  // Find accounting period covering statementEndDate
  const periodList = await db.select().from(accountingPeriods).where(
    and(
      lte(accountingPeriods.startDate, params.statementEndDate),
      sql`${accountingPeriods.endDate} >= ${params.statementEndDate}`
    )
  );

  if (periodList.length === 0) {
    throw new Error(`Validation Error: No accounting period defined for the date ${params.statementEndDate}.`);
  }

  const period = periodList[0];
  if (period.status === 'Closed') {
    throw new Error(`Validation Error: The accounting period '${period.name}' covering ${params.statementEndDate} is Closed. Reconciliation is blocked.`);
  }

  // Create session
  const newSessionList = await db.insert(bankReconciliationSessions).values({
    bankAccountId: params.bankAccountId,
    periodId: period.id,
    statementStartDate: params.statementStartDate,
    statementEndDate: params.statementEndDate,
    statementOpeningBalance: params.statementOpeningBalance,
    statementEndingBalance: params.statementEndingBalance,
    status: 'In_Progress',
    createdBy: userId,
  }).returning();

  const session = newSessionList[0];

  // Audit log
  await db.insert(auditLogs).values({
    userId,
    action: 'BANK_RECON_CREATE_SESSION',
    tableName: 'bank_reconciliation_sessions',
    recordId: session.id,
    newValues: { session },
  });

  return session;
}

export async function getBankReconciliationSessions(bankAccountId?: string) {
  if (bankAccountId) {
    return await db.select().from(bankReconciliationSessions)
      .where(eq(bankReconciliationSessions.bankAccountId, bankAccountId))
      .orderBy(desc(bankReconciliationSessions.createdAt));
  }
  return await db.select().from(bankReconciliationSessions)
    .orderBy(desc(bankReconciliationSessions.createdAt));
}

// -----------------------------------------------------------------------------
// 2. CSV IMPORT & STATEMENT LINES
// -----------------------------------------------------------------------------

export async function importBankStatementCSV(
  sessionId: string,
  fileName: string,
  fileContent: string,
  rows: CSVRowInput[],
  userId: string,
  userRole: string
) {
  checkReconRole(userRole, ['Admin', 'Accountant']);

  const sessionList = await db.select().from(bankReconciliationSessions).where(eq(bankReconciliationSessions.id, sessionId));
  if (sessionList.length === 0) {
    throw new Error(`Validation Error: Reconciliation session '${sessionId}' not found.`);
  }
  const session = sessionList[0];
  if (session.status !== 'In_Progress') {
    throw new Error(`Validation Error: Session is '${session.status}'. Imports allowed only in 'In_Progress' sessions.`);
  }

  // Compute file hash
  const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');

  // Check file hash uniqueness
  const existingBatches = await db.select().from(bankImportBatches).where(eq(bankImportBatches.fileHash, fileHash));
  if (existingBatches.length > 0) {
    throw new Error(`Duplicate Import Error: This CSV file (${fileName}) has already been imported in Batch #${existingBatches[0].id}.`);
  }

  // Validate rows
  if (!rows || rows.length === 0) {
    throw new Error("Validation Error: CSV file contains no valid statement transaction rows.");
  }

  const validatedRows: any[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    if (!row.transactionDate) {
      errors.push(`Row ${rowNum}: Transaction date is required.`);
      continue;
    }
    if (!row.description || row.description.trim() === '') {
      errors.push(`Row ${rowNum}: Description is required.`);
      continue;
    }
    if (row.amount === undefined || row.amount === null || !Number.isInteger(row.amount) || row.amount === 0) {
      errors.push(`Row ${rowNum}: Amount must be a non-zero integer in cents.`);
      continue;
    }

    // Line fingerprint
    const fingerprint = crypto.createHash('sha256')
      .update(`${session.bankAccountId}_${row.transactionDate}_${row.amount}_${row.reference || ''}_${row.description}`)
      .digest('hex');

    validatedRows.push({
      sessionId: session.id,
      rowNumber: rowNum,
      transactionDate: row.transactionDate,
      description: row.description.trim(),
      reference: row.reference?.trim() || null,
      amount: row.amount,
      lineFingerprint: fingerprint,
      isFullyMatched: false,
    });
  }

  if (errors.length > 0 && validatedRows.length === 0) {
    throw new Error(`Import Failed: All rows invalid:\n${errors.join('\n')}`);
  }

  // Cross-Batch Fingerprint Deduplication Check:
  // Fetch existing statement line fingerprints for this bank account to detect overlapping duplicate line imports
  const existingLines = await db.select({
    lineFingerprint: bankStatementLines.lineFingerprint
  })
  .from(bankStatementLines)
  .innerJoin(bankReconciliationSessions, eq(bankStatementLines.sessionId, bankReconciliationSessions.id))
  .where(eq(bankReconciliationSessions.bankAccountId, session.bankAccountId));

  const existingCounts = new Map<string, number>();
  for (const el of existingLines) {
    existingCounts.set(el.lineFingerprint, (existingCounts.get(el.lineFingerprint) || 0) + 1);
  }

  const incomingSeenCounts = new Map<string, number>();
  const filteredRows: any[] = [];
  const duplicateSkippedRows: string[] = [];

  for (const vRow of validatedRows) {
    const fp = vRow.lineFingerprint;
    const existCount = existingCounts.get(fp) || 0;
    const seenCount = incomingSeenCounts.get(fp) || 0;

    if (seenCount < existCount) {
      // Overlapping duplicate line already imported in a previous batch!
      incomingSeenCounts.set(fp, seenCount + 1);
      duplicateSkippedRows.push(`Row ${vRow.rowNumber}: Skipped duplicate statement line already imported in a previous batch (${vRow.description}, RM ${(Math.abs(vRow.amount)/100).toFixed(2)}).`);
    } else {
      incomingSeenCounts.set(fp, seenCount + 1);
      filteredRows.push(vRow);
    }
  }

  if (filteredRows.length === 0 && duplicateSkippedRows.length > 0) {
    throw new Error(`Duplicate Import Error: All statement lines in file (${fileName}) were already imported in previous batches.`);
  }

  // Create Batch
  const batchList = await db.insert(bankImportBatches).values({
    bankAccountId: session.bankAccountId,
    fileName,
    fileHash,
    totalRows: rows.length,
    importedRows: filteredRows.length,
    uploadedBy: userId,
  }).returning();
  const batch = batchList[0];

  // Insert lines linked to batch
  const insertedLines = [];
  for (const vRow of filteredRows) {
    const lineRes = await db.insert(bankStatementLines).values({
      ...vRow,
      batchId: batch.id,
    }).returning();
    insertedLines.push(lineRes[0]);
  }

  // Audit log
  await db.insert(auditLogs).values({
    userId,
    action: 'BANK_STATEMENT_IMPORT',
    tableName: 'bank_import_batches',
    recordId: batch.id,
    newValues: { batchId: batch.id, fileName, totalRows: rows.length, importedRows: insertedLines.length, skippedDuplicates: duplicateSkippedRows.length },
  });

  return { batch, insertedLines, errors, duplicateSkippedRows };
}

// -----------------------------------------------------------------------------
// 3. RECONCILIATION SUMMARY & MATHEMATICS
// -----------------------------------------------------------------------------

export async function calculateReconciliationSummary(sessionId: string, txClient?: any) {
  const client = txClient || db;
  const sessionList = await client.select().from(bankReconciliationSessions).where(eq(bankReconciliationSessions.id, sessionId));
  if (sessionList.length === 0) {
    throw new Error(`Validation Error: Session '${sessionId}' not found.`);
  }
  const session = sessionList[0];

  // 1. Statement lines in session
  const stmtLines = await client.select().from(bankStatementLines).where(eq(bankStatementLines.sessionId, session.id));

  let totalStatementDeposits = 0;
  let totalStatementWithdrawals = 0;
  let netStatementActivity = 0;

  for (const line of stmtLines) {
    netStatementActivity += line.amount;
    if (line.amount > 0) {
      totalStatementDeposits += line.amount;
    } else {
      totalStatementWithdrawals += Math.abs(line.amount);
    }
  }

  const calculatedStatementEnding = session.statementOpeningBalance + netStatementActivity;
  const statementArithmeticValid = (calculatedStatementEnding === session.statementEndingBalance);

  // 2. Fetch matches in this session
  const matches = await client.select().from(bankReconciliationMatches).where(eq(bankReconciliationMatches.sessionId, session.id));

  // Map matched amounts per statement line and journal line
  const stmtAllocMap = new Map<string, number>();
  const glAllocMap = new Map<string, number>();

  for (const m of matches) {
    stmtAllocMap.set(m.statementLineId, (stmtAllocMap.get(m.statementLineId) || 0) + m.allocatedAmount);
    glAllocMap.set(m.journalLineId, (glAllocMap.get(m.journalLineId) || 0) + m.allocatedAmount);
  }

  // Unmatched statement lines in session
  const unmatchedStmtLines = stmtLines.filter((l: any) => {
    const allocated = stmtAllocMap.get(l.id) || 0;
    return allocated < Math.abs(l.amount);
  });

  // 3. GL Book Balance as of statementEndDate
  const glLines = await client.select({
    lineId: journalLines.id,
    entryId: journalLines.entryId,
    debit: journalLines.debit,
    credit: journalLines.credit,
    entryDate: journalEntries.entryDate,
    description: journalEntries.description,
    reference: journalEntries.reference,
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(
    eq(journalLines.accountId, session.bankAccountId),
    lte(journalEntries.entryDate, session.statementEndDate),
    eq(journalEntries.status, 'Posted')
  ));

  let glBookBalance = 0; // Sum of (debit - credit)
  let unmatchedBookDeposits = 0; // Unmatched GL debits
  let unmatchedBookWithdrawals = 0; // Unmatched GL credits

  const eligibleGLLines = [];

  for (const line of glLines) {
    const netCents = line.debit - line.credit; // positive = inflow/debit, negative = outflow/credit
    glBookBalance += netCents;

    const allocated = glAllocMap.get(line.lineId) || 0;
    const absNet = Math.abs(netCents);
    const unallocatedCents = absNet - allocated;

    if (unallocatedCents > 0) {
      if (netCents > 0) {
        unmatchedBookDeposits += unallocatedCents;
      } else {
        unmatchedBookWithdrawals += unallocatedCents;
      }
    }

    eligibleGLLines.push({
      ...line,
      netCents,
      allocatedCents: allocated,
      unallocatedCents,
      isFullyMatched: unallocatedCents === 0,
    });
  }

  // 4. Reconciled Balances
  // Reconciled Bank Balance = Statement Ending + Deposits in Transit - Outstanding Checks
  const reconciledBankBalance = session.statementEndingBalance + unmatchedBookDeposits - unmatchedBookWithdrawals;
  const reconciledBookBalance = glBookBalance;
  const difference = reconciledBankBalance - reconciledBookBalance;

  const canComplete = statementArithmeticValid && (difference === 0) && (unmatchedStmtLines.length === 0);

  return {
    session,
    statementOpeningBalance: session.statementOpeningBalance,
    statementEndingBalance: session.statementEndingBalance,
    calculatedStatementEnding,
    statementArithmeticValid,
    totalStatementDeposits,
    totalStatementWithdrawals,
    netStatementActivity,
    glBookBalance,
    unmatchedBookDeposits,
    unmatchedBookWithdrawals,
    reconciledBankBalance,
    reconciledBookBalance,
    difference,
    unmatchedStmtCount: unmatchedStmtLines.length,
    canComplete,
    stmtLines,
    eligibleGLLines,
    matches,
  };
}

// -----------------------------------------------------------------------------
// 4. MATCHING ENGINE (AUTO & MANUAL)
// -----------------------------------------------------------------------------

export async function createManualMatch(
  sessionId: string,
  statementLineId: string,
  journalLineId: string,
  amountCents: number,
  userId: string,
  userRole: string,
  txClient?: any
) {
  checkReconRole(userRole, ['Admin', 'Accountant']);

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("Validation Error: Match allocated amount must be a positive integer in cents.");
  }

  const execute = async (tx: any) => {
    // 1. Acquire row-level locks on target statement line & GL journal line to prevent race conditions & deadlocks
    // Consistently lock statementLineId first, then journalLineId
    const stmtLock = await tx.select().from(bankStatementLines).where(eq(bankStatementLines.id, statementLineId)).for('update');
    if (stmtLock.length === 0) {
      throw new Error(`Validation Error: Statement line '${statementLineId}' not found.`);
    }

    const glLock = await tx.select().from(journalLines).where(eq(journalLines.id, journalLineId)).for('update');
    if (glLock.length === 0) {
      throw new Error(`Validation Error: GL journal line '${journalLineId}' not found.`);
    }

    // 2. Fetch summary within transaction
    const summary = await calculateReconciliationSummary(sessionId, tx);
    if (summary.session.status !== 'In_Progress') {
      throw new Error(`Validation Error: Session is '${summary.session.status}'. Matching allowed only in 'In_Progress' sessions.`);
    }

    const stmtLine = summary.stmtLines.find((l: any) => l.id === statementLineId);
    if (!stmtLine) {
      throw new Error(`Validation Error: Statement line '${statementLineId}' not found in this session.`);
    }

    const glLine = summary.eligibleGLLines.find((l: any) => l.lineId === journalLineId);
    if (!glLine) {
      throw new Error(`Validation Error: GL journal line '${journalLineId}' not found or not eligible on this bank account.`);
    }

    // Direction Normalization Verification
    // Statement Line: amount > 0 is Deposit, amount < 0 is Withdrawal
    // GL Line: netCents > 0 is Debit (Deposit), netCents < 0 is Credit (Withdrawal)
    const stmtIsDeposit = stmtLine.amount > 0;
    const glIsDeposit = glLine.netCents > 0;

    if (stmtIsDeposit !== glIsDeposit) {
      throw new Error(`Direction Mismatch Error: Cannot match a Bank Deposit (+RM ${(Math.abs(stmtLine.amount)/100).toFixed(2)}) with a GL Withdrawal (-RM ${(Math.abs(glLine.netCents)/100).toFixed(2)}). Directions must align.`);
    }

    // Allocation bounds verification (atomically checked inside row lock)
    const currentStmtAlloc = summary.matches
      .filter((m: any) => m.statementLineId === statementLineId)
      .reduce((sum: number, m: any) => sum + m.allocatedAmount, 0);

    const stmtAbs = Math.abs(stmtLine.amount);
    const remainingStmt = stmtAbs - currentStmtAlloc;

    if (amountCents > remainingStmt) {
      throw new Error(`Over-allocation Error: Allocated amount RM ${(amountCents/100).toFixed(2)} exceeds remaining unallocated statement line amount RM ${(remainingStmt/100).toFixed(2)}.`);
    }

    const currentGLAlloc = summary.matches
      .filter((m: any) => m.journalLineId === journalLineId)
      .reduce((sum: number, m: any) => sum + m.allocatedAmount, 0);

    const glAbs = Math.abs(glLine.netCents);
    const remainingGL = glAbs - currentGLAlloc;

    if (amountCents > remainingGL) {
      throw new Error(`Over-allocation Error: Allocated amount RM ${(amountCents/100).toFixed(2)} exceeds remaining unallocated GL line amount RM ${(remainingGL/100).toFixed(2)}.`);
    }

    // Determine matchType
    let matchType = 'Manual';
    if (amountCents < stmtAbs || amountCents < glAbs) {
      matchType = 'Partial';
    }

    // Create Match
    const matchRes = await tx.insert(bankReconciliationMatches).values({
      sessionId: summary.session.id,
      statementLineId,
      journalLineId,
      allocatedAmount: amountCents,
      matchType,
      matchedBy: userId,
    }).returning();

    // Update isFullyMatched flag if statement line is completely allocated
    const newStmtAlloc = currentStmtAlloc + amountCents;
    if (newStmtAlloc === stmtAbs) {
      await tx.update(bankStatementLines)
        .set({ isFullyMatched: true })
        .where(eq(bankStatementLines.id, statementLineId));
    }

    return matchRes[0];
  };

  if (txClient) {
    return await execute(txClient);
  } else {
    return await db.transaction(async (tx) => {
      return await execute(tx);
    });
  }
}

export async function deleteMatch(matchId: string, userId: string, userRole: string) {
  checkReconRole(userRole, ['Admin', 'Accountant']);

  return await db.transaction(async (tx) => {
    const matchRows = await tx.select().from(bankReconciliationMatches).where(eq(bankReconciliationMatches.id, matchId)).for('update');
    if (matchRows.length === 0) {
      throw new Error(`Validation Error: Match allocation '${matchId}' not found.`);
    }
    const match = matchRows[0];

    const sessionList = await tx.select().from(bankReconciliationSessions).where(eq(bankReconciliationSessions.id, match.sessionId));
    if (sessionList[0].status !== 'In_Progress') {
      throw new Error(`Validation Error: Cannot remove matches in a '${sessionList[0].status}' session.`);
    }

    // Unmark fully matched flag
    await tx.update(bankStatementLines)
      .set({ isFullyMatched: false })
      .where(eq(bankStatementLines.id, match.statementLineId));

    // Delete match
    await tx.delete(bankReconciliationMatches).where(eq(bankReconciliationMatches.id, matchId));

    return true;
  });
}

export async function autoMatchSession(sessionId: string, userId: string, userRole: string) {
  checkReconRole(userRole, ['Admin', 'Accountant']);

  const summary = await calculateReconciliationSummary(sessionId);
  if (summary.session.status !== 'In_Progress') {
    throw new Error(`Validation Error: Auto-matching allowed only in 'In_Progress' sessions.`);
  }

  const createdMatches = [];

  for (const stmtLine of summary.stmtLines) {
    if (stmtLine.isFullyMatched) continue;

    const stmtAbs = Math.abs(stmtLine.amount);
    const stmtIsDeposit = stmtLine.amount > 0;

    // Find candidate GL lines
    const candidates = summary.eligibleGLLines.filter(gl => {
      const glIsDeposit = gl.netCents > 0;
      if (stmtIsDeposit !== glIsDeposit) return false;
      const glAbs = Math.abs(gl.netCents);
      if (gl.isFullyMatched || gl.unallocatedCents < stmtAbs) return false;

      // Exact amount match
      return glAbs === stmtAbs;
    });

    console.log(`[AutoMatch Debug] stmtLine: ${stmtLine.description} (${stmtLine.amount}), candidates count: ${candidates.length}`);

    if (candidates.length === 1) {
      // Unambiguous 1-to-1 match
      const candidate = candidates[0];
      const match = await createManualMatch(sessionId, stmtLine.id, candidate.lineId, stmtAbs, userId, userRole);
      createdMatches.push(match);
    } else if (candidates.length > 1) {
      // Multiple unallocated candidates match amount. Pick candidate by reference/description match first, or candidates[0]
      const refMatches = candidates.filter(gl => 
        (stmtLine.reference && gl.reference && (gl.reference.includes(stmtLine.reference) || stmtLine.reference.includes(gl.reference))) ||
        (stmtLine.description && gl.description && (gl.description.includes(stmtLine.description) || stmtLine.description.includes(gl.description)))
      );
      const chosenCandidate = refMatches.length > 0 ? refMatches[0] : candidates[0];
      if (chosenCandidate) {
        const match = await createManualMatch(sessionId, stmtLine.id, chosenCandidate.lineId, stmtAbs, userId, userRole);
        createdMatches.push(match);
      }
    }
  }

  return createdMatches;
}

// -----------------------------------------------------------------------------
// 5. SESSION COMPLETION & REOPENING
// -----------------------------------------------------------------------------

export async function completeBankReconciliationSession(
  sessionId: string,
  userId: string,
  userRole: string
) {
  checkReconRole(userRole, ['Admin', 'Accountant']);

  const summary = await calculateReconciliationSummary(sessionId);
  const session = summary.session;

  if (session.status !== 'In_Progress') {
    throw new Error(`Validation Error: Session is already '${session.status}'.`);
  }

  if (!summary.statementArithmeticValid) {
    throw new Error(`Completion Blocked: Statement Opening Balance (RM ${(session.statementOpeningBalance/100).toFixed(2)}) + Net Activity (RM ${(summary.netStatementActivity/100).toFixed(2)}) != Ending Balance (RM ${(session.statementEndingBalance/100).toFixed(2)}).`);
  }

  if (summary.unmatchedStmtCount > 0) {
    throw new Error(`Completion Blocked: Session has ${summary.unmatchedStmtCount} unmatched bank statement line(s). All statement lines must be reconciled.`);
  }

  if (summary.difference !== 0) {
    throw new Error(`Completion Blocked: Reconciled Bank Balance (RM ${(summary.reconciledBankBalance/100).toFixed(2)}) does not match Reconciled Book Balance (RM ${(summary.reconciledBookBalance/100).toFixed(2)}). Discrepancy Difference: RM ${(summary.difference/100).toFixed(2)}.`);
  }

  // Complete session
  const updated = await db.update(bankReconciliationSessions).set({
    status: 'Completed',
    completedAt: new Date(),
    completedBy: userId,
  }).where(eq(bankReconciliationSessions.id, session.id)).returning();

  // Audit log
  await db.insert(auditLogs).values({
    userId,
    action: 'BANK_RECON_COMPLETE_SESSION',
    tableName: 'bank_reconciliation_sessions',
    recordId: session.id,
    newValues: { session: updated[0], summary: {
      reconciledBankBalance: summary.reconciledBankBalance,
      reconciledBookBalance: summary.reconciledBookBalance,
      difference: summary.difference
    }},
  });

  return updated[0];
}

export async function reopenBankReconciliationSession(
  sessionId: string,
  reopenReason: string,
  userId: string,
  userRole: string
) {
  // Admin ONLY
  if (userRole !== 'Admin') {
    throw new Error(`Unauthorized: Only users with the 'Admin' role can reopen a completed bank reconciliation session.`);
  }

  if (!reopenReason || reopenReason.trim() === '') {
    throw new Error("Validation Error: A mandatory reason must be provided when reopening a completed reconciliation session.");
  }

  const sessionList = await db.select().from(bankReconciliationSessions).where(eq(bankReconciliationSessions.id, sessionId));
  if (sessionList.length === 0) {
    throw new Error(`Validation Error: Session '${sessionId}' not found.`);
  }
  const session = sessionList[0];

  if (session.status !== 'Completed') {
    throw new Error(`Validation Error: Session is '${session.status}'. Only 'Completed' sessions can be reopened.`);
  }

  const updated = await db.update(bankReconciliationSessions).set({
    status: 'In_Progress',
    reopenedAt: new Date(),
    reopenedBy: userId,
    reopenReason: reopenReason.trim(),
  }).where(eq(bankReconciliationSessions.id, session.id)).returning();

  // Audit log
  await db.insert(auditLogs).values({
    userId,
    action: 'BANK_RECON_REOPEN_SESSION',
    tableName: 'bank_reconciliation_sessions',
    recordId: session.id,
    newValues: { session: updated[0], reopenReason: reopenReason.trim() },
  });

  return updated[0];
}

// -----------------------------------------------------------------------------
// 6. VOID INTERLOCK CHECK
// -----------------------------------------------------------------------------

export async function checkGLJournalReconciled(postedJournalId: string) {
  if (!postedJournalId) return { reconciled: false };

  // Find journal lines for this entry
  const lines = await db.select({ id: journalLines.id }).from(journalLines).where(eq(journalLines.entryId, postedJournalId));
  if (lines.length === 0) return { reconciled: false };

  const lineIds = lines.map(l => l.id);

  // Check if any line belongs to a completed match session
  const matches = await db.select({
    matchId: bankReconciliationMatches.id,
    sessionId: bankReconciliationMatches.sessionId,
    status: bankReconciliationSessions.status,
  })
  .from(bankReconciliationMatches)
  .innerJoin(bankReconciliationSessions, eq(bankReconciliationMatches.sessionId, bankReconciliationSessions.id))
  .where(and(
    inArray(bankReconciliationMatches.journalLineId, lineIds),
    eq(bankReconciliationSessions.status, 'Completed')
  ));

  if (matches.length > 0) {
    return {
      reconciled: true,
      sessionId: matches[0].sessionId,
    };
  }

  return { reconciled: false };
}
