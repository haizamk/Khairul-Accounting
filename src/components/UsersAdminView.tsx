import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.ts';
import { 
  Shield, 
  UserPlus, 
  Search, 
  Filter, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Lock, 
  UserCheck, 
  UserX, 
  ShieldAlert,
  Mail,
  User,
  Check
} from 'lucide-react';

interface UsersAdminViewProps {
  token: string | null;
  userRole: string;
  currentUserUid: string;
}

export default function UsersAdminView({ token, userRole, currentUserUid }: UsersAdminViewProps) {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Accountant' | 'Viewer'>('Accountant');
  const [submittingInvite, setSubmittingInvite] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal memuatkan senarai pengguna.');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuatkan senarai pengguna.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleRoleChange = async (targetUid: string, newRole: 'Admin' | 'Accountant' | 'Viewer') => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(`/api/users/${targetUid}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        setSuccess('Peranan pengguna berjaya dikemas kini.');
        fetchUsers();
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal mengemas kini peranan pengguna.');
      }
    } catch (err: any) {
      setError(err.message || 'Ralat teknikal semasa pertukaran peranan.');
    }
  };

  const handleStatusToggle = async (targetUid: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setError('');
    setSuccess('');

    if (targetUid === currentUserUid && !nextStatus) {
      setError('Sekatan Keselamatan: Anda tidak boleh menyahaktifkan akaun anda sendiri.');
      return;
    }

    try {
      const res = await apiFetch(`/api/users/${targetUid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      if (res.ok) {
        setSuccess(`Akaun pengguna telah ${nextStatus ? 'diaktifkan' : 'dinyahaktifkan'}.`);
        fetchUsers();
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal menukar status akaun pengguna.');
      }
    } catch (err: any) {
      setError(err.message || 'Ralat teknikal semasa menukar status pengguna.');
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      setError('Sila masukkan alamat e-mel.');
      return;
    }

    setSubmittingInvite(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiFetch('/api/users/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || inviteEmail.split('@')[0],
          role: inviteRole,
        }),
      });

      if (res.ok) {
        setSuccess(`Pengguna '${inviteEmail}' berjaya didaftarkan/dijemput sebagai ${inviteRole}.`);
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteName('');
        setInviteRole('Accountant');
        fetchUsers();
      } else {
        const errJson = await res.json();
        setError(errJson.error || 'Gagal mendaftarkan pengguna.');
      }
    } catch (err: any) {
      setError(err.message || 'Ralat teknikal semasa pendaftaran pengguna.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  // Filtering
  const filteredUsers = usersList.filter((u) => {
    const matchesSearch = 
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'ACTIVE' && u.isActive) || 
      (statusFilter === 'INACTIVE' && !u.isActive);

    return matchesSearch && matchesRole && matchesStatus;
  });

  if (userRole !== 'Admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto shadow-xs my-8">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900 mb-1">Akses Dihadkan (Pentadbir Sahaja)</h3>
        <p className="text-xs text-slate-500">
          Pengurusan pengguna dan peranan capaian khas untuk kegunaan Pentadbir (Admin) sahaja.
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
            <Shield className="w-5 h-5 text-blue-600" /> Pengguna & Pentadbiran Akses (RBAC)
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Pengurusan akaun pengguna sistem, kawalan peranan (Admin, Accountant, Viewer), dan status log masuk.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchUsers}
            className="py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Muat Semula
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" /> Jemput / Daftar Pengguna
          </button>
        </div>
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

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari mengikut nama atau e-mel..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-slate-200 bg-white rounded-lg pl-9 p-2 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto text-xs">
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Peranan:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="border border-slate-200 bg-white rounded-lg p-1.5 focus:outline-none text-xs"
            >
              <option value="ALL">Semua Peranan</option>
              <option value="Admin">Admin</option>
              <option value="Accountant">Accountant</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-200 bg-white rounded-lg p-1.5 focus:outline-none text-xs"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nyahaktif</option>
            </select>
          </div>
        </div>
      </div>

      {/* User Directory Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-xs">Memuatkan direktori pengguna...</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                <th className="py-3 px-4">Nama & E-mel Pengguna</th>
                <th className="py-3 px-4">Peranan Akses (RBAC)</th>
                <th className="py-3 px-4">Status Akaun</th>
                <th className="py-3 px-4">Tarikh Didaftarkan</th>
                <th className="py-3 px-4 text-center">Tindakan Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    Tiada pengguna ditemui mengikut carian/penapis semasa.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.uid === currentUserUid;

                  return (
                    <tr key={u.uid} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shrink-0 ${u.role === 'Admin' ? 'bg-indigo-600' : u.role === 'Accountant' ? 'bg-blue-600' : 'bg-slate-500'}`}>
                            {u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isCurrent && (
                                <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.2 rounded font-bold">
                                  Akaun Anda
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 font-mono text-[11px]">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Dropdown */}
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.uid, e.target.value as any)}
                          className="border border-slate-200 bg-white rounded-lg p-1.5 text-xs font-semibold focus:outline-none focus:border-blue-500"
                        >
                          <option value="Admin">Admin (Akses Penuh)</option>
                          <option value="Accountant">Accountant (Perakaunan)</option>
                          <option value="Viewer">Viewer (Pemerhati Sahaja)</option>
                        </select>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border ${u.isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                          {u.isActive ? 'AKTIF' : 'NYAHAKTIF'}
                        </span>
                      </td>

                      {/* Date Created */}
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ms-MY') : '—'}
                      </td>

                      {/* Status Toggle Action */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(u.uid, u.isActive)}
                          className={`py-1 px-3 rounded-lg font-bold text-[11px] transition-colors border ${u.isActive ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                        >
                          {u.isActive ? 'Nyahaktifkan' : 'Aktifkan Akses'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" /> Jemput / Daftar Pengguna Baru
              </h3>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600 text-xs">
                Tutup ✕
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Alamat E-mel Pengguna *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    placeholder="pengguna@khairulfresh.my"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg pl-9 p-2 text-xs focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nama Pengguna (Pilihan)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="cth: Ahmad Fakhrul"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg pl-9 p-2 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Peranan Capaian (Role) *
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="Admin">Admin (Akses Penuh Pengurusan & Reset)</option>
                  <option value="Accountant">Accountant (Invois, Bil, Bayaran, Bank, Penyata)</option>
                  <option value="Viewer">Viewer (Pemerhati Baca Sahaja)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  disabled={submittingInvite}
                  className="py-2 px-4 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="py-2 px-5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
                >
                  {submittingInvite ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Mendaftarkan...
                    </>
                  ) : (
                    'Sahkan Pendaftaran'
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
