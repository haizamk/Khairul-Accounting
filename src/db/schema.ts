import { pgTable, uuid, text, integer, date, timestamp, boolean, jsonb, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Single Company Profile Configuration (Representing Khairul Fresh Food)
export const companyProfile = pgTable('company_profile', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  registeredName: text('registered_name'),
  registrationNumber: text('registration_number').notNull(),
  address: text('address').notNull(),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  taxNumber: text('tax_number'),
  financialYearStart: text('financial_year_start').default('01-01').notNull(), // MM-DD format
  currency: text('currency').default('MYR').notNull(),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. User Accounts - Uses the Firebase UID string as the primary reference identifier (uid)
export const users = pgTable('users', {
  uid: text('uid').primaryKey(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // 'Admin' | 'Accountant' | 'Viewer'
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Chart of Accounts
export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(), // e.g., '1000', '2000'
  name: text('name').notNull(),
  type: text('type').notNull(), // 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  subType: text('sub_type').notNull(), // e.g., 'CashBox', 'Checking', 'AccountsReceivable', 'AccountsPayable', 'SalesRevenue', 'GeneralExpense'
  normalBalance: text('normal_balance').notNull(), // 'Debit' | 'Credit'
  parentId: uuid('parent_id'), // Hierarchy support
  active: boolean('active').default(true).notNull(),
});

// 4. Accounting Periods
export const accountingPeriods = pgTable('accounting_periods', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(), // e.g., "October 2026", "FY 2026"
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: text('status').default('Open').notNull(), // 'Open' | 'Closed'
});

// 5. Derived Account Balances Cache (Derived from General Ledger but snapshotted for performance)
export const accountBalances = pgTable('account_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(),
  periodId: uuid('period_id')
    .references(() => accountingPeriods.id, { onDelete: 'restrict' })
    .notNull(),
  openingBalance: integer('opening_balance').default(0).notNull(), // stored in cents
  closingBalance: integer('closing_balance').default(0).notNull(), // stored in cents
});

// 6. General Ledger Journal Entries
export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryDate: date('entry_date').notNull(), // date the transaction occurred
  postingDate: date('posting_date').notNull(), // date of ledger commitment
  reference: text('reference'), // receipt number, invoice reference
  description: text('description').notNull(),
  status: text('status').default('Posted').notNull(), // 'Draft' | 'Posted' | 'Voided'
  voidedAt: timestamp('voided_at'),
  voidedBy: text('voided_by').references(() => users.uid, { onDelete: 'restrict' }),
  voidReason: text('void_reason'),
  createdBy: text('created_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. General Ledger Journal Lines
export const journalLines = pgTable('journal_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryId: uuid('entry_id')
    .references(() => journalEntries.id, { onDelete: 'cascade' })
    .notNull(),
  accountId: uuid('account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(),
  debit: integer('debit').default(0).notNull(), // Stored in cents (e.g. RM 100.50 -> 10050)
  credit: integer('credit').default(0).notNull(), // Stored in cents
  description: text('description'),
});

// 8. System Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  action: text('action').notNull(), // e.g. 'LOGIN', 'POST_JOURNAL', 'CREATE_ACCOUNT'
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(), // Stringified UUID or key
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// 9. Customer Profiles (Milestone 2A Addition)
export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerCode: text('customer_code').notNull().unique(), // Unique Code
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 10. Sales Invoices Documents (Milestone 2A Addition)
export const salesInvoices = pgTable('sales_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(), // Server-generated unique sequential numbering
  customerId: uuid('customer_id')
    .references(() => customers.id, { onDelete: 'restrict' })
    .notNull(),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date').notNull(),
  status: text('status').default('Draft').notNull(), // 'Draft' | 'Posted' | 'Voided'
  subtotal: integer('subtotal').default(0).notNull(), // In cents
  discount: integer('discount').default(0).notNull(), // In cents
  total: integer('total').default(0).notNull(), // In cents
  postedJournalId: uuid('posted_journal_id').references(() => journalEntries.id, { onDelete: 'restrict' }),
  createdBy: text('created_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 11. Sales Invoice Lines (Milestone 2A Addition)
export const salesInvoiceLines = pgTable('sales_invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id')
    .references(() => salesInvoices.id, { onDelete: 'cascade' })
    .notNull(),
  description: text('description').notNull(),
  quantity: doublePrecision('quantity').notNull(), // Floating precision for non-integer units
  unitPrice: integer('unit_price').notNull(), // stored in cents
  lineTotal: integer('line_total').notNull(), // stored in cents
  revenueAccountId: uuid('revenue_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(),
});

// Relations Definitions for Drizzle ORM
export const accountsRelations = relations(accounts, ({ one, many }) => ({
  parent: one(accounts, {
    fields: [accounts.parentId],
    references: [accounts.id],
    relationName: 'accountHierarchy',
  }),
  children: many(accounts, {
    relationName: 'accountHierarchy',
  }),
  journalLines: many(journalLines),
  balances: many(accountBalances),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  creator: one(users, {
    fields: [journalEntries.createdBy],
    references: [users.uid],
  }),
  lines: many(journalLines),
}));

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  entry: one(journalEntries, {
    fields: [journalLines.entryId],
    references: [journalEntries.id],
  }),
  account: one(accounts, {
    fields: [journalLines.accountId],
    references: [accounts.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  invoices: many(salesInvoices),
  payments: many(customerPayments),
}));

export const salesInvoicesRelations = relations(salesInvoices, ({ one, many }) => ({
  customer: one(customers, {
    fields: [salesInvoices.customerId],
    references: [customers.id],
  }),
  lines: many(salesInvoiceLines),
  journal: one(journalEntries, {
    fields: [salesInvoices.postedJournalId],
    references: [journalEntries.id],
  }),
  allocations: many(paymentAllocations),
}));

export const salesInvoiceLinesRelations = relations(salesInvoiceLines, ({ one }) => ({
  invoice: one(salesInvoices, {
    fields: [salesInvoiceLines.invoiceId],
    references: [salesInvoices.id],
  }),
  revenueAccount: one(accounts, {
    fields: [salesInvoiceLines.revenueAccountId],
    references: [accounts.id],
  }),
}));

// 12. Customer Payments Document Table
export const customerPayments = pgTable('customer_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id')
    .references(() => customers.id, { onDelete: 'restrict' })
    .notNull(),
  paymentDate: date('payment_date').notNull(),
  paymentReference: text('payment_reference').notNull(), // Receipt number, Cheque number, Bank transfer ref
  amount: integer('amount').notNull(), // Stored in cents
  paymentAccountId: uuid('payment_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(), // Bank or cash account being debited
  notes: text('notes'),
  status: text('status').default('Draft').notNull(), // 'Draft' | 'Posted' | 'Voided'
  postedJournalId: uuid('posted_journal_id').references(() => journalEntries.id, { onDelete: 'restrict' }),
  createdBy: text('created_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 13. Customer Payments Invoices Allocations Table
export const paymentAllocations = pgTable('payment_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id')
    .references(() => customerPayments.id, { onDelete: 'cascade' })
    .notNull(),
  invoiceId: uuid('invoice_id')
    .references(() => salesInvoices.id, { onDelete: 'restrict' })
    .notNull(),
  amount: integer('amount').notNull(), // Mapped amount in cents (e.g. RM 50.00 allocated -> 5000)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 14. Supplier Profiles (Milestone 3A Addition)
export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplierCode: text('supplier_code').notNull().unique(), // Unique Code, e.g. SUP-001
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  paymentTerms: text('payment_terms').default('Net 30').notNull(),
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 15. Purchase Bills Documents (Milestone 3A Addition)
export const purchaseBills = pgTable('purchase_bills', {
  id: uuid('id').defaultRandom().primaryKey(),
  billNumber: text('bill_number').notNull().unique(), // Sequential bill number e.g. BILL-2026-000001
  supplierId: uuid('supplier_id')
    .references(() => suppliers.id, { onDelete: 'restrict' })
    .notNull(),
  supplierInvoiceNumber: text('supplier_invoice_number'), // External invoice / receipt ref from vendor
  billDate: date('bill_date').notNull(),
  dueDate: date('due_date').notNull(),
  status: text('status').default('Draft').notNull(), // 'Draft' | 'Posted' | 'Voided'
  subtotal: integer('subtotal').default(0).notNull(), // In cents
  discount: integer('discount').default(0).notNull(), // In cents
  total: integer('total').default(0).notNull(), // In cents
  postedJournalId: uuid('posted_journal_id').references(() => journalEntries.id, { onDelete: 'restrict' }),
  createdBy: text('created_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 16. Purchase Bill Lines (Milestone 3A Addition)
export const purchaseBillLines = pgTable('purchase_bill_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  billId: uuid('bill_id')
    .references(() => purchaseBills.id, { onDelete: 'cascade' })
    .notNull(),
  description: text('description').notNull(),
  quantity: doublePrecision('quantity').notNull(), // Supports fractional units (e.g. 12.5 kg)
  unitPrice: integer('unit_price').notNull(), // in cents
  lineTotal: integer('line_total').notNull(), // in cents
  expenseAccountId: uuid('expense_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(),
});

// Relations for payments and allocations
export const customerPaymentsRelations = relations(customerPayments, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerPayments.customerId],
    references: [customers.id],
  }),
  paymentAccount: one(accounts, {
    fields: [customerPayments.paymentAccountId],
    references: [accounts.id],
  }),
  allocations: many(paymentAllocations),
  journal: one(journalEntries, {
    fields: [customerPayments.postedJournalId],
    references: [journalEntries.id],
  }),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(customerPayments, {
    fields: [paymentAllocations.paymentId],
    references: [customerPayments.id],
  }),
  invoice: one(salesInvoices, {
    fields: [paymentAllocations.invoiceId],
    references: [salesInvoices.id],
  }),
}));

// 17. Supplier Payments Document Table (Milestone 3B Addition)
export const supplierPayments = pgTable('supplier_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentNumber: text('payment_number').notNull().unique(), // Sequential code e.g. SPAY-2026-000001
  supplierId: uuid('supplier_id')
    .references(() => suppliers.id, { onDelete: 'restrict' })
    .notNull(),
  paymentDate: date('payment_date').notNull(),
  amount: integer('amount').notNull(), // stored in integer cents
  paymentAccountId: uuid('payment_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(), // Cash or Bank asset account credited
  reference: text('reference'), // Cheque number, wire transfer reference, bank receipt
  notes: text('notes'),
  status: text('status').default('Draft').notNull(), // 'Draft' | 'Posted' | 'Voided'
  postedJournalId: uuid('posted_journal_id').references(() => journalEntries.id, { onDelete: 'restrict' }),
  createdBy: text('created_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  voidReason: text('void_reason'),
});

// 18. Supplier Payment Allocations Table (Milestone 3B Addition)
export const supplierPaymentAllocations = pgTable('supplier_payment_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id')
    .references(() => supplierPayments.id, { onDelete: 'cascade' })
    .notNull(),
  purchaseBillId: uuid('purchase_bill_id')
    .references(() => purchaseBills.id, { onDelete: 'restrict' })
    .notNull(),
  amount: integer('amount').notNull(), // Allocated amount in cents
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  bills: many(purchaseBills),
  payments: many(supplierPayments),
}));

export const purchaseBillsRelations = relations(purchaseBills, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchaseBills.supplierId],
    references: [suppliers.id],
  }),
  lines: many(purchaseBillLines),
  journal: one(journalEntries, {
    fields: [purchaseBills.postedJournalId],
    references: [journalEntries.id],
  }),
  allocations: many(supplierPaymentAllocations),
}));

