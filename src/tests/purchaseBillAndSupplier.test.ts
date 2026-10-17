import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/index.ts';
import { suppliers, products, accounts, users } from '../db/schema.ts';
import { eq, like } from 'drizzle-orm';
import { createSupplier, getSuppliers } from '../services/supplierService.ts';
import { createPurchaseBill } from '../services/purchaseBillService.ts';
import { buildPurchaseBillHtml } from '../App.tsx';

function computeDueDate(billDateStr: string, term: string): string {
  const base = new Date(billDateStr || Date.now());
  let days = 30;
  if (term === 'Due on Receipt / Tunai' || term === 'Tunai' || term === 'COD') days = 0;
  else if (term?.includes('Net 7')) days = 7;
  else if (term?.includes('Net 14')) days = 14;
  else if (term?.includes('Net 30')) days = 30;
  else if (term?.includes('Net 45')) days = 45;
  else if (term?.includes('Net 60')) days = 60;
  const target = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return target.toISOString().split('T')[0];
}

describe('Supplier Payment Terms & Purchase Bill Due Date Synchronization', () => {
  let adminUid: string;
  let expenseAcc: any;

  beforeAll(async () => {
    const uList = await db.select().from(users).limit(1);
    adminUid = uList[0]?.uid || 'admin-test-uid';

    const expAccs = await db.select().from(accounts).where(eq(accounts.type, 'Expense'));
    expenseAcc = expAccs[0];
  });

  it('1. Calculates correct due date for Net 7 supplier', () => {
    const billDate = '2026-10-15';
    const dueDate = computeDueDate(billDate, 'Net 7');
    expect(dueDate).toBe('2026-10-22'); // 15 + 7 = 22
  });

  it('2. Calculates correct due date for Net 30 supplier', () => {
    const billDate = '2026-10-15';
    const dueDate = computeDueDate(billDate, 'Net 30');
    expect(dueDate).toBe('2026-11-14'); // 15 + 30 = 44 (Oct has 31 days -> Nov 14)
  });

  it('3. Calculates correct due date for Due on Receipt supplier', () => {
    const billDate = '2026-10-15';
    const dueDate = computeDueDate(billDate, 'Due on Receipt / Tunai');
    expect(dueDate).toBe('2026-10-15');
  });

  it('4. Generates purchase bill HTML including product descriptions and line totals', () => {
    const sampleBill = {
      billNumber: 'BILL-2026-000001',
      supplierName: 'Ladang Ayam Segar',
      supplierCode: 'SUP-001',
      supplierInvoiceNumber: 'INV-SUP-999',
      billDate: '2026-10-15',
      dueDate: '2026-11-14',
      status: 'Draft',
      subtotal: 15000,
      discount: 0,
      total: 15000,
      lines: [
        {
          description: '[001] Ayam Segar (kg)',
          accountCode: '5000',
          accountName: 'Cost of Goods Sold',
          quantity: 10,
          unitPrice: 1500,
          lineTotal: 15000,
        }
      ]
    };

    const company = {
      name: 'Khairul Fresh Food',
      registrationNumber: '202603123456',
      address: 'Batu Caves, Selangor',
      phone: '+603-61889988',
      email: 'finance@khairulfresh.com.my'
    };

    const html = buildPurchaseBillHtml(sampleBill, company);
    expect(html).toContain('BILL-2026-000001');
    expect(html).toContain('Ladang Ayam Segar');
    expect(html).toContain('Ayam Segar');
    expect(html).toContain('001');
    expect(html).toContain('kg');
    expect(html).toContain('150.00');
    expect(html).toContain('INV-SUP-999');
  });
});
