import { db } from '../db/index.ts';
import { 
  purchaseBills, 
  purchaseBillLines, 
  suppliers, 
  accounts, 
  journalEntries, 
  journalLines, 
  auditLogs,
  supplierPayments,
  supplierPaymentAllocations
} from '../db/schema.ts';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import { validateAccountingPeriod, postJournalEntry, voidJournalEntry } from './accounting.ts';

export interface BillLineInput {
  description: string;
  quantity: number;
  unitPrice: number; // in cents
  expenseAccountId: string;
}

export interface PurchaseBillInput {
  supplierId: string;
  supplierInvoiceNumber?: string;
  billDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  discount?: number; // in cents
  lines: BillLineInput[];
}

/**
 * Generate a unique, sequential purchase bill number on the server
 * Format: BILL-YYYY-000001
 */
export async function generateBillNumber(billDate: string): Promise<string> {
  const year = billDate.split('-')[0] || new Date().getFullYear().toString();
  const prefix = `BILL-${year}-`;

  const matches = await db.select({ billNumber: purchaseBills.billNumber })
    .from(purchaseBills)
    .where(sql`bill_number LIKE ${prefix || ''} || '%'`)
    .orderBy(desc(purchaseBills.billNumber))
    .limit(1);

  if (matches.length === 0) {
    return `${prefix}000001`;
  }

  const highestNumStr = matches[0].billNumber.replace(prefix, '');
  const highestNum = parseInt(highestNumStr, 10);
  if (isNaN(highestNum)) {
    return `${prefix}000001`;
  }

  const nextNum = highestNum + 1;
  const sequentialStr = nextNum.toString().padStart(6, '0');
  return `${prefix}${sequentialStr}`;
}

/**
 * Create a new Draft purchase bill
 */
export async function createPurchaseBill(input: PurchaseBillInput, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create purchase bills.");
  }

  if (!input.supplierId || !input.billDate || !input.dueDate || !input.lines || input.lines.length === 0) {
    throw new Error("Validation Error: Supplier, bill date, due date, and at least one line item are required.");
  }

  // 1. Resolve supplier
  const supplierList = await db.select().from(suppliers).where(eq(suppliers.id, input.supplierId));
  if (supplierList.length === 0) {
    throw new Error("Validation Error: Selected supplier does not exist.");
  }
  const supplier = supplierList[0];
  if (!supplier.isActive) {
    throw new Error(`Validation Error: Supplier '${supplier.name}' is inactive. Cannot create bills.`);
  }

  // 2. Generate Number
  const billNumber = await generateBillNumber(input.billDate);

  // 3. Calculate Totals strictly on server side
  let subtotal = 0;
  const lineValues: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    expenseAccountId: string;
  }> = [];
  for (const l of input.lines) {
    if (l.quantity <= 0 || l.unitPrice <= 0) {
      throw new Error("Validation Error: Quantity and Unit Price must be positive values greater than zero.");
    }

    // Verify expense account exists
    const accList = await db.select().from(accounts).where(eq(accounts.id, l.expenseAccountId));
    if (accList.length === 0) {
      throw new Error(`Validation Error: Selected expense account '${l.expenseAccountId}' does not exist.`);
    }

    const lineTotal = Math.round(l.quantity * l.unitPrice);
    subtotal += lineTotal;
    lineValues.push({
      description: l.description.trim(),
      quantity: l.quantity,
      unitPrice: Math.round(l.unitPrice),
      lineTotal,
      expenseAccountId: l.expenseAccountId,
    });
  }

  const discount = Math.round(input.discount || 0);
  if (discount < 0) {
    throw new Error("Validation Error: Discount must be non-negative.");
  }
  const total = subtotal - discount;
  if (total < 0) {
    throw new Error("Validation Error: Discount cannot exceed the subtotal.");
  }

  return await db.transaction(async (tx) => {
    // Insert header
    const bill = await tx.insert(purchaseBills)
      .values({
        billNumber,
        supplierId: input.supplierId,
        supplierInvoiceNumber: input.supplierInvoiceNumber?.trim() || null,
        billDate: input.billDate,
        dueDate: input.dueDate,
        status: 'Draft',
        subtotal,
        discount,
        total,
        createdBy: creatorUid,
      })
      .returning();

    const billId = bill[0].id;

    // Insert lines
    for (const l of lineValues) {
      await tx.insert(purchaseBillLines)
        .values({
          billId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          expenseAccountId: l.expenseAccountId,
        });
    }

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'BILL_CREATE',
      tableName: 'purchase_bills',
      recordId: billId,
      newValues: {
        billNumber,
        supplierId: input.supplierId,
        total,
        supplierInvoiceNumber: input.supplierInvoiceNumber || null,
      },
    });

    return billId;
  });
}

