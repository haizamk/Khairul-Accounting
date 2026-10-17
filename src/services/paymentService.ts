import { db } from '../db/index.ts';
import { 
  customerPayments, 
  paymentAllocations, 
  salesInvoices, 
  customers, 
  accounts, 
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../db/schema.ts';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import { validateAccountingPeriod, postJournalEntry, voidJournalEntry } from './accounting.ts';

export interface PaymentAllocationInput {
  invoiceId: string;
  amount: number; // in cents
}

export interface PaymentInput {
  customerId: string;
  paymentDate: string; // YYYY-MM-DD
  paymentReference: string;
  amount: number; // in cents
  paymentAccountId: string; // Cash or Checking account (Chart of Accounts)
  notes?: string;
  status?: 'Draft' | 'Posted';
  allocations?: PaymentAllocationInput[];
}

/**
 * Creates a Customer Payment (as Draft or Posted directly)
 */
export async function createCustomerPayment(input: PaymentInput, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot record customer payments.");
  }

  if (!input.customerId || !input.paymentDate || !input.paymentReference || !input.amount || !input.paymentAccountId) {
    throw new Error("Validation Error: Customer, date, reference, amount, and payment account are required.");
  }

  if (input.amount <= 0) {
    throw new Error("Validation Error: Payment amount must be a positive value greater than zero.");
  }

  // 1. Resolve Customer
  const customerList = await db.select().from(customers).where(eq(customers.id, input.customerId));
  if (customerList.length === 0) {
    throw new Error("Validation Error: Selected customer does not exist.");
  }
  const customer = customerList[0];
  if (!customer.isActive) {
    throw new Error(`Validation Error: Customer '${customer.name}' is inactive. Cannot record payments.`);
  }

  // 2. Resolve Payment Account
  const paymentAccList = await db.select().from(accounts).where(eq(accounts.id, input.paymentAccountId));
  if (paymentAccList.length === 0) {
    throw new Error("Validation Error: Selected payment account does not exist.");
  }
  const paymentAccount = paymentAccList[0];
  if (!paymentAccount.active) {
    throw new Error(`Validation Error: Account '${paymentAccount.name}' is inactive.`);
  }

  // 3. Verify allocations sum doesn't exceed payment amount
  let totalAllocated = 0;
  const allocations = input.allocations || [];
  const seenInvoiceIds = new Set<string>();

  for (const alloc of allocations) {
    if (seenInvoiceIds.has(alloc.invoiceId)) {
      throw new Error("Validation Error: Duplicate allocations for the same invoice are not allowed in a single payment.");
    }
    seenInvoiceIds.add(alloc.invoiceId);

    if (alloc.amount <= 0) {
      throw new Error("Validation Error: Allocation amounts must be greater than zero.");
    }
    totalAllocated += alloc.amount;

    // Verify invoice exists
    const invoiceList = await db.select().from(salesInvoices).where(eq(salesInvoices.id, alloc.invoiceId));
    if (invoiceList.length === 0) {
      throw new Error("Validation Error: Allocated invoice does not exist.");
    }
    const invoice = invoiceList[0];

    // Verify customer matches
    if (invoice.customerId !== input.customerId) {
      throw new Error(`Validation Error: Invoice ${invoice.invoiceNumber} belongs to a different customer.`);
    }

    // Verify invoice state
    if (invoice.status === 'Draft') {
      throw new Error(`Validation Error: Cannot allocate payment to a Draft invoice (${invoice.invoiceNumber}).`);
    }
    if (invoice.status === 'Voided') {
      throw new Error(`Validation Error: Cannot allocate payment to a Voided invoice (${invoice.invoiceNumber}).`);
    }
    if (invoice.status !== 'Posted') {
      throw new Error(`Validation Error: Cannot allocate payment to an unposted invoice (${invoice.invoiceNumber}).`);
    }

    // Verify outstanding balance
    const outstanding = await getInvoiceOutstandingBalance(alloc.invoiceId);
    if (outstanding <= 0) {
      throw new Error(`Validation Error: Invoice ${invoice.invoiceNumber} is already fully Paid.`);
    }

    // Verify allocated amount doesn't exceed current outstanding of that invoice
    if (alloc.amount > outstanding) {
      throw new Error(`Validation Error: Allocation of RM ${(alloc.amount / 100).toFixed(2)} exceeds the outstanding balance of RM ${(outstanding / 100).toFixed(2)} for invoice ${invoice.invoiceNumber}.`);
    }
  }

  if (totalAllocated > input.amount) {
    throw new Error(`Validation Error: Total allocations (RM ${(totalAllocated / 100).toFixed(2)}) cannot exceed payment amount (RM ${(input.amount / 100).toFixed(2)}).`);
  }

  const requestedStatus = input.status || 'Draft';

  return await db.transaction(async (tx) => {
    // A. Insert Payment Header
    const payment = await tx.insert(customerPayments)
      .values({
        customerId: input.customerId,
        paymentDate: input.paymentDate,
        paymentReference: input.paymentReference,
        amount: input.amount,
        paymentAccountId: input.paymentAccountId,
        notes: input.notes || null,
        status: 'Draft', // always insert as draft first
        createdBy: creatorUid,
      })
      .returning();

    const paymentId = payment[0].id;

    // B. Insert Allocations
    for (const alloc of allocations) {
      await tx.insert(paymentAllocations)
        .values({
          paymentId,
          invoiceId: alloc.invoiceId,
          amount: alloc.amount,
        });
    }

    // C. If direct Post was requested, transition to Post
    if (requestedStatus === 'Posted') {
      await tx.update(customerPayments)
        .set({ status: 'Posted' })
        .where(eq(customerPayments.id, paymentId));

      // Retrieve AR asset account
      const arAccounts = await tx.select().from(accounts).where(eq(accounts.subType, 'AccountsReceivable'));
      if (arAccounts.length === 0) {
        throw new Error("Configuration Error: No active Accounts Receivable asset account has been initialized in the Chart of Accounts.");
      }
      const arAccount = arAccounts[0];

      // Standard double-entry posting:
      // Dr Bank/Cash account (Payment Account Asset)      RM Amount
      //   Cr Accounts Receivable (Asset)                 RM Amount
      const journalLinesData = [
        { accountId: input.paymentAccountId, debit: input.amount, credit: 0, description: `Customer Payment: ${input.paymentReference}` },
        { accountId: arAccount.id, debit: 0, credit: input.amount, description: `AR Reduction: Customer Payment ${input.paymentReference}` }
      ];

      const journalId = await postJournalEntry({
        entryDate: input.paymentDate,
        reference: input.paymentReference,
        description: `Customer Payment Posting: ${input.paymentReference}`,
        lines: journalLinesData,
      }, creatorUid, userRole, tx);

      await tx.update(customerPayments)
        .set({ postedJournalId: journalId })
        .where(eq(customerPayments.id, paymentId));
    }

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: requestedStatus === 'Posted' ? 'POST_PAYMENT' : 'CREATE_PAYMENT',
      tableName: 'customer_payments',
      recordId: paymentId,
      newValues: {
        paymentReference: input.paymentReference,
        customerId: input.customerId,
        amount: input.amount,
        status: requestedStatus,
      },
    });

    return paymentId;
  });
}

