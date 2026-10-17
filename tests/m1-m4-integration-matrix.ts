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
  suppliers, 
  purchaseBills, 
  purchaseBillLines, 
  supplierPayments,
  supplierPaymentAllocations,
  expenses,
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../src/db/schema.ts';
import {
  postJournalEntry,
  voidJournalEntry,
  validateAccountingPeriod
} from '../src/services/accounting.ts';
import {
  createCustomer,
  updateCustomer,
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
  getInvoiceOutstandingBalance
} from '../src/services/paymentService.ts';
import {
  calculateARAging,
  getCustomerStatement,
  getOutstandingAR
} from '../src/services/arService.ts';
import {
  createSupplier,
} from '../src/services/supplierService.ts';
import {
  createPurchaseBill,
  postPurchaseBill,
  voidPurchaseBill,
  getPurchaseBillDetail
} from '../src/services/purchaseBillService.ts';
import {
  createSupplierPayment,
  postSupplierPayment,
  voidSupplierPayment,
  getBillOutstandingBalance
} from '../src/services/supplierPaymentService.ts';
import {
  calculateAPAging,
  getSupplierStatement,
  getOutstandingAP
} from '../src/services/apService.ts';
import {
  createExpense,
  postExpense,
  voidExpense,
  getExpenseDetail
} from '../src/services/expenseService.ts';
import { eq, and, desc, sql, asc, inArray, gte, lte } from 'drizzle-orm';

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

