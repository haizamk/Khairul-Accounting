import { db } from '../db/index.ts';
import { purchaseBills, suppliers, purchaseBillLines, accounts, supplierPayments, supplierPaymentAllocations } from '../db/schema.ts';
import { eq, and, sql, asc, desc } from 'drizzle-orm';

export interface APAgingBucket {
  supplierCode: string;
  name: string;
  current: number; // in cents
  oneToThirty: number;
  thirtyOneToSixty: number;
  sixtyOneToNinety: number;
  ninetyPlus: number;
  totalOutstanding: number;
}

function parseDateToUtcMidnight(input?: string | Date): number {
  if (!input) {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
  if (typeof input === 'string') {
    const cleanStr = input.split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      return Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  const d = new Date(input);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Calculates Accounts Payable (AP) aging bucket allocations based on remaining outstanding balance of Posted bills
 */
export async function calculateAPAging(pivotDateStr?: string): Promise<APAgingBucket[]> {
  const pivotTime = parseDateToUtcMidnight(pivotDateStr);

  // Fetch all Posted purchase bills
  const bills = await db.select({
    id: purchaseBills.id,
    billNumber: purchaseBills.billNumber,
    supplierId: purchaseBills.supplierId,
    supplierInvoiceNumber: purchaseBills.supplierInvoiceNumber,
    billDate: purchaseBills.billDate,
    dueDate: purchaseBills.dueDate,
    total: purchaseBills.total,
    supplierCode: suppliers.supplierCode,
    supplierName: suppliers.name,
  })
  .from(purchaseBills)
  .innerJoin(suppliers, eq(purchaseBills.supplierId, suppliers.id))
  .where(eq(purchaseBills.status, 'Posted'));

  // Group by supplier
  const supplierMap = new Map<string, APAgingBucket>();

  for (const bill of bills) {
    // Calculate total allocated from Posted supplier payments
    const allocatedResult = await db.select({
      sum: sql<number>`COALESCE(SUM(${supplierPaymentAllocations.amount}), 0)::int`
    })
    .from(supplierPaymentAllocations)
    .innerJoin(supplierPayments, eq(supplierPaymentAllocations.paymentId, supplierPayments.id))
    .where(
      and(
        eq(supplierPaymentAllocations.purchaseBillId, bill.id),
        eq(supplierPayments.status, 'Posted')
      )
    );

    const totalAllocated = allocatedResult[0]?.sum || 0;
    const outstanding = bill.total - totalAllocated;

    // Fully paid or zero-balance bills excluded from aging
    if (outstanding <= 0) {
      continue;
    }

    const dueTime = parseDateToUtcMidnight(bill.dueDate);
    const diffDays = Math.round((pivotTime - dueTime) / (1000 * 60 * 60 * 24));

    let bucket: 'current' | 'oneToThirty' | 'thirtyOneToSixty' | 'sixtyOneToNinety' | 'ninetyPlus' = 'current';

    if (diffDays <= 0) {
      bucket = 'current';
    } else if (diffDays <= 30) {
      bucket = 'oneToThirty';
    } else if (diffDays <= 60) {
      bucket = 'thirtyOneToSixty';
    } else if (diffDays <= 90) {
      bucket = 'sixtyOneToNinety';
    } else {
      bucket = 'ninetyPlus';
    }

    if (!supplierMap.has(bill.supplierId)) {
      supplierMap.set(bill.supplierId, {
        supplierCode: bill.supplierCode,
        name: bill.supplierName,
        current: 0,
        oneToThirty: 0,
        thirtyOneToSixty: 0,
        sixtyOneToNinety: 0,
        ninetyPlus: 0,
        totalOutstanding: 0,
      });
    }

    const aging = supplierMap.get(bill.supplierId)!;
    aging[bucket] += outstanding;
    aging.totalOutstanding += outstanding;
  }

  return Array.from(supplierMap.values()).sort((a, b) => a.supplierCode.localeCompare(b.supplierCode));
}

/**
 * Returns dynamic AP summaries including total outstanding and document ledger for a supplier
 */
export async function getSupplierStatement(supplierId: string) {
  const supplierList = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (supplierList.length === 0) {
    throw new Error("Supplier profile not found.");
  }
  const supplier = supplierList[0];

  // Fetch Posted Bills
  const bills = await db.select({
    id: purchaseBills.id,
    type: sql<string>`'Purchase Bill'`,
    reference: purchaseBills.billNumber,
    supplierInvoiceNumber: purchaseBills.supplierInvoiceNumber,
    date: purchaseBills.billDate,
    dueDate: purchaseBills.dueDate,
    amount: purchaseBills.total,
    status: purchaseBills.status,
  })
  .from(purchaseBills)
  .where(
    and(
      eq(purchaseBills.supplierId, supplierId),
      eq(purchaseBills.status, 'Posted')
    )
  );

  // Fetch Posted Supplier Payments
  const payments = await db.select({
    id: supplierPayments.id,
    type: sql<string>`'Supplier Payment'`,
    reference: supplierPayments.paymentNumber,
    supplierInvoiceNumber: supplierPayments.reference,
    date: supplierPayments.paymentDate,
    dueDate: sql<string | null>`NULL`,
    amount: supplierPayments.amount,
    status: supplierPayments.status,
  })
  .from(supplierPayments)
  .where(
    and(
      eq(supplierPayments.supplierId, supplierId),
      eq(supplierPayments.status, 'Posted')
    )
  );

  // Combine documents and sort chronologically
  const combined = [
    ...bills.map(b => ({
      id: b.id,
      type: 'Purchase Bill',
      reference: b.reference,
      supplierInvoiceNumber: b.supplierInvoiceNumber,
      date: b.date,
      dueDate: b.dueDate,
      debit: 0,
      credit: b.amount, // Credit AP increases liability
      status: b.status,
    })),
    ...payments.map(p => ({
      id: p.id,
      type: 'Supplier Payment',
      reference: p.reference,
      supplierInvoiceNumber: p.supplierInvoiceNumber,
      date: p.date,
      dueDate: null,
      debit: p.amount, // Debit AP reduces liability
      credit: 0,
      status: p.status,
    }))
  ].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    // On same date, bills precede payments
    return a.type === 'Purchase Bill' ? -1 : 1;
  });

  // In AP (liability):
  // Bills are Credits to AP (increasing what we owe the supplier).
  // Payments are Debits to AP (reducing what we owe).
  let runningBalance = 0;
  const statementLines = combined.map((doc) => {
    runningBalance += (doc.credit - doc.debit);
    return {
      id: doc.id,
      type: doc.type,
      date: doc.date,
      reference: doc.reference,
      supplierInvoiceNumber: doc.supplierInvoiceNumber,
      dueDate: doc.dueDate,
      debit: doc.debit,
      credit: doc.credit,
      runningBalance,
      status: doc.status,
    };
  });

  return {
    supplier,
    totalOutstanding: runningBalance,
    statementLines,
  };
}

/**
 * Lists all posted and outstanding accounts payable purchase bills
 */
export async function getOutstandingAP() {
  const bills = await db.select({
    id: purchaseBills.id,
    billNumber: purchaseBills.billNumber,
    supplierInvoiceNumber: purchaseBills.supplierInvoiceNumber,
    billDate: purchaseBills.billDate,
    dueDate: purchaseBills.dueDate,
    total: purchaseBills.total,
    supplierCode: suppliers.supplierCode,
    supplierName: suppliers.name,
  })
  .from(purchaseBills)
  .innerJoin(suppliers, eq(purchaseBills.supplierId, suppliers.id))
  .where(eq(purchaseBills.status, 'Posted'))
  .orderBy(asc(purchaseBills.dueDate));

  const list = [];
  for (const b of bills) {
    const allocatedResult = await db.select({
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

    const totalAllocated = allocatedResult[0]?.sum || 0;
    const outstanding = b.total - totalAllocated;

    if (outstanding > 0) {
      list.push({
        ...b,
        allocatedAmount: totalAllocated,
        outstanding,
      });
    }
  }

  return list;
}
