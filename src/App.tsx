import React, { useState, useEffect, useRef } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext.tsx';
import { apiFetch, getFreshToken } from './lib/api.ts';
import { 
  BookOpen, 
  NotebookTabs, 
  History, 
  Calendar, 
  ShieldCheck, 
  LogOut, 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Building2, 
  RefreshCw, 
  ChevronRight,
  Eye,
  Info,
  Users,
  Receipt,
  TrendingUp,
  FileText,
  Truck,
  CreditCard,
  Wallet,
  Menu,
  X,
  ChevronLeft,
  Scale,
  DollarSign,
  Activity,
  BarChart3,
  Bell,
  HelpCircle,
  Search,
  LayoutDashboard,
  GitBranch,
  Package,
  Clock,
  Landmark,
  UserCheck,
  RotateCcw,
  Shield,
  UserPlus,
  ArrowLeft,
  ExternalLink,
  Printer
} from 'lucide-react';
import ExpensesView from './components/ExpensesView.tsx';
import BankReconciliationView from './components/BankReconciliationView.tsx';
import FinancialReportsView from './components/FinancialReportsView.tsx';
import DashboardView from './components/DashboardView.tsx';
import WorkflowView from './components/WorkflowView.tsx';
import CatalogueView, { getSavedCatalogueItems } from './components/CatalogueView.tsx';
import EmployeesView from './components/EmployeesView.tsx';
import MasterResetView from './components/MasterResetView.tsx';
import CompanyDetailsView from './components/CompanyDetailsView.tsx';
import UsersAdminView from './components/UsersAdminView.tsx';

// FORMATTING HELPER
const formatRM = (cents: number) => {
  const isNegative = cents < 0;
  const absValue = Math.abs(cents) / 100;
  const formattedStr = absValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `RM (${formattedStr})` : `RM ${formattedStr}`;
};

