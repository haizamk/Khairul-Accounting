import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  DollarSign,
  Layers,
  ArrowRightLeft,
  Check,
  ShieldAlert,
  Tag,
  BookOpen,
  Filter,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';

export interface CatalogueItem {
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

// Fallback helper in case other modules import it synchronously
export function getSavedCatalogueItems(): CatalogueItem[] {
  return [];
}

interface CatalogueViewProps {
  accounts?: any[];
  token?: string | null;
  userRole?: string;
  initialSearch?: string | null;
}

const COMMON_UNITS = [
  { value: 'kg', label: 'kg (Kilogram)' },
  { value: 'ekor', label: 'ekor (Ekor Ternakan)' },
  { value: 'unit', label: 'unit (Unit / Paket)' },
];

const INCOME_CATEGORIES = [
  'Hasil Jualan Ayam & Daging',
  'Hasil Jualan Makanan Laut',
  'Hasil Jualan Runcit & Barangan Basah',
  'Hasil Perkhidmatan Penghantaran',
  'Lain-lain Hasil Perniagaan',
];

const EXPENSE_CATEGORIES = [
  'Kos Barang Dijual (COGS)',
  'Kos Belian Stok Ternakan',
  'Kos Pembungkusan & Bekalan',
  'Belanja Pengangkutan & Logistik',
  'Belanja Operasi Am',
];

export default function CatalogueView({ accounts = [], token, userRole = 'Admin', initialSearch }: CatalogueViewProps) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [unitFilter, setUnitFilter] = useState<string>('All');