/**
 * Edit an existing Draft purchase bill
 */
export async function editDraftBill(id: string, input: Partial<PurchaseBillInput>, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot edit purchase bills.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, id));
    if (currentList.length === 0) {
      throw new Error("Purchase bill not found.");
    }
    const current = currentList[0];
    if (current.status !== 'Draft') {
      throw new Error(`Immutability Rule: Posted or Voided bills cannot be edited. Status: '${current.status}'`);
    }

    // Re-verify supplier if changed
    if (input.supplierId && input.supplierId !== current.supplierId) {
      const supplierList = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId));
      if (supplierList.length === 0 || !supplierList[0].isActive) {
        throw new Error("Validation Error: Selected supplier is inactive or does not exist.");
      }
    }

    let subtotal = current.subtotal;
    let discount = input.discount !== undefined ? Math.round(input.discount) : current.discount;
    if (discount < 0) {
      throw new Error("Validation Error: Discount must be non-negative.");
    }

    // Re-calculate totals if lines are provided
    let lineValues: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      expenseAccountId: string;
    }> = [];

    if (input.lines && input.lines.length > 0) {
      subtotal = 0;
      for (const line of input.lines) {
        if (line.quantity <= 0 || line.unitPrice <= 0) {
          throw new Error("Validation Error: Quantity and Unit Price must be positive values.");
        }
        const accList = await tx.select().from(accounts).where(eq(accounts.id, line.expenseAccountId));
        if (accList.length === 0) {
          throw new Error(`Validation Error: Selected account '${line.expenseAccountId}' does not exist.`);
        }
        const lineTotal = Math.round(line.quantity * line.unitPrice);
        subtotal += lineTotal;
        lineValues.push({
          description: line.description.trim(),
          quantity: line.quantity,
          unitPrice: Math.round(line.unitPrice),
          lineTotal,
          expenseAccountId: line.expenseAccountId,
        });
      }
    }

    const total = subtotal - discount;
    if (total < 0) {
      throw new Error("Validation Error: Discount cannot exceed the subtotal.");
    }

    // Update Header
    await tx.update(purchaseBills)
      .set({
        supplierId: input.supplierId || undefined,
        supplierInvoiceNumber: input.supplierInvoiceNumber !== undefined ? (input.supplierInvoiceNumber?.trim() || null) : undefined,
        billDate: input.billDate || undefined,
        dueDate: input.dueDate || undefined,
        discount,
        subtotal,
        total,
        updatedAt: new Date(),
      })
      .where(eq(purchaseBills.id, id));

    // Update Lines if updated
    if (input.lines && input.lines.length > 0) {
      await tx.delete(purchaseBillLines).where(eq(purchaseBillLines.billId, id));
      for (const l of lineValues) {
        await tx.insert(purchaseBillLines)
          .values({
            billId: id,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            expenseAccountId: l.expenseAccountId,
          });
      }
    }

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'BILL_UPDATE',
      tableName: 'purchase_bills',
      recordId: id,
      newValues: {
        total,
        subtotal,
        discount,
        lineCount: input.lines ? input.lines.length : undefined,
      },
    });

    return id;
  });
}

/**
 * Delete a Draft purchase bill (Posted/Voided bills cannot be deleted)
 */
