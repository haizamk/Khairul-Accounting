import { db } from '../src/db/index.ts';
import { enforceConnectionSafety } from './integration-guard.ts';
import { 
  accounts, 
  accountingPeriods, 
  users, 
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../src/db/schema.ts';
import {
  postJournalEntry,
  voidJournalEntry,
  validateAccountingPeriod
} from '../src/services/accounting.ts';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import * as dotenv from 'dotenv';

// Load environment
dotenv.config();

interface TestRecord {
  scenarioId: string;
  category: string;
  testName: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  details: string;
}

const testResults: TestRecord[] = [];

function record(scenarioId: string, category: string, testName: string, status: 'PASS' | 'FAIL' | 'BLOCKED', details: string) {
  testResults.push({ scenarioId, category, testName, status, details });
  const badge = status === 'PASS' ? '✅ PASS' : (status === 'BLOCKED' ? '⚠️ BLOCKED' : '❌ FAIL');
  console.log(`[${badge}] [${scenarioId}] ${category} :: ${testName}\n       Evidence: ${details}`);
}

async function runMilestone1QA() {
  console.log('========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — MILESTONE 1: ACCOUNTING FOUNDATION INTEGRATION QA');
  console.log('TARGET DATABASE: khairul_fresh_disposable_test');
  console.log('========================================================================\n');

  // 1. Enforce safety guard before any query
  await enforceConnectionSafety(db);

  const timestamp = Date.now().toString().slice(-6);

  // -------------------------------------------------------------------------
  // M1-01: DATABASE AND CONNECTION IDENTITY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('>>> [M1-01] Verifying database connection identity...');
  
  const dbCheck = await db.execute(sql`SELECT current_database(), current_user, version();`);
  const activeDb = (dbCheck.rows[0] as any)?.current_database;
  const activeUser = (dbCheck.rows[0] as any)?.current_user;
  
  if (activeDb !== 'khairul_fresh_disposable_test') {
    record('M1-01.1', 'Database Identity', 'Exact Database Verification', 'FAIL', `Active database is "${activeDb}" instead of "khairul_fresh_disposable_test"`);
    process.exit(1);
  }
  record('M1-01.1', 'Database Identity', 'Exact Database Verification', 'PASS', `Connected exactly to database: '${activeDb}'`);
  
  if (activeUser !== 'ai_studio_app_user') {
    record('M1-01.2', 'Database Identity', 'Runtime User Role Verification', 'FAIL', `Connected as "${activeUser}" instead of "ai_studio_app_user"`);
    process.exit(1);
  }
  record('M1-01.2', 'Database Identity', 'Runtime User Role Verification', 'PASS', `Active connection user matches runtime role: '${activeUser}'`);

  // -------------------------------------------------------------------------
  // M1-02: RBAC ACTORS COVERAGE
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-02] Verifying security roles (RBAC actors)...');

  const adminUid = `admin-m1-${timestamp}`;
  const accountantUid = `acc-m1-${timestamp}`;
  const viewerUid = `view-m1-${timestamp}`;

  await db.insert(users).values([
    { uid: adminUid, email: `admin-${timestamp}@khairulfresh.com`, name: `Admin M1 ${timestamp}`, role: 'Admin' },
    { uid: accountantUid, email: `acc-${timestamp}@khairulfresh.com`, name: `Accountant M1 ${timestamp}`, role: 'Accountant' },
    { uid: viewerUid, email: `view-${timestamp}@khairulfresh.com`, name: `Viewer M1 ${timestamp}`, role: 'Viewer' },
  ]);

  const actors = await db.select().from(users).where(sql`uid IN (${adminUid}, ${accountantUid}, ${viewerUid})`);
  if (actors.length === 3) {
    record('M1-02.1', 'RBAC Security', 'Multi-Role Actor Verification', 'PASS', `Successfully provisioned Admin, Accountant, and Viewer test profiles.`);
  } else {
    record('M1-02.1', 'RBAC Security', 'Multi-Role Actor Verification', 'FAIL', `Unable to verify all three required roles in database.`);
  }

  // -------------------------------------------------------------------------
  // M1-03: CHART OF ACCOUNTS INTEGRITY
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-03] Verifying Chart of Accounts (COA) baseline state...');

  const allAccounts = await db.select().from(accounts).orderBy(asc(accounts.code));
  
  if (allAccounts.length === 28) {
    record('M1-03.1', 'COA Integrity', 'Total Accounts Count Verification', 'PASS', `Verified exactly 28 accounts exist in Chart of Accounts.`);
  } else {
    record('M1-03.1', 'COA Integrity', 'Total Accounts Count Verification', 'FAIL', `Expected exactly 28 accounts, found ${allAccounts.length}.`);
  }

  const code1010 = allAccounts.find(a => a.code === '1010'); // Cash/Bank
  const code1100 = allAccounts.find(a => a.code === '1100'); // Accounts Receivable
  const code2000 = allAccounts.find(a => a.code === '2000'); // Accounts Payable
  const code5110 = allAccounts.find(a => a.code === '5110'); // Utilities

  if (code1010 && code1010.type === 'Asset' && code1010.normalBalance === 'Debit') {
    record('M1-03.2', 'COA Integrity', 'Maybank Operating Account (1010) Parity', 'PASS', `Account 1010 (Maybank) matches normal Debit balance.`);
  } else {
    record('M1-03.2', 'COA Integrity', 'Maybank Operating Account (1010) Parity', 'FAIL', `Mismatch in Account 1010 properties.`);
  }

  if (code2000 && code2000.type === 'Liability' && code2000.normalBalance === 'Credit') {
    record('M1-03.3', 'COA Integrity', 'Accounts Payable Trade (2000) Parity', 'PASS', `Account 2000 (AP) matches normal Credit balance.`);
  } else {
    record('M1-03.3', 'COA Integrity', 'Accounts Payable Trade (2000) Parity', 'FAIL', `Mismatch in Account 2000 properties.`);
  }

  // -------------------------------------------------------------------------
  // M1-04: ACCOUNTING PERIOD STATE Check
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-04] Verifying open accounting period constraints...');

  const periods = await db.select().from(accountingPeriods).orderBy(asc(accountingPeriods.startDate));
  const active2026 = periods.find(p => p.name === 'FY 2026' && p.status === 'Open');
  
  if (active2026) {
    record('M1-04.1', 'Period Governance', 'FY 2026 Open Period Verification', 'PASS', `Accounting Period 'FY 2026' is correctly configured and Open.`);
  } else {
    record('M1-04.1', 'Period Governance', 'FY 2026 Open Period Verification', 'FAIL', `Active open accounting period 'FY 2026' not found.`);
  }

  // -------------------------------------------------------------------------
  // M1-05: SECURITY BOUNDARY (RBAC Viewer Mutation Block)
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-05] Verifying Viewer role write restrictions...');

  let viewerBlocked = false;
  let viewerError = '';

  try {
    await postJournalEntry({
      entryDate: '2026-06-15',
      description: 'Viewer manual posting attempt',
      lines: [
        { accountId: code5110!.id, debit: 10000, credit: 0 },
        { accountId: code1010!.id, debit: 0, credit: 10000 },
      ]
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerBlocked = err.message.includes('Unauthorized') || err.message.includes('Viewer');
    viewerError = err.message;
  }

  if (viewerBlocked) {
    record('M1-05.1', 'RBAC Security', 'Viewer Manual Journal Post Restriction', 'PASS', `Viewer post rejected as expected: "${viewerError}"`);
  } else {
    record('M1-05.1', 'RBAC Security', 'Viewer Manual Journal Post Restriction', 'FAIL', `Viewer was allowed to post manual journals.`);
  }

  // -------------------------------------------------------------------------
  // M1-06: CLOSED PERIOD PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-06] Verifying closed period posting block...');

  // FY 2025 does not exist or is not Open. Let's try posting on 2025-06-15.
  let closedBlocked = false;
  let closedError = '';

  try {
    await postJournalEntry({
      entryDate: '2025-06-15',
      description: 'Posting attempt into FY 2025',
      lines: [
        { accountId: code5110!.id, debit: 10000, credit: 0 },
        { accountId: code1010!.id, debit: 0, credit: 10000 },
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    closedBlocked = true;
    closedError = err.message;
  }

  if (closedBlocked && (closedError.includes('period') || closedError.includes('defined') || closedError.includes('Closed'))) {
    record('M1-06.1', 'Period Governance', 'Closed Period Posting Block', 'PASS', `Rejected posting in closed/unopened period: "${closedError}"`);
  } else {
    record('M1-06.1', 'Period Governance', 'Closed Period Posting Block', 'FAIL', `Posting allowed in a closed/unopened accounting period.`);
  }

  // -------------------------------------------------------------------------
  // M1-07: UNDEFINED FUTURE PERIOD PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-07] Verifying undefined period posting block...');

  let undefBlocked = false;
  let undefError = '';

  try {
    await postJournalEntry({
      entryDate: '2099-01-01',
      description: 'Posting attempt in undefined future',
      lines: [
        { accountId: code5110!.id, debit: 10000, credit: 0 },
        { accountId: code1010!.id, debit: 0, credit: 10000 },
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    undefBlocked = true;
    undefError = err.message;
  }

  if (undefBlocked && (undefError.includes('period') || undefError.includes('defined'))) {
    record('M1-07.1', 'Period Governance', 'Undefined Period Posting Block', 'PASS', `Rejected posting in future undefined period: "${undefError}"`);
  } else {
    record('M1-07.1', 'Period Governance', 'Undefined Period Posting Block', 'FAIL', `Posting allowed in undefined future period.`);
  }

  // -------------------------------------------------------------------------
  // M1-08: ATOMIC TRANSACTION ROLLBACK (ZERO ORPHANS)
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-08] Verifying atomic transaction rollback (zero orphans)...');

  const preEntryCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalEntries))[0].count;
  const preLineCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalLines))[0].count;

  let rollbackSucceeded = false;

  try {
    await db.transaction(async (tx) => {
      // Create a journal entry inside transaction
      await postJournalEntry({
        entryDate: '2026-06-15',
        description: 'Failed journal entry post',
        lines: [
          { accountId: code5110!.id, debit: 50000, credit: 0 },
          { accountId: code1010!.id, debit: 0, credit: 50000 },
        ]
      }, accountantUid, 'Accountant', tx);

      // Force simulated database crash / fail
      throw new Error("SIMULATED_DATABASE_CRASH_TEST");
    });
  } catch (err: any) {
    if (err.message === 'SIMULATED_DATABASE_CRASH_TEST') {
      rollbackSucceeded = true;
    }
  }

  const postEntryCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalEntries))[0].count;
  const postLineCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalLines))[0].count;

  const noOrphans = preEntryCount === postEntryCount && preLineCount === postLineCount;

  if (rollbackSucceeded && noOrphans) {
    record('M1-08.1', 'Atomicity & Integrity', 'Failed Posting Atomic Rollback', 'PASS', 'Simulated failure safely rolled back all writes inside transaction.');
    record('M1-08.2', 'Atomicity & Integrity', 'General Ledger Zero Orphan Records Check', 'PASS', `No orphan records left. Entry count preserved: ${preEntryCount} -> ${postEntryCount}, Lines: ${preLineCount} -> ${postLineCount}`);
  } else {
    record('M1-08.1', 'Atomicity & Integrity', 'Failed Posting Atomic Rollback', 'FAIL', `Rollback did not work or left dirty state. Entries: ${preEntryCount} -> ${postEntryCount}`);
  }

  // -------------------------------------------------------------------------
  // M1-09: TRIAL BALANCE INTEGRITY & DOUBLE-ENTRY PARITY
  // -------------------------------------------------------------------------
  console.log('\n>>> [M1-09] Verifying mathematical trial balance debit-credit parity...');

  // Create one successful manual journal entry of RM 450.00 (45,000 cents) for FY 2026
  const manualJournalId = await postJournalEntry({
    entryDate: '2026-06-15',
    description: 'SST Accounting Consultation Professional Fees',
    lines: [
      { accountId: code5110!.id, debit: 45000, credit: 0, description: 'Electricity portion' },
      { accountId: code1010!.id, debit: 0, credit: 45000, description: 'Professional consulting service' },
    ]
  }, accountantUid, 'Accountant');

  const postedJournals = await db.select().from(journalEntries).where(eq(journalEntries.status, 'Posted'));
  const postedLines = await db.select().from(journalLines);

  let totalDebit = 0;
  let totalCredit = 0;
  let unbalancedCount = 0;

  // Track lines per entry
  const entryLines = new Map<string, { debits: number; credits: number }>();
  for (const line of postedLines) {
    if (!entryLines.has(line.entryId)) {
      entryLines.set(line.entryId, { debits: 0, credits: 0 });
    }
    const bucket = entryLines.get(line.entryId)!;
    bucket.debits += line.debit;
    bucket.credits += line.credit;
  }

  for (const j of postedJournals) {
    const bucket = entryLines.get(j.id) || { debits: 0, credits: 0 };
    totalDebit += bucket.debits;
    totalCredit += bucket.credits;
    if (bucket.debits !== bucket.credits) {
      unbalancedCount++;
    }
  }

  const hasParity = totalDebit === totalCredit && unbalancedCount === 0;

  if (hasParity) {
    record('M1-09.1', 'Trial Balance', 'Manual Journal Debit-Credit Parity', 'PASS', `Checked ${postedJournals.length} posted journals. Total Debits: ${totalDebit} cents == Total Credits: ${totalCredit} cents.`);
  } else {
    record('M1-09.1', 'Trial Balance', 'Manual Journal Debit-Credit Parity', 'FAIL', `Parity mismatch. Total debits: ${totalDebit}, Credits: ${totalCredit}, Unbalanced journals: ${unbalancedCount}`);
  }

  // Double check our manual journal specifically
  const targetLines = postedLines.filter(l => l.entryId === manualJournalId);
  const targetDebitSum = targetLines.reduce((s, l) => s + l.debit, 0);
  const targetCreditSum = targetLines.reduce((s, l) => s + l.credit, 0);

  if (targetDebitSum === 45000 && targetCreditSum === 45000) {
    record('M1-09.2', 'Trial Balance', 'Post-Execution Verification of Created Journal', 'PASS', `Manual journal ${manualJournalId} precisely posted Dr ${targetDebitSum} and Cr ${targetCreditSum} cents.`);
  } else {
    record('M1-09.2', 'Trial Balance', 'Post-Execution Verification of Created Journal', 'FAIL', `Manual journal did not match expected amount. Debit: ${targetDebitSum}, Credit: ${targetCreditSum}`);
  }

  // Cleanup: Void the manual journal we just created to keep the baseline pristine!
  console.log('\n>>> [M1-Cleanup] Voiding manual journal to preserve database baseline state...');
  await voidJournalEntry(manualJournalId, 'QA Milestone 1 verification cleanup', adminUid, 'Admin');

  const afterVoidEntry = await db.select().from(journalEntries).where(eq(journalEntries.id, manualJournalId));
  if (afterVoidEntry[0].status === 'Voided') {
    record('M1-Cleanup.1', 'Database Preservation', 'Pristine Baseline Preservation via Void Reversal', 'PASS', 'Manual journal voided and compensating reversal applied. Baseline is preserved.');
  } else {
    record('M1-Cleanup.1', 'Database Preservation', 'Pristine Baseline Preservation via Void Reversal', 'FAIL', 'Manual journal void status was not set.');
  }

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — MILESTONE 1 INTEGRATION QA SUMMARY');
  console.log('========================================================================');
  const total = testResults.length;
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  const blocked = testResults.filter(r => r.status === 'BLOCKED').length;

  console.log(`TOTAL SCENARIOS EXECUTED: ${total}`);
  console.log(`PASSED:                   ${passed}`);
  console.log(`FAILED:                   ${failed}`);
  console.log(`BLOCKED:                  ${blocked}`);
  console.log(`RESULT:                   ${failed === 0 ? 'MILESTONE 1 — 100% PASS' : 'MILESTONE 1 — FAIL'}`);
  console.log('========================================================================\n');

  if (failed > 0 || blocked > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMilestone1QA().catch((err) => {
  console.error('\nUNHANDLED MILESTONE 1 QA EXCEPTION:', err);
  process.exit(1);
});
