import { db } from '../db/index.ts';
import { sql } from 'drizzle-orm';
import {
  paymentAllocations,
  supplierPaymentAllocations,
  customerPayments,
  supplierPayments,
  salesInvoiceLines,
  purchaseBillLines,
  salesInvoices,
  purchaseBills,
  expenses,
  bankReconciliationMatches,
  bankStatementLines,
  bankReconciliationSessions,
  bankImportBatches,
  journalLines,
  journalEntries,
  customers,
  suppliers,
  products,
  auditLogs
} from '../db/schema.ts';

const PERMITTED_DB = 'khairul_fresh_disposable_test';

export async function checkMasterResetSafety(): Promise<{
  allowed: boolean;
  dbName: string;
  userName: string;
  flagEnabled: boolean;
  reason?: string;
  counts?: Record<string, number>;
}> {
  // 1. Verify environment flag
  const flagEnabled = process.env.ALLOW_MUTATING_INTEGRATION_TESTS === 'true';

  // 2. Query active PostgreSQL database and user
  const dbInfo = await db.execute(sql`SELECT current_database() as db_name, current_user as user_name`);
  const row = dbInfo.rows[0];
  const dbName = String(row?.db_name || '');
  const userName = String(row?.user_name || '');

  // 3. Strict guard checks
  let allowed = true;
  let reason = '';

  if (dbName !== PERMITTED_DB) {
    allowed = false;
    reason = `Pangkalan data semasa ialah '${dbName}'. Operasi Master Reset DITEGAH sama sekali melainkan pangkalan data ialah '${PERMITTED_DB}'.`;
  } else if (!flagEnabled) {
    allowed = false;
    reason = `Bendera keselamatan 'ALLOW_MUTATING_INTEGRATION_TESTS=true' tidak diaktifkan pada persekitaran pelayan.`;
  }

  // 4. Count test records expected to be reset if permitted
  let counts: Record<string, number> = {};
  try {
    const [
      custCount,
      suppCount,
      prodCount,
      invCount,
      billCount,
      custPayCount,
      suppPayCount,
      expCount,
      bankBatchCount,
      journalCount,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(customers),
      db.select({ count: sql<number>`count(*)` }).from(suppliers),
      db.select({ count: sql<number>`count(*)` }).from(products),
      db.select({ count: sql<number>`count(*)` }).from(salesInvoices),
      db.select({ count: sql<number>`count(*)` }).from(purchaseBills),
      db.select({ count: sql<number>`count(*)` }).from(customerPayments),
      db.select({ count: sql<number>`count(*)` }).from(supplierPayments),
      db.select({ count: sql<number>`count(*)` }).from(expenses),
      db.select({ count: sql<number>`count(*)` }).from(bankImportBatches),
      db.select({ count: sql<number>`count(*)` }).from(journalEntries),
    ]);

    counts = {
      customers: Number(custCount[0]?.count || 0),
      suppliers: Number(suppCount[0]?.count || 0),
      products: Number(prodCount[0]?.count || 0),
      salesInvoices: Number(invCount[0]?.count || 0),
      purchaseBills: Number(billCount[0]?.count || 0),
      customerPayments: Number(custPayCount[0]?.count || 0),
      supplierPayments: Number(suppPayCount[0]?.count || 0),
      expenses: Number(expCount[0]?.count || 0),
      bankBatches: Number(bankBatchCount[0]?.count || 0),
      journalEntries: Number(journalCount[0]?.count || 0),
    };
  } catch (e) {
    console.error('Error counting records for reset preview:', e);
  }

  return {
    allowed,
    dbName,
    userName,
    flagEnabled,
    reason,
    counts,
  };
}

export async function executeMasterReset(adminUid: string): Promise<{
  success: boolean;
  dbName: string;
  removedCounts: Record<string, number>;
  preservedFoundations: string[];
}> {
  // 1. Enforce strict safety guard
  const safety = await checkMasterResetSafety();
  if (!safety.allowed) {
    throw new Error(`SAFETY BLOCK: ${safety.reason}`);
  }

  // 2. Execute deletion in strict transaction order
  return await db.transaction(async (tx) => {
    // Double check inside transaction
    const txCheck = await tx.execute(sql`SELECT current_database() as db_name`);
    const activeDb = String(txCheck.rows[0]?.db_name || '');
    if (activeDb !== PERMITTED_DB) {
      throw new Error(`TRANSACTION SAFETY ABORT: Active database '${activeDb}' is not '${PERMITTED_DB}'.`);
    }

    // Deletions in dependency order
    await tx.delete(paymentAllocations);
    await tx.delete(supplierPaymentAllocations);
    await tx.delete(customerPayments);
    await tx.delete(supplierPayments);
    await tx.delete(salesInvoiceLines);
    await tx.delete(purchaseBillLines);
    await tx.delete(salesInvoices);
    await tx.delete(purchaseBills);
    await tx.delete(expenses);

    await tx.delete(bankReconciliationMatches);
    await tx.delete(bankStatementLines);
    await tx.delete(bankReconciliationSessions);
    await tx.delete(bankImportBatches);

    await tx.delete(journalLines);
    await tx.delete(journalEntries);

    await tx.delete(customers);
    await tx.delete(suppliers);
    await tx.delete(products);

    // Clean audit logs
    await tx.delete(auditLogs);

    // Record audit log for master reset itself
    await tx.insert(auditLogs).values({
      userId: adminUid,
      action: 'MASTER_RESET',
      tableName: 'all_test_tables',
      recordId: activeDb,
      newValues: {
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        dbName: activeDb,
      },
    });

    return {
      success: true,
      dbName: activeDb,
      removedCounts: safety.counts || {},
      preservedFoundations: [
        'Profil Syarikat (Company Profile)',
        'Akaun Pengguna & Capaian Admin (Users & Roles)',
        'Carta Akaun / COA (Chart of Accounts)',
        'Tempoh Perakaunan (Accounting Periods)',
        'Skema Pangkalan Data & Migrasi (Database Schema)',
      ],
    };
  });
}
