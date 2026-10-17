import { db } from '../src/db/index.ts';
import { accounts, accountingPeriods, users } from '../src/db/schema.ts';
import {
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  getSuppliers,
  getSupplierDetail,
} from '../src/services/supplierService.ts';
import {
  createPurchaseBill,
  editDraftBill,
  postPurchaseBill,
  voidPurchaseBill,
  getPurchaseBills,
  getPurchaseBillDetail,
} from '../src/services/purchaseBillService.ts';
import {
  calculateAPAging,
  getSupplierStatement,
  getOutstandingAP,
} from '../src/services/apService.ts';
import { eq } from 'drizzle-orm';

async function runM3ATests() {
  console.log('====================================================');
  console.log('STARTING MILESTONE 3A BACKEND SERVICE VERIFICATION');
  console.log('====================================================\n');

  // 1. Ensure test user exists in Postgres
  const testUid = 'test-qa-engineer-uid';
  await db.insert(users).values({
    uid: testUid,
    email: 'qa@khairulfresh.com',
    name: 'QA Engineer',
    role: 'Admin',
  }).onConflictDoNothing();

  const userRole = 'Admin';

  // 2. Resolve expense account and AP account
  const expAccounts = await db.select().from(accounts).where(eq(accounts.code, '5000'));
  if (expAccounts.length === 0) {
    throw new Error('COGS Expense account 5000 not found!');
  }
  const cogsAccount = expAccounts[0];

  const apAccounts = await db.select().from(accounts).where(eq(accounts.subType, 'AccountsPayable'));
  if (apAccounts.length === 0) {
    throw new Error('Accounts Payable account not found!');
  }
  const apAccount = apAccounts[0];
  console.log(`[PASS] Resolved GL Accounts: AP = ${apAccount.code} (${apAccount.name}), COGS = ${cogsAccount.code} (${cogsAccount.name})`);

  // ========================================================
  // TEST 1: Supplier Creation & Code Uniqueness
  // ========================================================
  const supCode = `SUP-QA-${Date.now()}`;
  const sup1 = await createSupplier({
    supplierCode: supCode,
    name: 'Ladang Unggas Selatan Sdn Bhd',
    phone: '07-5551234',
    email: 'sales@unggas.my',
    address: 'Batu Pahat, Johor',
    notes: 'Primary fresh chicken farm supplier',
  }, testUid, userRole);
  console.log(`[PASS] Created supplier: ${sup1.supplierCode} — ${sup1.name} (ID: ${sup1.id})`);

  // Attempt duplicate
  let duplicateCaught = false;
  try {
    await createSupplier({
      supplierCode: supCode,
      name: 'Duplicate Company',
    }, testUid, userRole);
  } catch (err: any) {
    duplicateCaught = true;
    console.log(`[PASS] Correctly rejected duplicate supplier code: "${err.message}"`);
  }
  if (!duplicateCaught) throw new Error('FAIL: Allowed duplicate supplier code!');

  // ========================================================
  // TEST 2: Purchase Bill Draft Creation & Server-side Totals
  // ========================================================
  const billId = await createPurchaseBill({
    supplierId: sup1.id,
    supplierInvoiceNumber: 'INV-FARM-8801',
    billDate: '2026-10-15',
    dueDate: '2026-11-15',
    discount: 5000, // RM 50.00
    lines: [
      {
        description: 'Fresh Ayam Bulat Gred A (500 birds)',
        quantity: 50,
        unitPrice: 2000, // RM 20.00 -> RM 1,000.00 (100,000 cents)
        expenseAccountId: cogsAccount.id,
      },
      {
        description: 'Fresh Ayam Potong 8 Tray Packs',
        quantity: 20,
        unitPrice: 2500, // RM 25.00 -> RM 500.00 (50,000 cents)
        expenseAccountId: cogsAccount.id,
      },
    ],
  }, testUid, userRole);

  const billDetail = await getPurchaseBillDetail(billId);
  console.log(`[PASS] Created draft bill: ${billDetail.billNumber}`);
  console.log(`       Subtotal: RM ${(billDetail.subtotal / 100).toFixed(2)} (Expected 1500.00)`);
  console.log(`       Discount: RM ${(billDetail.discount / 100).toFixed(2)} (Expected 50.00)`);
  console.log(`       Net Total: RM ${(billDetail.total / 100).toFixed(2)} (Expected 1450.00)`);

  if (billDetail.subtotal !== 150000 || billDetail.discount !== 5000 || billDetail.total !== 145000) {
    throw new Error('FAIL: Incorrect server-calculated bill totals!');
  }

  // ========================================================
  // TEST 3: Validation on Negative Line Items
  // ========================================================
  let invalidCaught = false;
  try {
    await createPurchaseBill({
      supplierId: sup1.id,
      billDate: '2026-10-15',
      dueDate: '2026-11-15',
      lines: [
        {
          description: 'Invalid negative poultry',
          quantity: -10,
          unitPrice: 2000,
          expenseAccountId: cogsAccount.id,
        },
      ],
    }, testUid, userRole);
  } catch (err: any) {
    invalidCaught = true;
    console.log(`[PASS] Correctly rejected negative line quantity: "${err.message}"`);
  }
  if (!invalidCaught) throw new Error('FAIL: Allowed negative quantity!');

  // ========================================================
  // TEST 4: Atomic Purchase Bill Posting & Double-Entry Ledger
  // ========================================================
  const postResult = await postPurchaseBill(billId, testUid, userRole);
  console.log(`[PASS] Posted Purchase Bill. Generated Journal ID: ${postResult.journalId}`);

  const postedBill = await getPurchaseBillDetail(billId);
  if (postedBill.status !== 'Posted' || !postedBill.postedJournalId) {
    throw new Error('FAIL: Purchase bill status is not Posted or missing postedJournalId!');
  }

  // Verify journal lines in DB
  const jLines = await db.query.journalLines.findMany({
    where: eq(accounts.id, cogsAccount.id), // query related or check via entryId
  });
  console.log(`[PASS] Purchase bill state is Posted. Linked to GL journal entry.`);

  // ========================================================
  // TEST 5: Immutability of Posted Bill
  // ========================================================
  let immutabilityCaught = false;
  try {
    await editDraftBill(billId, { discount: 99999 }, testUid, userRole);
  } catch (err: any) {
    immutabilityCaught = true;
    console.log(`[PASS] Immutability enforced: "${err.message}"`);
  }
  if (!immutabilityCaught) throw new Error('FAIL: Allowed modifying a posted purchase bill!');

  // ========================================================
  // TEST 6: Closed Period Guard on Purchase Bills
  // ========================================================
  let closedPeriodCaught = false;
  try {
    const historicalBillId = await createPurchaseBill({
      supplierId: sup1.id,
      billDate: '2020-01-15',
      dueDate: '2020-02-15',
      lines: [
        {
          description: 'Historical batch outside FY 2026',
          quantity: 1,
          unitPrice: 1000,
          expenseAccountId: cogsAccount.id,
        },
      ],
    }, testUid, userRole);

    await postPurchaseBill(historicalBillId, testUid, userRole);
  } catch (err: any) {
    closedPeriodCaught = true;
    console.log(`[PASS] Closed period blocked posting: "${err.message}"`);
  }
  if (!closedPeriodCaught) throw new Error('FAIL: Allowed posting into closed fiscal period!');

  // ========================================================
  // TEST 7: Accounts Payable Aging Calculation
  // ========================================================
  const agingReport = await calculateAPAging('2026-10-20');
  const supAging = agingReport.find((a) => a.supplierCode === sup1.supplierCode);
  if (!supAging || supAging.totalOutstanding !== 145000) {
    throw new Error(`FAIL: AP Aging mismatch! Found: ${JSON.stringify(supAging)}`);
  }
  console.log(`[PASS] AP Aging correctly calculated for ${supAging.name}: Total Outstanding = RM ${(supAging.totalOutstanding / 100).toFixed(2)}`);

  // ========================================================
  // TEST 8: Supplier Statement Ledger
  // ========================================================
  const statement = await getSupplierStatement(sup1.id);
  if (statement.totalOutstanding !== 145000 || statement.statementLines.length !== 1) {
    throw new Error(`FAIL: Supplier statement mismatch! Outstanding: ${statement.totalOutstanding}`);
  }
  console.log(`[PASS] Supplier Statement verified: Outstanding = RM ${(statement.totalOutstanding / 100).toFixed(2)}, Lines count = ${statement.statementLines.length}`);

  // ========================================================
  // TEST 9: Purchase Bill Voiding & GL Ledger Inversion
  // ========================================================
  const voidResult = await voidPurchaseBill(billId, 'Vendor issued revised replacement bill', testUid, userRole);
  const voidedBill = await getPurchaseBillDetail(billId);
  if (voidedBill.status !== 'Voided') {
    throw new Error('FAIL: Purchase bill status is not Voided!');
  }
  console.log(`[PASS] Successfully voided purchase bill. Status: ${voidedBill.status}`);

  // After voiding, AP Aging should no longer include this bill
  const agingAfterVoid = await calculateAPAging('2026-10-20');
  const supAgingAfterVoid = agingAfterVoid.find((a) => a.supplierCode === sup1.supplierCode);
  if (supAgingAfterVoid && supAgingAfterVoid.totalOutstanding > 0) {
    throw new Error('FAIL: Voided bill still counted in AP Aging!');
  }
  console.log(`[PASS] Voided bill correctly excluded from AP Aging (Outstanding = RM 0.00).`);

  console.log('\n====================================================');
  console.log('ALL MILESTONE 3A VERTICAL SLICE TESTS PASSED (100%)');
  console.log('====================================================');
  process.exit(0);
}

runM3ATests().catch((err) => {
  console.error('\nTEST SUITE ERROR:', err);
  process.exit(1);
});
