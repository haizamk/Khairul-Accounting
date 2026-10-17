import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  ArrowLeft,
  ExternalLink,
  Printer,
  FileText,
  Calendar,
  BookOpen
} from 'lucide-react';

interface GeneralJournalViewProps {
  accounts: any[];
  refreshCOA: () => void;
  userRole: string;
  token: string | null;
  initialJournalId?: string | null;
  onNavigateToDocument?: (docType: string, docId: string) => void;
}

const formatRM = (cents: number) => {
  const isNegative = cents < 0;
  const absValue = Math.abs(cents) / 100;
  const formattedStr = absValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `RM (${formattedStr})` : `RM ${formattedStr}`;
};

export default function GeneralJournalView({
  accounts,
  refreshCOA,
  userRole,
  token,
  initialJournalId,
  onNavigateToDocument,
}: GeneralJournalViewProps) {
  const [viewMode, setViewMode] = useState<'registry' | 'detail' | 'create'>(initialJournalId ? 'detail' : 'registry');
  const [journals, setJournals] = useState<any[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<any>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Manual entry form state
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

  const activeAccounts = (accounts || []).filter((a) => a.active);

  const fetchJournals = async () => {
    try {
      setLoadingList(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);

      const res = await fetch(`/api/journals?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setJournals(data);
      }
    } catch (err) {
      console.error('Error fetching journals:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchJournalDetail = async (id: string) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/journals/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedJournal(data);
        setViewMode('detail');
      } else {
        alert('Gagal memuatkan butiran catatan jurnal.');
      }
    } catch (err) {
      console.error('Error fetching journal detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchJournals();
  }, [searchQuery, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (initialJournalId) {
      fetchJournalDetail(initialJournalId);
    }
  }, [initialJournalId]);

  // Totals calculations for create form
  const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit || 0) * 100), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit || 0) * 100), 0);
  const difference = totalDebit - totalCredit;
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

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
      setError('Sila lengkapkan tarikh jurnal dan keterangan transaksi.');
      return;
    }

    if (!isBalanced) {
      setError('Debit dan kredit mestilah seimbang, dan jumlah mestilah melebihi RM 0.00.');
      return;
    }

    setIsPosting(true);
    try {
      const processedLines = lines.map((l) => ({
        accountId: l.accountId,
        debit: Math.round(parseFloat(l.debit || 0) * 100),
        credit: Math.round(parseFloat(l.credit || 0) * 100),
        description: l.description || null,
      }));

      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entryDate,
          reference,
          description,
          lines: processedLines,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess('Catatan jurnal berjaya diposkan ke Lejar Am!');
        setReference('');
        setDescription('');
        setLines([
          { accountId: '', debit: 0, credit: 0, description: '' },
          { accountId: '', debit: 0, credit: 0, description: '' },
        ]);
        refreshCOA();
        fetchJournals();
        if (data.id) {
          fetchJournalDetail(data.id);
        }
      } else {
        const errData = await res.json();
        setError(errData.error || 'Gagal memposkan catatan jurnal.');
      }
    } catch (err: any) {
      setError(err.message || 'Ralat berlaku semasa memposkan catatan jurnal.');
    } finally {
      setIsPosting(false);
    }
  };

  // ==========================================
  // RENDER 1: DETAIL VIEW (Jurnal Terperinci)
  // ==========================================
  if (viewMode === 'detail' && selectedJournal) {
    const linesList = selectedJournal.lines || [];
    const totalDebCents = selectedJournal.totalDebit !== undefined ? selectedJournal.totalDebit : linesList.reduce((s: number, l: any) => s + (l.debit || 0), 0);
    const totalCredCents = selectedJournal.totalCredit !== undefined ? selectedJournal.totalCredit : linesList.reduce((s: number, l: any) => s + (l.credit || 0), 0);
    const linkedDoc = selectedJournal.linkedDocument;

    return (
      <div className="space-y-6 text-sm">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 border border-slate-200 rounded-xl shadow-xs">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setSelectedJournal(null);
                  setViewMode('registry');
                }}
                className="py-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Senarai Catatan Jurnal
              </button>

              {linkedDoc && onNavigateToDocument && (
                <button
                  onClick={() => onNavigateToDocument(linkedDoc.type, linkedDoc.id)}
                  className="py-1 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {linkedDoc.type === 'purchase-bill' ? `Kembali ke Bil Pembelian (${linkedDoc.number})` : `Kembali ke Invois Jualan (${linkedDoc.number})`}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Catatan Jurnal: <span className="font-mono">{selectedJournal.reference || '#' + selectedJournal.id.slice(0, 8)}</span>
              </h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  selectedJournal.status === 'Posted'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : selectedJournal.status === 'Draft'
                    ? 'bg-slate-100 text-slate-800 border-slate-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {selectedJournal.status === 'Posted' ? 'DIPOSKAN (POSTED)' : selectedJournal.status === 'Draft' ? 'DRAF' : 'DIBATAL'}
              </span>
            </div>
            <p className="text-slate-500 text-xs font-mono">
              ID Sistem Jurnal: {selectedJournal.id}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Jurnal
            </button>
            {userRole !== 'Viewer' && (
              <button
                onClick={() => setViewMode('create')}
                className="py-2 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Cipta Jurnal Baru
              </button>
            )}
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">No. Rujukan Jurnal</span>
            <span className="font-mono font-bold text-slate-900 text-sm">{selectedJournal.reference || '—'}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tarikh Transaksi</span>
            <span className="font-mono font-semibold text-slate-800 text-sm">{selectedJournal.entryDate}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tarikh Dipos (Posting Date)</span>
            <span className="font-mono font-semibold text-slate-800 text-sm">
              {selectedJournal.postingDate || selectedJournal.entryDate}
            </span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">Imbangan Catatan</span>
            <span className="font-bold text-emerald-800 text-sm flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              SEIMBANG (Debit = Kredit)
            </span>
          </div>
        </div>

        {/* Narrative / Description Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Keterangan / Naratif Urus Niaga</span>
          <p className="text-slate-800 text-sm font-medium leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
            {selectedJournal.description || 'Tiada keterangan disediakan.'}
          </p>
          {linkedDoc && (
            <div className="flex items-center justify-between text-xs pt-1 text-slate-600">
              <span>
                Pautan Dokumen Sumber: <strong className="font-mono text-slate-900">{linkedDoc.number}</strong> ({linkedDoc.type === 'purchase-bill' ? 'Bil Pembelian' : 'Invois Jualan'})
              </span>
              {onNavigateToDocument && (
                <button
                  onClick={() => onNavigateToDocument(linkedDoc.type, linkedDoc.id)}
                  className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  Buka Dokumen Berkaitan <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Double-Entry Journal Lines Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Baris Catatan Bergu Lejar Am (Double-Entry General Ledger Lines)
              </h3>
              <p className="text-[11px] text-slate-500">Persamaan asas perakaunan dipatuhi secara ketat bagi setiap urus niaga.</p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {linesList.length} baris akaun terlibat
            </span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-5">Kod Akaun</th>
                <th className="py-3 px-5">Nama Akaun</th>
                <th className="py-3 px-5">Kategori COA</th>
                <th className="py-3 px-5">Keterangan Baris / Memo</th>
                <th className="py-3 px-5 text-right w-44">Debit (RM)</th>
                <th className="py-3 px-5 text-right w-44">Kredit (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-sans">
              {linesList.map((line: any) => (
                <tr key={line.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-5 font-mono font-bold text-slate-900">
                    {line.accountCode}
                  </td>
                  <td className="py-3 px-5 font-semibold text-slate-800">
                    {line.accountName}
                  </td>
                  <td className="py-3 px-5 text-slate-500 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      {line.accountType || 'Lejar'}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-slate-600 font-sans text-xs">
                    {line.description || '—'}
                  </td>
                  <td className="py-3 px-5 text-right font-mono font-bold text-blue-700">
                    {line.debit > 0 ? formatRM(line.debit) : '—'}
                  </td>
                  <td className="py-3 px-5 text-right font-mono font-bold text-emerald-700">
                    {line.credit > 0 ? formatRM(line.credit) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold text-xs border-t-2 border-slate-900">
                <td colSpan={4} className="py-3.5 px-5 uppercase text-[11px] tracking-wider text-slate-300">
                  Jumlah Keseluruhan Catatan Bergu:
                </td>
                <td className="py-3.5 px-5 text-right font-mono text-blue-300 text-sm">
                  {formatRM(totalDebCents)}
                </td>
                <td className="py-3.5 px-5 text-right font-mono text-emerald-400 text-sm">
                  {formatRM(totalCredCents)}
                </td>
              </tr>
              <tr className="bg-emerald-50 text-emerald-900 font-bold text-xs border-t border-emerald-200">
                <td colSpan={4} className="py-2.5 px-5 text-emerald-800 text-[11px] uppercase tracking-wider">
                  Baki Imbangan Lejar (Debits vs Credits):
                </td>
                <td colSpan={2} className="py-2.5 px-5 text-right font-mono text-emerald-700">
                  RM 0.00 (SEIMBANG)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Verification and Immutability Banner */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-800 block mb-0.5">Pengesahan Integriti Lejar Am</span>
            <p>
              Catatan jurnal ini telah dimuktamadkan dalam Lejar Am. Sistem catatan bergu memastikan setiap transaksi perbelanjaan, pemiutang, penghutang, dan aliran tunai sentiasa seimbang bagi memastikan ketepatan penyata kewangan (Imbangan Duga, Untung Rugi, dan Kunci Kira-Kira).
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER 2: REGISTRY LIST VIEW (Senarai Catatan Jurnal)
  // ==========================================
  if (viewMode === 'registry') {
    return (
      <div className="space-y-6 text-sm">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Catatan Jurnal (General Journal)</h2>
            <p className="text-slate-500 text-xs">Perekodan urus niaga bergu berprinsip catatan bergu (Double-Entry General Journal).</p>
          </div>
          {userRole !== 'Viewer' && (
            <button
              onClick={() => setViewMode('create')}
              className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Cipta Jurnal Manual
            </button>
          )}
        </div>

        {/* Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari no. rujukan, keterangan jurnal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold">Tarikh:</span>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="border border-slate-200 rounded-lg py-1 px-2 text-xs"
              />
              <span className="text-slate-400">hingga</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="border border-slate-200 rounded-lg py-1 px-2 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(searchQuery || filterStartDate || filterEndDate) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Kosongkan Penapis
              </button>
            )}
            <button
              onClick={fetchJournals}
              className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Muat Semula
            </button>
          </div>
        </div>

        {/* Journals Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3.5 px-6">Tarikh Jurnal</th>
                <th className="py-3.5 px-6">No. Rujukan</th>
                <th className="py-3.5 px-6">Keterangan Transaksi</th>
                <th className="py-3.5 px-6 text-right">Jumlah Debit (RM)</th>
                <th className="py-3.5 px-6 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-sans">
              {loadingList ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">Memuatkan rekod catatan jurnal...</td>
                </tr>
              ) : journals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                    Tiada rekod catatan jurnal dijumpai.
                  </td>
                </tr>
              ) : (
                journals.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-6 font-mono text-slate-600">{j.entryDate}</td>
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-900">{j.reference || '—'}</td>
                    <td className="py-3.5 px-6 text-slate-800 font-medium max-w-md truncate">
                      {j.description}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-slate-900">
                      {j.totalDebit ? formatRM(j.totalDebit) : '—'}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          j.status === 'Posted'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : j.status === 'Draft'
                            ? 'bg-slate-100 text-slate-800 border-slate-200'
                            : 'bg-red-50 text-red-800 border-red-100'
                        }`}
                      >
                        {j.status === 'Posted' ? 'DIPOS' : j.status === 'Draft' ? 'DRAF' : 'DIBATAL'}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        onClick={() => fetchJournalDetail(j.id)}
                        className="py-1 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Lihat Butiran &rarr;
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER 3: CREATE MANUAL JOURNAL FORM
  // ==========================================
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-5 border border-slate-200 rounded-xl shadow-xs">
        <div>
          <button
            onClick={() => setViewMode('registry')}
            className="text-xs text-blue-600 hover:underline mb-1 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Senarai Catatan Jurnal
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Cipta Catatan Jurnal Manual</h2>
          <p className="text-slate-500 text-xs">Pengeposan catatan bergu debit dan kredit secara manual ke Lejar Am.</p>
        </div>
        <button
          onClick={() => setViewMode('registry')}
          className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
        >
          Tutup Borang
        </button>
      </div>

      {error && (
        <div className="p-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center gap-2">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handlePost} className="space-y-6 text-sm">
        {/* Meta Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-xs">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tarikh Jurnal *</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nombor Rujukan</label>
            <input
              type="text"
              placeholder="cth: ADJ-001, MEMO-1234"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs font-mono"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Keterangan / Naratif Transaksi *</label>
            <input
              type="text"
              placeholder="cth: Pelarasan inventori akhir tempoh atau susut nilai aset"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
              required
            />
          </div>
        </div>

        {/* Lines Segment */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">Akaun COA</th>
                <th className="py-3 px-6 w-48 text-right">Debit (RM)</th>
                <th className="py-3 px-6 w-48 text-right">Kredit (RM)</th>
                <th className="py-3 px-6">Memo Baris</th>
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
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 font-sans"
                      required
                    >
                      <option value="">Pilih akaun...</option>
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
                      className="w-full text-right border border-slate-200 bg-white font-mono rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs font-bold text-blue-700"
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
                      className="w-full text-right border border-slate-200 bg-white font-mono rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs font-bold text-emerald-700"
                    />
                  </td>
                  <td className="py-3 px-6">
                    <input
                      type="text"
                      placeholder="Catatan baris..."
                      value={line.description}
                      onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                    />
                  </td>
                  <td className="py-3 px-6 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length <= 2}
                      className="p-1.5 text-slate-300 hover:text-red-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <button
              type="button"
              onClick={addLine}
              className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Baris Akaun
            </button>
            <span className="text-xs text-slate-500">Minimum 2 baris akaun bergu diperlukan.</span>
          </div>
        </div>

        {/* Balance Validation Summary Footer */}
        <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 shadow-md">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Jumlah Debit</span>
              <span className="text-lg font-bold font-mono tracking-tight text-blue-300">{formatRM(totalDebit)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Jumlah Kredit</span>
              <span className="text-lg font-bold font-mono tracking-tight text-emerald-400">{formatRM(totalCredit)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Perbezaan Imbangan</span>
              <span className={`text-lg font-bold font-mono tracking-tight ${difference === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatRM(difference)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Integriti Imbangan</span>
              <span className={`text-xs font-bold ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                {isBalanced ? 'SEIMBANG (BALANCED)' : 'TIDAK SEIMBANG'}
              </span>
            </div>
            <button
              type="submit"
              disabled={!isBalanced || isPosting || userRole === 'Viewer'}
              className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm rounded-xl transition-colors cursor-pointer"
            >
              {isPosting ? 'Sedang Diposkan...' : 'Pos Jurnal ke Lejar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