async function runCrossModuleIntegrationQA() {
  // Enforce rigid fail-closed safety guard before any database query or test execution
  await enforceConnectionSafety(db);

  console.log('========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — MILESTONES 1–4 FULL INTEGRATION QA MATRIX');
  console.log('PHASE 2: CROSS-MODULE END-TO-END EXECUTION WITH ISOLATED FIXTURES');
  console.log('========================================================================\n');

  const timestamp = Date.now().toString().slice(-6);

  // -------------------------------------------------------------------------
  // SECTION 0: PRE-FLIGHT ENVIRONMENT & DATA ISOLATION VERIFICATION
  // -------------------------------------------------------------------------
  console.log('>>> [PHASE 2.0] Pre-flight Environment & Data Isolation Checks...');

  // Check active DB connection
  const dbCheck = await db.execute(sql`SELECT current_database(), current_user, version();`);
  const activeDb = (dbCheck.rows[0] as any)?.current_database;
  const activeUser = (dbCheck.rows[0] as any)?.current_user;
  
  if (!activeDb || !activeUser) {
    record('ENV-01', 'Data Protection', 'Active Database Connection Identification', 'BLOCKED', 'Could not verify active database connection');
    console.error('Fatal: Cannot establish database connection.');
    process.exit(1);
  }
  record('ENV-01', 'Data Protection', 'Active Database Connection Identification', 'PASS', `Connected to database: '${activeDb}', user: '${activeUser}'`);

  // Ensure test actors exist
  const adminUid = 'admin-qa-uid';
  const accountantUid = 'accountant-qa-uid';
  const viewerUid = 'viewer-qa-uid';

  await db.insert(users).values([
    { uid: adminUid, email: 'admin@khairulfresh.com', name: 'Admin QA', role: 'Admin' },
    { uid: accountantUid, email: 'acc@khairulfresh.com', name: 'Accountant QA', role: 'Accountant' },
    { uid: viewerUid, email: 'viewer@khairulfresh.com', name: 'Viewer QA', role: 'Viewer' },
  ]).onConflictDoNothing();

  record('ENV-02', 'Data Protection', 'RBAC Actors Provisioning', 'PASS', `Confirmed Admin (${adminUid}), Accountant (${accountantUid}), and Viewer (${viewerUid}) exist`);

  // Fetch standard accounts
  const arAccounts = await db.select().from(accounts).where(eq(accounts.code, '1100'));
  const apAccounts = await db.select().from(accounts).where(eq(accounts.code, '2000'));
  const bankAccounts = await db.select().from(accounts).where(eq(accounts.code, '1010'));
  const salesRevAccounts = await db.select().from(accounts).where(eq(accounts.code, '4000'));
  const cogsAccounts = await db.select().from(accounts).where(eq(accounts.code, '5000'));
  const utilitiesAccounts = await db.select().from(accounts).where(eq(accounts.code, '5110'));

  if (!arAccounts[0] || !apAccounts[0] || !bankAccounts[0] || !salesRevAccounts[0] || !cogsAccounts[0] || !utilitiesAccounts[0]) {
    record('ENV-03', 'Data Protection', 'Chart of Accounts Baseline Readiness', 'BLOCKED', 'Required standard accounts missing from COA');
    process.exit(1);
  }
  record('ENV-03', 'Data Protection', 'Chart of Accounts Baseline Readiness', 'PASS', 'Verified accounts 1010 (Bank), 1100 (AR), 2000 (AP), 4000 (Sales), 5000 (COGS), 5110 (Utilities) active');

  // Verify FY 2026 open period
  const openPeriods = await db.select().from(accountingPeriods).where(and(
    lte(accountingPeriods.startDate, '2026-06-15'),
    gte(accountingPeriods.endDate, '2026-06-15'),
    eq(accountingPeriods.status, 'Open')
  ));
  if (openPeriods.length === 0) {
    record('ENV-04', 'Data Protection', 'Accounting Period Verification', 'BLOCKED', 'No Open accounting period covers 2026-06-15');
    process.exit(1);
  }
  record('ENV-04', 'Data Protection', 'Accounting Period Verification', 'PASS', `Target open period '${openPeriods[0].name}' active`);


  // -------------------------------------------------------------------------
  // SCENARIO 1: SALES INVOICE -> PARTIAL PAYMENT -> FULL SETTLEMENT -> RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 1] Sales Invoice -> Partial Payment -> Settlement -> AR & Ledger Reconciliation...');
  
  // 1.1 Create Isolated Customer
  const custCode = `INT-CUST-${timestamp}`;
  const cust = await createCustomer({
    customerCode: custCode,
    name: `Integration Test Customer ${timestamp}`,
    phone: '012-3456789',
    email: `cust-${timestamp}@test.com`
  }, adminUid, 'Admin');
  record('SCEN-1.1', 'Sales & AR', 'Create Isolated Customer', 'PASS', `Customer '${cust.name}' created with code '${custCode}' (id: ${cust.id})`);

  // 1.2 Create and Post Sales Invoice for RM 1,200.00 (120,000 cents)
  const invoiceDate = '2026-06-15';
  const invoiceDueDate = '2026-07-15';
  const invoiceAmount = 120000; // RM 1,200.00

  const invId = await createSalesInvoice({
    customerId: cust.id,
    invoiceDate,
    dueDate: invoiceDueDate,
    lines: [
      {
        description: 'Fresh Cavendish Bananas (20 boxes)',
        quantity: 20,
        unitPrice: 6000, // 20 * 6000 = 120,000 cents
        revenueAccountId: salesRevAccounts[0].id
      }
    ]
  }, accountantUid, 'Accountant');

  const invJournalId = await postSalesInvoice(invId, accountantUid, 'Accountant');
  record('SCEN-1.2', 'Sales & AR', 'Post Sales Invoice to Ledger', 'PASS', `Invoice ${invId} posted. Journal ${invJournalId} created`);

  // Verify invoice journal balance
  const invJournalLines = await db.select().from(journalLines).where(eq(journalLines.entryId, invJournalId));
  const invDebit = invJournalLines.reduce((s, l) => s + l.debit, 0);
  const invCredit = invJournalLines.reduce((s, l) => s + l.credit, 0);
  const isInvBalanced = invDebit === invCredit && invDebit === invoiceAmount;
  record('SCEN-1.3', 'Sales & AR', 'Sales Invoice Journal Parity', isInvBalanced ? 'PASS' : 'FAIL', 
    `Dr AR: ${invJournalLines.find(l => l.accountId === arAccounts[0].id)?.debit} cents, Cr Rev: ${invJournalLines.find(l => l.accountId === salesRevAccounts[0].id)?.credit} cents. Balanced: ${isInvBalanced}`);

  // 1.3 Verify Initial AR Outstanding is exactly 120,000 cents
  const initialBal = await getInvoiceOutstandingBalance(invId);
  record('SCEN-1.4', 'Sales & AR', 'Invoice Outstanding Balance Pre-Payment', initialBal === 120000 ? 'PASS' : 'FAIL',
    `Initial outstanding: ${initialBal} cents (Expected: 120000 cents)`);

  // 1.4 Partial Customer Payment: RM 500.00 (50,000 cents)
  const partialPaymentRef = `PAY-CUST-PART-${timestamp}`;
  const partPayId = await createCustomerPayment({
    customerId: cust.id,
    paymentDate: '2026-06-20',
    paymentReference: partialPaymentRef,
    amount: 50000,
    paymentAccountId: bankAccounts[0].id,
    status: 'Posted',
    allocations: [{ invoiceId: invId, amount: 50000 }]
  }, accountantUid, 'Accountant');

  const balAfterPart = await getInvoiceOutstandingBalance(invId);
  record('SCEN-1.5', 'Sales & AR', 'Partial Payment Allocation & Invoice Balance', balAfterPart === 70000 ? 'PASS' : 'FAIL',
    `Outstanding after RM 500.00 payment: ${balAfterPart} cents (Expected: 70000 cents)`);

  // Verify Customer Statement after partial payment
  const stmtAfterPart = await getCustomerStatement(cust.id);
  const stmtBalAfterPart = stmtAfterPart.totalOutstanding;
  record('SCEN-1.6', 'Sales & AR', 'Customer Statement Reconciliation (Partial)', stmtBalAfterPart === 70000 ? 'PASS' : 'FAIL',
    `Customer Statement outstanding: ${stmtBalAfterPart} cents (Expected: 70000 cents). Lines count: ${stmtAfterPart.statementLines.length}`);

  // 1.5 Full Settlement Customer Payment: RM 700.00 (70,000 cents)
  const fullPaymentRef = `PAY-CUST-FULL-${timestamp}`;
  const fullPayId = await createCustomerPayment({
    customerId: cust.id,
    paymentDate: '2026-06-25',
    paymentReference: fullPaymentRef,
    amount: 70000,
    paymentAccountId: bankAccounts[0].id,
    status: 'Posted',
    allocations: [{ invoiceId: invId, amount: 70000 }]
  }, accountantUid, 'Accountant');

  const balAfterFull = await getInvoiceOutstandingBalance(invId);
  record('SCEN-1.7', 'Sales & AR', 'Full Settlement & Invoice Balance Zeroing', balAfterFull === 0 ? 'PASS' : 'FAIL',
    `Outstanding after full settlement: ${balAfterFull} cents (Expected: 0 cents)`);

  // Verify Customer Statement after full settlement
  const stmtAfterFull = await getCustomerStatement(cust.id);
  const stmtBalAfterFull = stmtAfterFull.totalOutstanding;
  record('SCEN-1.8', 'Sales & AR', 'Customer Statement Reconciliation (Settled)', stmtBalAfterFull === 0 ? 'PASS' : 'FAIL',
    `Customer Statement outstanding: ${stmtBalAfterFull} cents (Expected: 0 cents)`);

  // Verify AR Aging has 0 outstanding for this customer
  const arAging = await calculateARAging('2026-07-01');
  const custAging = arAging.find(a => a.customerCode === custCode);
  const agingTotal = custAging ? custAging.totalOutstanding : 0;
  record('SCEN-1.9', 'Sales & AR', 'AR Aging Reconciliation (Fully Paid)', agingTotal === 0 ? 'PASS' : 'FAIL',
    `AR aging balance for ${custCode}: ${agingTotal} cents (Expected: 0 cents)`);


  // -------------------------------------------------------------------------
  // SCENARIO 2: PURCHASE BILL -> PARTIAL PAYMENT -> SETTLEMENT -> AP & LEDGER RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 2] Purchase Bill -> Partial Payment -> Settlement -> AP & Ledger Reconciliation...');

  // 2.1 Create Isolated Supplier
  const suppCode = `INT-SUPP-${timestamp}`;
  const supp = await createSupplier({
    supplierCode: suppCode,
    name: `Integration Test Supplier ${timestamp}`,
    phone: '019-8765432',
    email: `supp-${timestamp}@test.com`
  }, adminUid, 'Admin');
  record('SCEN-2.1', 'Purchase & AP', 'Create Isolated Supplier', 'PASS', `Supplier '${supp.name}' created with code '${suppCode}' (id: ${supp.id})`);

  // 2.2 Create and Post Purchase Bill for RM 2,000.00 (200,000 cents)
  const billDate = '2026-06-10';
  const billDueDate = '2026-07-10';
  const billAmount = 200000;

  const billId = await createPurchaseBill({
    supplierId: supp.id,
    supplierInvoiceNumber: `SUPP-INV-${timestamp}`,
    billDate,
    dueDate: billDueDate,
    lines: [
      {
        description: 'Grade A Cameron Highlands Tomatoes (50 crates)',
        quantity: 50,
        unitPrice: 4000, // 50 * 4000 = 200,000 cents
        expenseAccountId: cogsAccounts[0].id
      }
    ]
  }, accountantUid, 'Accountant');

  const billPostResult = await postPurchaseBill(billId, accountantUid, 'Accountant');
  const billJournalId = billPostResult.journalId;
  record('SCEN-2.2', 'Purchase & AP', 'Post Purchase Bill to Ledger', 'PASS', `Purchase Bill ${billId} posted. Journal ${billJournalId} created`);

  // Verify bill journal balance
  const billJournalLines = await db.select().from(journalLines).where(eq(journalLines.entryId, billJournalId));
  const billDebit = billJournalLines.reduce((s, l) => s + l.debit, 0);
  const billCredit = billJournalLines.reduce((s, l) => s + l.credit, 0);
  const isBillBalanced = billDebit === billCredit && billDebit === billAmount;
  record('SCEN-2.3', 'Purchase & AP', 'Purchase Bill Journal Parity', isBillBalanced ? 'PASS' : 'FAIL',
    `Dr COGS: ${billJournalLines.find(l => l.accountId === cogsAccounts[0].id)?.debit} cents, Cr AP: ${billJournalLines.find(l => l.accountId === apAccounts[0].id)?.credit} cents. Balanced: ${isBillBalanced}`);

  // 2.3 Verify Initial AP Outstanding is exactly 200,000 cents
  const initialBillBal = await getBillOutstandingBalance(billId);
  record('SCEN-2.4', 'Purchase & AP', 'Bill Outstanding Balance Pre-Payment', initialBillBal === 200000 ? 'PASS' : 'FAIL',
    `Initial outstanding: ${initialBillBal} cents (Expected: 200000 cents)`);

  // 2.4 Partial Supplier Payment: RM 800.00 (80,000 cents)
  const partialSuppPayRef = `PAY-SUPP-PART-${timestamp}`;
  const partSuppPayId = await createSupplierPayment({
    supplierId: supp.id,
    paymentDate: '2026-06-18',
    reference: partialSuppPayRef,
    amount: 80000,
    paymentAccountId: bankAccounts[0].id,
    status: 'Posted',
    allocations: [{ purchaseBillId: billId, amount: 80000 }]
  }, accountantUid, 'Accountant');

  const balBillAfterPart = await getBillOutstandingBalance(billId);
  record('SCEN-2.5', 'Purchase & AP', 'Partial Supplier Payment Allocation & Bill Balance', balBillAfterPart === 120000 ? 'PASS' : 'FAIL',
    `Outstanding after RM 800.00 payment: ${balBillAfterPart} cents (Expected: 120000 cents)`);

  // Verify Supplier Statement after partial payment
  const suppStmtAfterPart = await getSupplierStatement(supp.id);
  record('SCEN-2.6', 'Purchase & AP', 'Supplier Statement Reconciliation (Partial)', suppStmtAfterPart.totalOutstanding === 120000 ? 'PASS' : 'FAIL',
    `Supplier Statement outstanding: ${suppStmtAfterPart.totalOutstanding} cents (Expected: 120000 cents). Lines count: ${suppStmtAfterPart.statementLines.length}`);

  // 2.5 Full Settlement Supplier Payment: RM 1,200.00 (120,000 cents)
  const fullSuppPayRef = `PAY-SUPP-FULL-${timestamp}`;
  const fullSuppPayId = await createSupplierPayment({
    supplierId: supp.id,
    paymentDate: '2026-06-28',
    reference: fullSuppPayRef,
    amount: 120000,
    paymentAccountId: bankAccounts[0].id,
    status: 'Posted',
    allocations: [{ purchaseBillId: billId, amount: 120000 }]
  }, accountantUid, 'Accountant');

  const balBillAfterFull = await getBillOutstandingBalance(billId);
  record('SCEN-2.7', 'Purchase & AP', 'Full Settlement & Bill Balance Zeroing', balBillAfterFull === 0 ? 'PASS' : 'FAIL',
    `Outstanding after full settlement: ${balBillAfterFull} cents (Expected: 0 cents)`);

  // Verify Supplier Statement after full settlement
  const suppStmtAfterFull = await getSupplierStatement(supp.id);
  record('SCEN-2.8', 'Purchase & AP', 'Supplier Statement Reconciliation (Settled)', suppStmtAfterFull.totalOutstanding === 0 ? 'PASS' : 'FAIL',
    `Supplier Statement outstanding: ${suppStmtAfterFull.totalOutstanding} cents (Expected: 0 cents)`);

  // Verify AP Aging has 0 outstanding for this supplier
  const apAging = await calculateAPAging('2026-07-01');
  const suppAging = apAging.find(a => a.supplierCode === suppCode);
  const apAgingTotal = suppAging ? suppAging.totalOutstanding : 0;
  record('SCEN-2.9', 'Purchase & AP', 'AP Aging Reconciliation (Fully Paid)', apAgingTotal === 0 ? 'PASS' : 'FAIL',
    `AP aging balance for ${suppCode}: ${apAgingTotal} cents (Expected: 0 cents)`);


  // -------------------------------------------------------------------------
  // SCENARIO 3: DIRECT EXPENSE POSTING & CASH/BANK BALANCES
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 3] Direct Expense Management & Cash/Bank Balance Updates...');

  const expenseAmount = 35000; // RM 350.00
  const expenseDate = '2026-06-12';
  
  // Pre-expense balances from General Ledger
  const preBankLedger = await db.select({
    debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)::int`,
    credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(eq(journalLines.accountId, bankAccounts[0].id), eq(journalEntries.status, 'Posted')));

  const preUtilLedger = await db.select({
    debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)::int`,
    credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(eq(journalLines.accountId, utilitiesAccounts[0].id), eq(journalEntries.status, 'Posted')));

  const preBankNet = (preBankLedger[0]?.debit || 0) - (preBankLedger[0]?.credit || 0);
  const preUtilNet = (preUtilLedger[0]?.debit || 0) - (preUtilLedger[0]?.credit || 0);

  // 3.1 Create and Post Direct Expense
  const expRecord = await createExpense({
    expenseDate,
    description: `TNB Electricity Bill Payment ${timestamp}`,
    reference: `REC-TNB-${timestamp}`,
    expenseAccountId: utilitiesAccounts[0].id,
    paymentAccountId: bankAccounts[0].id,
    amount: expenseAmount,
    status: 'Posted',
    notes: 'Direct branch utility payment'
  }, accountantUid, 'Accountant');

  const expDetail = await getExpenseDetail(expRecord.id);
  record('SCEN-3.1', 'Direct Expenses', 'Post Direct Expense', expDetail.status === 'Posted' ? 'PASS' : 'FAIL',
    `Expense ${expDetail.expenseNumber} posted with status '${expDetail.status}'. Attached journal: ${expDetail.postedJournalId}`);

  // 3.2 Verify Journal Entry Parity
  const expJournalLines = await db.select().from(journalLines).where(eq(journalLines.entryId, expDetail.postedJournalId!));
  const expDebits = expJournalLines.reduce((s, l) => s + l.debit, 0);
  const expCredits = expJournalLines.reduce((s, l) => s + l.credit, 0);
  const isExpBalanced = expDebits === expCredits && expDebits === expenseAmount;
  record('SCEN-3.2', 'Direct Expenses', 'Expense Journal Atomic Parity', isExpBalanced ? 'PASS' : 'FAIL',
    `Dr Utilities (5110): ${expJournalLines.find(l => l.accountId === utilitiesAccounts[0].id)?.debit} cents, Cr Bank (1010): ${expJournalLines.find(l => l.accountId === bankAccounts[0].id)?.credit} cents`);

  // 3.3 Verify Impact on Cash/Bank and Expense Balances in Ledger
  const postBankLedger = await db.select({
    debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)::int`,
    credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(eq(journalLines.accountId, bankAccounts[0].id), eq(journalEntries.status, 'Posted')));

  const postUtilLedger = await db.select({
    debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)::int`,
    credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(eq(journalLines.accountId, utilitiesAccounts[0].id), eq(journalEntries.status, 'Posted')));

  const postBankNet = (postBankLedger[0]?.debit || 0) - (postBankLedger[0]?.credit || 0);
  const postUtilNet = (postUtilLedger[0]?.debit || 0) - (postUtilLedger[0]?.credit || 0);

  const bankDiff = postBankNet - preBankNet; // Should be -35,000 cents
  const utilDiff = postUtilNet - preUtilNet; // Should be +35,000 cents

  record('SCEN-3.3', 'Direct Expenses', 'Ledger Cash/Bank Reduction Verification', bankDiff === -expenseAmount ? 'PASS' : 'FAIL',
    `Maybank balance changed by ${bankDiff} cents (Expected: -${expenseAmount} cents)`);
  record('SCEN-3.4', 'Direct Expenses', 'Ledger Expense Account Increase Verification', utilDiff === expenseAmount ? 'PASS' : 'FAIL',
    `Utilities balance changed by +${utilDiff} cents (Expected: +${expenseAmount} cents)`);


  // -------------------------------------------------------------------------
  // SCENARIO 4: VOIDING POSTED TRANSACTION & COMPENSATING REVERSAL POLICY
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 4] Voiding Posted Transaction & Audit Trail Reversal Policy...');

  // Create and post a standalone expense to void
  const voidExpAmount = 15000; // RM 150.00
  const voidExpRecord = await createExpense({
    expenseDate: '2026-06-14',
    description: `Stationery to be voided ${timestamp}`,
    reference: `REC-VOID-${timestamp}`,
    expenseAccountId: utilitiesAccounts[0].id,
    paymentAccountId: bankAccounts[0].id,
    amount: voidExpAmount,
    status: 'Posted'
  }, accountantUid, 'Accountant');

  const voidExpDetail = await getExpenseDetail(voidExpRecord.id);
  const originalExpJournalId = voidExpDetail.postedJournalId!;

  // 4.1 Void the Expense
  const voidResult = await voidExpense(voidExpRecord.id, 'Duplicate submission by staff', adminUid, 'Admin');
  const reversalJournalId = voidResult.reversalJournalId;
  record('SCEN-4.1', 'Reversal & Voiding', 'Execute Void on Posted Transaction', 'PASS', 
    `Expense ${voidExpDetail.expenseNumber} voided. Reversal journal ${reversalJournalId} created`);

  // 4.2 Verify original journal preserved as Voided and compensating journal posted
  const origJournal = await db.select().from(journalEntries).where(eq(journalEntries.id, originalExpJournalId));
  const revJournal = await db.select().from(journalEntries).where(eq(journalEntries.id, reversalJournalId));
  
  const isOrigPreserved = origJournal[0].status === 'Voided';
  const isRevPosted = revJournal[0].status === 'Posted';
  record('SCEN-4.2', 'Reversal & Voiding', 'Preservation of Original Journal & Compensation Journal', 
    isOrigPreserved && isRevPosted ? 'PASS' : 'FAIL',
    `Original journal status: '${origJournal[0].status}'. Compensating journal status: '${revJournal[0].status}'`);

  // 4.3 Inverted lines verification
  const origLines = await db.select().from(journalLines).where(eq(journalLines.entryId, originalExpJournalId));
  const revLines = await db.select().from(journalLines).where(eq(journalLines.entryId, reversalJournalId));

  const origUtilDebit = origLines.find(l => l.accountId === utilitiesAccounts[0].id)?.debit || 0;
  const revUtilCredit = revLines.find(l => l.accountId === utilitiesAccounts[0].id)?.credit || 0;
  const origBankCredit = origLines.find(l => l.accountId === bankAccounts[0].id)?.credit || 0;
  const revBankDebit = revLines.find(l => l.accountId === bankAccounts[0].id)?.debit || 0;

  const isInversionCorrect = origUtilDebit === revUtilCredit && origBankCredit === revBankDebit;
  record('SCEN-4.3', 'Reversal & Voiding', 'Inverted Debits & Credits Parity', isInversionCorrect ? 'PASS' : 'FAIL',
    `Orig: Dr Util ${origUtilDebit}, Cr Bank ${origBankCredit}. Reversal: Cr Util ${revUtilCredit}, Dr Bank ${revBankDebit}`);

  // 4.4 Net accounting impact zeroed out
  const combinedUtilNet = (origUtilDebit - (origLines.find(l => l.accountId === utilitiesAccounts[0].id)?.credit || 0)) +
                          ((revLines.find(l => l.accountId === utilitiesAccounts[0].id)?.debit || 0) - revUtilCredit);
  record('SCEN-4.4', 'Reversal & Voiding', 'Net Financial Impact Zeroing', combinedUtilNet === 0 ? 'PASS' : 'FAIL',
    `Cumulative net change across original and reversal: ${combinedUtilNet} cents`);


  // -------------------------------------------------------------------------
  // SCENARIO 5: ATOMIC TRANSACTION ROLLBACK ON FAILED POSTING
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 5] Atomic Rollback On Failed Posting (Zero Orphans)...');

  // Count existing journals and lines before failed post
  const preEntryCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalEntries))[0].count;
  const preLineCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalLines))[0].count;

  let rollbackPassed = false;
  try {
    await db.transaction(async (tx) => {
      // Step A: Post journal entry inside tx
      await postJournalEntry({
        entryDate: '2026-06-16',
        description: 'Temporary Test Journal destined for rollback',
        lines: [
          { accountId: utilitiesAccounts[0].id, debit: 5000, credit: 0 },
          { accountId: bankAccounts[0].id, debit: 0, credit: 5000 }
        ]
      }, accountantUid, 'Accountant', tx);

      // Step B: Simulate crash / failure
      throw new Error("SIMULATED_DATABASE_FAILURE_AFTER_PARTIAL_MUTATION");
    });
  } catch (err: any) {
    if (err.message.includes("SIMULATED_DATABASE_FAILURE_AFTER_PARTIAL_MUTATION")) {
      rollbackPassed = true;
    }
  }

  const postEntryCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalEntries))[0].count;
  const postLineCount = (await db.select({ count: sql<number>`count(*)::int` }).from(journalLines))[0].count;

  const noOrphans = preEntryCount === postEntryCount && preLineCount === postLineCount;
  record('SCEN-5.1', 'Atomicity & Rollback', 'Transaction Rollback on Failure', rollbackPassed ? 'PASS' : 'FAIL',
    'Exception successfully triggered during posting phase');
  record('SCEN-5.2', 'Atomicity & Rollback', 'Zero Orphan Records in General Ledger', noOrphans ? 'PASS' : 'FAIL',
    `Entries: ${preEntryCount} -> ${postEntryCount}. Lines: ${preLineCount} -> ${postLineCount}. Zero orphan records left.`);


  // -------------------------------------------------------------------------
  // SCENARIO 6: CLOSED ACCOUNTING PERIOD CONTROLS
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 6] Closed Accounting Period Boundary Enforcement...');

  // FY 2025 is Closed in the database (2025-01-01 to 2025-12-31)
  const closedPeriodDate = '2025-06-15';
  let closedPeriodBlocked = false;
  let closedErrorMsg = '';

  try {
    await postJournalEntry({
      entryDate: closedPeriodDate,
      description: 'Posting attempt into closed period FY 2025',
      lines: [
        { accountId: utilitiesAccounts[0].id, debit: 1000, credit: 0 },
        { accountId: bankAccounts[0].id, debit: 0, credit: 1000 }
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    closedPeriodBlocked = true;
    closedErrorMsg = err.message;
  }

  const hasClosedKeyword = closedErrorMsg.includes('Closed') || closedErrorMsg.includes('blocked');
  record('SCEN-6.1', 'Period Governance', 'Block Posting in Closed Accounting Period', 
    closedPeriodBlocked && hasClosedKeyword ? 'PASS' : 'FAIL',
    `Posting rejected as expected: "${closedErrorMsg}"`);

  // Undefined future period check
  let undefinedPeriodBlocked = false;
  let undefErrorMsg = '';
  try {
    await postJournalEntry({
      entryDate: '2099-01-01',
      description: 'Posting attempt into undefined period 2099',
      lines: [
        { accountId: utilitiesAccounts[0].id, debit: 1000, credit: 0 },
        { accountId: bankAccounts[0].id, debit: 0, credit: 1000 }
      ]
    }, accountantUid, 'Accountant');
  } catch (err: any) {
    undefinedPeriodBlocked = true;
    undefErrorMsg = err.message;
  }
  record('SCEN-6.2', 'Period Governance', 'Block Posting in Undefined Accounting Period',
    undefinedPeriodBlocked ? 'PASS' : 'FAIL',
    `Posting rejected as expected: "${undefErrorMsg}"`);


  // -------------------------------------------------------------------------
  // SCENARIO 7: VIEWER RESTRICTIONS & AUDIT TRAIL COVERAGE
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 7] RBAC Viewer Mutation Restrictions & Audit Trail Logging...');

  // 7.1 Viewer cannot create Sales Invoices
  let viewerCreateInvBlocked = false;
  try {
    await createSalesInvoice({
      customerId: cust.id,
      invoiceDate: '2026-06-15',
      dueDate: '2026-07-15',
      lines: [{ description: 'Test item', quantity: 1, unitPrice: 1000, revenueAccountId: salesRevAccounts[0].id }]
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerCreateInvBlocked = err.message.includes('Unauthorized');
  }
  record('SCEN-7.1', 'Security & RBAC', 'Viewer Blocked from Creating Sales Invoices', viewerCreateInvBlocked ? 'PASS' : 'FAIL',
    'Viewer mutation rejected with Unauthorized error');

  // 7.2 Viewer cannot record Customer Payments
  let viewerPayBlocked = false;
  try {
    await createCustomerPayment({
      customerId: cust.id,
      paymentDate: '2026-06-15',
      paymentReference: 'VIEWER-PAY',
      amount: 1000,
      paymentAccountId: bankAccounts[0].id
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerPayBlocked = err.message.includes('Unauthorized');
  }
  record('SCEN-7.2', 'Security & RBAC', 'Viewer Blocked from Recording Customer Payments', viewerPayBlocked ? 'PASS' : 'FAIL',
    'Viewer payment mutation rejected with Unauthorized error');

  // 7.3 Viewer cannot create Purchase Bills
  let viewerBillBlocked = false;
  try {
    await createPurchaseBill({
      supplierId: supp.id,
      billDate: '2026-06-15',
      dueDate: '2026-07-15',
      lines: [{ description: 'Test item', quantity: 1, unitPrice: 1000, expenseAccountId: cogsAccounts[0].id }]
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerBillBlocked = err.message.includes('Unauthorized');
  }
  record('SCEN-7.3', 'Security & RBAC', 'Viewer Blocked from Creating Purchase Bills', viewerBillBlocked ? 'PASS' : 'FAIL',
    'Viewer bill mutation rejected with Unauthorized error');

  // 7.4 Viewer cannot record Supplier Payments
  let viewerSuppPayBlocked = false;
  try {
    await createSupplierPayment({
      supplierId: supp.id,
      paymentDate: '2026-06-15',
      amount: 1000,
      paymentAccountId: bankAccounts[0].id
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerSuppPayBlocked = err.message.includes('Unauthorized');
  }
  record('SCEN-7.4', 'Security & RBAC', 'Viewer Blocked from Recording Supplier Payments', viewerSuppPayBlocked ? 'PASS' : 'FAIL',
    'Viewer supplier payment mutation rejected with Unauthorized error');

  // 7.5 Viewer cannot create Direct Expenses
  let viewerExpBlocked = false;
  try {
    await createExpense({
      expenseDate: '2026-06-15',
      description: 'Viewer expense attempt',
      expenseAccountId: utilitiesAccounts[0].id,
      paymentAccountId: bankAccounts[0].id,
      amount: 1000
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerExpBlocked = err.message.includes('Unauthorized');
  }
  record('SCEN-7.5', 'Security & RBAC', 'Viewer Blocked from Creating Expenses', viewerExpBlocked ? 'PASS' : 'FAIL',
    'Viewer expense creation rejected with Unauthorized error');

  // 7.6 Viewer cannot post manual journal entries
  let viewerJournalBlocked = false;
  try {
    await postJournalEntry({
      entryDate: '2026-06-15',
      description: 'Viewer manual journal attempt',
      lines: [
        { accountId: utilitiesAccounts[0].id, debit: 1000, credit: 0 },
        { accountId: bankAccounts[0].id, debit: 0, credit: 1000 }
      ]
    }, viewerUid, 'Viewer');
  } catch (err: any) {
    viewerJournalBlocked = err.message.includes('Unauthorized');
  }
  record('SCEN-7.6', 'Security & RBAC', 'Viewer Blocked from Posting Manual Journals', viewerJournalBlocked ? 'PASS' : 'FAIL',
    'Viewer manual journal rejected with Unauthorized error');

  // 7.7 Verify Comprehensive Audit Trail Coverage across all mutated entities
  const sampleAuditLogs = await db.select({
    action: auditLogs.action,
    tableName: auditLogs.tableName,
    userId: auditLogs.userId
  })
  .from(auditLogs)
  .where(inArray(auditLogs.action, [
    'CREATE_CUSTOMER',
    'POST_INVOICE',
    'POST_PAYMENT',
    'CREATE_SUPPLIER',
    'BILL_POST',
    'SUPPLIER_PAYMENT_CREATE',
    'EXPENSE_CREATE',
    'EXPENSE_CREATE_AND_POST',
    'EXPENSE_VOID',
    'POST_JOURNAL'
  ]))
  .orderBy(desc(auditLogs.timestamp))
  .limit(50);

  const distinctActions = new Set(sampleAuditLogs.map(a => a.action));
  const hasExpectedActions = distinctActions.has('POST_INVOICE') && 
                             distinctActions.has('POST_PAYMENT') &&
                             distinctActions.has('BILL_POST') &&
                             distinctActions.has('SUPPLIER_PAYMENT_CREATE') &&
                             (distinctActions.has('EXPENSE_CREATE') || distinctActions.has('EXPENSE_CREATE_AND_POST')) &&
                             distinctActions.has('EXPENSE_VOID');

  record('SCEN-7.7', 'Audit Trail', 'Cross-Module Mutation Audit Trail Verification', hasExpectedActions ? 'PASS' : 'FAIL',
    `Verified audit actions logged: ${Array.from(distinctActions).join(', ')}`);


  // -------------------------------------------------------------------------
  // SCENARIO 8: COMPREHENSIVE TRIAL BALANCE VS GENERAL LEDGER RECONCILIATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SCENARIO 8] Global Ledger Integrity: Trial Balance vs General Ledger Parity...');

  // 8.1 Reconcile every Posted Journal Entry in the entire system (Parity check)
  const allPostedJournals = await db.select({
    id: journalEntries.id,
    entryDate: journalEntries.entryDate,
    reference: journalEntries.reference
  })
  .from(journalEntries)
  .where(eq(journalEntries.status, 'Posted'));

  const allLines = await db.select({
    entryId: journalLines.entryId,
    debit: journalLines.debit,
    credit: journalLines.credit
  }).from(journalLines);

  const entryLinesMap = new Map<string, { debit: number; credit: number }>();
  for (const line of allLines) {
    if (!entryLinesMap.has(line.entryId)) {
      entryLinesMap.set(line.entryId, { debit: 0, credit: 0 });
    }
    const item = entryLinesMap.get(line.entryId)!;
    item.debit += line.debit;
    item.credit += line.credit;
  }

  let totalSystemDebit = 0;
  let totalSystemCredit = 0;
  let unbalancedJournalsCount = 0;

  for (const j of allPostedJournals) {
    const sums = entryLinesMap.get(j.id) || { debit: 0, credit: 0 };
    totalSystemDebit += sums.debit;
    totalSystemCredit += sums.credit;
    if (sums.debit !== sums.credit) {
      unbalancedJournalsCount++;
    }
  }

  const isGlobalJournalParityMaintained = unbalancedJournalsCount === 0 && totalSystemDebit === totalSystemCredit;
  record('SCEN-8.1', 'Ledger Integrity', 'All Posted Journals Debit-Credit Parity', isGlobalJournalParityMaintained ? 'PASS' : 'FAIL',
    `Checked ${allPostedJournals.length} posted journals. Unbalanced: ${unbalancedJournalsCount}. Total Debits: ${totalSystemDebit} cents, Total Credits: ${totalSystemCredit} cents. Difference: ${totalSystemDebit - totalSystemCredit} cents`);

  // 8.2 Compute Trial Balance over FY 2026
  const aggregates2026 = await db.select({
    accountId: journalLines.accountId,
    totalDebit: sql<number>`sum(${journalLines.debit})::int`,
    totalCredit: sql<number>`sum(${journalLines.credit})::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(
    eq(journalEntries.status, 'Posted'),
    gte(journalEntries.entryDate, '2026-01-01'),
    lte(journalEntries.entryDate, '2026-12-31')
  ))
  .groupBy(journalLines.accountId);

  const allDbAccounts = await db.select().from(accounts).orderBy(asc(accounts.code));
  const aggLookup = new Map(aggregates2026.map(a => [a.accountId, a]));

  let tbTotalDebits = 0;
  let tbTotalCredits = 0;
  let tbMismatches = 0;

  for (const acc of allDbAccounts) {
    const agg = aggLookup.get(acc.id) || { totalDebit: 0, totalCredit: 0 };
    let debitBal = 0;
    let creditBal = 0;

    if (acc.normalBalance === 'Debit') {
      const net = agg.totalDebit - agg.totalCredit;
      if (net >= 0) debitBal = net;
      else creditBal = Math.abs(net);
    } else {
      const net = agg.totalCredit - agg.totalDebit;
      if (net >= 0) creditBal = net;
      else debitBal = Math.abs(net);
    }

    tbTotalDebits += debitBal;
    tbTotalCredits += creditBal;

    // Cross-verify with General Ledger running balance calculation for each account
    const glLines = await db.select({
      debit: journalLines.debit,
      credit: journalLines.credit
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(
      eq(journalLines.accountId, acc.id),
      eq(journalEntries.status, 'Posted'),
      gte(journalEntries.entryDate, '2026-01-01'),
      lte(journalEntries.entryDate, '2026-12-31')
    ));

    const glDebits = glLines.reduce((s, l) => s + l.debit, 0);
    const glCredits = glLines.reduce((s, l) => s + l.credit, 0);

    let glExpectedNet = 0;
    if (acc.normalBalance === 'Debit') {
      glExpectedNet = glDebits - glCredits;
    } else {
      glExpectedNet = glCredits - glDebits;
    }

    const tbExpectedNet = acc.normalBalance === 'Debit' ? (debitBal - creditBal) : (creditBal - debitBal);
    if (glExpectedNet !== tbExpectedNet) {
      tbMismatches++;
    }
  }

  const isTbBalanced = tbTotalDebits === tbTotalCredits;
  const isGlReconciled = tbMismatches === 0;

  record('SCEN-8.2', 'Ledger Integrity', 'Trial Balance Total Parity (FY 2026)', isTbBalanced ? 'PASS' : 'FAIL',
    `Trial Balance Total Debits: ${tbTotalDebits} cents (RM ${(tbTotalDebits/100).toFixed(2)}), Total Credits: ${tbTotalCredits} cents (RM ${(tbTotalCredits/100).toFixed(2)}). Parity difference: ${Math.abs(tbTotalDebits - tbTotalCredits)} cents`);

  record('SCEN-8.3', 'Ledger Integrity', 'Trial Balance vs General Ledger Reconciliation', isGlReconciled ? 'PASS' : 'FAIL',
    `Reconciled ${allDbAccounts.length} Chart of Accounts entities against General Ledger running balances. Mismatches: ${tbMismatches}`);


  // -------------------------------------------------------------------------
  // FINAL REPORT & SUMMARY TABLE
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('KHAIRUL FRESH ACCOUNTING — INTEGRATION QA SUMMARY REPORT');
  console.log('========================================================================');

  const total = testResults.length;
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  const blocked = testResults.filter(r => r.status === 'BLOCKED').length;

  console.log(`\nTOTAL SCENARIOS EXECUTED: ${total}`);
  console.log(`PASSED:                   ${passed}`);
  console.log(`FAILED:                   ${failed}`);
  console.log(`BLOCKED:                  ${blocked}`);
  console.log(`EXIT CODE:                ${failed > 0 || blocked > 0 ? 1 : 0}\n`);

  if (failed > 0 || blocked > 0) {
    console.error('CRITICAL: One or more integration tests failed or were blocked!');
    process.exit(1);
  } else {
    console.log('🎉 ALL CROSS-MODULE INTEGRATION TESTS PASSED WITH 100% SUCCESS.');
    process.exit(0);
  }
}

runCrossModuleIntegrationQA().catch((err) => {
  console.error("Unhandled integration test exception:", err);
  process.exit(1);
});
