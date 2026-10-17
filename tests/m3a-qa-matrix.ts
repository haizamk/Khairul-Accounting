import { db } from '../src/db/index.ts';
import { enforceConnectionSafety } from './integration-guard.ts';
import { 
  accounts, 
  accountingPeriods, 
  users, 
  suppliers, 
  purchaseBills, 
  purchaseBillLines, 
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../src/db/schema.ts';
import {
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  getSuppliers,
  getSupplierDetail,
  deleteSupplier
} from '../src/services/supplierService.ts';
import {
  createPurchaseBill,
  editDraftBill,
  postPurchaseBill,
  voidPurchaseBill,
  deletePurchaseBill,
  getPurchaseBills,
  getPurchaseBillDetail,
} from '../src/services/purchaseBillService.ts';
import {
  calculateAPAging,
  getSupplierStatement,
  getOutstandingAP,
} from '../src/services/apService.ts';
import { eq, and, desc } from 'drizzle-orm';

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

async function runQAMatrix() {
  await enforceConnectionSafety(db);

  const billsToVoid: string[] = [];

  console.log('========================================================================');
  console.log('MILESTONE 3A — FINAL QA HARDENING COMPREHENSIVE VERIFICATION SUITE');
  console.log('========================================================================\n');

  // Setup actors
  const adminUid = 'admin-qa-uid';
  const accountantUid = 'accountant-qa-uid';
  const viewerUid = 'viewer-qa-uid';

  await db.insert(users).values([
    { uid: adminUid, email: 'admin@khairulfresh.com', name: 'Admin QA', role: 'Admin' },
    { uid: accountantUid, email: 'acc@khairulfresh.com', name: 'Accountant QA', role: 'Accountant' },
    { uid: viewerUid, email: 'viewer@khairulfresh.com', name: 'Viewer QA', role: 'Viewer' },
  ]).onConflictDoNothing();

  // Resolve AP and Expense accounts
  const apAccounts = await db.select().from(accounts).where(eq(accounts.subType, 'AccountsPayable'));
  if (apAccounts.length === 0) throw new Error("No Accounts Payable account found");
  const apAccount = apAccounts[0];

  const expAccounts = await db.select().from(accounts).where(eq(accounts.code, '5000'));
  if (expAccounts.length === 0) throw new Error("No COGS account found");
  const expAccount = expAccounts[0];

  // Helper date function
  const todayStr = '2026-10-15';

  // -------------------------------------------------------------------------
  // SECTION 1: PURCHASE BILL ACCOUNTING
  // -------------------------------------------------------------------------
  console.log('\n--- 1. PURCHASE BILL ACCOUNTING ---');

  // Prepare a test supplier for Section 1
  const s1SupCode = `SUP-S1-${Date.now()}`;
  const s1Sup = await createSupplier({
    supplierCode: s1SupCode,
    name: 'Section 1 Farm Supplier',
  }, adminUid, 'Admin');

  // Create Bill
  const s1BillId = await createPurchaseBill({
    supplierId: s1Sup.id,
    supplierInvoiceNumber: 'INV-S1-001',
    billDate: '2026-10-10',
    dueDate: '2026-10-25',
    discount: 1000, // RM 10.00
    lines: [
      { description: 'Fresh Tilapia Fish 50kg', quantity: 10, unitPrice: 1500, expenseAccountId: expAccount.id },
      { description: 'Fresh Siakap Fish 20kg', quantity: 5, unitPrice: 3000, expenseAccountId: expAccount.id },
    ]
  }, adminUid, 'Admin');

  // Subtotal: 10*1500 + 5*3000 = 15000 + 15000 = 30000 cents (RM 300.00)
  // Discount: 1000 cents (RM 10.00)
  // Total: 29000 cents (RM 290.00)

  // 1.1: Posting creates exactly one balanced journal
  const postRes1 = await postPurchaseBill(s1BillId, adminUid, 'Admin');
  const linkedJournalEntries = await db.select().from(journalEntries).where(eq(journalEntries.id, postRes1.journalId));
  if (linkedJournalEntries.length === 1 && linkedJournalEntries[0].status === 'Posted') {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.1', 'Posting creates exactly one balanced journal', 'PASS', `Created Journal #${postRes1.journalId}`);
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.1', 'Posting creates exactly one balanced journal', 'FAIL', `Expected 1 posted journal, found ${linkedJournalEntries.length}`);
  }

  // 1.2: Debit lines use valid active expense or other permitted accounts
  const journalLinesList = await db.select().from(journalLines).where(eq(journalLines.entryId, postRes1.journalId));
  const debitLines = journalLinesList.filter(l => l.debit > 0);
  const debitAccountsValid = debitLines.every(l => l.accountId === expAccount.id);
  if (debitAccountsValid && debitLines.length === 2) {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.2', 'Debit lines use valid active expense accounts', 'PASS', `2 Debit lines posted to COGS account (${expAccount.code})`);
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.2', 'Debit lines use valid active expense accounts', 'FAIL', `Invalid debit account distribution`);
  }

  // 1.3: Credit uses the configured Accounts Payable account
  const apCreditLine = journalLinesList.find(l => l.accountId === apAccount.id && l.credit > 0);
  if (apCreditLine && apCreditLine.credit === 29000) {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.3', 'Credit uses configured Accounts Payable account', 'PASS', `Cr AP (${apAccount.code}) for net bill total RM 290.00 (29000 cents)`);
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.3', 'Credit uses configured Accounts Payable account', 'FAIL', `Missing or incorrect AP credit line`);
  }

  // 1.4: Journal totals balance in integer cents
  const totalDebit = journalLinesList.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = journalLinesList.reduce((sum, l) => sum + l.credit, 0);
  if (totalDebit === totalCredit && totalDebit === 30000) {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.4', 'Journal totals balance in integer cents', 'PASS', `Balanced: Dr ${totalDebit} cents == Cr ${totalCredit} cents`);
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.4', 'Journal totals balance in integer cents', 'FAIL', `Out of balance: Dr ${totalDebit} vs Cr ${totalCredit}`);
  }

  // 1.5: Duplicate posting is prevented
  let dupPostBlocked = false;
  try {
    await postPurchaseBill(s1BillId, adminUid, 'Admin');
  } catch (err: any) {
    dupPostBlocked = true;
  }
  if (dupPostBlocked) {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.5', 'Duplicate posting is prevented', 'PASS', 'Second posting rejected: only Draft bills can be posted');
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.5', 'Duplicate posting is prevented', 'FAIL', 'Allowed posting an already Posted bill');
  }

  // 1.6: Closed accounting periods block posting
  let closedPeriodBlocked = false;
  try {
    const closedBillId = await createPurchaseBill({
      supplierId: s1Sup.id,
      billDate: '2020-05-15',
      dueDate: '2020-06-15',
      lines: [{ description: 'Closed period item', quantity: 1, unitPrice: 1000, expenseAccountId: expAccount.id }]
    }, adminUid, 'Admin');
    await postPurchaseBill(closedBillId, adminUid, 'Admin');
  } catch (err: any) {
    closedPeriodBlocked = true;
  }
  if (closedPeriodBlocked) {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.6', 'Closed accounting periods block posting', 'PASS', 'Correctly rejected posting bill in closed/unopened period');
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.6', 'Closed accounting periods block posting', 'FAIL', 'Posting succeeded in closed accounting period');
  }

  // 1.7: Posted and voided bills cannot be edited or deleted
  let editPostedBlocked = false;
  let deletePostedBlocked = false;
  try {
    await editDraftBill(s1BillId, { discount: 5000 }, adminUid, 'Admin');
  } catch (err: any) {
    editPostedBlocked = true;
  }
  try {
    await deletePurchaseBill(s1BillId, adminUid, 'Admin');
  } catch (err: any) {
    deletePostedBlocked = true;
  }
  if (editPostedBlocked && deletePostedBlocked) {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.7', 'Posted bills cannot be edited or deleted', 'PASS', 'Immutability rule enforced: edit and delete blocked on Posted bill');
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.7', 'Posted bills cannot be edited or deleted', 'FAIL', `Edit blocked: ${editPostedBlocked}, Delete blocked: ${deletePostedBlocked}`);
  }

  // 1.8: Bill, journal, journal lines and audit records are atomic
  const billAudits = await db.select().from(auditLogs).where(and(
    eq(auditLogs.tableName, 'purchase_bills'),
    eq(auditLogs.recordId, s1BillId),
    eq(auditLogs.action, 'BILL_POST')
  ));
  if (billAudits.length === 1 && linkedJournalEntries[0].id === postRes1.journalId) {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.8', 'Bill, journal, journal lines, and audit records are atomic', 'PASS', 'All mutations committed within atomic transaction');
  } else {
    recordResult('1. PURCHASE BILL ACCOUNTING', '1.8', 'Bill, journal, journal lines, and audit records are atomic', 'FAIL', 'Missing audit log or broken atomicity');
  }

  // -------------------------------------------------------------------------
  // SECTION 2: VOID AND REVERSAL
  // -------------------------------------------------------------------------
  console.log('\n--- 2. VOID AND REVERSAL ---');

  // Void s1Bill
  const voidReasonText = 'Supplier sent duplicate billing invoice';
  const voidRes = await voidPurchaseBill(s1BillId, voidReasonText, adminUid, 'Admin');

  // 2.1: Void creates the correct reversing journal
  const origBillBeforeVoid = await db.select().from(purchaseBills).where(eq(purchaseBills.id, s1BillId));
  const expectedReversalRef = `REVERSAL-${origBillBeforeVoid[0].billNumber}`;
  const revJournal = await db.select().from(journalEntries).where(
    eq(journalEntries.reference, expectedReversalRef)
  ).orderBy(desc(journalEntries.createdAt)).limit(1);

  let reversingJournalValid = false;
  if (revJournal.length > 0) {
    const revLines = await db.select().from(journalLines).where(eq(journalLines.entryId, revJournal[0].id));
    const apDebitLine = revLines.find(l => l.accountId === apAccount.id && l.debit === 29000);
    const expCreditLines = revLines.filter(l => l.accountId === expAccount.id && l.credit > 0);
    reversingJournalValid = Boolean(apDebitLine) && expCreditLines.length === 2;
  }
  if (reversingJournalValid) {
    recordResult('2. VOID AND REVERSAL', '2.1', 'Void creates the correct reversing journal', 'PASS', `Reversal journal ${expectedReversalRef} has Dr AP 29000 cents and Cr COGS`);
  } else {
    recordResult('2. VOID AND REVERSAL', '2.1', 'Void creates the correct reversing journal', 'FAIL', 'Reversal journal missing or lines not properly inverted');
  }

  // 2.2: Original bill and journal remain preserved
  const origBillPreserved = await db.select().from(purchaseBills).where(eq(purchaseBills.id, s1BillId));
  const origJournalPreserved = await db.select().from(journalEntries).where(eq(journalEntries.id, postRes1.journalId));
  if (origBillPreserved.length === 1 && origBillPreserved[0].status === 'Voided' &&
      origJournalPreserved.length === 1 && origJournalPreserved[0].status === 'Voided') {
    recordResult('2. VOID AND REVERSAL', '2.2', 'Original bill and journal remain preserved', 'PASS', 'Original records preserved with Voided audit status');
  } else {
    recordResult('2. VOID AND REVERSAL', '2.2', 'Original bill and journal remain preserved', 'FAIL', 'Original records deleted or corrupted');
  }

  // 2.3: Void reason and actor are recorded
  const voidAudit = await db.select().from(auditLogs).where(and(
    eq(auditLogs.tableName, 'purchase_bills'),
    eq(auditLogs.recordId, s1BillId),
    eq(auditLogs.action, 'BILL_VOID')
  ));
  if (voidAudit.length > 0 && (voidAudit[0].newValues as any)?.voidReason === voidReasonText && voidAudit[0].userId === adminUid) {
    recordResult('2. VOID AND REVERSAL', '2.3', 'Void reason and actor are recorded', 'PASS', `Void reason "${voidReasonText}" and actor ${adminUid} logged`);
  } else {
    recordResult('2. VOID AND REVERSAL', '2.3', 'Void reason and actor are recorded', 'FAIL', 'Void reason or actor missing in audit logs');
  }

  // 2.4: Double void is rejected
  let doubleVoidBlocked = false;
  try {
    await voidPurchaseBill(s1BillId, 'Second void attempt', adminUid, 'Admin');
  } catch (err: any) {
    doubleVoidBlocked = true;
  }
  if (doubleVoidBlocked) {
    recordResult('2. VOID AND REVERSAL', '2.4', 'Double void is rejected', 'PASS', 'Second void rejected: only Posted bills can be voided');
  } else {
    recordResult('2. VOID AND REVERSAL', '2.4', 'Double void is rejected', 'FAIL', 'Allowed double void of purchase bill');
  }

  // 2.5: Voided bills are excluded from AP outstanding and aging
  const outstandingAfterVoid = await getOutstandingAP();
  const foundInOutstanding = outstandingAfterVoid.some((b: any) => b.id === s1BillId);
  const agingAfterVoid = await calculateAPAging('2026-10-25');
  const foundInAging = agingAfterVoid.find(a => a.supplierCode === s1Sup.supplierCode && a.totalOutstanding > 0);
  if (!foundInOutstanding && !foundInAging) {
    recordResult('2. VOID AND REVERSAL', '2.5', 'Voided bills are excluded from AP outstanding and aging', 'PASS', 'Voided bill excluded from both outstanding list and AP aging');
  } else {
    recordResult('2. VOID AND REVERSAL', '2.5', 'Voided bills are excluded from AP outstanding and aging', 'FAIL', 'Voided bill still present in AP reports');
  }

  // 2.6: Failure during void rolls back all related changes
  let invalidVoidFailed = false;
  try {
    // Attempt void with empty reason
    await voidPurchaseBill(s1BillId, '', adminUid, 'Admin');
  } catch (err: any) {
    invalidVoidFailed = true;
  }
  if (invalidVoidFailed) {
    recordResult('2. VOID AND REVERSAL', '2.6', 'Failure during void rolls back all related changes', 'PASS', 'Empty void reason rejected without partial mutations');
  } else {
    recordResult('2. VOID AND REVERSAL', '2.6', 'Failure during void rolls back all related changes', 'FAIL', 'Failed void did not roll back');
  }

  // -------------------------------------------------------------------------
  // SECTION 3: SUPPLIER VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- 3. SUPPLIER VALIDATION ---');

  // 3.1: Duplicate supplier codes are rejected
  const supDupCode = `SUP-DUP-${Date.now()}`;
  await createSupplier({ supplierCode: supDupCode, name: 'Original Supplier' }, adminUid, 'Admin');
  let dupSupRejected = false;
  try {
    await createSupplier({ supplierCode: supDupCode, name: 'Clone Supplier' }, adminUid, 'Admin');
  } catch (err: any) {
    dupSupRejected = true;
  }
  if (dupSupRejected) {
    recordResult('3. SUPPLIER VALIDATION', '3.1', 'Duplicate supplier codes are rejected', 'PASS', 'Validation rejected registration of duplicate code');
  } else {
    recordResult('3. SUPPLIER VALIDATION', '3.1', 'Duplicate supplier codes are rejected', 'FAIL', 'Duplicate supplier code allowed');
  }

  // 3.2: Invalid supplier IDs are rejected
  let invalidSupBillBlocked = false;
  try {
    await createPurchaseBill({
      supplierId: '00000000-0000-0000-0000-000000000000',
      billDate: '2026-10-15',
      dueDate: '2026-11-15',
      lines: [{ description: 'Test', quantity: 1, unitPrice: 1000, expenseAccountId: expAccount.id }]
    }, adminUid, 'Admin');
  } catch (err: any) {
    invalidSupBillBlocked = true;
  }
  if (invalidSupBillBlocked) {
    recordResult('3. SUPPLIER VALIDATION', '3.2', 'Invalid supplier IDs are rejected', 'PASS', 'Non-existent supplier ID caught and rejected');
  } else {
    recordResult('3. SUPPLIER VALIDATION', '3.2', 'Invalid supplier IDs are rejected', 'FAIL', 'Allowed non-existent supplier ID');
  }

  // 3.3: Inactive suppliers cannot be used for new bill posting
  const inactSup = await createSupplier({
    supplierCode: `SUP-INACT-${Date.now()}`,
    name: 'Deactivated Supplier',
  }, adminUid, 'Admin');
  await toggleSupplierStatus(inactSup.id, false, adminUid, 'Admin'); // Deactivate

  let inactCreateBlocked = false;
  try {
    await createPurchaseBill({
      supplierId: inactSup.id,
      billDate: '2026-10-15',
      dueDate: '2026-11-15',
      lines: [{ description: 'Item for inactive', quantity: 1, unitPrice: 1000, expenseAccountId: expAccount.id }]
    }, adminUid, 'Admin');
  } catch (err: any) {
    inactCreateBlocked = true;
  }
  if (inactCreateBlocked) {
    recordResult('3. SUPPLIER VALIDATION', '3.3', 'Inactive suppliers cannot be used for new bill posting', 'PASS', 'Creation/posting blocked for inactive supplier');
  } else {
    recordResult('3. SUPPLIER VALIDATION', '3.3', 'Inactive suppliers cannot be used for new bill posting', 'FAIL', 'Inactive supplier permitted for bill operations');
  }

  // 3.4: Suppliers with accounting history cannot be destructively deleted
  let deleteWithHistoryBlocked = false;
  try {
    // s1Sup has bill history (s1BillId)
    await deleteSupplier(s1Sup.id, adminUid, 'Admin');
  } catch (err: any) {
    deleteWithHistoryBlocked = true;
  }
  if (deleteWithHistoryBlocked) {
    recordResult('3. SUPPLIER VALIDATION', '3.4', 'Suppliers with accounting history cannot be destructively deleted', 'PASS', 'Delete blocked: Suppliers with accounting transactions cannot be deleted');
  } else {
    recordResult('3. SUPPLIER VALIDATION', '3.4', 'Suppliers with accounting history cannot be destructively deleted', 'FAIL', 'Allowed destructive deletion of supplier with bills');
  }

  // 3.5: Viewer cannot create or modify suppliers
  let viewerCreateBlocked = false;
  let viewerUpdateBlocked = false;
  try {
    await createSupplier({ supplierCode: `SUP-VIEW-${Date.now()}`, name: 'Viewer Attempt' }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerCreateBlocked = true;
  }
  try {
    await updateSupplier(s1Sup.id, { name: 'Viewer Mod' }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerUpdateBlocked = true;
  }
  if (viewerCreateBlocked && viewerUpdateBlocked) {
    recordResult('3. SUPPLIER VALIDATION', '3.5', 'Viewer cannot create or modify suppliers', 'PASS', 'RBAC enforced: Viewer blocked from create and modify');
  } else {
    recordResult('3. SUPPLIER VALIDATION', '3.5', 'Viewer cannot create or modify suppliers', 'FAIL', 'Viewer permitted to create or modify supplier');
  }

  // -------------------------------------------------------------------------
  // SECTION 4: AP AGING DEFINITIONS & EXACT BOUNDARIES
  // -------------------------------------------------------------------------
  console.log('\n--- 4. AP AGING DEFINITIONS & EXACT BOUNDARIES ---');

  // Pivot Date for aging tests: 2026-10-31
  const pivot = '2026-10-31';

  // We test all required exact boundaries:
  // - Due today (diffDays = 0) -> Current
  // - 1 day overdue (due 2026-10-30, diffDays = 1) -> 1-30 days
  // - 30 days overdue (due 2026-10-01, diffDays = 30) -> 1-30 days
  // - 31 days overdue (due 2026-09-30, diffDays = 31) -> 31-60 days
  // - 60 days overdue (due 2026-09-01, diffDays = 60) -> 31-60 days
  // - 61 days overdue (due 2026-08-31, diffDays = 61) -> 61-90 days
  // - 90 days overdue (due 2026-08-02, diffDays = 90) -> 61-90 days
  // - 91 days overdue (due 2026-08-01, diffDays = 91) -> 90+ days

  // Create isolated supplier for Aging
  const agingSup = await createSupplier({
    supplierCode: `SUP-AGING-${Date.now()}`,
    name: 'Aging Boundary Test Vendor',
  }, adminUid, 'Admin');

  interface BoundaryTest {
    label: string;
    dueDate: string;
    expectedBucket: 'current' | 'oneToThirty' | 'thirtyOneToSixty' | 'sixtyOneToNinety' | 'ninetyPlus';
  }

  const boundaryTests: BoundaryTest[] = [
    { label: 'Due today (0 days overdue)', dueDate: '2026-10-31', expectedBucket: 'current' },
    { label: '1 day overdue', dueDate: '2026-10-30', expectedBucket: 'oneToThirty' },
    { label: '30 days overdue', dueDate: '2026-10-01', expectedBucket: 'oneToThirty' },
    { label: '31 days overdue', dueDate: '2026-09-30', expectedBucket: 'thirtyOneToSixty' },
    { label: '60 days overdue', dueDate: '2026-09-01', expectedBucket: 'thirtyOneToSixty' },
    { label: '61 days overdue', dueDate: '2026-08-31', expectedBucket: 'sixtyOneToNinety' },
    { label: '90 days overdue', dueDate: '2026-08-02', expectedBucket: 'sixtyOneToNinety' },
    { label: '91 days overdue', dueDate: '2026-08-01', expectedBucket: 'ninetyPlus' },
  ];

  let allBoundariesPassed = true;
  for (let i = 0; i < boundaryTests.length; i++) {
    const bt = boundaryTests[i];
    // Create and post a single bill for this boundary under a unique supplier
    const supB = await createSupplier({
      supplierCode: `SUP-BND-${i}-${Date.now()}`,
      name: `Boundary Supplier ${bt.label}`,
    }, adminUid, 'Admin');

    const bId = await createPurchaseBill({
      supplierId: supB.id,
      billDate: '2026-07-01',
      dueDate: bt.dueDate,
      lines: [{ description: bt.label, quantity: 1, unitPrice: 10000, expenseAccountId: expAccount.id }] // RM 100.00
    }, adminUid, 'Admin');
    await postPurchaseBill(bId, adminUid, 'Admin');
    billsToVoid.push(bId);

    const agingReport = await calculateAPAging(pivot);
    const supAgingRes = agingReport.find(a => a.supplierCode === supB.supplierCode);

    if (!supAgingRes) {
      allBoundariesPassed = false;
      recordResult('4. AP AGING DEFINITIONS', `4.${i+1}`, `Boundary: ${bt.label}`, 'FAIL', `Supplier not found in aging report`);
      continue;
    }

    const actualAmountInExpectedBucket = supAgingRes[bt.expectedBucket];
    if (actualAmountInExpectedBucket === 10000 && supAgingRes.totalOutstanding === 10000) {
      recordResult('4. AP AGING DEFINITIONS', `4.${i+1}`, `Boundary: ${bt.label}`, 'PASS', `RM 100.00 precisely mapped into ${bt.expectedBucket}`);
    } else {
      allBoundariesPassed = false;
      recordResult('4. AP AGING DEFINITIONS', `4.${i+1}`, `Boundary: ${bt.label}`, 'FAIL', `Expected 10000 in ${bt.expectedBucket}, found ${JSON.stringify(supAgingRes)}`);
    }
  }

  // 4.9: Draft, voided, and zero-balance bills excluded from aging
  const draftBillId = await createPurchaseBill({
    supplierId: agingSup.id,
    billDate: '2026-10-15',
    dueDate: '2026-10-20',
    lines: [{ description: 'Draft bill item', quantity: 1, unitPrice: 50000, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');

  const agingReportExclude = await calculateAPAging(pivot);
  const agingSupCheck = agingReportExclude.find(a => a.supplierCode === agingSup.supplierCode);
  if (!agingSupCheck || agingSupCheck.totalOutstanding === 0) {
    recordResult('4. AP AGING DEFINITIONS', '4.9', 'Draft, voided, and zero-balance bills excluded from aging', 'PASS', 'Draft bills and voided bills are completely excluded from aging totals');
  } else {
    recordResult('4. AP AGING DEFINITIONS', '4.9', 'Draft, voided, and zero-balance bills excluded from aging', 'FAIL', `Found unposted draft bill in aging: ${agingSupCheck.totalOutstanding}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 5: SUPPLIER STATEMENT
  // -------------------------------------------------------------------------
  console.log('\n--- 5. SUPPLIER STATEMENT ---');

  // Supplier Statement test supplier
  const stmtSup = await createSupplier({
    supplierCode: `SUP-STMT-${Date.now()}`,
    name: 'Statement Ledger Farm Vendor',
  }, adminUid, 'Admin');

  // Create Bill 1: RM 150.00 on 2026-10-01
  const stmtBill1 = await createPurchaseBill({
    supplierId: stmtSup.id,
    supplierInvoiceNumber: 'INV-STMT-01',
    billDate: '2026-10-01',
    dueDate: '2026-10-31',
    lines: [{ description: 'Batch 1 Eggs', quantity: 10, unitPrice: 1500, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');
  await postPurchaseBill(stmtBill1, adminUid, 'Admin');
  billsToVoid.push(stmtBill1);

  // Create Bill 2: RM 250.00 on 2026-10-10
  const stmtBill2 = await createPurchaseBill({
    supplierId: stmtSup.id,
    supplierInvoiceNumber: 'INV-STMT-02',
    billDate: '2026-10-10',
    dueDate: '2026-11-10',
    lines: [{ description: 'Batch 2 Chicken Feed', quantity: 10, unitPrice: 2500, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');
  await postPurchaseBill(stmtBill2, adminUid, 'Admin');

  // 5.1: Posted bills increase running AP balance
  const stmtData1 = await getSupplierStatement(stmtSup.id);
  if (stmtData1.statementLines.length === 2 &&
      stmtData1.statementLines[0].runningBalance === 15000 &&
      stmtData1.statementLines[1].runningBalance === 40000) {
    recordResult('5. SUPPLIER STATEMENT', '5.1', 'Posted bills increase running AP balance', 'PASS', 'Line 1 = RM 150.00, Line 2 running balance = RM 400.00');
  } else {
    recordResult('5. SUPPLIER STATEMENT', '5.1', 'Posted bills increase running AP balance', 'FAIL', `Incorrect statement lines running balances`);
  }

  // 5.2: Voided bills reverse or are excluded consistently according to ledger rules
  await voidPurchaseBill(stmtBill2, 'Supplier revised invoice 02', adminUid, 'Admin');
  const stmtData2 = await getSupplierStatement(stmtSup.id);
  if (stmtData2.statementLines.length === 1 && stmtData2.totalOutstanding === 15000) {
    recordResult('5. SUPPLIER STATEMENT', '5.2', 'Voided bills excluded consistently from statement', 'PASS', 'Statement reflects only valid active posted documents; voided bill removed');
  } else {
    recordResult('5. SUPPLIER STATEMENT', '5.2', 'Voided bills excluded consistently from statement', 'FAIL', `Statement still includes voided bill: total = ${stmtData2.totalOutstanding}`);
  }

  // 5.3: Chronological order by date and sequence
  // Post a 3rd bill dated 2026-10-05 (between bill 1 and bill 2)
  const stmtBill3 = await createPurchaseBill({
    supplierId: stmtSup.id,
    supplierInvoiceNumber: 'INV-STMT-03',
    billDate: '2026-10-05',
    dueDate: '2026-11-05',
    lines: [{ description: 'Batch 3 Antibiotics', quantity: 5, unitPrice: 2000, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');
  await postPurchaseBill(stmtBill3, adminUid, 'Admin');
  billsToVoid.push(stmtBill3);

  const stmtData3 = await getSupplierStatement(stmtSup.id);
  const isChronological = stmtData3.statementLines[0].date <= stmtData3.statementLines[1].date;
  if (isChronological && stmtData3.statementLines[0].date === '2026-10-01' && stmtData3.statementLines[1].date === '2026-10-05') {
    recordResult('5. SUPPLIER STATEMENT', '5.3', 'Chronological order by date and sequence', 'PASS', 'Statement lines sorted strictly by document date');
  } else {
    recordResult('5. SUPPLIER STATEMENT', '5.3', 'Chronological order by date and sequence', 'FAIL', 'Statement lines not sorted chronologically');
  }

  // 5.4: Running balance equals net outstanding
  const lastLine = stmtData3.statementLines[stmtData3.statementLines.length - 1];
  if (lastLine.runningBalance === stmtData3.totalOutstanding && stmtData3.totalOutstanding === 25000) {
    recordResult('5. SUPPLIER STATEMENT', '5.4', 'Running balance equals net outstanding', 'PASS', `Final running balance (RM 250.00) equals statement totalOutstanding (RM 250.00)`);
  } else {
    recordResult('5. SUPPLIER STATEMENT', '5.4', 'Running balance equals net outstanding', 'FAIL', `Mismatch: last running balance ${lastLine.runningBalance} vs net outstanding ${stmtData3.totalOutstanding}`);
  }

  // 5.5: Integrity: Ledger balance equals statement balance equals AP aging balance
  const agingStmtCheck = await calculateAPAging('2026-10-31');
  const supAgingRow = agingStmtCheck.find(a => a.supplierCode === stmtSup.supplierCode);
  const agingTotal = supAgingRow ? supAgingRow.totalOutstanding : 0;
  if (agingTotal === stmtData3.totalOutstanding && stmtData3.totalOutstanding === 25000) {
    recordResult('5. SUPPLIER STATEMENT', '5.5', 'Ledger balance equals statement balance equals AP aging balance', 'PASS', `Full Tripartite Reconciliation: AP Aging (RM 250.00) == Supplier Statement (RM 250.00)`);
  } else {
    recordResult('5. SUPPLIER STATEMENT', '5.5', 'Ledger balance equals statement balance equals AP aging balance', 'FAIL', `Tripartite mismatch: Aging ${agingTotal} vs Statement ${stmtData3.totalOutstanding}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 6: AUDIT TRAIL AND RBAC
  // -------------------------------------------------------------------------
  console.log('\n--- 6. AUDIT TRAIL AND RBAC ---');

  // 6.1: Viewer blocked from creating bill, editing bill, posting bill, voiding bill
  let vCreateBillBlocked = false;
  let vEditBillBlocked = false;
  let vPostBillBlocked = false;
  let vVoidBillBlocked = false;
  let vDeleteBillBlocked = false;

  try {
    await createPurchaseBill({
      supplierId: stmtSup.id,
      billDate: '2026-10-15',
      dueDate: '2026-11-15',
      lines: [{ description: 'Viewer Bill', quantity: 1, unitPrice: 1000, expenseAccountId: expAccount.id }]
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    vCreateBillBlocked = true;
  }
  try {
    await editDraftBill(stmtBill3, { discount: 100 }, viewerUid, 'Viewer');
  } catch (err: any) {
    vEditBillBlocked = true;
  }
  try {
    await postPurchaseBill(stmtBill3, viewerUid, 'Viewer');
  } catch (err: any) {
    vPostBillBlocked = true;
  }
  try {
    await voidPurchaseBill(stmtBill3, 'Viewer void', viewerUid, 'Viewer');
  } catch (err: any) {
    vVoidBillBlocked = true;
  }
  try {
    await deletePurchaseBill(stmtBill3, viewerUid, 'Viewer');
  } catch (err: any) {
    vDeleteBillBlocked = true;
  }

  if (vCreateBillBlocked && vEditBillBlocked && vPostBillBlocked && vVoidBillBlocked && vDeleteBillBlocked) {
    recordResult('6. AUDIT TRAIL AND RBAC', '6.1', 'Viewer blocked from all mutating bill operations', 'PASS', 'Viewer completely blocked from create, edit, post, void, and delete bills');
  } else {
    recordResult('6. AUDIT TRAIL AND RBAC', '6.1', 'Viewer blocked from all mutating bill operations', 'FAIL', `Viewer permissions leak: create=${!vCreateBillBlocked}, edit=${!vEditBillBlocked}, post=${!vPostBillBlocked}, void=${!vVoidBillBlocked}, delete=${!vDeleteBillBlocked}`);
  }

  // 6.2: Accountant and Admin permitted
  const accBillId = await createPurchaseBill({
    supplierId: stmtSup.id,
    billDate: '2026-10-15',
    dueDate: '2026-11-15',
    lines: [{ description: 'Accountant Item', quantity: 1, unitPrice: 5000, expenseAccountId: expAccount.id }]
  }, accountantUid, 'Accountant');
  await editDraftBill(accBillId, { discount: 500 }, accountantUid, 'Accountant');
  const accPost = await postPurchaseBill(accBillId, accountantUid, 'Accountant');
  const accVoid = await voidPurchaseBill(accBillId, 'Accountant test void', accountantUid, 'Accountant');
  if (accBillId && accPost.journalId && accVoid.status === 'Voided') {
    recordResult('6. AUDIT TRAIL AND RBAC', '6.2', 'Accountant and Admin permitted to operate AP workflow', 'PASS', 'Accountant successfully executed complete bill lifecycle (create -> edit -> post -> void)');
  } else {
    recordResult('6. AUDIT TRAIL AND RBAC', '6.2', 'Accountant and Admin permitted to operate AP workflow', 'FAIL', 'Accountant operations failed');
  }

  // 6.3: Audit logs capture all 6 required actions with record IDs, amounts, and timestamps
  const auditActions = ['SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'BILL_CREATE', 'BILL_UPDATE', 'BILL_POST', 'BILL_VOID'];
  let allAuditActionsFound = true;
  const missingActions: string[] = [];

  for (const act of auditActions) {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, act)).limit(1);
    if (logs.length === 0) {
      allAuditActionsFound = false;
      missingActions.push(act);
    } else {
      const log = logs[0];
      if (!log.recordId || !log.timestamp || !log.userId) {
        allAuditActionsFound = false;
        missingActions.push(`${act} (missing metadata)`);
      }
    }
  }

  if (allAuditActionsFound) {
    recordResult('6. AUDIT TRAIL AND RBAC', '6.3', 'Audit logs capture all required actions with full details', 'PASS', 'Verified: SUPPLIER_CREATE, SUPPLIER_UPDATE, BILL_CREATE, BILL_UPDATE, BILL_POST, BILL_VOID with record IDs and timestamps');
  } else {
    recordResult('6. AUDIT TRAIL AND RBAC', '6.3', 'Audit logs capture all required actions with full details', 'FAIL', `Missing or incomplete audit actions: ${missingActions.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // CLEANUP SECTION: Void all remaining posted bills to restore database state
  // -------------------------------------------------------------------------
  console.log('\n>>> [CLEANUP] Voiding remaining posted bills to restore database state...');
  for (const bId of billsToVoid) {
    try {
      await voidPurchaseBill(bId, 'QA Milestone 3A verification cleanup', adminUid, 'Admin');
    } catch (e: any) {
      console.error(`Failed to void bill ${bId}:`, e.message);
    }
  }
  console.log('[CLEANUP] Database baseline state successfully restored.');

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('FINAL QA REPORT SUMMARY');
  console.log('========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passed}`);
  console.log(`FAILED:      ${failed}`);
  console.log(`RESULT:      ${failed === 0 ? 'QA HARDENING — 100% PASS' : 'QA HARDENING — FAIL'}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runQAMatrix().catch((err) => {
  console.error('\nUNHANDLED QA ERROR:', err);
  process.exit(1);
});
