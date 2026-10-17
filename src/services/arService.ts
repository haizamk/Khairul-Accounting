import { db } from '../db/index.ts';
import { salesInvoices, customers, salesInvoiceLines, accounts, customerPayments, paymentAllocations, companyProfile } from '../db/schema.ts';
import { eq, and, sql, asc, desc, gte, lte, lt } from 'drizzle-orm';
import { parseCustomerNotes } from './customerService.ts';

export interface AgingBucket {
  customerCode: string;
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
 * Calculates AR aging bucket allocations based on outstanding balance of Posted invoices
 */
export async function calculateARAging(pivotDateStr?: string): Promise<AgingBucket[]> {
  const pivotTime = parseDateToUtcMidnight(pivotDateStr);

  // Fetch all Posted invoices
  const invoices = await db.select({
    id: salesInvoices.id,
    invoiceNumber: salesInvoices.invoiceNumber,
    customerId: salesInvoices.customerId,
    invoiceDate: salesInvoices.invoiceDate,
    dueDate: salesInvoices.dueDate,
    total: salesInvoices.total,
    customerCode: customers.customerCode,
    customerName: customers.name,
  })
  .from(salesInvoices)
  .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
  .where(eq(salesInvoices.status, 'Posted'));

  // Group by customer
  const customerMap = new Map<string, AgingBucket>();

  for (const inv of invoices) {
    // Calculate total allocated from Posted payments
    const allocatedResult = await db.select({
      sum: sql<number>`COALESCE(SUM(${paymentAllocations.amount}), 0)::int`
    })
    .from(paymentAllocations)
    .innerJoin(customerPayments, eq(paymentAllocations.paymentId, customerPayments.id))
    .where(
      and(
        eq(paymentAllocations.invoiceId, inv.id),
        eq(customerPayments.status, 'Posted')
      )
    );

    const totalAllocated = allocatedResult[0]?.sum || 0;
    const outstanding = inv.total - totalAllocated;

    if (outstanding <= 0) {
      continue; // Skip fully paid invoices in aging calculation
    }

    const dueTime = parseDateToUtcMidnight(inv.dueDate);
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

    if (!customerMap.has(inv.customerId)) {
      customerMap.set(inv.customerId, {
        customerCode: inv.customerCode,
        name: inv.customerName,
        current: 0,
        oneToThirty: 0,
        thirtyOneToSixty: 0,
        sixtyOneToNinety: 0,
        ninetyPlus: 0,
        totalOutstanding: 0,
      });
    }

    const aging = customerMap.get(inv.customerId)!;
    aging[bucket] += outstanding;
    aging.totalOutstanding += outstanding;
  }

  return Array.from(customerMap.values()).sort((a, b) => a.customerCode.localeCompare(b.customerCode));
}

/**
 * Returns dynamic AR summaries including opening balance, period debits/credits, closing balance, and transaction ledger
 */
export async function getCustomerStatement(customerId: string, startDateStr?: string, endDateStr?: string) {
  const customerList = await db.select().from(customers).where(eq(customers.id, customerId));
  if (customerList.length === 0) {
    throw new Error("Customer profile not found.");
  }
  const rawCustomer = customerList[0];
  const { cleanNotes, defaults } = parseCustomerNotes(rawCustomer.notes);
  const customer = {
    ...rawCustomer,
    notes: cleanNotes,
    ...defaults,
  };

  // Fetch Company Profile
  const companyList = await db.select().from(companyProfile);
  const company = companyList[0] || null;

  // Default or parsed date range
  const nowStr = new Date().toISOString().split('T')[0];
  const currentYear = new Date(nowStr).getFullYear();
  const defaultStartDate = `${currentYear}-01-01`;
  const startDate = startDateStr && startDateStr.trim() !== '' ? startDateStr : defaultStartDate;
  const endDate = endDateStr && endDateStr.trim() !== '' ? endDateStr : nowStr;

  if (startDate > endDate) {
    throw new Error("Validation Error: Tarikh mula tidak boleh melebihi tarikh tamat.");
  }

  // 1. Calculate Opening Balance (Posted transactions prior to startDate)
  const priorInvoices = await db.select({
    total: salesInvoices.total,
  })
  .from(salesInvoices)
  .where(
    and(
      eq(salesInvoices.customerId, customerId),
      eq(salesInvoices.status, 'Posted'),
      lt(salesInvoices.invoiceDate, startDate)
    )
  );

  const priorPayments = await db.select({
    amount: customerPayments.amount,
  })
  .from(customerPayments)
  .where(
    and(
      eq(customerPayments.customerId, customerId),
      eq(customerPayments.status, 'Posted'),
      lt(customerPayments.paymentDate, startDate)
    )
  );

  const priorDebits = priorInvoices.reduce((sum, inv) => sum + inv.total, 0);
  const priorCredits = priorPayments.reduce((sum, pay) => sum + pay.amount, 0);
  const openingBalance = priorDebits - priorCredits; // in cents

  // 2. Fetch Period Transactions (between startDate and endDate)
  const periodInvoices = await db.select({
    id: salesInvoices.id,
    type: sql<string>`'Invoice'`,
    reference: salesInvoices.invoiceNumber,
    date: salesInvoices.invoiceDate,
    dueDate: salesInvoices.dueDate,
    amount: salesInvoices.total,
    status: salesInvoices.status,
  })
  .from(salesInvoices)
  .where(
    and(
      eq(salesInvoices.customerId, customerId),
      eq(salesInvoices.status, 'Posted'),
      gte(salesInvoices.invoiceDate, startDate),
      lte(salesInvoices.invoiceDate, endDate)
    )
  );

  const periodPayments = await db.select({
    id: customerPayments.id,
    type: sql<string>`'Payment'`,
    reference: customerPayments.paymentReference,
    date: customerPayments.paymentDate,
    dueDate: sql<string | null>`NULL`,
    amount: customerPayments.amount,
    status: customerPayments.status,
  })
  .from(customerPayments)
  .where(
    and(
      eq(customerPayments.customerId, customerId),
      eq(customerPayments.status, 'Posted'),
      gte(customerPayments.paymentDate, startDate),
      lte(customerPayments.paymentDate, endDate)
    )
  );

  // Combine and sort chronologically
  const combined = [
    ...periodInvoices.map(i => ({
      id: i.id,
      type: 'Invoice',
      reference: i.reference,
      date: i.date,
      dueDate: i.dueDate,
      debit: i.amount,
      credit: 0,
      description: `Invois Jualan #${i.reference}`,
      status: i.status
    })),
    ...periodPayments.map(p => ({
      id: p.id,
      type: 'Payment',
      reference: p.reference,
      date: p.date,
      dueDate: null,
      debit: 0,
      credit: p.amount,
      description: `Resit Pembayaran Ref: ${p.reference}`,
      status: p.status
    }))
  ].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    if (a.type !== b.type) return a.type === 'Invoice' ? -1 : 1;
    return a.reference.localeCompare(b.reference);
  });

  let runningBalance = openingBalance;
  let periodTotalDebit = 0;
  let periodTotalCredit = 0;

  const statementLines = combined.map((line) => {
    periodTotalDebit += line.debit;
    periodTotalCredit += line.credit;
    runningBalance += (line.debit - line.credit);
    return {
      id: line.id,
      type: line.type,
      date: line.date,
      reference: line.reference,
      dueDate: line.dueDate,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      runningBalance,
      status: line.status,
    };
  });

  const closingBalance = openingBalance + periodTotalDebit - periodTotalCredit;

  return {
    customer,
    company,
    statementDate: nowStr,
    startDate,
    endDate,
    openingBalance,
    periodTotalDebit,
    periodTotalCredit,
    closingBalance,
    totalOutstanding: closingBalance,
    statementLines,
  };
}