/**
 * Edit an existing Draft customer payment
 */
export async function editDraftPayment(id: string, input: Partial<PaymentInput>, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot edit payments.");
  }

  return await db.transaction(async (tx) => {
    // Fetch Current
    const currentList = await tx.select().from(customerPayments).where(eq(customerPayments.id, id));
    if (currentList.length === 0) {
      throw new Error("Payment not found.");
    }
    const current = currentList[0];

    if (current.status !== 'Draft') {
      throw new Error(`Immutability Rule: Posted or Voided payments cannot be edited. Status: '${current.status}'`);
    }

    const updatedAmount = input.amount !== undefined ? input.amount : current.amount;
    if (updatedAmount <= 0) {
      throw new Error("Validation Error: Payment amount must be greater than zero.");
    }

    const updatedCustomerId = input.customerId || current.customerId;
    const updatedPaymentAccountId = input.paymentAccountId || current.paymentAccountId;

    // Validate customer
    if (input.customerId && input.customerId !== current.customerId) {
      const customerList = await tx.select().from(customers).where(eq(customers.id, input.customerId));
      if (customerList.length === 0 || !customerList[0].isActive) {
        throw new Error("Validation Error: Selected customer is inactive or does not exist.");
      }
    }

    // Validate payment account
    if (input.paymentAccountId && input.paymentAccountId !== current.paymentAccountId) {
      const paymentAccList = await tx.select().from(accounts).where(eq(accounts.id, input.paymentAccountId));
      if (paymentAccList.length === 0 || !paymentAccList[0].active) {
        throw new Error("Validation Error: Selected payment account is inactive or does not exist.");
      }
    }

    // Validate allocations
    const allocations = input.allocations || [];
    let totalAllocated = 0;

    // If new allocations are provided, we check them. Otherwise we check existing allocations against the new amount.
    if (input.allocations) {
      const seenInvoiceIds = new Set<string>();
      for (const alloc of allocations) {
        if (seenInvoiceIds.has(alloc.invoiceId)) {
          throw new Error("Validation Error: Duplicate allocations for the same invoice are not allowed in a single payment.");
        }
        seenInvoiceIds.add(alloc.invoiceId);

        if (alloc.amount <= 0) {
          throw new Error("Validation Error: Allocation amounts must be greater than zero.");
        }
        totalAllocated += alloc.amount;

        const invoiceList = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, alloc.invoiceId));
        if (invoiceList.length === 0) {
          throw new Error("Validation Error: Allocated invoice does not exist.");
        }
        const invoice = invoiceList[0];

        // Verify customer matches
        if (invoice.customerId !== updatedCustomerId) {
          throw new Error(`Validation Error: Invoice ${invoice.invoiceNumber} belongs to a different customer.`);
        }

        // Verify invoice state
        if (invoice.status === 'Draft') {
          throw new Error(`Validation Error: Cannot allocate payment to a Draft invoice (${invoice.invoiceNumber}).`);
        }
        if (invoice.status === 'Voided') {
          throw new Error(`Validation Error: Cannot allocate payment to a Voided invoice (${invoice.invoiceNumber}).`);
        }
        if (invoice.status !== 'Posted') {
          throw new Error(`Validation Error: Cannot allocate payment to an unposted invoice (${invoice.invoiceNumber}).`);
        }

        // Exclude current payment's allocations when calculating outstanding
        const outstanding = await getInvoiceOutstandingBalance(alloc.invoiceId, id);
        if (outstanding <= 0) {
          throw new Error(`Validation Error: Invoice ${invoice.invoiceNumber} is already fully Paid.`);
        }

        if (alloc.amount > outstanding) {
          throw new Error(`Validation Error: Allocation of RM ${(alloc.amount / 100).toFixed(2)} exceeds the outstanding balance of RM ${(outstanding / 100).toFixed(2)} for invoice ${invoice.invoiceNumber}.`);
        }
      }
    } else {
      // Check existing allocations against new amount
      const existingAllocations = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, id));
      totalAllocated = existingAllocations.reduce((sum, a) => sum + a.amount, 0);
    }

    if (totalAllocated > updatedAmount) {
      throw new Error(`Validation Error: Total allocations (RM ${(totalAllocated / 100).toFixed(2)}) cannot exceed payment amount (RM ${(updatedAmount / 100).toFixed(2)}).`);
    }

    // Update Payment Header
    await tx.update(customerPayments)
      .set({
        customerId: updatedCustomerId,
        paymentDate: input.paymentDate || undefined,
        paymentReference: input.paymentReference || undefined,
        amount: updatedAmount,
        paymentAccountId: updatedPaymentAccountId,
        notes: input.notes !== undefined ? input.notes : current.notes,
        updatedAt: new Date(),
      })
      .where(eq(customerPayments.id, id));

    // Update Allocations if provided
    if (input.allocations) {
      await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, id));
      for (const alloc of allocations) {
        await tx.insert(paymentAllocations)
          .values({
            paymentId: id,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
          });
      }
    }

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'UPDATE_PAYMENT_DRAFT',
      tableName: 'customer_payments',
      recordId: id,
      newValues: {
        amount: updatedAmount,
        allocationCount: allocations.length,
      },
    });

    return id;
  });
}

