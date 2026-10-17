import { db } from '../db/index.ts';
import { 
  salesInvoices, 
  salesInvoiceLines, 
  customers, 
  accounts, 
  journalEntries, 
  journalLines, 
  auditLogs, 
  accountingPeriods 
} from '../db/schema.ts';
import { eq, and, desc, sql, gte, lte, asc } from 'drizzle-orm';
import { validateAccountingPeriod, postJournalEntry, voidJournalEntry } from './accounting.ts';

export interface InvoiceLineInput {
  description: string;
  sku?: string;
  unit?: string;
  quantity: number;
  unitPrice: number; // in cents
  revenueAccountId: string;
}

export interface InvoiceInput {
  customerId: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  discount?: number; // in cents
  lines: InvoiceLineInput[];
}

export function parseLineDescription(rawDesc: string) {
  if (!rawDesc) return { description: '', sku: '', unit: '' };
  const metaRegex = /^__META_SKU:(.*?)_UNIT:(.*?)__(.*)$/s;
  const match = rawDesc.match(metaRegex);
  if (match) {
    return {
      sku: match[1],
      unit: match[2],
      description: match[3],
    };
  }
  return {
    sku: '',
    unit: '',
    description: rawDesc,
  };
}

export function formatLineDescription(description: string, sku?: string, unit?: string) {
  const cleanDesc = description ? description.replace(/^__META_SKU:.*?_UNIT:.*?__/, '') : '';
  if (sku || unit) {
    return `__META_SKU:${sku || ''}_UNIT:${unit || ''}__${cleanDesc}`;
  }
  return cleanDesc;
}

/**
 * Generate a unique, sequential invoice number on the server
 */
export async function generateInvoiceNumber(invoiceDate: string): Promise<string> {
  const year = invoiceDate.split('-')[0] || new Date().getFullYear().toString();
  const prefix = `INV-${year}-`;

  // Find the highest sequential invoice number for the current year
  const matches = await db.select({ invoiceNumber: salesInvoices.invoiceNumber })
    .from(salesInvoices)
    .where(sql`invoice_number LIKE ${prefix || ''} || '%'`)
    .orderBy(desc(salesInvoices.invoiceNumber))
    .limit(1);

  if (matches.length === 0) {
    return `${prefix}000001`;
  }

  const highestNumStr = matches[0].invoiceNumber.replace(prefix, '');
  const highestNum = parseInt(highestNumStr, 10);
  if (isNaN(highestNum)) {
    return `${prefix}000001`;
  }

  const nextNum = highestNum + 1;
  const sequentialStr = nextNum.toString().padStart(6, '0');
  return `${prefix}${sequentialStr}`;
}

/**
 * Create a new Draft sales invoice
 */
export async function createSalesInvoice(input: InvoiceInput, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create invoices.");
  }

  if (!input.customerId || !input.invoiceDate || !input.dueDate || !input.lines || input.lines.length === 0) {
    throw new Error("Validation Error: Customer, dates, and at least one line item are required.");
  }

  // 1. Resolve customer
  const customerList = await db.select().from(customers).where(eq(customers.id, input.customerId));
  if (customerList.length === 0) {
    throw new Error("Validation Error: Selected customer does not exist.");
  }
  const customer = customerList[0];
  if (!customer.isActive) {
    throw new Error(`Validation Error: Customer '${customer.name}' is inactive. Cannot create invoices.`);
  }

  // 2. Generate Number
  const invoiceNumber = await generateInvoiceNumber(input.invoiceDate);

  // 3. Calculate Totals strictly on server side
  let subtotal = 0;
  const lineValues = input.lines.map((l) => {
    if (l.quantity <= 0 || l.unitPrice < 0) {
      throw new Error("Validation Error: Quantity must be greater than zero and Unit Price must be non-negative.");
    }
    const lineTotal = Math.round(l.quantity * l.unitPrice);
    subtotal += lineTotal;
    return {
      description: formatLineDescription(l.description, l.sku, l.unit),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal,
      revenueAccountId: l.revenueAccountId,
    };
  });

  const discount = input.discount || 0;
  if (discount < 0) {
    throw new Error("Validation Error: Discount must be non-negative.");
  }
  const total = subtotal - discount;
  if (total < 0) {
    throw new Error("Validation Error: Discount cannot exceed the subtotal.");
  }

  return await db.transaction(async (tx) => {
    // Insert header
    const invoice = await tx.insert(salesInvoices)
      .values({
        invoiceNumber,
        customerId: input.customerId,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        status: 'Draft',
        subtotal,
        discount,
        total,
        createdBy: creatorUid,
      })
      .returning();

    const invoiceId = invoice[0].id;

    // Insert lines
    for (const l of lineValues) {
      await tx.insert(salesInvoiceLines)
        .values({
          invoiceId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          revenueAccountId: l.revenueAccountId,
        });
    }

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'CREATE_INVOICE',
      tableName: 'sales_invoices',
      recordId: invoiceId,
      newValues: {
        invoiceNumber,
        customerId: input.customerId,
        total,
      },
    });

    return invoiceId;
  });
}