export async function deletePurchaseBill(id: string, userUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot delete purchase bills.");
  }

  const currentList = await db.select().from(purchaseBills).where(eq(purchaseBills.id, id));
  if (currentList.length === 0) {
    throw new Error("Purchase bill not found.");
  }
  const bill = currentList[0];

  if (bill.status !== 'Draft') {
    throw new Error(`Immutability Rule: Posted or Voided purchase bills cannot be deleted. Current status: '${bill.status}'`);
  }

  return await db.transaction(async (tx) => {
    await tx.delete(purchaseBillLines).where(eq(purchaseBillLines.billId, id));
    await tx.delete(purchaseBills).where(eq(purchaseBills.id, id));

    await tx.insert(auditLogs).values({
      userId: userUid,
      action: 'BILL_DELETE',
      tableName: 'purchase_bills',
      recordId: id,
      oldValues: bill,
    });

    return { success: true };
  });
}

/**
 * Atomic Double-Entry Purchase Bill Posting Engine
 * Debit:  Expense Accounts (Lines)
 * Credit: Accounts Payable (Liability 2000)
 */
export async function postPurchaseBill(id: string, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot post purchase bills.");
  }

  return await db.transaction(async (tx) => {
    // 1. Fetch Bill
    const currentList = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, id));
    if (currentList.length === 0) {
      throw new Error("Purchase bill not found.");
    }
    const bill = currentList[0];

    if (bill.status !== 'Draft') {
      throw new Error(`Validation Error: Purchase bill cannot be posted because its current status is '${bill.status}'. Only Draft bills can be posted.`);
    }

    // Verify supplier is active
    const supplierList = await tx.select().from(suppliers).where(eq(suppliers.id, bill.supplierId));
    if (supplierList.length === 0 || !supplierList[0].isActive) {
      throw new Error(`Validation Error: Supplier '${supplierList[0]?.name || bill.supplierId}' is inactive. Cannot post bills for inactive suppliers.`);
    }

    // 2. Validate period
    await validateAccountingPeriod(bill.billDate);

    // 3. Resolve Accounts Payable liability account (code '2000' or subType 'AccountsPayable')
    const apAccounts = await tx.select().from(accounts).where(eq(accounts.subType, 'AccountsPayable'));
    if (apAccounts.length === 0) {
      throw new Error("Configuration Error: No active Accounts Payable liability account has been initialized in the Chart of Accounts.");
    }
    const apAccount = apAccounts[0];

    const billLinesList = await tx.select().from(purchaseBillLines).where(eq(purchaseBillLines.billId, id));
    if (billLinesList.length === 0) {
      throw new Error("Validation Error: Cannot post a purchase bill with zero lines.");
    }

    // 4. Create standard double-entry journal entry to core ledger:
    // Debit lines: Dr Expense / Purchase accounts from lines
    // Credit line: Cr Accounts Payable (Liability) for grand total
    const journalLinesData: Array<{ accountId: string; debit: number; credit: number; description?: string }> = [];

    // Debit each line's expense account
    for (const line of billLinesList) {
      journalLinesData.push({
        accountId: line.expenseAccountId,
        debit: line.lineTotal,
        credit: 0,
        description: line.description,
      });
    }

    // Credit line: Accounts Payable for bill total
    journalLinesData.push({
      accountId: apAccount.id,
      debit: 0,
      credit: bill.total,
      description: `AP for Bill ${bill.billNumber}${bill.supplierInvoiceNumber ? ` (Ref: ${bill.supplierInvoiceNumber})` : ''}`,
    });

    // Parity verification
    const totalDebit = journalLinesData.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = journalLinesData.reduce((sum, l) => sum + l.credit, 0);

    // If discount was applied, the debit lines sum to subtotal, credit AP is total (subtotal - discount).
    // In standard accounting, Discount Received is an Income/Reduction account or adjusted.
    // Check if totalDebit !== totalCredit:
    if (totalDebit !== totalCredit) {
      const discountDiff = totalDebit - totalCredit;
      if (discountDiff > 0 && bill.discount > 0) {
        // Resolve Discount Received / Other Income account or SST/Adjustment
        const discountAccounts = await tx.select().from(accounts).where(eq(accounts.code, '5999')); // Misc expense reduction or general
        const discountAccount = discountAccounts.length > 0 ? discountAccounts[0] : apAccount;
        // Credit the discount to balance Dr Subtotal, Cr Discount, Cr AP
        journalLinesData.push({
          accountId: discountAccount.id,
          debit: 0,
          credit: discountDiff,
          description: `Discount Received on Bill ${bill.billNumber}`,
        });
      } else {
        throw new Error(`Parity Error: Debits (RM ${(totalDebit / 100).toFixed(2)}) do not match credits (RM ${(totalCredit / 100).toFixed(2)}).`);
      }
    }

    // 5. Post Journal Entry atomically
    const journalId = await postJournalEntry({
      entryDate: bill.billDate,
      reference: bill.billNumber,
      description: `Purchase Bill Post: ${bill.billNumber}${bill.supplierInvoiceNumber ? ` [Ref: ${bill.supplierInvoiceNumber}]` : ''}`,
      lines: journalLinesData,
    }, creatorUid, userRole, tx);

    // 6. Update Purchase Bill status to Posted and attach Journal reference
    await tx.update(purchaseBills)
      .set({
        status: 'Posted',
        postedJournalId: journalId,
        updatedAt: new Date(),
      })
      .where(eq(purchaseBills.id, id));

    // 7. Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'BILL_POST',
      tableName: 'purchase_bills',
      recordId: id,
      newValues: {
        billNumber: bill.billNumber,
        total: bill.total,
        journalId,
      },
    });

    return { billId: id, journalId };
  });
}