  useEffect(() => {
    if (initialSearch !== undefined && initialSearch !== null) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogueItem | null>(null);

  // Form State
  const [productCode, setProductCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Unit logic state (Phase 3 requirements)
  const [purchaseUnit, setPurchaseUnit] = useState('kg');
  const [salesUnit, setSalesUnit] = useState('kg');
  const [isSalesUnitCustomized, setIsSalesUnitCustomized] = useState(false);

  // Sales Info
  const [sellingPriceRM, setSellingPriceRM] = useState('');
  const [incomeCategory, setIncomeCategory] = useState(INCOME_CATEGORIES[0]);
  const [incomeAccountId, setIncomeAccountId] = useState('');

  // Purchase Info
  const [purchaseCostRM, setPurchaseCostRM] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expenseAccountId, setExpenseAccountId] = useState('');

  // Notifications & Feedback
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isViewer = userRole === 'Viewer';

  // Revenue and Expense account filters
  const revenueAccounts = useMemo(() => {
    return (accounts || []).filter((a: any) => a.active && a.type === 'Revenue');
  }, [accounts]);

  const expenseAccounts = useMemo(() => {
    return (accounts || []).filter((a: any) => a.active && a.type === 'Expense');
  }, [accounts]);

  // Fetch products from backend
  const fetchProducts = async () => {
    try {
      setLoading(true);
      setErrorBanner('');
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (statusFilter !== 'All') params.append('status', statusFilter);

      const res = await fetch(`/api/products?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal memuatkan senarai produk.');
      }

      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      console.error('Fetch products failed:', err);
      setErrorBanner(err.message || 'Ralat sambungan ke pangkalan data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [searchQuery, statusFilter, token]);

  // Handle Purchase Unit change with auto-sync rule (Phase 3)
  const handlePurchaseUnitChange = (val: string) => {
    setPurchaseUnit(val);
    // Only auto-update sales unit if user hasn't explicitly customized sales unit
    if (!isSalesUnitCustomized) {
      setSalesUnit(val);
    }
  };

  // Handle Sales Unit change
  const handleSalesUnitChange = (val: string) => {
    setSalesUnit(val);
    setIsSalesUnitCustomized(true);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    if (isViewer) return;
    setEditingItem(null);
    setProductCode(`PRD-${Math.floor(100 + Math.random() * 900)}`);
    setName('');
    setDescription('');
    setIsActive(true);

    // Default units to kg
    setPurchaseUnit('kg');
    setSalesUnit('kg');
    setIsSalesUnitCustomized(false);

    setSellingPriceRM('');
    setPurchaseCostRM('');

    setIncomeCategory(INCOME_CATEGORIES[0]);
    setExpenseCategory(EXPENSE_CATEGORIES[0]);

    // Preselect standard accounts if available
    const defRev = revenueAccounts.find((a: any) => a.code === '4000') || revenueAccounts[0];
    const defExp = expenseAccounts.find((a: any) => a.code === '5000') || expenseAccounts[0];
    setIncomeAccountId(defRev ? defRev.id : '');
    setExpenseAccountId(defExp ? defExp.id : '');

    setErrorBanner('');
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: CatalogueItem) => {
    if (isViewer) return;
    setEditingItem(item);
    setProductCode(item.productCode);
    setName(item.name);
    setDescription(item.description || '');
    setIsActive(item.isActive);

    setPurchaseUnit(item.purchaseUnit || 'unit');
    setSalesUnit(item.salesUnit || 'unit');
    // If current purchase and sales units are already different, mark as customized
    setIsSalesUnitCustomized(item.purchaseUnit !== item.salesUnit);

    setSellingPriceRM((item.sellingPrice / 100).toFixed(2));
    setPurchaseCostRM((item.purchaseCost / 100).toFixed(2));

    setIncomeCategory(item.incomeCategory || INCOME_CATEGORIES[0]);
    setExpenseCategory(item.expenseCategory || EXPENSE_CATEGORIES[0]);

    setIncomeAccountId(item.incomeAccountId || '');
    setExpenseAccountId(item.expenseAccountId || '');

    setErrorBanner('');
    setShowModal(true);
  };

  // Handle Save (Create or Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewer) return;

    if (!productCode.trim()) {
      setErrorBanner('Kod Produk / SKU diperlukan.');
      return;
    }
    if (!name.trim()) {
      setErrorBanner('Nama produk / perkhidmatan diperlukan.');
      return;
    }

    const priceNum = parseFloat(sellingPriceRM);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorBanner('Harga jualan mestilah nombor sah yang tidak negatif.');
      return;
    }

    const costNum = purchaseCostRM.trim() ? parseFloat(purchaseCostRM) : 0;
    if (isNaN(costNum) || costNum < 0) {
      setErrorBanner('Kos belian mestilah nombor sah yang tidak negatif.');
      return;
    }

    const payload = {
      productCode: productCode.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim() || null,
      isActive,
      salesUnit: salesUnit.trim().toLowerCase(),
      sellingPrice: Math.round(priceNum * 100),
      incomeCategory,
      incomeAccountId: incomeAccountId || null,
      purchaseUnit: purchaseUnit.trim().toLowerCase(),
      purchaseCost: Math.round(costNum * 100),
      expenseCategory,
      expenseAccountId: expenseAccountId || null,
    };

    try {
      setSubmitting(true);
      setErrorBanner('');

      const url = editingItem ? `/api/products/${editingItem.id}` : '/api/products';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal menyimpan rekod produk ke pangkalan data.');
      }

      setSuccessBanner(editingItem ? 'Produk berjaya dikemaskini dalam pangkalan data!' : 'Produk baharu berjaya disimpan!');
      setShowModal(false);
      await fetchProducts();

      setTimeout(() => {
        setSuccessBanner('');
      }, 4000);
    } catch (err: any) {
      console.error('Save product error:', err);
      setErrorBanner(err.message || 'Ralat semasa menyimpan produk.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Status Toggle
  const handleToggleStatus = async (item: CatalogueItem) => {
    if (isViewer) return;
    try {
      const nextStatus = !item.isActive;
      const res = await fetch(`/api/products/${item.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal menukar status produk.');
      }

      setSuccessBanner(`Status produk '${item.name}' ditukar kepada ${nextStatus ? 'Aktif' : 'Tidak Aktif'}.`);
      await fetchProducts();

      setTimeout(() => {
        setSuccessBanner('');
      }, 3500);
    } catch (err: any) {
      console.error('Toggle status error:', err);
      setErrorBanner(err.message || 'Ralat menukar status.');
    }
  };

  // Filter items by unit if selected
  const displayedItems = useMemo(() => {
    if (unitFilter === 'All') return items;
    return items.filter(
      (i) => i.salesUnit.toLowerCase() === unitFilter.toLowerCase() || i.purchaseUnit.toLowerCase() === unitFilter.toLowerCase()
    );
  }, [items, unitFilter]);

  // Quick stats
  const activeCount = items.filter((i) => i.isActive).length;
  const inactiveCount = items.filter((i) => !i.isActive).length;
  const differingUnitCount = items.filter((i) => i.purchaseUnit.toLowerCase() !== i.salesUnit.toLowerCase()).length;
  const avgSellingPrice = items.length > 0 ? items.reduce((acc, i) => acc + i.sellingPrice, 0) / items.length : 0;

  return (
    <div className="space-y-6 text-sm">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Katalog Produk & Perkhidmatan
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Pusat rujukan tunggal bagi maklumat produk, unit belian & jualan, harga piawai, dan pemetaan akaun lejar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchProducts}
            title="Muat semula senarai dari pangkalan data"
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {!isViewer && (
            <button
              onClick={handleOpenAdd}
              className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Produk / Servis</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {errorBanner && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {isViewer && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Akses Penonton (Viewer): Anda hanya boleh melihat katalog produk dan tidak dibenarkan membuat perubahan master.</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Produk Aktif</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-slate-900">{activeCount}</span>
            <span className="text-xs text-slate-500 font-medium">/ {items.length} item</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Unit Berbeza (95% Sama)</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-blue-600">{differingUnitCount}</span>
            <span className="text-[11px] text-slate-500">unit belian ≠ jualan</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Purata Harga Jualan</span>
          <span className="text-xl font-bold font-mono text-emerald-600">
            RM {(avgSellingPrice / 100).toFixed(2)}
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Item Tidak Aktif</span>
          <span className="text-xl font-bold font-mono text-slate-500">{inactiveCount}</span>
        </div>
      </div>

      {/* Filters & Search Control */}
      <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-xs flex flex-col md:flex-row justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari mengikut kod SKU atau nama produk/servis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Pills */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('All')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === 'All' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('Active')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === 'Active' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Aktif ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('Inactive')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === 'Inactive' ? 'bg-white text-slate-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Tidak Aktif ({inactiveCount})
            </button>
          </div>

          {/* Unit Filter */}
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="py-1.5 px-3 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="All">Semua Unit</option>
            <option value="kg">kg (Kilogram)</option>
            <option value="ekor">ekor</option>
            <option value="unit">unit</option>
          </select>
        </div>
      </div>

      {/* Product Master Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4 w-28">Kod SKU</th>
                <th className="py-3 px-4 min-w-[200px]">Nama Produk & Servis</th>
                <th className="py-3 px-4 w-36">Unit (Belian / Jualan)</th>
                <th className="py-3 px-4 w-28 text-right">Harga Jualan</th>
                <th className="py-3 px-4 w-28 text-right">Kos Belian</th>
                <th className="py-3 px-4 min-w-[180px]">Pemetaan Akaun Lejar</th>
                <th className="py-3 px-4 w-24 text-center">Status</th>
                <th className="py-3 px-4 w-28 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Memuatkan katalog produk dari pangkalan data...
                  </td>
                </tr>
              ) : displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Tiada produk atau perkhidmatan dijumpai.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery ? 'Cuba ubah carian kata kunci anda.' : 'Klik "Tambah Produk / Servis" untuk mendaftar produk pertama.'}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedItems.map((item) => {
                  const incomeAcc = (accounts || []).find((a: any) => a.id === item.incomeAccountId);
                  const expenseAcc = (accounts || []).find((a: any) => a.id === item.expenseAccountId);
                  const isUnitSame = item.purchaseUnit.toLowerCase() === item.salesUnit.toLowerCase();

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {item.productCode}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{item.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isUnitSame ? (
                          <span className="inline-flex items-center gap-1 font-mono px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium text-[11px]">
                            {item.salesUnit}
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 font-mono px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
                              Beli: {item.purchaseUnit}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded text-[10px] font-semibold">
                              Jual: {item.salesUnit}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        RM {(item.sellingPrice / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-600">
                        RM {(item.purchaseCost / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5 text-[11px]">
                          <div className="flex items-center gap-1 text-emerald-700">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hasil:</span>
                            <span className="truncate" title={incomeAcc ? `${incomeAcc.code} - ${incomeAcc.name}` : item.incomeCategory || '—'}>
                              {incomeAcc ? `${incomeAcc.code} ${incomeAcc.name}` : (item.incomeCategory || '—')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-600">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Kos:</span>
                            <span className="truncate" title={expenseAcc ? `${expenseAcc.code} - ${expenseAcc.name}` : item.expenseCategory || '—'}>
                              {expenseAcc ? `${expenseAcc.code} ${expenseAcc.name}` : (item.expenseCategory || '—')}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {item.isActive ? 'Aktif' : 'Tidak Aktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isViewer && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(item)}
                                title="Edit Maklumat Produk"
                                className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-blue-600 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleStatus(item)}
                                title={item.isActive ? 'Nyahaktifkan item' : 'Aktifkan semula item'}
                                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                                  item.isActive
                                    ? 'bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {item.isActive ? 'Nyahaktif' : 'Aktifkan'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingItem ? 'Kemaskini Produk / Perkhidmatan' : 'Daftar Produk / Perkhidmatan Baharu'}
                  </h3>
                  <p className="text-xs text-slate-500">Maklumat master akan diselaraskan dengan invois jualan dan bil pembelian.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {errorBanner && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorBanner}</span>
                </div>
              )}

              {/* SEKSYEN 1: MAKLUMAT ASAS */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  <span>Maklumat Asas Produk</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kod Produk / SKU *</label>
                    <input
                      type="text"
                      required
                      value={productCode}
                      onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                      placeholder="cth: PRD-001"
                      className="w-full border border-slate-200 rounded-lg p-2 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Nama Produk / Servis *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="cth: Ayam Segar Standard (1kg)"
                      className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Keterangan Ringkas</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="cth: Bekalan ayam segar siap diproses dari ladang harian."
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="productIsActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <label htmlFor="productIsActive" className="font-semibold text-slate-800 cursor-pointer">
                    Item Aktif (boleh dipilih semasa mencipta invois dan bil)
                  </label>
                </div>
              </div>

              {/* SEKSYEN 2: LOGIK UNIT (PHASE 3) */}
              <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Unit Pembelian & Unit Jualan (Peraturan Khairul Fresh Food)
                  </span>
                  {purchaseUnit.toLowerCase() === salesUnit.toLowerCase() ? (
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full">
                      Unit Selaras (95% Kes)
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100/70 px-2 py-0.5 rounded-full">
                      Unit Berbeza Ditetapkan
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Secara piawai, memilih Unit Belian akan menetapkan Unit Jualan kepada unit yang sama secara automatik (cth: ekor → ekor, kg → kg, unit → unit). Anda boleh mengubah Unit Jualan secara berasingan jika perlu.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Unit Pembelian *</label>
                    <select
                      value={purchaseUnit}
                      onChange={(e) => handlePurchaseUnitChange(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-400 mt-1 block">Unit yang digunakan dalam Bil Pembelian.</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Unit Jualan *</label>
                    <select
                      value={salesUnit}
                      onChange={(e) => handleSalesUnitChange(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-400 mt-1 block">Unit yang digunakan dalam Invois Jualan.</span>
                  </div>
                </div>
              </div>

              {/* SEKSYEN 3: MAKLUMAT JUALAN (PHASE 5) */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider border-b border-emerald-100 pb-1 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Maklumat Jualan & Akaun Hasil</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Harga Jualan Seunit (RM) *</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">RM</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={sellingPriceRM}
                        onChange={(e) => setSellingPriceRM(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg font-mono font-bold text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kategori Hasil</label>
                    <select
                      value={incomeCategory}
                      onChange={(e) => setIncomeCategory(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {INCOME_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Akaun Hasil (Revenue COA)</label>
                    <select
                      value={incomeAccountId}
                      onChange={(e) => setIncomeAccountId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 bg-white text-xs font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">-- Tiada Pautan Khusus --</option>
                      {revenueAccounts.map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SEKSYEN 4: MAKLUMAT BELIAN (PHASE 5) */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider border-b border-amber-100 pb-1 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                  <span>Maklumat Pembelian & Akaun Belanja / Kos</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kos Belian Standard (RM)</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">RM</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={purchaseCostRM}
                        onChange={(e) => setPurchaseCostRM(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg font-mono font-medium text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kategori Kos / Belanja</label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Akaun Kos / Belanja (Expense COA)</label>
                    <select
                      value={expenseAccountId}
                      onChange={(e) => setExpenseAccountId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 bg-white text-xs font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">-- Tiada Pautan Khusus --</option>
                      {expenseAccounts.map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingItem ? 'Kemaskini Produk' : 'Simpan ke Pangkalan Data'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