/**
 * Posts a Draft Customer Payment to the General Ledger
 */
export async function postCustomerPayment(id: string, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot post payments.");
  }

  return await db.transaction(async (tx) => {
    // 1. Fetch Payment
    const currentList = await tx.select().from(customerPayments).where(eq(customerPayments.id, id));
    if (currentList.length === 0) {
      throw new Error("Payment not found.");
    }
    const payment = currentList[0];

    if (payment.status !== 'Draft') {
      throw new Error(`Validation Error: Only Draft payments can be posted. Current Status: '${payment.status}'`);
    }

    // 2. Validate period
    await validateAccountingPeriod(payment.paymentDate);

    // 3. Resolve AR asset account
    const arAccounts = await tx.select().from(accounts).where(eq(accounts.subType, 'AccountsReceivable'));
    if (arAccounts.length === 0) {
      throw new Error("Configuration Error: No active Accounts Receivable asset account has been initialized in the Chart of Accounts.");
    }
    const arAccount = arAccounts[0];

    // 4. Create standard double-entry journal entry to core ledger:
    // Dr Bank/Cash account (Payment Account Asset)      RM Amount
    //   Cr Accounts Receivable (Asset)                 RM Amount
    const journalLinesData = [
      { accountId: payment.paymentAccountId, debit: payment.amount, credit: 0, description: `Customer Payment: ${payment.paymentReference}` },
      { accountId: arAccount.id, debit: 0, credit: payment.amount, description: `AR Reduction: Customer Payment ${payment.paymentReference}` }
    ];

    const journalId = await postJournalEntry({
      entryDate: payment.paymentDate,
      reference: payment.paymentReference,
      description: `Customer Payment Posting: ${payment.paymentReference}`,
      lines: journalLinesData,
    }, creatorUid, userRole, tx);

    // 5. Update status
    await tx.update(customerPayments)
      .set({
        status: 'Posted',
        postedJournalId: journalId,
        updatedAt: new Date(),
      })
      .where(eq(customerPayments.id, id));

    // 6. Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'POST_PAYMENT',
      tableName: 'customer_payments',
      recordId: id,
      newValues: {
        paymentReference: payment.paymentReference,
        postedJournalId: journalId,
      },
    });

    return journalId;
  });
}