export const purchaseBillLinesRelations = relations(purchaseBillLines, ({ one }) => ({
  bill: one(purchaseBills, {
    fields: [purchaseBillLines.billId],
    references: [purchaseBills.id],
  }),
  expenseAccount: one(accounts, {
    fields: [purchaseBillLines.expenseAccountId],
    references: [accounts.id],
  }),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [supplierPayments.supplierId],
    references: [suppliers.id],
  }),
  paymentAccount: one(accounts, {
    fields: [supplierPayments.paymentAccountId],
    references: [accounts.id],
  }),
  allocations: many(supplierPaymentAllocations),
  journal: one(journalEntries, {
    fields: [supplierPayments.postedJournalId],
    references: [journalEntries.id],
  }),
}));

export const supplierPaymentAllocationsRelations = relations(supplierPaymentAllocations, ({ one }) => ({
  payment: one(supplierPayments, {
    fields: [supplierPaymentAllocations.paymentId],
    references: [supplierPayments.id],
  }),
  bill: one(purchaseBills, {
    fields: [supplierPaymentAllocations.purchaseBillId],
    references: [purchaseBills.id],
  }),
}));

// 19. Direct Expenses (Milestone 4 Addition)
export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  expenseNumber: text('expense_number').notNull().unique(), // e.g. EXP-2026-000001
  expenseDate: date('expense_date').notNull(),
  description: text('description').notNull(),
  reference: text('reference'), // Receipt number, scan ref, external note
  expenseAccountId: uuid('expense_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(),
  paymentAccountId: uuid('payment_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(), // Asset account (Cash or Bank)
  amount: integer('amount').notNull(), // stored in integer cents
  notes: text('notes'),
  status: text('status').default('Draft').notNull(), // 'Draft' | 'Posted' | 'Voided'
  postedJournalId: uuid('posted_journal_id').references(() => journalEntries.id, { onDelete: 'restrict' }),
  reversalJournalId: uuid('reversal_journal_id').references(() => journalEntries.id, { onDelete: 'restrict' }),
  voidedAt: timestamp('voided_at'),
  voidedBy: text('voided_by').references(() => users.uid, { onDelete: 'restrict' }),
  voidReason: text('void_reason'),
  createdBy: text('created_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const expensesRelations = relations(expenses, ({ one }) => ({
  expenseAccount: one(accounts, {
    fields: [expenses.expenseAccountId],
    references: [accounts.id],
    relationName: 'expenseAccount',
  }),
  paymentAccount: one(accounts, {
    fields: [expenses.paymentAccountId],
    references: [accounts.id],
    relationName: 'paymentAccount',
  }),
  postedJournal: one(journalEntries, {
    fields: [expenses.postedJournalId],
    references: [journalEntries.id],
    relationName: 'postedJournal',
  }),
  reversalJournal: one(journalEntries, {
    fields: [expenses.reversalJournalId],
    references: [journalEntries.id],
    relationName: 'reversalJournal',
  }),
  creator: one(users, {
    fields: [expenses.createdBy],
    references: [users.uid],
    relationName: 'expenseCreator',
  }),
  voider: one(users, {
    fields: [expenses.voidedBy],
    references: [users.uid],
    relationName: 'expenseVoider',
  }),
}));

