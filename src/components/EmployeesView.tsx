import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.ts';
import {
  UserCheck,
  Plus,
  Search,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  Briefcase,
  Building2,
  Phone,
  Mail,
  Calendar,
  ShieldAlert,
  AlertCircle,
  Users,
  Clock,
} from 'lucide-react';

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  status: 'Active' | 'Inactive';
  joinDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmployeesViewProps {
  token: string | null;
  userRole: string;
}

const COMMON_DEPARTMENTS = [
  'Operasi & Stor',
  'Jualan & Khidmat Pelanggan',
  'Pentadbiran & Kewangan',
  'Logistik & Penghantaran',
  'Kawalan Kualiti',
  'Pengurusan Am',
];

export default function EmployeesView({ token, userRole }: EmployeesViewProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [formError, setFormError] = useState('');

  // Form states
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('Operasi & Stor');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filterStatus !== 'All') params.append('status', filterStatus);

      const res = await apiFetch(`/api/employees?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [search, filterStatus]);

  const resetForm = () => {
    setCode(`EMP-${String(employees.length + 1).padStart(3, '0')}`);
    setFullName('');
    setDesignation('');
    setDepartment('Operasi & Stor');
    setPhone('');
    setEmail('');
    setJoinDate(new Date().toISOString().split('T')[0]);
    setStatus('Active');
    setFormError('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setSelectedEmp(emp);
    setCode(emp.employeeCode);
    setFullName(emp.fullName);
    setDesignation(emp.designation || '');
    setDepartment(emp.department || 'Operasi & Stor');
    setPhone(emp.phone || '');
    setEmail(emp.email || '');
    setJoinDate(emp.joinDate || new Date().toISOString().split('T')[0]);
    setStatus(emp.status);
    setFormError('');
    setShowEditModal(true);
  };

  const handleOpenDetail = (emp: Employee) => {
    setSelectedEmp(emp);
    setShowDetailModal(true);
  };

  const validateForm = () => {
    if (!code.trim() || !fullName.trim()) {
      return 'No. Pekerja dan Nama Penuh adalah wajib diisi.';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Format alamat e-mel tidak sah.';
    }
    return '';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const validationErr = validateForm();
    if (validationErr) {
      setFormError(validationErr);
      return;
    }

    try {
      const res = await apiFetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeCode: code.trim(),
          fullName: fullName.trim(),
          designation: designation.trim() || null,
          department: department.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          joinDate: joinDate || null,
          status,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        fetchEmployees();
      } else {
        const err = await res.json();
        setFormError(err.error || 'Gagal mendaftar pekerja.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Gagal mendaftar pekerja.');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setFormError('');
    const validationErr = validateForm();
    if (validationErr) {
      setFormError(validationErr);
      return;
    }

    try {
      const res = await apiFetch(`/api/employees/${selectedEmp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeCode: code.trim(),
          fullName: fullName.trim(),
          designation: designation.trim() || null,
          department: department.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          joinDate: joinDate || null,
          status,
        }),
      });

      if (res.ok) {
        setShowEditModal(false);
        setSelectedEmp(null);
        fetchEmployees();
      } else {
        const err = await res.json();
        setFormError(err.error || 'Gagal mengemaskini maklumat pekerja.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Gagal mengemaskini maklumat pekerja.');
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    if (userRole === 'Viewer') return;
    const nextStatus = emp.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await apiFetch(`/api/employees/${emp.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchEmployees();
        if (selectedEmp && selectedEmp.id === emp.id) {
          setSelectedEmp({ ...selectedEmp, status: nextStatus });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Metrics
  const totalEmployees = employees.length;
  const activeCount = employees.filter((e) => e.status === 'Active').length;
  const inactiveCount = employees.filter((e) => e.status === 'Inactive').length;

  return (
    <div className="space-y-6 text-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Employees</h2>
          <p className="text-slate-500 text-xs">
            Direktori profil kakitangan Khairul Fresh Food untuk rujukan pentadbiran dan operasi (Buku kenalan rasmi).
          </p>
        </div>
        {userRole !== 'Viewer' && (
          <button
            onClick={handleOpenAdd}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Tambah Pekerja
          </button>
        )}
      </div>

      {/* Quick Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Jumlah Kakitangan</div>
            <div className="text-lg font-bold text-slate-900">{totalEmployees} Orang</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status Aktif</div>
            <div className="text-lg font-bold text-emerald-700">{activeCount} Bertugas</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tidak Aktif / Bekas</div>
            <div className="text-lg font-bold text-slate-700">{inactiveCount} Rekod</div>
          </div>
        </div>
      </div>

      {/* Info notice about authentication separation */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-start gap-3 text-xs text-blue-900">
        <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Perhatian:</strong> Rekod profil pekerja di modul Contact adalah buku hubungan kakitangan syarikat.
          Pendaftaran pekerja <strong>tidak mencipta akaun log masuk</strong> atau memberikan hak akses ke dalam sistem perakaunan.
        </p>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div className="w-full sm:w-96">
          <input
            type="text"
            placeholder="Cari nama, No. Pekerja, jabatan, jawatan, telefon, atau e-mel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-slate-400 shadow-xs"
          />
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {(['All', 'Active', 'Inactive'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`py-1 px-3 text-xs font-semibold rounded-lg transition-colors ${
                filterStatus === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'All' ? 'Semua' : st === 'Active' ? 'Aktif' : 'Tidak Aktif'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-5">No. Pekerja</th>
                <th className="py-3 px-5">Nama Penuh</th>
                <th className="py-3 px-5">Jawatan</th>
                <th className="py-3 px-5">Jabatan</th>
                <th className="py-3 px-5">No. Telefon</th>
                <th className="py-3 px-5">Alamat E-mel</th>
                <th className="py-3 px-5">Tarikh Mula</th>
                <th className="py-3 px-5 text-center">Status</th>
                <th className="py-3 px-5 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Memuatkan senarai pekerja...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                    Tiada rekod kakitangan dijumpai.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-5 font-mono font-bold text-slate-900">
                      {emp.employeeCode}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-slate-950">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {emp.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate max-w-[160px]">{emp.fullName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-slate-700 font-medium">
                      {emp.designation || '—'}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {emp.department || 'Am'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-slate-600 font-mono">
                      {emp.phone || '—'}
                    </td>
                    <td className="py-3.5 px-5 text-slate-500 font-mono">
                      {emp.email || '—'}
                    </td>
                    <td className="py-3.5 px-5 text-slate-600 font-mono">
                      {emp.joinDate || '—'}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <button
                        type="button"
                        disabled={userRole === 'Viewer'}
                        onClick={() => handleToggleStatus(emp)}
                        title={userRole === 'Viewer' ? 'Viewer tidak boleh menukar status' : 'Klik untuk tukar status'}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                          emp.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        } ${userRole === 'Viewer' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                      >
                        {emp.status === 'Active' ? 'AKTIF' : 'TIDAK AKTIF'}
                      </button>
                    </td>
                    <td className="py-3.5 px-5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleOpenDetail(emp)}
                        className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors"
                        title="Lihat Butiran Pekerja"
                      >
                        <Eye className="w-3.5 h-3.5" /> Butiran
                      </button>
                      <button
                        onClick={() => handleOpenEdit(emp)}
                        disabled={userRole === 'Viewer'}
                        className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-medium rounded-lg text-xs inline-flex items-center gap-1 transition-colors"
                        title={userRole === 'Viewer' ? 'Penonton tidak boleh mengubah data' : 'Edit Pekerja'}
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: TAMBAH PEKERJA */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Tambah Rekod Pekerja Baru</h3>
                <p className="text-slate-400 text-xs mt-0.5">Daftar maklumat kakitangan rasmi ke direktori Contact.</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Pekerja (Employee ID) *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="EMP-001"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Perkhidmatan</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none"
                  >
                    <option value="Active">Aktif (Bertugas)</option>
                    <option value="Inactive">Tidak Aktif (Tamat Perkhidmatan)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Penuh *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="cth: Khairul Azman bin Hamzah"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jawatan (Designation)</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="cth: Penyelia Stor"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jabatan (Department)</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none"
                  >
                    {COMMON_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alamat E-mel</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="pekerja@khairulfresh.com.my"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tarikh Mula Bertugas (Join Date)</label>
                <input
                  type="date"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Penambahan pekerja akan direkodkan ke dalam Jejak Audit sistem untuk tujuan keselamatan dan akauntabiliti data.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs shadow-xs"
                >
                  Simpan Pekerja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PEKERJA */}
      {showEditModal && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Kemaskini Profil Pekerja</h3>
                <p className="text-slate-400 text-xs mt-0.5">Ubah maklumat kakitangan {selectedEmp.employeeCode}.</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Pekerja (Employee ID) *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Perkhidmatan</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none"
                  >
                    <option value="Active">Aktif (Bertugas)</option>
                    <option value="Inactive">Tidak Aktif (Tamat Perkhidmatan)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Penuh *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jawatan (Designation)</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jabatan (Department)</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-2 focus:outline-none"
                  >
                    {COMMON_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombor Telefon</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tarikh Mula Bertugas (Join Date)</label>
                <input
                  type="date"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
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
                  Kemaskini Rekod
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW EMPLOYEE DETAILS */}
      {showDetailModal && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-900 text-sm">Butiran Profil Kakitangan</h3>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Profile Card Header */}
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-full bg-slate-900 text-white font-bold text-base flex items-center justify-center shrink-0">
                  {selectedEmp.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 text-sm truncate">{selectedEmp.fullName}</h4>
                  <p className="text-slate-500 font-medium text-xs">{selectedEmp.designation || 'Kakitangan'}</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1 ${
                      selectedEmp.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {selectedEmp.status === 'Active' ? 'AKTIF BERTUGAS' : 'TIDAK AKTIF'}
                  </span>
                </div>
              </div>

              {/* Information Grid */}
              <div className="space-y-3">
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <UserCheck className="w-3.5 h-3.5" /> No. Pekerja
                  </span>
                  <span className="font-mono font-bold text-slate-900">{selectedEmp.employeeCode}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Building2 className="w-3.5 h-3.5" /> Jabatan
                  </span>
                  <span className="font-semibold text-slate-800">{selectedEmp.department || 'Am'}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Briefcase className="w-3.5 h-3.5" /> Jawatan
                  </span>
                  <span className="font-semibold text-slate-800">{selectedEmp.designation || '—'}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Phone className="w-3.5 h-3.5" /> No. Telefon
                  </span>
                  <span className="font-mono text-slate-900 font-medium">{selectedEmp.phone || '—'}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Mail className="w-3.5 h-3.5" /> Alamat E-mel
                  </span>
                  <span className="font-mono text-slate-900 font-medium">{selectedEmp.email || '—'}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Calendar className="w-3.5 h-3.5" /> Tarikh Mula Bertugas
                  </span>
                  <span className="font-mono text-slate-900 font-medium">{selectedEmp.joinDate || '—'}</span>
                </div>
              </div>

              {/* Note */}
              <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-500 border border-slate-200">
                Profil ini disimpan di bawah direktori kenalan rasmi Khairul Fresh Food.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                {userRole !== 'Viewer' && (
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      handleOpenEdit(selectedEmp);
                    }}
                    className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs"
                  >
                    Edit Profil
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
