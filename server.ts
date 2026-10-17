import './src/env.ts';
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';


// Imports for database, middleware, services
import { db } from './src/db/index.ts';
import { 
  companyProfile, 
  accounts, 
  accountingPeriods, 
  journalEntries, 
  journalLines, 
  auditLogs, 
  users,
  customers as customersTable,
  salesInvoices,
  salesInvoiceLines,
  customerPayments,
  paymentAllocations,
  products as productsTable,
  suppliers as suppliersTable,
  purchaseBills as purchaseBillsTable
} from './src/db/schema.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { postJournalEntry, voidJournalEntry } from './src/services/accounting.ts';
import { updateUserRole, getAllUsers, toggleUserStatus, inviteOrRegisterUser } from './src/db/users.ts';
import { checkMasterResetSafety, executeMasterReset } from './src/services/masterResetService.ts';
import { 
  createCustomer, 
  updateCustomer, 
  toggleCustomerStatus, 
  getCustomers, 
  getCustomerDetail 
} from './src/services/customerService.ts';
import { 
  createSalesInvoice, 
  editDraftInvoice, 
  postSalesInvoice, 
  voidSalesInvoice,
  parseLineDescription
} from './src/services/salesInvoiceService.ts';
import { 
  calculateARAging, 
  getCustomerStatement, 
  getOutstandingAR 
} from './src/services/arService.ts';
import {
  createCustomerPayment,
  editDraftPayment,
  postCustomerPayment,
  voidCustomerPayment,
  getInvoiceOutstandingBalance,
  getCustomerPayments,
  getPaymentDetail
} from './src/services/paymentService.ts';
import {
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  getSuppliers,
  getSupplierDetail,
  deleteSupplier
} from './src/services/supplierService.ts';
import {
  createPurchaseBill,
  editDraftBill,
  postPurchaseBill,
  voidPurchaseBill,
  getPurchaseBills,
  getPurchaseBillDetail,
  deletePurchaseBill
} from './src/services/purchaseBillService.ts';
import {
  calculateAPAging,
  getSupplierStatement,
  getOutstandingAP
} from './src/services/apService.ts';
import {
  createSupplierPayment,
  editDraftSupplierPayment,
  postSupplierPayment,
  voidSupplierPayment,
  deleteDraftSupplierPayment,
  getSupplierPayments,
  getSupplierPaymentDetail,
  getBillOutstandingBalance,
  getBillPaymentStatus
} from './src/services/supplierPaymentService.ts';
import {
  createExpense,
  editDraftExpense,
  postExpense,
  voidExpense,
  deleteDraftExpense,
  getExpenses,
  getExpenseDetail,
  getExpenseMetrics
} from './src/services/expenseService.ts';
import { eq, and, lte, gte, asc, desc, sql, or, like, ilike } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  }));
  app.options('*', cors());
  app.use(express.json());

  // ==========================================
  // AUTHENTICATION & SESSION SIMULATION ROUTES
  // ==========================================

  /**
   * Syncs user account and returns their active database role details
   */
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json({ user: req.user });
    } catch (error: any) {
      console.error("Auth me error:", error);
      res.status(500).json({ error: "Failed to load authentication state" });
    }
  });

  /**
   * Utility endpoint to swap roles easily in UI for testing & QA (Admin | Accountant | Viewer)
   */
  app.post('/api/auth/simulate-role', requireAuth, async (req: AuthRequest, res) => {
    try {
      // CRITICAL SECURITY ENFORCEMENT: Disable simulation in production
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "Forbidden: Simulated role-switching is strictly disabled in production environments." });
      }

      const { role } = req.body;
      if (!role || !['Admin', 'Accountant', 'Viewer'].includes(role)) {
        return res.status(400).json({ error: "Invalid role specified." });
      }

      // Update in database
      const updated = await updateUserRole(req.user!.uid, role, req.user!.uid);
      
      // Update in-memory user
      req.user!.role = updated.role as 'Admin' | 'Accountant' | 'Viewer';

      // Insert audit log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'ROLE_SWITCH',
        tableName: 'users',
        recordId: req.user!.uid,
        newValues: { targetRole: role }
      });

      res.json({ success: true, user: req.user });
    } catch (error: any) {
      console.error("Simulate role error:", error);
      res.status(500).json({ error: error.message || "Failed to switch role" });
    }
  });


  // ==========================================
  // COMPANY PROFILE MANAGEMENT
  // ==========================================

  app.get('/api/company/profile', requireAuth, async (req, res) => {
    try {
      const profiles = await db.select().from(companyProfile);
      if (profiles.length === 0) {
        return res.status(404).json({ error: "Profil syarikat tidak ditemui." });
      }
      res.json(profiles[0]);
    } catch (error: any) {
      console.error("Fetch profile error:", error);
      res.status(500).json({ error: "Gagal memuatkan profil syarikat." });
    }
  });

  app.put('/api/company/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Hanya Pentadbir (Admin) boleh mengemas kini profil syarikat." });
      }

      const profiles = await db.select().from(companyProfile);
      if (profiles.length === 0) {
        return res.status(404).json({ error: "Profil syarikat tidak ditemui." });
      }

      const { 
        name, 
        registeredName, 
        registrationNumber, 
        address, 
        phone, 
        email, 
        website, 
        taxNumber, 
        financialYearStart, 
        currency, 
        logoUrl 
      } = req.body;

      const updated = await db.update(companyProfile)
        .set({
          name: name || undefined,
          registeredName: registeredName || null,
          registrationNumber: registrationNumber || undefined,
          address: address || undefined,
          phone: phone || null,
          email: email || null,
          website: website || null,
          taxNumber: taxNumber || null,
          financialYearStart: financialYearStart || undefined,
          currency: currency || 'MYR',
          logoUrl: logoUrl || null,
        })
        .where(eq(companyProfile.id, profiles[0].id))
        .returning();

      // Record audit log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'UPDATE_COMPANY',
        tableName: 'company_profile',
        recordId: profiles[0].id,
        newValues: updated[0]
      });

      res.json(updated[0]);
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: error.message || "Gagal mengemas kini profil syarikat." });
    }
  });

  // ==========================================
  // ADMIN SETTINGS & USER MANAGEMENT
  // ==========================================

  // 1. Master Reset Safety Status Check
  app.get('/api/admin/master-reset/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Capaian terhad kepada Pentadbir (Admin) sahaja." });
      }
      const safety = await checkMasterResetSafety();
      res.json(safety);
    } catch (error: any) {
      console.error("Master reset status check error:", error);
      res.status(500).json({ error: "Gagal menyemak status keselamatan Master Reset." });
    }
  });

  // 2. Master Reset Execution
  app.post('/api/admin/master-reset', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Capaian terhad kepada Pentadbir (Admin) sahaja." });
      }

      const { confirmationPhrase } = req.body;
      if (confirmationPhrase !== 'RESET SEMUA DATA UJIAN') {
        return res.status(400).json({ error: "Pengesahan gagal: Frasa pengesahan tidak tepat." });
      }

      const result = await executeMasterReset(req.user!.uid);
      res.json(result);
    } catch (error: any) {
      console.error("Master reset execution error:", error);
      res.status(400).json({ error: error.message || "Gagal melaksanakan Master Reset." });
    }
  });

  // 3. User Directory List
  app.get('/api/users', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Capaian terhad kepada Pentadbir (Admin) sahaja." });
      }
      const userList = await getAllUsers();
      res.json(userList);
    } catch (error: any) {
      console.error("Fetch users error:", error);
      res.status(500).json({ error: error.message || "Gagal memuatkan senarai pengguna." });
    }
  });

  // 4. Invite / Register User
  app.post('/api/users/invite', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Capaian terhad kepada Pentadbir (Admin) sahaja." });
      }
      const { email, name, role } = req.body;
      if (!email || !role) {
        return res.status(400).json({ error: "E-mel dan peranan wajib diisi." });
      }
      const user = await inviteOrRegisterUser(email, name, role, req.user!.uid);
      res.status(201).json(user);
    } catch (error: any) {
      console.error("Invite user error:", error);
      res.status(400).json({ error: error.message || "Gagal menjemput pengguna." });
    }
  });

  // 5. Update User Role
  app.put('/api/users/:uid/role', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Capaian terhad kepada Pentadbir (Admin) sahaja." });
      }
      const { uid } = req.params;
      const { role } = req.body;
      if (!role) {
        return res.status(400).json({ error: "Peranan baru wajib dinyatakan." });
      }
      const user = await updateUserRole(uid, role, req.user!.uid);
      res.json(user);
    } catch (error: any) {
      console.error("Update user role error:", error);
      res.status(400).json({ error: error.message || "Gagal mengemas kini peranan pengguna." });
    }
  });

  // 6. Toggle User Active Status
  app.put('/api/users/:uid/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Capaian terhad kepada Pentadbir (Admin) sahaja." });
      }
      const { uid } = req.params;
      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: "Status isActive wajib berbentuk boolean." });
      }
      const user = await toggleUserStatus(uid, isActive, req.user!.uid);
      res.json(user);
    } catch (error: any) {
      console.error("Toggle user status error:", error);
      res.status(400).json({ error: error.message || "Gagal menukar status pengguna." });
    }
  });


  // ==========================================
  // ACCOUNTING PERIODS
  // ==========================================

  app.get('/api/periods', requireAuth, async (req, res) => {
    try {
      const periods = await db.select().from(accountingPeriods).orderBy(asc(accountingPeriods.startDate));
      res.json(periods);
    } catch (error: any) {
      console.error("Fetch periods error:", error);
      res.status(500).json({ error: "Failed to load accounting periods" });
    }
  });

  app.post('/api/periods', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Only Administrators can create accounting periods." });
      }

      const { name, startDate, endDate, status } = req.body;
      if (!name || !startDate || !endDate) {
        return res.status(400).json({ error: "Missing required fields (name, startDate, endDate)." });
      }

      const newPeriod = await db.insert(accountingPeriods)
        .values({
          name,
          startDate,
          endDate,
          status: status || 'Open',
        })
        .returning();

      // Audit Log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'CREATE_PERIOD',
        tableName: 'accounting_periods',
        recordId: newPeriod[0].id,
        newValues: newPeriod[0]
      });

      res.status(201).json(newPeriod[0]);
    } catch (error: any) {
      console.error("Create period error:", error);
      res.status(500).json({ error: error.message || "Failed to create accounting period" });
    }
  });

  app.put('/api/periods/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Only Administrators can close/open accounting periods." });
      }

      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['Open', 'Closed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status value. Must be 'Open' or 'Closed'." });
      }

      const updated = await db.update(accountingPeriods)
        .set({ status })
        .where(eq(accountingPeriods.id, id))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Accounting period not found." });
      }

      // Audit Log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: status === 'Closed' ? 'CLOSE_PERIOD' : 'OPEN_PERIOD',
        tableName: 'accounting_periods',
        recordId: id,
        newValues: updated[0]
      });

      res.json(updated[0]);
    } catch (error: any) {
      console.error("Update period status error:", error);
      res.status(500).json({ error: error.message || "Failed to update period status" });
    }
  });


  // ==========================================
  // CHART OF ACCOUNTS (COA)
  // ==========================================

  app.get('/api/accounts', requireAuth, async (req, res) => {
    try {
      const coa = await db.select().from(accounts).orderBy(asc(accounts.code));
      res.json(coa);
    } catch (error: any) {
      console.error("Fetch accounts error:", error);
      res.status(500).json({ error: "Failed to load Chart of Accounts" });
    }
  });

  app.post('/api/accounts', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create accounts." });
      }

      const { code, name, type, subType, normalBalance, parentId, active } = req.body;
      if (!code || !name || !type || !subType || !normalBalance) {
        return res.status(400).json({ error: "Missing required fields (code, name, type, subType, normalBalance)." });
      }

      const newAccount = await db.insert(accounts)
        .values({
          code,
          name,
          type,
          subType,
          normalBalance,
          parentId: parentId || null,
          active: active !== undefined ? active : true,
        })
        .returning();

      // Audit Log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'CREATE_ACCOUNT',
        tableName: 'accounts',
        recordId: newAccount[0].id,
        newValues: newAccount[0]
      });

      res.status(201).json(newAccount[0]);
    } catch (error: any) {
      console.error("Create account error:", error);
      res.status(500).json({ error: error.message || "Failed to create account" });
    }
  });

  app.put('/api/accounts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit accounts." });
      }

      const { id } = req.params;
      const { name, active, parentId } = req.body;

      const current = await db.select().from(accounts).where(eq(accounts.id, id));
      if (current.length === 0) {
        return res.status(404).json({ error: "Account not found." });
      }

      const updated = await db.update(accounts)
        .set({
          name: name !== undefined ? name : undefined,
          active: active !== undefined ? active : undefined,
          parentId: parentId !== undefined ? (parentId || null) : undefined,
        })
        .where(eq(accounts.id, id))
        .returning();

      // Audit Log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'UPDATE_ACCOUNT',
        tableName: 'accounts',
        recordId: id,
        oldValues: current[0],
        newValues: updated[0]
      });

      res.json(updated[0]);
    } catch (error: any) {
      console.error("Edit account error:", error);
      res.status(500).json({ error: error.message || "Failed to edit account" });
    }
  });

  app.delete('/api/accounts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Only Administrators can delete Chart accounts." });
      }

      const { id } = req.params;

      // Rule: Block deletion if there are associated journal lines
      const linesCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(journalLines)
        .where(eq(journalLines.accountId, id));

      if (linesCount[0].count > 0) {
        return res.status(400).json({
          error: "Accounting Protection: This account cannot be deleted because it has posted ledger transactions. Consider marking it Inactive instead."
        });
      }

      const deleted = await db.delete(accounts).where(eq(accounts.id, id)).returning();
      if (deleted.length === 0) {
        return res.status(404).json({ error: "Account not found." });
      }

      // Audit Log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'DELETE_ACCOUNT',
        tableName: 'accounts',
        recordId: id,
        oldValues: deleted[0]
      });

      res.json({ success: true, message: "Account deleted successfully." });
    } catch (error: any) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: error.message || "Failed to delete account" });
    }
  });


  // ==========================================
  // CUSTOMER MANAGEMENT (Milestone 2A Addition)
  // ==========================================

  app.get('/api/customers', requireAuth, async (req, res) => {
    try {
      const { search } = req.query;
      const list = await getCustomers(search as string);
      res.json(list);
    } catch (error: any) {
      console.error("Fetch customers error:", error);
      res.status(500).json({ error: "Failed to load customers." });
    }
  });

  app.get('/api/customers/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const details = await getCustomerDetail(id);
      res.json(details);
    } catch (error: any) {
      console.error("Fetch customer detail error:", error);
      res.status(500).json({ error: error.message || "Failed to load customer profile." });
    }
  });

  app.post('/api/customers', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create customer profiles." });
      }
      const data = await createCustomer(req.body, req.user!.uid, req.user!.role);
      res.status(201).json(data);
    } catch (error: any) {
      console.error("Create customer error:", error);
      res.status(400).json({ error: error.message || "Failed to create customer profile." });
    }
  });

  app.put('/api/customers/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit customer profiles." });
      }
      const { id } = req.params;
      const data = await updateCustomer(id, req.body, req.user!.uid, req.user!.role);
      res.json(data);
    } catch (error: any) {
      console.error("Update customer error:", error);
      res.status(400).json({ error: error.message || "Failed to update customer profile." });
    }
  });

  app.put('/api/customers/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot alter customer active states." });
      }
      const { id } = req.params;
      const { isActive } = req.body;
      if (isActive === undefined) {
        return res.status(400).json({ error: "isActive parameter is required." });
      }
      const data = await toggleCustomerStatus(id, isActive, req.user!.uid, req.user!.role);
      res.json(data);
    } catch (error: any) {
      console.error("Toggle customer active error:", error);
      res.status(400).json({ error: error.message || "Failed to alter customer state." });
    }
  });


  // ==========================================
  // SALES INVOICES (Milestone 2A Addition)
  // ==========================================

  app.get('/api/sales-invoices', requireAuth, async (req, res) => {
    try {
      const { customerId, status } = req.query;
      let conditions = [];
      if (customerId) conditions.push(eq(salesInvoices.customerId, customerId as string));
      if (status) conditions.push(eq(salesInvoices.status, status as string));

      const query = db.select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        customerId: salesInvoices.customerId,
        invoiceDate: salesInvoices.invoiceDate,
        dueDate: salesInvoices.dueDate,
        status: salesInvoices.status,
        total: salesInvoices.total,
        customerName: customersTable.name,
      })
      .from(salesInvoices)
      .leftJoin(customersTable, eq(salesInvoices.customerId, customersTable.id));

      if (conditions.length > 0) {
        query.where(and(...conditions));
      }

      const list = await query.orderBy(desc(salesInvoices.invoiceDate), desc(salesInvoices.createdAt));
      
      const enrichedList = [];
      for (const inv of list) {
        let outstanding = inv.total;
        let displayStatus = inv.status;
        if (inv.status === 'Posted') {
          outstanding = await getInvoiceOutstandingBalance(inv.id);
          if (outstanding === 0) {
            displayStatus = 'Paid';
          } else if (outstanding < inv.total) {
            displayStatus = 'Partially Paid';
          }
        }
        enrichedList.push({
          ...inv,
          customerName: inv.customerName || 'Pelanggan Tidak Wujud',
          outstanding,
          status: displayStatus,
        });
      }
      res.json(enrichedList);
    } catch (error: any) {
      console.error("Fetch invoices error:", error);
      res.status(500).json({ error: "Failed to load sales invoices." });
    }
  });

  app.get('/api/sales-invoices/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const invoiceList = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id));
      if (invoiceList.length === 0) {
        return res.status(404).json({ error: "Sales invoice not found." });
      }
      const invoice = invoiceList[0];

      const activeProducts = await db.select().from(productsTable);

      const rawLines = await db.select({
        id: salesInvoiceLines.id,
        description: salesInvoiceLines.description,
        quantity: salesInvoiceLines.quantity,
        unitPrice: salesInvoiceLines.unitPrice,
        lineTotal: salesInvoiceLines.lineTotal,
        revenueAccountId: salesInvoiceLines.revenueAccountId,
        revenueAccountCode: accounts.code,
        revenueAccountName: accounts.name,
      })
      .from(salesInvoiceLines)
      .innerJoin(accounts, eq(salesInvoiceLines.revenueAccountId, accounts.id))
      .where(eq(salesInvoiceLines.invoiceId, id));

      const lines = rawLines.map((l) => {
        const parsed = parseLineDescription(l.description);
        let sku = parsed.sku;
        let unit = parsed.unit;

        if (!sku || !unit) {
          const matched = activeProducts.find(
            p => p.name.trim().toLowerCase() === parsed.description.trim().toLowerCase() ||
                 (p.productCode && p.productCode.trim().toLowerCase() === parsed.description.trim().toLowerCase())
          );
          if (matched) {
            if (!sku) sku = matched.productCode || '-';
            if (!unit) unit = matched.salesUnit || 'unit';
          }
        }

        return {
          ...l,
          description: parsed.description,
          sku: sku || '-',
          unit: unit || 'unit',
        };
      });

      let customer = null;
      let customerName = 'Pelanggan Tidak Wujud';
      try {
        customer = await getCustomerDetail(invoice.customerId);
        if (customer && customer.name) {
          customerName = customer.name;
        }
      } catch (custErr) {
        console.warn(`Customer ${invoice.customerId} profile not found for invoice ${id}`);
      }

      let outstanding = invoice.total;
      let displayStatus = invoice.status;
      if (invoice.status === 'Posted') {
        outstanding = await getInvoiceOutstandingBalance(invoice.id);
        if (outstanding === 0) {
          displayStatus = 'Paid';
        } else if (outstanding < invoice.total) {
          displayStatus = 'Partially Paid';
        }
      }

      // Fetch payment allocations/history for this invoice
      const invoicePayments = await db.select({
        id: customerPayments.id,
        paymentDate: customerPayments.paymentDate,
        paymentReference: customerPayments.paymentReference,
        amountAllocated: paymentAllocations.amount,
        paymentTotalAmount: customerPayments.amount,
        paymentAccountId: customerPayments.paymentAccountId,
        accountName: accounts.name,
        notes: customerPayments.notes,
        status: customerPayments.status,
      })
      .from(paymentAllocations)
      .innerJoin(customerPayments, eq(paymentAllocations.paymentId, customerPayments.id))
      .leftJoin(accounts, eq(customerPayments.paymentAccountId, accounts.id))
      .where(and(
        eq(paymentAllocations.invoiceId, id),
        eq(customerPayments.status, 'Posted')
      ))
      .orderBy(desc(customerPayments.paymentDate), desc(customerPayments.createdAt));

      res.json({
        ...invoice,
        status: displayStatus,
        outstanding,
        customerName,
        customer,
        lines,
        payments: invoicePayments,
      });
    } catch (error: any) {
      console.error("Fetch invoice detail error:", error);
      res.status(500).json({ error: "Failed to load sales invoice details." });
    }
  });

  app.post('/api/sales-invoices', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create sales invoices." });
      }
      const id = await createSalesInvoice(req.body, req.user!.uid, req.user!.role);
      res.status(201).json({ success: true, id });
    } catch (error: any) {
      console.error("Create sales invoice error:", error);
      res.status(400).json({ error: error.message || "Failed to create sales invoice." });
    }
  });

  app.put('/api/sales-invoices/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit sales invoices." });
      }
      const { id } = req.params;
      const data = await editDraftInvoice(id, req.body, req.user!.uid, req.user!.role);
      res.json({ success: true, id: data });
    } catch (error: any) {
      console.error("Edit sales invoice error:", error);
      res.status(400).json({ error: error.message || "Failed to modify sales invoice." });
    }
  });

  app.post('/api/sales-invoices/:id/post', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot post sales invoices to the ledger." });
      }
      const { id } = req.params;
      const journalId = await postSalesInvoice(id, req.user!.uid, req.user!.role);
      res.json({ success: true, journalId, message: "Invoice posted successfully and integrated into General Ledger." });
    } catch (error: any) {
      console.error("Post sales invoice error:", error);
      res.status(400).json({ error: error.message || "Failed to post sales invoice." });
    }
  });

  app.post('/api/sales-invoices/:id/void', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot void sales invoices." });
      }
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "A void reason must be provided." });
      }
      const reversalJournalId = await voidSalesInvoice(id, reason, req.user!.uid, req.user!.role);
      res.json({ success: true, reversalJournalId, message: "Invoice voided and compensating reversal entry written." });
    } catch (error: any) {
      console.error("Void sales invoice error:", error);
      res.status(400).json({ error: error.message || "Failed to void sales invoice." });
    }
  });


  // ==========================================
  // ACCOUNTS RECEIVABLE (AR - Milestone 2A Addition)
  // ==========================================

  app.get('/api/ar/outstanding', requireAuth, async (req, res) => {
    try {
      const outstanding = await getOutstandingAR();
      res.json(outstanding);
    } catch (error: any) {
      console.error("Outstanding AR error:", error);
      res.status(500).json({ error: "Failed to load outstanding accounts receivable." });
    }
  });

  app.get('/api/ar/aging', requireAuth, async (req, res) => {
    try {
      const aging = await calculateARAging();
      res.json(aging);
    } catch (error: any) {
      console.error("AR aging error:", error);
      res.status(500).json({ error: "Failed to load accounts receivable aging analysis." });
    }
  });

  app.get('/api/ar/customer/:id/statement', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;
      const statement = await getCustomerStatement(id, startDate as string, endDate as string);
      res.json(statement);
    } catch (error: any) {
      console.error("Customer statement error:", error);
      res.status(500).json({ error: error.message || "Failed to generate customer statement ledger." });
    }
  });


  // ==========================================
  // CUSTOMER PAYMENTS (Milestone 2B Addition)
  // ==========================================

  app.get('/api/payments', requireAuth, async (req, res) => {
    try {
      const { customerId } = req.query;
      const list = await getCustomerPayments(customerId as string);
      res.json(list);
    } catch (error: any) {
      console.error("Fetch payments error:", error);
      res.status(500).json({ error: "Failed to load payments." });
    }
  });

  app.get('/api/payments/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const detail = await getPaymentDetail(id);
      res.json(detail);
    } catch (error: any) {
      console.error("Fetch payment detail error:", error);
      res.status(500).json({ error: error.message || "Failed to load payment detail." });
    }
  });

  app.post('/api/payments', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create payments." });
      }
      const paymentId = await createCustomerPayment(req.body, req.user!.uid, req.user!.role);
      res.status(201).json({ success: true, id: paymentId });
    } catch (error: any) {
      console.error("Create payment error:", error);
      res.status(400).json({ error: error.message || "Failed to record payment." });
    }
  });

  app.put('/api/payments/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit payments." });
      }
      const { id } = req.params;
      const paymentId = await editDraftPayment(id, req.body, req.user!.uid, req.user!.role);
      res.json({ success: true, id: paymentId });
    } catch (error: any) {
      console.error("Edit payment error:", error);
      res.status(400).json({ error: error.message || "Failed to update payment." });
    }
  });

  app.post('/api/payments/:id/post', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot post payments." });
      }
      const { id } = req.params;
      const journalId = await postCustomerPayment(id, req.user!.uid, req.user!.role);
      res.json({ success: true, journalId, message: "Payment posted successfully and integrated into General Ledger." });
    } catch (error: any) {
      console.error("Post payment error:", error);
      res.status(400).json({ error: error.message || "Failed to post payment." });
    }
  });

  app.post('/api/payments/:id/void', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot void payments." });
      }
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "A void reason must be provided." });
      }
      const reversalJournalId = await voidCustomerPayment(id, reason, req.user!.uid, req.user!.role);
      res.json({ success: true, reversalJournalId, message: "Payment voided and compensating reversal entry written." });
    } catch (error: any) {
      console.error("Void payment error:", error);
      res.status(400).json({ error: error.message || "Failed to void payment." });
    }
  });

  app.get('/api/sales-invoices/:id/outstanding', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const outstanding = await getInvoiceOutstandingBalance(id);
      res.json({ outstanding });
    } catch (error: any) {
      console.error("Get outstanding balance error:", error);
      res.status(500).json({ error: error.message || "Failed to retrieve invoice outstanding balance." });
    }
  });


  // ==========================================
  // SUPPLIERS & VENDORS (Milestone 3A Addition)
  // ==========================================

  app.get('/api/suppliers', requireAuth, async (req, res) => {
    try {
      const { search } = req.query;
      const list = await getSuppliers(search as string);
      res.json(list);
    } catch (error: any) {
      console.error("Fetch suppliers error:", error);
      res.status(500).json({ error: "Failed to load supplier records." });
    }
  });

  app.get('/api/suppliers/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const supplier = await getSupplierDetail(id);
      res.json(supplier);
    } catch (error: any) {
      console.error("Fetch supplier detail error:", error);
      res.status(404).json({ error: error.message || "Supplier profile not found." });
    }
  });

  app.post('/api/suppliers', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create supplier profiles." });
      }
      const data = await createSupplier(req.body, req.user!.uid, req.user!.role);
      res.status(201).json(data);
    } catch (error: any) {
      console.error("Create supplier error:", error);
      res.status(400).json({ error: error.message || "Failed to create supplier profile." });
    }
  });

  app.put('/api/suppliers/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit supplier profiles." });
      }
      const { id } = req.params;
      const data = await updateSupplier(id, req.body, req.user!.uid, req.user!.role);
      res.json(data);
    } catch (error: any) {
      console.error("Update supplier error:", error);
      res.status(400).json({ error: error.message || "Failed to update supplier profile." });
    }
  });

  app.put('/api/suppliers/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot alter supplier active states." });
      }
      const { id } = req.params;
      const { isActive } = req.body;
      if (isActive === undefined) {
        return res.status(400).json({ error: "isActive parameter is required." });
      }
      const data = await toggleSupplierStatus(id, isActive, req.user!.uid, req.user!.role);
      res.json(data);
    } catch (error: any) {
      console.error("Toggle supplier active error:", error);
      res.status(400).json({ error: error.message || "Failed to alter supplier state." });
    }
  });

  app.delete('/api/suppliers/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot delete supplier profiles." });
      }
      const { id } = req.params;
      const result = await deleteSupplier(id, req.user!.uid, req.user!.role);
      res.json(result);
    } catch (error: any) {
      console.error("Delete supplier error:", error);
      res.status(400).json({ error: error.message || "Failed to delete supplier." });
    }
  });


  // ==========================================
  // PURCHASE BILLS (Milestone 3A Addition)
  // ==========================================

  app.get('/api/purchase-bills', requireAuth, async (req, res) => {
    try {
      const { supplierId, status, search } = req.query;
      const bills = await getPurchaseBills({
        supplierId: supplierId as string,
        status: status as string,
        search: search as string,
      });
      res.json(bills);
    } catch (error: any) {
      console.error("Fetch purchase bills error:", error);
      res.status(500).json({ error: "Failed to load purchase bills." });
    }
  });

  app.get('/api/purchase-bills/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const bill = await getPurchaseBillDetail(id);
      res.json(bill);
    } catch (error: any) {
      console.error("Fetch purchase bill detail error:", error);
      res.status(404).json({ error: error.message || "Purchase bill not found." });
    }
  });

  app.post('/api/purchase-bills', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create purchase bills." });
      }
      const billId = await createPurchaseBill(req.body, req.user!.uid, req.user!.role);
      res.status(201).json({ success: true, id: billId });
    } catch (error: any) {
      console.error("Create purchase bill error:", error);
      res.status(400).json({ error: error.message || "Failed to create purchase bill." });
    }
  });

  app.put('/api/purchase-bills/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit purchase bills." });
      }
      const { id } = req.params;
      const billId = await editDraftBill(id, req.body, req.user!.uid, req.user!.role);
      res.json({ success: true, id: billId });
    } catch (error: any) {
      console.error("Edit purchase bill error:", error);
      res.status(400).json({ error: error.message || "Failed to update purchase bill." });
    }
  });

  app.post('/api/purchase-bills/:id/post', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot post purchase bills." });
      }
      const { id } = req.params;
      const result = await postPurchaseBill(id, req.user!.uid, req.user!.role);
      res.json({ success: true, ...result, message: "Purchase bill posted to ledger successfully." });
    } catch (error: any) {
      console.error("Post purchase bill error:", error);
      res.status(400).json({ error: error.message || "Failed to post purchase bill." });
    }
  });

  app.post('/api/purchase-bills/:id/void', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot void purchase bills." });
      }
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "A void reason is required." });
      }
      const result = await voidPurchaseBill(id, reason, req.user!.uid, req.user!.role);
      res.json({ success: true, ...result, message: "Purchase bill voided and ledger reversed." });
    } catch (error: any) {
      console.error("Void purchase bill error:", error);
      res.status(400).json({ error: error.message || "Failed to void purchase bill." });
    }
  });

  app.delete('/api/purchase-bills/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot delete purchase bills." });
      }
      const { id } = req.params;
      const result = await deletePurchaseBill(id, req.user!.uid, req.user!.role);
      res.json(result);
    } catch (error: any) {
      console.error("Delete purchase bill error:", error);
      res.status(400).json({ error: error.message || "Failed to delete purchase bill." });
    }
  });


  // ==========================================
  // ACCOUNTS PAYABLE (AP) (Milestone 3A Addition)
  // ==========================================

  app.get('/api/ap/outstanding', requireAuth, async (req, res) => {
    try {
      const outstanding = await getOutstandingAP();
      res.json(outstanding);
    } catch (error: any) {
      console.error("Outstanding AP error:", error);
      res.status(500).json({ error: "Failed to load outstanding accounts payable." });
    }
  });

  app.get('/api/ap/aging', requireAuth, async (req, res) => {
    try {
      const { pivotDate } = req.query;
      const aging = await calculateAPAging(pivotDate as string);
      res.json(aging);
    } catch (error: any) {
      console.error("AP aging error:", error);
      res.status(500).json({ error: "Failed to load accounts payable aging analysis." });
    }
  });

  app.get('/api/ap/supplier/:id/statement', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const statement = await getSupplierStatement(id);
      res.json(statement);
    } catch (error: any) {
      console.error("Supplier statement error:", error);
      res.status(500).json({ error: error.message || "Failed to generate supplier statement ledger." });
    }
  });

  // ==========================================
  // SUPPLIER PAYMENTS & ALLOCATIONS (Milestone 3B Addition)
  // ==========================================

  app.get('/api/supplier-payments', requireAuth, async (req, res) => {
    try {
      const { supplierId, status } = req.query;
      const payments = await getSupplierPayments({
        supplierId: supplierId as string,
        status: status as string,
      });
      res.json(payments);
    } catch (error: any) {
      console.error("Get supplier payments error:", error);
      res.status(500).json({ error: "Failed to load supplier payments." });
    }
  });

  app.get('/api/supplier-payments/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const payment = await getSupplierPaymentDetail(id);
      res.json(payment);
    } catch (error: any) {
      console.error("Get supplier payment detail error:", error);
      res.status(404).json({ error: error.message || "Supplier payment record not found." });
    }
  });

  app.post('/api/supplier-payments', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create supplier payments." });
      }
      const payment = await createSupplierPayment(req.body, req.user!.uid, req.user!.role);
      res.status(201).json(payment);
    } catch (error: any) {
      console.error("Create supplier payment error:", error);
      res.status(400).json({ error: error.message || "Failed to create supplier payment." });
    }
  });

  app.put('/api/supplier-payments/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit supplier payments." });
      }
      const { id } = req.params;
      const paymentId = await editDraftSupplierPayment(id, req.body, req.user!.uid, req.user!.role);
      res.json({ success: true, id: paymentId });
    } catch (error: any) {
      console.error("Edit supplier payment error:", error);
      res.status(400).json({ error: error.message || "Failed to update supplier payment." });
    }
  });

  app.post('/api/supplier-payments/:id/post', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot post supplier payments." });
      }
      const { id } = req.params;
      const result = await postSupplierPayment(id, req.user!.uid, req.user!.role);
      res.json({ success: true, ...result, message: "Supplier payment posted to ledger successfully." });
    } catch (error: any) {
      console.error("Post supplier payment error:", error);
      res.status(400).json({ error: error.message || "Failed to post supplier payment." });
    }
  });

  app.post('/api/supplier-payments/:id/void', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot void supplier payments." });
      }
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: "A void reason is required." });
      }
      const result = await voidSupplierPayment(id, reason, req.user!.uid, req.user!.role);
      res.json({ success: true, ...result, message: "Supplier payment voided and ledger reversed." });
    } catch (error: any) {
      console.error("Void supplier payment error:", error);
      res.status(400).json({ error: error.message || "Failed to void supplier payment." });
    }
  });

  app.delete('/api/supplier-payments/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot delete supplier payments." });
      }
      const { id } = req.params;
      const result = await deleteDraftSupplierPayment(id, req.user!.uid, req.user!.role);
      res.json(result);
    } catch (error: any) {
      console.error("Delete supplier payment error:", error);
      res.status(400).json({ error: error.message || "Failed to delete supplier payment." });
    }
  });

  app.get('/api/purchase-bills/:id/outstanding', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const outstanding = await getBillOutstandingBalance(id);
      const status = await getBillPaymentStatus(id);
      res.json({ id, outstanding, ...status });
    } catch (error: any) {
      console.error("Get bill outstanding error:", error);
      res.status(400).json({ error: error.message || "Failed to get purchase bill outstanding." });
    }
  });


  // ==========================================
  // DIRECT EXPENSES (Milestone 4 Addition)
  // ==========================================

  app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
      const { status, startDate, endDate, expenseAccountId, paymentAccountId, search } = req.query;
      const list = await getExpenses({
        status: status as string,
        startDate: startDate as string,
        endDate: endDate as string,
        expenseAccountId: expenseAccountId as string,
        paymentAccountId: paymentAccountId as string,
        search: search as string,
      });
      res.json(list);
    } catch (error: any) {
      console.error("Fetch expenses error:", error);
      res.status(500).json({ error: error.message || "Failed to load expenses list." });
    }
  });

  app.get('/api/expenses/metrics', requireAuth, async (req, res) => {
    try {
      const metrics = await getExpenseMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error("Fetch expense metrics error:", error);
      res.status(500).json({ error: error.message || "Failed to load expense metrics." });
    }
  });

  app.get('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const expense = await getExpenseDetail(id);
      res.json(expense);
    } catch (error: any) {
      console.error("Fetch expense detail error:", error);
      const status = error.message?.includes("not found") ? 404 : 400;
      res.status(status).json({ error: error.message || "Failed to load expense detail." });
    }
  });

  app.post('/api/expenses', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create expenses." });
      }

      const created = await createExpense(req.body, req.user!.uid, req.user!.role);
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Create expense error:", error);
      res.status(400).json({ error: error.message || "Failed to create expense." });
    }
  });

  app.put('/api/expenses/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot edit expenses." });
      }

      const { id } = req.params;
      const updated = await editDraftExpense(id, req.body, req.user!.uid, req.user!.role);
      res.json(updated);
    } catch (error: any) {
      console.error("Edit expense error:", error);
      const status = error.message?.includes("not found") ? 404 : 400;
      res.status(status).json({ error: error.message || "Failed to update expense." });
    }
  });

  app.post('/api/expenses/:id/post', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot post expenses." });
      }

      const { id } = req.params;
      const result = await postExpense(id, req.user!.uid, req.user!.role);
      res.json(result);
    } catch (error: any) {
      console.error("Post expense error:", error);
      const status = error.message?.includes("not found") ? 404 : 400;
      res.status(status).json({ error: error.message || "Failed to post expense." });
    }
  });

  app.post('/api/expenses/:id/void', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot void expenses." });
      }

      const { id } = req.params;
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: "A valid void reason is required." });
      }

      const result = await voidExpense(id, reason, req.user!.uid, req.user!.role);
      res.json(result);
    } catch (error: any) {
      console.error("Void expense error:", error);
      const status = error.message?.includes("not found") ? 404 : 400;
      res.status(status).json({ error: error.message || "Failed to void expense." });
    }
  });

  app.delete('/api/expenses/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot delete expenses." });
      }

      const { id } = req.params;
      const result = await deleteDraftExpense(id, req.user!.uid, req.user!.role);
      res.json({ success: result, message: "Draft expense deleted successfully." });
    } catch (error: any) {
      console.error("Delete expense error:", error);
      const status = error.message?.includes("not found") ? 404 : 400;
      res.status(status).json({ error: error.message || "Failed to delete expense." });
    }
  });


  // ==========================================
  // GENERAL JOURNAL / JOURNAL ENTRIES
  // ==========================================

  app.get('/api/journals', requireAuth, async (req, res) => {
    try {
      const { reference, startDate, endDate, search } = req.query;

      let conditions: any[] = [];
      if (reference) {
        conditions.push(ilike(journalEntries.reference, `%${reference}%`));
      }
      if (search) {
        conditions.push(or(
          ilike(journalEntries.reference, `%${search}%`),
          ilike(journalEntries.description, `%${search}%`)
        ));
      }
      if (startDate) {
        conditions.push(gte(journalEntries.entryDate, startDate as string));
      }
      if (endDate) {
        conditions.push(lte(journalEntries.entryDate, endDate as string));
      }

      const query = db.select()
        .from(journalEntries);

      if (conditions.length > 0) {
        query.where(and(...conditions));
      }

      const entries = await query.orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt));

      // Calculate totals for each journal entry
      const linesTotals = await db.select({
        entryId: journalLines.entryId,
        totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)::int`,
        linesCount: sql<number>`count(*)::int`
      })
      .from(journalLines)
      .groupBy(journalLines.entryId);

      const totalMap = new Map(linesTotals.map(t => [t.entryId, { totalDebit: t.totalDebit, linesCount: t.linesCount }]));
      const enriched = entries.map(e => ({
        ...e,
        totalDebit: totalMap.get(e.id)?.totalDebit || 0,
        linesCount: totalMap.get(e.id)?.linesCount || 0,
      }));

      res.json(enriched);
    } catch (error: any) {
      console.error("Fetch journals error:", error);
      res.status(500).json({ error: "Failed to load journal records" });
    }
  });

  app.get('/api/journals/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const entries = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
      if (entries.length === 0) {
        return res.status(404).json({ error: "Journal entry not found." });
      }

      const lines = await db.select({
        id: journalLines.id,
        accountId: journalLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        accountType: accounts.type,
        debit: journalLines.debit,
        credit: journalLines.credit,
        description: journalLines.description,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(eq(journalLines.entryId, id));

      const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
      const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);

      // Check linked source documents (Purchase Bill, Sales Invoice, etc.)
      let linkedDocument: { type: string; id: string; number: string } | null = null;
      const linkedBill = await db.select({ id: purchaseBillsTable.id, number: purchaseBillsTable.billNumber })
        .from(purchaseBillsTable)
        .where(eq(purchaseBillsTable.postedJournalId, id))
        .limit(1);
      if (linkedBill.length > 0) {
        linkedDocument = { type: 'purchase-bill', id: linkedBill[0].id, number: linkedBill[0].number };
      } else {
        const linkedInv = await db.select({ id: salesInvoices.id, number: salesInvoices.invoiceNumber })
          .from(salesInvoices)
          .where(eq(salesInvoices.postedJournalId, id))
          .limit(1);
        if (linkedInv.length > 0) {
          linkedDocument = { type: 'sales-invoice', id: linkedInv[0].id, number: linkedInv[0].number };
        }
      }

      res.json({
        ...entries[0],
        totalDebit,
        totalCredit,
        lines,
        linkedDocument,
      });
    } catch (error: any) {
      console.error("Fetch journal detail error:", error);
      res.status(500).json({ error: "Failed to load journal entry details" });
    }
  });

  // ==========================================
  // GLOBAL SEARCH (Invoices, Purchase Bills, Products, Journals)
  // ==========================================
  app.get('/api/search', requireAuth, async (req, res) => {
    try {
      const q = ((req.query.q || req.query.query || '') as string).trim();
      if (!q || q.length < 1) {
        return res.json({
          invoices: [],
          purchaseBills: [],
          products: [],
          journals: [],
        });
      }

      const pattern = `%${q}%`;

      // 1. Sales Invoices
      const invoicesList = await db.select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        customerName: customersTable.name,
        customerCode: customersTable.customerCode,
        invoiceDate: salesInvoices.invoiceDate,
        dueDate: salesInvoices.dueDate,
        status: salesInvoices.status,
        total: salesInvoices.total,
        postedJournalId: salesInvoices.postedJournalId,
      })
      .from(salesInvoices)
      .leftJoin(customersTable, eq(salesInvoices.customerId, customersTable.id))
      .where(or(
        ilike(salesInvoices.invoiceNumber, pattern),
        ilike(customersTable.name, pattern),
        ilike(customersTable.customerCode, pattern)
      ))
      .orderBy(desc(salesInvoices.invoiceDate), desc(salesInvoices.createdAt))
      .limit(8);

      // 2. Purchase Bills
      const billsList = await db.select({
        id: purchaseBillsTable.id,
        billNumber: purchaseBillsTable.billNumber,
        supplierName: suppliersTable.name,
        supplierCode: suppliersTable.supplierCode,
        supplierInvoiceNumber: purchaseBillsTable.supplierInvoiceNumber,
        billDate: purchaseBillsTable.billDate,
        dueDate: purchaseBillsTable.dueDate,
        status: purchaseBillsTable.status,
        total: purchaseBillsTable.total,
        postedJournalId: purchaseBillsTable.postedJournalId,
      })
      .from(purchaseBillsTable)
      .leftJoin(suppliersTable, eq(purchaseBillsTable.supplierId, suppliersTable.id))
      .where(or(
        ilike(purchaseBillsTable.billNumber, pattern),
        ilike(purchaseBillsTable.supplierInvoiceNumber, pattern),
        ilike(suppliersTable.name, pattern),
        ilike(suppliersTable.supplierCode, pattern)
      ))
      .orderBy(desc(purchaseBillsTable.billDate), desc(purchaseBillsTable.createdAt))
      .limit(8);

      // 3. Products & Services Master Catalogue
      const productsList = await db.select({
        id: productsTable.id,
        productCode: productsTable.productCode,
        name: productsTable.name,
        description: productsTable.description,
        salesUnit: productsTable.salesUnit,
        sellingPrice: productsTable.sellingPrice,
        purchaseCost: productsTable.purchaseCost,
        isActive: productsTable.isActive,
      })
      .from(productsTable)
      .where(or(
        ilike(productsTable.name, pattern),
        ilike(productsTable.productCode, pattern),
        ilike(productsTable.description, pattern)
      ))
      .orderBy(asc(productsTable.productCode))
      .limit(8);

      // 4. Journal Entries
      const journalsList = await db.select({
        id: journalEntries.id,
        reference: journalEntries.reference,
        description: journalEntries.description,
        entryDate: journalEntries.entryDate,
        status: journalEntries.status,
      })
      .from(journalEntries)
      .where(or(
        ilike(journalEntries.reference, pattern),
        ilike(journalEntries.description, pattern)
      ))
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
      .limit(8);

      // Enrich journals with total amount
      const enrichedJournals = [];
      for (const j of journalsList) {
        const sumResult = await db.select({
          totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)::int`
        })
        .from(journalLines)
        .where(eq(journalLines.entryId, j.id));
        enrichedJournals.push({
          ...j,
          totalDebit: sumResult[0]?.totalDebit || 0,
        });
      }

      res.json({
        query: q,
        invoices: invoicesList,
        purchaseBills: billsList,
        products: productsList,
        journals: enrichedJournals,
      });
    } catch (error: any) {
      console.error("Global search error:", error);
      res.status(500).json({ error: "Failed to perform search." });
    }
  });

  /**
   * Post a new balanced double-entry journal
   */
  app.post('/api/journals', requireAuth, async (req: AuthRequest, res) => {
    try {
      // Server-Side RBAC Enforcement
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create or post journal entries." });
      }

      const { entryDate, reference, description, lines } = req.body;
      if (!entryDate || !description || !lines) {
        return res.status(400).json({ error: "Missing required fields (entryDate, description, lines)." });
      }

      const entryId = await postJournalEntry({
        entryDate,
        reference,
        description,
        lines,
      }, req.user!.uid, req.user!.role);

      res.status(201).json({ success: true, id: entryId, message: "Journal entry posted successfully to ledger." });
    } catch (error: any) {
      console.error("Post journal error:", error);
      res.status(400).json({ error: error.message || "Failed to post journal entry" });
    }
  });

  /**
   * Void a posted journal entry
   */
  app.post('/api/journals/:id/void', requireAuth, async (req: AuthRequest, res) => {
    try {
      // Server-Side RBAC Enforcement
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot void journal entries." });
      }

      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "A void reason must be provided." });
      }

      const reversalId = await voidJournalEntry(id, reason, req.user!.uid, req.user!.role);
      res.json({ success: true, message: "Journal entry voided. Reversal entry posted.", reversalId });
    } catch (error: any) {
      console.error("Void journal error:", error);
      res.status(400).json({ error: error.message || "Failed to void journal entry" });
    }
  });


  // ==========================================
  // GENERAL LEDGER & RUNNING BALANCE
  // ==========================================

  app.get('/api/ledger', requireAuth, async (req, res) => {
    try {
      const { accountId, startDate, endDate, reference } = req.query;

      if (!accountId) {
        return res.status(400).json({ error: "An accountId query parameter is required to view General Ledger details." });
      }

      // Fetch the selected account
      const selectedAcc = await db.select().from(accounts).where(eq(accounts.id, accountId as string));
      if (selectedAcc.length === 0) {
        return res.status(404).json({ error: "Account not found." });
      }
      const account = selectedAcc[0];

      // A. Calculate Opening Balance before startDate
      // Sum all Posted debits and credits from day 1 up to start date
      let openingBalance = 0;
      if (startDate) {
        const pastLines = await db.select({
          debitSum: sql<number>`sum(${journalLines.debit})::int`,
          creditSum: sql<number>`sum(${journalLines.credit})::int`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .where(
          and(
            eq(journalLines.accountId, accountId as string),
            eq(journalEntries.status, 'Posted'),
            sql`${journalEntries.entryDate} < ${startDate}`
          )
        );

        const debits = pastLines[0]?.debitSum || 0;
        const credits = pastLines[0]?.creditSum || 0;

        if (account.normalBalance === 'Debit') {
          openingBalance = debits - credits;
        } else {
          openingBalance = credits - debits;
        }
      }

      // B. Fetch Transaction details within timeframe
      let conditions = [
        eq(journalLines.accountId, accountId as string),
        eq(journalEntries.status, 'Posted'),
      ];

      if (startDate) conditions.push(gte(journalEntries.entryDate, startDate as string));
      if (endDate) conditions.push(lte(journalEntries.entryDate, endDate as string));
      if (reference) conditions.push(like(journalEntries.reference, `%${reference}%`));

      const rows = await db.select({
        lineId: journalLines.id,
        entryId: journalEntries.id,
        entryDate: journalEntries.entryDate,
        reference: journalEntries.reference,
        description: journalEntries.description,
        debit: journalLines.debit,
        credit: journalLines.credit,
        lineDescription: journalLines.description,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...conditions))
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.createdAt));

      // C. Calculate running balance sequentially
      let currentBalance = openingBalance;
      const ledgerLines = rows.map((row) => {
        if (account.normalBalance === 'Debit') {
          currentBalance += (row.debit - row.credit);
        } else {
          currentBalance += (row.credit - row.debit);
        }
        return {
          ...row,
          runningBalance: currentBalance,
        };
      });

      // Calculate totals for summary cards
      const totalDebits = rows.reduce((acc, r) => acc + r.debit, 0);
      const totalCredits = rows.reduce((acc, r) => acc + r.credit, 0);
      const closingBalance = currentBalance;

      res.json({
        account,
        openingBalance,
        totalDebits,
        totalCredits,
        closingBalance,
        lines: ledgerLines,
      });
    } catch (error: any) {
      console.error("General ledger error:", error);
      res.status(500).json({ error: error.message || "Failed to load General Ledger" });
    }
  });


  // ==========================================
  // TRIAL BALANCE FOUNDATION REPORT
  // ==========================================

  app.get('/api/reports/trial-balance', requireAuth, async (req, res) => {
    try {
      const { periodId, startDate, endDate } = req.query;

      let dateConditions: any[] = [eq(journalEntries.status, 'Posted')];

      if (periodId) {
        const period = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, periodId as string));
        if (period.length > 0) {
          dateConditions.push(gte(journalEntries.entryDate, period[0].startDate));
          dateConditions.push(lte(journalEntries.entryDate, period[0].endDate));
        }
      } else {
        if (startDate) dateConditions.push(gte(journalEntries.entryDate, startDate as string));
        if (endDate) dateConditions.push(lte(journalEntries.entryDate, endDate as string));
      }

      // Fetch all accounts
      const allAccounts = await db.select().from(accounts).orderBy(asc(accounts.code));

      // Fetch aggregates grouped by accountId for Posted entries
      const aggregates = await db.select({
        accountId: journalLines.accountId,
        totalDebit: sql<number>`sum(${journalLines.debit})::int`,
        totalCredit: sql<number>`sum(${journalLines.credit})::int`
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...dateConditions))
      .groupBy(journalLines.accountId);

      // Create lookup dictionary
      const aggLookup = new Map(aggregates.map(a => [a.accountId, a]));

      let totalDebitsSum = 0;
      let totalCreditsSum = 0;

      const trialBalanceRows = allAccounts.map((acc) => {
        const agg = aggLookup.get(acc.id) || { totalDebit: 0, totalCredit: 0 };
        const debitSum = agg.totalDebit;
        const creditSum = agg.totalCredit;

        let debitBal = 0;
        let creditBal = 0;

        if (acc.normalBalance === 'Debit') {
          const bal = debitSum - creditSum;
          if (bal >= 0) {
            debitBal = bal;
          } else {
            creditBal = Math.abs(bal); // Negative debit bal is displayed as a credit balance
          }
        } else {
          const bal = creditSum - debitSum;
          if (bal >= 0) {
            creditBal = bal;
          } else {
            debitBal = Math.abs(bal); // Negative credit bal is displayed as a debit balance
          }
        }

        totalDebitsSum += debitBal;
        totalCreditsSum += creditBal;

        return {
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          normalBalance: acc.normalBalance,
          debit: debitBal,
          credit: creditBal,
          rawDebit: debitSum,
          rawCredit: creditSum,
        };
      }).filter(r => r.debit > 0 || r.credit > 0 || r.rawDebit > 0 || r.rawCredit > 0); // Include active accounts

      const isBalanced = totalDebitsSum === totalCreditsSum;

      res.json({
        rows: trialBalanceRows,
        totalDebits: totalDebitsSum,
        totalCredits: totalCreditsSum,
        isBalanced,
        difference: Math.abs(totalDebitsSum - totalCreditsSum),
      });
    } catch (error: any) {
      console.error("Trial Balance generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate Trial Balance" });
    }
  });


  // ==========================================
  // FINANCIAL STATEMENTS (Milestone 5B Addition)
  // ==========================================

  app.get('/api/reports/profit-loss', requireAuth, async (req, res) => {
    try {
      const { periodId, startDate, endDate } = req.query;
      const { generateProfitAndLoss } = await import('./src/services/financialReportService.ts');
      const report = await generateProfitAndLoss({
        periodId: periodId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json(report);
    } catch (error: any) {
      console.error("Profit & Loss generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate Profit & Loss statement." });
    }
  });

  app.get('/api/reports/balance-sheet', requireAuth, async (req, res) => {
    try {
      const { periodId, asOfDate, endDate } = req.query;
      const { generateBalanceSheet } = await import('./src/services/financialReportService.ts');
      const report = await generateBalanceSheet({
        periodId: periodId as string,
        asOfDate: (asOfDate || endDate) as string,
      });
      res.json(report);
    } catch (error: any) {
      console.error("Balance Sheet generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate Balance Sheet." });
    }
  });

  app.get('/api/reports/cash-flow', requireAuth, async (req, res) => {
    try {
      const { periodId, startDate, endDate } = req.query;
      const { generateCashFlowStatement } = await import('./src/services/financialReportService.ts');
      const report = await generateCashFlowStatement({
        periodId: periodId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json(report);
    } catch (error: any) {
      console.error("Cash Flow generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate Cash Flow statement." });
    }
  });


  // ==========================================
  // AUDIT LOG VIEWER
  // ==========================================

  app.get('/api/audit-logs', requireAuth, async (req, res) => {
    try {
      const logs = await db.select({
        id: auditLogs.id,
        action: auditLogs.action,
        tableName: auditLogs.tableName,
        recordId: auditLogs.recordId,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
        timestamp: auditLogs.timestamp,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.userId, users.uid))
      .orderBy(desc(auditLogs.timestamp));

      res.json(logs);
    } catch (error: any) {
      console.error("Fetch audit logs error:", error);
      res.status(500).json({ error: "Failed to retrieve system audit logs" });
    }
  });


  // ==========================================
  // BANK RECONCILIATION (Milestone 5A Addition)
  // ==========================================

  app.get('/api/bank-reconciliation/sessions', requireAuth, async (req, res) => {
    try {
      const { bankAccountId } = req.query;
      const { getBankReconciliationSessions } = await import('./src/services/bankReconciliationService.ts');
      const sessions = await getBankReconciliationSessions(bankAccountId as string);
      res.json(sessions);
    } catch (error: any) {
      console.error("Fetch recon sessions error:", error);
      res.status(500).json({ error: error.message || "Failed to load bank reconciliation sessions." });
    }
  });

  app.post('/api/bank-reconciliation/sessions', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create bank reconciliation sessions." });
      }
      const { createBankReconciliationSession } = await import('./src/services/bankReconciliationService.ts');
      const session = await createBankReconciliationSession(req.body, req.user!.uid, req.user!.role);
      res.status(201).json(session);
    } catch (error: any) {
      console.error("Create recon session error:", error);
      res.status(400).json({ error: error.message || "Failed to create bank reconciliation session." });
    }
  });

  app.get('/api/bank-reconciliation/sessions/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { calculateReconciliationSummary } = await import('./src/services/bankReconciliationService.ts');
      const summary = await calculateReconciliationSummary(id);
      res.json(summary);
    } catch (error: any) {
      console.error("Get recon session detail error:", error);
      res.status(400).json({ error: error.message || "Failed to load bank reconciliation session detail." });
    }
  });

  app.post('/api/bank-reconciliation/sessions/:id/import', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot import bank statement CSV files." });
      }
      const { id } = req.params;
      const { fileName, fileContent, rows } = req.body;
      const { importBankStatementCSV } = await import('./src/services/bankReconciliationService.ts');
      const result = await importBankStatementCSV(id, fileName, fileContent, rows, req.user!.uid, req.user!.role);
      res.json(result);
    } catch (error: any) {
      console.error("Import bank statement CSV error:", error);
      res.status(400).json({ error: error.message || "Failed to import bank statement CSV." });
    }
  });

  app.post('/api/bank-reconciliation/sessions/:id/auto-match', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot run auto-matching." });
      }
      const { id } = req.params;
      const { autoMatchSession } = await import('./src/services/bankReconciliationService.ts');
      const matches = await autoMatchSession(id, req.user!.uid, req.user!.role);
      res.json({ success: true, count: matches.length, matches });
    } catch (error: any) {
      console.error("Auto match session error:", error);
      res.status(400).json({ error: error.message || "Failed to execute auto-matching." });
    }
  });

  app.post('/api/bank-reconciliation/sessions/:id/match', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot create manual matches." });
      }
      const { id } = req.params;
      const { statementLineId, journalLineId, amountCents } = req.body;
      const { createManualMatch } = await import('./src/services/bankReconciliationService.ts');
      const match = await createManualMatch(id, statementLineId, journalLineId, amountCents, req.user!.uid, req.user!.role);
      res.json({ success: true, match });
    } catch (error: any) {
      console.error("Create manual match error:", error);
      res.status(400).json({ error: error.message || "Failed to match transaction." });
    }
  });

  app.delete('/api/bank-reconciliation/matches/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot remove matches." });
      }
      const { id } = req.params;
      const { deleteMatch } = await import('./src/services/bankReconciliationService.ts');
      await deleteMatch(id, req.user!.uid, req.user!.role);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete match error:", error);
      res.status(400).json({ error: error.message || "Failed to remove match." });
    }
  });

  app.post('/api/bank-reconciliation/sessions/:id/complete', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Viewers cannot complete reconciliation sessions." });
      }
      const { id } = req.params;
      const { completeBankReconciliationSession } = await import('./src/services/bankReconciliationService.ts');
      const completedSession = await completeBankReconciliationSession(id, req.user!.uid, req.user!.role);
      res.json({ success: true, session: completedSession, message: "Bank reconciliation session successfully completed and locked." });
    } catch (error: any) {
      console.error("Complete recon session error:", error);
      res.status(400).json({ error: error.message || "Failed to complete bank reconciliation session." });
    }
  });

  app.post('/api/bank-reconciliation/sessions/:id/reopen', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== 'Admin') {
        return res.status(403).json({ error: "Forbidden: Only Administrators can reopen completed reconciliation sessions." });
      }
      const { id } = req.params;
      const { reason } = req.body;
      const { reopenBankReconciliationSession } = await import('./src/services/bankReconciliationService.ts');
      const session = await reopenBankReconciliationSession(id, reason, req.user!.uid, req.user!.role);
      res.json({ success: true, session, message: "Reconciliation session reopened successfully." });
    } catch (error: any) {
      console.error("Reopen recon session error:", error);
      res.status(400).json({ error: error.message || "Failed to reopen bank reconciliation session." });
    }
  });

  // ==========================================
  // EMPLOYEES CONTACT MANAGEMENT (Unified Contact Module)
  // ==========================================

  app.get('/api/employees', requireAuth, async (req, res) => {
    try {
      const { search, status } = req.query;
      const { getEmployees } = await import('./src/services/employeeService.ts');
      const list = await getEmployees(search as string, status as string);
      res.json(list);
    } catch (error: any) {
      console.error("Fetch employees error:", error);
      res.status(500).json({ error: "Gagal memuatkan senarai pekerja." });
    }
  });

  app.get('/api/employees/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { getEmployeeById } = await import('./src/services/employeeService.ts');
      const emp = await getEmployeeById(id);
      res.json(emp);
    } catch (error: any) {
      console.error("Fetch employee detail error:", error);
      res.status(404).json({ error: error.message || "Pekerja tidak dijumpai." });
    }
  });

  app.post('/api/employees', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Penonton (Viewer) tidak boleh mendaftar pekerja." });
      }
      const { createEmployee } = await import('./src/services/employeeService.ts');
      const emp = await createEmployee(req.body, req.user!.role);
      
      // Audit log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'EMPLOYEE_CREATE',
        tableName: 'employees',
        recordId: emp.id,
        newValues: emp,
      });

      res.status(201).json(emp);
    } catch (error: any) {
      console.error("Create employee error:", error);
      res.status(400).json({ error: error.message || "Gagal mendaftar pekerja." });
    }
  });

  app.put('/api/employees/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Penonton (Viewer) tidak boleh mengemaskini pekerja." });
      }
      const { id } = req.params;
      const { updateEmployee } = await import('./src/services/employeeService.ts');
      const emp = await updateEmployee(id, req.body, req.user!.role);

      // Audit log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'EMPLOYEE_UPDATE',
        tableName: 'employees',
        recordId: emp.id,
        newValues: emp,
      });

      res.json(emp);
    } catch (error: any) {
      console.error("Update employee error:", error);
      res.status(400).json({ error: error.message || "Gagal mengemaskini pekerja." });
    }
  });

  app.put('/api/employees/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Penonton (Viewer) tidak boleh menukar status pekerja." });
      }
      const { id } = req.params;
      const { status } = req.body;
      const { updateEmployee } = await import('./src/services/employeeService.ts');
      const emp = await updateEmployee(id, { status }, req.user!.role);

      // Audit log
      await db.insert(auditLogs).values({
        userId: req.user!.uid,
        action: 'EMPLOYEE_STATUS_CHANGE',
        tableName: 'employees',
        recordId: emp.id,
        newValues: { status: emp.status },
      });

      res.json(emp);
    } catch (error: any) {
      console.error("Toggle employee status error:", error);
      res.status(400).json({ error: error.message || "Gagal menukar status pekerja." });
    }
  });

  // ==========================================
  // PRODUCT & SERVICES MASTER CATALOGUE
  // ==========================================

  app.get('/api/products', requireAuth, async (req, res) => {
    try {
      const { search, status } = req.query;
      const { getProducts } = await import('./src/services/productService.ts');
      const list = await getProducts(search as string, status as string);
      res.json(list);
    } catch (error: any) {
      console.error("Fetch products error:", error);
      res.status(500).json({ error: "Gagal memuatkan senarai produk." });
    }
  });

  app.get('/api/products/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { getProductById } = await import('./src/services/productService.ts');
      const item = await getProductById(id);
      res.json(item);
    } catch (error: any) {
      console.error("Fetch product detail error:", error);
      res.status(404).json({ error: error.message || "Produk tidak dijumpai." });
    }
  });

  app.post('/api/products', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Penonton (Viewer) tidak dibenarkan mendaftar produk." });
      }
      const { createProduct } = await import('./src/services/productService.ts');
      const item = await createProduct(req.body, req.user!.uid, req.user!.role);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Create product error:", error);
      res.status(400).json({ error: error.message || "Gagal mendaftar produk." });
    }
  });

  app.put('/api/products/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Penonton (Viewer) tidak dibenarkan mengemaskini produk." });
      }
      const { id } = req.params;
      const { updateProduct } = await import('./src/services/productService.ts');
      const item = await updateProduct(id, req.body, req.user!.uid, req.user!.role);
      res.json(item);
    } catch (error: any) {
      console.error("Update product error:", error);
      res.status(400).json({ error: error.message || "Gagal mengemaskini produk." });
    }
  });

  app.put('/api/products/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === 'Viewer') {
        return res.status(403).json({ error: "Forbidden: Penonton (Viewer) tidak dibenarkan menukar status produk." });
      }
      const { id } = req.params;
      const { isActive } = req.body;
      const { updateProduct } = await import('./src/services/productService.ts');
      const item = await updateProduct(id, { isActive }, req.user!.uid, req.user!.role);
      res.json(item);
    } catch (error: any) {
      console.error("Toggle product status error:", error);
      res.status(400).json({ error: error.message || "Gagal menukar status produk." });
    }
  });

  // RUN TIME COMPILATION AND MIDDLEWARES
  // ==========================================

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  try {
    await db.execute(sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'Net 30' NOT NULL;`);
    console.log('[DB Schema Migration] Verified / added payment_terms column to suppliers table.');
  } catch (err: any) {
    console.warn('[DB Schema Migration Warning]', err.message);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Khairul Fresh Accounting] Full-Stack server booted in ${isProd ? 'Production' : 'Development'} mode.`);
    console.log(`Local Access Point: http://localhost:${port}`);
  });
}

startServer();