/**
 * Voids a Posted Customer Payment and its ledger implications
 */
export async function voidCustomerPayment(id: string, reason: string, voidedByUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot void payments.");
  }

  if (!reason || reason.trim() === '') {
    throw new Error("Validation Error: A void reason must be provided.");
  }

  return await db.transaction(async (tx) => {
    // 1. Fetch Payment
    const currentList = await tx.select().from(customerPayments).where(eq(customerPayments.id, id));
    if (currentList.length === 0) {
      throw new Error("Payment not found.");
    }
    const payment = currentList[0];

    if (payment.status !== 'Posted' || !payment.postedJournalId) {
      throw new Error(`Validation Error: Only Posted payments can be voided. Current Status: '${payment.status}'`);
    }

    // Bank Reconciliation Interlock Check
    const { checkGLJournalReconciled } = await import('./bankReconciliationService.ts');
    const reconCheck = await checkGLJournalReconciled(payment.postedJournalId);
    if (reconCheck.reconciled) {
      throw new Error(`Reconciled Transaction Interlock: Cannot void Customer Payment ${payment.paymentReference} because its GL line belongs to Completed Bank Reconciliation Session #${reconCheck.sessionId}. The session must be reopened by an Admin first.`);
    }

    // 2. Validate Period
    await validateAccountingPeriod(payment.paymentDate);

    // 3. Void matching Posted Journal Entry (automatically writes Compensating Reversal)
    const reversalJournalId = await voidJournalEntry(payment.postedJournalId, `Voided Payment ${payment.paymentReference}. Reason: ${reason}`, voidedByUid, userRole, tx);

    // 4. Update status to Voided
    await tx.update(customerPayments)
      .set({
        status: 'Voided',
        updatedAt: new Date(),
      })
      .where(eq(customerPayments.id, id));

    // 5. Audit Log
    await tx.insert(auditLogs).values({
      userId: voidedByUid,
      action: 'VOID_PAYMENT',
      tableName: 'customer_payments',
      recordId: id,
      newValues: {
        paymentReference: payment.paymentReference,
        voidReason: reason,
        reversalJournalId,
      },
    });

    return reversalJournalId;
  });
}