/**
 * Lists all posted and outstanding accounts receivable items
 */
export async function getOutstandingAR() {
  const invoices = await db.select({
    id: salesInvoices.id,
    invoiceNumber: salesInvoices.invoiceNumber,
    invoiceDate: salesInvoices.invoiceDate,
    dueDate: salesInvoices.dueDate,
    total: salesInvoices.total,
    customerCode: customers.customerCode,
    customerName: customers.name,
  })
  .from(salesInvoices)
  .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
  .where(eq(salesInvoices.status, 'Posted'))
  .orderBy(asc(salesInvoices.dueDate));

  const list = [];
  for (const inv of invoices) {
    // Calculate total allocated from Posted payments
    const allocatedResult = await db.select({
      sum: sql<number>`COALESCE(SUM(${paymentAllocations.amount}), 0)::int`
    })
    .from(paymentAllocations)
    .innerJoin(customerPayments, eq(paymentAllocations.paymentId, customerPayments.id))
    .where(
      and(
        eq(paymentAllocations.invoiceId, inv.id),
        eq(customerPayments.status, 'Posted')
      )
    );

    const totalAllocated = allocatedResult[0]?.sum || 0;
    const outstanding = inv.total - totalAllocated;

    if (outstanding > 0) {
      list.push({
        ...inv,
        outstanding,
      });
    }
  }

  return list;
}
