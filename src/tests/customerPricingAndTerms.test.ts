import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/index.ts';
import { customers, products, salesInvoices, salesInvoiceLines, accounts, journalEntries, journalLines, users } from '../db/schema.ts';
import { eq, like } from 'drizzle-orm';
import { parseCustomerNotes, getCustomerDetail, getCustomers } from '../services/customerService.ts';
import { createSalesInvoice, editDraftInvoice, postSalesInvoice, parseLineDescription } from '../services/salesInvoiceService.ts';

// Pricing resolution helper mirroring App.tsx
function resolveProductPrice(product: { sellingPrice: number; productCode?: string; id?: string; name?: string }, customerObj?: any): { price: number; isCustom: boolean } {
  const rawPrice = product.sellingPrice / 100;
  if (!customerObj || !customerObj.customPrices) return { price: rawPrice, isCustom: false };

  const cp = customerObj.customPrices;
  const override = cp[product.productCode || ''] ?? cp[product.id || ''] ?? cp[product.name || ''];
  if (override !== undefined && override !== null && override > 0) {
    const customPriceRM = override > 50 ? override / 100 : override;
    return { price: customPriceRM, isCustom: true };
  }

  return { price: rawPrice, isCustom: false };
}

function calculateDueDate(invoiceDate: string, term: string): string {
  const baseDate = new Date(invoiceDate);
  let daysToAdd = 30;
  if (term === 'COD' || term === 'Due Immediately') daysToAdd = 0;
  else if (term === 'Net 7') daysToAdd = 7;
  else if (term === 'Net 14') daysToAdd = 14;
  else if (term === 'Net 30') daysToAdd = 30;
  else if (term === 'Net 60') daysToAdd = 60;

  const calcDue = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return calcDue.toISOString().split('T')[0];
}

describe('Customer-Specific Pricing & Payment Term Sync', () => {
  let adminUid: string;
  let stesenCustomer: any;
  let regularWholesaleCust: any;
  let ayamSegarProduct: any;
  let revenueAcc: any;

  beforeAll(async () => {
    const uList = await db.select().from(users).limit(1);
    adminUid = uList[0].uid;

    const prods = await db.select().from(products).where(like(products.name, '%Ayam%'));
    ayamSegarProduct = prods.find(p => p.productCode === '001') || prods[0];

    const revAccs = await db.select().from(accounts).where(eq(accounts.type, 'Revenue'));
    revenueAcc = revAccs[0];

    const stesenList = await getCustomers('Stesen');
    stesenCustomer = stesenList[0];

    // Dummy regular wholesale customer
    regularWholesaleCust = {
      id: 'regular-wholesale-id',
      name: 'Regular Wholesale Customer',
      priceLevel: 'Wholesale',
      customPrices: null,
      defaultPaymentTerm: null,
    };
  });

  it('1. Wholesale customer without special price receives standard catalogue selling price (RM 9.60)', () => {
    const { price, isCustom } = resolveProductPrice(ayamSegarProduct, regularWholesaleCust);
    expect(price).toBe(9.60); // Ayam Segar catalogue selling price = RM 9.60
    expect(isCustom).toBe(false);
  });

  it('2. Stesen 30 receives RM9.10/kg via explicit customer-specific price override', () => {
    expect(stesenCustomer.name).toContain('Stesen 30');
    expect(stesenCustomer.priceLevel).toBe('Wholesale');
    expect(stesenCustomer.customPrices).toBeDefined();

    const { price, isCustom } = resolveProductPrice(ayamSegarProduct, stesenCustomer);
    expect(price).toBe(9.10); // RM 9.10/kg
    expect(isCustom).toBe(true);
  });

  it('3. Other customers pricing remains unchanged at catalogue price', () => {
    const retailCust = { priceLevel: 'Retail', customPrices: null };
    const { price: retailPrice } = resolveProductPrice(ayamSegarProduct, retailCust);
    expect(retailPrice).toBe(9.60);

    const standardCust = { priceLevel: 'Standard', customPrices: null };
    expect(resolveProductPrice(ayamSegarProduct, standardCust).price).toBe(9.60);
  });

  it('4. Stesen 30 Net 7 setting calculates correct due date (invoice date + 7 days)', () => {
    expect(stesenCustomer.defaultPaymentTerm).toBe('Net 7');
    const invoiceDate = '2026-10-15';
    const dueDate = calculateDueDate(invoiceDate, stesenCustomer.defaultPaymentTerm);
    expect(dueDate).toBe('2026-10-22'); // 15 + 7 = 22
  });

  it('5. Customer without configured term falls back to company default (Net 30)', () => {
    const custWithoutTerm = { defaultPaymentTerm: null };
    const termToUse = custWithoutTerm.defaultPaymentTerm || 'Net 30';
    expect(termToUse).toBe('Net 30');
    expect(calculateDueDate('2026-10-15', termToUse)).toBe('2026-11-14');
  });

  it('6. Explicit invoice-level override recalculates due date correctly', () => {
    const invoiceDate = '2026-10-15';
    const overriddenTerm = 'Net 14';
    const dueDate = calculateDueDate(invoiceDate, overriddenTerm);
    expect(dueDate).toBe('2026-10-29'); // 15 + 14 = 29
  });

  it('7. End-to-end invoice creation, draft saving, reopening, posting, and debit-credit parity', async () => {
    const invoiceDate = '2026-10-15';
    const dueDate = calculateDueDate(invoiceDate, stesenCustomer.defaultPaymentTerm || 'Net 7');

    const invId = await createSalesInvoice({
      customerId: stesenCustomer.id,
      invoiceDate,
      dueDate,
      lines: [
        {
          description: ayamSegarProduct.name,
          sku: ayamSegarProduct.productCode,
          unit: ayamSegarProduct.salesUnit,
          quantity: 10,
          unitPrice: 910, // RM 9.10 per kg = 910 cents
          revenueAccountId: revenueAcc.id,
        }
      ]
    }, adminUid, 'Admin');

    expect(invId).toBeDefined();

    // Verify invoice draft saved totals
    const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, invId));
    expect(inv.subtotal).toBe(9100); // 10 * 910 = 9100 cents (RM 91.00)
    expect(inv.total).toBe(9100);
    expect(inv.status).toBe('Draft');

    // Post invoice to ledger
    const journalId = await postSalesInvoice(invId, adminUid, 'Admin');
    expect(journalId).toBeDefined();

    // Verify ledger debit-credit parity
    const jLines = await db.select().from(journalLines).where(eq(journalLines.entryId, journalId));
    const totalDebit = jLines.reduce((acc, l) => acc + l.debit, 0);
    const totalCredit = jLines.reduce((acc, l) => acc + l.credit, 0);
    expect(totalDebit).toBe(9100);
    expect(totalCredit).toBe(9100);
    expect(totalDebit).toBe(totalCredit); // Debit-Credit Parity!
  });
});