/**
 * Atomic Double-Entry Purchase Bill Void Engine
 */
export async function voidPurchaseBill(id: string, reason: string, userUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot void purchase bills.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("Validation Error: A specific reason must be provided when voiding a purchase bill.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, id));
    if (currentList.length === 0) {
      throw new Error("Purchase bill not found.");
    }
    const bill = currentList[0];

    if (bill.status !== 'Posted') {
      throw new Error(`Validation Error: Only Posted purchase bills can be voided. Current status: '${bill.status}'`);
    }

    // Period check for bill date
    await validateAccountingPeriod(bill.billDate);

    // Void the linked journal entry
    if (bill.postedJournalId) {
      await voidJournalEntry(bill.postedJournalId, reason, userUid, userRole, tx);
    }

    // Update bill status to Voided
    await tx.update(purchaseBills)
      .set({
        status: 'Voided',
        updatedAt: new Date(),
      })
      .where(eq(purchaseBills.id, id));

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: userUid,
      action: 'BILL_VOID',
      tableName: 'purchase_bills',
      recordId: id,
      newValues: {
        billNumber: bill.billNumber,
        status: 'Voided',
        voidReason: reason,
      },
    });

    return { billId: id, status: 'Voided' };
  });
}

/**
 * List purchase bills with supplier relation
 */
export async function getPurchaseBills(filters?: { status?: string; supplierId?: string; search?: string }) {
  const query = db.select({
    id: purchaseBills.id,
    billNumber: purchaseBills.billNumber,
    supplierId: purchaseBills.supplierId,
    supplierInvoiceNumber: purchaseBills.supplierInvoiceNumber,
    billDate: purchaseBills.billDate,
    dueDate: purchaseBills.dueDate,
    status: purchaseBills.status,
    subtotal: purchaseBills.subtotal,
    discount: purchaseBills.discount,
    total: purchaseBills.total,
    postedJournalId: purchaseBills.postedJournalId,
    createdAt: purchaseBills.createdAt,
    supplierCode: suppliers.supplierCode,
    supplierName: suppliers.name,
  })
  .from(purchaseBills)
  .innerJoin(suppliers, eq(purchaseBills.supplierId, suppliers.id));

  const conditions = [];

  if (filters?.status && filters.status !== 'All') {
    conditions.push(eq(purchaseBills.status, filters.status));
  }

  if (filters?.supplierId) {
    conditions.push(eq(purchaseBills.supplierId, filters.supplierId));
  }

  if (filters?.search && filters.search.trim()) {
    const term = filters.search.trim();
    conditions.push(
      sql`(${purchaseBills.billNumber} LIKE ${`%${term}%`} OR ${suppliers.name} LIKE ${`%${term}%`} OR ${suppliers.supplierCode} LIKE ${`%${term}%`} OR ${purchaseBills.supplierInvoiceNumber} LIKE ${`%${term}%`})`
    );
  }

  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  const billList = await query.orderBy(desc(purchaseBills.createdAt));

  // Compute allocated amounts and payment status
  const enriched = [];
  for (const b of billList) {
    const allocSum = await db.select({
      sum: sql<number>`COALESCE(SUM(${supplierPaymentAllocations.amount}), 0)::int`
    })
    .from(supplierPaymentAllocations)
    .innerJoin(supplierPayments, eq(supplierPaymentAllocations.paymentId, supplierPayments.id))
    .where(
      and(
        eq(supplierPaymentAllocations.purchaseBillId, b.id),
        eq(supplierPayments.status, 'Posted')
      )
    );

    const allocatedAmount = allocSum[0]?.sum || 0;
    const outstandingBalance = Math.max(0, b.total - allocatedAmount);

    let paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
    if (allocatedAmount >= b.total && b.total > 0) {
      paymentStatus = 'PAID';
    } else if (allocatedAmount > 0) {
      paymentStatus = 'PARTIALLY_PAID';
    }

    enriched.push({
      ...b,
      allocatedAmount,
      outstandingBalance,
      paymentStatus,
    });
  }

  return enriched;
}

