import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.ts';
import { 
  Building2, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Globe, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  DollarSign, 
  Lock 
} from 'lucide-react';

interface CompanyDetailsViewProps {
  token: string | null;
  userRole: string;
}

export default function CompanyDetailsView({ token, userRole }: CompanyDetailsViewProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [registeredName, setRegisteredName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [financialYearStart, setFinancialYearStart] = useState('01-01');
  const [currency, setCurrency] = useState('MYR');
  const [logoUrl, setLogoUrl] = useState('');

  const fetchProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/company/profile');
      if (res.ok) {
        const data = await res.json();
        setName(data.name || '');
        setRegisteredName(data.registeredName || '');
        setRegistrationNumber(data.registrationNumber || '');
        setAddress(data.address || '');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setWebsite(data.website || '');
        setTaxNumber(data.taxNumber || '');
        setFinancialYearStart(data.financialYearStart || '01-01');
        setCurrency(data.currency || 'MYR');
        setLogoUrl(data.logoUrl || '');
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal memuatkan profil syarikat.');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuatkan profil syarikat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'Admin') {
      setError('Hanya Pentadbir (Admin) dibenarkan mengemas kini profil syarikat.');
      return;
    }

    if (!name.trim() || !registrationNumber.trim() || !address.trim()) {
      setError('Sila lengkapkan Nama Syarikat, No. Pendaftaran SSM, dan Alamat Perniagaan.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiFetch('/api/company/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          registeredName: registeredName.trim() || null,
          registrationNumber: registrationNumber.trim(),
          address: address.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null,
          taxNumber: taxNumber.trim() || null,
          financialYearStart: financialYearStart.trim() || '01-01',
          currency: 'MYR',
          logoUrl: logoUrl.trim() || null,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setSuccess('Profil syarikat berjaya dikemas kini.');
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal mengemas kini profil syarikat.');
      }
    } catch (err: any) {
      setError(err.message || 'Ralat teknikal semasa menyimpan profil syarikat.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-sm">
      {/* Title & Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" /> Profil & Maklumat Syarikat
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Pengurusan maklumat rasmi perniagaan Khairul Fresh Accounting untuk kegunaan dokumen, invois, dan penyata.
          </p>
        </div>
        {userRole === 'Admin' && (
          <button
            onClick={fetchProfile}
            className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Muat Semula
          </button>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          <p className="text-xs">Memuatkan profil syarikat...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nama Syarikat */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Nama Syarikat (Nama Paparan Invois & Dokumen) *
              </label>
              <input
                type="text"
                placeholder="cth: Khairul Fresh Food & Trading"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={userRole !== 'Admin'}
                className="w-full border border-slate-200 bg-white rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                required
              />
            </div>

            {/* Nama Pendaftaran Rasmi */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Nama Pendaftaran Perniagaan Rasmi (SSM)
              </label>
              <input
                type="text"
                placeholder="cth: Khairul Fresh Enterprise Sdn. Bhd."
                value={registeredName}
                onChange={(e) => setRegisteredName(e.target.value)}
                disabled={userRole !== 'Admin'}
                className="w-full border border-slate-200 bg-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
              />
            </div>

            {/* Nombor Pendaftaran SSM */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Nombor Pendaftaran SSM / Perniagaan *
              </label>
              <input
                type="text"
                placeholder="cth: 202601008892 (1582910-A)"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                disabled={userRole !== 'Admin'}
                className="w-full border border-slate-200 bg-white rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                required
              />
            </div>

            {/* Nombor Cukai / SST */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Nombor Pendaftaran Cukai / SST
              </label>
              <input
                type="text"
                placeholder="cth: W10-2408-32000192"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                disabled={userRole !== 'Admin'}
                className="w-full border border-slate-200 bg-white rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
              />
            </div>

            {/* No. Telefon */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                No. Telefon Syarikat
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="cth: +60 3-8892 1020"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={userRole !== 'Admin'}
                  className="w-full border border-slate-200 bg-white rounded-lg pl-9 p-2.5 text-xs focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* E-mel Perniagaan */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                E-mel Rasmi Perniagaan
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  placeholder="cth: admin@khairulfresh.my"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={userRole !== 'Admin'}
                  className="w-full border border-slate-200 bg-white rounded-lg pl-9 p-2.5 text-xs focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* Laman Web */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Laman Web Perniagaan
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="cth: https://khairulfresh.my"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={userRole !== 'Admin'}
                  className="w-full border border-slate-200 bg-white rounded-lg pl-9 p-2.5 text-xs focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* URL Logo Syarikat */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                URL Logo Syarikat (Dokumen & Invois)
              </label>
              <input
                type="text"
                placeholder="cth: https://assets.khairulfresh.my/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={userRole !== 'Admin'}
                className="w-full border border-slate-200 bg-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
              />
            </div>

            {/* Alamat Perniagaan (Full width) */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Alamat Premis / Perniagaan Lengkap *
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <textarea
                  rows={3}
                  placeholder="cth: No. 12, Jalan Pasar Fresh 2, Pusat Perniagaan Utama, 43000 Kajang, Selangor, Malaysia"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={userRole !== 'Admin'}
                  className="w-full border border-slate-200 bg-white rounded-lg pl-9 p-2.5 text-xs focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                  required
                />
              </div>
            </div>

            {/* Permulaan Tahun Kewangan */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Tarikh Mula Tahun Kewangan (Format MM-DD)
              </label>
              <input
                type="text"
                placeholder="01-01"
                value={financialYearStart}
                onChange={(e) => setFinancialYearStart(e.target.value)}
                disabled={userRole !== 'Admin'}
                className="w-full border border-slate-200 bg-white rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
              />
            </div>

            {/* Mata Wang Utama */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Mata Wang Utama Perakaunan
              </label>
              <input
                type="text"
                value={currency}
                readOnly
                className="w-full border border-slate-200 bg-slate-50 text-slate-600 rounded-lg p-2.5 text-xs font-mono font-bold cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                * Mata wang perakaunan adalah Ringgit Malaysia (MYR).
              </span>
            </div>
          </div>

          {userRole === 'Admin' ? (
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-colors"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Simpan Profil Syarikat
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 italic text-center">
              Mod baca sahaja. Hanya Pentadbir (Admin) dibenarkan mengemaskini profil syarikat.
            </div>
          )}
        </form>
      )}
    </div>
  );
}