/**
 * Helper to compute dynamic outstanding balance of an invoice.
 * Optionally excludes a payment ID (useful during edits of a draft payment).
 */
export async function getInvoiceOutstandingBalance(invoiceId: string, excludePaymentId?: string): Promise<number> {
  const invoiceList = await db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
  if (invoiceList.length === 0) {
    throw new Error("Invoice not found.");
  }
  const invoice = invoiceList[0];

  // If invoice status is Voided or Draft, outstanding is zero
  if (invoice.status !== 'Posted') {
    return 0;
  }

  // Calculate sum of allocations from Posted/Draft (Draft allocations also hold outstanding reservations for the payment itself) payments
  let conditions = [
    eq(paymentAllocations.invoiceId, invoiceId),
    // Consider allocations from Draft or Posted payments, exclude Voided
    sql`${customerPayments.status} != 'Voided'`
  ];

  if (excludePaymentId) {
    conditions.push(sql`${paymentAllocations.paymentId} != ${excludePaymentId}`);
  }

  const result = await db.select({
    sum: sql<number>`COALESCE(SUM(${paymentAllocations.amount}), 0)::int`
  })
  .from(paymentAllocations)
  .innerJoin(customerPayments, eq(paymentAllocations.paymentId, customerPayments.id))
  .where(and(...conditions));

  const totalAllocated = result[0]?.sum || 0;
  const outstanding = invoice.total - totalAllocated;

  return outstanding < 0 ? 0 : outstanding;
}

/**
 * Returns list of customer payments, optionally filtered by customer
 */
export async function getCustomerPayments(customerId?: string) {
  let conditions = [];
  if (customerId) {
    conditions.push(eq(customerPayments.customerId, customerId));
  }

  const query = db.select({
    id: customerPayments.id,
    paymentDate: customerPayments.paymentDate,
    paymentReference: customerPayments.paymentReference,
    amount: customerPayments.amount,
    status: customerPayments.status,
    notes: customerPayments.notes,
    customerName: customers.name,
    customerCode: customers.customerCode,
    paymentAccountName: accounts.name,
  })
  .from(customerPayments)
  .innerJoin(customers, eq(customerPayments.customerId, customers.id))
  .innerJoin(accounts, eq(customerPayments.paymentAccountId, accounts.id));

  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  return await query.orderBy(desc(customerPayments.paymentDate), desc(customerPayments.createdAt));
}

/**
 * Returns detailed payment view, including customer and allocations list
 */
export async function getPaymentDetail(id: string) {
  const list = await db.select().from(customerPayments).where(eq(customerPayments.id, id));
  if (list.length === 0) {
    throw new Error("Payment record not found.");
  }
  const payment = list[0];

  const customerList = await db.select().from(customers).where(eq(customers.id, payment.customerId));
  const accountList = await db.select().from(accounts).where(eq(accounts.id, payment.paymentAccountId));

  // Fetch Allocations
  const allocationsList = await db.select({
    id: paymentAllocations.id,
    amount: paymentAllocations.amount,
    invoiceId: paymentAllocations.invoiceId,
    invoiceNumber: salesInvoices.invoiceNumber,
    invoiceDate: salesInvoices.invoiceDate,
    invoiceTotal: salesInvoices.total,
  })
  .from(paymentAllocations)
  .innerJoin(salesInvoices, eq(paymentAllocations.invoiceId, salesInvoices.id))
  .where(eq(paymentAllocations.paymentId, id));

  return {
    ...payment,
    customer: customerList[0],
    account: accountList[0],
    allocations: allocationsList,
  };
}