/**
 * Get detailed purchase bill document with lines and expense account details
 */
export async function getPurchaseBillDetail(id: string) {
  const bills = await db.select({
    id: purchaseBills.id,
    billNumber: purchaseBills.billNumber,
    supplierId: purchaseBills.supplierId,
    supplierInvoiceNumber: purchaseBills.supplierInvoiceNumber,
    billDate: purchaseBills.billDate,
    dueDate: purchaseBills.dueDate,
    status: purchaseBills.status,
    subtotal: purchaseBills.subtotal,
    discount: purchaseBills.discount,
    total: purchaseBills.total,
    postedJournalId: purchaseBills.postedJournalId,
    createdBy: purchaseBills.createdBy,
    createdAt: purchaseBills.createdAt,
    supplierCode: suppliers.supplierCode,
    supplierName: suppliers.name,
    supplierPhone: suppliers.phone,
    supplierEmail: suppliers.email,
    supplierAddress: suppliers.address,
  })
  .from(purchaseBills)
  .innerJoin(suppliers, eq(purchaseBills.supplierId, suppliers.id))
  .where(eq(purchaseBills.id, id));

  if (bills.length === 0) {
    throw new Error("Purchase bill not found.");
  }
  const bill = bills[0];

  const lines = await db.select({
    id: purchaseBillLines.id,
    description: purchaseBillLines.description,
    quantity: purchaseBillLines.quantity,
    unitPrice: purchaseBillLines.unitPrice,
    lineTotal: purchaseBillLines.lineTotal,
    expenseAccountId: purchaseBillLines.expenseAccountId,
    accountCode: accounts.code,
    accountName: accounts.name,
  })
  .from(purchaseBillLines)
  .innerJoin(accounts, eq(purchaseBillLines.expenseAccountId, accounts.id))
  .where(eq(purchaseBillLines.billId, id));

  // Compute allocations
  const allocationsList = await db.select({
    id: supplierPaymentAllocations.id,
    amount: supplierPaymentAllocations.amount,
    paymentId: supplierPaymentAllocations.paymentId,
    paymentNumber: supplierPayments.paymentNumber,
    paymentDate: supplierPayments.paymentDate,
    paymentReference: supplierPayments.reference,
    paymentStatus: supplierPayments.status,
  })
  .from(supplierPaymentAllocations)
  .innerJoin(supplierPayments, eq(supplierPaymentAllocations.paymentId, supplierPayments.id))
  .where(
    and(
      eq(supplierPaymentAllocations.purchaseBillId, id),
      eq(supplierPayments.status, 'Posted')
    )
  );

  const allocatedAmount = allocationsList.reduce((sum, a) => sum + a.amount, 0);
  const outstandingBalance = Math.max(0, bill.total - allocatedAmount);

  let paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
  if (allocatedAmount >= bill.total && bill.total > 0) {
    paymentStatus = 'PAID';
  } else if (allocatedAmount > 0) {
    paymentStatus = 'PARTIALLY_PAID';
  }

  return {
    ...bill,
    lines,
    allocations: allocationsList,
    allocatedAmount,
    outstandingBalance,
    paymentStatus,
  };
}
