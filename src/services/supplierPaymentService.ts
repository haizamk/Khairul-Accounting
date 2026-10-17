import { db } from '../db/index.ts';
import { 
  supplierPayments, 
  supplierPaymentAllocations, 
  purchaseBills, 
  suppliers, 
  accounts, 
  journalEntries, 
  journalLines, 
  auditLogs 
} from '../db/schema.ts';
import { eq, and, desc, sql, asc, inArray } from 'drizzle-orm';
import { validateAccountingPeriod, postJournalEntry, voidJournalEntry } from './accounting.ts';

export interface SupplierPaymentAllocationInput {
  purchaseBillId: string;
  amount: number; // in cents
}

export interface SupplierPaymentInput {
  supplierId: string;
  paymentDate: string; // YYYY-MM-DD
  amount: number; // in cents
  paymentAccountId: string; // Cash or Bank account
  reference?: string; // Cheque number, wire transfer ref, receipt
  notes?: string;
  status?: 'Draft' | 'Posted';
  allocations?: SupplierPaymentAllocationInput[];
}

/**
 * Generates sequential server-side payment number: SPAY-YYYY-XXXXXX
 */
export async function generateSupplierPaymentNumber(paymentDate: string): Promise<string> {
  const year = new Date(paymentDate).getFullYear() || new Date().getFullYear();
  const prefix = `SPAY-${year}-`;

  const latest = await db.select({ paymentNumber: supplierPayments.paymentNumber })
    .from(supplierPayments)
    .where(sql`${supplierPayments.paymentNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(supplierPayments.paymentNumber))
    .limit(1);

  let seq = 1;
  if (latest.length > 0 && latest[0].paymentNumber) {
    const parts = latest[0].paymentNumber.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) seq = parsed + 1;
    }
  }

  return `${prefix}${String(seq).padStart(6, '0')}`;
}

/**
 * Calculates current outstanding balance of a purchase bill
 * (Bill Total minus sum of allocations from Posted supplier payments)
 */
export async function getBillOutstandingBalance(purchaseBillId: string, excludePaymentId?: string): Promise<number> {
  const billList = await db.select().from(purchaseBills).where(eq(purchaseBills.id, purchaseBillId));
  if (billList.length === 0) {
    throw new Error("Purchase bill not found.");
  }
  const bill = billList[0];

  const conditions = [
    eq(supplierPaymentAllocations.purchaseBillId, purchaseBillId),
    eq(supplierPayments.status, 'Posted')
  ];

  if (excludePaymentId) {
    conditions.push(sql`${supplierPayments.id} != ${excludePaymentId}`);
  }

  const result = await db.select({
    sum: sql<number>`COALESCE(SUM(${supplierPaymentAllocations.amount}), 0)::int`
  })
  .from(supplierPaymentAllocations)
  .innerJoin(supplierPayments, eq(supplierPaymentAllocations.paymentId, supplierPayments.id))
  .where(and(...conditions));

  const totalAllocated = result[0]?.sum || 0;
  const outstanding = bill.total - totalAllocated;

  return outstanding < 0 ? 0 : outstanding;
}

/**
 * Calculates dynamic payment status for a purchase bill: UNPAID | PARTIALLY_PAID | PAID
 */
export async function getBillPaymentStatus(purchaseBillId: string): Promise<{
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  allocatedAmount: number;
  outstandingBalance: number;
}> {
  const billList = await db.select().from(purchaseBills).where(eq(purchaseBills.id, purchaseBillId));
  if (billList.length === 0) {
    throw new Error("Purchase bill not found.");
  }
  const bill = billList[0];

  const result = await db.select({
    sum: sql<number>`COALESCE(SUM(${supplierPaymentAllocations.amount}), 0)::int`
  })
  .from(supplierPaymentAllocations)
  .innerJoin(supplierPayments, eq(supplierPaymentAllocations.paymentId, supplierPayments.id))
  .where(and(
    eq(supplierPaymentAllocations.purchaseBillId, purchaseBillId),
    eq(supplierPayments.status, 'Posted')
  ));

  const allocatedAmount = result[0]?.sum || 0;
  const outstandingBalance = Math.max(0, bill.total - allocatedAmount);

  let paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
  if (allocatedAmount >= bill.total && bill.total > 0) {
    paymentStatus = 'PAID';
  } else if (allocatedAmount > 0) {
    paymentStatus = 'PARTIALLY_PAID';
  }

  return { paymentStatus, allocatedAmount, outstandingBalance };
}

/**
 * Creates a Supplier Payment (Draft or directly Posted)
 */
export async function createSupplierPayment(input: SupplierPaymentInput, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create supplier payments.");
  }

  if (!input.supplierId || !input.paymentDate || !input.paymentAccountId || input.amount === undefined || input.amount === null) {
    throw new Error("Validation Error: Supplier, date, amount, and payment account are required.");
  }

  if (input.amount <= 0) {
    throw new Error("Validation Error: Payment amount must be a positive value greater than zero.");
  }

  return await db.transaction(async (tx) => {
    // Idempotency / Duplicate Submission Guard: check if an identical draft payment was created in the last 10 seconds
    const tenSecondsAgo = new Date(Date.now() - 10000);
    const existingRecentDrafts = await tx.select().from(supplierPayments)
      .where(and(
        eq(supplierPayments.supplierId, input.supplierId),
        eq(supplierPayments.amount, input.amount),
        eq(supplierPayments.paymentDate, input.paymentDate),
        eq(supplierPayments.status, 'Draft'),
        eq(supplierPayments.createdBy, creatorUid),
        sql`${supplierPayments.createdAt} >= ${tenSecondsAgo}`
      ))
      .orderBy(desc(supplierPayments.createdAt))
      .limit(1);

    if (existingRecentDrafts.length > 0) {
      const recent = existingRecentDrafts[0];
      const refMatch = (recent.reference || null) === (input.reference ? input.reference.trim() : null);
      if (refMatch) {
        console.warn(`Idempotency guard: returning existing draft ${recent.paymentNumber} created at ${recent.createdAt}`);
        const allocs = await tx.select().from(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.paymentId, recent.id));
        const totalAllocated = allocs.reduce((sum, a) => sum + a.amount, 0);
        return {
          ...recent,
          allocatedAmount: totalAllocated,
          unallocatedAmount: recent.amount - totalAllocated,
        };
      }
    }
    // 1. Resolve Supplier
    const supplierList = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId));
    if (supplierList.length === 0) {
      throw new Error("Validation Error: Selected supplier does not exist.");
    }
    const supplier = supplierList[0];
    if (!supplier.isActive) {
      throw new Error(`Validation Error: Supplier '${supplier.name}' is inactive. Cannot record payments.`);
    }

    // 2. Resolve Payment Account
    const paymentAccList = await tx.select().from(accounts).where(eq(accounts.id, input.paymentAccountId));
    if (paymentAccList.length === 0) {
      throw new Error("Validation Error: Selected payment account does not exist.");
    }
    const paymentAccount = paymentAccList[0];
    if (!paymentAccount.active) {
      throw new Error(`Validation Error: Payment account '${paymentAccount.name}' is inactive.`);
    }
    if (paymentAccount.type !== 'Asset') {
      throw new Error(`Validation Error: Payment account '${paymentAccount.name}' must be an Asset account (Cash or Bank).`);
    }

    // 3. Accounting Period check
    await validateAccountingPeriod(input.paymentDate);

    // 4. Validate allocations
    let totalAllocated = 0;
    const rawAllocations = input.allocations || [];
    const allocations = rawAllocations.filter((a) => a.amount > 0);
    const seenBillIds = new Set<string>();

    for (const alloc of allocations) {
      if (seenBillIds.has(alloc.purchaseBillId)) {
        throw new Error("Validation Error: Duplicate allocations for the same purchase bill are not allowed in a single payment.");
      }
      seenBillIds.add(alloc.purchaseBillId);

      if (alloc.amount <= 0) {
        throw new Error("Validation Error: Allocation amounts must be greater than zero.");
      }
      totalAllocated += alloc.amount;

      // Verify bill exists
      const billList = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, alloc.purchaseBillId));
      if (billList.length === 0) {
        throw new Error("Validation Error: Allocated purchase bill does not exist.");
      }
      const bill = billList[0];

      // Verify supplier matches
      if (bill.supplierId !== input.supplierId) {
        throw new Error(`Validation Error: Purchase bill ${bill.billNumber} belongs to a different supplier.`);
      }

      // Verify bill state
      if (bill.status === 'Draft') {
        throw new Error(`Validation Error: Cannot allocate payment to a Draft purchase bill (${bill.billNumber}).`);
      }
      if (bill.status === 'Voided') {
        throw new Error(`Validation Error: Cannot allocate payment to a Voided purchase bill (${bill.billNumber}).`);
      }
      if (bill.status !== 'Posted') {
        throw new Error(`Validation Error: Cannot allocate payment to an unposted purchase bill (${bill.billNumber}).`);
      }

      // Verify outstanding balance
      const outstanding = await getBillOutstandingBalance(alloc.purchaseBillId);
      if (outstanding <= 0) {
        throw new Error(`Validation Error: Purchase bill ${bill.billNumber} is already fully Paid.`);
      }

      if (alloc.amount > outstanding) {
        throw new Error(`Validation Error: Allocation of RM ${(alloc.amount / 100).toFixed(2)} exceeds the outstanding balance of RM ${(outstanding / 100).toFixed(2)} for purchase bill ${bill.billNumber}.`);
      }
    }

    if (totalAllocated > input.amount) {
      throw new Error(`Validation Error: Total allocations (RM ${(totalAllocated / 100).toFixed(2)}) cannot exceed payment amount (RM ${(input.amount / 100).toFixed(2)}).`);
    }

    // 5. Generate Payment Number
    const paymentNumber = await generateSupplierPaymentNumber(input.paymentDate);

    // 6. Insert Supplier Payment Header
    const paymentRecords = await tx.insert(supplierPayments).values({
      paymentNumber,
      supplierId: input.supplierId,
      paymentDate: input.paymentDate,
      amount: input.amount,
      paymentAccountId: input.paymentAccountId,
      reference: input.reference ? input.reference.trim() : null,
      notes: input.notes ? input.notes.trim() : null,
      status: 'Draft',
      createdBy: creatorUid,
    }).returning();

    const payment = paymentRecords[0];

    // 7. Insert Allocations
    for (const alloc of allocations) {
      await tx.insert(supplierPaymentAllocations).values({
        paymentId: payment.id,
        purchaseBillId: alloc.purchaseBillId,
        amount: alloc.amount,
      });
    }

    // 8. Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'SUPPLIER_PAYMENT_CREATE',
      tableName: 'supplier_payments',
      recordId: payment.id,
      newValues: {
        paymentNumber,
        amount: input.amount,
        allocatedAmount: totalAllocated,
        unallocatedAmount: input.amount - totalAllocated,
      },
    });

    // 9. If directly requested to Post
    if (input.status === 'Posted') {
      const journalId = await internalPostSupplierPayment(payment.id, creatorUid, userRole, tx);
      payment.status = 'Posted';
      payment.postedJournalId = journalId;
    }

    return {
      ...payment,
      allocatedAmount: totalAllocated,
      unallocatedAmount: input.amount - totalAllocated,
    };
  });
}

/**
 * Edits an existing Draft Supplier Payment
 */
export async function editDraftSupplierPayment(
  id: string, 
  input: Partial<SupplierPaymentInput>, 
  creatorUid: string, 
  userRole: string
) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot edit supplier payments.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(supplierPayments).where(eq(supplierPayments.id, id));
    if (currentList.length === 0) {
      throw new Error("Supplier payment record not found.");
    }
    const current = currentList[0];

    if (current.status !== 'Draft') {
      throw new Error(`Immutability Rule: Posted or Voided supplier payments cannot be edited. Status: '${current.status}'`);
    }

    const updatedAmount = input.amount !== undefined ? input.amount : current.amount;
    if (updatedAmount <= 0) {
      throw new Error("Validation Error: Payment amount must be greater than zero.");
    }

    const updatedSupplierId = input.supplierId || current.supplierId;
    const updatedPaymentAccountId = input.paymentAccountId || current.paymentAccountId;

    // Validate supplier
    if (input.supplierId && input.supplierId !== current.supplierId) {
      const supplierList = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId));
      if (supplierList.length === 0 || !supplierList[0].isActive) {
        throw new Error("Validation Error: Selected supplier is inactive or does not exist.");
      }
    }

    // Validate payment account
    if (input.paymentAccountId && input.paymentAccountId !== current.paymentAccountId) {
      const paymentAccList = await tx.select().from(accounts).where(eq(accounts.id, input.paymentAccountId));
      if (paymentAccList.length === 0 || !paymentAccList[0].active) {
        throw new Error("Validation Error: Selected payment account is inactive or does not exist.");
      }
      if (paymentAccList[0].type !== 'Asset') {
        throw new Error(`Validation Error: Payment account must be an Asset account (Cash or Bank).`);
      }
    }

    // Validate date/period
    if (input.paymentDate && input.paymentDate !== current.paymentDate) {
      await validateAccountingPeriod(input.paymentDate);
    }

    // Validate allocations
    const rawAllocations = input.allocations || [];
    const allocations = rawAllocations.filter((a) => a.amount > 0);
    let totalAllocated = 0;

    if (input.allocations) {
      const seenBillIds = new Set<string>();
      for (const alloc of allocations) {
        if (seenBillIds.has(alloc.purchaseBillId)) {
          throw new Error("Validation Error: Duplicate allocations for the same purchase bill are not allowed in a single payment.");
        }
        seenBillIds.add(alloc.purchaseBillId);

        if (alloc.amount <= 0) {
          throw new Error("Validation Error: Allocation amounts must be greater than zero.");
        }
        totalAllocated += alloc.amount;

        const billList = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, alloc.purchaseBillId));
        if (billList.length === 0) {
          throw new Error("Validation Error: Allocated purchase bill does not exist.");
        }
        const bill = billList[0];

        if (bill.supplierId !== updatedSupplierId) {
          throw new Error(`Validation Error: Purchase bill ${bill.billNumber} belongs to a different supplier.`);
        }

        if (bill.status !== 'Posted') {
          throw new Error(`Validation Error: Cannot allocate payment to non-posted purchase bill (${bill.billNumber}).`);
        }

        // Exclude current payment allocations
        const outstanding = await getBillOutstandingBalance(alloc.purchaseBillId, id);
        if (outstanding <= 0) {
          throw new Error(`Validation Error: Purchase bill ${bill.billNumber} is already fully Paid.`);
        }

        if (alloc.amount > outstanding) {
          throw new Error(`Validation Error: Allocation of RM ${(alloc.amount / 100).toFixed(2)} exceeds the outstanding balance of RM ${(outstanding / 100).toFixed(2)} for purchase bill ${bill.billNumber}.`);
        }
      }
    } else {
      const existingAllocations = await tx.select().from(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.paymentId, id));
      totalAllocated = existingAllocations.reduce((sum, a) => sum + a.amount, 0);
    }

    if (totalAllocated > updatedAmount) {
      throw new Error(`Validation Error: Total allocations (RM ${(totalAllocated / 100).toFixed(2)}) cannot exceed payment amount (RM ${(updatedAmount / 100).toFixed(2)}).`);
    }

    // Update Header
    await tx.update(supplierPayments)
      .set({
        supplierId: updatedSupplierId,
        paymentDate: input.paymentDate || undefined,
        amount: updatedAmount,
        paymentAccountId: updatedPaymentAccountId,
        reference: input.reference !== undefined ? (input.reference ? input.reference.trim() : null) : undefined,
        notes: input.notes !== undefined ? (input.notes ? input.notes.trim() : null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(supplierPayments.id, id));

    // Update Allocations if provided
    if (input.allocations) {
      await tx.delete(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.paymentId, id));
      for (const alloc of allocations) {
        await tx.insert(supplierPaymentAllocations).values({
          paymentId: id,
          purchaseBillId: alloc.purchaseBillId,
          amount: alloc.amount,
        });
      }
    }

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'SUPPLIER_PAYMENT_UPDATE',
      tableName: 'supplier_payments',
      recordId: id,
      newValues: {
        amount: updatedAmount,
        allocationCount: allocations.length,
      },
    });

    let postedJournalId: string | undefined;
    if (input.status === 'Posted') {
      postedJournalId = await internalPostSupplierPayment(id, creatorUid, userRole, tx);
    }

    const updatedPayment = await tx.select().from(supplierPayments).where(eq(supplierPayments.id, id));

    return {
      id,
      paymentNumber: updatedPayment[0]?.paymentNumber || current.paymentNumber,
      journalId: postedJournalId,
      status: input.status === 'Posted' ? 'Posted' : 'Draft',
    };
  });
}

/**
 * Internal worker for posting a supplier payment within transaction
 */
async function internalPostSupplierPayment(id: string, creatorUid: string, userRole: string, tx: any): Promise<string> {
  const currentList = await tx.select().from(supplierPayments).where(eq(supplierPayments.id, id));
  if (currentList.length === 0) {
    throw new Error("Supplier payment record not found.");
  }
  const payment = currentList[0];

  if (payment.status !== 'Draft') {
    throw new Error(`Validation Error: Only Draft supplier payments can be posted. Current Status: '${payment.status}'`);
  }

  // 1. Validate accounting period
  await validateAccountingPeriod(payment.paymentDate);

  // 2. Validate supplier
  const supplierList = await tx.select().from(suppliers).where(eq(suppliers.id, payment.supplierId));
  if (supplierList.length === 0 || !supplierList[0].isActive) {
    throw new Error("Validation Error: Supplier is inactive or does not exist.");
  }

  // 3. Validate payment account
  const paymentAccList = await tx.select().from(accounts).where(eq(accounts.id, payment.paymentAccountId));
  if (paymentAccList.length === 0 || !paymentAccList[0].active) {
    throw new Error("Validation Error: Payment account is inactive or does not exist.");
  }

  // 4. Validate concurrent allocations against outstanding balances
  const allocations = await tx.select().from(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.paymentId, id));
  for (const alloc of allocations) {
    const outstanding = await getBillOutstandingBalance(alloc.purchaseBillId, id);
    if (alloc.amount > outstanding) {
      throw new Error(`Concurrent Allocation Conflict: Allocation of RM ${(alloc.amount / 100).toFixed(2)} exceeds current remaining outstanding balance of RM ${(outstanding / 100).toFixed(2)}.`);
    }
  }

  // 5. Resolve Accounts Payable liability account
  const apAccounts = await tx.select().from(accounts).where(eq(accounts.subType, 'AccountsPayable'));
  if (apAccounts.length === 0) {
    throw new Error("Configuration Error: No active Accounts Payable liability account configured.");
  }
  const apAccount = apAccounts[0];

  // 6. Double-entry Journal Entry:
  // Debit: Accounts Payable (reduces liability)           RM Payment Amount
  //   Credit: Cash / Bank (Payment Account Asset)        RM Payment Amount
  const journalLinesData = [
    { 
      accountId: apAccount.id, 
      debit: payment.amount, 
      credit: 0, 
      description: `AP Settlement: Supplier Payment ${payment.paymentNumber}${payment.reference ? ` [Ref: ${payment.reference}]` : ''}` 
    },
    { 
      accountId: payment.paymentAccountId, 
      debit: 0, 
      credit: payment.amount, 
      description: `Cash/Bank Disbursement: Supplier Payment ${payment.paymentNumber}` 
    }
  ];

  const journalId = await postJournalEntry({
    entryDate: payment.paymentDate,
    reference: payment.paymentNumber,
    description: `Supplier Payment Posting: ${payment.paymentNumber}${payment.reference ? ` [Ref: ${payment.reference}]` : ''}`,
    lines: journalLinesData,
  }, creatorUid, userRole, tx);

  // 7. Update status to Posted
  await tx.update(supplierPayments)
    .set({
      status: 'Posted',
      postedJournalId: journalId,
      updatedAt: new Date(),
    })
    .where(eq(supplierPayments.id, id));

  // 8. Audit Log
  await tx.insert(auditLogs).values({
    userId: creatorUid,
    action: 'SUPPLIER_PAYMENT_POST',
    tableName: 'supplier_payments',
    recordId: id,
    newValues: {
      paymentNumber: payment.paymentNumber,
      postedJournalId: journalId,
      amount: payment.amount,
    },
  });

  return journalId;
}

/**
 * Public function to post a draft supplier payment to ledger
 */
export async function postSupplierPayment(id: string, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot post supplier payments.");
  }

  return await db.transaction(async (tx) => {
    const journalId = await internalPostSupplierPayment(id, creatorUid, userRole, tx);
    return { paymentId: id, journalId };
  });
}

/**
 * Voids a Posted Supplier Payment and inverts the accounting entry
 */
export async function voidSupplierPayment(id: string, reason: string, voidedByUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot void supplier payments.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("Validation Error: A specific reason must be provided when voiding a supplier payment.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(supplierPayments).where(eq(supplierPayments.id, id));
    if (currentList.length === 0) {
      throw new Error("Supplier payment record not found.");
    }
    const payment = currentList[0];

    if (payment.status !== 'Posted' || !payment.postedJournalId) {
      throw new Error(`Validation Error: Only Posted supplier payments can be voided. Current Status: '${payment.status}'`);
    }

    // Bank Reconciliation Interlock Check
    const { checkGLJournalReconciled } = await import('./bankReconciliationService.ts');
    const reconCheck = await checkGLJournalReconciled(payment.postedJournalId);
    if (reconCheck.reconciled) {
      throw new Error(`Reconciled Transaction Interlock: Cannot void Supplier Payment ${payment.paymentNumber} because its GL line belongs to Completed Bank Reconciliation Session #${reconCheck.sessionId}. The session must be reopened by an Admin first.`);
    }

    // 1. Period check
    await validateAccountingPeriod(payment.paymentDate);

    // 2. Void linked journal entry (creates compensating reversal journal)
    const reversalJournalId = await voidJournalEntry(
      payment.postedJournalId, 
      `Voided Supplier Payment ${payment.paymentNumber}. Reason: ${reason.trim()}`, 
      voidedByUid, 
      userRole, 
      tx
    );

    // 3. Mark payment as Voided
    await tx.update(supplierPayments)
      .set({
        status: 'Voided',
        voidReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(supplierPayments.id, id));

    // 4. Audit Log
    await tx.insert(auditLogs).values({
      userId: voidedByUid,
      action: 'SUPPLIER_PAYMENT_VOID',
      tableName: 'supplier_payments',
      recordId: id,
      newValues: {
        paymentNumber: payment.paymentNumber,
        voidReason: reason.trim(),
        reversalJournalId,
      },
    });

    return { paymentId: id, status: 'Voided', reversalJournalId };
  });
}

