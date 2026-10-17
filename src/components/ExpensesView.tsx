import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  Info, 
  Wallet, 
  Filter, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft,
  Calendar,
  FileText,
  Clock,
  ShieldAlert
} from 'lucide-react';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subType: string;
  active: boolean;
}

interface Expense {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  description: string;
  reference?: string | null;
  amount: number;
  notes?: string | null;
  status: 'Draft' | 'Posted' | 'Voided';
  postedJournalId?: string | null;
  reversalJournalId?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  expenseAccountId: string;
  paymentAccountId: string;
  expenseAccount?: Account | null;
  paymentAccount?: Account | null;
  creator?: { uid: string; name: string; email: string; role: string } | null;
  voider?: { uid: string; name: string; email: string; role: string } | null;
}

interface ExpenseMetrics {
  totalPostedCents: number;
  draftCount: number;
  postedCount: number;
  voidedCount: number;
  categoryBreakdown: Array<{
    accountId: string;
    accountName: string;
    accountCode: string;
    totalCents: number;
  }>;
}

interface ExpensesViewProps {
  accounts: Account[];
  token: string | null;
  userRole: string;
}

const formatRM = (cents: number) => {
  const isNegative = cents < 0;
  const absValue = Math.abs(cents) / 100;
  const formattedStr = absValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `RM (${formattedStr})` : `RM ${formattedStr}`;
};

