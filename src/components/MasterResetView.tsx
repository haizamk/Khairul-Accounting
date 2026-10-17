import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.ts';
import { 
  RotateCcw, 
  AlertTriangle, 
  ShieldCheck, 
  Lock, 
  Database, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Trash2
} from 'lucide-react';

interface MasterResetViewProps {
  token: string | null;
  userRole: string;
}

export default function MasterResetView({ token, userRole }: MasterResetViewProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [successResult, setSuccessResult] = useState<any>(null);

  const [confirmInput, setConfirmInput] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [executing, setExecuting] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/master-reset/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal menyemak status pangkalan data.');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menyemak status pangkalan data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [token]);

  const handleExecuteReset = async () => {
    if (confirmInput.trim() !== 'RESET SEMUA DATA UJIAN') {
      setError('Sila taip frasa pengesahan yang tepat: "RESET SEMUA DATA UJIAN".');
      return;
    }

    setExecuting(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/master-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmationPhrase: confirmInput.trim() }),
      });

      if (res.ok) {
        const result = await res.json();
        setSuccessResult(result);
        setShowModal(false);
        setConfirmInput('');
        fetchStatus();
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal melaksanakan Master Reset.');
        setShowModal(false);
      }
    } catch (err: any) {
      setError(err.message || 'Ralat teknikal semasa Master Reset.');
      setShowModal(false);
    } finally {
      setExecuting(false);
    }
  };

  if (userRole !== 'Admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto shadow-xs my-8">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900 mb-1">Akses Dihadkan (Pentadbir Sahaja)</h3>
        <p className="text-xs text-slate-500">
          Modul Master Reset khas untuk kegunaan pemilik perniagaan / Pentadbir (Admin) sahaja.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-sm">
      {/* Title & Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-red-600" /> Master Reset Data Ujian
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Kawalan keselamatan pembersihan rekod ujian pakai buang untuk pengujian perniagaan Khairul Fresh Accounting.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Semak Status Pangkalan Data
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div>
            <div className="font-bold text-red-900">Ralat / Sekatan Keselamatan:</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successResult && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Master Reset Berjaya Dilaksanakan!</span>
          </div>
          <p>
            Semua data ujian pakai buang telah dibersihkan secara selamat pada pangkalan data verified: <span className="font-mono font-bold">{successResult.dbName}</span>.
          </p>
          <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1">
            <div className="font-bold text-slate-700">Asas Sistem Yang Dikekalkan (Preserved Foundations):</div>
            <ul className="list-disc list-inside text-slate-600 text-[11px] space-y-0.5">
              {successResult.preservedFoundations?.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          <p className="text-xs">Menyemak status keselamatan pangkalan data...</p>
        </div>
      ) : status ? (
        <div className="space-y-6">
          {/* Verification Guard Card */}
          <div className={`p-5 rounded-xl border ${status.allowed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/80 border-amber-200'} shadow-xs`}>
            <div className="flex items-start gap-3">
              {status.allowed ? (
                <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-2 text-xs flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">
                    {status.allowed ? 'Status Keselamatan: DIBENARKAN (Disposable Test Environment)' : 'Status Keselamatan: DITEGAH (Protected / Production Database)'}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${status.allowed ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                    {status.allowed ? 'LULUS GUARD' : 'RESET DILUMPUHKAN'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white/80 p-3 rounded-lg border border-slate-200/80 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-400 block font-sans text-[10px] uppercase font-bold">Pangkalan Data Active</span>
                    <span className="font-bold text-slate-900">{status.dbName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-sans text-[10px] uppercase font-bold">Pengguna DB</span>
                    <span className="font-bold text-slate-900">{status.userName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-sans text-[10px] uppercase font-bold">ALLOW_MUTATING_INTEGRATION_TESTS</span>
                    <span className={`font-bold ${status.flagEnabled ? 'text-emerald-700' : 'text-red-700'}`}>
                      {status.flagEnabled ? 'true (Aktif)' : 'false (Lumpuh)'}
                    </span>
                  </div>
                </div>

                {!status.allowed && (
                  <p className="text-amber-900 font-semibold bg-amber-100/60 p-2.5 rounded-lg border border-amber-200 leading-relaxed">
                    {status.reason}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Record Scope Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
              Pratonton Rekod Ujian Yang Akan Dipadamkan (Reset Scope)
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pelanggan (Customers)</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.customers ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pembekal (Suppliers)</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.suppliers ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Katalog Produk</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.products ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Invois Jualan</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.salesInvoices ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Bil Pembelian</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.purchaseBills ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Bayaran Pelanggan</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.customerPayments ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Bayaran Pembekal</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.supplierPayments ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Perbelanjaan</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.expenses ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Rekod Penyata Bank</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.bankBatches ?? 0}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Catatan Jurnal Lejar</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{status.counts?.journalEntries ?? 0}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-800">Dikekalkan (System Foundations Preserved):</div>
              <p className="text-slate-500">
                Profil Syarikat, Akaun Pengguna & Capaian Admin, Carta Akaun (COA), Tempoh Kewangan, dan Skema Migrasi Pangkalan Data tidak akan dipadamkan.
              </p>
            </div>
          </div>

          {/* Execution Form Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Pengesahan Master Reset
            </h3>

            {status.allowed ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">
                  Untuk meneruskan pembersihan data ujian, sila taip frasa pengesahan di bawah:
                </p>
                <div className="space-y-1 max-w-md">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase">
                    Taip Frasa: <span className="font-mono text-red-700 font-extrabold select-all">RESET SEMUA DATA UJIAN</span>
                  </label>
                  <input
                    type="text"
                    placeholder="RESET SEMUA DATA UJIAN"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-red-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={confirmInput.trim() !== 'RESET SEMUA DATA UJIAN'}
                  onClick={() => setShowModal(true)}
                  className="py-2.5 px-6 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Reset Semua Data Ujian
                </button>
              </div>
            ) : (
              <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-500 italic">
                Pembersihan Master Reset dilumpuhkan pada pangkalan data ini untuk mengelakkan kehilangan data perniagaan.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 bg-red-100 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Pengesahan Akhir Master Reset</h3>
                <p className="text-xs text-slate-500">Tindakan ini adalah muktamad.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-red-50 p-3 rounded-xl border border-red-100">
              Adakah anda benar-benar pasti mahu memadamkan semua rekod transaksi ujian pada pangkalan data <span className="font-mono font-bold text-red-900">{status?.dbName}</span>? Tindakan ini tidak boleh diundurkan.
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={executing}
                className="py-2 px-4 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={executing}
                className="py-2 px-5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs"
              >
                {executing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Melaksanakan Reset...
                  </>
                ) : (
                  'Ya, Padamkan Semua Data Ujian'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