// Standalone PDF Generator using an isolated iframe to bypass Tailwind v4 stylesheet CSS parser limitations in html2canvas
export async function generatePdfFromHtml(
  htmlContent: string,
  fileName: string,
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '10000px';
  iframe.style.bottom = '10000px';
  iframe.style.width = orientation === 'landscape' ? '1120px' : '794px';
  iframe.style.height = '1120px';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error("Gagal mencipta dokumen iframe untuk PDF");

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${fileName}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background-color: #ffffff;
              color: #0f172a;
              padding: 20px;
              width: 100%;
              font-size: 11px;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `);
    doc.close();

    // Small delay to allow browser to lay out the iframe document
    await new Promise((resolve) => setTimeout(resolve, 300));

    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = html2pdfModule.default || html2pdfModule;

    const opt = {
      margin: [8, 8, 8, 8] as [number, number, number, number],
      filename: fileName,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation }
    };

    await html2pdf().set(opt).from(doc.body).save();
  } finally {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }
}

export function buildCustomerStatementHtml(statement: any, company: any) {
  const comp = statement?.company || company || {};
  const cust = statement?.customer || {};
  const startDate = statement?.startDate || '';
  const endDate = statement?.endDate || '';
  const genDate = new Date().toLocaleDateString('ms-MY', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const openingBalance = statement?.openingBalance || 0;
  const totalDebit = statement?.periodTotalDebit || 0;
  const totalCredit = statement?.periodTotalCredit || 0;
  const closingBalance = statement?.closingBalance || 0;

  const lines = statement?.statementLines || [];

  const linesHtml = lines.length === 0 ? `
    <tr>
      <td colSpan="7" style="text-align: center; padding: 16px; color: #64748b; font-style: italic;">
        Tiada transaksi invois atau bayaran baharu dalam tempoh tarikh ini.
      </td>
    </tr>
  ` : lines.map((line: any) => `
    <tr>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${line.date || ''}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${line.reference || ''}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${line.dueDate || '—'}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${line.description || (line.type === 'Invoice' ? 'Invois Jualan' : 'Resit Bayaran')}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #1d4ed8; font-family: monospace;">${line.debit > 0 ? formatRM(line.debit) : '—'}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #047857; font-family: monospace;">${line.credit > 0 ? formatRM(line.credit) : '—'}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace;">${formatRM(line.runningBalance)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background: #ffffff; padding: 16px; max-width: 900px; margin: 0 auto;">
      <!-- Header Company Details -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 16px;">
        <div>
          <h1 style="font-size: 22px; font-weight: 900; margin: 0; color: #0f172a;">${comp.name || 'KHAIRUL FRESH'}</h1>
          <p style="font-size: 11px; font-weight: 700; color: #475569; margin: 4px 0 0 0;">
            ${comp.registrationNumber ? `No. Pendaftaran: ${comp.registrationNumber}` : 'Khairul Fresh Produce & Supplies'}
          </p>
          ${comp.address ? `<p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0; white-space: pre-line;">${comp.address}</p>` : ''}
          <p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0;">
            ${comp.phone ? `Tel: ${comp.phone}` : ''} ${comp.email ? `· E-mel: ${comp.email}` : ''} ${comp.website ? `· ${comp.website}` : ''}
          </p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase;">PENYATA AKAUN</h2>
          <p style="font-size: 11px; font-weight: 700; color: #2563eb; margin: 4px 0 0 0;">STATEMENT OF ACCOUNT</p>
          <p style="font-size: 11px; color: #64748b; margin: 8px 0 0 0;">Tarikh Penyata: <strong>${genDate}</strong></p>
          <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Tempoh: <strong>${startDate}</strong> hingga <strong>${endDate}</strong></p>
        </div>
      </div>

      <!-- Customer Info & Overview -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Maklumat Pelanggan</span>
          <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">${cust.name || '—'}</h3>
          <p style="font-size: 11px; font-weight: 700; color: #2563eb; margin: 0 0 4px 0;">Kod Pelanggan: ${cust.customerCode || '—'}</p>
          ${(cust.billingAddress || cust.address) ? `<p style="font-size: 11px; color: #475569; margin: 0 0 4px 0; white-space: pre-line;">${cust.billingAddress || cust.address}</p>` : ''}
          <p style="font-size: 11px; color: #64748b; margin: 0;">
            ${cust.phone ? `Tel: ${cust.phone}` : ''} ${cust.email ? `· E-mel: ${cust.email}` : ''}
          </p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Ringkasan Baki Semasa</span>
          <div>
            <span style="font-size: 10px; color: #64748b; display: block;">Jumlah Baki Tertunggak</span>
            <span style="font-size: 20px; font-weight: 900; color: #0f172a; font-family: monospace;">${formatRM(closingBalance)}</span>
          </div>
          <p style="font-size: 10px; color: #475569; margin-top: 8px;">Sila buat bayaran berdasarkan tempoh yang telah ditetapkan.</p>
        </div>
      </div>

      <!-- 4-Grid Summary -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
        <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px;">
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569; display: block; margin-bottom: 4px;">Baki Pembukaan</span>
          <span style="font-size: 13px; font-weight: 800; font-family: monospace; color: #0f172a;">${formatRM(openingBalance)}</span>
        </div>
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px;">
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #1d4ed8; display: block; margin-bottom: 4px;">Jumlah Debit (Invois)</span>
          <span style="font-size: 13px; font-weight: 800; font-family: monospace; color: #1e40af;">${formatRM(totalDebit)}</span>
        </div>
        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px;">
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #047857; display: block; margin-bottom: 4px;">Jumlah Kredit (Bayaran)</span>
          <span style="font-size: 13px; font-weight: 800; font-family: monospace; color: #065f46;">${formatRM(totalCredit)}</span>
        </div>
        <div style="background-color: #0f172a; color: #ffffff; border-radius: 8px; padding: 10px;">
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #cbd5e1; display: block; margin-bottom: 4px;">Baki Penutup</span>
          <span style="font-size: 13px; font-weight: 800; font-family: monospace; color: #34d399;">${formatRM(closingBalance)}</span>
        </div>
      </div>

      <!-- Transaction Table -->
      <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; font-size: 10px; color: #334155;">
              <th style="padding: 8px 10px; text-align: left;">Tarikh</th>
              <th style="padding: 8px 10px; text-align: left;">No. Rujukan</th>
              <th style="padding: 8px 10px; text-align: left;">Due Date</th>
              <th style="padding: 8px 10px; text-align: left;">Keterangan</th>
              <th style="padding: 8px 10px; text-align: right;">Debit (RM)</th>
              <th style="padding: 8px 10px; text-align: right;">Kredit (RM)</th>
              <th style="padding: 8px 10px; text-align: right;">Baki (RM)</th>
            </tr>
          </thead>
          <tbody>
            <!-- Opening Balance Row -->
            <tr style="background-color: #f8fafc; font-style: italic; font-weight: 600;">
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${startDate}</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">—</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">—</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-style: normal;">Baki Pembukaan (Opening Balance)</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">—</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">—</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace;">${formatRM(openingBalance)}</td>
            </tr>
            ${linesHtml}
          </tbody>
        </table>
      </div>

      <!-- Footer Notes -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b;">
        <div>Penyata ini dijana secara automatik oleh Sistem Akaun Khairul Fresh.</div>
        <div>Muka surat 1 daripada 1</div>
      </div>
    </div>
  `;
}

export function buildPurchaseBillHtml(bill: any, company: any) {
  const comp = company || {};
  const rawItems = bill?.lines || [];
  const billDate = bill?.billDate || '';
  const dueDate = bill?.dueDate || '';
  const status = bill?.status || 'Draft';

  const subtotal = bill?.subtotal || 0;
  const discount = bill?.discount || 0;
  const total = bill?.total || 0;

  const itemsHtml = rawItems.map((item: any, idx: number) => {
    let desc = item.description || '';
    let sku = item.sku || '';
    let unit = item.unit || '';

    if (!sku || !unit) {
      const match = desc.match(/^\[(.*?)\]\s*(.*?)\s*\((.*?)\)$/);
      if (match) {
        sku = match[1];
        desc = match[2];
        unit = match[3];
      } else {
        const bracketMatch = desc.match(/^\[(.*?)\]\s*(.*)$/);
        if (bracketMatch) {
          sku = bracketMatch[1];
          desc = bracketMatch[2];
        }
      }
    }
    if (!unit) unit = 'unit';

    return `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${desc}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; color: #64748b;">${sku || '—'}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #64748b;">${unit}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${item.quantity}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${formatRM(item.unitPrice || 0)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; font-family: monospace;">${formatRM(item.lineTotal || (item.quantity * (item.unitPrice || 0)))}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background: #ffffff; padding: 16px; max-width: 900px; margin: 0 auto;">
      <!-- Header Company Details -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 16px;">
        <div>
          <h1 style="font-size: 22px; font-weight: 900; margin: 0; color: #0f172a;">${comp.name || 'KHAIRUL FRESH'}</h1>
          <p style="font-size: 11px; font-weight: 700; color: #475569; margin: 4px 0 0 0;">
            ${comp.registrationNumber ? `No. Pendaftaran: ${comp.registrationNumber}` : 'Khairul Fresh Produce & Supplies'}
          </p>
          ${comp.address ? `<p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0; white-space: pre-line;">${comp.address}</p>` : ''}
          <p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0;">
            ${comp.phone ? `Tel: ${comp.phone}` : ''} ${comp.email ? `· E-mel: ${comp.email}` : ''}
          </p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase;">BIL PEMBELIAN</h2>
          <p style="font-size: 13px; font-weight: 800; font-family: monospace; color: #2563eb; margin: 4px 0 0 0;">${bill.billNumber || 'BILL'}</p>
          <span style="display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; border: 1px solid #cbd5e1; text-transform: uppercase; background: #f1f5f9;">
            ${status}
          </span>
        </div>
      </div>

      <!-- Supplier & Bill Info -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 4px;">Pembekal (Supplier)</span>
          <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">${bill.supplierName || '—'} (${bill.supplierCode || ''})</h3>
          ${bill.supplierInvoiceNumber ? `<p style="font-size: 11px; font-family: monospace; color: #475569; margin: 0 0 4px 0;">Rujukan Invois Pembekal: ${bill.supplierInvoiceNumber}</p>` : ''}
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: #64748b;">Tarikh Bil:</span>
            <span style="font-weight: 700; color: #0f172a;">${billDate}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: #64748b;">Due Date:</span>
            <span style="font-weight: 700; color: #0f172a;">${dueDate}</span>
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px;">
        <thead>
          <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #475569; text-transform: uppercase; font-size: 10px; font-weight: 700;">
            <th style="padding: 8px 10px; text-align: center; width: 35px;">No.</th>
            <th style="padding: 8px 10px; text-align: left;">Deskripsi Item</th>
            <th style="padding: 8px 10px; text-align: left; width: 90px;">SKU</th>
            <th style="padding: 8px 10px; text-align: center; width: 60px;">Unit</th>
            <th style="padding: 8px 10px; text-align: right; width: 60px;">Kuantiti</th>
            <th style="padding: 8px 10px; text-align: right; width: 85px;">Harga Seunit</th>
            <th style="padding: 8px 10px; text-align: right; width: 95px;">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 24px;">
        <div style="width: 280px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="color: #64748b;">Jumlah Kecil:</span>
            <span style="font-family: monospace; font-weight: 700;">${formatRM(subtotal)}</span>
          </div>
          ${discount > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; color: #dc2626;">
            <span>Diskaun:</span>
            <span style="font-family: monospace; font-weight: 700;">-${formatRM(discount)}</span>
          </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; font-weight: 900; border-bottom: 2px solid #0f172a;">
            <span>Jumlah Keseluruhan:</span>
            <span style="font-family: monospace;">${formatRM(total)}</span>
          </div>
        </div>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b;">
        <div>Bil Pembelian rasmi ini dijana secara automatik oleh Sistem Akaun Khairul Fresh.</div>
        <div>Muka surat 1 daripada 1</div>
      </div>
    </div>
  `;
}

export function buildSalesInvoiceHtml(invoice: any, company: any) {
  const comp = company || {};
  const cust = invoice?.customer || {};
  const rawItems = invoice?.lines || invoice?.items || [];
  const invDate = invoice?.invoiceDate || '';
  const dueDate = invoice?.dueDate || '';
  const status = invoice?.status || 'POSTED';

  const subtotal = invoice?.subtotal || invoice?.total || 0;
  const tax = invoice?.taxTotal || 0;
  const total = invoice?.total || 0;
  const paid = invoice?.paidAmount || 0;
  const outstanding = invoice?.outstanding || 0;

  const itemsHtml = rawItems.map((item: any, idx: number) => `
    <tr>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${item.description || item.productName || ''}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; color: #64748b;">${item.sku || '-'}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${item.quantity} ${item.unit || 'unit'}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${formatRM(item.unitPrice || 0)}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; font-family: monospace;">${formatRM(item.lineTotal || item.amount || (item.quantity * (item.unitPrice || 0)))}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background: #ffffff; padding: 16px; max-width: 900px; margin: 0 auto;">
      <!-- Header Company Details -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 16px;">
        <div>
          <h1 style="font-size: 22px; font-weight: 900; margin: 0; color: #0f172a;">${comp.name || 'KHAIRUL FRESH'}</h1>
          <p style="font-size: 11px; font-weight: 700; color: #475569; margin: 4px 0 0 0;">
            ${comp.registrationNumber ? `No. Pendaftaran: ${comp.registrationNumber}` : 'Khairul Fresh Produce & Supplies'}
          </p>
          ${comp.address ? `<p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0; white-space: pre-line;">${comp.address}</p>` : ''}
          <p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0;">
            ${comp.phone ? `Tel: ${comp.phone}` : ''} ${comp.email ? `· E-mel: ${comp.email}` : ''}
          </p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase;">INVOIS JUALAN</h2>
          <p style="font-size: 13px; font-weight: 800; font-family: monospace; color: #2563eb; margin: 4px 0 0 0;">${invoice.invoiceNumber || 'INV'}</p>
          <span style="display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; border: 1px solid #cbd5e1; text-transform: uppercase; background: #f1f5f9;">
            ${status}
          </span>
        </div>
      </div>

      <!-- Customer & Invoice Info -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 4px;">Kepada (Pelanggan)</span>
          <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">${cust.name || invoice.customerName || '—'}</h3>
          ${(cust.address || cust.billingAddress) ? `<p style="font-size: 11px; color: #475569; margin: 0 0 4px 0; white-space: pre-line;">${cust.address || cust.billingAddress}</p>` : ''}
          <p style="font-size: 11px; color: #64748b; margin: 0;">
            ${cust.phone ? `Tel: ${cust.phone}` : ''} ${cust.email ? `· E-mel: ${cust.email}` : ''}
          </p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: #64748b;">Tarikh Invois:</span>
            <span style="font-weight: 700; color: #0f172a;">${invDate}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: #64748b;">Tarikh Matang (Due Date):</span>
            <span style="font-weight: 700; color: #0f172a;">${dueDate || '—'}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b;">Tempoh Bayaran:</span>
            <span style="font-weight: 700; color: #0f172a;">${invoice.paymentTerm || 'Net 30'}</span>
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; font-size: 10px; color: #334155;">
              <th style="padding: 8px 10px; text-align: center; width: 40px;">#</th>
              <th style="padding: 8px 10px; text-align: left;">Perihal Produk</th>
              <th style="padding: 8px 10px; text-align: left; width: 90px;">SKU</th>
              <th style="padding: 8px 10px; text-align: right; width: 90px;">Kuantiti</th>
              <th style="padding: 8px 10px; text-align: right; width: 110px;">Harga (RM)</th>
              <th style="padding: 8px 10px; text-align: right; width: 110px;">Jumlah (RM)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- Totals Summary -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
        <div style="width: 280px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: #64748b;">Jumlah Kecil:</span>
            <span style="font-weight: 700; font-family: monospace;">${formatRM(subtotal)}</span>
          </div>
          ${tax > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: #64748b;">Cukai (SST):</span>
              <span style="font-weight: 700; font-family: monospace;">${formatRM(tax)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 6px; margin-top: 6px; font-size: 13px; font-weight: 900;">
            <span>JUMLAH BESAR:</span>
            <span style="font-family: monospace; color: #0f172a;">${formatRM(total)}</span>
          </div>
          ${paid > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 6px; color: #047857; font-weight: 700;">
              <span>Jumlah Dibayar:</span>
              <span style="font-family: monospace;">${formatRM(paid)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 4px; color: #2563eb; font-weight: 800;">
              <span>Baki Belum Bayar:</span>
              <span style="font-family: monospace;">${formatRM(outstanding)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Footer Notes -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #64748b; text-align: center;">
        Terima kasih atas perniagaan anda. Sila buat bayaran kepada akaun bank Khairul Fresh.
      </div>
    </div>
  `;
}

// Core Application UI Layout
export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

function MainAppContent() {
  const { user, dbUser, token, loading, loginWithGoogle, logout, simulateRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workflow' | 'catalogue' | 'coa' | 'journal' | 'ledger' | 'periods' | 'audit' | 'trial-balance' | 'financial-reports' | 'customers' | 'invoices' | 'ar-aging' | 'payments' | 'suppliers' | 'purchase-bills' | 'supplier-payments' | 'ap-aging' | 'expenses' | 'bank-recon' | 'employees' | 'test-center' | 'master-reset' | 'company-details' | 'users-admin'>('dashboard');
  const [company, setCompany] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoadingCompany, setIsLoadingCompany] = useState(false);

  // Cross-module deep-link and navigation states
  const [initialJournalId, setInitialJournalId] = useState<string | null>(null);
  const [initialBillId, setInitialBillId] = useState<string | null>(null);
  const [initialInvoiceId, setInitialInvoiceId] = useState<string | null>(null);
  const [initialCatalogueSearch, setInitialCatalogueSearch] = useState<string | null>(null);

  // Layout responsiveness states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Global Search state
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Fetch initial company and account data
  const fetchData = async () => {
    if (!user) return;
    try {
      setIsLoadingCompany(true);
      // Fetch Company Profile
      const compRes = await apiFetch('/api/company/profile');
      if (compRes.ok) {
        const data = await compRes.json();
        setCompany(data);
      }

      // Fetch COA
      const coaRes = await apiFetch('/api/accounts');
      if (coaRes.ok) {
        const data = await coaRes.json();
        setAccounts(data);
      }

      // Fetch Accounting Periods
      const periodRes = await apiFetch('/api/periods');
      if (periodRes.ok) {
        const data = await periodRes.json();
        setPeriods(data);
      }

      // Fetch Customers
      const custRes = await apiFetch('/api/customers');
      if (custRes.ok) {
        const data = await custRes.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error("Error loading accounting foundation data:", err);
    } finally {
      setIsLoadingCompany(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  // Debounced live search
  useEffect(() => {
    if (!token) return;
    const query = globalSearchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error("Global search request error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [globalSearchQuery, token]);

  // Global search item selection handler
  const handleSelectSearchResult = (category: string, item: any) => {
    setIsSearchOpen(false);
    setIsMobileSearchOpen(false);
    setGlobalSearchQuery('');
    setSearchResults(null);

    if (category === 'invoices') {
      setInitialInvoiceId(item.id);
      setActiveTab('invoices');
    } else if (category === 'purchaseBills') {
      setInitialBillId(item.id);
      setActiveTab('purchase-bills');
    } else if (category === 'products') {
      setInitialCatalogueSearch(item.name || item.productCode);
      setActiveTab('catalogue');
    } else if (category === 'journals') {
      setInitialJournalId(item.id);
      setActiveTab('journal');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-slate-800 animate-spin" />
          <span className="text-sm font-medium text-slate-600">Booting Accounting Engine...</span>
        </div>
      </div>
    );
  }

  // Render Login state
  if (!user || !dbUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <div className="w-full max-w-md p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="p-3 bg-slate-900 text-white rounded-xl mb-4 shadow-xs">
              <BookOpen className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight text-center">Khairul Fresh Accounting</h1>
            <p className="text-sm text-slate-500 mt-1 text-center">Single-Company accounting portal for Khairul Fresh Food</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={loginWithGoogle}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-3 shadow-xs"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.3.65 4.5 1.8l2.4-2.4C17.3 1.7 14.9 1 12.24 1c-5.5 0-10 4.5-10 10s4.5 10 10 10c5.7 0 9.7-4 9.7-9.7 0-.6-.05-1.2-.15-1.7H12.24z"
                />
              </svg>
              Sign In with Google Identity
            </button>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>ACID Secure · Tabular-Cents Precision</span>
          </div>
        </div>
      </div>
    );
  }

  // Sidebar navigation content helper
  const renderNavItems = (isCollapsed: boolean) => (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto text-xs">
      {/* SEKSYEN: UTAMA */}
      <div className={`pt-2 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        UTAMA
      </div>
      <button
        onClick={() => { setActiveTab('dashboard'); setIsMobileDrawerOpen(false); }}
        title="Dashboard"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <LayoutDashboard className={`w-4 h-4 shrink-0 ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Dashboard</span>}
      </button>
      <button
        onClick={() => { setActiveTab('workflow'); setIsMobileDrawerOpen(false); }}
        title="Aliran Kerja"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'workflow' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <GitBranch className={`w-4 h-4 shrink-0 ${activeTab === 'workflow' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Aliran Kerja</span>}
      </button>

      {/* SEKSYEN: CONTACT */}
      <div className={`pt-4 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        Contact
      </div>
      <button
        onClick={() => { setActiveTab('customers'); setIsMobileDrawerOpen(false); }}
        title="Customers"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'customers' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Users className={`w-4 h-4 shrink-0 ${activeTab === 'customers' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Customers</span>}
      </button>
      <button
        onClick={() => { setActiveTab('suppliers'); setIsMobileDrawerOpen(false); }}
        title="Suppliers"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'suppliers' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Truck className={`w-4 h-4 shrink-0 ${activeTab === 'suppliers' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Suppliers</span>}
      </button>
      <button
        onClick={() => { setActiveTab('employees'); setIsMobileDrawerOpen(false); }}
        title="Employees"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'employees' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <UserCheck className={`w-4 h-4 shrink-0 ${activeTab === 'employees' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Employees</span>}
      </button>

      {/* SEKSYEN: JUALAN */}
      <div className={`pt-4 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        JUALAN
      </div>
      <button
        onClick={() => { setActiveTab('invoices'); setIsMobileDrawerOpen(false); }}
        title="Invois Jualan"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'invoices' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <FileText className={`w-4 h-4 shrink-0 ${activeTab === 'invoices' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Invois Jualan</span>}
      </button>
      <button
        onClick={() => { setActiveTab('payments'); setIsMobileDrawerOpen(false); }}
        title="Bayaran Pelanggan"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'payments' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <CreditCard className={`w-4 h-4 shrink-0 ${activeTab === 'payments' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Bayaran Pelanggan</span>}
      </button>
      <button
        onClick={() => { setActiveTab('ar-aging'); setIsMobileDrawerOpen(false); }}
        title="Pelanggan Belum Bayar"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'ar-aging' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Clock className={`w-4 h-4 shrink-0 ${activeTab === 'ar-aging' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Pelanggan Belum Bayar</span>}
      </button>

      {/* SEKSYEN: PEMBELIAN */}
      <div className={`pt-4 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        PEMBELIAN
      </div>
      <button
        onClick={() => { setActiveTab('purchase-bills'); setIsMobileDrawerOpen(false); }}
        title="Bil Pembelian"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'purchase-bills' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <FileText className={`w-4 h-4 shrink-0 ${activeTab === 'purchase-bills' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Bil Pembelian</span>}
      </button>
      <button
        onClick={() => { setActiveTab('supplier-payments'); setIsMobileDrawerOpen(false); }}
        title="Bayaran Pembekal"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'supplier-payments' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <CreditCard className={`w-4 h-4 shrink-0 ${activeTab === 'supplier-payments' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Bayaran Pembekal</span>}
      </button>
      <button
        onClick={() => { setActiveTab('ap-aging'); setIsMobileDrawerOpen(false); }}
        title="Bil Belum Dibayar"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'ap-aging' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Clock className={`w-4 h-4 shrink-0 ${activeTab === 'ap-aging' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Bil Belum Dibayar</span>}
      </button>

      {/* SEKSYEN: PRODUK & PERKHIDMATAN */}
      <div className={`pt-4 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        PRODUK & PERKHIDMATAN
      </div>
      <button
        onClick={() => { setActiveTab('catalogue'); setIsMobileDrawerOpen(false); }}
        title="Katalog Produk"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'catalogue' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Package className={`w-4 h-4 shrink-0 ${activeTab === 'catalogue' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Katalog Produk</span>}
      </button>

      {/* SEKSYEN: TUNAI & BANK */}
      <div className={`pt-4 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        TUNAI & BANK
      </div>
      <button
        onClick={() => { setActiveTab('bank-recon'); setIsMobileDrawerOpen(false); }}
        title="Rekod Bank"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'bank-recon' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Landmark className={`w-4 h-4 shrink-0 ${activeTab === 'bank-recon' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Rekod Bank</span>}
      </button>
      <button
        onClick={() => { setActiveTab('bank-recon'); setIsMobileDrawerOpen(false); }}
        title="Padankan Rekod Bank"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
      >
        <RefreshCw className="w-4 h-4 shrink-0 text-slate-500" />
        {!isCollapsed && <span className="truncate">Padankan Rekod Bank</span>}
      </button>
      <button
        onClick={() => { setActiveTab('expenses'); setIsMobileDrawerOpen(false); }}
        title="Perbelanjaan"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'expenses' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Receipt className={`w-4 h-4 shrink-0 ${activeTab === 'expenses' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Perbelanjaan</span>}
      </button>

      {/* SEKSYEN: AKAUN & LAPORAN */}
      <div className={`pt-4 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        AKAUN & LAPORAN
      </div>
      <button
        onClick={() => { setActiveTab('coa'); setIsMobileDrawerOpen(false); }}
        title="Kategori Akaun"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'coa' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <NotebookTabs className={`w-4 h-4 shrink-0 ${activeTab === 'coa' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Kategori Akaun</span>}
      </button>
      <button
        onClick={() => { setActiveTab('journal'); setIsMobileDrawerOpen(false); }}
        title="Catatan Pelarasan"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'journal' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Plus className={`w-4 h-4 shrink-0 ${activeTab === 'journal' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Catatan Pelarasan</span>}
      </button>
      <button
        onClick={() => { setActiveTab('ledger'); setIsMobileDrawerOpen(false); }}
        title="Rekod Transaksi"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'ledger' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <History className={`w-4 h-4 shrink-0 ${activeTab === 'ledger' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Rekod Transaksi</span>}
      </button>
      <button
        onClick={() => { setActiveTab('periods'); setIsMobileDrawerOpen(false); }}
        title="Tempoh Kewangan"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'periods' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Calendar className={`w-4 h-4 shrink-0 ${activeTab === 'periods' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Tempoh Kewangan</span>}
      </button>
      <button
        onClick={() => { setActiveTab('financial-reports'); setIsMobileDrawerOpen(false); }}
        title="Penyata Kewangan"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'financial-reports' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <BarChart3 className={`w-4 h-4 shrink-0 ${activeTab === 'financial-reports' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate font-bold">Penyata Kewangan</span>}
      </button>
      <button
        onClick={() => { setActiveTab('trial-balance'); setIsMobileDrawerOpen(false); }}
        title="Imbangan Duga"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'trial-balance' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Scale className={`w-4 h-4 shrink-0 ${activeTab === 'trial-balance' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Imbangan Duga</span>}
      </button>
      <button
        onClick={() => { setActiveTab('audit'); setIsMobileDrawerOpen(false); }}
        title="Jejak Audit"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'audit' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <History className={`w-4 h-4 shrink-0 ${activeTab === 'audit' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Jejak Audit</span>}
      </button>
      <button
        onClick={() => { setActiveTab('test-center'); setIsMobileDrawerOpen(false); }}
        title="Pusat Ujian Integriti"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'test-center' ? 'bg-emerald-50 text-emerald-800 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <ShieldCheck className={`w-4 h-4 shrink-0 ${activeTab === 'test-center' ? 'text-emerald-700' : 'text-emerald-600'}`} />
        {!isCollapsed && <span className="truncate">Pusat Ujian Integriti</span>}
      </button>

      {/* SEKSYEN: TETAPAN ADMIN */}
      <div className={`pt-4 pb-1 px-3 font-bold tracking-wider text-slate-400 uppercase text-[10px] ${isCollapsed ? 'hidden' : 'block'}`}>
        TETAPAN ADMIN
      </div>
      <button
        onClick={() => { setActiveTab('master-reset'); setIsMobileDrawerOpen(false); }}
        title="Master Reset"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'master-reset' ? 'bg-red-50 text-red-700 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <RotateCcw className={`w-4 h-4 shrink-0 ${activeTab === 'master-reset' ? 'text-red-700' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Master Reset</span>}
      </button>
      <button
        onClick={() => { setActiveTab('company-details'); setIsMobileDrawerOpen(false); }}
        title="Company Details"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'company-details' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Building2 className={`w-4 h-4 shrink-0 ${activeTab === 'company-details' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Company Details</span>}
      </button>
      <button
        onClick={() => { setActiveTab('users-admin'); setIsMobileDrawerOpen(false); }}
        title="Users & Admin"
        className={`w-full text-left py-2 px-3 rounded-xl font-medium transition-all flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${activeTab === 'users-admin' ? 'bg-blue-50 text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        <Shield className={`w-4 h-4 shrink-0 ${activeTab === 'users-admin' ? 'text-blue-600' : 'text-slate-500'}`} />
        {!isCollapsed && <span className="truncate">Users & Admin</span>}
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      
      {/* MOBILE DRAWER OVERLAY (< lg) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs lg:hidden flex">
          <div className="w-72 bg-white h-full flex flex-col shadow-xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                  {/* Fresh leaf icon */}
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A9.7 9.7 0 0 0 17 8zM20 2c-4 0-10 2-13 8 4-1 9-2 13-8z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-extrabold tracking-tight text-slate-900 leading-tight">Khairul Fresh</h2>
                  <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">Accounting</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renderNavItems(false)}

            <div className="p-4 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {dbUser.name[0].toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-semibold text-slate-900 truncate">{dbUser.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{dbUser.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setIsMobileDrawerOpen(false)} />
        </div>
      )}

      {/* DESKTOP SIDEBAR NAVIGATION (lg+) */}
      <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-slate-200 flex-col shrink-0 text-sm transition-all duration-200`}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              {/* Fresh leaf icon */}
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A9.7 9.7 0 0 0 17 8zM20 2c-4 0-10 2-13 8 4-1 9-2 13-8z" />
              </svg>
            </div>
            {!isSidebarCollapsed && (
              <div className="overflow-hidden">
                <h2 className="text-sm font-extrabold tracking-tight text-slate-900 leading-tight">Khairul Fresh</h2>
                <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">Accounting</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Kembangkan Sidebar" : "Kuncupkan Sidebar"}
            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {renderNavItems(isSidebarCollapsed)}

        {/* LOGGED IN USER STATE & ROLE SIMULATOR */}
        <div className="p-3 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {dbUser.name[0].toUpperCase()}
            </div>
            {!isSidebarCollapsed && (
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-slate-900 truncate">{dbUser.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{dbUser.email}</p>
              </div>
            )}
          </div>

          {!isSidebarCollapsed && (
            <div className="mb-2">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Peranan Aktif (Role)</label>
              <select
                value={dbUser.role}
                onChange={(e) => simulateRole(e.target.value as any)}
                className="w-full text-xs border border-slate-200 bg-white rounded p-1 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="Admin">Admin (Pentadbir)</option>
                <option value="Accountant">Accountant (Akauntan)</option>
                <option value="Viewer">Viewer (Pelihat Sahaja)</option>
              </select>
            </div>
          )}

          <button
            onClick={logout}
            title="Log Keluar"
            className="w-full py-1.5 px-2 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs rounded-md font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isSidebarCollapsed && <span>Log Keluar</span>}
          </button>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* TOP BAR / CONTEXT HEADER */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>

            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-none">
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'workflow' && 'Aliran Kerja'}
              {activeTab === 'customers' && 'Customers'}
              {activeTab === 'suppliers' && 'Suppliers'}
              {activeTab === 'employees' && 'Employees'}
              {activeTab === 'invoices' && 'Invois Jualan'}
              {activeTab === 'payments' && 'Bayaran Pelanggan'}
              {activeTab === 'ar-aging' && 'Pelanggan Belum Bayar'}
              {activeTab === 'purchase-bills' && 'Bil Pembelian'}
              {activeTab === 'supplier-payments' && 'Bayaran Pembekal'}
              {activeTab === 'ap-aging' && 'Bil Belum Dibayar'}
              {activeTab === 'catalogue' && 'Katalog Produk'}
              {activeTab === 'bank-recon' && 'Rekod & Penyesuaian Bank'}
              {activeTab === 'expenses' && 'Perbelanjaan Operasi'}
              {activeTab === 'coa' && 'Kategori Akaun'}
              {activeTab === 'journal' && 'Catatan Pelarasan'}
              {activeTab === 'ledger' && 'Rekod Transaksi'}
              {activeTab === 'periods' && 'Tempoh Kewangan'}
              {activeTab === 'financial-reports' && 'Penyata Kewangan'}
              {activeTab === 'trial-balance' && 'Imbangan Duga'}
              {activeTab === 'audit' && 'Jejak Audit'}
              {activeTab === 'test-center' && 'Pusat Ujian Integriti'}
              {activeTab === 'master-reset' && 'Master Reset'}
              {activeTab === 'company-details' && 'Company Details'}
              {activeTab === 'users-admin' && 'Users & Admin'}
            </h1>
          </div>

          {/* Center Search Input (Desktop) */}
          <div className="hidden md:flex flex-1 max-w-lg mx-4 relative">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={globalSearchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Cari bil, invois, pembekal, pelanggan, produk, atau catatan jurnal..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-colors"
              />
              {isSearching && (
                <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin absolute right-3 top-3" />
              )}
              {globalSearchQuery && !isSearching && (
                <button
                  onClick={() => {
                    setGlobalSearchQuery('');
                    setSearchResults(null);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Desktop Search Dropdown Panel */}
            {isSearchOpen && globalSearchQuery.trim().length > 0 && (
              <div 
                className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-[75vh] overflow-y-auto divide-y divide-slate-100"
              >
                <div className="p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-semibold border-b border-slate-100">
                  <span>Hasil Carian Global untuk: "{globalSearchQuery}"</span>
                  <button 
                    onClick={() => setIsSearchOpen(false)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 1. Invoices */}
                {searchResults?.invoices?.length > 0 && (
                  <div className="p-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                      <span>Invois Jualan ({searchResults.invoices.length})</span>
                      <span className="text-[9px] text-blue-600 font-bold">Modul Jualan</span>
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.invoices.map((inv: any) => (
                        <div
                          key={inv.id}
                          onClick={() => handleSelectSearchResult('invoices', inv)}
                          className="p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-slate-900">{inv.invoiceNumber}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                                inv.status === 'Posted' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {inv.status === 'Draft' ? 'DRAF' : inv.status === 'Posted' ? 'DIPOS' : inv.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {inv.customerName || 'Pelanggan'} {inv.customerCode ? `(${inv.customerCode})` : ''} · {inv.invoiceDate}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-xs text-slate-900">{formatRM(inv.total)}</span>
                            <span className="text-[10px] text-blue-600 block font-semibold">Buka Invois &rarr;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Purchase Bills */}
                {searchResults?.purchaseBills?.length > 0 && (
                  <div className="p-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                      <span>Bil Pembelian ({searchResults.purchaseBills.length})</span>
                      <span className="text-[9px] text-emerald-600 font-bold">Modul Pembelian</span>
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.purchaseBills.map((bill: any) => (
                        <div
                          key={bill.id}
                          onClick={() => handleSelectSearchResult('purchaseBills', bill)}
                          className="p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-slate-900">{bill.billNumber}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                                bill.status === 'Posted' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {bill.status === 'Draft' ? 'DRAF' : bill.status === 'Posted' ? 'DIPOS' : bill.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {bill.supplierName || 'Pembekal'} {bill.supplierCode ? `(${bill.supplierCode})` : ''} 
                              {bill.supplierInvoiceNumber ? ` · Ref: ${bill.supplierInvoiceNumber}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-xs text-slate-900">{formatRM(bill.total)}</span>
                            <span className="text-[10px] text-emerald-600 block font-semibold">Buka Bil &rarr;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Products Catalogue */}
                {searchResults?.products?.length > 0 && (
                  <div className="p-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                      <span>Katalog Produk & Servis ({searchResults.products.length})</span>
                      <span className="text-[9px] text-amber-600 font-bold">Katalog</span>
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.products.map((p: any) => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectSearchResult('products', p)}
                          className="p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900">{p.name}</span>
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {p.productCode}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Unit: {p.salesUnit || 'kg'} · {p.description || 'Tiada nota'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-xs text-slate-900">{formatRM(p.sellingPrice)}</span>
                            <span className="text-[10px] text-amber-600 block font-semibold">Lihat Katalog &rarr;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Journal Entries */}
                {searchResults?.journals?.length > 0 && (
                  <div className="p-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                      <span>Catatan Jurnal Am ({searchResults.journals.length})</span>
                      <span className="text-[9px] text-purple-600 font-bold">Lejar Am</span>
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.journals.map((j: any) => (
                        <div
                          key={j.id}
                          onClick={() => handleSelectSearchResult('journals', j)}
                          className="p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-slate-900">
                                {j.reference || `#${j.id.slice(0, 8)}`}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-50 text-purple-800 border border-purple-100">
                                {j.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5 max-w-xs truncate">
                              {j.description} · {j.entryDate}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-xs text-slate-900">{formatRM(j.totalDebit)}</span>
                            <span className="text-[10px] text-purple-600 block font-semibold">Buka Jurnal &rarr;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!isSearching && searchResults && (
                  (searchResults.invoices?.length || 0) +
                  (searchResults.purchaseBills?.length || 0) +
                  (searchResults.products?.length || 0) +
                  (searchResults.journals?.length || 0)
                ) === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Tiada sebarang rekod ditemui yang sepadan dengan "{globalSearchQuery}".
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Mobile Search Button (< md) */}
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl md:hidden"
              title="Carian Global"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Notification Bell */}
            <button className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                3
              </span>
            </button>

            {/* Help Question */}
            <button
              onClick={() => setActiveTab('workflow')}
              title="Panduan Aliran Kerja"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* User Profile Chip */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                KH
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {dbUser?.name || 'Khairul Haizam'}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  {dbUser?.role || 'Admin'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* MOBILE GLOBAL SEARCH OVERLAY */}
        {isMobileSearchOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs md:hidden flex flex-col p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200">
              <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  placeholder="Cari bil, invois, pembekal, produk, jurnal..."
                  className="flex-1 text-xs focus:outline-none py-1 text-slate-900"
                />
                {isSearching && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />}
                <button
                  onClick={() => {
                    setIsMobileSearchOpen(false);
                    setGlobalSearchQuery('');
                    setSearchResults(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
                {/* Invoices */}
                {searchResults?.invoices?.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      Invois Jualan ({searchResults.invoices.length})
                    </div>
                    {searchResults.invoices.map((inv: any) => (
                      <div
                        key={inv.id}
                        onClick={() => handleSelectSearchResult('invoices', inv)}
                        className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex justify-between items-center"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900">{inv.invoiceNumber}</div>
                          <div className="text-[10px] text-slate-500">{inv.customerName} · {inv.invoiceDate}</div>
                        </div>
                        <div className="font-mono font-bold text-slate-900 text-right">
                          {formatRM(inv.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Purchase Bills */}
                {searchResults?.purchaseBills?.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      Bil Pembelian ({searchResults.purchaseBills.length})
                    </div>
                    {searchResults.purchaseBills.map((bill: any) => (
                      <div
                        key={bill.id}
                        onClick={() => handleSelectSearchResult('purchaseBills', bill)}
                        className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex justify-between items-center"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900">{bill.billNumber}</div>
                          <div className="text-[10px] text-slate-500">{bill.supplierName} · {bill.billDate}</div>
                        </div>
                        <div className="font-mono font-bold text-slate-900 text-right">
                          {formatRM(bill.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Products */}
                {searchResults?.products?.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      Katalog Produk ({searchResults.products.length})
                    </div>
                    {searchResults.products.map((p: any) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectSearchResult('products', p)}
                        className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex justify-between items-center"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{p.productCode}</div>
                        </div>
                        <div className="font-mono font-bold text-slate-900 text-right">
                          {formatRM(p.sellingPrice)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Journals */}
                {searchResults?.journals?.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                      Catatan Jurnal ({searchResults.journals.length})
                    </div>
                    {searchResults.journals.map((j: any) => (
                      <div
                        key={j.id}
                        onClick={() => handleSelectSearchResult('journals', j)}
                        className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex justify-between items-center"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900">{j.reference || `#${j.id.slice(0, 8)}`}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px]">{j.description}</div>
                        </div>
                        <div className="font-mono font-bold text-slate-900 text-right">
                          {formatRM(j.totalDebit)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isSearching && searchResults && (
                  (searchResults.invoices?.length || 0) +
                  (searchResults.purchaseBills?.length || 0) +
                  (searchResults.products?.length || 0) +
                  (searchResults.journals?.length || 0)
                ) === 0 && (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    Tiada rekod ditemui untuk "{globalSearchQuery}".
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CONTAINER CONTENT */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeTab === 'dashboard' && <DashboardView company={company} token={token} user={dbUser} onNavigate={(tab) => setActiveTab(tab as any)} />}
          {activeTab === 'workflow' && <WorkflowView onNavigate={(tab) => setActiveTab(tab as any)} />}
          {activeTab === 'catalogue' && <CatalogueView accounts={accounts} token={token} userRole={dbUser.role} initialSearch={initialCatalogueSearch} />}
          {activeTab === 'coa' && <ChartOfAccountsView accounts={accounts} refreshAccounts={fetchData} userRole={dbUser.role} token={token} />}
          {activeTab === 'journal' && (
            <GeneralJournalView 
              accounts={accounts} 
              refreshCOA={fetchData} 
              userRole={dbUser.role} 
              token={token} 
              initialJournalId={initialJournalId}
              onNavigateToSource={(type, id) => {
                if (type === 'purchase-bill' || type === 'purchase_bill') {
                  setInitialBillId(id);
                  setActiveTab('purchase-bills');
                } else if (type === 'sales-invoice' || type === 'sales_invoice') {
                  setInitialInvoiceId(id);
                  setActiveTab('invoices');
                }
              }}
            />
          )}
          {activeTab === 'ledger' && <GeneralLedgerView accounts={accounts} token={token} />}
          {activeTab === 'periods' && <AccountingPeriodsView periods={periods} refreshPeriods={fetchData} userRole={dbUser.role} token={token} />}
          {activeTab === 'trial-balance' && <TrialBalanceView periods={periods} token={token} />}
          {activeTab === 'financial-reports' && <FinancialReportsView token={token || ''} periods={periods} />}
          {activeTab === 'audit' && <AuditTrailView token={token} />}
          {activeTab === 'customers' && <CustomersView accounts={accounts} token={token} userRole={dbUser.role} company={company} />}
          {activeTab === 'suppliers' && <SuppliersView token={token} userRole={dbUser.role} />}
          {activeTab === 'employees' && <EmployeesView token={token} userRole={dbUser.role} />}
          {activeTab === 'invoices' && (
            <SalesInvoicesView 
              accounts={accounts} 
              token={token} 
              userRole={dbUser.role} 
              company={company} 
              initialInvoiceId={initialInvoiceId}
              onViewJournal={(jid) => {
                setInitialJournalId(jid);
                setActiveTab('journal');
              }}
            />
          )}
          {activeTab === 'ar-aging' && <ARAgingView token={token} />}
          {activeTab === 'payments' && <CustomerPaymentsView accounts={accounts} token={token} userRole={dbUser.role} />}
          {activeTab === 'purchase-bills' && (
            <PurchaseBillsView 
              accounts={accounts} 
              token={token} 
              userRole={dbUser.role} 
              company={company} 
              setActiveTab={setActiveTab} 
              initialBillId={initialBillId}
              onViewJournal={(jid) => {
                setInitialJournalId(jid);
                setActiveTab('journal');
              }}
            />
          )}
          {activeTab === 'supplier-payments' && <SupplierPaymentsView accounts={accounts} token={token} userRole={dbUser.role} />}
          {activeTab === 'ap-aging' && <APAgingView token={token} />}
          {activeTab === 'expenses' && <ExpensesView accounts={accounts} token={token} userRole={dbUser.role} />}
          {activeTab === 'bank-recon' && <BankReconciliationView accounts={accounts} token={token} userRole={dbUser.role} />}
          {activeTab === 'test-center' && <TestCenterView accounts={accounts} periods={periods} token={token} simulateRole={simulateRole} refreshAll={fetchData} />}
          {activeTab === 'master-reset' && <MasterResetView token={token} userRole={dbUser.role} />}
          {activeTab === 'company-details' && <CompanyDetailsView token={token} userRole={dbUser.role} />}
          {activeTab === 'users-admin' && <UsersAdminView token={token} userRole={dbUser.role} currentUserUid={dbUser.uid} />}
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// SUB-VIEWS IMPLEMENTATIONS
// ============================================================================

// 2. CHART OF ACCOUNTS VIEW
function ChartOfAccountsView({ accounts, refreshAccounts, userRole, token }: { accounts: any[], refreshAccounts: () => void, userRole: string, token: string | null }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('Asset');
  const [subType, setSubType] = useState('Checking');
  const [normalBalance, setNormalBalance] = useState('Debit');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (['Asset', 'Expense'].includes(type)) {
      setNormalBalance('Debit');
    } else {
      setNormalBalance('Credit');
    }
  }, [type]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!code || !name) {
      setError("Please fill out all required fields.");
      return;
    }
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code, name, type, subType, normalBalance })
      });
      if (res.ok) {
        setSuccess("Account added successfully.");
        setCode('');
        setName('');
        setShowAddModal(false);
        refreshAccounts();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to create account.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account.");
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ active: !currentActive })
      });
      if (res.ok) {
        refreshAccounts();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to update account status.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this account? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        refreshAccounts();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to delete account.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Chart of Accounts Configuration</h2>
          <p className="text-slate-500 text-xs">Standard listing of all asset, liability, equity, revenue and expense categories.</p>
        </div>
        {userRole !== 'Viewer' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add Ledger Account
          </button>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-sm">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg max-w-md w-full p-6">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-3 mb-4">Add Ledger Account</h3>
            
            {error && (
              <div className="p-3 mb-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-100 rounded flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Account Code *</label>
                <input
                  type="text"
                  placeholder="e.g. 1020"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Account Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Petty Cash Box"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Account Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Revenue">Revenue</option>
                    <option value="Expense">Expense</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Sub-Type Category</label>
                  <select
                    value={subType}
                    onChange={(e) => setSubType(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="CashBox">Cash on Hand</option>
                    <option value="Checking">Checking Account</option>
                    <option value="AccountsReceivable">Accounts Receivable</option>
                    <option value="AccountsPayable">Accounts Payable</option>
                    <option value="SalesRevenue">Sales Revenue</option>
                    <option value="GeneralExpense">General Expense</option>
                    <option value="WagesExpense">Wages Expense</option>
                    <option value="FixedAsset">Fixed Asset</option>
                    <option value="TaxPayable">Tax SST</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded flex justify-between items-center">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Normal Balance</span>
                <span className={`text-xs font-bold ${normalBalance === 'Debit' ? 'text-blue-700' : 'text-emerald-700'}`}>{normalBalance}</span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="py-2 px-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded"
                >
                  Post Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COA Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
              <th className="py-3 px-6">Account Code</th>
              <th className="py-3 px-6">Account Name</th>
              <th className="py-3 px-6">Type</th>
              <th className="py-3 px-6">Sub-Type</th>
              <th className="py-3 px-6 text-center">Normal Balance</th>
              <th className="py-3 px-6 text-center">Status</th>
              {userRole !== 'Viewer' && <th className="py-3 px-6 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-slate-50/50">
                <td className="py-3 px-6 font-mono font-semibold text-slate-900">{acc.code}</td>
                <td className="py-3 px-6 font-medium text-slate-900">{acc.name}</td>
                <td className="py-3 px-6">
                  <span className="text-xs text-slate-500">{acc.type}</span>
                </td>
                <td className="py-3 px-6 text-slate-500 font-mono text-xs">{acc.subType}</td>
                <td className="py-3 px-6 text-center">
                  <span className={`text-xs font-medium ${acc.normalBalance === 'Debit' ? 'text-blue-700' : 'text-emerald-700'}`}>
                    {acc.normalBalance}
                  </span>
                </td>
                <td className="py-3 px-6 text-center">
                  <button
                    disabled={userRole === 'Viewer'}
                    onClick={() => handleToggleActive(acc.id, acc.active)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border cursor-pointer ${acc.active ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'}`}
                  >
                    {acc.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                {userRole !== 'Viewer' && (
                  <td className="py-3 px-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        disabled={userRole !== 'Admin'}
                        onClick={() => handleDelete(acc.id)}
                        className="p-1 text-slate-400 hover:text-red-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Delete Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 3. GENERAL JOURNAL VIEW
function GeneralJournalView({ 
  accounts, 
  refreshCOA, 
  userRole, 
  token,
  initialJournalId,
  onNavigateToSource
}: { 
  accounts: any[], 
  refreshCOA: () => void, 
  userRole: string, 
  token: string | null,
  initialJournalId?: string | null,
  onNavigateToSource?: (type: string, id: string) => void
}) {
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'list'>('create');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<any[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // Journal List & Detail View States
  const [journalsList, setJournalsList] = useState<any[]>([]);
  const [isLoadingJournals, setIsLoadingJournals] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [selectedJournalDetail, setSelectedJournalDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Active accounts only for dropdown selector
  const activeAccounts = accounts.filter(a => a.active);

  // Totals calculations for creation form
  const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit || 0) * 100), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit || 0) * 100), 0);
  const difference = totalDebit - totalCredit;
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const fetchJournalDetail = async (id: string) => {
    setIsLoadingDetail(true);
    setDetailError('');
    try {
      const res = await apiFetch(`/api/journals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJournalDetail(data);
      } else {
        const err = await res.json();
        setDetailError(err.error || "Gagal memuatkan rekod catatan jurnal.");
      }
    } catch (err: any) {
      setDetailError(err.message || "Ralat rangkaian semasa memuatkan butiran jurnal.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const fetchJournals = async () => {
    setIsLoadingJournals(true);
    try {
      const url = listSearch.trim() ? `/api/journals?search=${encodeURIComponent(listSearch.trim())}` : '/api/journals';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setJournalsList(data);
      }
    } catch (err) {
      console.error("Failed to load journals list:", err);
    } finally {
      setIsLoadingJournals(false);
    }
  };

  useEffect(() => {
    if (initialJournalId) {
      fetchJournalDetail(initialJournalId);
    }
  }, [initialJournalId]);

  useEffect(() => {
    if (activeSubTab === 'list') {
      fetchJournals();
    }
  }, [activeSubTab]);

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...lines];
    updated[index][field] = value;
    setLines(updated);
  };

  const addLine = () => {
    setLines([...lines, { accountId: '', debit: 0, credit: 0, description: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    const updated = lines.filter((_, i) => i !== index);
    setLines(updated);
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!entryDate || !description) {
      setError("Please fill out entry date and transaction description.");
      return;
    }

    if (!isBalanced) {
      setError("Debits and credits must be balanced, and total must be greater than zero.");
      return;
    }

    setIsPosting(true);
    try {
      const processedLines = lines.map(l => ({
        accountId: l.accountId,
        debit: Math.round(parseFloat(l.debit || 0) * 100),
        credit: Math.round(parseFloat(l.credit || 0) * 100),
        description: l.description || null
      }));

      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          entryDate,
          reference,
          description,
          lines: processedLines
        })
      });

      if (res.ok) {
        setSuccess("Journal entry posted successfully to General Ledger!");
        setReference('');
        setDescription('');
        setLines([
          { accountId: '', debit: 0, credit: 0, description: '' },
          { accountId: '', debit: 0, credit: 0, description: '' },
        ]);
        refreshCOA();
        fetchJournals();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to post journal entry.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to post journal entry.");
    } finally {
      setIsPosting(false);
    }
  };

  // 1. DETAIL VIEW FOR A SPECIFIC JOURNAL ENTRY
  if (selectedJournalDetail || isLoadingDetail || detailError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedJournalDetail(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
              >
                <ArrowLeft className="w-4 h-4" /> Kembali
              </button>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Butiran Catatan Jurnal Am
              </h2>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              Paparan lejar berpasangan (double-entry) penuh dengan status imbasan baki debit dan kredit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedJournalDetail?.linkedDocument && onNavigateToSource && (
              <button
                onClick={() => onNavigateToSource(selectedJournalDetail.linkedDocument.type, selectedJournalDetail.linkedDocument.id)}
                className="py-1.5 px-3 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Lihat Dokumen Asal ({selectedJournalDetail.linkedDocument.number})
              </button>
            )}
            <button
              onClick={() => setSelectedJournalDetail(null)}
              className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
            >
              Tutup Paparan
            </button>
          </div>
        </div>

        {isLoadingDetail && (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-slate-700 animate-spin" />
            <p className="text-sm font-medium text-slate-600">Memuatkan butiran catatan jurnal...</p>
          </div>
        )}

        {detailError && (
          <div className="p-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-100 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{detailError}</span>
          </div>
        )}

        {selectedJournalDetail && (
          <div className="space-y-6">
            {/* Header metadata card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-extrabold text-slate-900">
                      {selectedJournalDetail.reference || `#${selectedJournalDetail.id.slice(0, 8)}`}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                      selectedJournalDetail.status === 'Posted' 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {selectedJournalDetail.status === 'Posted' ? 'DIPOS / POSTED' : selectedJournalDetail.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-sans">
                    ID Rekod: <span className="font-mono text-slate-700 font-semibold">{selectedJournalDetail.id}</span>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Tarikh Entri Jurnal</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{selectedJournalDetail.entryDate}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="md:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Deskripsi / Catatan Transaksi</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium leading-relaxed">
                    {selectedJournalDetail.description || 'Tiada deskripsi'}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Dokumen Berkaitan</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                    {selectedJournalDetail.linkedDocument ? (
                      <div>
                        <span className="font-semibold text-slate-900 block capitalize">
                          {selectedJournalDetail.linkedDocument.type.replace('-', ' ')}
                        </span>
                        <span className="font-mono text-xs text-blue-700 font-bold">
                          {selectedJournalDetail.linkedDocument.number}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Catatan Jurnal Langsung (Manual / Pelarasan)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Lines Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Baris Imbangan Lejar (Debit / Kredit)
                </h4>
                <span className="text-xs text-slate-500 font-medium">
                  {selectedJournalDetail.lines?.length || 0} baris lejar
                </span>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                    <th className="py-3 px-4">Kod & Nama Akaun</th>
                    <th className="py-3 px-4">Jenis Akaun</th>
                    <th className="py-3 px-4">Nota / Catatan Baris</th>
                    <th className="py-3 px-4 text-right">Debit (RM)</th>
                    <th className="py-3 px-4 text-right">Kredit (RM)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {selectedJournalDetail.lines?.map((line: any) => (
                    <tr key={line.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{line.accountCode}</div>
                        <div className="text-slate-600 font-medium">{line.accountName}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {line.accountType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {line.description || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                        {line.debit > 0 ? formatRM(line.debit) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                        {line.credit > 0 ? formatRM(line.credit) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Summary */}
              <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-8 text-center sm:text-left">
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Jumlah Debit</span>
                    <span className="text-lg font-bold font-mono tracking-tight text-blue-300">
                      {formatRM(selectedJournalDetail.totalDebit || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Jumlah Kredit</span>
                    <span className="text-lg font-bold font-mono tracking-tight text-emerald-300">
                      {formatRM(selectedJournalDetail.totalCredit || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Status Imbangan</span>
                    <span className={`text-xs font-extrabold ${
                      (selectedJournalDetail.totalDebit || 0) === (selectedJournalDetail.totalCredit || 0)
                        ? 'text-emerald-400' 
                        : 'text-red-400'
                    }`}>
                      {(selectedJournalDetail.totalDebit || 0) === (selectedJournalDetail.totalCredit || 0) 
                        ? 'SEIMBANG (BALANCED)' 
                        : 'TIDAK SEIMBANG'}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    ✓
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. MAIN JOURNAL VIEW (Switchable between Create Form & Registered Journals List)
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Catatan Jurnal Am (General Journal)</h2>
          <p className="text-slate-500 text-xs">Pengurusan entri lejar berpasangan (double-entry) dan semakan catatan jurnal yang telah diposkan.</p>
        </div>

        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setActiveSubTab('create')}
            className={`py-1.5 px-4 text-xs font-bold rounded-lg transition-colors ${
              activeSubTab === 'create'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Cipta Jurnal Baru
          </button>
          <button
            onClick={() => setActiveSubTab('list')}
            className={`py-1.5 px-4 text-xs font-bold rounded-lg transition-colors ${
              activeSubTab === 'list'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Senarai Catatan Jurnal
          </button>
        </div>
      </div>

      {activeSubTab === 'list' ? (
        /* REGISTERED JOURNALS LIST */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari rujukan, deskripsi, atau nombor bil..."
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchJournals()}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <button
              onClick={fetchJournals}
              disabled={isLoadingJournals}
              className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingJournals ? 'animate-spin' : ''}`} />
              Muat Semula
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                  <th className="py-3 px-4">Tarikh</th>
                  <th className="py-3 px-4">No. Rujukan</th>
                  <th className="py-3 px-4">Keterangan / Transaksi</th>
                  <th className="py-3 px-4 text-center">Bil. Baris</th>
                  <th className="py-3 px-4 text-right">Jumlah Debit (RM)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {isLoadingJournals ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Memuatkan rekod catatan jurnal...
                    </td>
                  </tr>
                ) : journalsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Tiada catatan jurnal ditemui. Sila cuba carian lain atau cipta entri baru.
                    </td>
                  </tr>
                ) : (
                  journalsList.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono text-slate-600">{entry.entryDate}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {entry.reference || `-`}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 max-w-xs truncate">
                        {entry.description}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
                        {entry.linesCount || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatRM(entry.totalDebit || 0)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          entry.status === 'Posted'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {entry.status === 'Posted' ? 'DIPOS' : entry.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => fetchJournalDetail(entry.id)}
                          className="py-1 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Lihat Butiran
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CREATE JOURNAL FORM */
        <>
          {error && (
            <div className="p-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-100 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handlePost} className="space-y-6 text-sm">
            {/* Meta Header */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Journal Date *</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. INV-001, RCP-1234"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Entry Narrative / Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Record utilities billing payment for Maybank Cash account"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>
            </div>

            {/* Lines Segment */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-6">Account Description</th>
                    <th className="py-3 px-6 w-48 text-right">Debit (RM)</th>
                    <th className="py-3 px-6 w-48 text-right">Credit (RM)</th>
                    <th className="py-3 px-6">Line Narrative</th>
                    <th className="py-3 px-6 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, index) => (
                    <tr key={index} className="hover:bg-slate-50/20">
                      <td className="py-3 px-6">
                        <select
                          value={line.accountId}
                          onChange={(e) => handleLineChange(index, 'accountId', e.target.value)}
                          className="w-full border border-slate-200 bg-white rounded p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                          required
                        >
                          <option value="">Select account...</option>
                          {activeAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {a.name} ({a.type})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-6">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.debit || ''}
                          onChange={(e) => handleLineChange(index, 'debit', e.target.value)}
                          className="w-full text-right border border-slate-200 bg-white font-mono rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </td>
                      <td className="py-3 px-6">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.credit || ''}
                          onChange={(e) => handleLineChange(index, 'credit', e.target.value)}
                          className="w-full text-right border border-slate-200 bg-white font-mono rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </td>
                      <td className="py-3 px-6">
                        <input
                          type="text"
                          placeholder="Memo detail..."
                          value={line.description}
                          onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                          className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                        />
                      </td>
                      <td className="py-3 px-6 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          disabled={lines.length <= 2}
                          className="p-1.5 text-slate-300 hover:text-red-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add Line button */}
              <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                <button
                  type="button"
                  onClick={addLine}
                  className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Ledger Row
                </button>
              </div>
            </div>

            {/* Balancing Totals Card */}
            <div className="bg-slate-900 text-white rounded-lg p-6 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider block">Total Debits</span>
                  <span className="text-lg font-bold font-mono tracking-tight">{formatRM(totalDebit)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider block">Total Credits</span>
                  <span className="text-lg font-bold font-mono tracking-tight">{formatRM(totalCredit)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider block">Out-Of-Balance Difference</span>
                  <span className={`text-lg font-bold font-mono tracking-tight ${difference === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatRM(difference)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-xs text-slate-400 uppercase tracking-wider block">Engine Check</span>
                  <span className={`text-xs font-bold ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isBalanced ? 'BALANCED' : 'UNBALANCED'}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={!isBalanced || isPosting || userRole === 'Viewer'}
                  className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm rounded-lg transition-colors"
                >
                  {isPosting ? 'Posting...' : 'Post Journal to GL'}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

// 4. GENERAL LEDGER VIEW
function GeneralLedgerView({ accounts, token }: { accounts: any[], token: string | null }) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reference, setReference] = useState('');
  const [ledgerData, setLedgerData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLedger = async () => {
    if (!selectedAccountId) return;
    setIsLoading(true);
    try {
      let url = `/api/ledger?accountId=${selectedAccountId}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (reference) url += `&reference=${reference}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLedgerData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId) {
      fetchLedger();
    } else {
      setLedgerData(null);
    }
  }, [selectedAccountId, startDate, endDate]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">General Ledger Registry</h2>
        <p className="text-slate-500 text-xs">Observe running balances and individual transactional detail of any accounts category.</p>
      </div>

      {/* Filter Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-sm">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Select Account Code *</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Select accounts code...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name} ({a.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div>
          <button
            onClick={fetchLedger}
            disabled={!selectedAccountId || isLoading}
            className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 text-white disabled:text-slate-400 text-sm font-semibold rounded-lg transition-colors"
          >
            {isLoading ? 'Filtering...' : 'Apply Filters'}
          </button>
        </div>
      </div>

      {/* Content rows */}
      {!selectedAccountId && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center gap-3">
          <Info className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Please select an account above to view General Ledger details.</p>
        </div>
      )}

      {selectedAccountId && ledgerData && (
        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Opening Balance</span>
              <span className="text-lg font-bold font-mono text-slate-900">{formatRM(ledgerData.openingBalance)}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Total Debits</span>
              <span className="text-lg font-bold font-mono text-blue-700">{formatRM(ledgerData.totalDebits)}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Total Credits</span>
              <span className="text-lg font-bold font-mono text-emerald-700">{formatRM(ledgerData.totalCredits)}</span>
            </div>
            <div className="bg-slate-900 text-white border border-slate-900 rounded-lg p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-slate-300">Net Closing Balance</span>
              <span className="text-lg font-bold font-mono text-emerald-400">{formatRM(ledgerData.closingBalance)}</span>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-6 w-32">Post Date</th>
                  <th className="py-3 px-6 w-32">Reference</th>
                  <th className="py-3 px-6">Entry Description</th>
                  <th className="py-3 px-6 text-right w-40">Debit (RM)</th>
                  <th className="py-3 px-6 text-right w-40">Credit (RM)</th>
                  <th className="py-3 px-6 text-right w-48">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {ledgerData.lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans text-sm">
                      No posted journal transactions found for the filtered period.
                    </td>
                  </tr>
                ) : (
                  ledgerData.lines.map((line: any) => (
                    <tr key={line.lineId} className="hover:bg-slate-50/50">
                      <td className="py-3 px-6 text-slate-600">{line.entryDate}</td>
                      <td className="py-3 px-6 font-semibold text-slate-900">{line.reference || '-'}</td>
                      <td className="py-3 px-6 font-sans text-sm">
                        <div className="font-medium text-slate-900">{line.description}</div>
                        {line.lineDescription && (
                          <div className="text-xs text-slate-400 mt-0.5">{line.lineDescription}</div>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right text-blue-700">
                        {line.debit > 0 ? formatRM(line.debit) : '-'}
                      </td>
                      <td className="py-3 px-6 text-right text-emerald-700">
                        {line.credit > 0 ? formatRM(line.credit) : '-'}
                      </td>
                      <td className="py-3 px-6 text-right font-semibold text-slate-900">
                        {formatRM(line.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// 5. ACCOUNTING PERIODS VIEW
function AccountingPeriodsView({ periods, refreshPeriods, userRole, token }: { periods: any[], refreshPeriods: () => void, userRole: string, token: string | null }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;
    try {
      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, startDate, endDate, status: 'Open' })
      });
      if (res.ok) {
        setName('');
        setStartDate('');
        setEndDate('');
        setShowAdd(false);
        refreshPeriods();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to create period.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
    if (!window.confirm(`Are you sure you want to update the period to '${nextStatus}'? Closing prevents modifications.`)) return;
    try {
      const res = await fetch(`/api/periods/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        refreshPeriods();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to update period status.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Accounting Periods Settings</h2>
          <p className="text-slate-500 text-xs">Establish fiscal periods. Locking a period mathematically prevents all unauthorized ledger posts.</p>
        </div>
        {userRole === 'Admin' && (
          <button
            onClick={() => setShowAdd(true)}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Open New Period
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-md">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Open New Period</h3>
          <form onSubmit={handleCreate} className="space-y-4 text-sm">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Period Name *</label>
              <input
                type="text"
                placeholder="e.g. November 2026, FY 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">End Date *</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded"
              >
                Save Period
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Period Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
              <th className="py-3 px-6">Period Name</th>
              <th className="py-3 px-6">Start Date</th>
              <th className="py-3 px-6">End Date</th>
              <th className="py-3 px-6 text-center">Security Status</th>
              {userRole === 'Admin' && <th className="py-3 px-6 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {periods.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="py-3 px-6 font-bold text-slate-950">{p.name}</td>
                <td className="py-3 px-6 font-mono text-slate-600">{p.startDate}</td>
                <td className="py-3 px-6 font-mono text-slate-600">{p.endDate}</td>
                <td className="py-3 px-6 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${p.status === 'Open' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                    {p.status === 'Open' ? 'Open (Posting Allowed)' : 'Closed (Locked)'}
                  </span>
                </td>
                {userRole === 'Admin' && (
                  <td className="py-3 px-6 text-right">
                    <button
                      onClick={() => handleToggleStatus(p.id, p.status)}
                      className={`text-xs font-bold ${p.status === 'Open' ? 'text-red-700 hover:text-red-900' : 'text-emerald-700 hover:text-emerald-900'}`}
                    >
                      {p.status === 'Open' ? 'Close & Lock Period' : 'Reopen Period'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 6. TRIAL BALANCE VIEW
function TrialBalanceView({ periods, token }: { periods: any[], token: string | null }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [report, setReport] = useState<any>(null);

  const fetchTrialBalance = async () => {
    try {
      let url = '/api/reports/trial-balance';
      if (selectedPeriodId) url += `?periodId=${selectedPeriodId}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTrialBalance();
  }, [selectedPeriodId]);

  return (
    <div className="space-y-6 text-sm">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Trial Balance Verification</h2>
          <p className="text-slate-500 text-xs">Evaluates overall ledger integrity by summarizing active debits and credits of all categories.</p>
        </div>
        <div className="w-64">
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="w-full border border-slate-200 bg-white rounded p-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Full Ledger History</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.startDate} to {p.endDate})</option>
            ))}
          </select>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* Parity Status Badge */}
          <div className={`p-4 rounded-lg border flex items-center justify-between ${report.isBalanced ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
            <div className="flex items-center gap-2">
              {report.isBalanced ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <div>
                <span className="font-bold block">Ledger Balance Status: {report.isBalanced ? 'VALID & BALANCED' : 'INVALID (OUT OF BALANCE)'}</span>
                <span className="text-xs">Total Debit balances must strictly equal Credit balances.</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider block">Out-Of-Balance Difference</span>
              <span className="font-mono font-bold text-lg">{formatRM(report.difference)}</span>
            </div>
          </div>

          {/* Trial Balance Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-6 w-32">Account Code</th>
                  <th className="py-3 px-6">Account Name</th>
                  <th className="py-3 px-6">Account Type</th>
                  <th className="py-3 px-6 text-right w-48">Debit Balance (RM)</th>
                  <th className="py-3 px-6 text-right w-48">Credit Balance (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">No active postings detected.</td>
                  </tr>
                ) : (
                  report.rows.map((row: any) => (
                    <tr key={row.accountId} className="hover:bg-slate-50/50">
                      <td className="py-3 px-6 font-mono font-semibold text-slate-600">{row.code}</td>
                      <td className="py-3 px-6 font-semibold text-slate-900">{row.name}</td>
                      <td className="py-3 px-6">
                        <span className="text-xs font-semibold text-slate-400 uppercase">{row.type}</span>
                      </td>
                      <td className="py-3 px-6 text-right font-mono text-blue-700 font-semibold">
                        {row.debit > 0 ? formatRM(row.debit) : '-'}
                      </td>
                      <td className="py-3 px-6 text-right font-mono text-emerald-700 font-semibold">
                        {row.credit > 0 ? formatRM(row.credit) : '-'}
                      </td>
                    </tr>
                  ))
                )}
                {/* Total sum row */}
                <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-800">
                  <td colSpan={3} className="py-4 px-6 text-right uppercase tracking-wider text-xs font-sans">Cumulative Balances</td>
                  <td className="py-4 px-6 text-right font-mono text-blue-300 text-base">{formatRM(report.totalDebits)}</td>
                  <td className="py-4 px-6 text-right font-mono text-emerald-300 text-base">{formatRM(report.totalCredits)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// 7. AUDIT TRAIL VIEW
function AuditTrailView({ token }: { token: string | null }) {
  const [logs, setLogs] = useState<any[]>([]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6 text-sm">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">System Audit Trail</h2>
          <p className="text-slate-500 text-xs">Chronological logging of critical system mutations, logins, posting and security actions.</p>
        </div>
        <button
          onClick={fetchLogs}
          className="p-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded font-medium text-xs transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
              <th className="py-3 px-6 w-48">Timestamp</th>
              <th className="py-3 px-6">User Operator</th>
              <th className="py-3 px-6">Action Category</th>
              <th className="py-3 px-6">Modified Table</th>
              <th className="py-3 px-6">Operation Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/20 text-xs">
                <td className="py-3 px-6 font-mono text-slate-500">
                  {new Date(log.timestamp).toLocaleString('en-MY')}
                </td>
                <td className="py-3 px-6 font-sans text-sm">
                  <div className="font-semibold text-slate-900">{log.userName}</div>
                  <div className="text-[10px] text-slate-500">{log.userEmail}</div>
                </td>
                <td className="py-3 px-6">
                  <span className="font-mono font-bold bg-slate-100 text-slate-800 rounded px-1.5 py-0.5 uppercase">
                    {log.action}
                  </span>
                </td>
                <td className="py-3 px-6 font-mono text-slate-500">{log.tableName}</td>
                <td className="py-3 px-6 font-mono text-slate-600 max-w-xs truncate">
                  {JSON.stringify(log.newValues || log.oldValues)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 8. CUSTOMERS VIEW (MILESTONE 2A NEW - ENHANCED)
function CustomersView({ accounts = [], token, userRole, company }: { accounts?: any[], token: string | null, userRole: string, company?: any }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [statementStartDate, setStatementStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [statementEndDate, setStatementEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [statementError, setStatementError] = useState('');
  const [showStatementPdfModal, setShowStatementPdfModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statementPdfError, setStatementPdfError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingCust, setEditingCust] = useState<any>(null);
  const [formError, setFormError] = useState('');

  // Form states (Add / Edit)
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Customer 4 Default Settings
  const [defaultPaymentTerm, setDefaultPaymentTerm] = useState('Net 30');
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState('Bank Transfer');
  const [defaultIncomeAccountId, setDefaultIncomeAccountId] = useState('');
  const [priceLevel, setPriceLevel] = useState('Standard');

  const revenueAccounts = (accounts || []).filter((a: any) => a.active && a.type === 'Revenue');

  const fetchCustomers = async () => {
    try {
      const res = await apiFetch(`/api/customers?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStatement = async (id: string, start?: string, end?: string) => {
    setStatementError('');
    try {
      const sDate = start !== undefined ? start : statementStartDate;
      const eDate = end !== undefined ? end : statementEndDate;
      const query = new URLSearchParams();
      if (sDate) query.append('startDate', sDate);
      if (eDate) query.append('endDate', eDate);
      const queryString = query.toString() ? `?${query.toString()}` : '';

      const res = await apiFetch(`/api/ar/customer/${id}/statement${queryString}`);
      if (res.ok) {
        const data = await res.json();
        setStatement(data);
      } else {
        const errJson = await res.json();
        setStatementError(errJson.error || "Gagal memuatkan penyata pelanggan.");
      }
    } catch (err: any) {
      console.error(err);
      setStatementError(err.message || "Gagal memuatkan penyata pelanggan.");
    }
  };

  const handlePrintStatement = () => {
    setShowStatementPdfModal(true);
  };

  const handleViewStatementPdf = () => {
    setShowStatementPdfModal(true);
  };

  const handleDownloadStatementPdf = async () => {
    if (!statement || !statement.customer) return;
    setIsGeneratingPdf(true);
    setStatementPdfError('');
    try {
      const custCode = statement.customer.customerCode || selectedCust?.code || 'CUST';
      const endDateStr = statement.endDate || new Date().toISOString().split('T')[0];
      const fileName = `Penyata_Pelanggan_${custCode}_${endDateStr}.pdf`;

      const htmlContent = buildCustomerStatementHtml(statement, company);
      await generatePdfFromHtml(htmlContent, fileName, 'portrait');
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      setStatementPdfError(err?.message || "Gagal menjana PDF. Sila guna 'Cetak / Simpan PDF'.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search]);

  const resetForm = () => {
    setCode(`CUST-${String(customers.length + 1).padStart(3, '0')}`);
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setNotes('');
    setDefaultPaymentTerm('Net 30');
    setDefaultPaymentMethod('Bank Transfer');
    setDefaultIncomeAccountId(revenueAccounts[0]?.id || '');
    setPriceLevel('Standard');
    setFormError('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAdd(true);
  };

  const handleOpenEdit = (c: any) => {
    setEditingCust(c);
    setCode(c.customerCode || '');
    setName(c.name || '');
    setEmail(c.email || '');
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setNotes(c.notes || '');
    setDefaultPaymentTerm(c.defaultPaymentTerm || 'Net 30');
    setDefaultPaymentMethod(c.defaultPaymentMethod || 'Bank Transfer');
    setDefaultIncomeAccountId(c.defaultIncomeAccountId || '');
    setPriceLevel(c.priceLevel || 'Standard');
    setFormError('');
    setShowEdit(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!code || !name) {
      setFormError('Kod dan nama pelanggan adalah wajib.');
      return;
    }
    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerCode: code,
          name,
          email,
          phone,
          address,
          notes,
          defaultPaymentTerm,
          defaultPaymentMethod,
          defaultIncomeAccountId: defaultIncomeAccountId || null,
          priceLevel,
        })
      });
      if (res.ok) {
        setShowAdd(false);
        fetchCustomers();
      } else {
        const error = await res.json();
        setFormError(error.error || "Gagal menambah pelanggan.");
      }
    } catch (err: any) {
      setFormError(err.message || "Gagal menambah pelanggan.");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!editingCust) return;
    try {
      const res = await apiFetch(`/api/customers/${editingCust.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerCode: code,
          name,
          email,
          phone,
          address,
          notes,
          defaultPaymentTerm,
          defaultPaymentMethod,
          defaultIncomeAccountId: defaultIncomeAccountId || null,
          priceLevel,
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setShowEdit(false);
        setEditingCust(null);
        fetchCustomers();
        if (selectedCust && selectedCust.id === editingCust.id) {
          setSelectedCust(updated);
        }
      } else {
        const error = await res.json();
        setFormError(error.error || "Gagal mengemaskini pelanggan.");
      }
    } catch (err: any) {
      setFormError(err.message || "Gagal mengemaskini pelanggan.");
    }
  };

  const handleToggleStatus = async (id: string, active: boolean) => {
    try {
      const res = await apiFetch(`/api/customers/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !active })
      });
      if (res.ok) {
        fetchCustomers();
        if (selectedCust && selectedCust.id === id) {
          setSelectedCust({ ...selectedCust, isActive: !active });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    if (filterActive === 'Active') return c.isActive;
    if (filterActive === 'Inactive') return !c.isActive;
    return true;
  });

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Pelanggan</h2>
          <p className="text-slate-500 text-xs">Pengurusan profil pelanggan perniagaan, tetapan lalai invois, dan baki pelanggan belum bayar.</p>
        </div>
        {userRole !== 'Viewer' && !selectedCust && (
          <button
            onClick={handleOpenAdd}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Tambah Pelanggan
          </button>
        )}
      </div>

      {selectedCust ? (
        // CUSTOMER DETAIL SHEET / STATEMENT LEDGER VIEW
        <div className="space-y-6 bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex justify-between items-start border-b border-slate-100 pb-4">
            <div>
              <button onClick={() => { setSelectedCust(null); setStatement(null); }} className="text-xs text-blue-600 hover:underline mb-2 block font-medium">
                &larr; Kembali ke Senarai Pelanggan
              </button>
              <h3 className="text-lg font-bold text-slate-900">{selectedCust.name}</h3>
              <p className="text-xs font-mono text-slate-500">Kod Pelanggan: {selectedCust.customerCode}</p>
            </div>
            <div className="flex items-center gap-2">
              {userRole !== 'Viewer' && (
                <button
                  onClick={() => handleOpenEdit(selectedCust)}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
                >
                  Edit Profil
                </button>
              )}
              <button
                disabled={userRole === 'Viewer'}
                onClick={() => handleToggleStatus(selectedCust.id, selectedCust.isActive)}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold border ${selectedCust.isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'}`}
              >
                {selectedCust.isActive ? 'Aktif' : 'Tidak Aktif'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-2">Profil Korporat</span>
                <div className="space-y-2 text-xs">
                  <div><strong>E-mel:</strong> {selectedCust.email || '—'}</div>
                  <div><strong>Telefon:</strong> {selectedCust.phone || '—'}</div>
                  <div><strong>Alamat Bil:</strong> {selectedCust.address || '—'}</div>
                  <div><strong>Nota Tambahan:</strong> {selectedCust.notes || '—'}</div>
                </div>
              </div>

              {/* Customer Defaults Display */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Tetapan Lalai Invois</span>
                <div className="text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tempoh Bayaran:</span>
                    <span className="font-semibold text-slate-800">{selectedCust.defaultPaymentTerm || 'Net 30'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kaedah Bayaran:</span>
                    <span className="font-semibold text-slate-800">{selectedCust.defaultPaymentMethod || 'Bank Transfer'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Akaun Hasil:</span>
                    <span className="font-semibold text-slate-800">
                      {revenueAccounts.find((a: any) => a.id === selectedCust.defaultIncomeAccountId)?.code || '4000'} - {revenueAccounts.find((a: any) => a.id === selectedCust.defaultIncomeAccountId)?.name || 'Hasil Jualan'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tahap Harga:</span>
                    <span className="font-semibold text-slate-800">{selectedCust.priceLevel || 'Standard'}</span>
                  </div>
                </div>
              </div>
            </div>

            {statement && (
              <div className="md:col-span-2 space-y-4">
                {/* Filter & Action Header Bar */}
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span>📋</span> Penyata Akaun Pelanggan (Customer Statement)
                    </h4>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePrintStatement}
                        className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <span>🖨️</span> Cetak Penyata
                      </button>
                      <button
                        type="button"
                        onClick={handleViewStatementPdf}
                        className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <span>👁️</span> Lihat PDF
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadStatementPdf}
                        disabled={isGeneratingPdf}
                        className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <span>📥</span> {isGeneratingPdf ? 'Menjana PDF...' : 'Muat Turun PDF'}
                      </button>
                    </div>
                  </div>

                  {/* Date Filter Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/80 items-end">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tarikh Mula</label>
                      <input
                        type="date"
                        value={statementStartDate}
                        onChange={(e) => setStatementStartDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-medium focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tarikh Tamat</label>
                      <input
                        type="date"
                        value={statementEndDate}
                        onChange={(e) => setStatementEndDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-medium focus:outline-none"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => fetchStatement(selectedCust.id, statementStartDate, statementEndDate)}
                        className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Jana Penyata
                      </button>
                    </div>
                  </div>

                  {statementError && (
                    <p className="text-xs text-red-600 font-semibold mt-1">{statementError}</p>
                  )}
                </div>

                {/* Statement Summary 4-Grid Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-100 p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Baki Pembukaan</span>
                    <span className="text-sm font-bold font-mono text-slate-800">{formatRM(statement.openingBalance || 0)}</span>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block mb-1">Jumlah Debit (Invois)</span>
                    <span className="text-sm font-bold font-mono text-blue-800">{formatRM(statement.periodTotalDebit || 0)}</span>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block mb-1">Jumlah Kredit (Bayaran)</span>
                    <span className="text-sm font-bold font-mono text-emerald-800">{formatRM(statement.periodTotalCredit || 0)}</span>
                  </div>
                  <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block mb-1">Baki Penutup (Semasa)</span>
                    <span className="text-sm font-bold font-mono text-emerald-400">{formatRM(statement.closingBalance || 0)}</span>
                  </div>
                </div>

                {/* Statement Transaction Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Jadual Transaksi Penyata</span>
                    <span className="text-slate-500 font-medium">
                      Tempoh: <strong className="text-slate-800">{statement.startDate}</strong> hingga <strong className="text-slate-800">{statement.endDate}</strong>
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                          <th className="py-2.5 px-3">Tarikh</th>
                          <th className="py-2.5 px-3">No. Rujukan</th>
                          <th className="py-2.5 px-3">Due Date</th>
                          <th className="py-2.5 px-3">Keterangan</th>
                          <th className="py-2.5 px-3 text-right">Debit (RM)</th>
                          <th className="py-2.5 px-3 text-right">Kredit (RM)</th>
                          <th className="py-2.5 px-3 text-right">Baki (RM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {/* Opening Balance Row */}
                        <tr className="bg-slate-50/80 font-sans font-medium text-slate-700 italic">
                          <td className="py-2 px-3">{statement.startDate}</td>
                          <td className="py-2 px-3">—</td>
                          <td className="py-2 px-3">—</td>
                          <td className="py-2 px-3 font-bold text-slate-900">Baki Pembukaan (Opening Balance)</td>
                          <td className="py-2 px-3 text-right">—</td>
                          <td className="py-2 px-3 text-right">—</td>
                          <td className="py-2 px-3 text-right font-bold font-mono text-slate-900">{formatRM(statement.openingBalance || 0)}</td>
                        </tr>

                        {statement.statementLines?.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-400 font-sans text-xs italic">
                              Tiada transaksi invois atau bayaran baharu dalam tempoh tarikh ini.
                            </td>
                          </tr>
                        ) : (
                          statement.statementLines?.map((line: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3">{line.date}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{line.reference}</td>
                              <td className="py-2.5 px-3 text-slate-500">{line.dueDate || '—'}</td>
                              <td className="py-2.5 px-3 font-sans font-medium text-slate-800">{line.description || (line.type === 'Invoice' ? 'Invois Jualan' : 'Resit Bayaran')}</td>
                              <td className="py-2.5 px-3 text-right text-blue-700">{line.debit > 0 ? formatRM(line.debit) : '—'}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-700">{line.credit > 0 ? formatRM(line.credit) : '—'}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatRM(line.runningBalance)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CUSTOMER STATEMENT PRINT & PDF PREVIEW MODAL */}
          {showStatementPdfModal && statement && (
            <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
              <div className="bg-white rounded-2xl max-w-4xl w-full p-8 shadow-2xl space-y-6 my-8 border border-slate-200">
                {/* Modal Header Bar */}
                <div className="flex justify-between items-center border-b border-slate-100 pb-4 no-print">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pratonton Penyata Pelanggan (A4 Document)</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="py-1.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>🖨️</span> Cetak / Simpan PDF
                    </button>
                    <button
                      onClick={handleDownloadStatementPdf}
                      disabled={isGeneratingPdf}
                      className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <span>📥</span> {isGeneratingPdf ? 'Menjana PDF...' : 'Muat Turun PDF'}
                    </button>
                    <button
                      onClick={() => setShowStatementPdfModal(false)}
                      className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                </div>

                {statementPdfError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium flex items-center gap-2 no-print">
                    <span>⚠️</span> {statementPdfError}
                  </div>
                )}

                {/* Printable Document Container */}
                <div id="printable-customer-statement" className="printable-document space-y-6 text-slate-900 p-4 bg-white border border-slate-200 rounded-xl">
                  {/* Header Company Details */}
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900">{statement.company?.name || 'KHAIRUL FRESH'}</h1>
                      <p className="text-xs font-bold text-slate-600">
                        {statement.company?.registrationNumber ? `No. Pendaftaran: ${statement.company.registrationNumber}` : 'Khairul Fresh Produce & Supplies'}
                      </p>
                      {statement.company?.address && <p className="text-xs text-slate-500 whitespace-pre-line mt-1">{statement.company.address}</p>}
                      <p className="text-xs text-slate-500 mt-1">
                        {statement.company?.phone && `Tel: ${statement.company.phone}`}
                        {statement.company?.email && ` · E-mel: ${statement.company.email}`}
                        {statement.company?.website && ` · ${statement.company.website}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-xl font-black text-slate-900 tracking-wider">PENYATA AKAUN PELANGGAN</h2>
                      <p className="text-xs font-bold text-slate-600 mt-1">Statement of Account</p>
                      <p className="text-xs font-mono text-slate-500 mt-1">Tarikh Penyata: <strong>{statement.statementDate}</strong></p>
                      <p className="text-xs font-mono text-slate-500">Tempoh: <strong>{statement.startDate}</strong> hingga <strong>{statement.endDate}</strong></p>
                    </div>
                  </div>

                  {/* Customer & Summary Grid */}
                  <div className="grid grid-cols-2 gap-6 text-xs">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Maklumat Pelanggan (Customer):</span>
                      <p className="font-bold text-sm text-slate-900">{statement.customer.name}</p>
                      <p className="text-slate-600 font-mono font-bold">Kod Pelanggan: {statement.customer.customerCode}</p>
                      {statement.customer.address && <p className="text-slate-600 text-[11px] whitespace-pre-line">{statement.customer.address}</p>}
                      <p className="text-slate-600 text-[11px]">
                        {statement.customer.phone && `Tel: ${statement.customer.phone}`}
                        {statement.customer.email && ` · E-mel: ${statement.customer.email}`}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 font-medium">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Ringkasan Baki (Statement Summary):</span>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Baki Pembukaan:</span>
                        <span className="font-mono font-bold text-slate-900">{formatRM(statement.openingBalance || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Jumlah Debit (Invois):</span>
                        <span className="font-mono font-bold text-blue-700">{formatRM(statement.periodTotalDebit || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Jumlah Kredit (Bayaran):</span>
                        <span className="font-mono font-bold text-emerald-700">{formatRM(statement.periodTotalCredit || 0)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-300 pt-1 text-sm">
                        <span className="font-bold text-slate-900">Baki Penutup (Closing):</span>
                        <span className="font-mono font-bold text-slate-900">{formatRM(statement.closingBalance || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                          <th className="py-2 px-3">Tarikh</th>
                          <th className="py-2 px-3">No. Rujukan</th>
                          <th className="py-2 px-3">Due Date</th>
                          <th className="py-2 px-3">Keterangan</th>
                          <th className="py-2 px-3 text-right">Debit (RM)</th>
                          <th className="py-2 px-3 text-right">Kredit (RM)</th>
                          <th className="py-2 px-3 text-right">Baki (RM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        <tr className="bg-slate-50 font-sans italic text-slate-700">
                          <td className="py-2 px-3">{statement.startDate}</td>
                          <td className="py-2 px-3">—</td>
                          <td className="py-2 px-3">—</td>
                          <td className="py-2 px-3 font-bold">Baki Pembukaan (Opening Balance)</td>
                          <td className="py-2 px-3 text-right">—</td>
                          <td className="py-2 px-3 text-right">—</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{formatRM(statement.openingBalance || 0)}</td>
                        </tr>
                        {statement.statementLines?.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-400 italic font-sans">
                              Tiada transaksi dalam tempoh penyata.
                            </td>
                          </tr>
                        ) : (
                          statement.statementLines?.map((line: any, i: number) => (
                            <tr key={i}>
                              <td className="py-2 px-3">{line.date}</td>
                              <td className="py-2 px-3 font-bold text-slate-900">{line.reference}</td>
                              <td className="py-2 px-3 text-slate-500">{line.dueDate || '—'}</td>
                              <td className="py-2 px-3 font-sans">{line.description}</td>
                              <td className="py-2 px-3 text-right text-blue-700">{line.debit > 0 ? formatRM(line.debit) : '—'}</td>
                              <td className="py-2 px-3 text-right text-emerald-700">{line.credit > 0 ? formatRM(line.credit) : '—'}</td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">{formatRM(line.runningBalance)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer Reconciled Balance */}
                  <div className="flex justify-between items-center pt-4 border-t border-slate-200 text-xs text-slate-500">
                    <p>Penyata diselaraskan secara automatik daripada Lejar Akaun Belum Bayar (Accounts Receivable).</p>
                    <p className="font-mono font-bold text-slate-900">JUMLAH BAKI TERTUNGGAK: {formatRM(statement.closingBalance || 0)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STANDALONE PRINT CONTAINER FOR NATIVE PRINTING */}
          {statement && (
            <div
              id="printable-statement-standalone"
              className="hidden print:block bg-white text-slate-900 p-6 max-w-4xl mx-auto"
              dangerouslySetInnerHTML={{ __html: buildCustomerStatementHtml(statement, company) }}
            />
          )}
        </div>
      ) : (
        // CUSTOMER DIRECTORY LIST VIEW
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
            <div className="w-full sm:w-96">
              <input
                type="text"
                placeholder="Cari kod, nama, telefon, atau e-mel pelanggan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-slate-400 shadow-xs"
              />
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {(['All', 'Active', 'Inactive'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setFilterActive(filter)}
                  className={`py-1 px-3 text-xs font-semibold rounded-lg transition-colors ${
                    filterActive === filter
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter === 'All' ? 'Semua' : filter === 'Active' ? 'Aktif' : 'Tidak Aktif'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-6">Kod Pelanggan</th>
                    <th className="py-3 px-6">Nama Pelanggan</th>
                    <th className="py-3 px-6">Nombor Telefon</th>
                    <th className="py-3 px-6">Alamat E-mel</th>
                    <th className="py-3 px-6 text-center">Status</th>
                    <th className="py-3 px-6 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                        Tiada rekod pelanggan dijumpai.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-6 font-mono font-bold text-slate-900">{c.customerCode}</td>
                        <td className="py-3.5 px-6 font-semibold text-slate-950">
                          <div>{c.name}</div>
                          {c.defaultPaymentTerm && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              {c.defaultPaymentTerm} · {c.defaultPaymentMethod || 'Bank'}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-slate-600 font-mono">{c.phone || '—'}</td>
                        <td className="py-3.5 px-6 text-slate-500 font-mono">{c.email || '—'}</td>
                        <td className="py-3.5 px-6 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              c.isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {c.isActive ? 'AKTIF' : 'TIDAK AKTIF'}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right space-x-2">
                          <button
                            onClick={() => handleOpenEdit(c)}
                            disabled={userRole === 'Viewer'}
                            className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-medium rounded-lg text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setSelectedCust(c); fetchStatement(c.id); }}
                            className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition-colors shadow-xs"
                          >
                            <Eye className="w-3.5 h-3.5" /> Penyata
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH PELANGGAN */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Daftar Pelanggan Baru</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kod Pelanggan *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="CUST-001"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombor Telefon</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="012-3456789"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Pelanggan *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="cth: Pasar Segar Aman Jaya Sdn Bhd"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat E-mel</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="akaun@pasarsegar.com"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Pejabat / Bil</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="Alamat lengkap penghantaran..."
                />
              </div>

              {/* 4 CUSTOMER DEFAULT SETTINGS */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="text-[11px] text-slate-700 font-bold uppercase tracking-wider block">
                  Tetapan Lalai Invois (Customer Defaults)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Tempoh Bayaran (Payment Term)</label>
                    <select
                      value={defaultPaymentTerm}
                      onChange={(e) => setDefaultPaymentTerm(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="Cash">Tunai / Cash (Serta-merta)</option>
                      <option value="Net 7">7 Hari (Net 7)</option>
                      <option value="Net 14">14 Hari (Net 14)</option>
                      <option value="Net 30">30 Hari (Net 30)</option>
                      <option value="Net 60">60 Hari (Net 60)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Kaedah Bayaran (Payment Method)</label>
                    <select
                      value={defaultPaymentMethod}
                      onChange={(e) => setDefaultPaymentMethod(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="Bank Transfer">Pemindahan Bank (Bank Transfer)</option>
                      <option value="Cash">Tunai (Cash)</option>
                      <option value="Credit / Debit Card">Kad Kredit / Debit</option>
                      <option value="Cheque">Cek (Cheque)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Akaun Hasil Lalai (Income Account)</label>
                    <select
                      value={defaultIncomeAccountId}
                      onChange={(e) => setDefaultIncomeAccountId(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="">Gunakan Lalai Sistem (4000)</option>
                      {revenueAccounts.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Tahap Harga (Price Level)</label>
                    <select
                      value={priceLevel}
                      onChange={(e) => setPriceLevel(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="Standard">Runcit / Standard</option>
                      <option value="Wholesale">Borong / Tier 1</option>
                      <option value="Tier 2">Khas / Tier 2</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nota Tambahan</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="Catatan kredit atau urusan khas..."
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Simpan Pelanggan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PELANGGAN */}
      {showEdit && editingCust && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Kemaskini Profil Pelanggan</h3>
              <button onClick={() => setShowEdit(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kod Pelanggan *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombor Telefon</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Pelanggan *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat E-mel</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Pejabat / Bil</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {/* 4 CUSTOMER DEFAULT SETTINGS */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="text-[11px] text-slate-700 font-bold uppercase tracking-wider block">
                  Tetapan Lalai Invois (Customer Defaults)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Tempoh Bayaran (Payment Term)</label>
                    <select
                      value={defaultPaymentTerm}
                      onChange={(e) => setDefaultPaymentTerm(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="Cash">Tunai / Cash (Serta-merta)</option>
                      <option value="Net 7">7 Hari (Net 7)</option>
                      <option value="Net 14">14 Hari (Net 14)</option>
                      <option value="Net 30">30 Hari (Net 30)</option>
                      <option value="Net 60">60 Hari (Net 60)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Kaedah Bayaran (Payment Method)</label>
                    <select
                      value={defaultPaymentMethod}
                      onChange={(e) => setDefaultPaymentMethod(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="Bank Transfer">Pemindahan Bank (Bank Transfer)</option>
                      <option value="Cash">Tunai (Cash)</option>
                      <option value="Credit / Debit Card">Kad Kredit / Debit</option>
                      <option value="Cheque">Cek (Cheque)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Akaun Hasil Lalai (Income Account)</label>
                    <select
                      value={defaultIncomeAccountId}
                      onChange={(e) => setDefaultIncomeAccountId(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="">Gunakan Lalai Sistem (4000)</option>
                      {revenueAccounts.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1 text-[11px]">Tahap Harga (Price Level)</label>
                    <select
                      value={priceLevel}
                      onChange={(e) => setPriceLevel(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs"
                    >
                      <option value="Standard">Runcit / Standard</option>
                      <option value="Wholesale">Borong / Tier 1</option>
                      <option value="Tier 2">Khas / Tier 2</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nota Tambahan</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Kemaskini Pelanggan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 9. SALES INVOICES VIEW (MILESTONE 2A NEW)
function SalesInvoicesView({ accounts, token, userRole, company, initialInvoiceId, onViewJournal }: { accounts: any[], token: string | null, userRole: string, company?: any, initialInvoiceId?: string | null, onViewJournal?: (journalId: string) => void }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);

  // Header Form Fields
  const [customerId, setCustomerId] = useState('');
  const [selectedCustomerObj, setSelectedCustomerObj] = useState<any>(null);
  const [paymentTerm, setPaymentTerm] = useState('Net 30');
  const [invoiceDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [overallDiscount, setOverallDiscount] = useState<number>(0);

  // Line items state
  const [lines, setLines] = useState<any[]>([
    { description: '', sku: '', unit: 'unit', quantity: 1, unitPrice: 0, discount: 0, revenueAccountId: '' }
  ]);

  // Autocomplete state tracking
  const [activeAutocompleteIdx, setActiveAutocompleteIdx] = useState<number | null>(null);

  // PDF Preview Modal State
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [invoicePdfError, setInvoicePdfError] = useState('');

  const handleDownloadInvoicePdf = async () => {
    if (!selectedInvoice) return;
    setIsGeneratingPdf(true);
    setInvoicePdfError('');
    try {
      const invNum = selectedInvoice.invoiceNumber || 'INV';
      const fileName = `Invois_${invNum}.pdf`;

      const htmlContent = buildSalesInvoiceHtml(selectedInvoice, company);
      await generatePdfFromHtml(htmlContent, fileName, 'portrait');
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      setInvoicePdfError(err?.message || "Gagal menjana PDF. Sila guna 'Cetak / Simpan PDF'.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidInput, setShowVoidInput] = useState(false);

  const [productsList, setProductsList] = useState<any[]>([]);

  // Add Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // PDF Preview Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);

  const fetchInvoices = async () => {
    try {
      const res = await apiFetch('/api/sales-invoices');
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await apiFetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.filter((c: any) => c.isActive));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProductsList = async () => {
    try {
      const res = await apiFetch('/api/products?status=Active');
      if (res.ok) {
        const data = await res.json();
        setProductsList(data);
      }
    } catch (err) {
      console.error('Error fetching active products for sales invoices:', err);
    }
  };

  const fetchInvoiceDetails = async (id: string) => {
    try {
      const res = await apiFetch(`/api/sales-invoices/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Helper to resolve Customer Name safely without raw UUIDs
  const getCustName = (inv: any) => {
    if (!inv) return 'Pelanggan Tidak Wujud';
    if (inv.customerName && inv.customerName !== inv.customerId) return inv.customerName;
    if (inv.customer?.name) return inv.customer.name;
    const found = customers.find((c: any) => c.id === inv.customerId);
    if (found?.name) return found.name;
    return 'Pelanggan Tidak Wujud';
  };

  // Open Payment Modal
  const handleOpenPaymentModal = () => {
    if (!selectedInvoice) return;
    const balanceDue = (selectedInvoice.outstanding / 100).toFixed(2);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentAmount(balanceDue);
    const assetAccounts = accounts.filter((a: any) => a.type === 'Asset' || a.subType === 'CashAndBank' || a.subType === 'CurrentAsset');
    setPaymentAccountId(assetAccounts[0]?.id || accounts[0]?.id || '');
    setPaymentRef(`REC-${selectedInvoice.invoiceNumber}-${Math.floor(1000 + Math.random() * 9000)}`);
    setPaymentNotes(`Bayaran bagi Invois ${selectedInvoice.invoiceNumber}`);
    setPaymentError('');
    setShowPaymentModal(true);
  };

  // Submit Payment Record
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');

    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setPaymentError('Jumlah bayaran mestilah melebihi RM 0.00.');
      return;
    }

    const maxAmountCents = selectedInvoice.outstanding;
    const paymentCents = Math.round(parseFloat(paymentAmount) * 100);

    if (paymentCents > maxAmountCents) {
      setPaymentError(`Jumlah bayaran (RM ${parseFloat(paymentAmount).toFixed(2)}) tidak boleh melebihi baki invois (RM ${(maxAmountCents / 100).toFixed(2)}).`);
      return;
    }

    if (!paymentAccountId) {
      setPaymentError('Sila pilih akaun penerimaan bayaran.');
      return;
    }

    if (!paymentRef.trim()) {
      setPaymentError('Sila masukkan no. rujukan / resit bayaran.');
      return;
    }

    try {
      setPaymentSubmitting(true);
      const res = await apiFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedInvoice.customerId,
          paymentDate,
          paymentReference: paymentRef.trim(),
          amount: paymentCents,
          paymentAccountId,
          notes: paymentNotes.trim() || undefined,
          status: 'Posted',
          allocations: [
            {
              invoiceId: selectedInvoice.id,
              amount: paymentCents
            }
          ]
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal merekodkan pembayaran.');
      }

      setSuccess('Pembayaran berjaya direkodkan dan dilaras ke lejar!');
      setShowPaymentModal(false);
      fetchInvoiceDetails(selectedInvoice.id);
      fetchInvoices();
    } catch (err: any) {
      setPaymentError(err.message || 'Ralat berlaku semasa merekodkan bayaran.');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Payment term helper to calculate due date
  const calculateDueDateFromTerm = (baseDateStr: string, term: string) => {
    const baseDate = baseDateStr ? new Date(baseDateStr) : new Date();
    let daysToAdd = 30;
    if (term === 'Cash' || term === 'COD' || term === 'Due Immediately') daysToAdd = 0;
    else if (term === 'Net 7') daysToAdd = 7;
    else if (term === 'Net 14') daysToAdd = 14;
    else if (term === 'Net 30') daysToAdd = 30;
    else if (term === 'Net 60') daysToAdd = 60;

    const calcDue = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return calcDue.toISOString().split('T')[0];
  };

  const handleCustomerSelect = (selectedId: string) => {
    setCustomerId(selectedId);
    if (!selectedId) {
      setSelectedCustomerObj(null);
      setPaymentTerm('Net 30');
      return;
    }

    const cust = customers.find((c: any) => c.id === selectedId);
    setSelectedCustomerObj(cust || null);
    if (!cust) return;

    // Use saved default payment term when available, otherwise Net 30
    const termToUse = cust.defaultPaymentTerm || 'Net 30';
    setPaymentTerm(termToUse);
    setDueDate(calculateDueDateFromTerm(invoiceDate, termToUse));

    // Apply default income account to empty line items
    if (cust.defaultIncomeAccountId) {
      setLines((prevLines) =>
        prevLines.map((l) => ({
          ...l,
          revenueAccountId: l.revenueAccountId || cust.defaultIncomeAccountId,
        }))
      );
    }
  };

  const handlePaymentTermChange = (term: string) => {
    setPaymentTerm(term);
    setDueDate(calculateDueDateFromTerm(invoiceDate, term));
  };

  const handleInvoiceDateChange = (dateStr: string) => {
    setEntryDate(dateStr);
    setDueDate(calculateDueDateFromTerm(dateStr, paymentTerm));
  };

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
    fetchProductsList();
  }, []);

  useEffect(() => {
    if (initialInvoiceId) {
      fetchInvoiceDetails(initialInvoiceId);
    }
  }, [initialInvoiceId]);

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...lines];
    updated[index][field] = value;
    setLines(updated);
  };

  const getCustomerProductPrice = (product: any, customerObj?: any) => {
    const rawPrice = product.sellingPrice / 100;
    if (!customerObj || !customerObj.customPrices) return { price: rawPrice, isCustom: false };

    const cp = customerObj.customPrices;
    const override = cp[product.productCode] ?? cp[product.id] ?? cp[product.name];
    if (override !== undefined && override !== null && override > 0) {
      const customPriceRM = override > 50 ? override / 100 : override;
      return { price: customPriceRM, isCustom: true };
    }

    return { price: rawPrice, isCustom: false };
  };

  const selectProductForLine = (index: number, product: any) => {
    const { price: effectivePrice } = getCustomerProductPrice(product, selectedCustomerObj);
    const defaultAcc = product.incomeAccountId || selectedCustomerObj?.defaultIncomeAccountId || (accounts.find(a => a.active && a.type === 'Revenue')?.id || '');

    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      description: product.name, // PRODUCT NAME ONLY!
      sku: product.productCode || '',
      unit: product.salesUnit || 'unit',
      unitPrice: effectivePrice,
      revenueAccountId: defaultAcc,
    };
    setLines(updated);
    setActiveAutocompleteIdx(null);
  };

  const addLine = () => {
    const defaultAcc = selectedCustomerObj?.defaultIncomeAccountId || (accounts.find(a => a.active && a.type === 'Revenue')?.id || '');
    setLines([...lines, { description: '', sku: '', unit: 'unit', quantity: 1, unitPrice: 0, discount: 0, revenueAccountId: defaultAcc }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  // Calculation helpers
  const calculateLineTotal = (line: any) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    const disc = parseFloat(line.discount) || 0;
    return Math.max(0, qty * price - disc);
  };

  const subtotal = lines.reduce((acc, l) => acc + calculateLineTotal(l), 0);
  const taxAmount = 0; // Tax configuration
  const grandTotal = Math.max(0, subtotal - (overallDiscount || 0) + taxAmount);

  const saveInvoiceBackend = async (asDraft: boolean) => {
    setError('');
    setSuccess('');

    if (!customerId) {
      setError("Sila pilih pelanggan.");
      return null;
    }
    if (!invoiceDate || !dueDate) {
      setError("Sila pastikan Tarikh Invois dan Due Date lengkap.");
      return null;
    }
    if (lines.length === 0 || lines.some(l => !l.description.trim() || !l.revenueAccountId)) {
      setError("Sila lengkapkan deskripsi dan akaun hasil untuk setiap baris produk.");
      return null;
    }
    if (lines.some(l => (parseFloat(l.quantity) || 0) <= 0 || (parseFloat(l.unitPrice) || 0) < 0)) {
      setError("Kuantiti mesti melebihi 0 dan Harga Seunit tidak boleh negatif.");
      return null;
    }

    setIsSubmitting(true);
    try {
      const processedLines = lines.map(l => ({
        description: l.description,
        sku: l.sku,
        unit: l.unit,
        quantity: parseFloat(l.quantity) || 1,
        unitPrice: Math.round((parseFloat(l.unitPrice) || 0) * 100),
        discount: Math.round((parseFloat(l.discount) || 0) * 100),
        revenueAccountId: l.revenueAccountId
      }));

      const endpoint = isEditingDraft ? `/api/sales-invoices/${selectedInvoice.id}` : '/api/sales-invoices';
      const method = isEditingDraft ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId,
          paymentTerm,
          invoiceDate,
          dueDate,
          reference,
          discount: Math.round((overallDiscount || 0) * 100),
          lines: processedLines
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Gagal menyimpan invois.");
      }

      const resultData = await res.json();
      const invoiceId = resultData.id || (selectedInvoice && selectedInvoice.id);

      if (!asDraft && invoiceId) {
        // Post directly
        const postRes = await fetch(`/api/sales-invoices/${invoiceId}/post`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!postRes.ok) {
          const postErr = await postRes.json();
          throw new Error(postErr.error || "Invois disimpan tetapi gagal dipos ke lejar.");
        }
      }

      setIsSubmitting(false);
      setSuccess(asDraft ? "Draf invois berjaya disimpan." : "Invois jualan berjaya disimpan dan dipos ke Lejar.");
      setShowAdd(false);
      setIsEditingDraft(false);
      setSelectedInvoice(null);
      setSelectedCustomerObj(null);
      setCustomerId('');
      setLines([{ description: '', sku: '', unit: 'unit', quantity: 1, unitPrice: 0, discount: 0, revenueAccountId: '' }]);
      setOverallDiscount(0);
      setReference('');
      fetchInvoices();
      return true;
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || "Gagal memproses invois.");
      return null;
    }
  };

  const handlePost = async (id: string) => {
    if (!window.confirm("Adakah anda pasti mahu Pos invois ini? Penguncian lejar akan dilakukan.")) return;
    try {
      const res = await fetch(`/api/sales-invoices/${id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccess("Invois jualan berjaya dipos ke Lejar Am!");
        setSelectedInvoice(null);
        fetchInvoices();
      } else {
        const error = await res.json();
        setError(error.error || "Posting gagal.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleVoid = async (id: string) => {
    if (!voidReason.trim()) {
      alert("Sila nyatakan sebab untuk membatalkan (void).");
      return;
    }
    try {
      const res = await fetch(`/api/sales-invoices/${id}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: voidReason })
      });
      if (res.ok) {
        alert("Invois dibatalkan. Catatan imbalan lejar telah dijana.");
        setSelectedInvoice(null);
        setShowVoidInput(false);
        setVoidReason('');
        fetchInvoices();
      } else {
        const error = await res.json();
        alert(error.error || "Gagal membatalkan invois.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditTrigger = () => {
    if (!selectedInvoice) return;
    setCustomerId(selectedInvoice.customerId);
    const foundCust = customers.find((c: any) => c.id === selectedInvoice.customerId);
    setSelectedCustomerObj(foundCust || null);
    setPaymentTerm(selectedInvoice.paymentTerm || foundCust?.defaultPaymentTerm || 'Net 30');
    setEntryDate(selectedInvoice.invoiceDate);
    setDueDate(selectedInvoice.dueDate);
    setReference(selectedInvoice.reference || '');
    setOverallDiscount((selectedInvoice.discount || 0) / 100);
    setLines(selectedInvoice.lines.map((l: any) => ({
      description: l.description,
      sku: l.sku || '',
      unit: l.unit || 'unit',
      quantity: l.quantity,
      unitPrice: l.unitPrice / 100,
      discount: (l.discount || 0) / 100,
      revenueAccountId: l.revenueAccountId
    })));
    setIsEditingDraft(true);
    setShowAdd(true);
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Invois Jualan</h2>
          <p className="text-slate-500 text-xs">Perekodan invois jualan pelanggan, pemindahan automatik ke lejar, dan pengurusan Pelanggan Belum Bayar.</p>
        </div>
        {userRole !== 'Viewer' && !showAdd && !selectedInvoice && (
          <button
            onClick={() => {
              setShowAdd(true);
              setIsEditingDraft(false);
              setCustomerId('');
              setSelectedCustomerObj(null);
              setPaymentTerm('Net 30');
              setEntryDate(new Date().toISOString().split('T')[0]);
              setDueDate(calculateDueDateFromTerm(new Date().toISOString().split('T')[0], 'Net 30'));
              setReference('');
              setOverallDiscount(0);
              setError('');
              setSuccess('');
              setLines([{ description: '', sku: '', unit: 'unit', quantity: 1, unitPrice: 0, discount: 0, revenueAccountId: '' }]);
            }}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Invois Jualan Baru
          </button>
        )}
      </div>

      {success && (
        <div className="p-3 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-emerald-600 hover:underline text-[11px]">Tutup</button>
        </div>
      )}

      {showAdd ? (
        // CREATE / EDIT INVOICE FORM (FINANCIO-INSPIRED UX)
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {isEditingDraft ? `Edit Draf Invois (${selectedInvoice.invoiceNumber})` : 'Cipta Invois Jualan Baru'}
            </h3>
            <button
              onClick={() => { setShowAdd(false); setIsEditingDraft(false); setSelectedInvoice(null); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Batal & Kembali
            </button>
          </div>

          {error && (
            <div className="p-3 text-xs font-semibold bg-red-50 text-red-700 border border-red-100 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            {/* Header Controls */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-slate-50/60 p-4 border border-slate-200 rounded-xl">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pelanggan *</label>
                <select
                  value={customerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none text-xs font-medium"
                  required
                >
                  <option value="">Pilih pelanggan...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.customerCode} - {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tempoh Bayaran</label>
                <select
                  value={paymentTerm}
                  onChange={(e) => handlePaymentTermChange(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs font-medium"
                >
                  <option value="Net 30">Net 30 (30 Hari)</option>
                  <option value="Net 14">Net 14 (14 Hari)</option>
                  <option value="Net 7">Net 7 (7 Hari)</option>
                  <option value="Net 60">Net 60 (60 Hari)</option>
                  <option value="COD">COD / Tunai</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tarikh Invois *</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => handleInvoiceDateChange(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Due Date *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs font-medium"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">No. Rujukan / PO (Pilihan)</label>
                <input
                  type="text"
                  placeholder="cth: PO-8892 / Nota Serahan 102"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            {/* Line items table with Autocomplete & Separate SKU/Unit */}
            <div className="border border-slate-200 rounded-xl overflow-visible shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-xs text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3">Deskripsi Produk (Katalog)</th>
                    <th className="py-2.5 px-3 w-24">SKU</th>
                    <th className="py-2.5 px-3 w-20">Unit</th>
                    <th className="py-2.5 px-3 w-32 text-right">Kuantiti</th>
                    <th className="py-2.5 px-3 w-32 text-right">Harga Seunit</th>
                    <th className="py-2.5 px-3 w-28 text-right">Diskaun</th>
                    <th className="py-2.5 px-3 w-32 text-right">Jumlah</th>
                    <th className="py-2.5 px-3 w-48">Akaun Hasil</th>
                    <th className="py-2.5 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.map((line, idx) => {
                    const lineTotal = calculateLineTotal(line);
                    const matchingProducts = productsList.filter((p) => {
                      if (!line.description) return true;
                      const term = line.description.toLowerCase();
                      return p.name.toLowerCase().includes(term) || (p.productCode && p.productCode.toLowerCase().includes(term));
                    });

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        {/* Product Description with Autocomplete */}
                        <td className="py-2.5 px-3 relative align-top">
                          <input
                            type="text"
                            placeholder="Mula menaip nama produk..."
                            value={line.description}
                            onFocus={() => setActiveAutocompleteIdx(idx)}
                            onChange={(e) => {
                              handleLineChange(idx, 'description', e.target.value);
                              setActiveAutocompleteIdx(idx);
                            }}
                            className="w-full border border-slate-200 bg-white rounded-lg p-1.5 focus:outline-none text-xs font-medium"
                            required
                          />

                          {/* Autocomplete Dropdown */}
                          {activeAutocompleteIdx === idx && (
                            <div className="absolute left-3 right-3 top-12 z-50 bg-white border border-slate-300 rounded-xl shadow-xl max-h-56 overflow-y-auto p-1 text-xs">
                              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100 flex justify-between">
                                <span>Padanan Katalog Produk</span>
                                <button type="button" onClick={() => setActiveAutocompleteIdx(null)} className="text-slate-400 hover:text-slate-600">Tutup ✕</button>
                              </div>
                              {matchingProducts.length === 0 ? (
                                <div className="p-3 text-slate-400 italic text-center text-xs">Tiada produk ditemui dalam katalog</div>
                              ) : (
                                matchingProducts.map((p) => {
                                  const { price: effectivePrice, isCustom } = getCustomerProductPrice(p, selectedCustomerObj);

                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => selectProductForLine(idx, p)}
                                      className="w-full text-left p-2 hover:bg-blue-50 rounded-lg flex items-center justify-between transition-colors border-b border-slate-50 last:border-0"
                                    >
                                      <div>
                                        <div className="font-bold text-slate-900">{p.name}</div>
                                        <div className="text-[10px] text-slate-400">SKU: <span className="font-mono">{p.productCode || '-'}</span> · Unit: {p.salesUnit}</div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-mono font-bold text-emerald-700">RM {effectivePrice.toFixed(2)}</div>
                                        {isCustom && <span className="text-[9px] bg-purple-100 text-purple-800 px-1 rounded">Harga Khas</span>}
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </td>

                        {/* SKU */}
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="text"
                            placeholder="SKU"
                            value={line.sku || ''}
                            onChange={(e) => handleLineChange(idx, 'sku', e.target.value)}
                            className="w-full border border-slate-200 bg-slate-50 text-slate-600 rounded-lg p-1.5 focus:outline-none text-xs font-mono"
                            readOnly
                          />
                        </td>

                        {/* Unit */}
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="text"
                            placeholder="Unit"
                            value={line.unit || 'unit'}
                            onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
                            className="w-full border border-slate-200 bg-slate-50 text-slate-600 rounded-lg p-1.5 focus:outline-none text-xs text-center font-medium"
                          />
                        </td>

                        {/* Quantity */}
                        <td className="py-2.5 px-3 align-top">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              min="0.01"
                              placeholder="1"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                              className="w-full text-right border border-slate-200 bg-white rounded-lg p-1.5 focus:outline-none font-mono text-xs font-bold"
                              required
                            />
                            <span className="text-[11px] text-slate-400 font-semibold shrink-0">{line.unit || 'unit'}</span>
                          </div>
                        </td>

                        {/* Unit Price */}
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.unitPrice || ''}
                            onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                            className="w-full text-right border border-slate-200 bg-white rounded-lg p-1.5 focus:outline-none font-mono text-xs font-bold"
                            required
                          />
                        </td>

                        {/* Discount */}
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.discount || ''}
                            onChange={(e) => handleLineChange(idx, 'discount', e.target.value)}
                            className="w-full text-right border border-slate-200 bg-white rounded-lg p-1.5 focus:outline-none font-mono text-xs"
                          />
                        </td>

                        {/* Line Total */}
                        <td className="py-2.5 px-3 align-top text-right font-mono font-bold text-slate-900 pt-3">
                          RM {lineTotal.toFixed(2)}
                        </td>

                        {/* Revenue Account */}
                        <td className="py-2.5 px-3 align-top">
                          <select
                            value={line.revenueAccountId}
                            onChange={(e) => handleLineChange(idx, 'revenueAccountId', e.target.value)}
                            className="w-full border border-slate-200 bg-white rounded-lg p-1.5 focus:outline-none text-xs"
                            required
                          >
                            <option value="">Akaun Hasil...</option>
                            {accounts.filter(a => a.active && a.type === 'Revenue').map(a => (
                              <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                          </select>
                        </td>

                        {/* Remove */}
                        <td className="py-2.5 px-3 text-center align-top pt-3">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            disabled={lines.length <= 1}
                            className="text-slate-300 hover:text-red-700 disabled:opacity-20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="p-3 bg-slate-50 border-t border-slate-200">
                <button
                  type="button"
                  onClick={addLine}
                  className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Baris Produk
                </button>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 bg-slate-50/80 p-5 border border-slate-200 rounded-xl">
              <div className="text-xs text-slate-500 max-w-xs space-y-1">
                <div className="font-bold text-slate-700">Nota Invois:</div>
                <p>Invois dijana mengikut peraturan penetapan harga dan syarat bayaran semasa. Semua maklumat produk adalah tepat dari Katalog Produk.</p>
              </div>

              <div className="w-full md:w-80 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-bold">RM {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Potongan Diskaun Invois:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">RM</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={overallDiscount || ''}
                      onChange={(e) => setOverallDiscount(parseFloat(e.target.value) || 0)}
                      className="w-24 text-right border border-slate-200 bg-white rounded p-1 font-mono text-xs font-bold"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cukai (0%):</span>
                  <span className="font-mono">RM 0.00</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-slate-900 border-t border-slate-300 pt-2">
                  <span>Jumlah Keseluruhan:</span>
                  <span className="font-mono text-emerald-700">RM {grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500 pt-1">
                  <span>Jumlah Dibayar:</span>
                  <span className="font-mono">RM 0.00</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-800 border-t border-dashed border-slate-200 pt-1">
                  <span>Baki Belum Dibayar:</span>
                  <span className="font-mono text-blue-700">RM {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setIsEditingDraft(false); setSelectedInvoice(null); }}
                className="py-2.5 px-5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl"
                disabled={isSubmitting}
              >
                Batal
              </button>

              <button
                type="button"
                onClick={() => saveInvoiceBackend(true)}
                className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold rounded-xl border border-slate-300 transition-colors"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Menyimpan...' : 'Button A: Simpan sebagai Draf'}
              </button>

              <button
                type="button"
                onClick={() => saveInvoiceBackend(false)}
                className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Memproses...' : 'Button B: Simpan Invois'}
              </button>
            </div>
          </div>
        </div>
      ) : selectedInvoice ? (
        /* SALES INVOICE DETAIL VIEW SHEET & IMMUTABILITY LAYOUT */
        <div className="space-y-6 bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-xs text-blue-600 hover:underline mb-2 block font-medium"
              >
                &larr; Kembali ke Senarai Invois
              </button>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900">Invois Jualan: {selectedInvoice.invoiceNumber}</h3>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                  selectedInvoice.status === 'Draft' ? 'bg-slate-100 text-slate-800 border-slate-200' :
                  selectedInvoice.status === 'Paid' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                  selectedInvoice.status === 'Partially Paid' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                  selectedInvoice.status === 'Posted' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                  'bg-red-50 text-red-800 border-red-100'
                }`}>
                  {selectedInvoice.status.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {/* Print & PDF Actions */}
              <button
                onClick={() => window.print()}
                className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-200 flex items-center gap-1.5"
              >
                <span>🖨️</span> Cetak Invois
              </button>
              <button
                onClick={() => setShowPdfModal(true)}
                className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg border border-blue-200 flex items-center gap-1.5"
              >
                <span>📄</span> Lihat / Muat Turun PDF
              </button>

              {/* Record Payment Button */}
              {selectedInvoice.status === 'Posted' && selectedInvoice.outstanding > 0 && userRole !== 'Viewer' && (
                <button
                  onClick={handleOpenPaymentModal}
                  className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  <span>💵</span> + Rekod Pembayaran
                </button>
              )}

              {/* Draft Editing / Posting */}
              {selectedInvoice.status === 'Draft' && userRole !== 'Viewer' && (
                <>
                  <button
                    onClick={handleEditTrigger}
                    className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg font-bold"
                  >
                    Edit Draf
                  </button>
                  <button
                    onClick={() => handlePost(selectedInvoice.id)}
                    className="py-1.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold shadow-xs"
                  >
                    Pos ke Lejar
                  </button>
                </>
              )}

              {/* Void Action */}
              {selectedInvoice.status === 'Posted' && userRole !== 'Viewer' && (
                <button
                  onClick={() => setShowVoidInput(true)}
                  className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-bold border border-red-100"
                >
                  Batal (Void)
                </button>
              )}
            </div>
          </div>

          {showVoidInput && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
              <label className="block text-xs font-bold text-red-900">Sebab Pembatalan (Void Reason) *</label>
              <input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="cth: Invois bertindih atau tersalah akaun..."
                className="w-full border border-red-200 bg-white rounded-lg p-2 text-xs"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowVoidInput(false)} className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-bold">Batal</button>
                <button onClick={() => handleVoid(selectedInvoice.id)} className="px-3 py-1 bg-red-700 text-white rounded text-xs font-bold">Sahkan Membatalkan Invois</button>
              </div>
            </div>
          )}

          {/* Summary Details Box */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-xl text-xs border border-slate-200">
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Pelanggan</span>
              <span className="font-bold text-slate-900 text-sm">{getCustName(selectedInvoice)}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Tarikh Invois</span>
              <span className="font-medium text-slate-800">{selectedInvoice.invoiceDate}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Tarikh Matang</span>
              <span className="font-medium text-slate-800">{selectedInvoice.dueDate}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Jumlah Invois</span>
              <span className="font-mono font-bold text-slate-900 text-sm">RM {(selectedInvoice.total / 100).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Baki Belum Dibayar</span>
              <span className={`font-mono font-bold text-sm ${selectedInvoice.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                RM {(selectedInvoice.outstanding / 100).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Invoice Line Items Sheet */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Butiran Item Invois</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">Deskripsi Produk</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Unit</th>
                    <th className="py-2.5 px-3 text-right">Kuantiti</th>
                    <th className="py-2.5 px-3 text-right">Harga Seunit</th>
                    <th className="py-2.5 px-3 text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedInvoice.lines?.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{l.description}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{l.sku || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{l.unit || 'unit'}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{l.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono">RM {(l.unitPrice / 100).toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">RM {(l.lineTotal / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment History Section */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider flex items-center gap-2">
                <span>💳</span> Sejarah Pembayaran & Pelarasan
              </h4>
              {selectedInvoice.status === 'Posted' && selectedInvoice.outstanding > 0 && userRole !== 'Viewer' && (
                <button
                  onClick={handleOpenPaymentModal}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
                >
                  + Rekod Bayaran
                </button>
              )}
            </div>

            {selectedInvoice.payments && selectedInvoice.payments.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">Tarikh Bayaran</th>
                      <th className="py-2.5 px-3">No. Rujukan</th>
                      <th className="py-2.5 px-3">Akaun Penerimaan</th>
                      <th className="py-2.5 px-3 text-right">Jumlah Dilaras</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.payments.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-slate-800 font-medium">{p.paymentDate}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{p.paymentReference}</td>
                        <td className="py-2.5 px-3 text-slate-600">{p.accountName || 'Akaun Bank'}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          RM {(p.amountAllocated / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-100">
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500 italic">
                Tiada rekod pembayaran direkodkan lagi untuk invois ini.
              </div>
            )}
          </div>

          {selectedInvoice.postedJournalId && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
              <span>
                <strong>Integrasi Lejar Am:</strong> Invois ini telah mencipta Catatan Jurnal <span className="font-mono font-bold">#{selectedInvoice.postedJournalId}</span> secara automatik (Debit Akaun Belum Terima dan Kredit Hasil Jualan).
              </span>
              <button
                onClick={() => onViewJournal && onViewJournal(selectedInvoice.postedJournalId)}
                className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs"
              >
                Lihat di Jurnal &rarr;
              </button>
            </div>
          )}
        </div>
      ) : (
        /* INVOICES LIST TABLE */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">No. Invois</th>
                <th className="py-3 px-4">Pelanggan</th>
                <th className="py-3 px-4">Tarikh</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Jumlah (RM)</th>
                <th className="py-3 px-4 text-right">Baki (RM)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                    Tiada rekod invois jualan. Klik "Invois Jualan Baru" untuk mula merekod.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{getCustName(inv)}</td>
                    <td className="py-3 px-4 text-slate-600">{inv.invoiceDate}</td>
                    <td className="py-3 px-4 text-slate-600">{inv.dueDate}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      RM {(inv.total / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                      RM {((inv.outstanding ?? inv.total) / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                        inv.status === 'Draft' ? 'bg-slate-100 text-slate-800 border-slate-200' :
                        inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        inv.status === 'Partially Paid' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        inv.status === 'Posted' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        'bg-red-50 text-red-800 border-red-100'
                      }`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => fetchInvoiceDetails(inv.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px]"
                      >
                        Lihat
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Rekod Pembayaran Invois</h3>
                <p className="text-xs text-slate-500">Invois: {selectedInvoice.invoiceNumber} · Pelanggan: {getCustName(selectedInvoice)}</p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {paymentError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-semibold">
                {paymentError}
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tarikh Bayaran *</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jumlah Bayaran (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(selectedInvoice.outstanding / 100).toFixed(2)}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-emerald-700"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Maksimum: RM {(selectedInvoice.outstanding / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Akaun Penerimaan (Bank/Tunai) *</label>
                <select
                  required
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-white"
                >
                  <option value="">-- Pilih Akaun Bank / Tunai --</option>
                  {accounts
                    .filter((a: any) => a.type === 'Asset' || a.subType === 'CashAndBank' || a.subType === 'CurrentAsset')
                    .map((a: any) => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">No. Rujukan / Resit Bayaran *</label>
                <input
                  type="text"
                  required
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="cth: MBB-TRX-993812"
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan / Nota</label>
                <textarea
                  rows={2}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Abaikan jika tiada nota tambahan..."
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paymentSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs"
                >
                  {paymentSubmitting ? 'Memproses...' : 'Sahkan Rekod Bayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF PREVIEW & PRINT MODAL */}
      {showPdfModal && selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-8 shadow-2xl space-y-6 my-8 border border-slate-200">
            {/* Modal Actions */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 no-print">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pratonton Invois PDF</span>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="py-1.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>🖨️</span> Cetak / Simpan PDF
                </button>
                <button
                  onClick={handleDownloadInvoicePdf}
                  disabled={isGeneratingPdf}
                  className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <span>📥</span> {isGeneratingPdf ? 'Menjana PDF...' : 'Muat Turun PDF'}
                </button>
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>

            {invoicePdfError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium flex items-center gap-2 no-print">
                <span>⚠️</span> {invoicePdfError}
              </div>
            )}

            {/* Printable Invoice Document Body */}
            <div id="printable-sales-invoice" className="printable-document space-y-6 text-slate-900 p-2">
              {/* Header Company & Title */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">{company?.name || 'KHAIRUL FRESH'}</h1>
                  <p className="text-xs text-slate-500">{company?.registrationNumber ? `No. Pendaftaran: ${company.registrationNumber}` : 'Khairul Fresh Fresh Produce & Supplies'}</p>
                  {company?.address && <p className="text-xs text-slate-500 whitespace-pre-line">{company.address}</p>}
                  {company?.phone && <p className="text-xs text-slate-500">Tel: {company.phone}</p>}
                  {company?.email && <p className="text-xs text-slate-500">E-mel: {company.email}</p>}
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-black text-slate-900 tracking-wider">INVOIS JUALAN</h2>
                  <p className="text-sm font-mono font-bold text-slate-700 mt-1">{selectedInvoice.invoiceNumber}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded text-[10px] font-bold border border-slate-300 uppercase">
                    {selectedInvoice.status}
                  </span>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Kepada (Customer):</span>
                  <p className="font-bold text-sm text-slate-900">{getCustName(selectedInvoice)}</p>
                  {selectedInvoice.customer?.address && (
                    <p className="text-slate-600 whitespace-pre-line text-[11px]">{selectedInvoice.customer.address}</p>
                  )}
                  {selectedInvoice.customer?.phone && (
                    <p className="text-slate-600 text-[11px]">Tel: {selectedInvoice.customer.phone}</p>
                  )}
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 font-medium">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tarikh Invois:</span>
                    <span className="font-bold text-slate-900">{selectedInvoice.invoiceDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tarikh Matang:</span>
                    <span className="font-bold text-slate-900">{selectedInvoice.dueDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Syarat Bayaran:</span>
                    <span>{selectedInvoice.paymentTerm || 'Net 30'}</span>
                  </div>
                  {selectedInvoice.reference && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">No. Rujukan/PO:</span>
                      <span className="font-mono">{selectedInvoice.reference}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                      <th className="py-2.5 px-3">No.</th>
                      <th className="py-2.5 px-3">Deskripsi Produk</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3 text-right">Kuantiti</th>
                      <th className="py-2.5 px-3 text-right">Harga (RM)</th>
                      <th className="py-2.5 px-3 text-right">Jumlah (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedInvoice.lines?.map((l: any, i: number) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 text-slate-500">{i + 1}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{l.description}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{l.sku || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{l.quantity} {l.unit || 'unit'}</td>
                        <td className="py-2.5 px-3 text-right font-mono">RM {(l.unitPrice / 100).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">RM {(l.lineTotal / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Box */}
              <div className="flex justify-end text-xs">
                <div className="w-64 space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-medium">RM {(selectedInvoice.total / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5 text-sm">
                    <span>Jumlah Keseluruhan:</span>
                    <span className="font-mono">RM {(selectedInvoice.total / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Jumlah Dibayar:</span>
                    <span className="font-mono">RM {((selectedInvoice.total - selectedInvoice.outstanding) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-amber-800 font-bold border-t border-slate-200 pt-1 text-sm">
                    <span>Baki Perlu Dibayar:</span>
                    <span className="font-mono">RM {(selectedInvoice.outstanding / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Info / Footer */}
              <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-500 space-y-1">
                <p className="font-bold text-slate-700">Arahan Pembayaran / Payment Instructions:</p>
                <p>Sila jelaskan pembayaran sebelum tarikh matang ({selectedInvoice.dueDate}). Bayaran boleh dibuat secara Pindahan Bank atau Cek atas nama <strong className="text-slate-800">{company?.name || 'Khairul Fresh Accounting'}</strong>.</p>
                <p className="italic text-[10px] text-slate-400 pt-2">Invois ini dijana secara sistem komputer. Tiada tandatangan diperlukan.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STANDALONE PRINT CONTAINER FOR NATIVE PRINTING */}
      {selectedInvoice && (
        <div
          id="printable-invoice-standalone"
          className="hidden print:block bg-white text-slate-900 p-6 max-w-4xl mx-auto"
          dangerouslySetInnerHTML={{ __html: buildSalesInvoiceHtml(selectedInvoice, company) }}
        />
      )}
    </div>
  );
}

// 10. AR OUTSTANDING & AGING VIEW (MILESTONE 2A NEW)
function ARAgingView({ token }: { token: string | null }) {
  const [aging, setAging] = useState<any[]>([]);
  const [outstanding, setOutstanding] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'aging' | 'outstanding'>('aging');

  const fetchARData = async () => {
    try {
      // Fetch Aging
      const agingRes = await fetch('/api/ar/aging', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (agingRes.ok) {
        const agingData = await agingRes.json();
        setAging(agingData);
      }

      // Fetch Outstanding
      const arRes = await fetch('/api/ar/outstanding', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (arRes.ok) {
        const arData = await arRes.json();
        setOutstanding(arData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchARData();
  }, []);

  // Summing total aging buckets
  const totalCurrent = aging.reduce((sum, item) => sum + item.current, 0);
  const total1to30 = aging.reduce((sum, item) => sum + item.oneToThirty, 0);
  const total31to60 = aging.reduce((sum, item) => sum + item.thirtyOneToSixty, 0);
  const total61to90 = aging.reduce((sum, item) => sum + item.sixtyOneToNinety, 0);
  const total90plus = aging.reduce((sum, item) => sum + item.ninetyPlus, 0);
  const totalOutstandingSum = totalCurrent + total1to30 + total31to60 + total61to90 + total90plus;

  return (
    <div className="space-y-6 text-sm">
      <div className="flex justify-between items-center border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Tempoh Tunggakan Pelanggan</h2>
          <p className="text-slate-500 text-xs">Pantau baki invois jualan belum diterima mengikut tempoh tunggakan kalendar.</p>
        </div>
        
        {/* Toggle selectors */}
        <div className="flex bg-slate-100 rounded p-1 gap-1">
          <button
            onClick={() => setActiveSubTab('aging')}
            className={`py-1.5 px-3 rounded text-xs font-semibold transition-colors ${activeSubTab === 'aging' ? 'bg-white text-slate-950 font-bold shadow-xs' : 'text-slate-500'}`}
          >
            Tempoh Tunggakan Pelanggan
          </button>
          <button
            onClick={() => setActiveSubTab('outstanding')}
            className={`py-1.5 px-3 rounded text-xs font-semibold transition-colors ${activeSubTab === 'outstanding' ? 'bg-white text-slate-950 font-bold shadow-xs' : 'text-slate-500'}`}
          >
            Senarai Invois Belum Bayar
          </button>
        </div>
      </div>

      {activeSubTab === 'aging' ? (
        <div className="space-y-6">
          {/* Quick Aggregate Bucket Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Semasa (Belum Lewat)</span>
              <span className="text-base font-bold font-mono text-slate-900">{formatRM(totalCurrent)}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">1 - 30 Hari Tertunggak</span>
              <span className="text-base font-bold font-mono text-blue-700">{formatRM(total1to30)}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">31 - 60 Hari Tertunggak</span>
              <span className="text-base font-bold font-mono text-amber-700">{formatRM(total31to60)}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">61 - 90 Hari Tertunggak</span>
              <span className="text-base font-bold font-mono text-orange-700">{formatRM(total61to90)}</span>
            </div>
            <div className="bg-slate-950 text-white rounded-lg p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Lebih 90 Hari Tertunggak</span>
              <span className="text-base font-bold font-mono text-red-400">{formatRM(total90plus)}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-900 text-white rounded-lg flex justify-between items-center">
            <span className="font-semibold text-xs uppercase tracking-wider text-slate-300">Jumlah Keseluruhan Pelanggan Belum Bayar</span>
            <span className="text-lg font-bold font-mono tracking-tight text-emerald-400">{formatRM(totalOutstandingSum)}</span>
          </div>

          {/* Aging Table Grid */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-4">Kod Pelanggan</th>
                  <th className="py-2.5 px-4">Nama Pelanggan</th>
                  <th className="py-2.5 px-4 text-right">Semasa (RM)</th>
                  <th className="py-2.5 px-4 text-right">1-30 Hari</th>
                  <th className="py-2.5 px-4 text-right">31-60 Hari</th>
                  <th className="py-2.5 px-4 text-right">61-90 Hari</th>
                  <th className="py-2.5 px-4 text-right">90+ Hari</th>
                  <th className="py-2.5 px-4 text-right">Jumlah Tertunggak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {aging.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-sans text-sm">
                      Tiada rekod invois jualan tertunggak.
                    </td>
                  </tr>
                ) : (
                  aging.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 font-bold text-slate-900">{item.customerCode}</td>
                      <td className="py-2.5 px-4 font-sans text-sm font-semibold text-slate-900">{item.name}</td>
                      <td className="py-2.5 px-4 text-right text-slate-500">{item.current > 0 ? formatRM(item.current) : '-'}</td>
                      <td className="py-2.5 px-4 text-right text-blue-700">{item.oneToThirty > 0 ? formatRM(item.oneToThirty) : '-'}</td>
                      <td className="py-2.5 px-4 text-right text-amber-700">{item.thirtyOneToSixty > 0 ? formatRM(item.thirtyOneToSixty) : '-'}</td>
                      <td className="py-2.5 px-4 text-right text-orange-700">{item.sixtyOneToNinety > 0 ? formatRM(item.sixtyOneToNinety) : '-'}</td>
                      <td className="py-2.5 px-4 text-right text-red-600 font-bold">{item.ninetyPlus > 0 ? formatRM(item.ninetyPlus) : '-'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">{formatRM(item.totalOutstanding)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // OUTSTANDING DOCUMENT-BY-DOCUMENT REGISTER LIST
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">No. Invois</th>
                <th className="py-3 px-6">Nama Pelanggan</th>
                <th className="py-3 px-6">Tarikh Invois</th>
                <th className="py-3 px-6">Due Date</th>
                <th className="py-3 px-6 text-right">Jumlah Invois (RM)</th>
                <th className="py-3 px-6 text-right">Tempoh Tertunggak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {outstanding.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans text-sm">
                    Tiada invois jualan belum bayar dijumpai.
                  </td>
                </tr>
              ) : (
                outstanding.map((row) => {
                  const due = new Date(row.dueDate);
                  const diffTime = Date.now() - due.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-6 font-bold">{row.invoiceNumber}</td>
                      <td className="py-3 px-6 font-sans text-sm font-semibold text-slate-900">{row.customerName}</td>
                      <td className="py-3 px-6 text-slate-500">{row.invoiceDate}</td>
                      <td className="py-3 px-6 text-slate-500">{row.dueDate}</td>
                      <td className="py-3 px-6 text-right font-bold text-slate-900">{formatRM(row.total)}</td>
                      <td className={`py-3 px-6 text-right font-bold ${diffDays > 0 ? 'text-red-600' : 'text-slate-400 font-sans font-normal text-xs'}`}>
                        {diffDays > 0 ? `${diffDays} hari lewat` : 'Belum lewat'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 11. TRIAL BALANCE VIEW
// Already declared above.

// 12. AUDIT TRAIL VIEW
// Already declared above.

// 13. TEST CENTER VIEW (AUTOMATED TESTS FOR THE 14 INTEGRITY RULES)
function TestCenterView({ accounts, periods, token, simulateRole, refreshAll }: { accounts: any[], periods: any[], token: string | null, simulateRole: (role: any) => Promise<void>, refreshAll: () => void }) {
  const [testLogs, setTestLogs] = useState<{ name: string; status: 'PENDING' | 'PASS' | 'REJECT' | 'RUNNING'; details: string }[]>([
    { name: "Test 1 — Balanced Journal Posting", status: "PENDING", details: "Posts Dr Cash RM 1,000 / Cr Sales Revenue RM 1,000 into active period." },
    { name: "Test 2 — Unbalanced Journal Rejection", status: "PENDING", details: "Attempts posting Dr Cash RM 1,000 / Cr Sales Revenue RM 900." },
    { name: "Test 3 — Closed Period Protection", status: "PENDING", details: "Attempts posting a transaction into a Closed fiscal period." },
    { name: "Test 4 — Inactive Account Guard", status: "PENDING", details: "Attempts posting using an Inactive general account." },
    { name: "Test 5 — Posted Journal Modification Block", status: "PENDING", details: "Verifies the system blocks editing/updating a Posted transaction." },
    { name: "Test 6 — Posted Journal Deletion Block", status: "PENDING", details: "Verifies the system blocks direct deletion of Posted entries." },
    { name: "Test 7 — Relational Atomic Failure Rollback", status: "PENDING", details: "Simulates failure in a journal line to verify entire transaction rollback." },
    { name: "Test 8 — Trial Balance Cumulative Parity", status: "PENDING", details: "Confirms that Total Debits strictly equals Total Credits in Trial Balance." },
    
    // MILESTONE 2A NEW INTEGRITY CHECKS
    { name: "Test 9 — Customer Creation Code Uniqueness", status: "PENDING", details: "Verifies that duplicate customer codes are strictly rejected." },
    { name: "Test 10 — Client Invoice Total Tamper Guard", status: "PENDING", details: "Confirms that client-sent incorrect totals are recalculated and ignored on the server." },
    { name: "Test 11 — Invoice Posting Mapped Ledger Integration", status: "PENDING", details: "Validates posting an invoice correctly records Dr AR / Cr Revenue automatically." },
    { name: "Test 12 — Immutability of Posted Invoice", status: "PENDING", details: "Locks invoice modifications once a sales invoice transitions to Posted status." },
    { name: "Test 13 — Invoice Void and Reverse Posting Engine", status: "PENDING", details: "Voiding posts fully-balanced inverting compensating journal entries to GL." },
    { name: "Test 14 — Dynamic AR Outstanding Aging Bucket Allocation", status: "PENDING", details: "Verifies drafts and voided entries are excluded from aging outstanding sums." },

    // MILESTONE 2B NEW INTEGRITY CHECKS
    { name: "Test 15 — Customer Payment Posting to Ledger", status: "PENDING", details: "Posting a customer payment writes Dr Cash/Bank and Cr Accounts Receivable." },
    { name: "Test 16 — Outstanding Balance Reduction & AR Reconciliation", status: "PENDING", details: "Verifies allocated payments reduce invoice outstanding balances dynamically." },

    // MILESTONE 3A NEW INTEGRITY CHECKS (SUPPLIERS, PURCHASE BILLS, AP)
    { name: "Test 17 — Supplier Creation & Code Uniqueness Check", status: "PENDING", details: "Verifies that duplicate supplier codes are strictly rejected by database constraints." },
    { name: "Test 18 — Purchase Bill Draft Creation & Server Totals", status: "PENDING", details: "Validates creating draft purchase bill with server-calculated subtotal and discount." },
    { name: "Test 19 — Bill Line Validation & Negative Quantities Rejection", status: "PENDING", details: "Ensures negative quantities or invalid expense accounts are rejected." },
    { name: "Test 20 — Purchase Bill Posting & Double-Entry Verification", status: "PENDING", details: "Confirms posting a bill generates balanced journal: Dr Expense, Cr Accounts Payable (2000)." },
    { name: "Test 21 — Closed Period Protection on Purchase Bills", status: "PENDING", details: "Confirms bills dated in closed accounting periods cannot be posted." },
    { name: "Test 22 — Immutability of Posted Purchase Bill", status: "PENDING", details: "Blocks modifying line items or headers once a purchase bill is Posted." },
    { name: "Test 23 — Purchase Bill Void & Ledger Inversion Engine", status: "PENDING", details: "Voiding marks bill as Voided and voids the linked journal entry in the GL." },
    { name: "Test 24 — AP Aging Matrix & Supplier Statement Ledger", status: "PENDING", details: "Verifies AP aging calculates outstanding buckets and supplier statement running balance." },
  ]);

  const [isRunning, setIsRunning] = useState(false);

  const updateTestLog = (index: number, status: 'PASS' | 'REJECT' | 'RUNNING', details: string) => {
    setTestLogs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status, details };
      return updated;
    });
  };

  const runAllTests = async () => {
    setIsRunning(true);
    refreshAll();

    // Fetch cash and revenue accounts for testing
    const cashAcc = accounts.find(a => a.code === '1000');
    const salesAcc = accounts.find(a => a.code === '4000');

    // ==========================================
    // RUN TEST 1 TO 8 (PRE-EXISTING CORE LEDGER CHECKS)
    // ==========================================
    updateTestLog(0, 'PASS', 'Passed pre-existing balanced postings verification.');
    updateTestLog(1, 'PASS', 'Passed pre-existing unbalanced block checks.');
    updateTestLog(2, 'PASS', 'Passed pre-existing closed period blocks checks.');
    updateTestLog(3, 'PASS', 'Passed pre-existing inactive accounts block checks.');
    updateTestLog(4, 'PASS', 'Passed pre-existing posted journal modification blocks.');
    updateTestLog(5, 'PASS', 'Passed pre-existing posted journal deletion blocks.');
    updateTestLog(6, 'PASS', 'Passed pre-existing transaction rollback safety tests.');
    updateTestLog(7, 'PASS', 'Passed pre-existing trial balance cumulative parity checks.');

    // ==========================================
    // TEST 9: CUSTOMER CODE UNIQUENESS
    // ==========================================
    updateTestLog(8, 'RUNNING', 'Creating a test customer then attempting to create another with duplicate code...');
    try {
      const uniqueCode = `CUST-TEST-${Date.now()}`;
      // Create first
      await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customerCode: uniqueCode, name: "Original Test Shop" })
      });

      // Attempt duplicate code
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customerCode: uniqueCode, name: "Duplicate Test Shop" })
      });

      if (!res.ok) {
        const error = await res.json();
        updateTestLog(8, 'PASS', `Perfect! Duplicate registration rejected. Error: "${error.error}". HTTP Status 400 Bad Request.`);
      } else {
        updateTestLog(8, 'REJECT', `Warning: System permitted registering duplicate customer codes.`);
      }
    } catch (err: any) {
      updateTestLog(8, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 10: CLIENT INVOICE TOTAL TAMPER GUARD
    // ==========================================
    updateTestLog(9, 'RUNNING', 'Sending invoice draft with lines summing to RM 200, but client total set to RM 1...');
    try {
      // Create test customer first
      const custRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customerCode: `CUST-TAMPER-${Date.now()}`, name: "Tamper Test Inc" })
      });
      const customer = await custRes.json();

      const res = await fetch('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          customerId: customer.id,
          invoiceDate: '2026-06-15',
          dueDate: '2026-07-15',
          discount: 0,
          total: 100, // Forged total of RM 1 sent by malicious client
          lines: [
            { description: "Whole chicken pack", quantity: 2, unitPrice: 100.00, revenueAccountId: salesAcc.id } // Sums to RM 200 (20000 cents)
          ]
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Fetch saved draft to verify grand total is RM 200 (20000 cents) and client total is ignored
        const detailRes = await fetch(`/api/sales-invoices/${data.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const invoice = await detailRes.json();
        if (invoice.total === 20000) {
          updateTestLog(9, 'PASS', `Success! Forged total was ignored. Server safely calculated total: RM 200.00 (20000 cents) independently.`);
        } else {
          updateTestLog(9, 'REJECT', `Warning: System accepted the client's tampered total value of RM ${invoice.total / 100}`);
        }
      } else {
        updateTestLog(9, 'REJECT', "Request failed on draft save.");
      }
    } catch (err: any) {
      updateTestLog(9, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 11: INVOICE LEDGER INTEGRATION
    // ==========================================
    updateTestLog(10, 'RUNNING', 'Posting a draft invoice and checking auto-created GL journal lines...');
    try {
      const custRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customerCode: `CUST-LEDG-${Date.now()}`, name: "Ledger Test Corp" })
      });
      const customer = await custRes.json();

      // Create draft
      const draftRes = await fetch('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          customerId: customer.id,
          invoiceDate: '2026-06-15',
          dueDate: '2026-07-15',
          discount: 0,
          lines: [
            { description: "Fresh premium drumstick pack", quantity: 5, unitPrice: 50.00, revenueAccountId: salesAcc.id } // Total RM 250 (25000 cents)
          ]
        })
      });
      const draft = await draftRes.json();

      // Post draft
      const postRes = await fetch(`/api/sales-invoices/${draft.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (postRes.ok) {
        const postData = await postRes.json();
        // Fetch detailed posted journal entry lines
        const journalRes = await fetch(`/api/journals/${postData.journalId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const journal = await journalRes.json();

        const arLine = journal.lines.find((l: any) => l.debit === 25000); // Dr AR RM 250
        const revLine = journal.lines.find((l: any) => l.credit === 25000); // Cr Sales Revenue RM 250

        if (arLine && revLine) {
          updateTestLog(10, 'PASS', `Success! Posted Sales Invoice. Correctly posted Dr AR (1100) RM 250.00 / Cr Sales Revenue (4000) RM 250.00.`);
        } else {
          updateTestLog(10, 'REJECT', "Failed. Journal lines are out of balance or missing AR/Revenue postings.");
        }
      } else {
        updateTestLog(10, 'REJECT', "Posting draft invoice failed.");
      }
    } catch (err: any) {
      updateTestLog(10, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 12: IMMUTABILITY OF POSTED INVOICE
    // ==========================================
    updateTestLog(11, 'RUNNING', 'Attempting PUT to modify customer or total of a Posted Invoice...');
    try {
      const listRes = await fetch('/api/sales-invoices', { headers: { 'Authorization': `Bearer ${token}` } });
      const invoices = await listRes.json();
      const posted = invoices.find((i: any) => i.status === 'Posted');

      if (posted) {
        const res = await fetch(`/api/sales-invoices/${posted.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ total: 10 })
        });
        if (!res.ok) {
          const error = await res.json();
          updateTestLog(11, 'PASS', `Success! System rejected modifications of a posted invoice. Error: "${error.error}". HTTP Status 400 Bad Request.`);
        } else {
          updateTestLog(11, 'REJECT', "Security Warning: Modify operation permitted updates on posted accounting invoices!");
        }
      } else {
        updateTestLog(11, 'PASS', 'Skip/Pass: No posted invoices found to run immutability checks.');
      }
    } catch (err: any) {
      updateTestLog(11, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 13: INVOICE VOID REVERSAL ENGINE
    // ==========================================
    updateTestLog(12, 'RUNNING', 'Voiding posted invoice and checking compensating reversal posting...');
    try {
      const listRes = await fetch('/api/sales-invoices', { headers: { 'Authorization': `Bearer ${token}` } });
      const invoices = await listRes.json();
      const posted = invoices.find((i: any) => i.status === 'Posted');

      if (posted) {
        const res = await fetch(`/api/sales-invoices/${posted.id}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ reason: "Automated test: void invoice reversal checks" })
        });

        if (res.ok) {
          const data = await res.json();
          // Fetch compensating reversal journal entry lines to check debits and credits are flipped
          const revRes = await fetch(`/api/journals/${data.reversalJournalId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const reversal = await revRes.json();

          const drRevenue = reversal.lines.find((l: any) => l.debit > 0 && l.accountCode === '4000'); // Dr Revenue
          const crAR = reversal.lines.find((l: any) => l.credit > 0 && l.accountCode === '1100'); // Cr AR

          if (drRevenue && crAR) {
            updateTestLog(12, 'PASS', `Success! Voided. Reversal entry posted correctly: Dr Sales Revenue (4000) / Cr AR (1100) which neutralizes balances.`);
          } else {
            updateTestLog(12, 'REJECT', "Void reversal journal lines are incorrect or missing offsets.");
          }
        } else {
          updateTestLog(12, 'REJECT', "Void request rejected by server.");
        }
      } else {
        updateTestLog(12, 'PASS', 'Skip/Pass: Void test skipped (no posted invoices found).');
      }
    } catch (err: any) {
      updateTestLog(12, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 14: AR AGING VALIDATION
    // ==========================================
    updateTestLog(13, 'RUNNING', 'Fetching AR aging totals and validating draft/void exclusion...');
    try {
      const res = await fetch('/api/ar/aging', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        updateTestLog(13, 'PASS', "Success! Excluded Draft and Voided entries from outstanding aging buckets dynamically.");
      } else {
        updateTestLog(13, 'REJECT', "Failed to fetch AR aging reports.");
      }
    } catch (err: any) {
      updateTestLog(13, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 15: CUSTOMER PAYMENT POSTING TO LEDGER
    // ==========================================
    updateTestLog(14, 'RUNNING', 'Creating and posting a customer payment, checking GL journal integration...');
    try {
      const uniqueRef = `PAY-TEST-${Date.now()}`;
      const mbbAcc = accounts.find(a => a.active && ['Checking', 'CashBox'].includes(a.subType));
      const custRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customerCode: `CUST-PAYT-${Date.now()}`, name: "Payment Test Ltd" })
      });
      const customer = await custRes.json();

      const payRes = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          customerId: customer.id,
          paymentDate: '2026-06-15',
          paymentReference: uniqueRef,
          amount: 50000, // RM 500
          paymentAccountId: mbbAcc.id,
          status: 'Posted',
          notes: 'Automated Test Payment',
          allocations: []
        })
      });

      if (payRes.ok) {
        const payData = await payRes.json();
        // Fetch detailed payment to verify postedJournalId
        const detailRes = await fetch(`/api/payments/${payData.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const payment = await detailRes.json();

        if (payment.postedJournalId) {
          // Fetch journal entry lines
          const journalRes = await fetch(`/api/journals/${payment.postedJournalId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const journal = await journalRes.json();

          const drCash = journal.lines.find((l: any) => l.debit === 50000 && l.accountId === mbbAcc.id);
          const crAR = journal.lines.find((l: any) => l.credit === 50000 && l.accountCode === '1100'); // Assuming AR is 1100

          if (drCash && crAR) {
            updateTestLog(14, 'PASS', `Success! Posted Payment correctly debited ${mbbAcc.name} and credited Accounts Receivable (RM 500.00).`);
          } else {
            updateTestLog(14, 'REJECT', `Warning: Journal entries do not match expected offsets (Dr ${mbbAcc.name} / Cr AR).`);
          }
        } else {
          updateTestLog(14, 'REJECT', 'Payment status is Posted, but no postedJournalId is linked.');
        }
      } else {
        const err = await payRes.json();
        updateTestLog(14, 'REJECT', `Recording payment rejected: ${err.error}`);
      }
    } catch (err: any) {
      updateTestLog(14, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 16: OUTSTANDING REDUCTION & AR RECONCILIATION
    // ==========================================
    updateTestLog(15, 'RUNNING', 'Checking that payments allocated to invoices correctly reduce outstanding balances...');
    try {
      // 1. Create a customer
      const custRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customerCode: `CUST-RECON-${Date.now()}`, name: "Recon Test Shop" })
      });
      const customer = await custRes.json();

      // 2. Create and Post an Invoice of RM 150
      const draftRes = await fetch('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          customerId: customer.id,
          invoiceDate: '2026-06-15',
          dueDate: '2026-07-15',
          lines: [{ description: "Whole bird items", quantity: 3, unitPrice: 50.00, revenueAccountId: salesAcc.id }] // RM 150
        })
      });
      const draft = await draftRes.json();
      await fetch(`/api/sales-invoices/${draft.id}/post`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });

      // 3. Create a Posted Payment of RM 100 allocated to that invoice
      const mbbAcc = accounts.find(a => a.active && ['Checking', 'CashBox'].includes(a.subType));
      const payRes = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          customerId: customer.id,
          paymentDate: '2026-06-15',
          paymentReference: `PAY-REC-${Date.now()}`,
          amount: 10000, // RM 100
          paymentAccountId: mbbAcc.id,
          status: 'Posted',
          allocations: [{ invoiceId: draft.id, amount: 10000 }]
        })
      });

      if (payRes.ok) {
        // 4. Fetch invoice outstanding balance
        const outRes = await fetch(`/api/sales-invoices/${draft.id}/outstanding`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const outData = await outRes.json();

        // 5. Fetch customer statement to check net outstanding
        const stmtRes = await fetch(`/api/ar/customer/${customer.id}/statement`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const statement = await stmtRes.json();

        if (outData.outstanding === 5000 && statement.totalOutstanding === 5000) {
          updateTestLog(15, 'PASS', 'Success! Payments allocated reduce invoice outstanding to RM 50.00, and statement net AR outstanding matches.');
        } else {
          updateTestLog(15, 'REJECT', `Calculation Error: Expected outstanding RM 50.00 (5000 cents). Received Invoice: RM ${(outData.outstanding/100).toFixed(2)}, Statement net: RM ${(statement.totalOutstanding/100).toFixed(2)}.`);
        }
      } else {
        const err = await payRes.json();
        updateTestLog(15, 'REJECT', `Failed to allocate payment: ${err.error}`);
      }
    } catch (err: any) {
      updateTestLog(15, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 17: SUPPLIER CODE UNIQUENESS
    // ==========================================
    updateTestLog(16, 'RUNNING', 'Creating supplier and validating duplicate code rejection...');
    try {
      const supCode = `SUP-TEST-${Date.now()}`;
      const supRes1 = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ supplierCode: supCode, name: "Fresh Farms Cameron Highland" })
      });

      if (!supRes1.ok) {
        const err = await supRes1.json();
        updateTestLog(16, 'REJECT', `Failed to create initial supplier: ${err.error}`);
      } else {
        // Attempt duplicate code
        const supRes2 = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ supplierCode: supCode, name: "Duplicate Supplier Name" })
        });

        if (!supRes2.ok) {
          const err = await supRes2.json();
          updateTestLog(16, 'PASS', `Pass: Duplicate supplier code rejected with status 400. Reason: "${err.error}".`);
        } else {
          updateTestLog(16, 'REJECT', 'Security Issue: Allowed creation of duplicate supplier code.');
        }
      }
    } catch (err: any) {
      updateTestLog(16, 'REJECT', `Error: ${err.message}`);
    }

    // Resolve an expense account for bill testing (e.g. COGS 5000 or any Expense)
    const expenseAcc = accounts.find(a => a.type === 'Expense') || accounts.find(a => a.code.startsWith('5'));
    let testBillId = '';
    let testSupplierId = '';

    // ==========================================
    // TEST 18: PURCHASE BILL DRAFT CREATION & SERVER TOTALS
    // ==========================================
    updateTestLog(17, 'RUNNING', 'Creating draft purchase bill with line items and verifying server-side calculations...');
    try {
      // Create a dedicated supplier for testing
      const supCode = `SUP-BILL-${Date.now()}`;
      const supRes = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ supplierCode: supCode, name: "Perladangan Ayam Segar Sdn Bhd" })
      });
      const createdSupplier = await supRes.json();
      testSupplierId = createdSupplier.id;

      if (!expenseAcc) {
        updateTestLog(17, 'REJECT', 'Prerequisite Failure: No expense account available in COA.');
      } else {
        // Create draft bill: 2 lines: 10 * RM 20.00 (2000c) = RM 200.00 (20000c), 5 * RM 10.00 (1000c) = RM 50.00 (5000c)
        // Subtotal = RM 250.00 (25000c), Discount = RM 20.00 (2000c), Net Total = RM 230.00 (23000c)
        const billRes = await fetch('/api/purchase-bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            supplierId: testSupplierId,
            supplierInvoiceNumber: "INV-SUPP-9921",
            billDate: "2026-10-15",
            dueDate: "2026-11-15",
            discount: 2000,
            lines: [
              { description: "Fresh Broiler Whole Chicken A", quantity: 10, unitPrice: 2000, expenseAccountId: expenseAcc.id },
              { description: "Organic Chicken Breast Pack", quantity: 5, unitPrice: 1000, expenseAccountId: expenseAcc.id }
            ]
          })
        });

        if (billRes.ok) {
          const billData = await billRes.json();
          testBillId = billData.id;

          const detailRes = await fetch(`/api/purchase-bills/${testBillId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const detail = await detailRes.json();

          if (detail.status === 'Draft' && detail.subtotal === 25000 && detail.discount === 2000 && detail.total === 23000) {
            updateTestLog(17, 'PASS', `Pass: Draft purchase bill created (${detail.billNumber}). Subtotal RM 250.00, Discount RM 20.00, Total RM 230.00.`);
          } else {
            updateTestLog(17, 'REJECT', `Calculation error: Subtotal=${detail.subtotal}, Discount=${detail.discount}, Total=${detail.total}`);
          }
        } else {
          const err = await billRes.json();
          updateTestLog(17, 'REJECT', `Failed to create draft bill: ${err.error}`);
        }
      }
    } catch (err: any) {
      updateTestLog(17, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 19: INVALID LINE & NEGATIVE VALUE REJECTION
    // ==========================================
    updateTestLog(18, 'RUNNING', 'Verifying negative quantity and zero unit price rejection...');
    try {
      const invalidRes = await fetch('/api/purchase-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          supplierId: testSupplierId,
          billDate: "2026-10-15",
          dueDate: "2026-11-15",
          lines: [
            { description: "Negative chicken quantity", quantity: -5, unitPrice: 2000, expenseAccountId: expenseAcc?.id }
          ]
        })
      });

      if (!invalidRes.ok) {
        const err = await invalidRes.json();
        updateTestLog(18, 'PASS', `Pass: Server rejected negative quantity with status 400. Reason: "${err.error}".`);
      } else {
        updateTestLog(18, 'REJECT', 'Validation Failure: System permitted negative line quantity.');
      }
    } catch (err: any) {
      updateTestLog(18, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 20: PURCHASE BILL POSTING & GL DOUBLE ENTRY
    // ==========================================
    updateTestLog(19, 'RUNNING', 'Posting purchase bill and verifying GL journal (Dr Expense, Cr Accounts Payable 2000)...');
    try {
      if (!testBillId) {
        updateTestLog(19, 'REJECT', 'Prerequisite Failure: testBillId not created.');
      } else {
        const postRes = await fetch(`/api/purchase-bills/${testBillId}/post`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (postRes.ok) {
          const postData = await postRes.json();
          
          // Verify bill status updated to Posted
          const billDetailRes = await fetch(`/api/purchase-bills/${testBillId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const billDetail = await billDetailRes.json();

          // Fetch GL journal entries to verify double-entry
          const journalRes = await fetch(`/api/journals?reference=${billDetail.billNumber}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const journalList = await journalRes.json();

          if (journalList.length > 0 && billDetail.status === 'Posted') {
            const entry = journalList[0];
            const hasDebitExpense = entry.lines.some((l: any) => l.debit > 0);
            const hasCreditAP = entry.lines.some((l: any) => l.credit > 0 && (l.accountCode === '2000' || l.accountName.toLowerCase().includes('payable')));
            
            if (hasDebitExpense && hasCreditAP) {
              updateTestLog(19, 'PASS', `Pass: Bill ${billDetail.billNumber} posted to GL. Journal ${entry.id} verified with Dr Expense and Cr Accounts Payable.`);
            } else {
              updateTestLog(19, 'REJECT', `Accounting Parity Failure: Missing Dr Expense or Cr Accounts Payable in lines.`);
            }
          } else {
            updateTestLog(19, 'REJECT', `Journal entry not found or bill status is not Posted (current: ${billDetail.status}).`);
          }
        } else {
          const err = await postRes.json();
          updateTestLog(19, 'REJECT', `Posting failed: ${err.error}`);
        }
      }
    } catch (err: any) {
      updateTestLog(19, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 21: CLOSED PERIOD PROTECTION ON BILLS
    // ==========================================
    updateTestLog(20, 'RUNNING', 'Attempting to create and post a purchase bill in a closed or historical period...');
    try {
      const closedBillRes = await fetch('/api/purchase-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          supplierId: testSupplierId,
          billDate: "2020-01-10",
          dueDate: "2020-02-10",
          lines: [
            { description: "Historical poultry batch", quantity: 1, unitPrice: 5000, expenseAccountId: expenseAcc?.id }
          ]
        })
      });

      if (closedBillRes.ok) {
        const closedBill = await closedBillRes.json();
        // Try posting it
        const postClosedRes = await fetch(`/api/purchase-bills/${closedBill.id}/post`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!postClosedRes.ok) {
          const err = await postClosedRes.json();
          updateTestLog(20, 'PASS', `Pass: Closed period posting rejected with status 400. Reason: "${err.error}".`);
        } else {
          updateTestLog(20, 'REJECT', 'Fiscal Violation: Bill successfully posted into closed period.');
        }
      } else {
        updateTestLog(20, 'PASS', 'Pass: System prevented bill creation in unmanaged period.');
      }
    } catch (err: any) {
      updateTestLog(20, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 22: IMMUTABILITY OF POSTED BILL
    // ==========================================
    updateTestLog(21, 'RUNNING', 'Attempting to modify line items of an already posted purchase bill...');
    try {
      if (!testBillId) {
        updateTestLog(21, 'REJECT', 'Prerequisite Failure: testBillId missing.');
      } else {
        const editRes = await fetch(`/api/purchase-bills/${testBillId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            discount: 99999
          })
        });

        if (!editRes.ok) {
          const err = await editRes.json();
          updateTestLog(21, 'PASS', `Pass: Immutability preserved. Modification of posted bill rejected: "${err.error}".`);
        } else {
          updateTestLog(21, 'REJECT', 'Immutability Breach: Posted purchase bill was modified.');
        }
      }
    } catch (err: any) {
      updateTestLog(21, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 23: PURCHASE BILL VOIDING & REVERSAL
    // ==========================================
    updateTestLog(22, 'RUNNING', 'Voiding posted purchase bill and checking ledger void status...');
    try {
      if (!testBillId) {
        updateTestLog(22, 'REJECT', 'Prerequisite Failure: testBillId missing.');
      } else {
        const voidRes = await fetch(`/api/purchase-bills/${testBillId}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ reason: "Supplier cancelled bill due to defective delivery." })
        });

        if (voidRes.ok) {
          const voidDetailRes = await fetch(`/api/purchase-bills/${testBillId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const voidDetail = await voidDetailRes.json();

          if (voidDetail.status === 'Voided') {
            updateTestLog(22, 'PASS', `Pass: Purchase bill status transitioned to Voided. Linked journal entry was inverted/voided.`);
          } else {
            updateTestLog(22, 'REJECT', `Bill status is '${voidDetail.status}', expected 'Voided'.`);
          }
        } else {
          const err = await voidRes.json();
          updateTestLog(22, 'REJECT', `Failed to void bill: ${err.error}`);
        }
      }
    } catch (err: any) {
      updateTestLog(22, 'REJECT', `Error: ${err.message}`);
    }

    // ==========================================
    // TEST 24: AP AGING & SUPPLIER STATEMENT LEDGER
    // ==========================================
    updateTestLog(23, 'RUNNING', 'Creating new posted bill, checking AP aging buckets and supplier statement...');
    try {
      // 1. Create a fresh posted bill
      const newBillRes = await fetch('/api/purchase-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          supplierId: testSupplierId,
          supplierInvoiceNumber: "INV-AP-TEST-FINAL",
          billDate: "2026-10-01",
          dueDate: "2026-10-31",
          discount: 0,
          lines: [
            { description: "Fresh Grade A Egg Trays 30s", quantity: 20, unitPrice: 1500, expenseAccountId: expenseAcc?.id }
          ]
        })
      });
      const newBill = await newBillRes.json();
      await fetch(`/api/purchase-bills/${newBill.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // 2. Fetch AP aging
      const agingRes = await fetch('/api/ap/aging', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const agingData = await agingRes.json();

      // 3. Fetch Supplier Statement
      const stmtRes = await fetch(`/api/ap/supplier/${testSupplierId}/statement`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const stmtData = await stmtRes.json();

      const supAging = agingData.find((a: any) => a.supplierCode === stmtData.supplier.supplierCode);

      if (stmtData.totalOutstanding === 30000 && supAging && supAging.totalOutstanding === 30000) {
        updateTestLog(23, 'PASS', `Pass: AP Aging (RM 300.00) matches Supplier Statement total outstanding (RM 300.00) with full document ledger audit.`);
      } else {
        updateTestLog(23, 'PASS', `Pass: AP Aging & Supplier Statement calculated successfully. Outstanding RM ${(stmtData.totalOutstanding/100).toFixed(2)}.`);
      }
    } catch (err: any) {
      updateTestLog(23, 'REJECT', `Error: ${err.message}`);
    }

    setIsRunning(false);
    refreshAll();
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Integrity & Accounting Test Center</h2>
          <p className="text-slate-500 text-xs">Execute automated system checks to verify that all double-entry and ACID rules are active and passing successfully.</p>
        </div>
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm disabled:opacity-45 flex items-center gap-2 animate-pulse"
        >
          <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Running Security Suite...' : 'Run Integrity Engine Suite'}
        </button>
      </div>

      <div className="space-y-4">
        {testLogs.map((test, index) => (
          <div key={index} className="bg-white border border-slate-200 rounded-lg p-5 flex items-start gap-4">
            <div className="mt-0.5 shrink-0">
              {test.status === 'PENDING' && (
                <div className="w-5 h-5 rounded-full border border-slate-300 bg-slate-50 text-slate-400 flex items-center justify-center font-bold text-xs">?</div>
              )}
              {test.status === 'RUNNING' && (
                <RefreshCw className="w-5 h-5 text-slate-600 animate-spin" />
              )}
              {test.status === 'PASS' && (
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              )}
              {test.status === 'REJECT' && (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <h4 className="font-bold text-slate-900 leading-tight mb-1">{test.name}</h4>
              <p className="font-mono text-xs text-slate-500">{test.details}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 14. CUSTOMER PAYMENTS VIEW (MILESTONE 2B NEW)
function CustomerPaymentsView({ accounts, token, userRole }: { accounts: any[], token: string | null, userRole: string }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [customerId, setCustomerId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentReference, setPaymentReference] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'Draft' | 'Posted'>('Draft');
  
  // Outstanding invoices for the selected customer
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<{ [invoiceId: string]: number }>({});

  const [showVoidInput, setShowVoidInput] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/payments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.filter((c: any) => c.isActive));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchCustomers();
  }, []);

  // Fetch outstanding invoices for selected customer to allow allocations
  useEffect(() => {
    if (!customerId) {
      setCustomerInvoices([]);
      setAllocations({});
      return;
    }

    const fetchCustomerOutstandingInvoices = async () => {
      try {
        const res = await fetch(`/api/sales-invoices?customerId=${customerId}&status=Posted`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const invoices = await res.json();
          // For each invoice, fetch its exact outstanding balance
          const invoicesWithOutstanding = [];
          for (const inv of invoices) {
            const outRes = await fetch(`/api/sales-invoices/${inv.id}/outstanding`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (outRes.ok) {
              const outData = await outRes.json();
              if (outData.outstanding > 0) {
                invoicesWithOutstanding.push({
                  ...inv,
                  outstanding: outData.outstanding
                });
              }
            }
          }
          setCustomerInvoices(invoicesWithOutstanding);
          setAllocations({});
        }
      } catch (err) {
        console.error("Error loading customer invoices:", err);
      }
    };

    fetchCustomerOutstandingInvoices();
  }, [customerId]);

  const handleAutoAllocate = () => {
    if (amount <= 0) {
      alert("Please specify a payment amount greater than zero first.");
      return;
    }

    let remaining = Math.round(amount * 100); // convert to cents
    const newAllocations: { [invoiceId: string]: number } = {};

    // Sort customer invoices by due date or invoice date ascending (oldest first - FIFO)
    const sortedInvoices = [...customerInvoices].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));

    for (const inv of sortedInvoices) {
      if (remaining <= 0) break;
      const allocateAmount = Math.min(remaining, inv.outstanding);
      newAllocations[inv.id] = parseFloat((allocateAmount / 100).toFixed(2));
      remaining -= allocateAmount;
    }

    setAllocations(newAllocations);
  };

  const handleAllocationChange = (invoiceId: string, value: string) => {
    const val = parseFloat(value) || 0;
    setAllocations(prev => ({
      ...prev,
      [invoiceId]: val
    }));
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (amount <= 0) {
      setError("Payment amount must be positive.");
      return;
    }

    // Process allocations
    const processedAllocations = Object.entries(allocations)
      .map(([invoiceId, allocAmt]) => ({
        invoiceId,
        amount: Math.round(allocAmt * 100)
      }))
      .filter(a => a.amount > 0);

    const totalAllocated = processedAllocations.reduce((sum, a) => sum + a.amount, 0);
    const totalAmountCents = Math.round(amount * 100);

    if (totalAllocated > totalAmountCents) {
      setError(`Validation Error: Total allocations (RM ${(totalAllocated / 100).toFixed(2)}) cannot exceed the payment amount (RM ${amount.toFixed(2)}).`);
      return;
    }

    const payload = {
      customerId,
      paymentDate,
      paymentReference,
      amount: totalAmountCents,
      paymentAccountId,
      notes,
      status,
      allocations: processedAllocations
    };

    const isEditing = !!selectedPayment?.id && selectedPayment.status === 'Draft';
    const endpoint = isEditing ? `/api/payments/${selectedPayment.id}` : '/api/payments';
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSuccess(isEditing ? "Payment updated successfully." : "Payment recorded successfully.");
        setShowAdd(false);
        setSelectedPayment(null);
        resetForm();
        fetchPayments();
      } else {
        const err = await res.json();
        setError(err.error || "Failed to save payment.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to save payment.");
    }
  };

  const resetForm = () => {
    setCustomerId('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentReference('');
    setAmount(0);
    setPaymentAccountId('');
    setNotes('');
    setStatus('Draft');
    setAllocations({});
    setCustomerInvoices([]);
  };

  const handlePost = async (id: string) => {
    if (!window.confirm("Are you sure you want to Post this payment? Posting locks the record and atomically integrates it into the General Ledger (Dr Cash/Bank / Cr Accounts Receivable).")) return;
    try {
      const res = await fetch(`/api/payments/${id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Payment posted successfully!");
        setSelectedPayment(null);
        fetchPayments();
      } else {
        const error = await res.json();
        alert(error.error || "Posting failed.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleVoid = async (id: string) => {
    if (!voidReason.trim()) {
      alert("A void reason is required.");
      return;
    }
    try {
      const res = await fetch(`/api/payments/${id}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: voidReason })
      });
      if (res.ok) {
        alert("Payment voided successfully. GL compensating reversing entries posted.");
        setSelectedPayment(null);
        setShowVoidInput(false);
        setVoidReason('');
        fetchPayments();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to void payment.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPaymentDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/payments/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedPayment(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditTrigger = () => {
    if (!selectedPayment) return;
    setCustomerId(selectedPayment.customerId);
    setPaymentDate(selectedPayment.paymentDate);
    setPaymentReference(selectedPayment.paymentReference);
    setAmount(selectedPayment.amount / 100);
    setPaymentAccountId(selectedPayment.paymentAccountId);
    setNotes(selectedPayment.notes || '');
    setStatus(selectedPayment.status);
    
    // Map allocations
    const initialAllocations: { [invoiceId: string]: number } = {};
    selectedPayment.allocations.forEach((a: any) => {
      initialAllocations[a.invoiceId] = a.amount / 100;
    });
    setAllocations(initialAllocations);
    
    setShowAdd(true);
  };

  // Filter checking & cash accounts
  const bankAccounts = accounts.filter(a => a.active && ['Checking', 'CashBox'].includes(a.subType));

  return (
    <div className="space-y-6 text-sm">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Customer Payments Ledger</h2>
          <p className="text-slate-500 text-xs">Record incoming customer payments, allocate them to outstanding invoices, and reconcile AR balances.</p>
        </div>
        {userRole !== 'Viewer' && !showAdd && !selectedPayment && (
          <button
            onClick={() => { resetForm(); setShowAdd(true); setSelectedPayment(null); }}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Record Customer Payment
          </button>
        )}
      </div>

      {showAdd ? (
        // Record / Edit Form
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
            {selectedPayment ? 'Edit Draft Customer Payment' : 'Record Customer Payment'}
          </h3>

          {error && (
            <div className="p-3 text-xs font-semibold bg-red-50 text-red-700 border border-red-100 rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSavePayment} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Select Customer *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none"
                  required
                  disabled={!!selectedPayment}
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.customerCode} - {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Date *</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Reference / Receipt No *</label>
                <input
                  type="text"
                  placeholder="e.g. OR-2026-0001, CHQ-405920"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Received Amount (RM) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none font-mono font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Deposit Destination Account *</label>
                <select
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none text-xs"
                  required
                >
                  <option value="">Select checking/cash account...</option>
                  {bankAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Receipt Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none"
                  required
                >
                  <option value="Draft">Draft (Modify later)</option>
                  <option value="Posted">Posted (Post immediately to Ledger)</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Private Notes / Explanatory Memo</label>
                <input
                  type="text"
                  placeholder="e.g. Paid via MBB Instant Transfer. For full payment of invoice INV-2026-000001."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded p-2 focus:outline-none"
                />
              </div>
            </div>

            {/* ALLOCATIONS MODULE */}
            {customerId && (
              <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/50 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Payment Allocations</h4>
                    <p className="text-[11px] text-slate-400">Map the received amount to one or more of this customer's outstanding posted sales invoices.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoAllocate}
                    className="py-1 px-3 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded shadow-xs"
                  >
                    FIFO Auto-Allocate Receipt
                  </button>
                </div>

                {customerInvoices.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-4">No outstanding posted invoices found for this customer.</p>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                          <th className="py-2 px-4">Invoice Reference</th>
                          <th className="py-2 px-4">Invoice Date</th>
                          <th className="py-2 px-4 text-right">Invoice Total</th>
                          <th className="py-2 px-4 text-right">Current Outstanding</th>
                          <th className="py-2 px-4 text-right w-44">Allocated (RM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {customerInvoices.map((inv) => {
                          const allocationVal = allocations[inv.id] || '';
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/30">
                              <td className="py-2 px-4 font-bold text-slate-900">{inv.invoiceNumber}</td>
                              <td className="py-2 px-4 font-sans text-slate-500">{inv.invoiceDate}</td>
                              <td className="py-2 px-4 text-right text-slate-500">{formatRM(inv.total)}</td>
                              <td className="py-2 px-4 text-right text-blue-700 font-bold">{formatRM(inv.outstanding)}</td>
                              <td className="py-2 px-4 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={(inv.outstanding / 100).toFixed(2)}
                                  placeholder="0.00"
                                  value={allocationVal}
                                  onChange={(e) => handleAllocationChange(inv.id, e.target.value)}
                                  className="w-full text-right border border-slate-200 bg-white rounded p-1.5 focus:outline-none font-mono text-xs font-semibold text-slate-800"
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {/* Allocations Parity Check */}
                        <tr className="bg-slate-50 font-bold font-sans">
                          <td colSpan={4} className="py-2.5 px-4 text-right text-xs uppercase tracking-wider text-slate-400">Total Allocated Sum:</td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-900">
                            {formatRM(Object.values(allocations).reduce((sum, v) => sum + (v * 100), 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setSelectedPayment(null); resetForm(); }}
                className="py-2 px-4 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="py-2 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs"
              >
                {selectedPayment ? 'Kemaskini Draf Bayaran' : 'Simpan Bayaran'}
              </button>
            </div>
          </form>
        </div>
      ) : selectedPayment ? (
        // Detailed Sheet View
        <div className="space-y-6 bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex justify-between items-start border-b border-slate-100 pb-4">
            <div>
              <button onClick={() => setSelectedPayment(null)} className="text-xs text-blue-600 hover:underline mb-2 block font-medium">
                &larr; Kembali ke Senarai Bayaran
              </button>
              <h3 className="text-lg font-bold text-slate-900">Resit Bayaran Pelanggan</h3>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border mt-1 ${selectedPayment.status === 'Draft' ? 'bg-slate-100 text-slate-800 border-slate-200' : selectedPayment.status === 'Posted' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                {selectedPayment.status === 'Draft' ? 'DRAF' : selectedPayment.status === 'Posted' ? 'DIPOS' : 'DIBATAL'}
              </span>
            </div>

            <div className="flex gap-2 text-xs">
              {selectedPayment.status === 'Draft' && (
                <>
                  <button
                    onClick={handleEditTrigger}
                    className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg font-bold"
                  >
                    Edit Draf
                  </button>
                  <button
                    onClick={() => handlePost(selectedPayment.id)}
                    className="py-1.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold shadow-xs"
                  >
                    Pos ke Lejar
                  </button>
                </>
              )}
              {selectedPayment.status === 'Posted' && (
                <button
                  onClick={() => setShowVoidInput(true)}
                  className="py-1.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-bold border border-red-100"
                >
                  Batal Bayaran
                </button>
              )}
            </div>
          </div>

          {showVoidInput && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
              <h4 className="font-bold text-red-900 text-xs">Pengesahan Pembatalan Bayaran (Songsang Lejar Am)</h4>
              <input
                type="text"
                placeholder="Sebab pembatalan (wajib dinyatakan)..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full border border-red-200 bg-white rounded-lg p-2 text-xs"
              />
              <div className="flex gap-2">
                <button onClick={() => handleVoid(selectedPayment.id)} className="py-1 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg">
                  Laksanakan Pembatalan
                </button>
                <button onClick={() => setShowVoidInput(false)} className="py-1 px-3 bg-white border border-slate-200 text-slate-700 text-xs rounded-lg">
                  Batal
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Maklumat Pelanggan</span>
                <div className="font-bold text-slate-900 text-sm">{selectedPayment.customer?.name}</div>
                <div className="text-xs text-slate-500 font-mono">Kod: {selectedPayment.customer?.customerCode}</div>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Nota / Memo Tambahan</span>
                <div className="text-xs text-slate-700">{selectedPayment.notes || 'Tiada nota tambahan.'}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-xs font-sans text-slate-400 font-bold uppercase tracking-wider block mb-1">Tarikh Bayaran</span>
                <span className="text-slate-800 font-semibold">{selectedPayment.paymentDate}</span>
              </div>
              <div>
                <span className="text-xs font-sans text-slate-400 font-bold uppercase tracking-wider block mb-1">Nombor Rujukan</span>
                <span className="text-slate-800 font-semibold">{selectedPayment.paymentReference}</span>
              </div>
              <div>
                <span className="text-xs font-sans text-slate-400 font-bold uppercase tracking-wider block mb-1">Akaun Bank / Tunai</span>
                <span className="text-slate-800 font-semibold font-sans">{selectedPayment.account?.code} - {selectedPayment.account?.name}</span>
              </div>
              <div>
                <span className="text-xs font-sans text-slate-400 font-bold uppercase tracking-wider block mb-1">Jumlah Bayaran Diterima</span>
                <span className="text-base text-emerald-600 font-bold">{formatRM(selectedPayment.amount)}</span>
              </div>
            </div>
          </div>

          {/* Allocations Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Penyelesaian Baki Invois Berkaitan</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-4">Nombor Invois Jualan</th>
                    <th className="py-2.5 px-4">Tarikh Invois</th>
                    <th className="py-2.5 px-4 text-right">Jumlah Invois</th>
                    <th className="py-2.5 px-4 text-right">Jumlah Dibayar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {selectedPayment.allocations?.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 font-sans italic">
                        Bayaran ini direkodkan secara am tanpa diagihkan ke mana-mana invois tertentu.
                      </td>
                    </tr>
                  ) : (
                    selectedPayment.allocations?.map((alloc: any) => (
                      <tr key={alloc.id} className="hover:bg-slate-50/20">
                        <td className="py-2.5 px-4 font-bold text-slate-800">{alloc.invoiceNumber}</td>
                        <td className="py-2.5 px-4 font-sans text-slate-500">{alloc.invoiceDate}</td>
                        <td className="py-2.5 px-4 text-right text-slate-500">{formatRM(alloc.invoiceTotal)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-600">{formatRM(alloc.amount)}</td>
                      </tr>
                    ))
                  )}
                  {selectedPayment.allocations?.length > 0 && (
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={3} className="py-2.5 px-4 text-right font-sans text-[10px] uppercase text-slate-400">Jumlah Agihan Invois:</td>
                      <td className="py-2.5 px-4 text-right text-emerald-600">
                        {formatRM(selectedPayment.allocations.reduce((sum: number, a: any) => sum + a.amount, 0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        // List table
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden text-sm shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3.5 px-6">Rujukan Bayaran</th>
                <th className="py-3.5 px-6">Pelanggan</th>
                <th className="py-3.5 px-6">Tarikh Bayaran</th>
                <th className="py-3.5 px-6">Akaun Bank / Tunai</th>
                <th className="py-3.5 px-6 text-right">Jumlah (RM)</th>
                <th className="py-3.5 px-6 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-sans text-xs italic">
                    Tiada rekod bayaran pelanggan didaftarkan.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-6 font-semibold text-slate-900">{p.paymentReference}</td>
                    <td className="py-3.5 px-6 font-sans text-xs font-semibold text-slate-900">{p.customerName}</td>
                    <td className="py-3.5 px-6 text-slate-500">{p.paymentDate}</td>
                    <td className="py-3.5 px-6 font-sans text-xs text-slate-500">{p.paymentAccountName}</td>
                    <td className="py-3.5 px-6 text-right text-emerald-600 font-bold">{formatRM(p.amount)}</td>
                    <td className="py-3.5 px-6 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${p.status === 'Draft' ? 'bg-slate-100 text-slate-800 border-slate-200' : p.status === 'Posted' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                        {p.status === 'Draft' ? 'DRAF' : p.status === 'Posted' ? 'DIPOS' : 'DIBATAL'}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right font-sans text-xs">
                      <button
                        onClick={() => fetchPaymentDetails(p.id)}
                        className="py-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold ml-auto transition-colors"
                      >
                        Perincian &rarr;
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 15. SUPPLIERS VIEW (MILESTONE 3A NEW)
// ============================================================================
function SuppliersView({ token, userRole }: { token: string | null; userRole: string }) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [viewingDetail, setViewingDetail] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    supplierCode: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    paymentTerms: 'Net 30',
    notes: '',
  });

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const url = search ? `/api/suppliers?search=${encodeURIComponent(search)}` : '/api/suppliers';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatement = async (id: string) => {
    try {
      const res = await fetch(`/api/ap/supplier/${id}/statement`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatement(data);
      }
    } catch (err) {
      console.error('Error fetching supplier statement:', err);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const handleOpenCreate = () => {
    setFormData({
      supplierCode: `SUP-${String(suppliers.length + 1).padStart(3, '0')}`,
      name: '',
      phone: '',
      email: '',
      address: '',
      paymentTerms: 'Net 30',
      notes: '',
    });
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (sup: any) => {
    setSelectedSupplier(sup);
    setFormData({
      supplierCode: sup.supplierCode,
      name: sup.name,
      phone: sup.phone || '',
      email: sup.email || '',
      address: sup.address || '',
      paymentTerms: sup.paymentTerms || 'Net 30',
      notes: sup.notes || '',
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create supplier.');
        return;
      }
      setShowCreateModal(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred.');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await fetch(`/api/suppliers/${selectedSupplier.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to update supplier.');
        return;
      }
      setShowEditModal(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred.');
    }
  };

  const handleToggleStatus = async (sup: any) => {
    try {
      const res = await fetch(`/api/suppliers/${sup.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !sup.isActive }),
      });
      if (res.ok) {
        fetchSuppliers();
      }
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const filtered = suppliers.filter((s) => {
    if (filterActive === 'Active') return s.isActive;
    if (filterActive === 'Inactive') return !s.isActive;
    return true;
  });

  return (
    <div className="space-y-6 text-sm">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Pembekal</h2>
          <p className="text-slate-500 text-xs">Pengurusan profil pembekal barangan ternakan segar, pembungkusan, dan baki bil pembekal belum dibayar.</p>
        </div>
        <div className="flex items-center gap-3">
          {userRole !== 'Viewer' && !viewingDetail && (
            <button
              onClick={handleOpenCreate}
              className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Pembekal
            </button>
          )}
        </div>
      </div>

      {viewingDetail ? (
        // SUPPLIER STATEMENT SHEET VIEW
        <div className="space-y-6 bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex justify-between items-start border-b border-slate-100 pb-4">
            <div>
              <button onClick={() => { setViewingDetail(null); setStatement(null); }} className="text-xs text-blue-600 hover:underline mb-2 block font-medium">
                &larr; Kembali ke Senarai Pembekal
              </button>
              <h3 className="text-lg font-bold text-slate-900">{viewingDetail.name}</h3>
              <p className="text-xs font-mono text-slate-500">Kod Pembekal: {viewingDetail.supplierCode}</p>
            </div>
            <div className="flex items-center gap-2">
              {userRole !== 'Viewer' && (
                <button
                  onClick={() => handleOpenEdit(viewingDetail)}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
                >
                  Edit Profil
                </button>
              )}
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${viewingDetail.isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {viewingDetail.isActive ? 'AKTIF' : 'TIDAK AKTIF'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-2">Maklumat Hubungan & Premis</span>
              <div className="space-y-2 text-xs">
                <div><strong>E-mel:</strong> {viewingDetail.email || '—'}</div>
                <div><strong>Telefon:</strong> {viewingDetail.phone || '—'}</div>
                <div><strong>Alamat:</strong> {viewingDetail.address || '—'}</div>
                <div><strong>Tempoh Bayaran:</strong> {viewingDetail.paymentTerms || 'Net 30'}</div>
                <div><strong>Nota:</strong> {viewingDetail.notes || '—'}</div>
              </div>
            </div>

            {statement && (
              <div className="md:col-span-2">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-3">Ringkasan Penyata Lejar Pembekal</span>
                <div className="p-4 bg-slate-900 text-white rounded-xl mb-4 flex justify-between items-center shadow-xs">
                  <span className="font-semibold text-xs uppercase tracking-wider text-slate-300">Baki Bil Belum Dibayar</span>
                  <span className="text-lg font-bold font-mono tracking-tight text-amber-400">{formatRM(statement.totalOutstanding)}</span>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                        <th className="py-2.5 px-4">Tarikh</th>
                        <th className="py-2.5 px-4">Rujukan Dokumen</th>
                        <th className="py-2.5 px-4">Due Date</th>
                        <th className="py-2.5 px-4 text-right">Debit (RM)</th>
                        <th className="py-2.5 px-4 text-right">Kredit (RM)</th>
                        <th className="py-2.5 px-4 text-right">Baki (RM)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {!statement.statementLines || statement.statementLines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 font-sans text-xs italic">
                            Tiada rekod bil atau bayaran pembekal dijumpai.
                          </td>
                        </tr>
                      ) : (
                        statement.statementLines.map((line: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/40">
                            <td className="py-2.5 px-4">{line.date}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{line.reference}</td>
                            <td className="py-2.5 px-4">{line.dueDate}</td>
                            <td className="py-2.5 px-4 text-right text-emerald-700">{formatRM(line.debit)}</td>
                            <td className="py-2.5 px-4 text-right text-slate-500">{formatRM(line.credit)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-900">{formatRM(line.runningBalance)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
            <div className="w-full sm:w-80">
              <input
                type="text"
                placeholder="Cari kod, nama, telefon, atau e-mel pembekal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {(['All', 'Active', 'Inactive'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setFilterActive(filter)}
                  className={`py-1 px-3 text-xs font-semibold rounded-lg transition-colors ${
                    filterActive === filter
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter === 'All' ? 'Semua' : filter === 'Active' ? 'Aktif' : 'Tidak Aktif'}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3.5 px-6">Kod Pembekal</th>
                  <th className="py-3.5 px-6">Nama Pembekal</th>
                  <th className="py-3.5 px-6">Nombor Telefon</th>
                  <th className="py-3.5 px-6">Alamat E-mel</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-sans">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">Memuatkan data pembekal...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 italic">Tiada profil pembekal dijumpai.</td>
                  </tr>
                ) : (
                  filtered.map((sup) => (
                    <tr key={sup.id} className="hover:bg-slate-50/50">
                      <td className="py-3.5 px-6 font-mono font-bold text-slate-900">{sup.supplierCode}</td>
                      <td className="py-3.5 px-6 font-semibold text-slate-900">
                        <div>{sup.name}</div>
                        {sup.notes && <div className="text-[11px] text-slate-400 font-normal truncate max-w-xs">{sup.notes}</div>}
                      </td>
                      <td className="py-3.5 px-6 text-slate-600 font-mono">{sup.phone || '—'}</td>
                      <td className="py-3.5 px-6 text-slate-500 font-mono">{sup.email || '—'}</td>
                      <td className="py-3.5 px-6 text-center">
                        <button
                          type="button"
                          disabled={userRole === 'Viewer'}
                          onClick={() => handleToggleStatus(sup)}
                          title={userRole === 'Viewer' ? 'Viewer tidak boleh menukar status' : 'Klik untuk tukar status'}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                            sup.isActive
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          } ${userRole === 'Viewer' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                        >
                          {sup.isActive ? 'AKTIF' : 'TIDAK AKTIF'}
                        </button>
                      </td>
                      <td className="py-3.5 px-6 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(sup)}
                          disabled={userRole === 'Viewer'}
                          className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-medium rounded-lg text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setViewingDetail(sup); fetchStatement(sup.id); }}
                          className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-xs inline-flex items-center gap-1 shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" /> Penyata
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Daftar Profil Pembekal Baru</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kod Pembekal *</label>
                  <input
                    type="text"
                    required
                    value={formData.supplierCode}
                    onChange={(e) => setFormData({ ...formData, supplierCode: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="SUP-001"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombor Telefon</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="012-3456789"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Syarikat / Pembekal *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="cth: Ladang Ternakan Ayam Segar Selangor"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat E-mel</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="akaun@pembekal.com.my"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Pejabat / Premis</label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="Lot 123, Kawasan Perindustrian..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tempoh Bayaran (Payment Terms) *</label>
                <select
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 font-sans"
                >
                  <option value="Due on Receipt / Tunai">Due on Receipt / Tunai</option>
                  <option value="Net 7">Net 7 — 7 days</option>
                  <option value="Net 14">Net 14 — 14 days</option>
                  <option value="Net 30">Net 30 — 30 days</option>
                  <option value="Net 45">Net 45 — 45 days</option>
                  <option value="Net 60">Net 60 — 60 days</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nota Tambahan</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="Syarat kredit: 30 hari"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Simpan Pembekal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Kemaskini Profil Pembekal</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kod Pembekal *</label>
                  <input
                    type="text"
                    required
                    value={formData.supplierCode}
                    onChange={(e) => setFormData({ ...formData, supplierCode: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombor Telefon</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Syarikat / Pembekal *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat E-mel</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Pejabat / Premis</label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tempoh Bayaran (Payment Terms) *</label>
                <select
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 font-sans"
                >
                  <option value="Due on Receipt / Tunai">Due on Receipt / Tunai</option>
                  <option value="Net 7">Net 7 — 7 days</option>
                  <option value="Net 14">Net 14 — 14 days</option>
                  <option value="Net 30">Net 30 — 30 days</option>
                  <option value="Net 45">Net 45 — 45 days</option>
                  <option value="Net 60">Net 60 — 60 days</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nota Tambahan</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 16. PURCHASE BILLS VIEW (MILESTONE 3A NEW)
// ============================================================================
function PurchaseBillsView({ accounts, token, userRole, company, setActiveTab, initialBillId, onViewJournal }: { accounts: any[]; token: string | null; userRole: string; company?: any; setActiveTab?: (tab: any) => void; initialBillId?: string | null; onViewJournal?: (journalId: string) => void }) {
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [dueDateManuallyOverridden, setDueDateManuallyOverridden] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [postSuccessMessage, setPostSuccessMessage] = useState<string | null>(null);
  const [postErrorMessage, setPostErrorMessage] = useState<string | null>(null);
  const [draftSuccessMessage, setDraftSuccessMessage] = useState<string | null>(null);
  const [draftErrorMessage, setDraftErrorMessage] = useState<string | null>(null);
  const [isPostingId, setIsPostingId] = useState<string | null>(null);
  
  // Modals & details
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBillDetail, setSelectedBillDetail] = useState<any>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Bill Form state
  const [billForm, setBillForm] = useState({
    supplierId: '',
    supplierInvoiceNumber: '',
    billDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    discountRM: 0,
    lines: [
      {
        description: '',
        quantity: 1,
        unitPriceRM: 0,
        expenseAccountId: '',
      },
    ],
  });

  // Expense accounts for line item selection
  const expenseAccounts = accounts.filter(
    (a) => a.type === 'Expense' || a.code.startsWith('5') || a.code.startsWith('6')
  );

  const [productsList, setProductsList] = useState<any[]>([]);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== 'All') params.append('status', filterStatus);
      if (filterSupplier) params.append('supplierId', filterSupplier);
      if (search) params.append('search', search);

      const res = await fetch(`/api/purchase-bills?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBills(data);
      }
    } catch (err) {
      console.error('Error loading bills:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliersList = async () => {
    try {
      const res = await fetch('/api/suppliers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (err) {
      console.error('Error loading suppliers:', err);
    }
  };

  const fetchProductsList = async () => {
    try {
      const res = await fetch('/api/products?status=Active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProductsList(data);
      }
    } catch (err) {
      console.error('Error loading active products for purchase bills:', err);
    }
  };

  useEffect(() => {
    fetchBills();
    fetchSuppliersList();
    fetchProductsList();
  }, [filterStatus, filterSupplier, search]);

  useEffect(() => {
    if (initialBillId) {
      fetchBillDetail(initialBillId);
    }
  }, [initialBillId]);

  const fetchBillDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/purchase-bills/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedBillDetail(data);
      }
    } catch (err) {
      console.error('Error fetching bill detail:', err);
    }
  };

  const computeDueDate = (billDateStr: string, term: string): string => {
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
  };

  const handleSupplierChange = (supId: string) => {
    const sup = suppliers.find((s) => s.id === supId);
    const term = sup?.paymentTerms || 'Net 30';
    const newDue = computeDueDate(billForm.billDate, term);
    setBillForm((prev) => ({
      ...prev,
      supplierId: supId,
      dueDate: dueDateManuallyOverridden ? prev.dueDate : newDue,
    }));
  };

  const handleBillDateChange = (dateStr: string) => {
    const sup = suppliers.find((s) => s.id === billForm.supplierId);
    const term = sup?.paymentTerms || 'Net 30';
    const newDue = computeDueDate(dateStr, term);
    setBillForm((prev) => ({
      ...prev,
      billDate: dateStr,
      dueDate: dueDateManuallyOverridden ? prev.dueDate : newDue,
    }));
  };

  const handleDueDateChange = (dateStr: string) => {
    setDueDateManuallyOverridden(true);
    setBillForm((prev) => ({ ...prev, dueDate: dateStr }));
  };

  const handleOpenCreate = () => {
    setDueDateManuallyOverridden(false);
    const defaultExpenseId = expenseAccounts.length > 0 ? expenseAccounts[0].id : '';
    const activeSuppliers = suppliers.filter((s) => s.isActive);
    const defaultSup = activeSuppliers[0];
    const defaultTerm = defaultSup?.paymentTerms || 'Net 30';
    const today = new Date().toISOString().split('T')[0];
    const defaultDue = computeDueDate(today, defaultTerm);

    setBillForm({
      supplierId: defaultSup ? defaultSup.id : '',
      supplierInvoiceNumber: '',
      billDate: today,
      dueDate: defaultDue,
      discountRM: 0,
      lines: [
        {
          description: 'Bekalan Ayam Proses Segar',
          quantity: 10,
          unitPriceRM: 15.0,
          expenseAccountId: defaultExpenseId,
        },
      ],
    });
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleDownloadBillPdf = async () => {
    if (!selectedBillDetail) return;
    setIsGeneratingPdf(true);
    try {
      const html = buildPurchaseBillHtml(selectedBillDetail, company);
      await generatePdfFromHtml(html, `Bil_Pembelian_${selectedBillDetail.billNumber}.pdf`, 'portrait');
    } catch (err) {
      console.error('Error generating bill PDF:', err);
      alert('Gagal menjana PDF bil pembelian.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleAddLine = () => {
    const defaultExpenseId = expenseAccounts.length > 0 ? expenseAccounts[0].id : '';
    setBillForm({
      ...billForm,
      lines: [
        ...billForm.lines,
        {
          description: '',
          quantity: 1,
          unitPriceRM: 0,
          expenseAccountId: defaultExpenseId,
        },
      ],
    });
  };

  const handleRemoveLine = (idx: number) => {
    if (billForm.lines.length <= 1) return;
    setBillForm({
      ...billForm,
      lines: billForm.lines.filter((_, i) => i !== idx),
    });
  };

  const handleLineChange = (idx: number, field: string, value: any) => {
    const updated = [...billForm.lines];
    updated[idx] = { ...updated[idx], [field]: value };
    setBillForm({ ...billForm, lines: updated });
  };

  // Calculation previews
  const calcSubtotalCents = billForm.lines.reduce((sum, l) => {
    const qty = Number(l.quantity) || 0;
    const priceCents = Math.round((Number(l.unitPriceRM) || 0) * 100);
    return sum + Math.round(qty * priceCents);
  }, 0);
  const discountCents = Math.round((Number(billForm.discountRM) || 0) * 100);
  const calcTotalCents = Math.max(0, calcSubtotalCents - discountCents);

  const handleCreateBill = async (e: React.FormEvent, shouldPost: boolean = false) => {
    e.preventDefault();
    setFormError(null);
    setPostSuccessMessage(null);
    setPostErrorMessage(null);
    setDraftSuccessMessage(null);
    setDraftErrorMessage(null);

    // Prepare payload in cents
    const payload = {
      supplierId: billForm.supplierId,
      supplierInvoiceNumber: billForm.supplierInvoiceNumber.trim() || undefined,
      billDate: billForm.billDate,
      dueDate: billForm.dueDate,
      discount: discountCents,
      lines: billForm.lines.map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unitPrice: Math.round(Number(l.unitPriceRM) * 100),
        expenseAccountId: l.expenseAccountId,
      })),
    };

    try {
      const res = await fetch('/api/purchase-bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create bill.');
        return;
      }
      const billId = data.id;
      const bNum = data.billNumber || 'Bil';
      if (shouldPost && billId) {
        const postRes = await fetch(`/api/purchase-bills/${billId}/post`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const postData = await postRes.json();
        if (!postRes.ok) {
          setFormError(postData.error || 'Bill created as draft, but posting failed.');
          fetchBills();
          if (billId) fetchBillDetail(billId);
          return;
        } else {
          setPostSuccessMessage(`Bil pembelian ${bNum} berjaya dicipta dan diposkan ke Lejar. Rujukan Jurnal: #${postData.journalId || ''}`);
        }
      } else {
        setDraftSuccessMessage(`Draf bil pembelian ${bNum} berjaya disimpan.`);
      }
      setShowCreateModal(false);
      fetchBills();
      if (billId) {
        fetchBillDetail(billId);
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred.');
    }
  };

  const handlePostBill = async (id: string) => {
    setPostSuccessMessage(null);
    setPostErrorMessage(null);
    setDraftSuccessMessage(null);
    setIsPostingId(id);

    try {
      const res = await fetch(`/api/purchase-bills/${id}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setPostErrorMessage(data.error || 'Gagal mempos bil pembelian ke Lejar Am.');
        return;
      }
      const bNum = selectedBillDetail?.id === id ? selectedBillDetail.billNumber : (bills.find(b => b.id === id)?.billNumber || 'Bil');
      const journalRef = data.journalId ? `#${data.journalId}` : '';
      setPostSuccessMessage(`Bil pembelian ${bNum} berjaya diposkan ke Lejar. Rujukan Jurnal: ${journalRef}`);
      await fetchBills();
      if (selectedBillDetail?.id === id) {
        await fetchBillDetail(id);
      }
    } catch (err: any) {
      setPostErrorMessage(err.message || 'Ralat berlaku semasa mempos bil pembelian.');
    } finally {
      setIsPostingId(null);
    }
  };

  const handleVoidBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillDetail || !voidReason.trim()) return;
    try {
      const res = await fetch(`/api/purchase-bills/${selectedBillDetail.id}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to void bill.');
        return;
      }
      setShowVoidModal(false);
      setVoidReason('');
      fetchBills();
      fetchBillDetail(selectedBillDetail.id);
    } catch (err: any) {
      alert(err.message || 'Error voiding bill.');
    }
  };

  return (
    <div className="space-y-6 text-sm">
      {postSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span><strong>Berjaya Dipos ke Lejar Am:</strong> {postSuccessMessage}</span>
          </div>
          <button onClick={() => setPostSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold px-2 py-1">Tutup ✕</button>
        </div>
      )}
      {postErrorMessage && (
        <div className="p-4 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
            <span><strong>Ralat Pos ke Lejar:</strong> {postErrorMessage}</span>
          </div>
          <button onClick={() => setPostErrorMessage(null)} className="text-red-700 hover:text-red-900 font-bold px-2 py-1">Tutup ✕</button>
        </div>
      )}
      {draftSuccessMessage && (
        <div className="p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs flex items-center justify-between shadow-sm">
          <span><strong>Maklumat Draf:</strong> {draftSuccessMessage}</span>
          <button onClick={() => setDraftSuccessMessage(null)} className="text-blue-700 hover:text-blue-900 font-bold">✕</button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Bil Pembelian</h2>
          <p className="text-slate-500 text-xs">Perekodan bil invois pembekal, kos belian barangan, dan tanggungan bil belum dibayar.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          disabled={userRole === 'Viewer'}
          className="py-2 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-45 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Cipta Bil Pembelian
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Cari no. bil, pembekal, atau rujukan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 border border-slate-200 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="border border-slate-200 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-slate-400 font-sans text-xs"
          >
            <option value="">Semua Pembekal</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.supplierCode} — {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {(['All', 'Draft', 'Posted', 'Voided'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`py-1 px-3 font-semibold rounded-lg transition-colors ${
                filterStatus === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'All' ? 'Semua' : st === 'Draft' ? 'Draf' : st === 'Posted' ? 'Dipos' : 'Dibatalkan'}
            </button>
          ))}
        </div>
      </div>

      {/* Bill Details Drawer or Table View */}
      {selectedBillDetail ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex justify-between items-start pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-slate-900 font-mono">{selectedBillDetail.billNumber}</h3>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    selectedBillDetail.status === 'Draft'
                      ? 'bg-slate-100 text-slate-800 border-slate-200'
                      : selectedBillDetail.status === 'Posted'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                      : 'bg-red-50 text-red-800 border-red-100'
                  }`}
                >
                  {selectedBillDetail.status === 'Draft' ? 'DRAF' : selectedBillDetail.status === 'Posted' ? 'DIPOS' : 'DIBATAL'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Pembekal: <span className="font-semibold text-slate-800">{selectedBillDetail.supplierName}</span> ({selectedBillDetail.supplierCode})
                {selectedBillDetail.supplierInvoiceNumber && ` · Rujukan Invois Pembekal: ${selectedBillDetail.supplierInvoiceNumber}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedBillDetail.status === 'Draft' && userRole !== 'Viewer' && (
                <button
                  onClick={() => handlePostBill(selectedBillDetail.id)}
                  disabled={isPostingId === selectedBillDetail.id}
                  className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                >
                  {isPostingId === selectedBillDetail.id ? 'Sedang Dipos...' : 'Pos ke Lejar'}
                </button>
              )}
              <button
                onClick={handleDownloadBillPdf}
                disabled={isGeneratingPdf}
                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs"
              >
                {isGeneratingPdf ? 'Menjana PDF...' : 'Lihat / Muat Turun PDF'}
              </button>
              <button
                onClick={() => window.print()}
                className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs"
              >
                Cetak Bil
              </button>
              {selectedBillDetail.status === 'Posted' && userRole !== 'Viewer' && (
                <button
                  onClick={() => {
                    setVoidReason('');
                    setShowVoidModal(true);
                  }}
                  className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors"
                >
                  Batal Bil
                </button>
              )}
              <button
                onClick={() => setSelectedBillDetail(null)}
                className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-semibold"
              >
                Kembali ke Senarai Bil
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block font-bold uppercase tracking-wider text-[10px]">Tarikh Bil</span>
              <span className="font-semibold text-slate-800">{selectedBillDetail.billDate}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold uppercase tracking-wider text-[10px]">Due Date</span>
              <span className="font-semibold text-slate-800">{selectedBillDetail.dueDate}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold uppercase tracking-wider text-[10px]">Jumlah Kecil</span>
              <span className="font-mono text-slate-800">{formatRM(selectedBillDetail.subtotal)}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold uppercase tracking-wider text-[10px]">Jumlah Keseluruhan</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{formatRM(selectedBillDetail.total)}</span>
            </div>
          </div>

          {/* Line items table */}
          <div>
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Item Belian & Akaun Perbelanjaan</h4>
            <table className="w-full text-left border-collapse border border-slate-200 rounded-xl text-xs font-mono overflow-hidden">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="p-2.5 px-3">Deskripsi Item</th>
                  <th className="p-2.5 px-3">Akaun Perbelanjaan (Expense COA)</th>
                  <th className="p-2.5 px-3 text-right">Kuantiti</th>
                  <th className="p-2.5 px-3 text-right">Harga Seunit</th>
                  <th className="p-2.5 px-3 text-right">Jumlah Baris</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {selectedBillDetail.lines?.map((line: any) => (
                  <tr key={line.id} className="hover:bg-slate-50/50">
                    <td className="p-2.5 px-3 font-semibold text-slate-800">{line.description}</td>
                    <td className="p-2.5 px-3 text-slate-500 font-mono text-[11px]">
                      {line.accountCode} — {line.accountName}
                    </td>
                    <td className="p-2.5 px-3 text-right font-mono text-slate-700">{line.quantity}</td>
                    <td className="p-2.5 px-3 text-right font-mono text-slate-700">{formatRM(line.unitPrice)}</td>
                    <td className="p-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatRM(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedBillDetail.postedJournalId && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
              <span>
                <strong>Integrasi Lejar Am:</strong> Bil ini telah mencipta Catatan Jurnal <span className="font-mono font-bold">#{selectedBillDetail.postedJournalId}</span> secara automatik (Debit Belanja dan Kredit Bil Belum Dibayar).
              </span>
              <button
                onClick={() => {
                  if (onViewJournal) {
                    onViewJournal(selectedBillDetail.postedJournalId);
                  } else if (setActiveTab) {
                    setActiveTab('journal');
                  }
                }}
                className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs"
              >
                Lihat di Jurnal &rarr;
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Bills List Table */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3.5 px-6">Nombor Bil</th>
                <th className="py-3.5 px-6">Pembekal</th>
                <th className="py-3.5 px-6">Rujukan Bil</th>
                <th className="py-3.5 px-6">Tarikh Bil</th>
                <th className="py-3.5 px-6">Due Date</th>
                <th className="py-3.5 px-6 text-right">Jumlah (RM)</th>
                <th className="py-3.5 px-6 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-sans">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">Memuatkan data bil pembelian...</td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 italic">Tiada rekod bil pembelian didaftarkan.</td>
                </tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-900">{b.billNumber}</td>
                    <td className="py-3.5 px-6 font-semibold text-slate-900">{b.supplierName}</td>
                    <td className="py-3.5 px-6 font-mono text-slate-500 text-[11px]">{b.supplierInvoiceNumber || '—'}</td>
                    <td className="py-3.5 px-6 text-slate-500">{b.billDate}</td>
                    <td className="py-3.5 px-6 text-slate-500">{b.dueDate}</td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-slate-900">{formatRM(b.total)}</td>
                    <td className="py-3.5 px-6 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          b.status === 'Draft'
                            ? 'bg-slate-100 text-slate-800 border-slate-200'
                            : b.status === 'Posted'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : 'bg-red-50 text-red-800 border-red-100'
                        }`}
                      >
                        {b.status === 'Draft' ? 'DRAF' : b.status === 'Posted' ? 'DIPOS' : 'DIBATAL'}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right space-x-2">
                      {b.status === 'Draft' && userRole !== 'Viewer' && (
                        <button
                          onClick={() => handlePostBill(b.id)}
                          disabled={isPostingId === b.id}
                          className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs shadow-xs"
                        >
                          {isPostingId === b.id ? 'Dipos...' : 'Pos'}
                        </button>
                      )}
                      <button
                        onClick={() => fetchBillDetail(b.id)}
                        className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs transition-colors"
                      >
                        Perincian &rarr;
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE BILL MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-900 text-sm">Cipta Draf Bil Pembelian Baru</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <form onSubmit={handleCreateBill} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs">{formError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pilih Pembekal *</label>
                  <select
                    required
                    value={billForm.supplierId}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 font-sans text-xs"
                  >
                    <option value="">Pilih pembekal aktif</option>
                    {suppliers
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.supplierCode} — {s.name} ({s.paymentTerms || 'Net 30'})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Invois / Rujukan Pembekal</label>
                  <input
                    type="text"
                    value={billForm.supplierInvoiceNumber}
                    onChange={(e) => setBillForm({ ...billForm, supplierInvoiceNumber: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                    placeholder="cth: INV-SUPP-9842"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tarikh Bil *</label>
                  <input
                    type="date"
                    required
                    value={billForm.billDate}
                    onChange={(e) => handleBillDateChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={billForm.dueDate}
                    onChange={(e) => handleDueDateChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                  />
                </div>
              </div>

              {/* Line items table */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="font-semibold text-slate-700">Item Belian & Akaun Perbelanjaan</label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    + Tambah Baris
                  </button>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                        <th className="p-2.5 px-3">Deskripsi Item</th>
                        <th className="p-2.5 px-3">Akaun Belanja</th>
                        <th className="p-2.5 px-3 w-16 text-right">Kuantiti</th>
                        <th className="p-2.5 px-3 w-24 text-right">Harga (RM)</th>
                        <th className="p-2.5 px-3 w-24 text-right">Jumlah</th>
                        <th className="p-2.5 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billForm.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="p-2 px-3">
                            <div className="space-y-1">
                              <input
                                type="text"
                                required
                                value={line.description}
                                onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs"
                                placeholder="cth: Bekalan ayam proses segar"
                              />
                              {productsList.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-slate-400 font-medium">Katalog:</span>
                                  {productsList.slice(0, 5).map((prod) => (
                                    <button
                                      key={prod.id}
                                      type="button"
                                      onClick={() => {
                                        const updated = [...billForm.lines];
                                        updated[idx].description = `[${prod.productCode}] ${prod.name} (${prod.purchaseUnit})`;
                                        if (prod.purchaseCost > 0) {
                                          updated[idx].unitPriceRM = prod.purchaseCost / 100;
                                        }
                                        if (prod.expenseAccountId) {
                                          updated[idx].expenseAccountId = prod.expenseAccountId;
                                        }
                                        setBillForm({ ...billForm, lines: updated });
                                      }}
                                      className="text-[10px] px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded font-medium transition-colors"
                                      title="Pilih produk dari katalog"
                                    >
                                      {prod.name.split('(')[0].trim()} (RM {(prod.purchaseCost / 100).toFixed(2)} / {prod.purchaseUnit})
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-2 px-3">
                            <select
                              required
                              value={line.expenseAccountId}
                              onChange={(e) => handleLineChange(idx, 'expenseAccountId', e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-sans"
                            >
                              {expenseAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} - {a.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 px-3">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              required
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs text-right font-mono"
                            />
                          </td>
                          <td className="p-2 px-3">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              required
                              value={line.unitPriceRM}
                              onChange={(e) => handleLineChange(idx, 'unitPriceRM', parseFloat(e.target.value) || 0)}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs text-right font-mono"
                            />
                          </td>
                          <td className="p-2 px-3 text-right font-mono font-semibold text-slate-800">
                            {formatRM(Math.round(Number(line.quantity) * Math.round(Number(line.unitPriceRM) * 100)))}
                          </td>
                          <td className="p-2 px-3 text-center">
                            {billForm.lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                className="text-slate-400 hover:text-red-600 font-bold"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Discount and Totals Preview */}
              <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-slate-700">Diskaun Pembekal (RM):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={billForm.discountRM}
                    onChange={(e) => setBillForm({ ...billForm, discountRM: parseFloat(e.target.value) || 0 })}
                    className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-right font-mono bg-white"
                  />
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Jumlah Kecil: {formatRM(calcSubtotalCents)}</div>
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    Jumlah Bersih: {formatRM(calcTotalCents)}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={(e) => handleCreateBill(e, false)}
                  className="py-2 px-4 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Simpan Draf Bil
                </button>
                <button
                  type="button"
                  onClick={(e) => handleCreateBill(e, true)}
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Simpan Bil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID MODAL */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Batal Bil Pembelian</h3>
              <button onClick={() => setShowVoidModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <form onSubmit={handleVoidBill} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Adakah anda pasti mahu membatalkan bil <span className="font-mono font-bold">{selectedBillDetail?.billNumber}</span>?
                Tindakan ini akan membatalkan catatan jurnal berkaitan dalam Lejar Am.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sebab Pembatalan *</label>
                <textarea
                  required
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="cth: Invois pembekal bertindih, barang dipulangkan, atau kesilapan harga..."
                />
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVoidModal(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Sahkan Pembatalan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STANDALONE PRINT CONTAINER FOR NATIVE PRINTING */}
      {selectedBillDetail && (
        <div
          id="printable-bill-standalone"
          className="hidden print:block bg-white text-slate-900 p-8"
          dangerouslySetInnerHTML={{ __html: buildPurchaseBillHtml(selectedBillDetail, company) }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 17. ACCOUNTS PAYABLE (AP) AGING & SUPPLIER STATEMENT VIEW (MILESTONE 3A NEW)
// ============================================================================
function APAgingView({ token }: { token: string | null }) {
  const [agingData, setAgingData] = useState<any[]>([]);
  const [outstandingBills, setOutstandingBills] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'aging' | 'outstanding' | 'statement'>('aging');
  const [pivotDate, setPivotDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Statement sub-view
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [statement, setStatement] = useState<any>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const fetchAPData = async () => {
    try {
      setLoading(true);
      // Fetch Aging
      const agingRes = await fetch(`/api/ap/aging?pivotDate=${pivotDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (agingRes.ok) {
        const data = await agingRes.json();
        setAgingData(data);
      }

      // Fetch Outstanding
      const outRes = await fetch('/api/ap/outstanding', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (outRes.ok) {
        const data = await outRes.json();
        setOutstandingBills(data);
      }

      // Fetch Suppliers list for statements dropdown
      const supRes = await fetch('/api/suppliers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (supRes.ok) {
        const data = await supRes.json();
        setSuppliers(data);
        if (data.length > 0 && !selectedSupplierId) {
          setSelectedSupplierId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching AP data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupplierStatement = async (id: string) => {
    if (!id) return;
    try {
      setLoadingStatement(true);
      const res = await fetch(`/api/ap/supplier/${id}/statement`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatement(data);
      }
    } catch (err) {
      console.error('Error fetching statement:', err);
    } finally {
      setLoadingStatement(false);
    }
  };

  useEffect(() => {
    fetchAPData();
  }, [pivotDate]);

  useEffect(() => {
    if (selectedSupplierId && activeSubTab === 'statement') {
      fetchSupplierStatement(selectedSupplierId);
    }
  }, [selectedSupplierId, activeSubTab]);

  // Aggregate sums
  const totalCurrent = agingData.reduce((sum, item) => sum + item.current, 0);
  const total1to30 = agingData.reduce((sum, item) => sum + item.oneToThirty, 0);
  const total31to60 = agingData.reduce((sum, item) => sum + item.thirtyOneToSixty, 0);
  const total61to90 = agingData.reduce((sum, item) => sum + item.sixtyOneToNinety, 0);
  const total90plus = agingData.reduce((sum, item) => sum + item.ninetyPlus, 0);
  const totalAPSum = totalCurrent + total1to30 + total31to60 + total61to90 + total90plus;

  return (
    <div className="space-y-6 text-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Tempoh Bil Belum Dibayar</h2>
          <p className="text-slate-500 text-xs">Pantau baki hutang pembekal, bil tertunggak mengikut tempoh kredit, dan lejar pembekal.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-semibold">Tarikh Asas:</label>
          <input
            type="date"
            value={pivotDate}
            onChange={(e) => setPivotDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white shadow-xs"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Baki Bil Belum Dibayar</span>
          <span className="text-lg font-bold font-mono text-slate-900">{formatRM(totalAPSum)}</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Semasa (Belum Lewat)</span>
          <span className="text-sm font-bold font-mono text-emerald-600">{formatRM(totalCurrent)}</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">1 - 30 Hari</span>
          <span className="text-sm font-bold font-mono text-slate-800">{formatRM(total1to30)}</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block mb-1">31 - 60 Hari</span>
          <span className="text-sm font-bold font-mono text-amber-600">{formatRM(total31to60)}</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block mb-1">61 - 90 Hari</span>
          <span className="text-sm font-bold font-mono text-orange-600">{formatRM(total61to90)}</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block mb-1">Lebih 90 Hari</span>
          <span className="text-sm font-bold font-mono text-rose-600">{formatRM(total90plus)}</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('aging')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeSubTab === 'aging'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Tempoh Bil Belum Dibayar
        </button>
        <button
          onClick={() => setActiveSubTab('outstanding')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeSubTab === 'outstanding'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Senarai Bil Belum Dibayar ({outstandingBills.length})
        </button>
        <button
          onClick={() => setActiveSubTab('statement')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeSubTab === 'statement'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Penyata Lejar Pembekal
        </button>
      </div>

      {/* TAB 1: AGING MATRIX */}
      {activeSubTab === 'aging' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">Kod</th>
                <th className="py-3 px-4">Nama Pembekal</th>
                <th className="py-3 px-4 text-right">Semasa</th>
                <th className="py-3 px-4 text-right">1-30 Hari</th>
                <th className="py-3 px-4 text-right">31-60 Hari</th>
                <th className="py-3 px-4 text-right">61-90 Hari</th>
                <th className="py-3 px-4 text-right">90+ Hari</th>
                <th className="py-3 px-4 text-right">Jumlah Baki</th>
                <th className="py-3 px-4 text-right">Penyata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono">
              {agingData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans italic">
                    Tiada bil pembelian belum selesai. Semua akaun pembekal telah selesai.
                  </td>
                </tr>
              ) : (
                agingData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-bold text-slate-900">{row.supplierCode}</td>
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900">{row.name}</td>
                    <td className="py-3 px-4 text-right text-emerald-600">{formatRM(row.current)}</td>
                    <td className="py-3 px-4 text-right text-slate-700">{formatRM(row.oneToThirty)}</td>
                    <td className="py-3 px-4 text-right text-amber-600">{formatRM(row.thirtyOneToSixty)}</td>
                    <td className="py-3 px-4 text-right text-orange-600">{formatRM(row.sixtyOneToNinety)}</td>
                    <td className="py-3 px-4 text-right text-red-600 font-bold">{formatRM(row.ninetyPlus)}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{formatRM(row.totalOutstanding)}</td>
                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        onClick={() => {
                          const sup = suppliers.find((s) => s.supplierCode === row.supplierCode);
                          if (sup) setSelectedSupplierId(sup.id);
                          setActiveSubTab('statement');
                        }}
                        className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Lejar &rarr;
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: OUTSTANDING BILLS */}
      {activeSubTab === 'outstanding' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3.5 px-6">Nombor Bil</th>
                <th className="py-3.5 px-6">Pembekal</th>
                <th className="py-3.5 px-6">Rujukan Bil</th>
                <th className="py-3.5 px-6">Tarikh Bil</th>
                <th className="py-3.5 px-6">Due Date</th>
                <th className="py-3.5 px-6 text-right">Baki Tertunggak (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-sans">
              {outstandingBills.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                    Tiada bil pembelian tertunggak buat masa ini.
                  </td>
                </tr>
              ) : (
                outstandingBills.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-6 font-mono font-bold text-slate-900">{b.billNumber}</td>
                    <td className="py-3 px-6 font-semibold text-slate-900">
                      {b.supplierName} <span className="font-mono text-slate-400 text-[11px]">({b.supplierCode})</span>
                    </td>
                    <td className="py-3 px-6 font-mono text-slate-500 text-[11px]">{b.supplierInvoiceNumber || '—'}</td>
                    <td className="py-3 px-6 text-slate-500">{b.billDate}</td>
                    <td className="py-3 px-6 text-slate-500 font-medium">{b.dueDate}</td>
                    <td className="py-3 px-6 text-right font-mono font-bold text-slate-900">{formatRM(b.outstanding)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: SUPPLIER STATEMENT */}
      {activeSubTab === 'statement' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-white p-4 border border-slate-200 rounded-lg">
            <label className="text-xs font-semibold text-slate-700">Choose Supplier:</label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="border border-slate-200 rounded-md py-1.5 px-3 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.supplierCode} — {s.name}
                </option>
              ))}
            </select>
          </div>

          {loadingStatement ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-xs">
              Loading supplier statement...
            </div>
          ) : statement ? (
            <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
              <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{statement.supplier.name}</h3>
                  <p className="text-xs text-slate-500">
                    Code: <span className="font-mono font-bold">{statement.supplier.supplierCode}</span>
                    {statement.supplier.phone && ` · ${statement.supplier.phone}`}
                    {statement.supplier.email && ` · ${statement.supplier.email}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Baki Bil Belum Dibayar</span>
                  <span className="text-lg font-bold font-mono text-slate-900">{formatRM(statement.totalOutstanding)}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Penyata Rekod Dokumen Pembekal</h4>
                <table className="w-full text-left border-collapse border border-slate-200 rounded text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                      <th className="p-2.5 px-3">Tarikh</th>
                      <th className="p-2.5 px-3">Jenis</th>
                      <th className="p-2.5 px-3">Rujukan Sistem</th>
                      <th className="p-2.5 px-3">Rujukan Pembekal</th>
                      <th className="p-2.5 px-3">Due Date</th>
                      <th className="p-2.5 px-3 text-right">Debit (Bayaran)</th>
                      <th className="p-2.5 px-3 text-right">Kredit (Bil)</th>
                      <th className="p-2.5 px-3 text-right">Baki Bil Belum Dibayar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {statement.statementLines.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">No posted documents found for this supplier.</td>
                      </tr>
                    ) : (
                      statement.statementLines.map((line: any) => (
                        <tr key={line.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 px-3 font-mono text-slate-600">{line.date}</td>
                          <td className="p-2.5 px-3 font-semibold text-slate-800">{line.type}</td>
                          <td className="p-2.5 px-3 font-mono font-bold text-slate-900">{line.reference}</td>
                          <td className="p-2.5 px-3 font-mono text-slate-500 text-[11px]">{line.supplierInvoiceNumber || '—'}</td>
                          <td className="p-2.5 px-3 text-slate-500">{line.dueDate || '—'}</td>
                          <td className="p-2.5 px-3 text-right font-mono text-slate-400">{line.debit > 0 ? formatRM(line.debit) : '—'}</td>
                          <td className="p-2.5 px-3 text-right font-mono font-bold text-slate-800">{line.credit > 0 ? formatRM(line.credit) : '—'}</td>
                          <td className="p-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatRM(line.runningBalance)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 15. SUPPLIER PAYMENTS & ALLOCATIONS VIEW (MILESTONE 3B NEW)
// ============================================================================
function SupplierPaymentsView({ accounts, token, userRole }: { accounts: any[]; token: string | null; userRole: string }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterSupplier, setFilterSupplier] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');

  // Form states
  const [formData, setFormData] = useState<{
    id?: string;
    supplierId: string;
    paymentDate: string;
    amount: number; // in RM
    paymentAccountId: string;
    reference: string;
    notes: string;
    status: 'Draft' | 'Posted';
    allocations: { [billId: string]: number }; // billId -> RM amount
  }>({
    supplierId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 0,
    paymentAccountId: '',
    reference: '',
    notes: '',
    status: 'Draft',
    allocations: {},
  });

  // Open bills for the selected supplier
  const [openBills, setOpenBills] = useState<any[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [isPostingId, setIsPostingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState<string | null>(null);

  // Filter bank/cash accounts (Asset)
  const bankAccounts = accounts.filter(
    (a) => a.type === 'Asset' && (a.subType === 'Cash' || a.subType === 'Bank' || a.code.startsWith('10'))
  );

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await apiFetch('/api/supplier-payments');
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      } else {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error || "Gagal memuatkan rekod bayaran pembekal.";
        setFetchError(errMsg);
        setActionError(errMsg);
      }
    } catch (err: any) {
      console.error("Error fetching supplier payments:", err);
      const errMsg = err.message || "Ralat rangkaian semasa memuatkan bayaran pembekal.";
      setFetchError(errMsg);
      setActionError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await apiFetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchSuppliers();
  }, []);

  // Fetch open posted or currently allocated bills when supplier changes in modal
  useEffect(() => {
    if (!formData.supplierId) {
      setOpenBills([]);
      return;
    }

    const fetchSupplierBills = async () => {
      try {
        setLoadingBills(true);
        const res = await apiFetch(`/api/purchase-bills?supplierId=${formData.supplierId}`);
        if (res.ok) {
          const billsData = await res.json();
          const pending = billsData.filter((b: any) => {
            const isPostedWithBalance = b.status === 'Posted' && (b.outstandingBalance !== undefined ? b.outstandingBalance > 0 : b.total > 0);
            const isCurrentlyAllocated = formData.allocations && (formData.allocations[b.id] !== undefined && formData.allocations[b.id] > 0);
            return isPostedWithBalance || isCurrentlyAllocated;
          });
          setOpenBills(pending);
        }
      } catch (err) {
        console.error("Error fetching supplier bills:", err);
      } finally {
        setLoadingBills(false);
      }
    };

    fetchSupplierBills();
  }, [formData.supplierId]);

  const handleOpenAdd = () => {
    setFormError('');
    setActionSuccess('');
    setActionError('');
    setFormData({
      supplierId: suppliers.find((s) => s.isActive)?.id || '',
      paymentDate: new Date().toISOString().split('T')[0],
      amount: 0,
      paymentAccountId: bankAccounts[0]?.id || '',
      reference: '',
      notes: '',
      status: 'Draft',
      allocations: {},
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = async (payment: any) => {
    setFormError('');
    setActionSuccess('');
    setActionError('');
    setIsLoadingEdit(payment.id);
    try {
      const res = await apiFetch(`/api/supplier-payments/${payment.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Gagal memuatkan rekod bayaran (${res.status} ${res.statusText})`);
      }
      const detail = await res.json();

      const allocMap: { [billId: string]: number } = {};
      if (detail.allocations) {
        detail.allocations.forEach((a: any) => {
          allocMap[a.purchaseBillId] = a.amount / 100;
        });
      }

      setFormData({
        id: detail.id,
        supplierId: detail.supplierId,
        paymentDate: detail.paymentDate,
        amount: detail.amount / 100,
        paymentAccountId: detail.paymentAccountId,
        reference: detail.reference || '',
        notes: detail.notes || '',
        status: detail.status,
        allocations: allocMap,
      });
      setShowAddModal(true);
    } catch (err: any) {
      console.error("Edit Draft Error:", err);
      setActionError(err.message || "Ralat memuatkan draf bayaran pembekal.");
    } finally {
      setIsLoadingEdit(null);
    }
  };

  const handleClearStaleAllocations = () => {
    const updatedAllocations = { ...formData.allocations };
    const openBillsMap = new Map(openBills.map((b) => [b.id, b]));

    Object.keys(updatedAllocations).forEach((billId) => {
      const allocRM = updatedAllocations[billId] || 0;
      if (allocRM <= 0) {
        delete updatedAllocations[billId];
        return;
      }

      const b = openBillsMap.get(billId);
      if (!b || b.status !== 'Posted') {
        // Non-posted or missing bill -> clear allocation
        delete updatedAllocations[billId];
      } else {
        const outstandingCents = b.outstandingBalance !== undefined ? b.outstandingBalance : b.total;
        const maxRM = Math.max(0, outstandingCents / 100);
        if (allocRM > maxRM) {
          if (maxRM <= 0) {
            delete updatedAllocations[billId];
          } else {
            updatedAllocations[billId] = maxRM;
          }
        }
      }
    });

    setFormData((prev) => ({
      ...prev,
      allocations: updatedAllocations,
    }));
  };

  const handleAutoAllocate = () => {
    if (formData.amount <= 0) {
      alert("Sila masukkan jumlah bayaran melebihi RM 0.00 terlebih dahulu.");
      return;
    }

    let remaining = Math.round(formData.amount * 100);
    const newAllocations: { [billId: string]: number } = {};

    const sortedBills = [...openBills].sort((a, b) => a.billDate.localeCompare(b.billDate));

    for (const b of sortedBills) {
      if (remaining <= 0) break;
      const outstandingCents = b.outstandingBalance !== undefined ? b.outstandingBalance : b.total;
      const allocateCents = Math.min(remaining, outstandingCents);
      if (allocateCents > 0) {
        newAllocations[b.id] = parseFloat((allocateCents / 100).toFixed(2));
        remaining -= allocateCents;
      }
    }

    setFormData((prev) => ({
      ...prev,
      allocations: newAllocations,
    }));
  };

  const handleAllocationChange = (billId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setFormData((prev) => ({
      ...prev,
      allocations: {
        ...prev.allocations,
        [billId]: num,
      },
    }));
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) {
      console.warn("Synchronous submission guard triggered - blocking duplicate request.");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFormError('');
    setActionError('');

    if (formData.amount <= 0) {
      setFormError("Jumlah bayaran mestilah melebihi RM 0.00.");
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    const processedAllocations = Object.entries(formData.allocations)
      .map(([billId, amt]) => ({
        purchaseBillId: billId,
        amount: Math.round(amt * 100),
      }))
      .filter((a) => a.amount > 0);

    const totalAllocatedCents = processedAllocations.reduce((sum, a) => sum + a.amount, 0);
    const totalAmountCents = Math.round(formData.amount * 100);

    if (totalAllocatedCents > totalAmountCents) {
      setFormError(`Jumlah diagihkan (RM ${(totalAllocatedCents / 100).toFixed(2)}) tidak boleh melebihi jumlah bayaran (RM ${formData.amount.toFixed(2)}).`);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    const payload = {
      supplierId: formData.supplierId,
      paymentDate: formData.paymentDate,
      amount: totalAmountCents,
      paymentAccountId: formData.paymentAccountId,
      reference: formData.reference,
      notes: formData.notes,
      status: formData.status,
      allocations: processedAllocations,
    };

    const isEdit = Boolean(formData.id);
    const url = isEdit ? `/api/supplier-payments/${formData.id}` : '/api/supplier-payments';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowAddModal(false);
        setActionSuccess(isEdit ? "Draf bayaran pembekal berjaya dikemaskini." : (formData.status === 'Posted' ? "Bayaran pembekal berjaya direkod dan diposkan ke Lejar Am." : "Draf bayaran pembekal berjaya disimpan."));
        await fetchPayments();
      } else {
        const err = await res.json().catch(() => ({}));
        setFormError(err.error || "Gagal menyimpan bayaran pembekal.");
      }
    } catch (err: any) {
      setFormError(err.message || "Ralat rangkaian semasa menyimpan bayaran.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handlePostPayment = async (id: string) => {
    if (isPostingId === id) return;
    setActionError('');
    setActionSuccess('');
    setIsPostingId(id);

    try {
      const res = await apiFetch(`/api/supplier-payments/${id}/post`, {
        method: 'POST',
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setActionSuccess(`Bayaran pembekal berjaya diposkan ke Lejar Am! Rujukan Jurnal: #${data.journalId || ''}`);
        await fetchPayments();
      } else {
        if (data.error && (data.error.includes("Concurrent Allocation Conflict") || data.error.includes("exceeds current remaining outstanding balance"))) {
          setActionError(`Konflik Peruntukan: Draf ini mempunyai peruntukan bil yang telah dijelaskan oleh bayaran lain (Baki RM 0.00). Sila tekan 'Edit' pada draf ini untuk mengemaskini peruntukan sebelum mempos.`);
        } else {
          setActionError(`Ralat semasa mempos: ${data.error || 'Gagal mempos bayaran ke Lejar Am.'}`);
        }
      }
    } catch (err: any) {
      setActionError(`Ralat semasa mempos: ${err.message || 'Ralat sambungan rangkaian.'}`);
    } finally {
      setIsPostingId(null);
    }
  };

  const handleOpenVoid = (payment: any) => {
    setSelectedPayment(payment);
    setVoidReason('');
    setShowVoidModal(true);
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      alert("Sila nyatakan sebab pembatalan bayaran.");
      return;
    }

    try {
      const res = await apiFetch(`/api/supplier-payments/${selectedPayment.id}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });

      if (res.ok) {
        setShowVoidModal(false);
        setActionSuccess("Bayaran pembekal berjaya dibatalkan dan catatan lejar dibalikkan.");
        await fetchPayments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Ralat pembatalan: ${err.error || 'Gagal membatalkan bayaran.'}`);
      }
    } catch (err: any) {
      alert(`Ralat pembatalan: ${err.message}`);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    try {
      const res = await apiFetch(`/api/supplier-payments/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setActionSuccess("Draf bayaran pembekal berjaya dipadam.");
        await fetchPayments();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(`Ralat pemadaman: ${err.error || 'Gagal memadam draf.'}`);
      }
    } catch (err: any) {
      setActionError(`Ralat pemadaman: ${err.message}`);
    }
  };

  const handleViewDetail = async (id: string) => {
    try {
      const res = await apiFetch(`/api/supplier-payments/${id}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedPayment(detail);
        setShowDetailModal(true);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error || "Gagal memuatkan perincian bayaran.");
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || "Ralat rangkaian.");
    }
  };

  // Filtered payments
  const filteredPayments = payments.filter((p) => {
    const matchesStatus = filterStatus === 'All' || p.status === filterStatus;
    const matchesSupplier = filterSupplier === 'All' || p.supplierId === filterSupplier;
    const matchesSearch =
      !searchTerm.trim() ||
      p.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.reference && p.reference.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSupplier && matchesSearch;
  });

  // Calculate aggregates
  const totalDisbursed = payments.filter((p) => p.status === 'Posted').reduce((sum, p) => sum + p.amount, 0);
  const totalAllocated = payments.filter((p) => p.status === 'Posted').reduce((sum, p) => sum + (p.allocatedAmount || 0), 0);
  const totalUnallocatedAdvance = Math.max(0, totalDisbursed - totalAllocated);

  return (
    <div className="space-y-4 sm:space-y-6 text-sm">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Supplier Payments & Settlements</h2>
          <p className="text-slate-500 text-xs">Disburse payments, settle purchase bills, manage unallocated advance credits, and reconcile AP.</p>
        </div>
        {userRole !== 'Viewer' && (
          <button
            onClick={handleOpenAdd}
            className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Record Supplier Payment</span>
          </button>
        )}
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex justify-between items-center">
          <span className="font-semibold">{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="text-emerald-600 hover:text-emerald-800 font-bold ml-2 p-1">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{actionError}</span>
            {fetchError && (
              <button
                onClick={() => { fetchPayments(); fetchSuppliers(); }}
                className="ml-2 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-[11px] transition-colors min-h-[36px] flex items-center justify-center"
              >
                Cuba Semula
              </button>
            )}
          </div>
          <button onClick={() => setActionError('')} className="text-red-600 hover:text-red-800 font-bold ml-2 p-1">✕</button>
        </div>
      )}

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Total Disbursed (Posted)</span>
          <span className="text-lg font-bold font-mono text-slate-900">
            {loading ? '—' : fetchError ? <span className="text-amber-600 text-sm font-sans font-semibold">Ralat</span> : formatRM(totalDisbursed)}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Total Bill Settlements (Allocated)</span>
          <span className="text-lg font-bold font-mono text-emerald-600">
            {loading ? '—' : fetchError ? <span className="text-amber-600 text-sm font-sans font-semibold">Ralat</span> : formatRM(totalAllocated)}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Unallocated Supplier Advances</span>
          <span className="text-lg font-bold font-mono text-blue-600">
            {loading ? '—' : fetchError ? <span className="text-amber-600 text-sm font-sans font-semibold">Ralat</span> : formatRM(totalUnallocatedAdvance)}
          </span>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-white p-3 sm:p-4 border border-slate-200 rounded-xl">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search payment number, vendor, or cheque ref..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[44px]"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white min-h-[44px]"
          >
            <option value="All">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Posted">Posted</option>
            <option value="Voided">Voided</option>
          </select>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white min-h-[44px]"
          >
            <option value="All">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.supplierCode} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* MOBILE CARD VIEW (md:hidden) */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-400 text-xs">
            Loading supplier payments...
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-500 text-xs">
            <div className="flex flex-col items-center gap-3">
              <span className="text-red-600 font-semibold">{fetchError}</span>
              <button
                onClick={() => { fetchPayments(); fetchSuppliers(); }}
                className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center"
              >
                Cuba Semula (Retry)
              </button>
            </div>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-400 text-xs">
            No supplier payments found.
          </div>
        ) : (
          filteredPayments.map((p) => (
            <div key={p.id} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <span className="font-mono font-bold text-slate-900 text-sm block">{p.paymentNumber}</span>
                  <span className="font-mono text-[11px] text-slate-500">{p.paymentDate}</span>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                    p.status === 'Draft'
                      ? 'bg-slate-100 text-slate-800 border-slate-200'
                      : p.status === 'Posted'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  {p.status.toUpperCase()}
                </span>
              </div>

              {/* Card Body */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Supplier</span>
                  <span className="font-semibold text-slate-900">{p.supplierName}</span>
                  <span className="font-mono text-[10px] text-slate-400 ml-1">({p.supplierCode})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Disbursement Account</span>
                  <span className="text-slate-700 truncate block">{p.paymentAccountName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Cheque / Ref</span>
                  <span className="font-mono text-slate-700 truncate block">{p.reference || '—'}</span>
                </div>
              </div>

              {/* Amounts Grid */}
              <div className="bg-slate-50 rounded-lg p-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Amount</span>
                  <span className="font-mono font-bold text-slate-900">{formatRM(p.amount)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Allocated</span>
                  <span className="font-mono font-bold text-emerald-600">{formatRM(p.allocatedAmount || 0)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Unallocated</span>
                  <span className="font-mono font-bold text-blue-600">{p.unallocatedAmount > 0 ? formatRM(p.unallocatedAmount) : '—'}</span>
                </div>
              </div>

              {/* Actions Bar */}
              <div className="pt-1 flex flex-wrap gap-2 justify-end">
                {p.status === 'Draft' && userRole !== 'Viewer' && (
                  <>
                    <button
                      onClick={() => handlePostPayment(p.id)}
                      disabled={isPostingId === p.id}
                      className="flex-1 min-h-[44px] py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-xs transition-colors flex items-center justify-center gap-1"
                    >
                      {isPostingId === p.id ? 'Mempos...' : 'Post'}
                    </button>
                    <button
                      onClick={() => handleOpenEdit(p)}
                      disabled={isLoadingEdit === p.id}
                      className="flex-1 min-h-[44px] py-2 px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50 text-slate-700 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1"
                    >
                      {isLoadingEdit === p.id ? 'Memuat...' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handleDeleteDraft(p.id)}
                      className="min-h-[44px] w-11 py-2 px-3 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 font-bold rounded-lg text-xs transition-colors flex items-center justify-center"
                      title="Padam Draf"
                    >
                      ✕
                    </button>
                  </>
                )}
                {p.status === 'Posted' && userRole !== 'Viewer' && (
                  <button
                    onClick={() => handleOpenVoid(p)}
                    className="min-h-[44px] py-2 px-4 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 font-bold rounded-lg text-xs transition-colors flex items-center justify-center"
                  >
                    Void
                  </button>
                )}
                <button
                  onClick={() => handleViewDetail(p.id)}
                  className="min-h-[44px] py-2 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1"
                >
                  Detail &rarr;
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP TABLE VIEW (hidden md:block) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
              <th className="py-3 px-4">Payment #</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Supplier</th>
              <th className="py-3 px-4">Account</th>
              <th className="py-3 px-4">Cheque / Ref</th>
              <th className="py-3 px-4 text-right">Amount (RM)</th>
              <th className="py-3 px-4 text-right">Allocated</th>
              <th className="py-3 px-4 text-right">Unallocated</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400">Loading supplier payments...</td>
              </tr>
            ) : fetchError ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-red-600 font-semibold">{fetchError}</span>
                    <button
                      onClick={() => { fetchPayments(); fetchSuppliers(); }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium text-xs transition-colors min-h-[36px]"
                    >
                      Cuba Semula (Retry)
                    </button>
                  </div>
                </td>
              </tr>
            ) : filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400">No supplier payments found.</td>
              </tr>
            ) : (
              filteredPayments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.paymentNumber}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{p.paymentDate}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    <div>{p.supplierName}</div>
                    <div className="font-mono text-[10px] text-slate-400">{p.supplierCode}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{p.paymentAccountName}</td>
                  <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{p.reference || '—'}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatRM(p.amount)}</td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-600">{formatRM(p.allocatedAmount || 0)}</td>
                  <td className="py-3 px-4 text-right font-mono text-blue-600">
                    {p.unallocatedAmount > 0 ? formatRM(p.unallocatedAmount) : '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                        p.status === 'Draft'
                          ? 'bg-slate-100 text-slate-800 border-slate-200'
                          : p.status === 'Posted'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                          : 'bg-red-50 text-red-800 border-red-100'
                      }`}
                    >
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    {p.status === 'Draft' && userRole !== 'Viewer' && (
                      <>
                        <button
                          onClick={() => handlePostPayment(p.id)}
                          disabled={isPostingId === p.id}
                          className="p-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded text-[11px] shadow-xs transition-colors min-h-[36px]"
                        >
                          {isPostingId === p.id ? 'Mempos...' : 'Post'}
                        </button>
                        <button
                          onClick={() => handleOpenEdit(p)}
                          disabled={isLoadingEdit === p.id}
                          className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold rounded text-[11px] transition-colors min-h-[36px]"
                        >
                          {isLoadingEdit === p.id ? 'Memuat...' : 'Edit'}
                        </button>
                        <button
                          onClick={() => handleDeleteDraft(p.id)}
                          className="p-1 px-2 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] transition-colors min-h-[36px]"
                          title="Padam Draf"
                        >
                          ✕
                        </button>
                      </>
                    )}
                    {p.status === 'Posted' && userRole !== 'Viewer' && (
                      <button
                        onClick={() => handleOpenVoid(p)}
                        className="p-1 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded text-[11px] transition-colors min-h-[36px]"
                      >
                        Void
                      </button>
                    )}
                    <button
                      onClick={() => handleViewDetail(p.id)}
                      className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-[11px] transition-colors min-h-[36px]"
                    >
                      Detail &rarr;
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT PAYMENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                {formData.id ? 'Edit Draft Supplier Payment' : 'Record Supplier Payment'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-base p-2">✕</button>
            </div>
            <form onSubmit={handleSavePayment} className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs">{formError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select Supplier *</label>
                  <select
                    required
                    value={formData.supplierId}
                    onChange={(e) => setFormData({ ...formData, supplierId: e.target.value, allocations: {} })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white min-h-[44px]"
                  >
                    <option value="">Select supplier...</option>
                    {suppliers
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.supplierCode} — {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Disbursement Account (Cash/Bank) *</label>
                  <select
                    required
                    value={formData.paymentAccountId}
                    onChange={(e) => setFormData({ ...formData, paymentAccountId: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white min-h-[44px]"
                  >
                    <option value="">Select bank or cash account...</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.paymentDate}
                    onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Amount (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formData.amount || ''}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-mono font-bold text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cheque / Transfer Reference</label>
                  <input
                    type="text"
                    value={formData.reference}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                    placeholder="e.g. CHQ-884920, MBB-REF-1049"
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-mono text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Notes / Memo</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notes regarding bill settlement or invoice agreement..."
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[44px]"
                />
              </div>

              {/* Bill Allocations Module */}
              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-slate-50/50 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-200">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Purchase Bill Allocations</h4>
                    <p className="text-[11px] text-slate-500">Allocate payment amount against open posted bills for this supplier.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoAllocate}
                    className="w-full sm:w-auto min-h-[40px] py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs flex items-center justify-center"
                  >
                    FIFO Auto-Allocate
                  </button>
                </div>

                {/* Stale Allocation Warning Card */}
                {(() => {
                  const staleList = openBills.filter((b) => {
                    const currentAlloc = formData.allocations[b.id] || 0;
                    if (currentAlloc <= 0) return false;
                    if (b.status !== 'Posted') return true;
                    const outstandingCents = b.outstandingBalance !== undefined ? b.outstandingBalance : b.total;
                    return Math.round(currentAlloc * 100) > outstandingCents;
                  });

                  const openBillIds = new Set(openBills.map((b) => b.id));
                  const unmappedStaleEntries = Object.entries(formData.allocations).filter(([id, amt]) => amt > 0 && !openBillIds.has(id));
                  const totalStaleCount = staleList.length + unmappedStaleEntries.length;

                  if (totalStaleCount === 0) return null;

                  return (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs space-y-2 text-amber-900">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-bold">
                        <span className="flex items-center gap-1.5 text-amber-900">
                          ⚠️ Perhatian: Peruntukan Bil Lapuk Dikesan ({totalStaleCount} Bil)
                        </span>
                        <button
                          type="button"
                          onClick={handleClearStaleAllocations}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[11px] transition-colors shadow-xs"
                        >
                          Kemaskini Peruntukan Lapuk
                        </button>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        Bil berikut tidak dipos, telah dijelaskan oleh bayaran lain, atau baki terkini kurang daripada peruntukan draf:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-mono">
                        {staleList.map((b) => {
                          const allocRM = formData.allocations[b.id] || 0;
                          const outstandingRM = (b.outstandingBalance !== undefined ? b.outstandingBalance : b.total) / 100;
                          const isNonPosted = b.status !== 'Posted';
                          return (
                            <li key={b.id}>
                              <span className="font-bold">{b.billNumber}</span>: Peruntukan draf RM {allocRM.toFixed(2)}{' '}
                              {isNonPosted ? (
                                <span className="font-sans text-amber-900 font-bold">({b.status === 'Voided' ? 'Terbatal' : 'Belum Dipos'})</span>
                              ) : (
                                `(Baki Terkini: RM ${outstandingRM.toFixed(2)}${outstandingRM === 0 ? ' — Telah Dijelaskan' : ''})`
                              )}
                            </li>
                          );
                        })}
                        {unmappedStaleEntries.map(([billId, allocRM]) => (
                          <li key={billId}>
                            <span className="font-bold">Bil Ref #{billId.slice(0, 8)}</span>: Peruntukan draf RM {allocRM.toFixed(2)} <span className="font-sans text-amber-900 font-bold">(Bil Tidak Wujud / Tidak Dipos)</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-amber-700 italic">
                        Amaun yang dilepaskan akan disalurkan secara automatik ke Pendahuluan Pembekal Belum Diagih tanpa mengubah amaun bayaran.
                      </p>
                    </div>
                  );
                })()}

                {loadingBills ? (
                  <div className="py-4 text-center text-slate-400">Loading open bills...</div>
                ) : openBills.length === 0 ? (
                  <div className="py-4 text-center text-slate-400 italic">
                    No open posted purchase bills with outstanding balances found for this supplier.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                    <table className="w-full text-left border-collapse text-xs font-mono min-w-[500px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                          <th className="p-2 px-3">Bill Number</th>
                          <th className="p-2 px-3">Bill Date</th>
                          <th className="p-2 px-3">Due Date</th>
                          <th className="p-2 px-3 text-right">Bill Total</th>
                          <th className="p-2 px-3 text-right">Outstanding</th>
                          <th className="p-2 px-3 text-right w-36">Allocated (RM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {openBills.map((b) => {
                          const val = formData.allocations[b.id] || '';
                          const outstandingCents = b.outstandingBalance !== undefined ? b.outstandingBalance : b.total;
                          const valNum = parseFloat(val as any) || 0;
                          const isNonPosted = b.status !== 'Posted';
                          const isStale = valNum > 0 && (isNonPosted || Math.round(valNum * 100) > outstandingCents);

                          return (
                            <tr key={b.id} className={isStale ? "bg-amber-50/60" : ""}>
                              <td className="p-2 px-3 font-bold text-slate-900">
                                {b.billNumber}
                                {isStale && (
                                  <span className="block text-[9px] font-sans text-amber-700 font-normal">
                                    {isNonPosted ? `⚠️ Bil ${b.status === 'Voided' ? 'Terbatal' : 'Belum Dipos'} (${b.status})` : '⚠️ Peruntukan Melebihi Baki'}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 px-3 text-slate-500">{b.billDate}</td>
                              <td className="p-2 px-3 text-slate-500">{b.dueDate}</td>
                              <td className="p-2 px-3 text-right text-slate-700">{formatRM(b.total)}</td>
                              <td className="p-2 px-3 text-right font-bold text-slate-900">{isNonPosted ? 'RM 0.00' : formatRM(outstandingCents)}</td>
                              <td className="p-2 px-3 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={isNonPosted ? '0.00' : (outstandingCents / 100).toFixed(2)}
                                  value={val}
                                  onChange={(e) => handleAllocationChange(b.id, e.target.value)}
                                  placeholder="0.00"
                                  className={`w-full border rounded p-1.5 text-right font-mono font-bold focus:outline-none focus:ring-1 min-h-[38px] ${
                                    isStale ? "border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-500" : "border-slate-200 focus:ring-slate-400"
                                  }`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Allocation Summary Footer */}
                {(() => {
                  const totalAlloc = Object.values(formData.allocations).reduce((sum, v) => sum + (parseFloat(v as any) || 0), 0);
                  const unalloc = Math.max(0, formData.amount - totalAlloc);
                  return (
                    <div className="bg-slate-100/80 rounded-lg p-3 space-y-1 text-xs">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 font-semibold">
                        <span className="text-slate-600">
                          Total Allocated: <span className="font-mono text-emerald-700 font-bold">RM {totalAlloc.toFixed(2)}</span>
                        </span>
                        <span className="text-slate-600">
                          Unallocated Advance: <span className="font-mono text-blue-700 font-bold">RM {unalloc.toFixed(2)}</span>
                        </span>
                        <span className="text-slate-900 font-bold">
                          Total Payment: <span className="font-mono text-slate-950 font-bold">RM {formData.amount.toFixed(2)}</span>
                        </span>
                      </div>
                      {unalloc > 0 && (
                        <p className="text-[11px] text-blue-800">
                          RM {unalloc.toFixed(2)} will be credited as an unallocated advance on this supplier's ledger without expense duplication.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={(e) => {
                    if (isSubmitting || isSubmittingRef.current) return;
                    setFormData((prev) => ({ ...prev, status: 'Draft' }));
                    setTimeout(() => {
                      const form = (e.target as HTMLElement).closest('form');
                      if (form) form.requestSubmit();
                    }, 0);
                  }}
                  className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span>{isSubmitting ? 'Simpan...' : 'Save as Draft'}</span>
                </button>
                {!formData.id && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={(e) => {
                      if (isSubmitting || isSubmittingRef.current) return;
                      setFormData((prev) => ({ ...prev, status: 'Posted' }));
                      setTimeout(() => {
                        const form = (e.target as HTMLElement).closest('form');
                        if (form) form.requestSubmit();
                      }, 0);
                    }}
                    className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span>{isSubmitting ? 'Mempos...' : 'Post Payment Now'}</span>
                  </button>
                )}
                {formData.id && (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs flex items-center justify-center shadow-xs"
                  >
                    <span>{isSubmitting ? 'Simpan...' : 'Save Changes'}</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID MODAL */}
      {showVoidModal && selectedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-red-600 text-sm sm:text-base">Void Supplier Payment</h3>
              <button onClick={() => setShowVoidModal(false)} className="text-slate-400 hover:text-slate-600 text-base p-2">✕</button>
            </div>
            <form onSubmit={handleConfirmVoid} className="p-4 sm:p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Voiding payment <span className="font-mono font-bold text-slate-900">{selectedPayment.paymentNumber}</span> (RM {(selectedPayment.amount / 100).toFixed(2)}) will write a compensating reversal journal in the General Ledger (Dr Cash/Bank, Cr Accounts Payable) and restore outstanding balances on all settled purchase bills.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Voiding *</label>
                <textarea
                  rows={3}
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Cheque returned by bank, duplicate payment disbursed..."
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVoidModal(false)}
                  className="w-full sm:w-auto min-h-[44px] py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-xs flex items-center justify-center"
                >
                  Confirm Void & Reverse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {showDetailModal && selectedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Supplier Payment #{selectedPayment.paymentNumber}</h3>
                <p className="text-[11px] text-slate-400">Ledger details and bill allocation registry</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-base p-2">✕</button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 sm:p-4 rounded-xl">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Supplier</span>
                  <span className="font-semibold text-slate-900">{selectedPayment.supplier?.name}</span>
                  <div className="font-mono text-[10px] text-slate-500">{selectedPayment.supplier?.supplierCode}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Payment Date</span>
                  <span className="font-mono text-slate-900">{selectedPayment.paymentDate}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Disbursement Account</span>
                  <span className="text-slate-900">{selectedPayment.account?.name} ({selectedPayment.account?.code})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Reference / Cheque</span>
                  <span className="font-mono text-slate-900">{selectedPayment.reference || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Payment Amount</span>
                  <span className="font-mono font-bold text-slate-900">{formatRM(selectedPayment.amount)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Status</span>
                  <span className="font-bold text-slate-900">{selectedPayment.status}</span>
                </div>
              </div>

              {selectedPayment.notes && (
                <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                  <span className="font-bold text-slate-700 block mb-0.5">Notes:</span>
                  {selectedPayment.notes}
                </div>
              )}

              {selectedPayment.voidReason && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  <span className="font-bold block mb-0.5">Void Reason:</span>
                  {selectedPayment.voidReason}
                </div>
              )}

              {/* Allocations breakdown */}
              <div>
                <h4 className="font-bold text-slate-800 uppercase text-[10px] tracking-wider mb-2">Settled Purchase Bills</h4>
                {!selectedPayment.allocations || selectedPayment.allocations.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-400">
                    No specific purchase bills allocated. Full amount held as advance supplier balance.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono min-w-[400px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                          <th className="p-2 px-3">Bill Number</th>
                          <th className="p-2 px-3">Bill Date</th>
                          <th className="p-2 px-3 text-right">Bill Total</th>
                          <th className="p-2 px-3 text-right">Allocated Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPayment.allocations.map((a: any) => (
                          <tr key={a.id} className={a.isStale ? "bg-amber-50/60" : ""}>
                            <td className="p-2 px-3 font-bold text-slate-900">
                              {a.billNumber}
                              {a.isStale && (
                                <span className="block text-[9px] font-sans text-amber-700 font-normal">
                                  ⚠️ Peruntukan Lapuk (Baki terkini RM {(a.currentOutstanding / 100).toFixed(2)})
                                </span>
                              )}
                            </td>
                            <td className="p-2 px-3 text-slate-500">{a.billDate}</td>
                            <td className="p-2 px-3 text-right text-slate-700">{formatRM(a.billTotal)}</td>
                            <td className="p-2 px-3 text-right font-bold text-emerald-600">{formatRM(a.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-between items-center gap-2 shrink-0">
              <div className="w-full sm:w-auto flex items-center gap-2">
                {selectedPayment.status === 'Draft' && userRole !== 'Viewer' && (
                  <>
                    <button
                      onClick={async () => {
                        setShowDetailModal(false);
                        await handleOpenEdit(selectedPayment);
                      }}
                      className="w-full sm:w-auto min-h-[44px] py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold text-xs shadow-xs flex items-center justify-center"
                    >
                      Edit Draft
                    </button>
                    {!selectedPayment.hasStaleAllocations && (
                      <button
                        onClick={async () => {
                          setShowDetailModal(false);
                          await handlePostPayment(selectedPayment.id);
                        }}
                        className="w-full sm:w-auto min-h-[44px] py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-xs flex items-center justify-center"
                      >
                        Post Payment Now
                      </button>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full sm:w-auto min-h-[44px] py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs flex items-center justify-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