/**
 * Edit an existing Draft sales invoice
 */
export async function editDraftInvoice(id: string, input: Partial<InvoiceInput>, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot edit invoices.");
  }

  return await db.transaction(async (tx) => {
    const currentList = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, id));
    if (currentList.length === 0) {
      throw new Error("Invoice not found.");
    }
    const current = currentList[0];
    if (current.status !== 'Draft') {
      throw new Error(`Immutability Rule: Posted or Voided invoices cannot be edited. Status: '${current.status}'`);
    }

    const updatedLines = input.lines || [];
    let subtotal = current.subtotal;
    let total = current.total;
    let discount = input.discount !== undefined ? input.discount : current.discount;

    // Re-verify customer if changed
    if (input.customerId && input.customerId !== current.customerId) {
      const customerList = await tx.select().from(customers).where(eq(customers.id, input.customerId));
      if (customerList.length === 0 || !customerList[0].isActive) {
        throw new Error("Validation Error: Selected customer is inactive or does not exist.");
      }
    }

    // Re-calculate totals if lines are provided
    if (input.lines && input.lines.length > 0) {
      subtotal = 0;
      for (const line of input.lines) {
        if (line.quantity <= 0 || line.unitPrice < 0) {
          throw new Error("Validation Error: Quantity must be greater than zero and Unit Price must be non-negative.");
        }
        subtotal += Math.round(line.quantity * line.unitPrice);
      }
      total = subtotal - discount;
    } else {
      total = subtotal - discount;
    }

    if (total < 0) {
      throw new Error("Validation Error: Discount cannot exceed the subtotal.");
    }

    // Update Header
    await tx.update(salesInvoices)
      .set({
        customerId: input.customerId || undefined,
        invoiceDate: input.invoiceDate || undefined,
        dueDate: input.dueDate || undefined,
        discount,
        subtotal,
        total,
        updatedAt: new Date(),
      })
      .where(eq(salesInvoices.id, id));

    // Update Lines if updated
    if (input.lines && input.lines.length > 0) {
      await tx.delete(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
      for (const l of input.lines) {
        await tx.insert(salesInvoiceLines)
          .values({
            invoiceId: id,
            description: formatLineDescription(l.description, l.sku, l.unit),
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: Math.round(l.quantity * l.unitPrice),
            revenueAccountId: l.revenueAccountId,
          });
      }
    }

    // Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'UPDATE_INVOICE_DRAFT',
      tableName: 'sales_invoices',
      recordId: id,
      newValues: {
        total,
        lineCount: updatedLines.length,
      },
    });

    return id;
  });
}

/**
 * Atomic Double-Entry Invoice Posting Engine
 */
