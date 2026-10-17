import { db } from '../db/index.ts';
import { customers, salesInvoices, auditLogs, accounts } from '../db/schema.ts';
import { eq, and, like, or, sql } from 'drizzle-orm';

export interface CustomerDefaults {
  defaultPaymentTerm?: string | null;     // 'Due Immediately' | 'Net 7' | 'Net 14' | 'Net 30'
  defaultPaymentMethod?: string | null;   // 'Cash' | 'Bank Transfer' | 'Cheque'
  defaultIncomeAccountId?: string | null; // UUID from accounts where type = 'Revenue' and active = true
  priceLevel?: string | null;             // 'Standard' | 'Wholesale' | 'Retail'
  customPrices?: { [productCodeOrId: string]: number } | null; // Customer-specific price overrides
}

export interface CustomerInput extends CustomerDefaults {
  customerCode: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

const VALID_PAYMENT_TERMS = ['Due Immediately', 'Net 7', 'Net 14', 'Net 30'];
const VALID_PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque'];
const VALID_PRICE_LEVELS = ['Standard', 'Wholesale', 'Retail'];

export function serializeCustomerNotes(cleanNotesText: string | null | undefined, defaults: CustomerDefaults): string | null {
  const meta: CustomerDefaults = {};
  if (defaults.defaultPaymentTerm && VALID_PAYMENT_TERMS.includes(defaults.defaultPaymentTerm)) {
    meta.defaultPaymentTerm = defaults.defaultPaymentTerm;
  }
  if (defaults.defaultPaymentMethod && VALID_PAYMENT_METHODS.includes(defaults.defaultPaymentMethod)) {
    meta.defaultPaymentMethod = defaults.defaultPaymentMethod;
  }
  if (defaults.defaultIncomeAccountId) {
    meta.defaultIncomeAccountId = defaults.defaultIncomeAccountId;
  }
  if (defaults.priceLevel && VALID_PRICE_LEVELS.includes(defaults.priceLevel)) {
    meta.priceLevel = defaults.priceLevel;
  }
  if (defaults.customPrices && typeof defaults.customPrices === 'object') {
    meta.customPrices = defaults.customPrices;
  }

  const hasMeta = Object.keys(meta).length > 0;
  const userText = cleanNotesText ? cleanNotesText.trim() : '';

  if (!hasMeta && !userText) {
    return null;
  }

  if (!hasMeta) {
    return userText;
  }

  const jsonBlock = `__KFA_DEFAULTS__:${JSON.stringify(meta)}`;
  if (!userText) {
    return jsonBlock;
  }

  return `${userText}\n\n${jsonBlock}`;
}

export function parseCustomerNotes(rawNotes: string | null | undefined): { cleanNotes: string; defaults: CustomerDefaults } {
  const emptyDefaults: CustomerDefaults = {
    defaultPaymentTerm: null,
    defaultPaymentMethod: null,
    defaultIncomeAccountId: null,
    priceLevel: null,
    customPrices: null,
  };

  if (!rawNotes) {
    return { cleanNotes: '', defaults: emptyDefaults };
  }

  const marker = '__KFA_DEFAULTS__:';
  const markerIdx = rawNotes.indexOf(marker);
  if (markerIdx === -1) {
    return { cleanNotes: rawNotes.trim(), defaults: emptyDefaults };
  }

  const cleanNotes = rawNotes.substring(0, markerIdx).trim();
  const jsonStr = rawNotes.substring(markerIdx + marker.length).trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      cleanNotes,
      defaults: {
        defaultPaymentTerm: parsed.defaultPaymentTerm || null,
        defaultPaymentMethod: parsed.defaultPaymentMethod || null,
        defaultIncomeAccountId: parsed.defaultIncomeAccountId || null,
        priceLevel: parsed.priceLevel || null,
        customPrices: parsed.customPrices || null,
      }
    };
  } catch (e) {
    return { cleanNotes: rawNotes.trim(), defaults: emptyDefaults };
  }
}

/**
 * Validates income account reference against Chart of Accounts
 */
export async function validateIncomeAccount(accountId: string | null | undefined): Promise<void> {
  if (!accountId) return;
  const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (acc.length === 0) {
    throw new Error("Validation Error: Selected default income account does not exist in Chart of Accounts.");
  }
  if (!acc[0].active) {
    throw new Error(`Validation Error: Selected income account '${acc[0].code} - ${acc[0].name}' is inactive.`);
  }
  if (acc[0].type !== 'Revenue') {
    throw new Error(`Validation Error: Default income account must be of type 'Revenue' (found '${acc[0].type}').`);
  }
}

/**
 * Creates a new customer with a unique customer code
 */