export default function ExpensesView({ accounts, token, userRole }: ExpensesViewProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [metrics, setMetrics] = useState<ExpenseMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExpenseAccount, setSelectedExpenseAccount] = useState('');
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState('');

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [detailExpense, setDetailExpense] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [voidingExpenseId, setVoidingExpenseId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Form state
  const [formExpenseDate, setFormExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDescription, setFormDescription] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formExpenseAccountId, setFormExpenseAccountId] = useState('');
  const [formPaymentAccountId, setFormPaymentAccountId] = useState('');
  const [formAmountRM, setFormAmountRM] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitDirectlyPosted, setFormSubmitDirectlyPosted] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter eligible accounts
  const eligibleExpenseAccounts = accounts.filter(a => a.active && a.type === 'Expense');
  const eligiblePaymentAccounts = accounts.filter(a => a.active && a.type === 'Asset');

  const fetchExpenses = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedExpenseAccount) params.append('expenseAccountId', selectedExpenseAccount);
      if (selectedPaymentAccount) params.append('paymentAccountId', selectedPaymentAccount);

      const [resList, resMetrics] = await Promise.all([
        fetch(`/api/expenses?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/expenses/metrics', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!resList.ok) {
        const data = await resList.json();
        throw new Error(data.error || 'Failed to load expenses');
      }
      if (!resMetrics.ok) {
        const data = await resMetrics.json();
        throw new Error(data.error || 'Failed to load expense metrics');
      }

      const listData = await resList.json();
      const metricsData = await resMetrics.json();

      setExpenses(listData);
      setMetrics(metricsData);
    } catch (err: any) {
      console.error("Load expenses error:", err);
      setError(err.message || 'Error loading expense data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [token, statusFilter, selectedExpenseAccount, selectedPaymentAccount]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchExpenses();
  };

  const openCreateModal = () => {
    setEditingExpense(null);
    setFormExpenseDate(new Date().toISOString().split('T')[0]);
    setFormDescription('');
    setFormReference('');
    setFormExpenseAccountId(eligibleExpenseAccounts.length > 0 ? eligibleExpenseAccounts[0].id : '');
    setFormPaymentAccountId(eligiblePaymentAccounts.length > 0 ? eligiblePaymentAccounts[0].id : '');
    setFormAmountRM('');
    setFormNotes('');
    setFormSubmitDirectlyPosted(false);
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setFormExpenseDate(exp.expenseDate);
    setFormDescription(exp.description);
    setFormReference(exp.reference || '');
    setFormExpenseAccountId(exp.expenseAccountId);
    setFormPaymentAccountId(exp.paymentAccountId);
    setFormAmountRM((exp.amount / 100).toFixed(2));
    setFormNotes(exp.notes || '');
    setFormSubmitDirectlyPosted(false);
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'Viewer') {
      setFormError("Viewer role cannot perform modifications.");
      return;
    }

    setFormError(null);
    setFormSubmitting(true);

    try {
      const parsedAmountFloat = parseFloat(formAmountRM);
      if (isNaN(parsedAmountFloat) || parsedAmountFloat <= 0) {
        throw new Error("Amount must be a positive number greater than 0.00");
      }
      const amountCents = Math.round(parsedAmountFloat * 100);

      if (!formDescription.trim()) {
        throw new Error("Description is required");
      }
      if (!formExpenseAccountId) {
        throw new Error("Please select an Expense Account");
      }
      if (!formPaymentAccountId) {
        throw new Error("Please select a Payment Account");
      }
      if (formExpenseAccountId === formPaymentAccountId) {
        throw new Error("Expense Account and Payment Account cannot be identical");
      }

      if (editingExpense) {
        // Edit draft
        const res = await fetch(`/api/expenses/${editingExpense.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            expenseDate: formExpenseDate,
            description: formDescription.trim(),
            reference: formReference.trim() || undefined,
            expenseAccountId: formExpenseAccountId,
            paymentAccountId: formPaymentAccountId,
            amount: amountCents,
            notes: formNotes.trim() || undefined,
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update draft expense');

        setSuccessMsg(`Draft expense ${data.expenseNumber} updated successfully.`);
      } else {
        // Create new
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            expenseDate: formExpenseDate,
            description: formDescription.trim(),
            reference: formReference.trim() || undefined,
            expenseAccountId: formExpenseAccountId,
            paymentAccountId: formPaymentAccountId,
            amount: amountCents,
            notes: formNotes.trim() || undefined,
            status: formSubmitDirectlyPosted ? 'Posted' : 'Draft',
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create expense');

        setSuccessMsg(
          formSubmitDirectlyPosted
            ? `Expense ${data.expenseNumber} recorded and posted to General Ledger.`
            : `Draft expense ${data.expenseNumber} created successfully.`
        );
      }

      setIsCreateModalOpen(false);
      fetchExpenses();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Expense form error:", err);
      setFormError(err.message || 'An error occurred');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePostExpense = async (id: string, expenseNumber: string) => {
    if (userRole === 'Viewer') return;
    if (!confirm(`Are you sure you want to post ${expenseNumber} to the General Ledger? This action generates an immutable journal entry.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/expenses/${id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post expense');

      setSuccessMsg(`Expense ${expenseNumber} successfully posted to General Ledger.`);
      fetchExpenses();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Post expense error:", err);
      setError(err.message || 'Error posting expense');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDeleteDraft = async (id: string, expenseNumber: string) => {
    if (userRole === 'Viewer') return;
    if (!confirm(`Permanently delete draft expense ${expenseNumber}? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete draft expense');

      setSuccessMsg(`Draft expense ${expenseNumber} deleted.`);
      fetchExpenses();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Delete draft expense error:", err);
      setError(err.message || 'Error deleting draft expense');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleOpenVoidModal = (id: string) => {
    setVoidingExpenseId(id);
    setVoidReason('');
  };

  const handleConfirmVoid = async () => {
    if (!voidingExpenseId || !voidReason.trim()) return;
    try {
      const res = await fetch(`/api/expenses/${voidingExpenseId}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: voidReason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to void expense');

      setSuccessMsg("Expense voided successfully. Compensating reversal journal committed.");
      setVoidingExpenseId(null);
      setVoidReason('');
      fetchExpenses();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Void expense error:", err);
      setError(err.message || 'Error voiding expense');
      setTimeout(() => setError(null), 5000);
    }
  };

  const openDetailDrawer = async (id: string) => {
    setIsDetailLoading(true);
    setDetailExpense(null);
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load expense detail');
      }
      const data = await res.json();
      setDetailExpense(data);
    } catch (err: any) {
      console.error("Detail error:", err);
      setError(err.message || 'Failed to load expense details');
    } finally {
      setIsDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner / Success alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">&times;</button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold">&times;</button>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-slate-800" />
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Direct Expenses Management</h2>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Record direct operating expenses paid out of cash or bank accounts with real-time double-entry ledger integration.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchExpenses}
            className="p-2 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {userRole !== 'Viewer' ? (
            <button
              onClick={openCreateModal}
              className="py-2 px-4 bg-slate-900 text-white font-medium text-sm rounded-md hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          ) : (
            <div className="text-xs text-slate-400 font-medium bg-slate-100 py-1.5 px-3 rounded border border-slate-200">
              Read-Only (Viewer)
            </div>
          )}
        </div>
      </div>

      {/* KPI Metrics Summary Cards */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Posted Expenses</span>
            <div className="text-2xl font-bold text-slate-900 mt-2">
              {formatRM(metrics.totalPostedCents)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active ledger commitment across {metrics.postedCount} transaction(s)
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Drafts</span>
            <div className="text-2xl font-bold text-amber-600 mt-2">
              {metrics.draftCount}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Unposted drafts awaiting review or ledger commitment
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Voided Reversals</span>
            <div className="text-2xl font-bold text-rose-600 mt-2">
              {metrics.voidedCount}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Reversed transactions with compensating journals
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Top Category</span>
            <div className="text-base font-bold text-slate-900 mt-2 truncate">
              {metrics.categoryBreakdown.length > 0
                ? `${metrics.categoryBreakdown[0].accountName}`
                : 'No Expenses'}
            </div>
            <p className="text-xs text-slate-500 mt-1 truncate">
              {metrics.categoryBreakdown.length > 0
                ? `${formatRM(metrics.categoryBreakdown[0].totalCents)} (${metrics.categoryBreakdown[0].accountCode})`
                : 'Zero posted expenses'}
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-wrap gap-3 items-center justify-between shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-md text-xs font-medium">
            {['All', 'Draft', 'Posted', 'Voided'].map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`py-1 px-3 rounded transition-colors ${statusFilter === tab ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Expense Account Filter */}
          <select
            value={selectedExpenseAccount}
            onChange={(e) => setSelectedExpenseAccount(e.target.value)}
            className="text-xs border border-slate-200 bg-white rounded-md px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">All Expense Accounts</option>
            {eligibleExpenseAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.code} - {acc.name}
              </option>
            ))}
          </select>

          {/* Payment Account Filter */}
          <select
            value={selectedPaymentAccount}
            onChange={(e) => setSelectedPaymentAccount(e.target.value)}
            className="text-xs border border-slate-200 bg-white rounded-md px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">All Payment Accounts</option>
            {eligiblePaymentAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.code} - {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ref or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs border border-slate-200 bg-white rounded-md pl-8 pr-3 py-1.5 w-56 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <button
            type="submit"
            className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Expense #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Expense Account</th>
                <th className="py-3 px-4">Payment Account</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading && expenses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-slate-500" />
                    Loading expenses register...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No expense records found matching current criteria.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                      {exp.expenseNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {exp.expenseDate}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-800">
                      {exp.description}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {exp.expenseAccount ? (
                        <span title={exp.expenseAccount.name}>
                          <span className="font-mono text-slate-500 mr-1">{exp.expenseAccount.code}</span>
                          {exp.expenseAccount.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">Unknown Account</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {exp.paymentAccount ? (
                        <span title={exp.paymentAccount.name}>
                          <span className="font-mono text-slate-500 mr-1">{exp.paymentAccount.code}</span>
                          {exp.paymentAccount.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">Unknown Account</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {exp.reference || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap font-mono">
                      {formatRM(exp.amount)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {exp.status === 'Draft' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          Draft
                        </span>
                      )}
                      {exp.status === 'Posted' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle className="w-3 h-3" />
                          Posted
                        </span>
                      )}
                      {exp.status === 'Voided' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3 h-3" />
                          Voided
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openDetailDrawer(exp.id)}
                          className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {exp.status === 'Draft' && userRole !== 'Viewer' && (
                          <>
                            <button
                              onClick={() => openEditModal(exp)}
                              className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                              title="Edit Draft"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handlePostExpense(exp.id, exp.expenseNumber)}
                              className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded"
                              title="Post to General Ledger"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDraft(exp.id, exp.expenseNumber)}
                              className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded"
                              title="Delete Draft"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {exp.status === 'Posted' && userRole !== 'Viewer' && (
                          <button
                            onClick={() => handleOpenVoidModal(exp.id)}
                            className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded"
                            title="Void Expense (Compensating Reversal)"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT DRAFT EXPENSE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingExpense ? `Edit Draft Expense: ${editingExpense.expenseNumber}` : 'Record Direct Expense'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Direct operating payment from Bank or Cash account.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={formExpenseDate}
                    onChange={(e) => setFormExpenseDate(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Receipt / Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. REC-88392, TNB-OCT26"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description / Purpose *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Office electricity bill for October 2026"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full border border-slate-200 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expense Account (Debit) *</label>
                  <select
                    required
                    value={formExpenseAccountId}
                    onChange={(e) => setFormExpenseAccountId(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="">Select Expense Account</option>
                    {eligibleExpenseAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Account (Credit) *</label>
                  <select
                    required
                    value={formPaymentAccountId}
                    onChange={(e) => setFormPaymentAccountId(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="">Select Cash / Bank Account</option>
                    {eligiblePaymentAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Amount (MYR) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">RM</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formAmountRM}
                    onChange={(e) => setFormAmountRM(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 pl-10 text-slate-900 font-bold text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Stored as integer cents ({formAmountRM ? Math.round(parseFloat(formAmountRM || '0') * 100) : 0} cents)
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes / Memo (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional context or internal references..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="py-2 px-3 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium transition-colors"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2">
                  {!editingExpense ? (
                    <>
                      <button
                        type="submit"
                        disabled={formSubmitting}
                        onClick={() => setFormSubmitDirectlyPosted(false)}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded transition-colors"
                      >
                        Save as Draft
                      </button>
                      <button
                        type="submit"
                        disabled={formSubmitting}
                        onClick={() => setFormSubmitDirectlyPosted(true)}
                        className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Post to Ledger</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="submit"
                      disabled={formSubmitting}
                      className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded transition-colors"
                    >
                      Update Draft
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID REASON MODAL */}
      {voidingExpenseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-5 text-xs">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm mb-2">
              <ShieldAlert className="w-5 h-5" />
              <span>Void Direct Expense</span>
            </div>
            <p className="text-slate-600 mb-4 leading-relaxed">
              Voiding a posted expense preserves the original ledger entry and generates a compensating reversal journal entry to restore account balances.
            </p>

            <div className="mb-4">
              <label className="block font-semibold text-slate-700 mb-1">Reason for Voiding *</label>
              <textarea
                rows={3}
                required
                placeholder="State reason (e.g. Duplicate entry, incorrect receipt amount, refunded by merchant)..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full border border-slate-200 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setVoidingExpenseId(null)}
                className="py-1.5 px-3 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!voidReason.trim()}
                onClick={handleConfirmVoid}
                className="py-1.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded transition-colors disabled:opacity-50"
              >
                Confirm & Post Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSE DETAIL DRAWER */}
      {detailExpense && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Expense Record</span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">{detailExpense.expenseNumber}</h3>
              </div>
              <div className="flex items-center gap-3">
                {detailExpense.status === 'Draft' && (
                  <span className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Draft
                  </span>
                )}
                {detailExpense.status === 'Posted' && (
                  <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Posted
                  </span>
                )}
                {detailExpense.status === 'Voided' && (
                  <span className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    Voided
                  </span>
                )}
                <button
                  onClick={() => setDetailExpense(null)}
                  className="p-1 text-slate-400 hover:text-slate-800 text-lg leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 text-xs flex-1">
              {/* Void Banner if voided */}
              {detailExpense.status === 'Voided' && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Transaction Voided</span>
                  </div>
                  <p className="text-slate-600">
                    <strong>Reason:</strong> {detailExpense.voidReason}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Voided on {detailExpense.voidedAt ? new Date(detailExpense.voidedAt).toLocaleString() : '—'} by {detailExpense.voider?.name || detailExpense.voidedBy || 'Authorized Staff'}
                  </p>
                </div>
              )}

              {/* Main Info Card */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Amount</span>
                  <span className="text-xl font-bold font-mono text-slate-900">{formatRM(detailExpense.amount)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Expense Date</span>
                    <span className="font-medium text-slate-800">{detailExpense.expenseDate}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Reference / Receipt</span>
                    <span className="font-medium text-slate-800">{detailExpense.reference || 'None'}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Description</span>
                  <span className="font-medium text-slate-800">{detailExpense.description}</span>
                </div>
                {detailExpense.notes && (
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Notes</span>
                    <span className="font-medium text-slate-600">{detailExpense.notes}</span>
                  </div>
                )}
              </div>

              {/* Accounts Card */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2">Accounting Distribution</h4>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                  <div className="p-3 bg-white flex items-center justify-between">
                    <div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 mr-2">DEBIT</span>
                      <span className="font-medium text-slate-800">
                        {detailExpense.expenseAccount ? `${detailExpense.expenseAccount.code} - ${detailExpense.expenseAccount.name}` : 'Expense Account'}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">{formatRM(detailExpense.amount)}</span>
                  </div>
                  <div className="p-3 bg-white flex items-center justify-between">
                    <div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 mr-2">CREDIT</span>
                      <span className="font-medium text-slate-800">
                        {detailExpense.paymentAccount ? `${detailExpense.paymentAccount.code} - ${detailExpense.paymentAccount.name}` : 'Cash/Bank Account'}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">{formatRM(detailExpense.amount)}</span>
                  </div>
                </div>
              </div>

              {/* Linked Journal Card */}
              {detailExpense.postedJournal && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-2">Committed Journal Entry</h4>
                  <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>Entry Date: {detailExpense.postedJournal.entryDate}</span>
                      <span className="font-mono">Ref: {detailExpense.postedJournal.reference}</span>
                    </div>
                    <div className="text-slate-700 italic">
                      {detailExpense.postedJournal.description}
                    </div>
                    <div className="pt-2 border-t border-slate-100 space-y-1">
                      {detailExpense.postedJournal.lines?.map((line: any) => (
                        <div key={line.id} className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-600">
                            {line.account?.code} - {line.account?.name}
                          </span>
                          <span className="font-mono">
                            {line.debit > 0 ? `DR ${formatRM(line.debit)}` : `CR ${formatRM(line.credit)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Reversal Journal Card */}
              {detailExpense.reversalJournal && (
                <div>
                  <h4 className="font-bold text-rose-700 mb-2">Compensating Reversal Journal</h4>
                  <div className="border border-rose-200 rounded-lg p-3 bg-rose-50/50 space-y-2">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>Reversal Date: {detailExpense.reversalJournal.entryDate}</span>
                      <span className="font-mono">Ref: {detailExpense.reversalJournal.reference}</span>
                    </div>
                    <div className="text-slate-700 italic">
                      {detailExpense.reversalJournal.description}
                    </div>
                    <div className="pt-2 border-t border-rose-100 space-y-1">
                      {detailExpense.reversalJournal.lines?.map((line: any) => (
                        <div key={line.id} className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-600">
                            {line.account?.code} - {line.account?.name}
                          </span>
                          <span className="font-mono font-semibold">
                            {line.debit > 0 ? `DR ${formatRM(line.debit)}` : `CR ${formatRM(line.credit)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Audit Trail */}
              {detailExpense.auditLogs && detailExpense.auditLogs.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-2">Audit History</h4>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden bg-white">
                    {detailExpense.auditLogs.map((log: any) => (
                      <div key={log.id} className="p-3 text-[11px] space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{log.action}</span>
                          <span className="text-slate-400">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-500">Actor: {log.userId}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setDetailExpense(null)}
                className="py-2 px-4 bg-slate-900 text-white font-medium rounded hover:bg-slate-800 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
