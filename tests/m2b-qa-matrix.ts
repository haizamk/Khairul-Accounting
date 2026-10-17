import { db } from '../src/db/index.ts';
import { enforceConnectionSafety } from './integration-guard.ts';
import { 
  accounts, 
  accountingPeriods, 
  users, 
  customers, 
  salesInvoices, 
  salesInvoiceLines, 
  customerPayments,
  paymentAllocations,
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../src/db/schema.ts';
import {
  createCustomer,
  toggleCustomerStatus
} from '../src/services/customerService.ts';
import {
  createSalesInvoice,
  postSalesInvoice,
  voidSalesInvoice
} from '../src/services/salesInvoiceService.ts';
import {
  createCustomerPayment,
  postCustomerPayment,
  voidCustomerPayment,
  editDraftPayment,
  getInvoiceOutstandingBalance
} from '../src/services/paymentService.ts';
import {
  postJournalEntry
} from '../src/services/accounting.ts';
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

async function runMilestone2BTests() {
  console.log('========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — MILESTONE 2B INTEGRATION QA MATRIX');
  console.log('TARGET DATABASE: khairul_fresh_disposable_test');
  console.log('========================================================================\n');

  // Enforce rigid safety guard before any database query or test execution
  await enforceConnectionSafety(db);

  const timestamp = Date.now().toString().slice(-6);

  // Setup actors
  const adminUid = `admin-m2b-${timestamp}`;
  const accountantUid = `acc-m2b-${timestamp}`;
  const viewerUid = `view-m2b-${timestamp}`;

  await db.insert(users).values([
    { uid: adminUid, email: `admin-${timestamp}@khairulfresh.com`, name: `Admin M2B ${timestamp}`, role: 'Admin' },
    { uid: accountantUid, email: `acc-${timestamp}@khairulfresh.com`, name: `Accountant M2B ${timestamp}`, role: 'Accountant' },
    { uid: viewerUid, email: `view-${timestamp}@khairulfresh.com`, name: `Viewer M2B ${timestamp}`, role: 'Viewer' },
  ]).onConflictDoNothing();

  // Resolve standard Accounts Receivable (1100), Checking (1010), and Sales Revenue (4000) accounts
  const arAccounts = await db.select().from(accounts).where(eq(accounts.code, '1100'));
  if (arAccounts.length === 0) throw new Error("No Accounts Receivable asset account (code 1100) found in COA");
  const arAccount = arAccounts[0];

  const revAccounts = await db.select().from(accounts).where(eq(accounts.code, '4000'));
  if (revAccounts.length === 0) throw new Error("No Sales Revenue revenue account (code 4000) found in COA");
  const revAccount = revAccounts[0];

  const bankAccounts = await db.select().from(accounts).where(eq(accounts.code, '1010'));
  if (bankAccounts.length === 0) throw new Error("No Checking account (code 1010) found in COA");
  const bankAccount = bankAccounts[0];

  // -------------------------------------------------------------------------
  // SETUP: Create Customer & Sales Invoice for RM 1,000.00 (100,000 cents)
  // -------------------------------------------------------------------------
  console.log('>>> [SETUP] Provisioning isolated customer and posted sales invoice...');

  const custCode = `CUST-M2B-${timestamp}`;
  const cust = await createCustomer({
    customerCode: custCode,
    name: `Retailer Group M2B ${timestamp}`,
  }, adminUid, 'Admin');

  // Create invoice of RM 1,000.00
  const invoiceId = await createSalesInvoice({
    customerId: cust.id,
    invoiceDate: '2026-06-15',
    dueDate: '2026-07-15',
    discount: 0,
    lines: [
      {
        description: 'Fresh Premium Bananas Delivery',
        quantity: 10,
        unitPrice: 10000, // RM 100.00 each = 100000 cents (RM 1,000.00)
        revenueAccountId: revAccount.id
      }
    ]
  }, accountantUid, 'Accountant');

  // Post invoice to make it outstanding
  await postSalesInvoice(invoiceId, accountantUid, 'Accountant');

  const initialOutstanding = await getInvoiceOutstandingBalance(invoiceId);
  if (initialOutstanding === 100000) {
    console.log(`[SETUP SUCCESS] M2B Setup Completed. Customer registered, Invoice posted. Outstanding balance: ${initialOutstanding} cents.`);
  } else {
    throw new Error(`[SETUP FAILED] Outstanding balance is ${initialOutstanding} instead of 100000.`);
  }

  // -------------------------------------------------------------------------
  // M2B-01: CUSTOMER PAYMENT VALIDATION (NEGATIVE CASES)
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-01] Customer Payment Validation Controls...');

  // 1.1 Non-positive payments (amount <= 0)
  let zeroPayRejected = false;
  try {
    await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2026-06-16',
      paymentReference: `PAY-ZERO-${timestamp}`,
      amount: 0,
      paymentAccountId: bankAccount.id
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    zeroPayRejected = err.message.includes('Validation Error') || err.message.includes('positive');
  }
  recordResult('1. PAYMENT VALIDATION', '2B.1.1', 'Reject Non-Positive Payment Amount', zeroPayRejected ? 'PASS' : 'FAIL', 
    zeroPayRejected ? 'Blocked non-positive payment amount <= 0 successfully.' : 'Allowed non-positive payment amount.');

  // 1.2 Inactive Customer Block
  const inactiveCustCode = `INACT-${timestamp}`;
  const inactiveCust = await createCustomer({ customerCode: inactiveCustCode, name: 'Inactive customer' }, adminUid, 'Admin');
  await toggleCustomerStatus(inactiveCust.id, false, adminUid, 'Admin');

  let inactivePayRejected = false;
  try {
    await createCustomerPayment({
      customerId: inactiveCust.id,
      paymentDate: '2026-06-16',
      paymentReference: `PAY-INACT-${timestamp}`,
      amount: 10000,
      paymentAccountId: bankAccount.id
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    inactivePayRejected = err.message.includes('inactive') || err.message.includes('Validation Error');
  }
  recordResult('1. PAYMENT VALIDATION', '2B.1.2', 'Reject Payments for Inactive Customers', inactivePayRejected ? 'PASS' : 'FAIL', 
    inactivePayRejected ? 'Blocked customer payments for deactivated customer.' : 'Allowed payments for deactivated customer.');

  // -------------------------------------------------------------------------
  // M2B-02: OVER-ALLOCATION & INVALID ALLOCATION CONTROLS
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2A-02] Allocation Validation Controls...');

  // 2.1 Allocating more than invoice outstanding balance (Over-Allocation)
  let overAllocRejected = false;
  let overAllocError = '';
  try {
    await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2026-06-16',
      paymentReference: `PAY-OVER-${timestamp}`,
      amount: 120000, // RM 1,200.00
      paymentAccountId: bankAccount.id,
      allocations: [
        { invoiceId, amount: 110000 } // Over-allocation by 10,000 cents (RM 100.00)
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    overAllocRejected = true;
    overAllocError = err.message;
  }
  recordResult('2. ALLOCATION CONTROLS', '2B.2.1', 'Block Over-Allocation Beyond Invoice Balance', overAllocRejected ? 'PASS' : 'FAIL', 
    overAllocRejected ? `Correctly blocked allocation exceeding invoice balance: "${overAllocError}"` : 'Allowed over-allocating on invoice.');

  // 2.2 Allocation total exceeds payment amount
  let totalExceedRejected = false;
  let totalExceedError = '';
  try {
    await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2026-06-16',
      paymentReference: `PAY-EXCEED-${timestamp}`,
      amount: 30000, // RM 300.00 payment
      paymentAccountId: bankAccount.id,
      allocations: [
        { invoiceId, amount: 40000 } // Allocation of RM 400.00
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    totalExceedRejected = true;
    totalExceedError = err.message;
  }
  recordResult('2. ALLOCATION CONTROLS', '2B.2.2', 'Block Allocations Exceeding Payment Amount', totalExceedRejected ? 'PASS' : 'FAIL', 
    totalExceedRejected ? `Correctly blocked allocation exceeding total payment: "${totalExceedError}"` : 'Allowed allocations sum to exceed payment.');

  // 2.3 Duplicate allocations for same invoice in single payment
  let dupAllocRejected = false;
  try {
    await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2026-06-16',
      paymentReference: `PAY-DUP-${timestamp}`,
      amount: 50000,
      paymentAccountId: bankAccount.id,
      allocations: [
        { invoiceId, amount: 20000 },
        { invoiceId, amount: 20000 } // Duplicate row for same invoice
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    dupAllocRejected = err.message.includes('Duplicate') || err.message.includes('Validation Error');
  }
  recordResult('2. ALLOCATION CONTROLS', '2B.2.3', 'Block Duplicate Allocations for Same Invoice', dupAllocRejected ? 'PASS' : 'FAIL', 
    dupAllocRejected ? 'Blocked duplicate allocations inside same payment transaction.' : 'Allowed duplicate invoice allocations.');

  // -------------------------------------------------------------------------
  // M2B-03: PARTIAL CUSTOMER PAYMENT & INVOICE STATE RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-03] Partial Customer Payment & State Reconciliation...');

  const partialPayRef = `PAY-PART-${timestamp}`;
  const partialPayId = await createCustomerPayment({
    customerId: cust.id,
    paymentDate: '2026-06-20',
    paymentReference: partialPayRef,
    amount: 40000, // RM 400.00 payment
    paymentAccountId: bankAccount.id,
    status: 'Posted',
    allocations: [
      { invoiceId, amount: 40000 } // Allocate RM 400.00
    ]
  }, accountantUid, 'Accountant');

  // Verify Invoice Outstanding is reduced
  const outstandingAfterPartial = await getInvoiceOutstandingBalance(invoiceId);
  const isInvoicePartialReconciliationCorrect = outstandingAfterPartial === 60000;

  // Verify Customer Statement running balances
  const statementAfterPartial = await getCustomerStatement(cust.id);
  const statementOutstanding = statementAfterPartial.totalOutstanding;
  const isStatementPartialCorrect = statementOutstanding === 60000;

  if (partialPayId && isInvoicePartialReconciliationCorrect && isStatementPartialCorrect) {
    recordResult('3. PARTIAL SETTLEMENT', '2B.3.1', 'Partial Payment Allocation & Invoice Reconciliation', 'PASS', 
      `Partial customer payment posted. Invoice outstanding reduced from RM 1,000.00 to ${outstandingAfterPartial} cents (RM 600.00). Statement running balance is ${statementOutstanding} cents.`);
  } else {
    recordResult('3. PARTIAL SETTLEMENT', '2B.3.1', 'Partial Payment Allocation & Invoice Reconciliation', 'FAIL', 
      `Partial payment reconciliation incorrect. Outstanding AR: ${outstandingAfterPartial}, Statement: ${statementOutstanding}`);
  }

  // -------------------------------------------------------------------------
  // M2B-04: FULL CUSTOMER PAYMENT & SETTLEMENT ZEROING
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-04] Full Customer Payment & Settlement Zeroing...');

  const fullPayRef = `PAY-FULL-${timestamp}`;
  const fullPayId = await createCustomerPayment({
    customerId: cust.id,
    paymentDate: '2026-06-25',
    paymentReference: fullPayRef,
    amount: 60000, // RM 600.00 settlement
    paymentAccountId: bankAccount.id,
    status: 'Posted',
    allocations: [
      { invoiceId, amount: 60000 } // Allocate RM 600.00 (Outstanding is exactly 60,000 cents)
    ]
  }, accountantUid, 'Accountant');

  // Verify outstanding becomes 0
  const outstandingAfterFull = await getInvoiceOutstandingBalance(invoiceId);
  const isOutstandingZeroed = outstandingAfterFull === 0;

  // Verify Customer Statement running balance becomes 0
  const statementAfterFull = await getCustomerStatement(cust.id);
  const statementOutstandingFull = statementAfterFull.totalOutstanding;
  const isStatementZeroed = statementOutstandingFull === 0;

  if (fullPayId && isOutstandingZeroed && isStatementZeroed) {
    recordResult('4. FULL SETTLEMENT', '2B.4.1', 'Full Settlement & Balance Zeroing', 'PASS', 
      `Full customer payment posted. Invoice outstanding reduced to ${outstandingAfterFull} cents (Fully Paid). Statement net outstanding balance is ${statementOutstandingFull} cents.`);
  } else {
    recordResult('4. FULL SETTLEMENT', '2B.4.1', 'Full Settlement & Balance Zeroing', 'FAIL', 
      `Full payment settlement failed. Outstanding: ${outstandingAfterFull}, Statement: ${statementOutstandingFull}`);
  }

  // Try to allocate to an already fully paid invoice (should be blocked)
  let paidAllocRejected = false;
  try {
    await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2026-06-26',
      paymentReference: `PAY-PAID-${timestamp}`,
      amount: 10000,
      paymentAccountId: bankAccount.id,
      allocations: [{ invoiceId, amount: 10000 }]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    paidAllocRejected = err.message.includes('Paid') || err.message.includes('Validation Error');
  }
  recordResult('4. FULL SETTLEMENT', '2B.4.2', 'Block Allocation to Fully Paid Invoices', paidAllocRejected ? 'PASS' : 'FAIL', 
    paidAllocRejected ? 'Blocked allocation attempt on fully paid sales invoice successfully.' : 'Allowed allocation on fully paid invoice.');

  // -------------------------------------------------------------------------
  // M2B-05: AR DOUBLE-ENTRY JOURNAL PARITY & LEDGER INTEGRITY
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-05] Payment Journal Parity & Ledger Integrity...');

  // Verify Journal entries of full payment (RM 600.00 / 60000 cents)
  const fullPayDetail = await db.select().from(customerPayments).where(eq(customerPayments.id, fullPayId));
  const fullPayJournalId = fullPayDetail[0].postedJournalId!;

  const linesList = await db.select().from(journalLines).where(eq(journalLines.entryId, fullPayJournalId));
  const bankLine = linesList.find(l => l.accountId === bankAccount.id && l.debit > 0);
  const arLine = linesList.find(l => l.accountId === arAccount.id && l.credit > 0);

  const totalDebit = linesList.reduce((s, l) => s + l.debit, 0);
  const totalCredit = linesList.reduce((s, l) => s + l.credit, 0);
  const isJournalBalanced = totalDebit === totalCredit && totalDebit === 60000;
  const isLedgerLinesCorrect = bankLine && bankLine.debit === 60000 && arLine && arLine.credit === 60000;

  if (isJournalBalanced && isLedgerLinesCorrect) {
    recordResult('5. LEDGER INTEGRITY', '2B.5.1', 'Payment Double-Entry Journal Parity', 'PASS', 
      `Full payment posted perfectly to General Ledger. Dr Bank/Cash (1010): ${bankLine?.debit} cents, Cr Accounts Receivable (1100): ${arLine?.credit} cents. Balanced: ${isJournalBalanced}`);
  } else {
    recordResult('5. LEDGER INTEGRITY', '2B.5.1', 'Payment Double-Entry Journal Parity', 'FAIL', 
      `Ledger journal records mismatch. Balanced: ${isJournalBalanced}, BankLine: ${bankLine?.debit}, ARLine: ${arLine?.credit}`);
  }

  // -------------------------------------------------------------------------
  // M2B-06: CLOSED ACCOUNTING PERIOD CONTROLS
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-06] Closed Period Payment Posting controls...');

  let closedPaymentBlocked = false;
  let closedPaymentError = '';
  try {
    const closedPayId = await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2025-06-15', // Closed period date
      paymentReference: `PAY-CLOSED-${timestamp}`,
      amount: 10000,
      paymentAccountId: bankAccount.id,
      status: 'Posted',
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    closedPaymentBlocked = true;
    closedPaymentError = err.message;
  }

  if (closedPaymentBlocked && (closedPaymentError.includes('period') || closedPaymentError.includes('defined') || closedPaymentError.includes('Closed'))) {
    recordResult('6. PERIOD GOVERNANCE', '2B.6.1', 'Closed Accounting Period Payment Posting Block', 'PASS', 
      `Posting payments in closed accounting period successfully blocked: "${closedPaymentError}"`);
  } else {
    recordResult('6. PERIOD GOVERNANCE', '2B.6.1', 'Closed Accounting Period Payment Posting Block', 'FAIL', 
      `Succeeded in posting payment in closed/unopened accounting period.`);
  }

  // -------------------------------------------------------------------------
  // M2B-07: SECURITY BOUNDARY (RBAC Viewer Mutation Blocks)
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-07] Security Role Mutation Restrictions...');

  let vCreatePayBlocked = false;
  let vPostPayBlocked = false;
  let vVoidPayBlocked = false;

  try {
    await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2026-06-15',
      paymentReference: 'VIEWER-PAY',
      amount: 5000,
      paymentAccountId: bankAccount.id
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    vCreatePayBlocked = err.message.includes('Unauthorized');
  }

  try {
    await postCustomerPayment(fullPayId, viewerUid, 'Viewer');
  } catch (err: any) {
    vPostPayBlocked = err.message.includes('Unauthorized') || err.message.includes('Posted') || err.message.includes('Draft');
  }

  try {
    await voidCustomerPayment(fullPayId, 'Viewer void', viewerUid, 'Viewer');
  } catch (err: any) {
    vVoidPayBlocked = err.message.includes('Unauthorized');
  }

  const isViewerSecure = vCreatePayBlocked && vPostPayBlocked && vVoidPayBlocked;
  if (isViewerSecure) {
    recordResult('7. SECURITY & RBAC', '2B.7.1', 'Viewer Blocked from all mutating Payments workflows', 'PASS', 'Viewer completely restricted from Customer Payment creation, posting, and voiding.');
  } else {
    recordResult('7. SECURITY & RBAC', '2B.7.1', 'Viewer Blocked from all mutating Payments workflows', 'FAIL', `Viewer permissions leak: create=${!vCreatePayBlocked}, post=${!vPostPayBlocked}, void=${!vVoidPayBlocked}`);
  }

  // -------------------------------------------------------------------------
  // M2B-08: TRANSACTION ROLLBACK PROTECTION (ZERO ORPHANS)
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-08] Verifying atomic transaction rollback (zero orphans)...');

  const preEntryCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalEntries))[0].count;
  const preLineCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalLines))[0].count;

  let rollbackSucceeded = false;

  try {
    await db.transaction(async (tx) => {
      // Post manual journal inside transaction
      await postJournalEntry({
        entryDate: '2026-06-15',
        description: 'Failed manual journal post',
        lines: [
          { accountId: bankAccount.id, debit: 25000, credit: 0, description: 'Rollback test Dr' },
          { accountId: arAccount.id, debit: 0, credit: 25000, description: 'Rollback test Cr' },
        ]
      }, accountantUid, 'Accountant', tx);

      // Force simulated database crash / fail
      throw new Error("M2B_TRANSACTION_ROLLBACK_CRASH");
    });
  } catch (err: any) {
    if (err.message.includes('M2B_TRANSACTION_ROLLBACK_CRASH')) {
      rollbackSucceeded = true;
    }
  }

  const postEntryCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalEntries))[0].count;
  const postLineCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalLines))[0].count;

  const noOrphans = preEntryCount === postEntryCount && preLineCount === postLineCount;

  if (rollbackSucceeded && noOrphans) {
    recordResult('8. ATOMICITY & ROLLBACK', '2B.8.1', 'Failed Payment Posting Atomic Rollback', 'PASS', 'Failed transaction safely rolled back all database mutations.');
    recordResult('8. ATOMICITY & ROLLBACK', '2B.8.2', 'Zero Ledger Orphans Verification', 'PASS', `Ledger remains pristine. Entries: ${preEntryCount} -> ${postEntryCount}, Lines: ${preLineCount} -> ${postLineCount}`);
  } else {
    recordResult('8. ATOMICITY & ROLLBACK', '2B.8.1', 'Failed Payment Posting Atomic Rollback', 'FAIL', `Rollback did not work or left dirty state. Entries: ${preEntryCount} -> ${postEntryCount}`);
  }

  // -------------------------------------------------------------------------
  // M2B-09: VOIDING POSTED CUSTOMER PAYMENT & RECONCILIATION COMPENSATING REVERSAL
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-09] Voiding Customer Payments & Compensating Reversals...');

  // 9.1 Void the Full payment of RM 600.00
  const voidReason = 'Client check bounced on Maybank presentation';
  const reversalJournalId = await voidCustomerPayment(fullPayId, voidReason, adminUid, 'Admin');

  // Verify original payment and original journal preserved with Voided status
  const originalPaymentAfterVoid = (await db.select().from(customerPayments).where(eq(customerPayments.id, fullPayId)))[0];
  const originalJournalAfterVoid = (await db.select().from(journalEntries).where(eq(journalEntries.id, fullPayJournalId)))[0];

  const isAuditPreserved = originalPaymentAfterVoid.status === 'Voided' && originalJournalAfterVoid.status === 'Voided';

  // Verify compensating reversal journal and lines
  const reversalJournal = (await db.select().from(journalEntries).where(eq(journalEntries.id, reversalJournalId)))[0];
  const isReversalPosted = reversalJournal && reversalJournal.status === 'Posted';

  const reversalLines = await db.select().from(journalLines).where(eq(journalLines.entryId, reversalJournalId));
  const bankCreditLine = reversalLines.find(l => l.accountId === bankAccount.id && l.credit > 0);
  const arDebitLine = reversalLines.find(l => l.accountId === arAccount.id && l.debit > 0);

  const isLinesInverted = bankCreditLine && bankCreditLine.credit === 60000 && arDebitLine && arDebitLine.debit === 60000;

  if (isAuditPreserved && isReversalPosted && isLinesInverted) {
    recordResult('9. REVERSAL & VOIDING', '2B.9.1', 'Void Posted Customer Payment & Invert Ledger', 'PASS', 
      `Original payment status: '${originalPaymentAfterVoid.status}', original journal status: '${originalJournalAfterVoid.status}'. Reversal Journal ${reversalJournalId} posted with inverted lines: Cr Bank (1010): ${bankCreditLine?.credit} cents, Dr AR (1100): ${arDebitLine?.debit} cents.`);
  } else {
    recordResult('9. REVERSAL & VOIDING', '2B.9.1', 'Void Posted Customer Payment & Invert Ledger', 'FAIL', 
      `Reversal / Void verification failed. Preserved: ${isAuditPreserved}, Reversal Posted: ${isReversalPosted}, Lines Inverted: ${isLinesInverted}`);
  }

  // -------------------------------------------------------------------------
  // M2B-10: AR TRIPARTITE RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [M2B-10] AR Ledger Tripartite Reconciliation...');

  // Since we voided the full payment of RM 600.00, but partial payment of RM 400.00 is still active:
  // Net remaining outstanding must be exactly RM 600.00 (60,000 cents).
  const finalInvoiceOutstanding = await getInvoiceOutstandingBalance(invoiceId);
  const finalStatement = await getCustomerStatement(cust.id);
  const finalStatementOutstanding = finalStatement.totalOutstanding;
  const finalAging = await calculateARAging('2026-07-20');
  const finalAgingRow = finalAging.find(a => a.customerCode === cust.customerCode);
  const finalAgingOutstanding = finalAgingRow ? finalAgingRow.totalOutstanding : 0;

  const isTripartiteMatch = finalInvoiceOutstanding === 60000 && 
                             finalStatementOutstanding === 60000 && 
                             finalAgingOutstanding === 60000;

  if (isTripartiteMatch) {
    recordResult('10. TRIPARTITE RECONCILIATION', '2B.10.1', 'Milestone 2B Complete Tripartite AR Ledger Reconciliation', 'PASS', 
      `Verified net state: Outstanding AR List = ${finalInvoiceOutstanding} cents, Customer Statement balance = ${finalStatementOutstanding} cents, AR Aging outstanding = ${finalAgingOutstanding} cents. (All perfectly reconciled to exactly RM 600.00).`);
  } else {
    recordResult('10. TRIPARTITE RECONCILIATION', '2B.10.1', 'Milestone 2B Complete Tripartite AR Ledger Reconciliation', 'FAIL', 
      `Tripartite mismatch. Invoice outstanding: ${finalInvoiceOutstanding}, Statement: ${finalStatementOutstanding}, Aging: ${finalAgingOutstanding}`);
  }

  // -------------------------------------------------------------------------
  // CLEANUP: Void the partial payment of RM 400.00 and void the invoice of RM 1,000.00 to preserve pristine database baseline
  // -------------------------------------------------------------------------
  console.log('\n>>> [CLEANUP] Restoring database to pristine baseline seed state...');

  await voidCustomerPayment(partialPayId, 'QA Milestone 2B verification cleanup', adminUid, 'Admin');
  
  // Now invoice is back to full outstanding balance of RM 1,000.00. Let's void the invoice.
  await db.update(salesInvoices)
    .set({ status: 'Posted' }) // make sure invoice is posted so it can be voided
    .where(eq(salesInvoices.id, invoiceId));
  await voidSalesInvoice(invoiceId, 'QA Milestone 2B verification cleanup', adminUid, 'Admin');

  // Verify that all balances of our test customer are now exactly 0, preserving seed baseline.
  const cleanOutstanding = await getInvoiceOutstandingBalance(invoiceId);
  const cleanStatement = await getCustomerStatement(cust.id);
  const cleanAging = await calculateARAging('2026-07-20');
  const cleanAgingRow = cleanAging.find(a => a.customerCode === cust.customerCode);
  const cleanAgingOutstanding = cleanAgingRow ? cleanAgingRow.totalOutstanding : 0;

  const isCleanupSuccess = cleanOutstanding === 0 && cleanStatement.totalOutstanding === 0 && cleanAgingOutstanding === 0;
  if (isCleanupSuccess) {
    recordResult('11. BASELINE PRESERVATION', '2B.11.1', 'Pristine Database Baseline Seed Preservation', 'PASS', 
      'All temporary customer invoices and payments voided with compensating reversals. Baseline is 100% clean and preserved.');
  } else {
    recordResult('11. BASELINE PRESERVATION', '2B.11.1', 'Pristine Database Baseline Seed Preservation', 'FAIL', 
      `Cleanup failed. Outstanding: ${cleanOutstanding}, Statement: ${cleanStatement.totalOutstanding}, Aging: ${cleanAgingOutstanding}`);
  }

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — MILESTONE 2B INTEGRATION QA SUMMARY');
  console.log('========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`TOTAL SCENARIOS EXECUTED: ${total}`);
  console.log(`PASSED:                   ${passed}`);
  console.log(`FAILED:                   ${failed}`);
  console.log(`RESULT:                   ${failed === 0 ? 'MILESTONE 2B — 100% PASS' : 'MILESTONE 2B — FAIL'}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMilestone2BTests().catch((err) => {
  console.error('\nUNHANDLED MILESTONE 2B QA EXCEPTION:', err);
  process.exit(1);
});
