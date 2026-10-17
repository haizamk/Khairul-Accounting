import { db } from '../db/index.ts';
import { products, accounts, auditLogs } from '../db/schema.ts';
import { eq, and, ilike, or, asc } from 'drizzle-orm';

export interface ProductItem {
  id: string;
  productCode: string;
  name: string;
  description: string | null;
  isActive: boolean;
  salesUnit: string;
  sellingPrice: number; // in cents
  incomeCategory: string | null;
  incomeAccountId: string | null;
  purchaseUnit: string;
  purchaseCost: number; // in cents
  expenseCategory: string | null;
  expenseAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  productCode: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  salesUnit: string;
  sellingPrice: number; // in cents
  incomeCategory?: string | null;
  incomeAccountId?: string | null;
  purchaseUnit: string;
  purchaseCost: number; // in cents
  expenseCategory?: string | null;
  expenseAccountId?: string | null;
}

/**
 * Validates that an income account exists, is active, and is of type 'Revenue'
 */
export async function validateIncomeAccount(accountId: string | null | undefined): Promise<void> {
  if (!accountId) return;
  const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (acc.length === 0) {
    throw new Error("Validation Error: Akaun hasil jualan yang dipilih tidak wujud dalam Carta Akaun.");
  }
  if (!acc[0].active) {
    throw new Error(`Validation Error: Akaun hasil '${acc[0].code} - ${acc[0].name}' adalah tidak aktif.`);
  }
  if (acc[0].type !== 'Revenue') {
    throw new Error(`Validation Error: Akaun hasil mestilah daripada jenis 'Revenue' (dijumpai '${acc[0].type}').`);
  }
}

/**
 * Validates that an expense account exists, is active, and is of type 'Expense'
 */
export async function validateExpenseAccount(accountId: string | null | undefined): Promise<void> {
  if (!accountId) return;
  const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (acc.length === 0) {
    throw new Error("Validation Error: Akaun perbelanjaan/kos yang dipilih tidak wujud dalam Carta Akaun.");
  }
  if (!acc[0].active) {
    throw new Error(`Validation Error: Akaun perbelanjaan '${acc[0].code} - ${acc[0].name}' adalah tidak aktif.`);
  }
  if (acc[0].type !== 'Expense') {
    throw new Error(`Validation Error: Akaun perbelanjaan mestilah daripada jenis 'Expense' (dijumpai '${acc[0].type}').`);
  }
}

/**
 * Formats a db row into a client ProductItem
 */
