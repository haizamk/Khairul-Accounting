import { describe, it, expect } from 'vitest';
import { buildCustomerStatementHtml, buildSalesInvoiceHtml } from '../App.tsx';

describe('PDF & Print HTML Generation Engine', () => {
  const mockCompany = {
    name: 'KHAIRUL FRESH PRODUCE',
    registrationNumber: '202601009999',
    address: 'Lot 102, Pasar Borong Selayang, Selangor',
    phone: '03-61234567',
    email: 'info@khairulfresh.com',
    website: 'www.khairulfresh.com',
  };

  const mockStatement = {
    company: mockCompany,
    customer: {
      name: 'Stesen 30 Sdn Bhd',
      customerCode: 'CUST-004',
      billingAddress: 'No. 30 Jalan Bandar, Kuala Lumpur',
      phone: '012-3456789',
      email: 'stesen30@example.com',
    },
    startDate: '2026-01-01',
    endDate: '2026-10-11',
    openingBalance: 15000, // RM 150.00 in cents
    periodTotalDebit: 91000, // RM 910.00 in cents
    periodTotalCredit: 50000, // RM 500.00 in cents
    closingBalance: 56000, // RM 560.00 in cents
    statementLines: [
      {
        date: '2026-01-05',
        type: 'Invoice',
        reference: 'INV-2026-001',
        dueDate: '2026-02-04',
        description: 'Invois Ayam Segar',
        debit: 91000,
        credit: 0,
        runningBalance: 106000,
      },
      {
        date: '2026-01-15',
        type: 'Payment',
        reference: 'PAY-2026-001',
        dueDate: null,
        description: 'Pembayaran Resit Bank',
        debit: 0,
        credit: 50000,
        runningBalance: 56000,
      },
    ],
  };

  it('1. Generates clean customer statement HTML with valid figures and company info', () => {
    const html = buildCustomerStatementHtml(mockStatement, mockCompany);
    expect(html).toContain('KHAIRUL FRESH PRODUCE');
    expect(html).toContain('202601009999');
    expect(html).toContain('Stesen 30 Sdn Bhd');
    expect(html).toContain('CUST-004');
    expect(html).toContain('RM 150.00'); // Opening balance
    expect(html).toContain('RM 910.00'); // Period debit
    expect(html).toContain('RM 500.00'); // Period credit
    expect(html).toContain('RM 560.00'); // Closing balance
    expect(html).toContain('INV-2026-001');
    expect(html).toContain('PAY-2026-001');
  });

  it('2. Ensures generated HTML contains NO oklch color functions or unclosed CSS variables', () => {
    const html = buildCustomerStatementHtml(mockStatement, mockCompany);
    expect(html).not.toMatch(/oklch\(/i);
    expect(html).not.toMatch(/oklab\(/i);
    expect(html).not.toMatch(/color-mix\(/i);
    expect(html).not.toMatch(/var\(--/i);
  });

  it('3. Generates clean sales invoice HTML with line items and totals', () => {
    const mockInvoice = {
      invoiceNumber: 'INV-2026-001',
      invoiceDate: '2026-10-11',
      dueDate: '2026-11-10',
      status: 'POSTED',
      paymentTerm: 'Net 30',
      subtotal: 91000,
      taxTotal: 0,
      total: 91000,
      paidAmount: 0,
      outstanding: 91000,
      customer: mockStatement.customer,
      items: [
        {
          productName: 'Ayam Segar',
          unit: 'kg',
          quantity: 100,
          unitPrice: 910, // RM 9.10
          amount: 91000,
        },
      ],
    };

    const html = buildSalesInvoiceHtml(mockInvoice, mockCompany);
    expect(html).toContain('INV-2026-001');
    expect(html).toContain('Ayam Segar');
    expect(html).toContain('100 kg');
    expect(html).toContain('RM 910.00');
    expect(html).not.toMatch(/oklch\(/i);
  });
});
