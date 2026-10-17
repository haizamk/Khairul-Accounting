import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  FileText,
  Receipt,
  Package,
  BookOpen,
  ArrowRight,
  Clock,
  CheckCircle,
  Building2,
  User,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  onNavigate: (type: 'invoice' | 'bill' | 'product' | 'journal', id: string, extra?: any) => void;
}

const formatRM = (cents: number) => {
  const isNegative = cents < 0;
  const absValue = Math.abs(cents) / 100;
  const formattedStr = absValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `RM (${formattedStr})` : `RM ${formattedStr}`;
};

export default function GlobalSearchModal({
  isOpen,
  onClose,
  token,
  onNavigate,
}: GlobalSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'invoices' | 'bills' | 'products' | 'journals'>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    invoices: any[];
    purchaseBills: any[];
    products: any[];
    journals: any[];
  }>({
    invoices: [],
    purchaseBills: [],
    products: [],
    journals: [],
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
      setResults({ invoices: [], purchaseBills: [], products: [], journals: [] });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (!searchTerm.trim()) {
      setResults({ invoices: [], purchaseBills: [], products: [], journals: [] });
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchTerm.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResults({
            invoices: data.invoices || [],
            purchaseBills: data.purchaseBills || [],
            products: data.products || [],
            journals: data.journals || [],
          });
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchTerm, isOpen, token]);

  if (!isOpen) return null;

  const totalResults =
    results.invoices.length +
    results.purchaseBills.length +
    results.products.length +
    results.journals.length;

  const showInvoices = activeCategory === 'all' || activeCategory === 'invoices';
  const showBills = activeCategory === 'all' || activeCategory === 'bills';
  const showProducts = activeCategory === 'all' || activeCategory === 'products';
  const showJournals = activeCategory === 'all' || activeCategory === 'journals';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center p-4 sm:pt-20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Header */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-white">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Cari invois, bil pembelian, produk/katalog, atau rekod jurnal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />}
          {searchTerm && !loading && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs font-semibold py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
          >
            Esc
          </button>
        </div>

        {/* Categories Bar */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] font-semibold mr-1">Kategori:</span>
          <button
            onClick={() => setActiveCategory('all')}
            className={`py-1 px-2.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
            }`}
          >
            Semua {totalResults > 0 && `(${totalResults})`}
          </button>
          <button
            onClick={() => setActiveCategory('invoices')}
            className={`py-1 px-2.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              activeCategory === 'invoices'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
            }`}
          >
            <FileText className="w-3 h-3 text-blue-500" />
            Invois {results.invoices.length > 0 && `(${results.invoices.length})`}
          </button>
          <button
            onClick={() => setActiveCategory('bills')}
            className={`py-1 px-2.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              activeCategory === 'bills'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
            }`}
          >
            <Receipt className="w-3 h-3 text-emerald-500" />
            Bil Pembelian {results.purchaseBills.length > 0 && `(${results.purchaseBills.length})`}
          </button>
          <button
            onClick={() => setActiveCategory('products')}
            className={`py-1 px-2.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              activeCategory === 'products'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
            }`}
          >
            <Package className="w-3 h-3 text-amber-500" />
            Produk {results.products.length > 0 && `(${results.products.length})`}
          </button>
          <button
            onClick={() => setActiveCategory('journals')}
            className={`py-1 px-2.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              activeCategory === 'journals'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
            }`}
          >
            <BookOpen className="w-3 h-3 text-purple-500" />
            Jurnal {results.journals.length > 0 && `(${results.journals.length})`}
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {!searchTerm.trim() ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-600">Taip untuk mula mencari merentasi sistem Khairul Fresh</p>
              <p className="text-[11px] text-slate-400">
                Contoh: <span className="font-mono text-slate-500">BILL-2026-000167</span>, <span className="font-mono text-slate-500">INV-</span>, <span className="font-mono text-slate-500">Ayam</span>, <span className="font-mono text-slate-500">HM Chicken</span>
              </p>
            </div>
          ) : !loading && totalResults === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <p className="font-semibold text-slate-700">Tiada rekod dijumpai untuk &ldquo;{searchTerm}&rdquo;</p>
              <p className="text-[11px]">Sila periksa ejaan atau cuba kata kunci yang lebih ringkas.</p>
            </div>
          ) : (
            <>
              {/* 1. SALES INVOICES */}
              {showInvoices && results.invoices.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Invois Jualan ({results.invoices.length})</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {results.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => {
                          onNavigate('invoice', inv.id, inv);
                          onClose();
                        }}
                        className="p-3 hover:bg-blue-50/50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs">{inv.invoiceNumber}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                inv.status === 'Posted'
                                  ? 'bg-blue-50 text-blue-700'
                                  : inv.status === 'Paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-slate-600 truncate mt-0.5">
                            Pelanggan: <span className="font-semibold text-slate-800">{inv.customerName || 'Pelanggan'}</span>
                            {inv.customerCode && <span className="text-slate-400 font-mono"> ({inv.customerCode})</span>}
                            {' · '}
                            <span className="text-slate-400">{inv.invoiceDate}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-slate-900 text-xs block">
                            {formatRM(inv.total)}
                          </span>
                          <span className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center justify-end gap-0.5 mt-0.5">
                            Buka Invois <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. PURCHASE BILLS */}
              {showBills && results.purchaseBills.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Bil Pembelian ({results.purchaseBills.length})</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {results.purchaseBills.map((bill) => (
                      <div
                        key={bill.id}
                        onClick={() => {
                          onNavigate('bill', bill.id, bill);
                          onClose();
                        }}
                        className="p-3 hover:bg-emerald-50/50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs">{bill.billNumber}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                bill.status === 'Posted'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {bill.status}
                            </span>
                          </div>
                          <p className="text-slate-600 truncate mt-0.5">
                            Pembekal: <span className="font-semibold text-slate-800">{bill.supplierName || 'Pembekal'}</span>
                            {bill.supplierInvoiceNumber && ` · Ref: ${bill.supplierInvoiceNumber}`}
                            {' · '}
                            <span className="text-slate-400">{bill.billDate}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-slate-900 text-xs block">
                            {formatRM(bill.total)}
                          </span>
                          <span className="text-[11px] text-emerald-600 font-semibold hover:underline flex items-center justify-end gap-0.5 mt-0.5">
                            Buka Bil <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. PRODUCTS */}
              {showProducts && results.products.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    <Package className="w-3.5 h-3.5" />
                    <span>Katalog Produk & Perkhidmatan ({results.products.length})</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {results.products.map((prd) => (
                      <div
                        key={prd.id}
                        onClick={() => {
                          onNavigate('product', prd.id, prd);
                          onClose();
                        }}
                        className="p-3 hover:bg-amber-50/50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{prd.name}</span>
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {prd.productCode}
                            </span>
                          </div>
                          <p className="text-slate-500 truncate mt-0.5">
                            Unit Jual: <span className="font-semibold text-slate-700">{prd.salesUnit}</span>
                            {prd.description && ` · ${prd.description}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-slate-900 text-xs block">
                            {formatRM(prd.sellingPrice)} / {prd.salesUnit}
                          </span>
                          <span className="text-[11px] text-amber-700 font-semibold hover:underline flex items-center justify-end gap-0.5 mt-0.5">
                            Lihat Katalog <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. JOURNALS */}
              {showJournals && results.journals.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-700">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Catatan Jurnal Lejar Am ({results.journals.length})</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {results.journals.map((jnl) => (
                      <div
                        key={jnl.id}
                        onClick={() => {
                          onNavigate('journal', jnl.id, jnl);
                          onClose();
                        }}
                        className="p-3 hover:bg-purple-50/50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              {jnl.reference || '#' + jnl.id.slice(0, 8)}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">
                              {jnl.status}
                            </span>
                          </div>
                          <p className="text-slate-600 truncate mt-0.5">
                            {jnl.description}
                            {' · '}
                            <span className="text-slate-400">{jnl.entryDate}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-slate-900 text-xs block">
                            {jnl.totalDebit ? formatRM(jnl.totalDebit) : '—'}
                          </span>
                          <span className="text-[11px] text-purple-600 font-semibold hover:underline flex items-center justify-end gap-0.5 mt-0.5">
                            Buka Jurnal <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Pintasan: Tekan <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">Esc</kbd> untuk tutup</span>
          <span>Khairul Fresh Global Search Engine</span>
        </div>
      </div>
    </div>
  );
}
