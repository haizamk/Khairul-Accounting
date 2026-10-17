import { db } from '../src/db/index.ts';
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
  bankReconciliationMatches,
  expenses
} from '../src/db/schema.ts';
import {
  createBankReconciliationSession,
  getBankReconciliationSessions,
  importBankStatementCSV,
  calculateReconciliationSummary,
  createManualMatch,
  deleteMatch,
  autoMatchSession,
  completeBankReconciliationSession,
  reopenBankReconciliationSession,
  checkGLJournalReconciled
} from '../src/services/bankReconciliationService.ts';
import { createExpense, voidExpense } from '../src/services/expenseService.ts';
import { createCustomerPayment, voidCustomerPayment } from '../src/services/paymentService.ts';
import { postJournalEntry } from '../src/services/accounting.ts';
import { eq, and, desc, sql } from 'drizzle-orm';

interface TestResult {
  category: string;
  testNum: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function recordResult(category: string, testNum: string, name: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ category, testNum, name, status, details });
  const icon = status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] ${testNum}: ${name} - ${details}`);
}

async function runMilestone5ATests() {
  console.log('========================================================================');
  console.log('MILESTONE 5A — BANK RECONCILIATION MODULE QA MATRIX');
  console.log('========================================================================\n');

  // 1. Setup actors for RBAC testing
  const adminUid = 'admin-m5a-uid';
  const accountantUid = 'accountant-m5a-uid';
  const viewerUid = 'viewer-m5a-uid';

  await db.insert(users).values([
    { uid: adminUid, email: 'admin5a@khairulfresh.com', name: 'Admin 5A QA', role: 'Admin' },
    { uid: accountantUid, email: 'acc5a@khairulfresh.com', name: 'Accountant 5A QA', role: 'Accountant' },
    { uid: viewerUid, email: 'viewer5a@khairulfresh.com', name: 'Viewer 5A QA', role: 'Viewer' },
  ]).onConflictDoNothing();

  // 2. Resolve accounts
  // Bank Account: Maybank Operating (1010)
  const bankAccounts = await db.select().from(accounts).where(eq(accounts.code, '1010'));
  if (bankAccounts.length === 0) throw new Error("Maybank account (1010) not found");
  const bankAccount = bankAccounts[0];

  // Expense account: Utilities (5110)
  const utilAccounts = await db.select().from(accounts).where(eq(accounts.code, '5110'));
  if (utilAccounts.length === 0) throw new Error("Utilities account (5110) not found");
  const utilAccount = utilAccounts[0];

  // Revenue account: Sales (4000)
  const salesAccounts = await db.select().from(accounts).where(eq(accounts.code, '4000'));
  if (salesAccounts.length === 0) throw new Error("Sales account (4000) not found");
  const salesAccount = salesAccounts[0];

  // Liability account: AP (2000) for negative test
  const apAccounts = await db.select().from(accounts).where(eq(accounts.code, '2000'));
  const liabilityAccount = apAccounts[0];

  const todayStr = '2026-10-15';

  // Ensure an open period exists covering 2026-10
  const openPeriods = await db.select().from(accountingPeriods).where(eq(accountingPeriods.status, 'Open'));
  if (openPeriods.length === 0) {
    await db.insert(accountingPeriods).values({
      name: 'October 2026 QA',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'Open'
    });
  }

  // Clean up any lingering test sessions for bankAccount from previous aborted test runs
  await db.delete(bankReconciliationMatches).where(sql`session_id IN (SELECT id FROM bank_reconciliation_sessions WHERE bank_account_id = ${bankAccount.id})`);
  await db.delete(bankStatementLines).where(sql`session_id IN (SELECT id FROM bank_reconciliation_sessions WHERE bank_account_id = ${bankAccount.id})`);
  await db.delete(bankImportBatches).where(eq(bankImportBatches.bankAccountId, bankAccount.id));
  await db.delete(bankReconciliationSessions).where(eq(bankReconciliationSessions.bankAccountId, bankAccount.id));

  // Calculate GL Opening Balance for bankAccount as of 2026-10-01
  const pastLines = await db.select({
    debitSum: sql<number>`COALESCE(sum(${journalLines.debit}), 0)::int`,
    creditSum: sql<number>`COALESCE(sum(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(
    eq(journalLines.accountId, bankAccount.id),
    eq(journalEntries.status, 'Posted'),
    sql`${journalEntries.entryDate} < '2026-10-01'`
  ));
  const openBalCents = 0;
  const endingBalCents = 50000; // Net activity of CSV rows (+80000 deposit - 30000 withdrawal = +50000)

  // -------------------------------------------------------------------------
  // SECTION 1: SESSION MANAGEMENT & VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- 1. SESSION MANAGEMENT & VALIDATION ---');

  let session1: any;
  // 1.1: Valid session creation
  try {
    session1 = await createBankReconciliationSession({
      bankAccountId: bankAccount.id,
      statementStartDate: '2026-10-01',
      statementEndDate: '2026-10-15',
      statementOpeningBalance: openBalCents,
      statementEndingBalance: endingBalCents,
    }, accountantUid, 'Accountant');

    if (session1.status === 'In_Progress' && session1.bankAccountId === bankAccount.id) {
      recordResult('Session Management', 'M5A-01', 'Create Reconciliation Session', 'PASS', `Created session ID ${session1.id} for account ${bankAccount.code}`);
    } else {
      recordResult('Session Management', 'M5A-01', 'Create Reconciliation Session', 'FAIL', 'Unexpected session object returned');
    }
  } catch (err: any) {
    recordResult('Session Management', 'M5A-01', 'Create Reconciliation Session', 'FAIL', err.message);
  }

  // 1.2: Prevent concurrent active sessions for same bank account
  try {
    await createBankReconciliationSession({
      bankAccountId: bankAccount.id,
      statementStartDate: '2026-10-01',
      statementEndDate: '2026-10-15',
      statementOpeningBalance: 150000,
      statementEndingBalance: 200000,
    }, accountantUid, 'Accountant');
    recordResult('Session Management', 'M5A-02', 'Prevent Concurrent Active Session', 'FAIL', 'Failed to block duplicate active session');
  } catch (err: any) {
    if (err.message.includes('already has an active reconciliation session')) {
      recordResult('Session Management', 'M5A-02', 'Prevent Concurrent Active Session', 'PASS', `Correctly rejected duplicate active session: ${err.message}`);
    } else {
      recordResult('Session Management', 'M5A-02', 'Prevent Concurrent Active Session', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // 1.3: Reject Non-Asset account for bank reconciliation
  try {
    await createBankReconciliationSession({
      bankAccountId: liabilityAccount.id,
      statementStartDate: '2026-10-01',
      statementEndDate: '2026-10-15',
      statementOpeningBalance: 0,
      statementEndingBalance: 0,
    }, accountantUid, 'Accountant');
    recordResult('Session Management', 'M5A-03', 'Invalid Account Rejection', 'FAIL', 'Allowed Liability account for bank recon');
  } catch (err: any) {
    if (err.message.includes('must be an Asset account')) {
      recordResult('Session Management', 'M5A-03', 'Invalid Account Rejection', 'PASS', `Correctly blocked non-asset account: ${err.message}`);
    } else {
      recordResult('Session Management', 'M5A-03', 'Invalid Account Rejection', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 2: CSV STATEMENT IMPORT & DUPLICATE PREVENTION
  // -------------------------------------------------------------------------
  console.log('\n--- 2. CSV STATEMENT IMPORT & DUPLICATE PREVENTION ---');

  const csvRowsSample = [
    { transactionDate: '2026-10-05', description: 'Customer Payment - Fresh Produce', reference: 'PAY-001', amount: 80000 },  // +RM 800.00 deposit
    { transactionDate: '2026-10-10', description: 'Utilities Expense Bill', reference: 'EXP-001', amount: -30000 },            // -RM 300.00 withdrawal
  ];
  const csvFileName = 'bank_statement_oct_2026.csv';
  const csvContent = 'Date,Description,Reference,Amount\n2026-10-05,Customer Payment - Fresh Produce,PAY-001,800.00\n2026-10-10,Utilities Expense Bill,EXP-001,-300.00';

  let importBatch: any;
  let stmtLines: any[] = [];
  try {
    const importRes = await importBankStatementCSV(
      session1.id,
      csvFileName,
      csvContent,
      csvRowsSample,
      accountantUid,
      'Accountant'
    );
    importBatch = importRes.batch;
    stmtLines = importRes.insertedLines;

    if (stmtLines.length === 2 && importBatch.importedRows === 2) {
      recordResult('CSV Import', 'M5A-04', 'Bank Statement CSV Import', 'PASS', `Imported ${stmtLines.length} statement lines in Batch #${importBatch.id}`);
    } else {
      recordResult('CSV Import', 'M5A-04', 'Bank Statement CSV Import', 'FAIL', 'Row count mismatch during import');
    }
  } catch (err: any) {
    recordResult('CSV Import', 'M5A-04', 'Bank Statement CSV Import', 'FAIL', err.message);
  }

  // 2.2: Duplicate CSV file content import rejection
  try {
    await importBankStatementCSV(
      session1.id,
      csvFileName,
      csvContent, // exact same file content / hash
      csvRowsSample,
      accountantUid,
      'Accountant'
    );
    recordResult('CSV Import', 'M5A-05', 'Duplicate CSV Import Rejection', 'FAIL', 'Allowed duplicate CSV file import');
  } catch (err: any) {
    if (err.message.includes('Duplicate Import Error')) {
      recordResult('CSV Import', 'M5A-05', 'Duplicate CSV Import Rejection', 'PASS', `Correctly blocked duplicate CSV file hash: ${err.message}`);
    } else {
      recordResult('CSV Import', 'M5A-05', 'Duplicate CSV Import Rejection', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 3: MATCHING ENGINE (AUTO, MANUAL, DIRECTION, OVER-ALLOCATION)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. MATCHING ENGINE & RULES ---');

  // Create corresponding Posted GL entries for matching
  // 1. GL Deposit: Dr Bank 80000 / Cr Sales 80000
  const journalDepositId = await postJournalEntry({
    entryDate: '2026-10-05',
    reference: 'PAY-001',
    description: 'Customer Payment - Fresh Produce',
    lines: [
      { accountId: bankAccount.id, debit: 80000, credit: 0, description: 'Customer Payment' },
      { accountId: salesAccount.id, debit: 0, credit: 80000, description: 'Sales Income' },
    ]
  }, accountantUid, 'Accountant');

  // 2. GL Withdrawal: Dr Expense 30000 / Cr Bank 30000
  const journalExpenseId = await postJournalEntry({
    entryDate: '2026-10-10',
    reference: 'EXP-001',
    description: 'Utilities Expense Bill',
    lines: [
      { accountId: utilAccount.id, debit: 30000, credit: 0, description: 'Utilities Expense' },
      { accountId: bankAccount.id, debit: 0, credit: 30000, description: 'Bank Disbursement' },
    ]
  }, accountantUid, 'Accountant');

  // 3.1: Auto-Matching Execution
  let autoMatches: any[] = [];
  try {
    autoMatches = await autoMatchSession(session1.id, accountantUid, 'Accountant');
    if (autoMatches.length === 2) {
      recordResult('Matching Engine', 'M5A-06', 'Auto-Matching 1-to-1 Exact Match', 'PASS', `Auto-matched ${autoMatches.length} statement lines with GL entries`);
    } else {
      recordResult('Matching Engine', 'M5A-06', 'Auto-Matching 1-to-1 Exact Match', 'FAIL', `Expected 2 matches, got ${autoMatches.length}`);
    }
  } catch (err: any) {
    recordResult('Matching Engine', 'M5A-06', 'Auto-Matching 1-to-1 Exact Match', 'FAIL', err.message);
  }

  // 3.2: Remove match and verify statement line flag reset
  try {
    const matchToDelete = autoMatches[0];
    await deleteMatch(matchToDelete.id, accountantUid, 'Accountant');

    const summaryAfterDelete = await calculateReconciliationSummary(session1.id);
    const unflaggedLine = summaryAfterDelete.stmtLines.find((l: any) => l.id === matchToDelete.statementLineId);

    if (unflaggedLine && !unflaggedLine.isFullyMatched) {
      recordResult('Matching Engine', 'M5A-07', 'Delete Match & Restore Flag', 'PASS', `Successfully deleted match #${matchToDelete.id} and unflagged statement line`);
    } else {
      recordResult('Matching Engine', 'M5A-07', 'Delete Match & Restore Flag', 'FAIL', 'isFullyMatched flag was not reset');
    }
  } catch (err: any) {
    recordResult('Matching Engine', 'M5A-07', 'Delete Match & Restore Flag', 'FAIL', err.message);
  }

  // 3.3: Manual Direction Mismatch Guard
  const summaryBeforeManual = await calculateReconciliationSummary(session1.id);
  const depositStmtLine = summaryBeforeManual.stmtLines.find((l: any) => l.amount > 0)!;
  const withdrawalGLLine = summaryBeforeManual.eligibleGLLines.find((l: any) => l.entryId === journalExpenseId)!;
  const depositGLLine = summaryBeforeManual.eligibleGLLines.find((l: any) => l.entryId === journalDepositId)!;

  try {
    await createManualMatch(
      session1.id,
      depositStmtLine.id,
      withdrawalGLLine.lineId,
      80000,
      accountantUid,
      'Accountant'
    );
    recordResult('Matching Engine', 'M5A-08', 'Direction Mismatch Protection', 'FAIL', 'Allowed matching Deposit statement line with Withdrawal GL line');
  } catch (err: any) {
    if (err.message.includes('Direction Mismatch Error')) {
      recordResult('Matching Engine', 'M5A-08', 'Direction Mismatch Protection', 'PASS', `Correctly rejected direction mismatch: ${err.message}`);
    } else {
      recordResult('Matching Engine', 'M5A-08', 'Direction Mismatch Protection', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // 3.4: Over-Allocation Protection
  try {
    await createManualMatch(
      session1.id,
      depositStmtLine.id,
      depositGLLine.lineId,
      90000, // 90000 exceeds 80000 line amount
      accountantUid,
      'Accountant'
    );
    recordResult('Matching Engine', 'M5A-09', 'Over-Allocation Protection', 'FAIL', 'Allowed matching amount greater than line unallocated balance');
  } catch (err: any) {
    if (err.message.includes('Over-allocation Error')) {
      recordResult('Matching Engine', 'M5A-09', 'Over-Allocation Protection', 'PASS', `Correctly blocked over-allocation: ${err.message}`);
    } else {
      recordResult('Matching Engine', 'M5A-09', 'Over-Allocation Protection', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // 3.5: Valid Manual Match
  try {
    const validMatch = await createManualMatch(
      session1.id,
      depositStmtLine.id,
      depositGLLine.lineId,
      80000,
      accountantUid,
      'Accountant'
    );
    if (validMatch && validMatch.allocatedAmount === 80000) {
      recordResult('Matching Engine', 'M5A-10', 'Valid Manual Match Creation', 'PASS', `Manually matched statement line with GL line for RM 800.00`);
    } else {
      recordResult('Matching Engine', 'M5A-10', 'Valid Manual Match Creation', 'FAIL', 'Manual match object unexpected');
    }
  } catch (err: any) {
    recordResult('Matching Engine', 'M5A-10', 'Valid Manual Match Creation', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 4: RECONCILIATION MATHEMATICS & COMPLETION
  // -------------------------------------------------------------------------
  console.log('\n--- 4. RECONCILIATION MATHEMATICS & SESSION COMPLETION ---');

  // 4.1: Verify Summary Mathematics
  const finalSummary = await calculateReconciliationSummary(session1.id);
  console.log(`[Summary Check] Statement Ending: ${finalSummary.statementEndingBalance}, Net Stmt Activity: ${finalSummary.netStatementActivity}, Calculated Stmt Ending: ${finalSummary.calculatedStatementEnding}`);
  console.log(`[Summary Check] GL Book Balance: ${finalSummary.glBookBalance}, Reconciled Bank Balance: ${finalSummary.reconciledBankBalance}, Reconciled Book Balance: ${finalSummary.reconciledBookBalance}, Difference: ${finalSummary.difference}, Can Complete: ${finalSummary.canComplete}`);

  if (finalSummary.statementArithmeticValid && finalSummary.difference === 0 && finalSummary.unmatchedStmtCount === 0) {
    recordResult('Reconciliation Math', 'M5A-11', 'Summary Formulas & Arithmetic Verification', 'PASS', `Reconciled Bank Balance (RM ${(finalSummary.reconciledBankBalance/100).toFixed(2)}) == Reconciled Book Balance (RM ${(finalSummary.reconciledBookBalance/100).toFixed(2)}). Difference = RM 0.00`);
  } else {
    recordResult('Reconciliation Math', 'M5A-11', 'Summary Formulas & Arithmetic Verification', 'FAIL', `Summary arithmetic check failed: Difference = ${finalSummary.difference}, Unmatched = ${finalSummary.unmatchedStmtCount}`);
  }

  // 4.2: Complete Session
  let completedSession: any;
  try {
    completedSession = await completeBankReconciliationSession(session1.id, accountantUid, 'Accountant');
    if (completedSession.status === 'Completed' && completedSession.completedBy === accountantUid) {
      recordResult('Session Completion', 'M5A-12', 'Complete Reconciliation Session', 'PASS', `Session #${session1.id} completed and locked`);
    } else {
      recordResult('Session Completion', 'M5A-12', 'Complete Reconciliation Session', 'FAIL', 'Unexpected session status after completion');
    }
  } catch (err: any) {
    recordResult('Session Completion', 'M5A-12', 'Complete Reconciliation Session', 'FAIL', err.message);
  }

  // 4.3: Non-Admin Reopen Rejection
  try {
    await reopenBankReconciliationSession(session1.id, 'Accountant attempt reopen', accountantUid, 'Accountant');
    recordResult('Session Reopen', 'M5A-13', 'Non-Admin Reopen Restriction', 'FAIL', 'Allowed Accountant to reopen completed session');
  } catch (err: any) {
    if (err.message.includes('Only users with the \'Admin\' role can reopen')) {
      recordResult('Session Reopen', 'M5A-13', 'Non-Admin Reopen Restriction', 'PASS', `Correctly blocked non-admin reopen: ${err.message}`);
    } else {
      recordResult('Session Reopen', 'M5A-13', 'Non-Admin Reopen Restriction', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // 4.4: Admin Reopen Session
  try {
    const reopenedSession = await reopenBankReconciliationSession(session1.id, 'Auditing discrepancy', adminUid, 'Admin');
    if (reopenedSession.status === 'In_Progress' && reopenedSession.reopenedBy === adminUid) {
      recordResult('Session Reopen', 'M5A-14', 'Admin Reopen Session', 'PASS', `Admin reopened session #${session1.id} with reason: ${reopenedSession.reopenReason}`);
    } else {
      recordResult('Session Reopen', 'M5A-14', 'Admin Reopen Session', 'FAIL', 'Session status not set to In_Progress after reopen');
    }
  } catch (err: any) {
    recordResult('Session Reopen', 'M5A-14', 'Admin Reopen Session', 'FAIL', err.message);
  }

  // Re-complete session for Interlock test
  await completeBankReconciliationSession(session1.id, accountantUid, 'Accountant');

  // -------------------------------------------------------------------------
  // SECTION 5: RECONCILED TRANSACTION INTERLOCK CHECK
  // -------------------------------------------------------------------------
  console.log('\n--- 5. RECONCILED TRANSACTION INTERLOCK GUARD ---');

  // 5.1: Create & Post an Expense, then reconcile it in a completed session, then attempt to void it
  try {
    const expToReconcile = await createExpense({
      expenseDate: '2026-10-12',
      description: 'Reconciled Direct Expense Test',
      reference: 'EXP-REC-001',
      expenseAccountId: utilAccount.id,
      paymentAccountId: bankAccount.id,
      amount: 50000, // RM 500.00
      status: 'Posted'
    }, accountantUid, 'Accountant');

    // Create a new session for this expense
    const session2 = await createBankReconciliationSession({
      bankAccountId: bankAccount.id,
      statementStartDate: '2026-10-10',
      statementEndDate: '2026-10-20',
      statementOpeningBalance: 0,
      statementEndingBalance: -50000,
    }, accountantUid, 'Accountant');

    // Import statement line
    const import2 = await importBankStatementCSV(
      session2.id,
      'exp_rec_statement.csv',
      'Date,Desc,Amount\n2026-10-12,Reconciled Expense,-500.00',
      [{ transactionDate: '2026-10-12', description: 'Reconciled Expense', amount: -50000 }],
      accountantUid,
      'Accountant'
    );

    // Explicitly match expToReconcile's journal line
    const expGLLines = await db.select().from(journalLines).where(
      and(eq(journalLines.entryId, expToReconcile.postedJournalId!), eq(journalLines.accountId, bankAccount.id))
    );
    await createManualMatch(session2.id, import2.insertedLines[0].id, expGLLines[0].id, 50000, accountantUid, 'Accountant');

    // Complete session2
    await completeBankReconciliationSession(session2.id, accountantUid, 'Accountant');

    // ATTEMPT TO VOID EXPENSE WHOSE JOURNAL IS RECONCILED IN COMPLETED SESSION 2
    await voidExpense(expToReconcile.id, 'Attempting void on reconciled transaction', accountantUid, 'Accountant');
    recordResult('Transaction Interlock', 'M5A-15', 'Reconciled Void Interlock Protection', 'FAIL', 'Allowed voiding expense belonging to completed bank reconciliation session');
  } catch (err: any) {
    if (err.message.includes('Reconciled Transaction Interlock') || err.message.includes('belongs to Completed Bank Reconciliation Session')) {
      recordResult('Transaction Interlock', 'M5A-15', 'Reconciled Void Interlock Protection', 'PASS', `Correctly blocked voiding of reconciled transaction: ${err.message}`);
    } else {
      recordResult('Transaction Interlock', 'M5A-15', 'Reconciled Void Interlock Protection', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 6: GOVERNANCE & RBAC
  // -------------------------------------------------------------------------
  console.log('\n--- 6. GOVERNANCE & RBAC RESTRICTIONS ---');

  // 6.1: Viewer attempts session creation
  try {
    await createBankReconciliationSession({
      bankAccountId: bankAccount.id,
      statementStartDate: '2026-10-01',
      statementEndDate: '2026-10-15',
      statementOpeningBalance: 0,
      statementEndingBalance: 0,
    }, viewerUid, 'Viewer');
    recordResult('Governance & RBAC', 'M5A-16', 'Viewer Session Creation Restriction', 'FAIL', 'Allowed Viewer role to create reconciliation session');
  } catch (err: any) {
    if (err.message.includes('Unauthorized') || err.message.includes('not permitted')) {
      recordResult('Governance & RBAC', 'M5A-16', 'Viewer Session Creation Restriction', 'PASS', `Correctly blocked Viewer: ${err.message}`);
    } else {
      recordResult('Governance & RBAC', 'M5A-16', 'Viewer Session Creation Restriction', 'FAIL', `Wrong error message: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('MILESTONE 5A QA TEST MATRIX SUMMARY REPORT');
  console.log('========================================================================');

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`TOTAL TESTS ASSESSED: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`PASS RATE: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.error(`❌ QA MATRIX FAILED WITH ${failed} FAILURE(S).`);
    process.exit(1);
  } else {
    console.log('✅ ALL MILESTONE 5A INTEGRATION TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  }
}

runMilestone5ATests().catch(err => {
  console.error("Fatal Test Runner Error:", err);
  process.exit(1);
});