/**
 * Destructive deletion of Draft supplier payments only
 */
export async function deleteDraftSupplierPayment(id: string, userUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot delete supplier payments.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(supplierPayments).where(eq(supplierPayments.id, id));
    if (currentList.length === 0) {
      throw new Error("Supplier payment record not found.");
    }
    const payment = currentList[0];

    if (payment.status !== 'Draft') {
      throw new Error(`Immutability Rule: Posted or Voided supplier payments cannot be deleted. Status: '${payment.status}'`);
    }

    await tx.delete(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.paymentId, id));
    await tx.delete(supplierPayments).where(eq(supplierPayments.id, id));

    await tx.insert(auditLogs).values({
      userId: userUid,
      action: 'SUPPLIER_PAYMENT_DELETE',
      tableName: 'supplier_payments',
      recordId: id,
      oldValues: payment,
    });

    return { id, deleted: true };
  });
}

/**
 * Returns list of supplier payments with allocation summaries
 */
export async function getSupplierPayments(filters?: { supplierId?: string; status?: string }) {
  const conditions = [];
  if (filters?.supplierId) {
    conditions.push(eq(supplierPayments.supplierId, filters.supplierId));
  }
  if (filters?.status) {
    conditions.push(eq(supplierPayments.status, filters.status));
  }

  const query = db.select({
    id: supplierPayments.id,
    paymentNumber: supplierPayments.paymentNumber,
    paymentDate: supplierPayments.paymentDate,
    amount: supplierPayments.amount,
    status: supplierPayments.status,
    reference: supplierPayments.reference,
    notes: supplierPayments.notes,
    voidReason: supplierPayments.voidReason,
    supplierId: supplierPayments.supplierId,
    supplierName: suppliers.name,
    supplierCode: suppliers.supplierCode,
    paymentAccountId: supplierPayments.paymentAccountId,
    paymentAccountName: accounts.name,
    createdAt: supplierPayments.createdAt,
  })
  .from(supplierPayments)
  .innerJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
  .innerJoin(accounts, eq(supplierPayments.paymentAccountId, accounts.id));

  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  const list = await query.orderBy(desc(supplierPayments.paymentDate), desc(supplierPayments.createdAt));

  // Compute allocated and unallocated amounts for each payment
  const results = [];
  for (const p of list) {
    const allocSum = await db.select({
      sum: sql<number>`COALESCE(SUM(${supplierPaymentAllocations.amount}), 0)::int`
    })
    .from(supplierPaymentAllocations)
    .where(eq(supplierPaymentAllocations.paymentId, p.id));

    const allocatedAmount = allocSum[0]?.sum || 0;
    const unallocatedAmount = Math.max(0, p.amount - allocatedAmount);

    results.push({
      ...p,
      allocatedAmount,
      unallocatedAmount,
    });
  }

  return results;
}

