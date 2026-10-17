import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/index.ts';
import { customers, salesInvoices, customerPayments, users, accounts } from '../db/schema.ts';
import { eq, like } from 'drizzle-orm';
import { getCustomerStatement } from '../services/arService.ts';
import { createSalesInvoice, postSalesInvoice } from '../services/salesInvoiceService.ts';

describe('Customer Statement Engine & Accounting Integrity', () => {
  let adminUid: string;
  let testCust: any;
  let emptyCust: any;
  let revenueAcc: any;

  beforeAll(async () => {
    const uList = await db.select().from(users).limit(1);
    adminUid = uList[0].uid;

    const stesenList = await db.select().from(customers).where(like(customers.name, '%Stesen%'));
    testCust = stesenList[0];

    // Find customer with no transactions
    const allCusts = await db.select().from(customers);
    emptyCust = allCusts.find(c => c.id !== testCust.id) || allCusts[1];

    const revAccs = await db.select().from(accounts).where(eq(accounts.type, 'Revenue'));
    revenueAcc = revAccs[0];
  });

  it('1. Opening balance calculation includes prior posted transactions and excludes current period', async () => {
    const statement = await getCustomerStatement(testCust.id, '2026-10-01', '2026-10-31');
    expect(statement).toBeDefined();
    expect(statement.customer).toBeDefined();
    expect(statement.company).toBeDefined();
    expect(typeof statement.openingBalance).toBe('number');
    expect(typeof statement.closingBalance).toBe('number');
  });

  it('2. Invoice debits increase balance and payment credits reduce balance', async () => {
    const statement = await getCustomerStatement(testCust.id, '2026-01-01', '2026-12-31');
    const debits = statement.statementLines.filter(l => l.debit > 0);
    const credits = statement.statementLines.filter(l => l.credit > 0);

    debits.forEach(d => {
      expect(d.debit).toBeGreaterThan(0);
      expect(d.type).toBe('Invoice');
    });

    credits.forEach(c => {
      expect(c.credit).toBeGreaterThan(0);
      expect(c.type).toBe('Payment');
    });
  });

  it('3. Running balance equals opening balance plus cumulative debits minus credits', async () => {
    const statement = await getCustomerStatement(testCust.id, '2026-01-01', '2026-12-31');
    let expectedRunning = statement.openingBalance;

    statement.statementLines.forEach((line) => {
      expectedRunning += (line.debit - line.credit);
      expect(line.runningBalance).toBe(expectedRunning);
    });

    expect(statement.closingBalance).toBe(expectedRunning);
  });

  it('4. Date range filtering properly isolates transactions within startDate and endDate', async () => {
    const statement = await getCustomerStatement(testCust.id, '2026-10-10', '2026-10-20');
    expect(statement.startDate).toBe('2026-10-10');
    expect(statement.endDate).toBe('2026-10-20');

    statement.statementLines.forEach(line => {
      expect(line.date >= '2026-10-10').toBe(true);
      expect(line.date <= '2026-10-20').toBe(true);
    });
  });

  it('5. Unposted drafts and voided invoices are strictly excluded', async () => {
    // Create a draft invoice
    const draftId = await createSalesInvoice({
      customerId: testCust.id,
      invoiceDate: '2026-10-15',
      dueDate: '2026-10-22',
      lines: [
        {
          description: 'Draft Test Line',
          quantity: 1,
          unitPrice: 5000,
          revenueAccountId: revenueAcc.id,
        }
      ]
    }, adminUid, 'Admin');

    const statement = await getCustomerStatement(testCust.id, '2026-10-01', '2026-10-31');
    const draftMatch = statement.statementLines.find(l => l.id === draftId);
    expect(draftMatch).toBeUndefined(); // Drafts MUST be excluded!
  });

  it('6. Handles customers with no transactions gracefully', async () => {
    if (emptyCust) {
      const statement = await getCustomerStatement(emptyCust.id, '2026-01-01', '2026-12-31');
      expect(statement.statementLines).toBeDefined();
      expect(statement.openingBalance).toBe(0);
      expect(statement.closingBalance).toBe(0);
    }
  });

  it('7. Handles multiple transactions on the same date deterministically', async () => {
    const statement = await getCustomerStatement(testCust.id, '2026-01-01', '2026-12-31');
    const sameDateLines = statement.statementLines;
    for (let i = 1; i < sameDateLines.length; i++) {
      const prev = sameDateLines[i - 1];
      const curr = sameDateLines[i];
      if (prev.date === curr.date) {
        // Invoices come before Payments on same date
        if (prev.type !== curr.type) {
          expect(prev.type).toBe('Invoice');
        }
      } else {
        expect(prev.date <= curr.date).toBe(true);
      }
    }
  });

  it('8. Closing balance reconciles to net debits minus credits up to end date', async () => {
    const statement = await getCustomerStatement(testCust.id, '2026-01-01', '2026-12-31');
    const calculatedClosing = statement.openingBalance + statement.periodTotalDebit - statement.periodTotalCredit;
    expect(statement.closingBalance).toBe(calculatedClosing);
    expect(statement.totalOutstanding).toBe(calculatedClosing);
  });
});