export async function createCustomer(input: CustomerInput, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create customer profiles.");
  }

  if (!input.customerCode || !input.name) {
    throw new Error("Validation Error: Customer code and name are required.");
  }

  const cleanCode = input.customerCode.trim();
  const cleanName = input.name.trim();

  // Validate income account if provided
  if (input.defaultIncomeAccountId) {
    await validateIncomeAccount(input.defaultIncomeAccountId);
  }

  // Enforce unique customer code
  const existing = await db.select().from(customers).where(eq(customers.customerCode, cleanCode));
  if (existing.length > 0) {
    throw new Error(`Validation Error: Customer code '${cleanCode}' is already registered to another profile.`);
  }

  const storedNotes = serializeCustomerNotes(input.notes, {
    defaultPaymentTerm: input.defaultPaymentTerm,
    defaultPaymentMethod: input.defaultPaymentMethod,
    defaultIncomeAccountId: input.defaultIncomeAccountId,
    priceLevel: input.priceLevel,
  });

  const result = await db.insert(customers)
    .values({
      customerCode: cleanCode,
      name: cleanName,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      notes: storedNotes,
      isActive: true,
    })
    .returning();

  // Audit Log
  await db.insert(auditLogs).values({
    userId: creatorUid,
    action: 'CREATE_CUSTOMER',
    tableName: 'customers',
    recordId: result[0].id,
    newValues: result[0],
  });

  const { cleanNotes, defaults } = parseCustomerNotes(result[0].notes);
  return {
    ...result[0],
    notes: cleanNotes,
    ...defaults,
  };
}

/**
 * Updates customer profiles
 */
export async function updateCustomer(id: string, input: Partial<CustomerInput> & { isActive?: boolean }, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot update customer profiles.");
  }

  const current = await db.select().from(customers).where(eq(customers.id, id));
  if (current.length === 0) {
    throw new Error("Customer profile not found.");
  }

  // Block duplicating code if updated
  if (input.customerCode && input.customerCode.trim() !== current[0].customerCode) {
    const existing = await db.select().from(customers).where(eq(customers.customerCode, input.customerCode.trim()));
    if (existing.length > 0) {
      throw new Error(`Validation Error: Customer code '${input.customerCode.trim()}' is already in use.`);
    }
  }

  // Validate income account if explicitly provided
  if (input.defaultIncomeAccountId !== undefined && input.defaultIncomeAccountId !== null && input.defaultIncomeAccountId !== '') {
    await validateIncomeAccount(input.defaultIncomeAccountId);
  }

  // Parse existing defaults if not passed in input
  const { cleanNotes: currentCleanNotes, defaults: currentDefaults } = parseCustomerNotes(current[0].notes);

  const mergedDefaults: CustomerDefaults = {
    defaultPaymentTerm: input.defaultPaymentTerm !== undefined ? input.defaultPaymentTerm : currentDefaults.defaultPaymentTerm,
    defaultPaymentMethod: input.defaultPaymentMethod !== undefined ? input.defaultPaymentMethod : currentDefaults.defaultPaymentMethod,
    defaultIncomeAccountId: input.defaultIncomeAccountId !== undefined ? input.defaultIncomeAccountId : currentDefaults.defaultIncomeAccountId,
    priceLevel: input.priceLevel !== undefined ? input.priceLevel : currentDefaults.priceLevel,
    customPrices: input.customPrices !== undefined ? input.customPrices : currentDefaults.customPrices,
  };

  const textNotes = input.notes !== undefined ? input.notes : currentCleanNotes;
  const storedNotes = serializeCustomerNotes(textNotes, mergedDefaults);

  const result = await db.update(customers)
    .set({
      customerCode: input.customerCode !== undefined ? input.customerCode.trim() : undefined,
      name: input.name !== undefined ? input.name.trim() : undefined,
      phone: input.phone !== undefined ? (input.phone ? input.phone.trim() : null) : undefined,
      email: input.email !== undefined ? (input.email ? input.email.trim() : null) : undefined,
      address: input.address !== undefined ? (input.address ? input.address.trim() : null) : undefined,
      notes: storedNotes,
      isActive: input.isActive !== undefined ? input.isActive : undefined,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id))
    .returning();

  // Audit Log
  await db.insert(auditLogs).values({
    userId: creatorUid,
    action: 'UPDATE_CUSTOMER',
    tableName: 'customers',
    recordId: id,
    oldValues: current[0],
    newValues: result[0],
  });

  const { cleanNotes, defaults } = parseCustomerNotes(result[0].notes);
  return {
    ...result[0],
    notes: cleanNotes,
    ...defaults,
  };
}

/**
 * Sets customer active/inactive status
 */
export async function toggleCustomerStatus(id: string, isActive: boolean, creatorUid: string, userRole: string) {
  return await updateCustomer(id, { isActive }, creatorUid, userRole);
}

/**
 * Lists or searches customers with dynamic search triggers
 */
export async function getCustomers(searchQuery?: string) {
  const query = db.select().from(customers);
  if (searchQuery) {
    query.where(
      or(
        like(customers.customerCode, `%${searchQuery}%`),
        like(customers.name, `%${searchQuery}%`),
        like(customers.email, `%${searchQuery}%`),
        like(customers.phone, `%${searchQuery}%`)
      )
    );
  }
  const rows = await query.orderBy(customers.customerCode);
  return rows.map((r) => {
    const { cleanNotes, defaults } = parseCustomerNotes(r.notes);
    return {
      ...r,
      notes: cleanNotes,
      ...defaults,
    };
  });
}

/**
 * Safe customer details retriever containing accounts history summaries
 */
export async function getCustomerDetail(id: string) {
  const customerList = await db.select().from(customers).where(eq(customers.id, id));
  if (customerList.length === 0) {
    throw new Error("Customer profile not found.");
  }
  const raw = customerList[0];
  const { cleanNotes, defaults } = parseCustomerNotes(raw.notes);
  return {
    ...raw,
    notes: cleanNotes,
    ...defaults,
  };
}
