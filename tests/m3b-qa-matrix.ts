import { db } from '../src/db/index.ts';
import { enforceConnectionSafety } from './integration-guard.ts';
import { 
  accounts, 
  accountingPeriods, 
  users, 
  suppliers, 
  purchaseBills, 
  purchaseBillLines, 
  supplierPayments,
  supplierPaymentAllocations,
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../src/db/schema.ts';
import {
  createSupplier,
  toggleSupplierStatus,
} from '../src/services/supplierService.ts';
import {
  createPurchaseBill,
  postPurchaseBill,
  getPurchaseBillDetail,
  voidPurchaseBill,
} from '../src/services/purchaseBillService.ts';
import {
  createSupplierPayment,
  editDraftSupplierPayment,
  postSupplierPayment,
  voidSupplierPayment,
  deleteDraftSupplierPayment,
  getBillOutstandingBalance,
  getBillPaymentStatus,
  getSupplierPayments,
  getSupplierPaymentDetail,
} from '../src/services/supplierPaymentService.ts';
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

async function runMilestone3BTests() {
  await enforceConnectionSafety(db);

  const billsToVoid: string[] = [];
  const paymentsToVoid: string[] = [];

  console.log('========================================================================');
  console.log('MILESTONE 3B — SUPPLIER PAYMENTS + ALLOCATION + AP RECONCILIATION SUITE');
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

  // Resolve AP account (2000) and Cash/Bank accounts (1000, 1010) and Expense account (5000)
  const apAccounts = await db.select().from(accounts).where(eq(accounts.subType, 'AccountsPayable'));
  if (apAccounts.length === 0) throw new Error("No Accounts Payable account found");
  const apAccount = apAccounts[0];

  const cashAccounts = await db.select().from(accounts).where(eq(accounts.code, '1000'));
  if (cashAccounts.length === 0) throw new Error("No Cash account found");
  const cashAccount = cashAccounts[0];

  const bankAccounts = await db.select().from(accounts).where(eq(accounts.code, '1010'));
  const bankAccount = bankAccounts.length > 0 ? bankAccounts[0] : cashAccount;

  const expAccounts = await db.select().from(accounts).where(eq(accounts.code, '5000'));
  if (expAccounts.length === 0) throw new Error("No COGS account found");
  const expAccount = expAccounts[0];

  // Helper date function
  const todayStr = '2026-10-15';

  // -------------------------------------------------------------------------
  // SECTION 1: SUPPLIER PAYMENT DRAFT CREATION & VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- 1. SUPPLIER PAYMENT DRAFT & VALIDATION ---');

  const sup1 = await createSupplier({
    supplierCode: `SUP-PAY-1-${Date.now()}`,
    name: 'Perladangan Sayur Cameron Highlands',
  }, adminUid, 'Admin');

  // 1.1: Create draft payment
  const draftPay1 = await createSupplierPayment({
    supplierId: sup1.id,
    paymentDate: todayStr,
    amount: 50000, // RM 500.00
    paymentAccountId: bankAccount.id,
    reference: 'CHQ-100294',
    notes: 'Advance deposit payment',
    status: 'Draft',
  }, adminUid, 'Admin');

  if (draftPay1.id && draftPay1.paymentNumber.startsWith('SPAY-') && draftPay1.status === 'Draft' && draftPay1.unallocatedAmount === 50000) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.1', 'Create draft supplier payment', 'PASS', `Created ${draftPay1.paymentNumber} as Draft with unallocated balance RM 500.00`);
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.1', 'Create draft supplier payment', 'FAIL', 'Failed to create draft payment');
  }

  // 1.2: Edit draft payment
  await editDraftSupplierPayment(draftPay1.id, {
    amount: 60000, // Updated to RM 600.00
    notes: 'Updated deposit memo',
  }, adminUid, 'Admin');
  const pay1Detail = await getSupplierPaymentDetail(draftPay1.id);
  if (pay1Detail.amount === 60000 && pay1Detail.notes === 'Updated deposit memo') {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.2', 'Edit draft supplier payment', 'PASS', 'Draft payment amount updated to RM 600.00');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.2', 'Edit draft supplier payment', 'FAIL', 'Failed to edit draft payment');
  }

  // 1.3: Invalid supplier rejected
  let invalidSupRejected = false;
  try {
    await createSupplierPayment({
      supplierId: '00000000-0000-0000-0000-000000000000',
      paymentDate: todayStr,
      amount: 10000,
      paymentAccountId: bankAccount.id,
    }, adminUid, 'Admin');
  } catch (err: any) {
    invalidSupRejected = true;
  }
  if (invalidSupRejected) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.3', 'Invalid supplier rejected', 'PASS', 'Non-existent supplier ID rejected with validation error');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.3', 'Invalid supplier rejected', 'FAIL', 'Allowed non-existent supplier');
  }

  // 1.4: Inactive supplier rejected
  const inactSup = await createSupplier({
    supplierCode: `SUP-INACT-PAY-${Date.now()}`,
    name: 'Inactive Vendor',
  }, adminUid, 'Admin');
  await toggleSupplierStatus(inactSup.id, false, adminUid, 'Admin');

  let inactiveSupRejected = false;
  try {
    await createSupplierPayment({
      supplierId: inactSup.id,
      paymentDate: todayStr,
      amount: 10000,
      paymentAccountId: bankAccount.id,
    }, adminUid, 'Admin');
  } catch (err: any) {
    inactiveSupRejected = true;
  }
  if (inactiveSupRejected) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.4', 'Inactive supplier rejected', 'PASS', 'Payment creation blocked for deactivated supplier');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.4', 'Inactive supplier rejected', 'FAIL', 'Allowed payment to inactive supplier');
  }

  // 1.5: Invalid payment account rejected
  let invalidAccountRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup1.id,
      paymentDate: todayStr,
      amount: 10000,
      paymentAccountId: '00000000-0000-0000-0000-000000000000',
    }, adminUid, 'Admin');
  } catch (err: any) {
    invalidAccountRejected = true;
  }
  if (invalidAccountRejected) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.5', 'Invalid payment account rejected', 'PASS', 'Non-existent account rejected');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.5', 'Invalid payment account rejected', 'FAIL', 'Allowed non-existent payment account');
  }

  // 1.6: Non-asset payment account rejected (e.g. using Expense account as payment account)
  let nonAssetAccountRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup1.id,
      paymentDate: todayStr,
      amount: 10000,
      paymentAccountId: expAccount.id,
    }, adminUid, 'Admin');
  } catch (err: any) {
    nonAssetAccountRejected = true;
  }
  if (nonAssetAccountRejected) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.6', 'Non-asset payment account rejected', 'PASS', 'Validation requires payment account to be an Asset (Cash/Bank)');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.6', 'Non-asset payment account rejected', 'FAIL', 'Allowed non-asset payment account');
  }

  // 1.7: Zero amount rejected
  let zeroAmountRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup1.id,
      paymentDate: todayStr,
      amount: 0,
      paymentAccountId: bankAccount.id,
    }, adminUid, 'Admin');
  } catch (err: any) {
    zeroAmountRejected = true;
  }
  if (zeroAmountRejected) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.7', 'Zero amount rejected', 'PASS', 'Validation rejected RM 0.00 payment');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.7', 'Zero amount rejected', 'FAIL', 'Allowed zero payment amount');
  }

  // 1.8: Negative amount rejected
  let negativeAmountRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup1.id,
      paymentDate: todayStr,
      amount: -5000,
      paymentAccountId: bankAccount.id,
    }, adminUid, 'Admin');
  } catch (err: any) {
    negativeAmountRejected = true;
  }
  if (negativeAmountRejected) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.8', 'Negative amount rejected', 'PASS', 'Validation rejected negative payment amount');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.8', 'Negative amount rejected', 'FAIL', 'Allowed negative payment amount');
  }

  // 1.9: Closed accounting period blocks payment
  let closedPeriodRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup1.id,
      paymentDate: '2020-01-01', // Outside open periods
      amount: 10000,
      paymentAccountId: bankAccount.id,
    }, adminUid, 'Admin');
  } catch (err: any) {
    closedPeriodRejected = true;
  }
  if (closedPeriodRejected) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.9', 'Closed accounting period blocks payment', 'PASS', 'Payment in closed period rejected');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.9', 'Closed accounting period blocks payment', 'FAIL', 'Allowed payment in closed period');
  }

  // 1.10: Delete draft payment succeeds
  const delDraft = await createSupplierPayment({
    supplierId: sup1.id,
    paymentDate: todayStr,
    amount: 15000,
    paymentAccountId: bankAccount.id,
    status: 'Draft',
  }, adminUid, 'Admin');
  const deleteRes = await deleteDraftSupplierPayment(delDraft.id, adminUid, 'Admin');
  const checkDeleted = await db.select().from(supplierPayments).where(eq(supplierPayments.id, delDraft.id));
  if (deleteRes.deleted && checkDeleted.length === 0) {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.10', 'Delete draft payment succeeds', 'PASS', 'Draft payment deleted cleanly without journal trace');
  } else {
    recordResult('1. PAYMENT DRAFT & VALIDATION', '1.10', 'Delete draft payment succeeds', 'FAIL', 'Failed to delete draft payment');
  }

  // -------------------------------------------------------------------------
  // SECTION 2: PAYMENT ALLOCATION ENGINE
  // -------------------------------------------------------------------------
  console.log('\n--- 2. PAYMENT ALLOCATION ENGINE ---');

  // Create test supplier and bills
  const sup2 = await createSupplier({
    supplierCode: `SUP-ALLOC-${Date.now()}`,
    name: 'Pembekal Ikan & Makanan Laut Muar',
  }, adminUid, 'Admin');

  // Bill A: RM 200.00 (20000 cents)
  const billAId = await createPurchaseBill({
    supplierId: sup2.id,
    supplierInvoiceNumber: 'INV-MUAR-A',
    billDate: '2026-10-01',
    dueDate: '2026-10-31',
    lines: [{ description: 'Kembung Fish 20kg', quantity: 10, unitPrice: 2000, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');
  await postPurchaseBill(billAId, adminUid, 'Admin');

  // Bill B: RM 300.00 (30000 cents)
  const billBId = await createPurchaseBill({
    supplierId: sup2.id,
    supplierInvoiceNumber: 'INV-MUAR-B',
    billDate: '2026-10-05',
    dueDate: '2026-11-05',
    lines: [{ description: 'Tenggiri Fish 15kg', quantity: 10, unitPrice: 3000, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');
  await postPurchaseBill(billBId, adminUid, 'Admin');

  // Draft Bill C (unposted)
  const draftBillCId = await createPurchaseBill({
    supplierId: sup2.id,
    supplierInvoiceNumber: 'INV-MUAR-C-DRAFT',
    billDate: '2026-10-08',
    dueDate: '2026-11-08',
    lines: [{ description: 'Draft Lobster', quantity: 5, unitPrice: 5000, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');

  // 2.1: Single full allocation succeeds
  const paySingleFull = await createSupplierPayment({
    supplierId: sup2.id,
    paymentDate: todayStr,
    amount: 20000, // RM 200.00
    paymentAccountId: bankAccount.id,
    reference: 'CHQ-FULL-A',
    status: 'Posted',
    allocations: [{ purchaseBillId: billAId, amount: 20000 }]
  }, adminUid, 'Admin');

  const billAStatus1 = await getBillPaymentStatus(billAId);
  if (billAStatus1.paymentStatus === 'PAID' && billAStatus1.outstandingBalance === 0 && paySingleFull.unallocatedAmount === 0) {
    recordResult('2. PAYMENT ALLOCATION', '2.1', 'Full bill allocation succeeds', 'PASS', 'Bill A fully settled (RM 200.00), payment unallocated = 0');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.1', 'Full bill allocation succeeds', 'FAIL', `Bill status: ${billAStatus1.paymentStatus}, outstanding: ${billAStatus1.outstandingBalance}`);
  }

  // 2.2: Partial allocation succeeds
  const payPartialB = await createSupplierPayment({
    supplierId: sup2.id,
    paymentDate: todayStr,
    amount: 10000, // RM 100.00 towards RM 300.00 bill B
    paymentAccountId: bankAccount.id,
    reference: 'WIRE-PART-B',
    status: 'Posted',
    allocations: [{ purchaseBillId: billBId, amount: 10000 }]
  }, adminUid, 'Admin');

  const billBStatus1 = await getBillPaymentStatus(billBId);
  if (billBStatus1.paymentStatus === 'PARTIALLY_PAID' && billBStatus1.outstandingBalance === 20000 && billBStatus1.allocatedAmount === 10000) {
    recordResult('2. PAYMENT ALLOCATION', '2.2', 'Partial bill allocation succeeds', 'PASS', 'Bill B partially paid (RM 100.00 / RM 300.00), remaining balance RM 200.00');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.2', 'Partial bill allocation succeeds', 'FAIL', `Bill B status: ${billBStatus1.paymentStatus}, outstanding: ${billBStatus1.outstandingBalance}`);
  }

  // 2.3: Multiple invoice allocation succeeds
  // Create 2 new bills for multi-allocation
  const billDId = await createPurchaseBill({
    supplierId: sup2.id,
    billDate: '2026-10-10',
    dueDate: '2026-11-10',
    lines: [{ description: 'Item D', quantity: 1, unitPrice: 15000, expenseAccountId: expAccount.id }] // RM 150.00
  }, adminUid, 'Admin');
  await postPurchaseBill(billDId, adminUid, 'Admin');

  const billEId = await createPurchaseBill({
    supplierId: sup2.id,
    billDate: '2026-10-11',
    dueDate: '2026-11-11',
    lines: [{ description: 'Item E', quantity: 1, unitPrice: 25000, expenseAccountId: expAccount.id }] // RM 250.00
  }, adminUid, 'Admin');
  await postPurchaseBill(billEId, adminUid, 'Admin');

  // Single payment of RM 400.00 allocating RM 150.00 to Bill D and RM 250.00 to Bill E
  const payMulti = await createSupplierPayment({
    supplierId: sup2.id,
    paymentDate: todayStr,
    amount: 40000,
    paymentAccountId: bankAccount.id,
    reference: 'MULTI-ALLOC-01',
    status: 'Posted',
    allocations: [
      { purchaseBillId: billDId, amount: 15000 },
      { purchaseBillId: billEId, amount: 25000 },
    ]
  }, adminUid, 'Admin');

  const billDStatus = await getBillPaymentStatus(billDId);
  const billEStatus = await getBillPaymentStatus(billEId);
  if (billDStatus.paymentStatus === 'PAID' && billEStatus.paymentStatus === 'PAID' && payMulti.unallocatedAmount === 0) {
    recordResult('2. PAYMENT ALLOCATION', '2.3', 'Multiple bill allocation succeeds', 'PASS', 'Bills D & E both fully paid in single multi-allocation transaction');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.3', 'Multiple bill allocation succeeds', 'FAIL', 'Multiple bill allocation failed');
  }

  // 2.4: Allocation greater than bill outstanding balance is rejected
  // Bill B currently has RM 200.00 outstanding. Try allocating RM 250.00.
  let overAllocRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup2.id,
      paymentDate: todayStr,
      amount: 30000,
      paymentAccountId: bankAccount.id,
      allocations: [{ purchaseBillId: billBId, amount: 25000 }] // 25000 > 20000
    }, adminUid, 'Admin');
  } catch (err: any) {
    overAllocRejected = true;
  }
  if (overAllocRejected) {
    recordResult('2. PAYMENT ALLOCATION', '2.4', 'Allocation greater than bill outstanding is rejected', 'PASS', 'Validation prevented allocating RM 250.00 to bill with RM 200.00 outstanding');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.4', 'Allocation greater than bill outstanding is rejected', 'FAIL', 'Allowed over-allocation');
  }

  // 2.5: Total allocation greater than payment amount is rejected
  let allocExceedsAmountRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup2.id,
      paymentDate: todayStr,
      amount: 10000, // RM 100.00 payment
      paymentAccountId: bankAccount.id,
      allocations: [{ purchaseBillId: billBId, amount: 15000 }] // RM 150.00 allocation
    }, adminUid, 'Admin');
  } catch (err: any) {
    allocExceedsAmountRejected = true;
  }
  if (allocExceedsAmountRejected) {
    recordResult('2. PAYMENT ALLOCATION', '2.5', 'Total allocations exceeding payment amount is rejected', 'PASS', 'Validation rejected total allocation > payment amount');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.5', 'Total allocations exceeding payment amount is rejected', 'FAIL', 'Allowed allocation > payment amount');
  }

  // 2.6: Payment supplier different from bill supplier is rejected
  let crossSupplierRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup1.id, // Supplier 1
      paymentDate: todayStr,
      amount: 10000,
      paymentAccountId: bankAccount.id,
      allocations: [{ purchaseBillId: billBId, amount: 10000 }] // Bill B belongs to Supplier 2
    }, adminUid, 'Admin');
  } catch (err: any) {
    crossSupplierRejected = true;
  }
  if (crossSupplierRejected) {
    recordResult('2. PAYMENT ALLOCATION', '2.6', 'Allocation to different supplier bill is rejected', 'PASS', 'Cross-supplier payment allocation strictly forbidden');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.6', 'Allocation to different supplier bill is rejected', 'FAIL', 'Allowed cross-supplier allocation');
  }

  // 2.7: Allocation to draft bill is rejected
  let draftBillAllocRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup2.id,
      paymentDate: todayStr,
      amount: 10000,
      paymentAccountId: bankAccount.id,
      allocations: [{ purchaseBillId: draftBillCId, amount: 10000 }]
    }, adminUid, 'Admin');
  } catch (err: any) {
    draftBillAllocRejected = true;
  }
  if (draftBillAllocRejected) {
    recordResult('2. PAYMENT ALLOCATION', '2.7', 'Allocation to draft bill is rejected', 'PASS', 'Draft bill cannot receive payment allocation');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.7', 'Allocation to draft bill is rejected', 'FAIL', 'Allowed allocation to draft bill');
  }

  // 2.8: Allocation to fully paid bill is rejected
  // Bill A is already PAID
  let paidBillAllocRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup2.id,
      paymentDate: todayStr,
      amount: 5000,
      paymentAccountId: bankAccount.id,
      allocations: [{ purchaseBillId: billAId, amount: 5000 }]
    }, adminUid, 'Admin');
  } catch (err: any) {
    paidBillAllocRejected = true;
  }
  if (paidBillAllocRejected) {
    recordResult('2. PAYMENT ALLOCATION', '2.8', 'Allocation to paid bill is rejected', 'PASS', 'Cannot allocate to zero-outstanding paid bill');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.8', 'Allocation to paid bill is rejected', 'FAIL', 'Allowed allocation to paid bill');
  }

  // 2.9: Duplicate allocation to same bill in single payment is rejected
  let dupBillAllocRejected = false;
  try {
    await createSupplierPayment({
      supplierId: sup2.id,
      paymentDate: todayStr,
      amount: 20000,
      paymentAccountId: bankAccount.id,
      allocations: [
        { purchaseBillId: billBId, amount: 5000 },
        { purchaseBillId: billBId, amount: 5000 },
      ]
    }, adminUid, 'Admin');
  } catch (err: any) {
    dupBillAllocRejected = true;
  }
  if (dupBillAllocRejected) {
    recordResult('2. PAYMENT ALLOCATION', '2.9', 'Duplicate bill allocation is rejected', 'PASS', 'Multiple allocation lines for same bill rejected');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.9', 'Duplicate bill allocation is rejected', 'FAIL', 'Allowed duplicate allocation lines');
  }

  // 2.10: Unallocated payment amount is calculated correctly (advance balance)
  const payAdvance = await createSupplierPayment({
    supplierId: sup2.id,
    paymentDate: todayStr,
    amount: 50000, // RM 500.00
    paymentAccountId: bankAccount.id,
    reference: 'ADV-SETTLE',
    status: 'Posted',
    allocations: [{ purchaseBillId: billBId, amount: 20000 }] // RM 200.00 settling rest of Bill B
  }, adminUid, 'Admin');

  if (payAdvance.amount === 50000 && payAdvance.allocatedAmount === 20000 && payAdvance.unallocatedAmount === 30000) {
    recordResult('2. PAYMENT ALLOCATION', '2.10', 'Unallocated advance amount calculated accurately', 'PASS', 'RM 500.00 payment - RM 200.00 allocated = RM 300.00 unallocated advance credit');
  } else {
    recordResult('2. PAYMENT ALLOCATION', '2.10', 'Unallocated advance amount calculated accurately', 'FAIL', `Allocated: ${payAdvance.allocatedAmount}, Unallocated: ${payAdvance.unallocatedAmount}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: ACCOUNTING & DOUBLE-ENTRY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- 3. ACCOUNTING & DOUBLE-ENTRY VERIFICATION ---');

  // Verify journal created for payAdvance
  const journalList = await db.select().from(journalEntries).where(eq(journalEntries.id, payAdvance.postedJournalId!));
  if (journalList.length === 1 && journalList[0].status === 'Posted') {
    recordResult('3. ACCOUNTING & LEDGER', '3.1', 'Posted payment creates exactly one balanced journal', 'PASS', `Created Journal #${journalList[0].id}`);
  } else {
    recordResult('3. ACCOUNTING & LEDGER', '3.1', 'Posted payment creates exactly one balanced journal', 'FAIL', 'Missing or invalid journal entry');
  }

  // Verify Debit is AP and Credit is Cash/Bank
  const jLines = await db.select().from(journalLines).where(eq(journalLines.entryId, payAdvance.postedJournalId!));
  const apDebitLine = jLines.find(l => l.accountId === apAccount.id && l.debit === 50000);
  const bankCreditLine = jLines.find(l => l.accountId === bankAccount.id && l.credit === 50000);

  if (apDebitLine && bankCreditLine && jLines.length === 2) {
    recordResult('3. ACCOUNTING & LEDGER', '3.2', 'Debit is Accounts Payable, Credit is Cash/Bank', 'PASS', `Dr AP (${apAccount.code}) RM 500.00 == Cr Bank (${bankAccount.code}) RM 500.00`);
  } else {
    recordResult('3. ACCOUNTING & LEDGER', '3.2', 'Debit is Accounts Payable, Credit is Cash/Bank', 'FAIL', 'Journal lines account mapping incorrect');
  }

  // Immutability: Posted payment cannot be edited
  let editPostedBlocked = false;
  try {
    await editDraftSupplierPayment(payAdvance.id, { amount: 99999 }, adminUid, 'Admin');
  } catch (err: any) {
    editPostedBlocked = true;
  }
  if (editPostedBlocked) {
    recordResult('3. ACCOUNTING & LEDGER', '3.3', 'Posted payment cannot be edited', 'PASS', 'Immutability rule enforced: editing Posted payment rejected');
  } else {
    recordResult('3. ACCOUNTING & LEDGER', '3.3', 'Posted payment cannot be edited', 'FAIL', 'Allowed editing Posted payment');
  }

  // Immutability: Posted payment cannot be deleted
  let deletePostedBlocked = false;
  try {
    await deleteDraftSupplierPayment(payAdvance.id, adminUid, 'Admin');
  } catch (err: any) {
    deletePostedBlocked = true;
  }
  if (deletePostedBlocked) {
    recordResult('3. ACCOUNTING & LEDGER', '3.4', 'Posted payment cannot be deleted', 'PASS', 'Immutability rule enforced: deleting Posted payment rejected');
  } else {
    recordResult('3. ACCOUNTING & LEDGER', '3.4', 'Posted payment cannot be deleted', 'FAIL', 'Allowed deleting Posted payment');
  }

  // -------------------------------------------------------------------------
  // SECTION 4: AP AGING & RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('\n--- 4. AP AGING & RECONCILIATION ---');

  // Supplier 3 for clean aging & statement reconciliation test
  const sup3 = await createSupplier({
    supplierCode: `SUP-RECON-${Date.now()}`,
    name: 'Reconciliation Agritech Farm',
  }, adminUid, 'Admin');

  // Bill 1: RM 1,000.00 (100000 cents), due 2026-10-31 (Current)
  const b1 = await createPurchaseBill({
    supplierId: sup3.id,
    supplierInvoiceNumber: 'INV-RC-1',
    billDate: '2026-10-01',
    dueDate: '2026-10-31',
    lines: [{ description: 'Fertilizer Pack', quantity: 10, unitPrice: 10000, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');
  await postPurchaseBill(b1, adminUid, 'Admin');

  // Bill 2: RM 500.00 (50000 cents), due 2026-10-15 (16 days overdue as of 2026-10-31 -> 1-30 days)
  const b2 = await createPurchaseBill({
    supplierId: sup3.id,
    supplierInvoiceNumber: 'INV-RC-2',
    billDate: '2026-09-15',
    dueDate: '2026-10-15',
    lines: [{ description: 'Pest Control', quantity: 5, unitPrice: 10000, expenseAccountId: expAccount.id }]
  }, adminUid, 'Admin');
  await postPurchaseBill(b2, adminUid, 'Admin');

  // Partial payment of RM 400.00 to Bill 1, and Full payment of RM 500.00 to Bill 2
  await createSupplierPayment({
    supplierId: sup3.id,
    paymentDate: '2026-10-20',
    amount: 90000, // RM 900.00
    paymentAccountId: bankAccount.id,
    reference: 'PAY-RECON-1',
    status: 'Posted',
    allocations: [
      { purchaseBillId: b1, amount: 40000 }, // RM 400.00 -> remaining RM 600.00
      { purchaseBillId: b2, amount: 50000 }, // RM 500.00 -> remaining RM 0.00 (PAID)
    ]
  }, adminUid, 'Admin');

  // Check AP Aging
  const agingReport = await calculateAPAging('2026-10-31');
  const sup3Aging = agingReport.find(a => a.supplierCode === sup3.supplierCode);

  // 4.1: AR/AP aging uses remaining balance, not original bill amount
  // 4.2: Fully paid bill excluded from aging
  if (sup3Aging && sup3Aging.current === 60000 && sup3Aging.oneToThirty === 0 && sup3Aging.totalOutstanding === 60000) {
    recordResult('4. AP AGING & RECONCILIATION', '4.1', 'AP aging uses remaining balance (not original bill amount)', 'PASS', 'Bill 1 remaining balance RM 600.00 in Current bucket');
    recordResult('4. AP AGING & RECONCILIATION', '4.2', 'Fully paid bill excluded from aging', 'PASS', 'Bill 2 (fully settled) completely excluded from 1-30 days overdue bucket');
  } else {
    recordResult('4. AP AGING & RECONCILIATION', '4.1', 'AP aging uses remaining balance (not original bill amount)', 'FAIL', `Aging: ${JSON.stringify(sup3Aging)}`);
    recordResult('4. AP AGING & RECONCILIATION', '4.2', 'Fully paid bill excluded from aging', 'FAIL', `Aging: ${JSON.stringify(sup3Aging)}`);
  }

  // 4.3: Supplier Statement includes payments and calculates correct running balance
  const stmtData = await getSupplierStatement(sup3.id);
  // Expected statement lines:
  // 1. 2026-09-15 Bill 2: Cr 50000, runningBalance = 50000
  // 2. 2026-10-01 Bill 1: Cr 100000, runningBalance = 150000
  // 3. 2026-10-20 Payment 1: Dr 90000, runningBalance = 60000
  if (stmtData.statementLines.length === 3 &&
      stmtData.totalOutstanding === 60000 &&
      stmtData.statementLines[2].runningBalance === 60000 &&
      stmtData.statementLines[2].debit === 90000) {
    recordResult('4. AP AGING & RECONCILIATION', '4.3', 'Supplier statement running balance is accurate with payments', 'PASS', 'Running balance correctly decremented by payment (RM 1,500.00 - RM 900.00 = RM 600.00)');
  } else {
    recordResult('4. AP AGING & RECONCILIATION', '4.3', 'Supplier statement running balance is accurate with payments', 'FAIL', `Statement totals: ${stmtData.totalOutstanding}`);
  }

  // 4.4: Outstanding AP list uses remaining balances
  const outstandingAPList = await getOutstandingAP();
  const b1InOutstanding = outstandingAPList.find((b: any) => b.id === b1);
  const b2InOutstanding = outstandingAPList.find((b: any) => b.id === b2);

  if (b1InOutstanding && b1InOutstanding.outstanding === 60000 && !b2InOutstanding) {
    recordResult('4. AP AGING & RECONCILIATION', '4.4', 'Outstanding AP list excludes paid bills and shows remaining balance', 'PASS', 'Bill 1 has RM 600.00 outstanding; fully paid Bill 2 excluded');
  } else {
    recordResult('4. AP AGING & RECONCILIATION', '4.4', 'Outstanding AP list excludes paid bills and shows remaining balance', 'FAIL', 'Outstanding AP list incorrect');
  }

  // -------------------------------------------------------------------------
  // SECTION 5: VOID & REVERSAL WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n--- 5. VOID & REVERSAL WORKFLOW ---');

  // Supplier 4 for void test
  const sup4 = await createSupplier({
    supplierCode: `SUP-VOID-${Date.now()}`,
    name: 'Void Verification Supplier',
  }, adminUid, 'Admin');

  const voidBillId = await createPurchaseBill({
    supplierId: sup4.id,
    supplierInvoiceNumber: 'INV-VOID-TEST',
    billDate: '2026-10-10',
    dueDate: '2026-11-10',
    lines: [{ description: 'Fresh Prawns 10kg', quantity: 10, unitPrice: 3500, expenseAccountId: expAccount.id }] // RM 350.00
  }, adminUid, 'Admin');
  await postPurchaseBill(voidBillId, adminUid, 'Admin');

  // Pay RM 350.00 full
  const payToVoid = await createSupplierPayment({
    supplierId: sup4.id,
    paymentDate: todayStr,
    amount: 35000,
    paymentAccountId: bankAccount.id,
    reference: 'CHQ-WILL-VOID',
    status: 'Posted',
    allocations: [{ purchaseBillId: voidBillId, amount: 35000 }]
  }, adminUid, 'Admin');

  // Verify bill is currently PAID
  const billStatusBeforeVoid = await getBillPaymentStatus(voidBillId);

  // Void payment
  const voidReasonText = 'Cheque bounced due to signature discrepancy';
  const voidResult = await voidSupplierPayment(payToVoid.id, voidReasonText, adminUid, 'Admin');

  // 5.1: Payment void succeeds and creates compensating reversal journal
  const revJournal = await db.select().from(journalEntries).where(eq(journalEntries.id, voidResult.reversalJournalId));
  const revLines = await db.select().from(journalLines).where(eq(journalLines.entryId, voidResult.reversalJournalId));
  const revBankDebit = revLines.find(l => l.accountId === bankAccount.id && l.debit === 35000);
  const revApCredit = revLines.find(l => l.accountId === apAccount.id && l.credit === 35000);

  if (revJournal.length === 1 && revBankDebit && revApCredit) {
    recordResult('5. VOID & REVERSAL', '5.1', 'Void creates compensating reversal journal (Dr Cash/Bank, Cr AP)', 'PASS', `Reversal journal #${voidResult.reversalJournalId} restores GL balances`);
  } else {
    recordResult('5. VOID & REVERSAL', '5.1', 'Void creates compensating reversal journal (Dr Cash/Bank, Cr AP)', 'FAIL', 'Reversal journal missing or lines incorrect');
  }

  // 5.2: Original payment and journal remain preserved
  const origPaymentCheck = await db.select().from(supplierPayments).where(eq(supplierPayments.id, payToVoid.id));
  const origJournalCheck = await db.select().from(journalEntries).where(eq(journalEntries.id, payToVoid.postedJournalId!));
  if (origPaymentCheck[0].status === 'Voided' && origPaymentCheck[0].voidReason === voidReasonText && origJournalCheck[0].status === 'Voided') {
    recordResult('5. VOID & REVERSAL', '5.2', 'Original payment and journal preserved with Voided status', 'PASS', 'No destructive deletion; void audit status preserved');
  } else {
    recordResult('5. VOID & REVERSAL', '5.2', 'Original payment and journal preserved with Voided status', 'FAIL', 'Original records deleted or corrupted');
  }

  // 5.3: Purchase bill outstanding balance is restored correctly
  const billStatusAfterVoid = await getBillPaymentStatus(voidBillId);
  if (billStatusBeforeVoid.paymentStatus === 'PAID' &&
      billStatusAfterVoid.paymentStatus === 'UNPAID' &&
      billStatusAfterVoid.outstandingBalance === 35000) {
    recordResult('5. VOID & REVERSAL', '5.3', 'Purchase bill outstanding balance restored on void', 'PASS', 'Bill transitioned from PAID back to UNPAID (RM 350.00 outstanding)');
  } else {
    recordResult('5. VOID & REVERSAL', '5.3', 'Purchase bill outstanding balance restored on void', 'FAIL', `Bill status: ${billStatusAfterVoid.paymentStatus}, outstanding: ${billStatusAfterVoid.outstandingBalance}`);
  }

  // 5.4: Second void is rejected
  let secondVoidBlocked = false;
  try {
    await voidSupplierPayment(payToVoid.id, 'Second void attempt', adminUid, 'Admin');
  } catch (err: any) {
    secondVoidBlocked = true;
  }
  if (secondVoidBlocked) {
    recordResult('5. VOID & REVERSAL', '5.4', 'Double void is rejected', 'PASS', 'Validation rejected voiding an already Voided payment');
  } else {
    recordResult('5. VOID & REVERSAL', '5.4', 'Double void is rejected', 'FAIL', 'Allowed double void');
  }

  // -------------------------------------------------------------------------
  // SECTION 6: RBAC & AUDIT LOGS
  // -------------------------------------------------------------------------
  console.log('\n--- 6. RBAC & AUDIT LOGS ---');

  // 6.1: Viewer cannot create supplier payment
  let viewerCreateBlocked = false;
  try {
    await createSupplierPayment({
      supplierId: sup1.id,
      paymentDate: todayStr,
      amount: 10000,
      paymentAccountId: bankAccount.id,
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerCreateBlocked = true;
  }
  if (viewerCreateBlocked) {
    recordResult('6. RBAC & AUDIT TRAIL', '6.1', 'Viewer rejected from creating payment', 'PASS', 'Viewer role blocked with unauthorized error');
  } else {
    recordResult('6. RBAC & AUDIT TRAIL', '6.1', 'Viewer rejected from creating payment', 'FAIL', 'Viewer permitted to create payment');
  }

  // 6.2: Viewer cannot post or void supplier payment
  const draftTestPay = await createSupplierPayment({
    supplierId: sup1.id,
    paymentDate: todayStr,
    amount: 10000,
    paymentAccountId: bankAccount.id,
    status: 'Draft',
  }, adminUid, 'Admin');

  let viewerPostBlocked = false;
  try {
    await postSupplierPayment(draftTestPay.id, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerPostBlocked = true;
  }

  let viewerVoidBlocked = false;
  try {
    await voidSupplierPayment(draftTestPay.id, 'Viewer void attempt', viewerUid, 'Viewer');
  } catch (err: any) {
    viewerVoidBlocked = true;
  }

  if (viewerPostBlocked && viewerVoidBlocked) {
    recordResult('6. RBAC & AUDIT TRAIL', '6.2', 'Viewer rejected from posting and voiding payment', 'PASS', 'Viewer role strictly blocked from all mutating payment operations');
  } else {
    recordResult('6. RBAC & AUDIT TRAIL', '6.2', 'Viewer rejected from posting and voiding payment', 'FAIL', 'Viewer permitted mutating operations');
  }

  // 6.3: Accountant permitted to execute complete workflow
  const accPay = await createSupplierPayment({
    supplierId: sup1.id,
    paymentDate: todayStr,
    amount: 25000,
    paymentAccountId: bankAccount.id,
    reference: 'ACC-WORKFLOW-01',
    status: 'Draft',
  }, accountantUid, 'Accountant');

  await editDraftSupplierPayment(accPay.id, { notes: 'Accountant note' }, accountantUid, 'Accountant');
  const accPostRes = await postSupplierPayment(accPay.id, accountantUid, 'Accountant');
  const accVoidRes = await voidSupplierPayment(accPay.id, 'Accountant test void', accountantUid, 'Accountant');

  if (accPay.id && accPostRes.journalId && accVoidRes.status === 'Voided') {
    recordResult('6. RBAC & AUDIT TRAIL', '6.3', 'Accountant permitted to execute complete payment lifecycle', 'PASS', 'Accountant role successfully completed create -> edit -> post -> void');
  } else {
    recordResult('6. RBAC & AUDIT TRAIL', '6.3', 'Accountant permitted to execute complete payment lifecycle', 'FAIL', 'Accountant operations failed');
  }

  // 6.4: Audit logs capture all 4 required payment actions
  const requiredAuditActions = ['SUPPLIER_PAYMENT_CREATE', 'SUPPLIER_PAYMENT_UPDATE', 'SUPPLIER_PAYMENT_POST', 'SUPPLIER_PAYMENT_VOID'];
  let allAuditsFound = true;
  const missingAudits: string[] = [];

  for (const act of requiredAuditActions) {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, act)).limit(1);
    if (logs.length === 0) {
      allAuditsFound = false;
      missingAudits.push(act);
    } else {
      const log = logs[0];
      if (!log.recordId || !log.timestamp || !log.userId) {
        allAuditsFound = false;
        missingAudits.push(`${act} (missing metadata)`);
      }
    }
  }

  if (allAuditsFound) {
    recordResult('6. RBAC & AUDIT TRAIL', '6.4', 'Audit logs capture all required payment actions with full metadata', 'PASS', 'Verified: SUPPLIER_PAYMENT_CREATE, SUPPLIER_PAYMENT_UPDATE, SUPPLIER_PAYMENT_POST, SUPPLIER_PAYMENT_VOID');
  } else {
    recordResult('6. RBAC & AUDIT TRAIL', '6.4', 'Audit logs capture all required payment actions with full metadata', 'FAIL', `Missing actions: ${missingAudits.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('FINAL MILESTONE 3B QA REPORT SUMMARY');
  console.log('========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passed}`);
  console.log(`FAILED:      ${failed}`);
  console.log(`RESULT:      ${failed === 0 ? 'MILESTONE 3B — 100% PASS' : 'MILESTONE 3B — FAIL'}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMilestone3BTests().catch((err) => {
  console.error('\nUNHANDLED QA ERROR:', err);
  process.exit(1);
});
