import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  TrendingUp, 
  Scale, 
  Wallet, 
  Calendar, 
  Search, 
  CheckCircle, 
  XCircle, 
  Printer, 
  Download, 
  RefreshCw, 
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface FinancialReportsViewProps {
  token: string;
  periods: any[];
}

export default function FinancialReportsView({ token, periods }: FinancialReportsViewProps) {
  const [reportTab, setReportTab] = useState<'trial-balance' | 'pnl' | 'balance-sheet' | 'cash-flow'>('trial-balance');

  // Common filters
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Trial Balance state
  const [tbData, setTbData] = useState<any>(null);
  const [tbSearch, setTbSearch] = useState<string>('');
  const [tbHideZero, setTbHideZero] = useState<boolean>(true);
  const [isTbLoading, setIsTbLoading] = useState<boolean>(false);

  // P&L state
  const [pnlData, setPnlData] = useState<any>(null);
  const [isPnlLoading, setIsPnlLoading] = useState<boolean>(false);

  // Balance Sheet state
  const [bsData, setBsData] = useState<any>(null);
  const [isBsLoading, setIsBsLoading] = useState<boolean>(false);

  // Cash Flow state
  const [cfData, setCfData] = useState<any>(null);
  const [isCfLoading, setIsCfLoading] = useState<boolean>(false);

  // Fetch Trial Balance
  const fetchTrialBalance = async () => {
    try {
      setIsTbLoading(true);
      let url = '/api/reports/trial-balance?';
      if (selectedPeriodId) url += `periodId=${selectedPeriodId}&`;
      if (startDate) url += `startDate=${startDate}&`;
      if (endDate) url += `endDate=${endDate}&`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTbData(data);
      }
    } catch (err) {
      console.error("Fetch Trial Balance error:", err);
    } finally {
      setIsTbLoading(false);
    }
  };

  // Fetch P&L
  const fetchProfitAndLoss = async () => {
    try {
      setIsPnlLoading(true);
      let url = '/api/reports/profit-loss?';
      if (selectedPeriodId) url += `periodId=${selectedPeriodId}&`;
      if (startDate) url += `startDate=${startDate}&`;
      if (endDate) url += `endDate=${endDate}&`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPnlData(data);
      }
    } catch (err) {
      console.error("Fetch P&L error:", err);
    } finally {
      setIsPnlLoading(false);
    }
  };

  // Fetch Balance Sheet
  const fetchBalanceSheet = async () => {
    try {
      setIsBsLoading(true);
      let url = '/api/reports/balance-sheet?';
      if (selectedPeriodId) url += `periodId=${selectedPeriodId}&`;
      if (asOfDate) url += `asOfDate=${asOfDate}&`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBsData(data);
      }
    } catch (err) {
      console.error("Fetch Balance Sheet error:", err);
    } finally {
      setIsBsLoading(false);
    }
  };

  // Fetch Cash Flow
  const fetchCashFlow = async () => {
    try {
      setIsCfLoading(true);
      let url = '/api/reports/cash-flow?';
      if (selectedPeriodId) url += `periodId=${selectedPeriodId}&`;
      if (startDate) url += `startDate=${startDate}&`;
      if (endDate) url += `endDate=${endDate}&`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCfData(data);
      }
    } catch (err) {
      console.error("Fetch Cash Flow error:", err);
    } finally {
      setIsCfLoading(false);
    }
  };

  useEffect(() => {
    if (reportTab === 'trial-balance') fetchTrialBalance();
    if (reportTab === 'pnl') fetchProfitAndLoss();
    if (reportTab === 'balance-sheet') fetchBalanceSheet();
    if (reportTab === 'cash-flow') fetchCashFlow();
  }, [reportTab, selectedPeriodId, startDate, endDate, asOfDate]);

  const handlePeriodChange = (pId: string) => {
    setSelectedPeriodId(pId);
    if (pId) {
      const p = periods.find(item => item.id === pId);
      if (p) {
        setStartDate(p.startDate);
        setEndDate(p.endDate);
        setAsOfDate(p.endDate);
      }
    } else {
      setStartDate('');
      setEndDate(new Date().toISOString().split('T')[0]);
      setAsOfDate(new Date().toISOString().split('T')[0]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCents = (cents: number) => {
    return (cents / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-lg border border-slate-200 shadow-sm print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Penyata & Laporan Kewangan (Financial Statements)</h1>
          <p className="text-sm text-slate-500 mt-1">Laporan rasmi berteraskan entri lejar am yang telah disahkan (*Posted*)</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-md transition-colors flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 bg-white px-4 pt-2 rounded-t-lg print:hidden">
        <button
          onClick={() => setReportTab('trial-balance')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${reportTab === 'trial-balance' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Scale className="w-4 h-4" />
          <span>Imbangan Duga (Trial Balance)</span>
        </button>

        <button
          onClick={() => setReportTab('pnl')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${reportTab === 'pnl' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Untung Rugi (Profit & Loss)</span>
        </button>

        <button
          onClick={() => setReportTab('balance-sheet')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${reportTab === 'balance-sheet' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <FileText className="w-4 h-4" />
          <span>Lembaran Imbangan (Balance Sheet)</span>
        </button>

        <button
          onClick={() => setReportTab('cash-flow')}
          className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${reportTab === 'cash-flow' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Wallet className="w-4 h-4" />
          <span>Aliran Tunai (Cash Flow)</span>
        </button>
      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-white p-4 rounded-b-lg border-x border-b border-slate-200 shadow-sm print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tempoh Perakaunan</label>
            <select
              value={selectedPeriodId}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-slate-800"
            >
              <option value="">Semua / Julat Bebas</option>
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.startDate} - {p.endDate}) [{p.status}]
                </option>
              ))}
            </select>
          </div>

          {reportTab !== 'balance-sheet' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tarikh Mula</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setSelectedPeriodId(''); setStartDate(e.target.value); }}
                  className="w-full text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tarikh Akhir</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setSelectedPeriodId(''); setEndDate(e.target.value); }}
                  className="w-full text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-slate-800"
                />
              </div>
            </>
          )}

          {reportTab === 'balance-sheet' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tarikh Pemotong (As of Date)</label>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => { setSelectedPeriodId(''); setAsOfDate(e.target.value); }}
                className="w-full text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-slate-800"
              />
            </div>
          )}

          <div className="flex items-end">
            <button
              onClick={() => {
                if (reportTab === 'trial-balance') fetchTrialBalance();
                if (reportTab === 'pnl') fetchProfitAndLoss();
                if (reportTab === 'balance-sheet') fetchBalanceSheet();
                if (reportTab === 'cash-flow') fetchCashFlow();
              }}
              className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Kemaskini Laporan</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. TRIAL BALANCE TAB */}
      {/* ==================================================================== */}
      {reportTab === 'trial-balance' && (
        <div className="space-y-6">
          {/* SEARCH & FILTER TOOLBAR */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 print:hidden">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari kod atau nama akaun..."
                value={tbSearch}
                onChange={(e) => setTbSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tbHideZero}
                onChange={(e) => setTbHideZero(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-800"
              />
              <span>Sembunyikan Akaun Baki Sifar</span>
            </label>
          </div>

          {/* STATUS BANNER */}
          {tbData && (
            <div className={`p-4 rounded-lg border flex items-center justify-between ${tbData.isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              <div className="flex items-center gap-3">
                {tbData.isBalanced ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <div>
                  <h4 className="font-bold text-sm">
                    {tbData.isBalanced ? 'Imbangan Duga Seimbang (Balanced)' : 'Imbangan Duga Tidak Seimbang (Out of Balance)'}
                  </h4>
                  <p className="text-xs opacity-90">
                    {tbData.isBalanced 
                      ? `Jumlah Debit (RM ${formatCents(tbData.totalDebits)}) menyamai Jumlah Kredit (RM ${formatCents(tbData.totalCredits)}).`
                      : `Terdapat selisih sebanyak RM ${formatCents(tbData.difference)} antara Debit dan Kredit.`
                    }
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-75">Status Pariti</span>
                <div className="text-lg font-bold">
                  {tbData.isBalanced ? '100% BALANCED' : `DIFF: RM ${formatCents(tbData.difference)}`}
                </div>
              </div>
            </div>
          )}

          {/* TABLE */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left text-sm border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold uppercase text-xs">
                  <th className="py-3 px-4">Kod Akaun</th>
                  <th className="py-3 px-4">Nama Akaun</th>
                  <th className="py-3 px-4">Jenis Akaun</th>
                  <th className="py-3 px-4 text-right">Debit (RM)</th>
                  <th className="py-3 px-4 text-right">Kredit (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isTbLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                      <span>Menjana Imbangan Duga...</span>
                    </td>
                  </tr>
                ) : !tbData || !tbData.rows || tbData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Tiada rekod lejar am ditemui bagi penapis yang dipilih.
                    </td>
                  </tr>
                ) : (
                  tbData.rows
                    .filter((r: any) => {
                      if (tbHideZero && r.debit === 0 && r.credit === 0) return false;
                      if (tbSearch) {
                        const q = tbSearch.toLowerCase();
                        return r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((r: any) => (
                      <tr key={r.accountId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{r.code}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-800">{r.name}</td>
                        <td className="py-2.5 px-4 text-xs text-slate-500">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">{r.type}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-900">
                          {r.debit > 0 ? formatCents(r.debit) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-900">
                          {r.credit > 0 ? formatCents(r.credit) : '-'}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
              {tbData && (
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold text-sm">
                    <td colSpan={3} className="py-3 px-4 text-right uppercase tracking-wider">Jumlah Keseluruhan (Total)</td>
                    <td className="py-3 px-4 text-right font-mono">RM {formatCents(tbData.totalDebits)}</td>
                    <td className="py-3 px-4 text-right font-mono">RM {formatCents(tbData.totalCredits)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. PROFIT & LOSS TAB */}
      {/* ==================================================================== */}
      {reportTab === 'pnl' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div className="text-center border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight uppercase">Penyata Untung Rugi (Profit & Loss Statement)</h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Bagi Tempoh: <span className="text-slate-800 font-bold">{pnlData?.startDate} hingga {pnlData?.endDate}</span> ({pnlData?.periodName})
            </p>
          </div>

          {isPnlLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <span>Menjana Penyata Untung Rugi...</span>
            </div>
          ) : !pnlData ? (
            <div className="py-8 text-center text-slate-500">Tiada data penyata kewangan.</div>
          ) : (
            <div className="space-y-6 text-sm">
              
              {/* REVENUE SECTION */}
              <div>
                <div className="bg-slate-100 py-2 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>Hasil & Pendapatan (Revenue)</span>
                  <span>Amaun (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-2">
                  {pnlData.revenueGroups.length === 0 ? (
                    <div className="py-2 px-4 text-slate-400 italic text-xs">Tiada hasil direkodkan bagi tempoh ini.</div>
                  ) : (
                    pnlData.revenueGroups.map((g: any) => (
                      <div key={g.subType} className="py-2 px-4">
                        <div className="font-semibold text-slate-700 text-xs uppercase mb-1">{g.label}</div>
                        {g.rows.map((r: any) => (
                          <div key={r.accountId} className="flex justify-between py-1 pl-4 text-slate-600">
                            <span>{r.code} - {r.name}</span>
                            <span className="font-mono">{formatCents(r.amountCents)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-2">
                  <span>JUMLAH HASIL (TOTAL REVENUE)</span>
                  <span className="font-mono">RM {formatCents(pnlData.totalRevenueCents)}</span>
                </div>
              </div>

              {/* COGS SECTION */}
              <div>
                <div className="bg-slate-100 py-2 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>Tolak: Kos Jualan (Cost of Goods Sold)</span>
                  <span>Amaun (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-2">
                  {pnlData.cogsGroups.length === 0 ? (
                    <div className="py-2 px-4 text-slate-400 italic text-xs">Tiada kos jualan direkodkan bagi tempoh ini.</div>
                  ) : (
                    pnlData.cogsGroups.map((g: any) => (
                      <div key={g.subType} className="py-2 px-4">
                        {g.rows.map((r: any) => (
                          <div key={r.accountId} className="flex justify-between py-1 pl-4 text-slate-600">
                            <span>{r.code} - {r.name}</span>
                            <span className="font-mono">{formatCents(r.amountCents)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-2">
                  <span>JUMLAH KOS JUALAN (TOTAL COGS)</span>
                  <span className="font-mono">RM {formatCents(pnlData.totalCogsCents)}</span>
                </div>
              </div>

              {/* GROSS PROFIT */}
              <div className="bg-slate-900 text-white p-4 rounded-lg flex justify-between font-bold text-base">
                <span>UNTUNG KASAR (GROSS PROFIT)</span>
                <span className="font-mono">RM {formatCents(pnlData.grossProfitCents)}</span>
              </div>

              {/* OPERATING EXPENSES */}
              <div>
                <div className="bg-slate-100 py-2 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>Tolak: Belanja Operasi (Operating Expenses)</span>
                  <span>Amaun (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-2">
                  {pnlData.expenseGroups.length === 0 ? (
                    <div className="py-2 px-4 text-slate-400 italic text-xs">Tiada belanja operasi direkodkan bagi tempoh ini.</div>
                  ) : (
                    pnlData.expenseGroups.map((g: any) => (
                      <div key={g.subType} className="py-2 px-4">
                        <div className="font-semibold text-slate-700 text-xs uppercase mb-1">{g.label}</div>
                        {g.rows.map((r: any) => (
                          <div key={r.accountId} className="flex justify-between py-1 pl-4 text-slate-600">
                            <span>{r.code} - {r.name}</span>
                            <span className="font-mono">{formatCents(r.amountCents)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-2">
                  <span>JUMLAH BELANJA OPERASI (TOTAL OPERATING EXPENSES)</span>
                  <span className="font-mono">RM {formatCents(pnlData.totalOperatingExpenseCents)}</span>
                </div>
              </div>

              {/* NET INCOME */}
              <div className={`p-5 rounded-lg border flex justify-between items-center font-bold text-lg ${pnlData.isProfit ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <div>
                  <div className="uppercase tracking-tight">
                    {pnlData.isProfit ? 'UNTUNG BERSIH TEMPOH (NET PROFIT)' : 'RUGI BERSIH TEMPOH (NET LOSS)'}
                  </div>
                  <div className="text-xs font-normal opacity-80 font-mono mt-0.5">
                    Untung Kasar (RM {formatCents(pnlData.grossProfitCents)}) - Belanja Operasi (RM {formatCents(pnlData.totalOperatingExpenseCents)})
                  </div>
                </div>
                <div className="font-mono text-2xl">
                  RM {formatCents(pnlData.netIncomeCents)}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. BALANCE SHEET TAB */}
      {/* ==================================================================== */}
      {reportTab === 'balance-sheet' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div className="text-center border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight uppercase">Penyata Kedudukan Kewangan (Balance Sheet)</h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Pada Tarikh (As of Date): <span className="text-slate-800 font-bold">{bsData?.asOfDate}</span> ({bsData?.periodName})
            </p>
          </div>

          {isBsLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <span>Menjana Lembaran Imbangan...</span>
            </div>
          ) : !bsData ? (
            <div className="py-8 text-center text-slate-500">Tiada data penyata kewangan.</div>
          ) : (
            <div className="space-y-6 text-sm">
              
              {/* WARNING BANNER IF UNBALANCED */}
              {bsData.errorWarning && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">Amaran Pariti Lembaran Imbangan</h4>
                    <p className="text-xs mt-1 opacity-90">{bsData.errorWarning}</p>
                  </div>
                </div>
              )}

              {/* ASSETS SECTION */}
              <div>
                <div className="bg-slate-100 py-2 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>Aset (Assets)</span>
                  <span>Baki (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-2">
                  {bsData.assetGroups.length === 0 ? (
                    <div className="py-2 px-4 text-slate-400 italic text-xs">Tiada baki aset.</div>
                  ) : (
                    bsData.assetGroups.map((g: any) => (
                      <div key={g.subType} className="py-2 px-4">
                        <div className="font-semibold text-slate-700 text-xs uppercase mb-1">{g.label}</div>
                        {g.rows.map((r: any) => (
                          <div key={r.accountId} className="flex justify-between py-1 pl-4 text-slate-600">
                            <span>{r.code} - {r.name}</span>
                            <span className="font-mono">{formatCents(r.balanceCents)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between py-3 px-4 font-bold border-t-2 border-slate-900 text-slate-900 text-base mt-2 bg-slate-50 rounded">
                  <span>JUMLAH ASET (TOTAL ASSETS)</span>
                  <span className="font-mono">RM {formatCents(bsData.totalAssetsCents)}</span>
                </div>
              </div>

              {/* LIABILITIES SECTION */}
              <div>
                <div className="bg-slate-100 py-2 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>Liabiliti (Liabilities)</span>
                  <span>Baki (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-2">
                  {bsData.liabilityGroups.length === 0 ? (
                    <div className="py-2 px-4 text-slate-400 italic text-xs">Tiada baki liabiliti.</div>
                  ) : (
                    bsData.liabilityGroups.map((g: any) => (
                      <div key={g.subType} className="py-2 px-4">
                        <div className="font-semibold text-slate-700 text-xs uppercase mb-1">{g.label}</div>
                        {g.rows.map((r: any) => (
                          <div key={r.accountId} className="flex justify-between py-1 pl-4 text-slate-600">
                            <span>{r.code} - {r.name}</span>
                            <span className="font-mono">{formatCents(r.balanceCents)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-2">
                  <span>JUMLAH LIABILITI (TOTAL LIABILITIES)</span>
                  <span className="font-mono">RM {formatCents(bsData.totalLiabilitiesCents)}</span>
                </div>
              </div>

              {/* EQUITY SECTION */}
              <div>
                <div className="bg-slate-100 py-2 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>Ekuiti Pemilik (Owner's Equity)</span>
                  <span>Baki (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-2">
                  {bsData.equityGroups.map((g: any) => (
                    <div key={g.subType} className="py-2 px-4">
                      <div className="font-semibold text-slate-700 text-xs uppercase mb-1">{g.label}</div>
                      {g.rows.map((r: any) => (
                        <div key={r.accountId} className="flex justify-between py-1 pl-4 text-slate-600">
                          <span>{r.code} - {r.name}</span>
                          <span className="font-mono">{formatCents(r.balanceCents)}</span>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* CURRENT NET INCOME ADDITION */}
                  <div className="py-2 px-4 bg-emerald-50/50 rounded border border-emerald-100 mt-2">
                    <div className="flex justify-between font-bold text-emerald-900">
                      <span>Untung / (Rugi) Bersih Terkumpul Semasa</span>
                      <span className="font-mono">RM {formatCents(bsData.currentNetIncomeCents)}</span>
                    </div>
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Jumlah hasil terkumpul tolak belanja dari permulaan hingga {bsData.asOfDate}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-2">
                  <span>JUMLAH EKUITI (TOTAL EQUITY)</span>
                  <span className="font-mono">RM {formatCents(bsData.totalEquityAndNetIncomeCents)}</span>
                </div>
              </div>

              {/* TOTAL LIABILITIES & EQUITY PARITY */}
              <div className={`p-4 rounded-lg border flex justify-between items-center font-bold text-base ${bsData.isBalanced ? 'bg-slate-900 text-white border-slate-900' : 'bg-rose-900 text-white border-rose-900'}`}>
                <div>
                  <div className="uppercase tracking-tight">JUMLAH LIABILITI & EKUITI</div>
                  <div className="text-xs font-normal opacity-80 font-mono mt-0.5">
                    {bsData.isBalanced ? '✅ Mematuhi Persamaan Perakaunan: Aset = Liabiliti + Ekuiti' : '❌ Ralat Pariti Perakaunan'}
                  </div>
                </div>
                <div className="font-mono text-xl">
                  RM {formatCents(bsData.totalLiabilitiesAndEquityCents)}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. CASH FLOW TAB */}
      {/* ==================================================================== */}
      {reportTab === 'cash-flow' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div className="text-center border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight uppercase">Penyata Aliran Tunai (Cash Flow Statement)</h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Bagi Tempoh: <span className="text-slate-800 font-bold">{cfData?.startDate} hingga {cfData?.endDate}</span> ({cfData?.periodName}) · <span className="italic">Kaedah Tidak Langsung (Indirect Method)</span>
            </p>
          </div>

          {isCfLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <span>Menjana Penyata Aliran Tunai...</span>
            </div>
          ) : !cfData ? (
            <div className="py-8 text-center text-slate-500">Tiada data penyata kewangan.</div>
          ) : (
            <div className="space-y-6 text-sm">
              
              {/* WARNING NOTES */}
              {cfData.unclassifiedGapNotes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Nota Pengelasan Aliran Tunai</h4>
                    <p className="mt-0.5 opacity-90">{cfData.unclassifiedGapNotes}</p>
                  </div>
                </div>
              )}

              {/* BEGINNING CASH */}
              <div className="flex justify-between py-2 px-4 bg-slate-100 rounded font-bold text-slate-900">
                <span>BAKI TUNAI & KESETARAAN TUNAI AWAL TEMPOH (&lt; {cfData.startDate})</span>
                <span className="font-mono">RM {formatCents(cfData.beginningCashCents)}</span>
              </div>

              {/* OPERATING ACTIVITIES */}
              <div>
                <div className="bg-slate-200 py-1.5 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>{cfData.operatingSection.title}</span>
                  <span>Amaun (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-1">
                  {cfData.operatingSection.lines.map((l: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-1.5 px-4 text-slate-700">
                      <div>
                        <span>{l.description}</span>
                        {l.notes && <span className="text-xs text-slate-400 ml-2">({l.notes})</span>}
                      </div>
                      <span className={`font-mono ${l.amountCents >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {l.amountCents >= 0 ? formatCents(l.amountCents) : `(${formatCents(Math.abs(l.amountCents))})`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-1 bg-slate-50">
                  <span>Aliran Tunai Bersih daripada Aktiviti Operasi</span>
                  <span className="font-mono">RM {formatCents(cfData.operatingSection.netSectionCents)}</span>
                </div>
              </div>

              {/* INVESTING ACTIVITIES */}
              <div>
                <div className="bg-slate-200 py-1.5 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>{cfData.investingSection.title}</span>
                  <span>Amaun (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-1">
                  {cfData.investingSection.lines.length === 0 ? (
                    <div className="py-2 px-4 text-slate-400 italic text-xs">Tiada aktiviti pelaburan direkodkan.</div>
                  ) : (
                    cfData.investingSection.lines.map((l: any, idx: number) => (
                      <div key={idx} className="flex justify-between py-1.5 px-4 text-slate-700">
                        <div>
                          <span>{l.description}</span>
                          {l.notes && <span className="text-xs text-slate-400 ml-2">({l.notes})</span>}
                        </div>
                        <span className={`font-mono ${l.amountCents >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {l.amountCents >= 0 ? formatCents(l.amountCents) : `(${formatCents(Math.abs(l.amountCents))})`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-1 bg-slate-50">
                  <span>Aliran Tunai Bersih daripada Aktiviti Pelaburan</span>
                  <span className="font-mono">RM {formatCents(cfData.investingSection.netSectionCents)}</span>
                </div>
              </div>

              {/* FINANCING ACTIVITIES */}
              <div>
                <div className="bg-slate-200 py-1.5 px-4 rounded font-bold text-slate-800 uppercase text-xs tracking-wider flex justify-between">
                  <span>{cfData.financingSection.title}</span>
                  <span>Amaun (RM)</span>
                </div>
                <div className="divide-y divide-slate-100 mt-1">
                  {cfData.financingSection.lines.length === 0 ? (
                    <div className="py-2 px-4 text-slate-400 italic text-xs">Tiada aktiviti pembiayaan direkodkan.</div>
                  ) : (
                    cfData.financingSection.lines.map((l: any, idx: number) => (
                      <div key={idx} className="flex justify-between py-1.5 px-4 text-slate-700">
                        <div>
                          <span>{l.description}</span>
                          {l.notes && <span className="text-xs text-slate-400 ml-2">({l.notes})</span>}
                        </div>
                        <span className={`font-mono ${l.amountCents >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {l.amountCents >= 0 ? formatCents(l.amountCents) : `(${formatCents(Math.abs(l.amountCents))})`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between py-2 px-4 font-bold border-t border-slate-200 text-slate-900 mt-1 bg-slate-50">
                  <span>Aliran Tunai Bersih daripada Aktiviti Pembiayaan</span>
                  <span className="font-mono">RM {formatCents(cfData.financingSection.netSectionCents)}</span>
                </div>
              </div>

              {/* SUMMARY CHANGE & ENDING CASH */}
              <div className="border-t-2 border-slate-900 pt-4 space-y-2">
                <div className="flex justify-between py-1 px-4 text-slate-800 font-semibold">
                  <span>Perubahan Tunai Bersih Tempoh Ini</span>
                  <span className="font-mono">RM {formatCents(cfData.netCashChangeCents)}</span>
                </div>
                <div className="flex justify-between py-1 px-4 text-slate-800 font-semibold">
                  <span>Tambah: Baki Tunai Awal Tempoh</span>
                  <span className="font-mono">RM {formatCents(cfData.beginningCashCents)}</span>
                </div>

                <div className="flex justify-between py-3 px-4 bg-slate-900 text-white rounded font-bold text-base">
                  <span>BAKI TUNAI & KESETARAAN TUNAI AKHIR TEMPOH (&lt;= {cfData.endDate})</span>
                  <span className="font-mono">RM {formatCents(cfData.endingCashCents)}</span>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-center justify-between">
                  <span className="font-medium">✅ Sah Disemak Dengan Lejar Am (GL Bank Accounts Match)</span>
                  <span className="font-mono font-bold">RM {formatCents(cfData.endingCashCents)}</span>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

    </div>
  );
}
