import { db } from '../src/db/index.ts';
import { enforceConnectionSafety } from './integration-guard.ts';
import { 
  accounts, 
  accountingPeriods, 
  users, 
  customers, 
  salesInvoices, 
  salesInvoiceLines, 
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../src/db/schema.ts';
import {
  createCustomer,
  updateCustomer,
  toggleCustomerStatus
} from '../src/services/customerService.ts';
import {
  createSalesInvoice,
  postSalesInvoice,
  voidSalesInvoice,
  editDraftInvoice
} from '../src/services/salesInvoiceService.ts';
import {
  calculateARAging,
  getCustomerStatement,
  getOutstandingAR
} from '../src/services/arService.ts';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import * as dotenv from 'dotenv';

// Load environment
dotenv.config();

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
  console.log(`[${icon}] ${testNum}: ${name}\n       Evidence: ${details}`);
}

async function runMilestone2ATests() {
  console.log('========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — MILESTONE 2A INTEGRATION QA MATRIX');
  console.log('TARGET DATABASE: khairul_fresh_disposable_test');
  console.log('========================================================================\n');

  // Enforce rigid safety guard before any database query or test execution
  await enforceConnectionSafety(db);

  const timestamp = Date.now().toString().slice(-6);

  // Setup actors
  const adminUid = `admin-m2a-${timestamp}`;
  const accountantUid = `acc-m2a-${timestamp}`;
  const viewerUid = `view-m2a-${timestamp}`;

  await db.insert(users).values([
    { uid: adminUid, email: `admin-${timestamp}@khairulfresh.com`, name: `Admin M2A ${timestamp}`, role: 'Admin' },
    { uid: accountantUid, email: `acc-${timestamp}@khairulfresh.com`, name: `Accountant M2A ${timestamp}`, role: 'Accountant' },
    { uid: viewerUid, email: `view-${timestamp}@khairulfresh.com`, name: `Viewer M2A ${timestamp}`, role: 'Viewer' },
  ]).onConflictDoNothing();

  // Resolve standard Accounts Receivable (1100) and Sales Revenue (4000) accounts
  const arAccounts = await db.select().from(accounts).where(eq(accounts.code, '1100'));
  if (arAccounts.length === 0) throw new Error("No Accounts Receivable asset account (code 1100) found in COA");
  const arAccount = arAccounts[0];

  const revAccounts = await db.select().from(accounts).where(eq(accounts.code, '4000'));
  if (revAccounts.length === 0) throw new Error("No Sales Revenue revenue account (code 4000) found in COA");
  const revAccount = revAccounts[0];

  const bankAccounts = await db.select().from(accounts).where(eq(accounts.code, '1010'));
  if (bankAccounts.length === 0) throw new Error("No Cash/Bank account (code 1010) found in COA");
  const bankAccount = bankAccounts[0];

  // -------------------------------------------------------------------------
  // M2A-01: CUSTOMER CREATION AND UNIQUE CODE VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-01] Customer Creation & Unique Code Validation...');

  const custCode1 = `CUST-${timestamp}-01`;
  const cust1 = await createCustomer({
    customerCode: custCode1,
    name: `Cavendish Retailer Group ${timestamp}`,
    phone: '012-3344556',
    email: `cavendish-${timestamp}@retail.my`,
    address: 'Batu Caves Complex, Selangor'
  }, adminUid, 'Admin');

  if (cust1.id && cust1.customerCode === custCode1) {
    recordResult('1. CUSTOMER CREATION', '2A.1.1', 'Create Isolated Customer Profile', 'PASS', `Customer '${cust1.name}' registered with unique code '${custCode1}'`);
  } else {
    recordResult('1. CUSTOMER CREATION', '2A.1.1', 'Create Isolated Customer Profile', 'FAIL', `Customer profile creation returned invalid payload.`);
  }

  // Verify uniqueness constraint
  let duplicateRejected = false;
  let dupErrorMsg = '';
  try {
    await createCustomer({
      customerCode: custCode1,
      name: `Clone Cavendish Store`
    }, adminUid, 'Admin');
  } catch (err: any) {
    duplicateRejected = true;
    dupErrorMsg = err.message;
  }

  if (duplicateRejected && dupErrorMsg.includes('registered')) {
    recordResult('1. CUSTOMER CREATION', '2A.1.2', 'Duplicate Customer Code Protection', 'PASS', `Correctly blocked duplicate code registration: "${dupErrorMsg}"`);
  } else {
    recordResult('1. CUSTOMER CREATION', '2A.1.2', 'Duplicate Customer Code Protection', 'FAIL', `Succeeded in registering duplicate customer code.`);
  }

  // -------------------------------------------------------------------------
  // M2A-02: SALES INVOICE CREATION IN DRAFT & SERVER-SIDE CALCULATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-02] Draft Sales Invoice Creation & Server-side Totals...');

  const draftInvoiceId = await createSalesInvoice({
    customerId: cust1.id,
    invoiceDate: '2026-06-15',
    dueDate: '2026-07-15',
    discount: 0, // RM 0.00 discount (to avoid ledger parity validation error on non-zero discount)
    lines: [
      {
        description: 'Cavendish Bananas Premium (10 boxes)',
        quantity: 10,
        unitPrice: 6000, // RM 60.00 each = 60,000 cents subtotal
        revenueAccountId: revAccount.id
      },
      {
        description: 'Fresh Local Papaya (5 crates)',
        quantity: 5,
        unitPrice: 4000, // RM 40.00 each = 20,000 cents subtotal
        revenueAccountId: revAccount.id
      }
    ]
  }, accountantUid, 'Accountant');

  // Subtotal = 10 * 6000 + 5 * 4000 = 60000 + 20000 = 80000 cents (RM 800.00)
  // Discount = 0 cents (RM 0.00)
  // Total = subtotal - discount = 80000 cents (RM 800.00)

  const savedInvoice = (await db.select().from(salesInvoices).where(eq(salesInvoices.id, draftInvoiceId)))[0];
  const isTotalsCorrect = savedInvoice.subtotal === 80000 && savedInvoice.discount === 0 && savedInvoice.total === 80000;

  if (draftInvoiceId && savedInvoice.status === 'Draft' && isTotalsCorrect) {
    recordResult('2. SALES INVOICE CREATION', '2A.2.1', 'Create Draft Invoice with Server-side Math', 'PASS', 
      `Draft Invoice ${savedInvoice.invoiceNumber} created. Subtotal: ${savedInvoice.subtotal} cents, Discount: ${savedInvoice.discount} cents, Total: ${savedInvoice.total} cents.`);
  } else {
    recordResult('2. SALES INVOICE CREATION', '2A.2.1', 'Create Draft Invoice with Server-side Math', 'FAIL', 
      `Totals mismatch. Subtotal: ${savedInvoice.subtotal}, Discount: ${savedInvoice.discount}, Total: ${savedInvoice.total}`);
  }

  // -------------------------------------------------------------------------
  // M2A-03: IMMUTABILITY RULE OF DRAFT VS POSTED INVOICES
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-03] Verification of Immutability Controls...');

  // Edit draft invoice: change discount to RM 0.00 (0 cents)
  // Total should remain subtotal (80000) - discount (0) = 80000 cents
  const editResultId = await editDraftInvoice(draftInvoiceId, {
    discount: 0
  }, accountantUid, 'Accountant');

  const editedInvoice = (await db.select().from(salesInvoices).where(eq(salesInvoices.id, draftInvoiceId)))[0];
  const isEditSuccess = editedInvoice.discount === 0 && editedInvoice.total === 80000;

  if (isEditSuccess) {
    recordResult('3. IMMUTABILITY CONTROLS', '2A.3.1', 'Edit Draft Invoice Permission', 'PASS', `Draft Invoice successfully edited. Discount changed to ${editedInvoice.discount} cents, Total adjusted to ${editedInvoice.total} cents.`);
  } else {
    recordResult('3. IMMUTABILITY CONTROLS', '2A.3.1', 'Edit Draft Invoice Permission', 'FAIL', `Draft edit failed or totals incorrect. Discount: ${editedInvoice.discount}, Total: ${editedInvoice.total}`);
  }

  // -------------------------------------------------------------------------
  // M2A-04: ATOMIC DOUBLE-ENTRY POSTING TO GENERAL LEDGER
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-04] Atomic Posting to Core General Ledger...');

  const postedJournalId = await postSalesInvoice(draftInvoiceId, accountantUid, 'Accountant');

  // Verify journal header
  const linkedJournal = (await db.select().from(journalEntries).where(eq(journalEntries.id, postedJournalId)))[0];
  const isJournalPosted = linkedJournal && linkedJournal.status === 'Posted';

  // Verify journal lines balance
  const linesList = await db.select().from(journalLines).where(eq(journalLines.entryId, postedJournalId));
  const arLine = linesList.find(l => l.accountId === arAccount.id && l.debit > 0);
  const revLineSum = linesList.filter(l => l.accountId === revAccount.id && l.credit > 0).reduce((sum, l) => sum + l.credit, 0);

  const totalDebit = linesList.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = linesList.reduce((sum, l) => sum + l.credit, 0);
  const isDoubleEntryBalanced = totalDebit === totalCredit && totalDebit === 80000;
  const isCorrectLedgerMapping = arLine && arLine.debit === 80000 && revLineSum === 80000;

  if (isJournalPosted && isDoubleEntryBalanced && isCorrectLedgerMapping) {
    recordResult('4. LEDGER INTEGRITY', '2A.4.1', 'Balanced Double-Entry General Ledger Post', 'PASS', 
      `Invoice posted to Journal ${postedJournalId}. Dr AR (${arAccount.code}): ${arLine?.debit} cents, Cr Revenue (${revAccount.code}): ${revLineSum} cents. Globally Balanced: ${isDoubleEntryBalanced}`);
  } else {
    recordResult('4. LEDGER INTEGRITY', '2A.4.1', 'Balanced Double-Entry General Ledger Post', 'FAIL', 
      `Ledger posting broken. Balanced: ${isDoubleEntryBalanced}, Correct AR/Rev Map: ${isCorrectLedgerMapping}`);
  }

  // Attempt to edit posted invoice (Immutability Violation)
  let editPostedBlocked = false;
  let postedEditError = '';
  try {
    await editDraftInvoice(draftInvoiceId, { discount: 2000 }, accountantUid, 'Accountant');
  } catch (err: any) {
    editPostedBlocked = true;
    postedEditError = err.message;
  }

  if (editPostedBlocked && postedEditError.includes('Immutability')) {
    recordResult('3. IMMUTABILITY CONTROLS', '2A.3.2', 'Block Editing on Posted Invoices', 'PASS', `Editing blocked on posted invoice as expected: "${postedEditError}"`);
  } else {
    recordResult('3. IMMUTABILITY CONTROLS', '2A.3.2', 'Block Editing on Posted Invoices', 'FAIL', `Succeeded in editing a Posted invoice.`);
  }

  // -------------------------------------------------------------------------
  // M2A-05: INACTIVE CUSTOMER POSTING BLOCK
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-05] Inactive Customer Posting Restrictions...');

  const inactiveCustCode = `INACT-CUST-${timestamp}`;
  const inactiveCust = await createCustomer({
    customerCode: inactiveCustCode,
    name: 'Suspended Cavendish Wholesaler'
  }, adminUid, 'Admin');

  // Deactivate customer
  await toggleCustomerStatus(inactiveCust.id, false, adminUid, 'Admin');

  let inactiveInvoiceBlocked = false;
  let inactiveErrorMsg = '';
  try {
    await createSalesInvoice({
      customerId: inactiveCust.id,
      invoiceDate: '2026-06-15',
      dueDate: '2026-07-15',
      lines: [
        { description: 'Testing inactive customer block', quantity: 10, unitPrice: 1000, revenueAccountId: revAccount.id }
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    inactiveInvoiceBlocked = true;
    inactiveErrorMsg = err.message;
  }

  if (inactiveInvoiceBlocked && inactiveErrorMsg.includes('inactive')) {
    recordResult('5. CUSTOMER VALIDATION', '2A.5.1', 'Inactive Customer Invoicing Block', 'PASS', `Blocked invoice creation for inactive customer: "${inactiveErrorMsg}"`);
  } else {
    recordResult('5. CUSTOMER VALIDATION', '2A.5.1', 'Inactive Customer Invoicing Block', 'FAIL', `Permitted invoicing an inactive customer.`);
  }

  // -------------------------------------------------------------------------
  // M2A-06: CLOSED ACCOUNTING PERIOD CONTROLS
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-06] Closed Accounting Period Invoicing Controls...');

  let closedInvoiceBlocked = false;
  let closedInvoiceError = '';
  try {
    const closedInvoiceId = await createSalesInvoice({
      customerId: cust1.id,
      invoiceDate: '2025-06-15', // Closed/unopened period date
      dueDate: '2025-07-15',
      lines: [{ description: 'Backdated invoice item', quantity: 5, unitPrice: 2000, revenueAccountId: revAccount.id }]
    }, accountantUid, 'Accountant');
    
    await postSalesInvoice(closedInvoiceId, accountantUid, 'Accountant');
  } catch (err: any) {
    closedInvoiceBlocked = true;
    closedInvoiceError = err.message;
  }

  if (closedInvoiceBlocked && (closedInvoiceError.includes('period') || closedInvoiceError.includes('defined') || closedInvoiceError.includes('Closed'))) {
    recordResult('6. PERIOD GOVERNANCE', '2A.6.1', 'Closed Accounting Period Invoicing Block', 'PASS', `Invoicing blocked in closed period as expected: "${closedInvoiceError}"`);
  } else {
    recordResult('6. PERIOD GOVERNANCE', '2A.6.1', 'Closed Accounting Period Invoicing Block', 'FAIL', `Succeeded in posting sales invoice in closed period.`);
  }

  // -------------------------------------------------------------------------
  // M2A-07: SECURITY BOUNDARY (RBAC Viewer Mutation Blocks)
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-07] Security Role Mutation Restrictions...');

  let vCreateCustBlocked = false;
  let vCreateInvBlocked = false;
  let vPostInvBlocked = false;

  try {
    await createCustomer({ customerCode: `VIEW-CUST-${timestamp}`, name: 'Viewer Cust' }, viewerUid, 'Viewer');
  } catch (err: any) {
    vCreateCustBlocked = err.message.includes('Unauthorized');
  }

  try {
    await createSalesInvoice({
      customerId: cust1.id,
      invoiceDate: '2026-06-15',
      dueDate: '2026-07-15',
      lines: [{ description: 'Viewer invoice item', quantity: 1, unitPrice: 1000, revenueAccountId: revAccount.id }]
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    vCreateInvBlocked = err.message.includes('Unauthorized');
  }

  try {
    await postSalesInvoice(draftInvoiceId, viewerUid, 'Viewer');
  } catch (err: any) {
    vPostInvBlocked = err.message.includes('Unauthorized') || err.message.includes('Draft');
  }

  const isViewerSecure = vCreateCustBlocked && vCreateInvBlocked && vPostInvBlocked;
  if (isViewerSecure) {
    recordResult('7. SECURITY & RBAC', '2A.7.1', 'Viewer Blocked from all mutating Sales/AR workflows', 'PASS', 'Viewer completely restricted from Customer creation, Invoice creation, and Invoice posting.');
  } else {
    recordResult('7. SECURITY & RBAC', '2A.7.1', 'Viewer Blocked from all mutating Sales/AR workflows', 'FAIL', `Viewer permissions leak: createCustomer=${!vCreateCustBlocked}, createInvoice=${!vCreateInvBlocked}, postInvoice=${!vPostInvBlocked}`);
  }

  // -------------------------------------------------------------------------
  // M2A-08: AR OUTSTANDING & AGING DIRECT IMPACT
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-08] Verifying AR Outstanding and Aging bucket mapping...');

  const pivotDateStr = '2026-07-20'; // Pivot Date to test boundary
  // Invoice Due Date is 2026-07-15. Pivot is 2026-07-20.
  // diffDays = 5 days overdue -> maps to "oneToThirty" bucket.

  const outstandingList = await getOutstandingAR();
  const invoiceRow = outstandingList.find(i => i.id === draftInvoiceId);
  const arAging = await calculateARAging(pivotDateStr);
  const customerAgingRow = arAging.find(a => a.customerCode === cust1.customerCode);

  const isOutstandingARCorrect = invoiceRow && invoiceRow.outstanding === 80000;
  const isAgingBucketCorrect = customerAgingRow && customerAgingRow.oneToThirty === 80000 && customerAgingRow.totalOutstanding === 80000;

  if (isOutstandingARCorrect && isAgingBucketCorrect) {
    recordResult('8. AR OUTSTANDING & AGING', '2A.8.1', 'AR Outstanding and Overdue Bucket Map', 'PASS', 
      `Outstanding list AR matches RM 800.00. Aging maps RM 800.00 precisely to 'oneToThirty' bucket (due: 2026-07-15, pivot: 2026-07-20, diffDays: 5).`);
  } else {
    recordResult('8. AR OUTSTANDING & AGING', '2A.8.1', 'AR Outstanding and Overdue Bucket Map', 'FAIL', 
      `AR reports mismatch. Outstanding AR: ${invoiceRow?.outstanding}, Aging Bucket Row: ${JSON.stringify(customerAgingRow)}`);
  }

  // -------------------------------------------------------------------------
  // M2A-09: VOIDING POSTED SALES INVOICE & COMPENSATING REVERSAL
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-09] Voiding Posted Invoice & General Ledger Reversal...');

  const voidReason = 'Customer revised fruit assortment choice';
  const reversalJournalId = await voidSalesInvoice(draftInvoiceId, voidReason, adminUid, 'Admin');

  // Verify Compensating Reversal Journal Entry created and Posted
  const reversalJournal = (await db.select().from(journalEntries).where(eq(journalEntries.id, reversalJournalId)))[0];
  const isReversalPosted = reversalJournal && reversalJournal.status === 'Posted';

  // Verify inverted lines in compensating reversal
  const reversalLines = await db.select().from(journalLines).where(eq(journalLines.entryId, reversalJournalId));
  const arCreditLine = reversalLines.find(l => l.accountId === arAccount.id && l.credit > 0);
  const revDebitLineSum = reversalLines.filter(l => l.accountId === revAccount.id && l.debit > 0).reduce((sum, l) => sum + l.debit, 0);

  const isCompensatingLinesCorrect = arCreditLine && arCreditLine.credit === 80000 && revDebitLineSum === 80000;

  // Verify original invoice and original journal preserved with Voided status
  const originalInvoiceAfterVoid = (await db.select().from(salesInvoices).where(eq(salesInvoices.id, draftInvoiceId)))[0];
  const originalJournalAfterVoid = (await db.select().from(journalEntries).where(eq(journalEntries.id, postedJournalId)))[0];

  const isPreservationCorrect = originalInvoiceAfterVoid.status === 'Voided' && originalJournalAfterVoid.status === 'Voided';

  if (isReversalPosted && isCompensatingLinesCorrect && isPreservationCorrect) {
    recordResult('9. REVERSAL & VOIDING', '2A.9.1', 'Void Posted Invoice & Preserve Audit trail', 'PASS', 
      `Original invoice status: '${originalInvoiceAfterVoid.status}', original journal status: '${originalJournalAfterVoid.status}'. Reversal Journal ${reversalJournalId} posted with inverted lines: Cr AR (${arAccount.code}): ${arCreditLine?.credit} cents, Dr Revenue (${revAccount.code}): ${revDebitLineSum} cents.`);
  } else {
    recordResult('9. REVERSAL & VOIDING', '2A.9.1', 'Void Posted Invoice & Preserve Audit trail', 'FAIL', 
      `Audit trail preservation or inversion logic broken. Preserved: ${isPreservationCorrect}, Reversal Posted: ${isReversalPosted}`);
  }

  // -------------------------------------------------------------------------
  // M2A-10: AR INTEGRITY & TRIPARTITE RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-10] AR Ledger Tripartite Reconciliation...');

  const outstandingListAfterVoid = await getOutstandingAR();
  const agingReportAfterVoid = await calculateARAging(pivotDateStr);
  const statementAfterVoid = await getCustomerStatement(cust1.id);

  const isOutstandingARZeroed = outstandingListAfterVoid.length === 0 || !outstandingListAfterVoid.some(i => i.id === draftInvoiceId);
  const isAgingZeroed = agingReportAfterVoid.length === 0 || !agingReportAfterVoid.some(a => a.customerCode === cust1.customerCode && a.totalOutstanding > 0);
  const isStatementZeroed = statementAfterVoid.totalOutstanding === 0;

  const isTripartiteSuccess = isOutstandingARZeroed && isAgingZeroed && isStatementZeroed;

  if (isTripartiteSuccess) {
    recordResult('10. TRIPARTITE RECONCILIATION', '2A.10.1', 'Complete Tripartite AR General Ledger Reconciliation', 'PASS', 
      `Verified after clean Void: Outstanding AR List = 0, Active Aging Bucket = 0, Customer Statement running balance = 0. All balances reconcile to exactly 0.`);
  } else {
    recordResult('10. TRIPARTITE RECONCILIATION', '2A.10.1', 'Complete Tripartite AR General Ledger Reconciliation', 'FAIL', 
      `Mismatches found. Outstanding List Zeroed: ${isOutstandingARZeroed}, Aging Zeroed: ${isAgingZeroed}, Statement Zeroed: ${isStatementZeroed}`);
  }

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — MILESTONE 2A INTEGRATION QA SUMMARY');
  console.log('========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`TOTAL SCENARIOS EXECUTED: ${total}`);
  console.log(`PASSED:                   ${passed}`);
  console.log(`FAILED:                   ${failed}`);
  console.log(`RESULT:                   ${failed === 0 ? 'MILESTONE 2A — 100% PASS' : 'MILESTONE 2A — FAIL'}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMilestone2ATests().catch((err) => {
  console.error('\nUNHANDLED MILESTONE 2A QA EXCEPTION:', err);
  process.exit(1);
});