/**
 * Detailed supplier payment view with line allocations
 */
export async function getSupplierPaymentDetail(id: string) {
  const list = await db.select().from(supplierPayments).where(eq(supplierPayments.id, id));
  if (list.length === 0) {
    throw new Error("Supplier payment record not found.");
  }
  const payment = list[0];

  const supplierList = await db.select().from(suppliers).where(eq(suppliers.id, payment.supplierId));
  const accountList = await db.select().from(accounts).where(eq(accounts.id, payment.paymentAccountId));

  const allocationsList = await db.select({
    id: supplierPaymentAllocations.id,
    amount: supplierPaymentAllocations.amount,
    purchaseBillId: supplierPaymentAllocations.purchaseBillId,
    billNumber: purchaseBills.billNumber,
    billDate: purchaseBills.billDate,
    billTotal: purchaseBills.total,
    supplierInvoiceNumber: purchaseBills.supplierInvoiceNumber,
    billStatus: purchaseBills.status,
  })
  .from(supplierPaymentAllocations)
  .innerJoin(purchaseBills, eq(supplierPaymentAllocations.purchaseBillId, purchaseBills.id))
  .where(eq(supplierPaymentAllocations.paymentId, id));

  const enrichedAllocations = await Promise.all(allocationsList.map(async (a) => {
    const currentOutstanding = await getBillOutstandingBalance(a.purchaseBillId, id);
    const isStale = payment.status === 'Draft' && (a.amount > currentOutstanding || a.billStatus !== 'Posted');
    return {
      ...a,
      currentOutstanding,
      isStale,
    };
  }));

  const totalAllocated = enrichedAllocations.reduce((sum, a) => sum + a.amount, 0);

  return {
    ...payment,
    supplier: supplierList[0],
    account: accountList[0],
    allocations: enrichedAllocations,
    allocatedAmount: totalAllocated,
    unallocatedAmount: Math.max(0, payment.amount - totalAllocated),
    hasStaleAllocations: enrichedAllocations.some((a) => a.isStale),
  };
}