function mapProductRow(r: any): ProductItem {
  return {
    id: r.id,
    productCode: r.productCode,
    name: r.name,
    description: r.description,
    isActive: r.isActive,
    salesUnit: r.salesUnit,
    sellingPrice: r.sellingPrice,
    incomeCategory: r.incomeCategory,
    incomeAccountId: r.incomeAccountId,
    purchaseUnit: r.purchaseUnit,
    purchaseCost: r.purchaseCost,
    expenseCategory: r.expenseCategory,
    expenseAccountId: r.expenseAccountId,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}

/**
 * Get list of products with optional search and status filter from PostgreSQL
 */
export async function getProducts(searchQuery?: string, statusFilter?: string): Promise<ProductItem[]> {
  const conditions = [];

  if (searchQuery && searchQuery.trim()) {
    const q = `%${searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(products.productCode, q),
        ilike(products.name, q),
        ilike(products.description, q)
      )
    );
  }

  if (statusFilter && statusFilter !== 'All') {
    if (statusFilter === 'Active') {
      conditions.push(eq(products.isActive, true));
    } else if (statusFilter === 'Inactive') {
      conditions.push(eq(products.isActive, false));
    }
  }

  const query = db.select().from(products);
  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(asc(products.productCode))
    : await query.orderBy(asc(products.productCode));

  return rows.map(mapProductRow);
}

/**
 * Get product detail by ID from PostgreSQL
 */
export async function getProductById(id: string): Promise<ProductItem> {
  const rows = await db.select().from(products).where(eq(products.id, id));
  if (rows.length === 0) {
    throw new Error("Produk atau perkhidmatan tidak dijumpai.");
  }
  return mapProductRow(rows[0]);
}

/**
 * Create a new product item in PostgreSQL
 */
export async function createProduct(input: ProductInput, creatorUid: string, userRole: string): Promise<ProductItem> {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Penonton (Viewer) tidak dibenarkan mendaftar produk.");
  }

  if (!input.productCode || !input.productCode.trim()) {
    throw new Error("Validation Error: Kod produk / SKU adalah wajib.");
  }
  if (!input.name || !input.name.trim()) {
    throw new Error("Validation Error: Nama produk adalah wajib.");
  }

  const cleanCode = input.productCode.trim().toUpperCase();
  const cleanName = input.name.trim();

  // Validate unique product code
  const existing = await db.select().from(products).where(eq(products.productCode, cleanCode));
  if (existing.length > 0) {
    throw new Error(`Validation Error: Kod produk '${cleanCode}' sudah wujud dalam katalog.`);
  }

  // Validate account mappings if provided
  if (input.incomeAccountId) {
    await validateIncomeAccount(input.incomeAccountId);
  }
  if (input.expenseAccountId) {
    await validateExpenseAccount(input.expenseAccountId);
  }

  const purchaseUnit = (input.purchaseUnit || 'unit').trim().toLowerCase();
  const salesUnit = (input.salesUnit || purchaseUnit || 'unit').trim().toLowerCase();

  const [inserted] = await db.insert(products).values({
    productCode: cleanCode,
    name: cleanName,
    description: input.description ? input.description.trim() : null,
    isActive: input.isActive !== undefined ? input.isActive : true,
    salesUnit,
    sellingPrice: Math.max(0, Math.round(Number(input.sellingPrice) || 0)),
    incomeCategory: input.incomeCategory?.trim() || 'Hasil Jualan / Sales Revenue',
    incomeAccountId: input.incomeAccountId || null,
    purchaseUnit,
    purchaseCost: Math.max(0, Math.round(Number(input.purchaseCost) || 0)),
    expenseCategory: input.expenseCategory?.trim() || 'Kos Jualan / Cost of Goods Sold',
    expenseAccountId: input.expenseAccountId || null,
  }).returning();

  // Audit log to PostgreSQL
  try {
    await db.insert(auditLogs).values({
      userId: creatorUid,
      action: 'PRODUCT_CREATE',
      tableName: 'products',
      recordId: inserted.id,
      newValues: inserted,
    });
  } catch (err) {
    console.error('Audit log error for PRODUCT_CREATE:', err);
  }

  return mapProductRow(inserted);
}

/**
 * Update an existing product item in PostgreSQL
 */
export async function updateProduct(id: string, input: Partial<ProductInput>, creatorUid: string, userRole: string): Promise<ProductItem> {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Penonton (Viewer) tidak dibenarkan mengemaskini produk.");
  }

  const rows = await db.select().from(products).where(eq(products.id, id));
  if (rows.length === 0) {
    throw new Error("Produk atau perkhidmatan tidak dijumpai.");
  }
  const current = rows[0];

  // Validate duplicate code if changed
  if (input.productCode && input.productCode.trim().toUpperCase() !== current.productCode.toUpperCase()) {
    const cleanCode = input.productCode.trim().toUpperCase();
    const duplicate = await db.select().from(products).where(eq(products.productCode, cleanCode));
    if (duplicate.some(d => d.id !== id)) {
      throw new Error(`Validation Error: Kod produk '${cleanCode}' sudah digunakan.`);
    }
  }

  // Validate account mappings if explicitly changed
  if (input.incomeAccountId !== undefined && input.incomeAccountId !== null) {
    await validateIncomeAccount(input.incomeAccountId);
  }
  if (input.expenseAccountId !== undefined && input.expenseAccountId !== null) {
    await validateExpenseAccount(input.expenseAccountId);
  }

  const updateValues: any = {
    updatedAt: new Date(),
  };

  if (input.productCode !== undefined) updateValues.productCode = input.productCode.trim().toUpperCase();
  if (input.name !== undefined) updateValues.name = input.name.trim();
  if (input.description !== undefined) updateValues.description = input.description ? input.description.trim() : null;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.salesUnit !== undefined) updateValues.salesUnit = input.salesUnit.trim().toLowerCase();
  if (input.sellingPrice !== undefined) updateValues.sellingPrice = Math.max(0, Math.round(Number(input.sellingPrice)));
  if (input.incomeCategory !== undefined) updateValues.incomeCategory = input.incomeCategory ? input.incomeCategory.trim() : null;
  if (input.incomeAccountId !== undefined) updateValues.incomeAccountId = input.incomeAccountId || null;
  if (input.purchaseUnit !== undefined) updateValues.purchaseUnit = input.purchaseUnit.trim().toLowerCase();
  if (input.purchaseCost !== undefined) updateValues.purchaseCost = Math.max(0, Math.round(Number(input.purchaseCost)));
  if (input.expenseCategory !== undefined) updateValues.expenseCategory = input.expenseCategory ? input.expenseCategory.trim() : null;
  if (input.expenseAccountId !== undefined) updateValues.expenseAccountId = input.expenseAccountId || null;

  const [updated] = await db.update(products).set(updateValues).where(eq(products.id, id)).returning();

  // Audit log to PostgreSQL
  try {
    await db.insert(auditLogs).values({
      userId: creatorUid,
      action: 'PRODUCT_UPDATE',
      tableName: 'products',
      recordId: id,
      oldValues: current,
      newValues: updated,
    });
  } catch (err) {
    console.error('Audit log error for PRODUCT_UPDATE:', err);
  }

  return mapProductRow(updated);
}