export async function postSalesInvoice(id: string, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot post invoices.");
  }

  return await db.transaction(async (tx) => {
    // 1. Fetch Invoice
    const currentList = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, id));
    if (currentList.length === 0) {
      throw new Error("Invoice not found.");
    }
    const invoice = currentList[0];

    if (invoice.status !== 'Draft') {
      throw new Error(`Validation Error: Invoice cannot be posted because its current status is '${invoice.status}'. Only Draft invoices can be posted.`);
    }

    // 2. Validate period
    await validateAccountingPeriod(invoice.invoiceDate);

    // 3. Resolve AR and Revenue accounts
    const arAccounts = await tx.select().from(accounts).where(eq(accounts.subType, 'AccountsReceivable'));
    if (arAccounts.length === 0) {
      throw new Error("Configuration Error: No active Accounts Receivable asset account has been initialized in the Chart of Accounts.");
    }
    const arAccount = arAccounts[0];

    const invoiceLinesList = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
    if (invoiceLinesList.length === 0) {
      throw new Error("Validation Error: Cannot post an invoice with zero lines.");
    }

    // 4. Create standard double-entry journal entry to core ledger:
    // Dr Accounts Receivable (Asset)       RM GrandTotal
    //   Cr Sales Revenue (Revenue)         RM GrandTotal (or mapped line revenue accounts)
    // To support complex multiple revenue rows correctly, we map credits dynamically!
    const journalLinesData = [
      // Debit line: Dr Accounts Receivable (Asset)
      { accountId: arAccount.id, debit: invoice.total, credit: 0, description: `AR for Invoice ${invoice.invoiceNumber}` }
    ];

    // Credit lines: Cr Revenue account mapped on each invoice line
    for (const line of invoiceLinesList) {
      journalLinesData.push({
        accountId: line.revenueAccountId,
        debit: 0,
        credit: line.lineTotal,
        description: line.description,
      });
    }

    // Re-verify that debits equal credits
    const totalCreditLines = journalLinesData.reduce((sum, l) => sum + l.credit, 0);
    if (invoice.total !== totalCreditLines) {
      // If there is any rounding difference (e.g. from discounts), we allocate the difference directly to a Discount Expense (or adjust the AR debit row)
      const diff = invoice.total - totalCreditLines;
      if (diff !== 0) {
        throw new Error(`Parity Error: Calculated credit totals (RM ${(totalCreditLines/100).toFixed(2)}) do not match grand total (RM ${(invoice.total/100).toFixed(2)}).`);
      }
    }

    // 5. Post Journal Entry atomically using the validated accountingEngine transaction logic
    const journalId = await postJournalEntry({
      entryDate: invoice.invoiceDate,
      reference: invoice.invoiceNumber,
      description: `Sales Invoice Post: ${invoice.invoiceNumber}`,
      lines: journalLinesData,
    }, creatorUid, userRole, tx);

    // 6. Update Sales Invoice status to Posted and attach Journal reference
    await tx.update(salesInvoices)
      .set({
        status: 'Posted',
        postedJournalId: journalId,
        updatedAt: new Date(),
      })
      .where(eq(salesInvoices.id, id));

    // 7. Audit Log
    await tx.insert(auditLogs).values({
      userId: creatorUid,
      action: 'POST_INVOICE',
      tableName: 'sales_invoices',
      recordId: id,
      newValues: {
        invoiceNumber: invoice.invoiceNumber,
        postedJournalId: journalId,
      },
    });

    return journalId;
  });
}

/**
 * Atomic voiding of posted invoice & ledger reversal
 */
export async function voidSalesInvoice(id: string, reason: string, voidedByUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot void invoices.");
  }

  if (!reason || reason.trim() === '') {
    throw new Error("Validation Error: A void reason must be provided.");
  }

  return await db.transaction(async (tx) => {
    // 1. Fetch Invoice
    const currentList = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, id));
    if (currentList.length === 0) {
      throw new Error("Invoice not found.");
    }
    const invoice = currentList[0];

    if (invoice.status !== 'Posted' || !invoice.postedJournalId) {
      throw new Error(`Validation Error: Only Posted invoices can be voided. Current Status: '${invoice.status}'`);
    }

    // 2. Validate Period
    await validateAccountingPeriod(invoice.invoiceDate);

    // 3. Void matching Posted Journal Entry (triggers automatic compensated reversal posting in ledger)
    const reversalJournalId = await voidJournalEntry(invoice.postedJournalId, `Voided Invoice ${invoice.invoiceNumber}. Reason: ${reason}`, voidedByUid, userRole, tx);

    // 4. Update Invoice status to Voided
    await tx.update(salesInvoices)
      .set({
        status: 'Voided',
        updatedAt: new Date(),
      })
      .where(eq(salesInvoices.id, id));

    // 5. Audit Log
    await tx.insert(auditLogs).values({
      userId: voidedByUid,
      action: 'VOID_INVOICE',
      tableName: 'sales_invoices',
      recordId: id,
      newValues: {
        invoiceNumber: invoice.invoiceNumber,
        voidReason: reason,
        reversalJournalId,
      },
    });

    return reversalJournalId;
  });
}
