import { db } from '../db/index.ts';
import { suppliers, purchaseBills, auditLogs } from '../db/schema.ts';
import { eq, or, like } from 'drizzle-orm';

export interface SupplierInput {
  supplierCode: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
}

/**
 * Creates a new supplier with a unique supplier code
 */
export async function createSupplier(input: SupplierInput, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create supplier profiles.");
  }

  if (!input.supplierCode || !input.name) {
    throw new Error("Validation Error: Supplier code and name are required.");
  }

  const cleanCode = input.supplierCode.trim().toUpperCase();
  const cleanName = input.name.trim();

  if (!cleanCode || !cleanName) {
    throw new Error("Validation Error: Supplier code and name cannot be empty.");
  }

  // Enforce unique supplier code
  const existing = await db.select().from(suppliers).where(eq(suppliers.supplierCode, cleanCode));
  if (existing.length > 0) {
    throw new Error(`Validation Error: Supplier code '${cleanCode}' is already registered to another profile.`);
  }

  const result = await db.insert(suppliers)
    .values({
      supplierCode: cleanCode,
      name: cleanName,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      paymentTerms: input.paymentTerms?.trim() || 'Net 30',
      notes: input.notes?.trim() || null,
      isActive: true,
    })
    .returning();

  // Audit Log
  await db.insert(auditLogs).values({
    userId: creatorUid,
    action: 'SUPPLIER_CREATE',
    tableName: 'suppliers',
    recordId: result[0].id,
    newValues: result[0],
  });

  return result[0];
}

/**
 * Updates supplier profiles
 */
export async function updateSupplier(id: string, input: Partial<SupplierInput> & { isActive?: boolean }, creatorUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot update supplier profiles.");
  }

  const current = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (current.length === 0) {
    throw new Error("Supplier profile not found.");
  }

  // Block duplicating code if updated
  if (input.supplierCode) {
    const cleanCode = input.supplierCode.trim().toUpperCase();
    if (cleanCode !== current[0].supplierCode) {
      const existing = await db.select().from(suppliers).where(eq(suppliers.supplierCode, cleanCode));
      if (existing.length > 0) {
        throw new Error(`Validation Error: Supplier code '${cleanCode}' is already in use.`);
      }
    }
  }

  const result = await db.update(suppliers)
    .set({
      supplierCode: input.supplierCode !== undefined ? input.supplierCode.trim().toUpperCase() : undefined,
      name: input.name !== undefined ? input.name.trim() : undefined,
      phone: input.phone !== undefined ? (input.phone.trim() || null) : undefined,
      email: input.email !== undefined ? (input.email.trim() || null) : undefined,
      address: input.address !== undefined ? (input.address.trim() || null) : undefined,
      paymentTerms: input.paymentTerms !== undefined ? (input.paymentTerms.trim() || 'Net 30') : undefined,
      notes: input.notes !== undefined ? (input.notes.trim() || null) : undefined,
      isActive: input.isActive !== undefined ? input.isActive : undefined,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning();

  // Audit Log
  await db.insert(auditLogs).values({
    userId: creatorUid,
    action: 'SUPPLIER_UPDATE',
    tableName: 'suppliers',
    recordId: id,
    oldValues: current[0],
    newValues: result[0],
  });

  return result[0];
}

/**
 * Sets supplier active/inactive status
 */
export async function toggleSupplierStatus(id: string, isActive: boolean, creatorUid: string, userRole: string) {
  return await updateSupplier(id, { isActive }, creatorUid, userRole);
}

/**
 * Destructive deletion blocked for suppliers with accounting history
 */
export async function deleteSupplier(id: string, userUid: string, userRole: string) {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot delete suppliers.");
  }

  const supplierList = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (supplierList.length === 0) {
    throw new Error("Supplier profile not found.");
  }

  // Check if supplier has any purchase bills
  const existingBills = await db.select({ id: purchaseBills.id })
    .from(purchaseBills)
    .where(eq(purchaseBills.supplierId, id))
    .limit(1);

  if (existingBills.length > 0) {
    throw new Error("Integrity Rule: Suppliers with accounting transactions or purchase bills cannot be deleted. Use deactivation instead.");
  }

  await db.delete(suppliers).where(eq(suppliers.id, id));

  await db.insert(auditLogs).values({
    userId: userUid,
    action: 'SUPPLIER_DELETE',
    tableName: 'suppliers',
    recordId: id,
    oldValues: supplierList[0],
  });

  return { success: true };
}

/**
 * Lists or searches suppliers with dynamic search triggers
 */
export async function getSuppliers(searchQuery?: string) {
  const query = db.select().from(suppliers);
  if (searchQuery && searchQuery.trim()) {
    const term = searchQuery.trim();
    query.where(
      or(
        like(suppliers.supplierCode, `%${term}%`),
        like(suppliers.name, `%${term}%`),
        like(suppliers.email, `%${term}%`)
      )
    );
  }
  return await query.orderBy(suppliers.supplierCode);
}

/**
 * Safe supplier details retriever
 */
export async function getSupplierDetail(id: string) {
  const supplierList = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (supplierList.length === 0) {
    throw new Error("Supplier profile not found.");
  }
  return supplierList[0];
}
