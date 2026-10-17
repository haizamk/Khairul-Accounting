// Employee Contact Profile Service (Unified Contact Module)
// Note: Employee contact profiles are official staff directory records.
// They DO NOT grant login accounts or system permissions in the accounting system.

export interface EmployeeContact {
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

export interface EmployeeInput {
  employeeCode: string;
  fullName: string;
  designation?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: 'Active' | 'Inactive';
  joinDate?: string | null;
}

// Seed initial representative employee contact records
let employeesStore: EmployeeContact[] = [
  {
    id: 'emp-1',
    employeeCode: 'EMP-001',
    fullName: 'Ahmad Faiz bin Rosli',
    designation: 'Pengurus Cawangan & Operasi',
    department: 'Operasi & Stor',
    phone: '012-8877123',
    email: 'faiz@khairulfresh.com.my',
    status: 'Active',
    joinDate: '2024-03-01',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 'emp-2',
    employeeCode: 'EMP-002',
    fullName: 'Siti Nurhaliza binti Zulkifli',
    designation: 'Eksekutif Akaun & Kewangan',
    department: 'Pentadbiran & Kewangan',
    phone: '013-4455667',
    email: 'siti@khairulfresh.com.my',
    status: 'Active',
    joinDate: '2024-06-15',
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-02T08:00:00.000Z',
  },
  {
    id: 'emp-3',
    employeeCode: 'EMP-003',
    fullName: 'Muhammad Danish bin Harun',
    designation: 'Penyelia Logistik & Rantaian Sejuk',
    department: 'Logistik & Penghantaran',
    phone: '017-9988221',
    email: 'danish@khairulfresh.com.my',
    status: 'Active',
    joinDate: '2025-01-10',
    createdAt: '2026-10-03T08:00:00.000Z',
    updatedAt: '2026-10-03T08:00:00.000Z',
  },
  {
    id: 'emp-4',
    employeeCode: 'EMP-004',
    fullName: 'Nurul Izzah binti Mahadi',
    designation: 'Juruwang Kanan Premis',
    department: 'Jualan & Khidmat Pelanggan',
    phone: '019-3322114',
    email: 'izzah@khairulfresh.com.my',
    status: 'Inactive',
    joinDate: '2024-09-01',
    createdAt: '2026-10-04T08:00:00.000Z',
    updatedAt: '2026-10-04T08:00:00.000Z',
  }
];

export async function getEmployees(searchQuery?: string, statusFilter?: string): Promise<EmployeeContact[]> {
  let list = [...employeesStore];
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(e => 
      e.employeeCode.toLowerCase().includes(q) ||
      e.fullName.toLowerCase().includes(q) ||
      (e.designation && e.designation.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q)) ||
      (e.email && e.email.toLowerCase().includes(q)) ||
      (e.phone && e.phone.toLowerCase().includes(q))
    );
  }
  if (statusFilter && statusFilter !== 'All') {
    list = list.filter(e => e.status === statusFilter);
  }
  return list.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
}

export async function getEmployeeById(id: string): Promise<EmployeeContact> {
  const found = employeesStore.find(e => e.id === id);
  if (!found) {
    throw new Error("Profil pekerja tidak dijumpai.");
  }
  return found;
}

export async function createEmployee(input: EmployeeInput, userRole: string): Promise<EmployeeContact> {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot create employee records.");
  }
  if (!input.employeeCode || !input.fullName) {
    throw new Error("Validation Error: Kod pekerja dan nama penuh adalah wajib.");
  }

  const cleanCode = input.employeeCode.trim().toUpperCase();
  const cleanName = input.fullName.trim();

  const duplicate = employeesStore.find(e => e.employeeCode.toUpperCase() === cleanCode);
  if (duplicate) {
    throw new Error(`Validation Error: Kod pekerja '${cleanCode}' sudah wujud.`);
  }

  const newEmp: EmployeeContact = {
    id: `emp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    employeeCode: cleanCode,
    fullName: cleanName,
    designation: input.designation ? input.designation.trim() : null,
    department: input.department ? input.department.trim() : null,
    phone: input.phone ? input.phone.trim() : null,
    email: input.email ? input.email.trim() : null,
    status: input.status === 'Inactive' ? 'Inactive' : 'Active',
    joinDate: input.joinDate ? input.joinDate.trim() : new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  employeesStore.push(newEmp);
  return newEmp;
}

export async function updateEmployee(id: string, input: Partial<EmployeeInput>, userRole: string): Promise<EmployeeContact> {
  if (userRole === 'Viewer') {
    throw new Error("Unauthorized: Viewers cannot edit employee records.");
  }

  const idx = employeesStore.findIndex(e => e.id === id);
  if (idx === -1) {
    throw new Error("Profil pekerja tidak dijumpai.");
  }

  const current = employeesStore[idx];

  if (input.employeeCode && input.employeeCode.trim().toUpperCase() !== current.employeeCode.toUpperCase()) {
    const cleanCode = input.employeeCode.trim().toUpperCase();
    const duplicate = employeesStore.find(e => e.id !== id && e.employeeCode.toUpperCase() === cleanCode);
    if (duplicate) {
      throw new Error(`Validation Error: Kod pekerja '${cleanCode}' sudah digunakan.`);
    }
  }

  const updated: EmployeeContact = {
    ...current,
    employeeCode: input.employeeCode !== undefined ? input.employeeCode.trim().toUpperCase() : current.employeeCode,
    fullName: input.fullName !== undefined ? input.fullName.trim() : current.fullName,
    designation: input.designation !== undefined ? (input.designation ? input.designation.trim() : null) : current.designation,
    department: input.department !== undefined ? (input.department ? input.department.trim() : null) : current.department,
    phone: input.phone !== undefined ? (input.phone ? input.phone.trim() : null) : current.phone,
    email: input.email !== undefined ? (input.email ? input.email.trim() : null) : current.email,
    status: input.status !== undefined ? input.status : current.status,
    joinDate: input.joinDate !== undefined ? (input.joinDate ? input.joinDate.trim() : null) : current.joinDate,
    updatedAt: new Date().toISOString(),
  };

  employeesStore[idx] = updated;
  return updated;
}