// 20. Bank Reconciliation Import Batches (Milestone 5A Addition)
export const bankImportBatches = pgTable('bank_import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  bankAccountId: uuid('bank_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(),
  fileName: text('file_name').notNull(),
  fileHash: text('file_hash').notNull().unique(), // SHA-256 hash of entire file content
  totalRows: integer('total_rows').default(0).notNull(),
  importedRows: integer('imported_rows').default(0).notNull(),
  uploadedBy: text('uploaded_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 21. Bank Reconciliation Sessions (Milestone 5A Addition)
export const bankReconciliationSessions = pgTable('bank_reconciliation_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  bankAccountId: uuid('bank_account_id')
    .references(() => accounts.id, { onDelete: 'restrict' })
    .notNull(),
  periodId: uuid('period_id')
    .references(() => accountingPeriods.id, { onDelete: 'restrict' })
    .notNull(),
  statementStartDate: date('statement_start_date').notNull(),
  statementEndDate: date('statement_end_date').notNull(),
  statementOpeningBalance: integer('statement_opening_balance').notNull(), // stored in integer cents
  statementEndingBalance: integer('statement_ending_balance').notNull(),  // stored in integer cents
  status: text('status').default('In_Progress').notNull(), // 'In_Progress' | 'Completed'
  completedAt: timestamp('completed_at'),
  completedBy: text('completed_by').references(() => users.uid, { onDelete: 'restrict' }),
  reopenedAt: timestamp('reopened_at'),
  reopenedBy: text('reopened_by').references(() => users.uid, { onDelete: 'restrict' }),
  reopenReason: text('reopen_reason'),
  createdBy: text('created_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 22. Bank Statement Lines (Milestone 5A Addition)
export const bankStatementLines = pgTable('bank_statement_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => bankReconciliationSessions.id, { onDelete: 'cascade' })
    .notNull(),
  batchId: uuid('batch_id').references(() => bankImportBatches.id, { onDelete: 'set null' }),
  rowNumber: integer('row_number').notNull(),
  transactionDate: date('transaction_date').notNull(),
  description: text('description').notNull(),
  reference: text('reference'),
  amount: integer('amount').notNull(), // stored in cents (positive = deposit/credit, negative = withdrawal/debit)
  lineFingerprint: text('line_fingerprint').notNull(),
  isFullyMatched: boolean('is_fully_matched').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 23. Bank Reconciliation Matches (Milestone 5A Addition)
export const bankReconciliationMatches = pgTable('bank_reconciliation_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => bankReconciliationSessions.id, { onDelete: 'restrict' })
    .notNull(),
  statementLineId: uuid('statement_line_id')
    .references(() => bankStatementLines.id, { onDelete: 'cascade' })
    .notNull(),
  journalLineId: uuid('journal_line_id')
    .references(() => journalLines.id, { onDelete: 'restrict' })
    .notNull(),
  allocatedAmount: integer('allocated_amount').notNull(), // stored in integer cents (positive)
  matchType: text('match_type').notNull(), // 'Exact_Auto' | 'Manual' | 'Partial'
  matchedBy: text('matched_by')
    .references(() => users.uid, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Bank Reconciliation Relations
export const bankImportBatchesRelations = relations(bankImportBatches, ({ one, many }) => ({
  bankAccount: one(accounts, {
    fields: [bankImportBatches.bankAccountId],
    references: [accounts.id],
  }),
  uploader: one(users, {
    fields: [bankImportBatches.uploadedBy],
    references: [users.uid],
  }),
  statementLines: many(bankStatementLines),
}));

export const bankReconciliationSessionsRelations = relations(bankReconciliationSessions, ({ one, many }) => ({
  bankAccount: one(accounts, {
    fields: [bankReconciliationSessions.bankAccountId],
    references: [accounts.id],
  }),
  period: one(accountingPeriods, {
    fields: [bankReconciliationSessions.periodId],
    references: [accountingPeriods.id],
  }),
  creator: one(users, {
    fields: [bankReconciliationSessions.createdBy],
    references: [users.uid],
  }),
  completer: one(users, {
    fields: [bankReconciliationSessions.completedBy],
    references: [users.uid],
  }),
  statementLines: many(bankStatementLines),
  matches: many(bankReconciliationMatches),
}));

export const bankStatementLinesRelations = relations(bankStatementLines, ({ one, many }) => ({
  session: one(bankReconciliationSessions, {
    fields: [bankStatementLines.sessionId],
    references: [bankReconciliationSessions.id],
  }),
  batch: one(bankImportBatches, {
    fields: [bankStatementLines.batchId],
    references: [bankImportBatches.id],
  }),
  matches: many(bankReconciliationMatches),
}));

export const bankReconciliationMatchesRelations = relations(bankReconciliationMatches, ({ one }) => ({
  session: one(bankReconciliationSessions, {
    fields: [bankReconciliationMatches.sessionId],
    references: [bankReconciliationSessions.id],
  }),
  statementLine: one(bankStatementLines, {
    fields: [bankReconciliationMatches.statementLineId],
    references: [bankStatementLines.id],
  }),
  journalLine: one(journalLines, {
    fields: [bankReconciliationMatches.journalLineId],
    references: [journalLines.id],
  }),
  matcher: one(users, {
    fields: [bankReconciliationMatches.matchedBy],
    references: [users.uid],
  }),
}));

// 24. Products & Services Master Catalogue
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  productCode: text('product_code').notNull().unique(), // e.g., 'PRD-001'
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  salesUnit: text('sales_unit').notNull().default('unit'), // 'kg' | 'ekor' | 'unit'
  sellingPrice: integer('selling_price').notNull().default(0), // in cents
  incomeCategory: text('income_category'),
  incomeAccountId: uuid('income_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  purchaseUnit: text('purchase_unit').notNull().default('unit'), // 'kg' | 'ekor' | 'unit'
  purchaseCost: integer('purchase_cost').notNull().default(0), // in cents
  expenseCategory: text('expense_category'),
  expenseAccountId: uuid('expense_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productsRelations = relations(products, ({ one }) => ({
  incomeAccount: one(accounts, {
    fields: [products.incomeAccountId],
    references: [accounts.id],
    relationName: 'productIncomeAccount',
  }),
  expenseAccount: one(accounts, {
    fields: [products.expenseAccountId],
    references: [accounts.id],
    relationName: 'productExpenseAccount',
  }),
}));
