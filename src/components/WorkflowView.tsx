import React from 'react';
import { 
  Users, 
  Receipt, 
  CreditCard, 
  FileText, 
  Truck, 
  Wallet, 
  RefreshCw, 
  CheckCircle, 
  ArrowRight, 
  HelpCircle, 
  Building2, 
  Scale, 
  ArrowUpRight 
} from 'lucide-react';

interface WorkflowViewProps {
  onNavigate: (tab: string) => void;
}

export default function WorkflowView({ onNavigate }: WorkflowViewProps) {
  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 text-white rounded-xl shadow-sm">
        <h2 className="text-xl font-bold tracking-tight">Aliran Kerja Perniagaan (Business Workflows)</h2>
        <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
          Panduan visual langkah demi langkah untuk menguruskan jualan, pembelian, dan penyesuaian bank dengan mudah tanpa keliru tentang istilah perakaunan yang rumit.
        </p>
      </div>

      {/* Workflow A: Jualan */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">A. Aliran Kerja Jualan & Kutipan Pelanggan</h3>
              <p className="text-xs text-slate-500">Daripada pendaftaran pelanggan hingga kutipan bayaran penuh.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('invoices')}
            className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <span>Mula Invois Jualan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Step 1 */}
          <div 
            onClick={() => onNavigate('customers')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Langkah 01</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Daftar Pelanggan</h4>
              <p className="text-xs text-slate-500 mt-1">Simpan maklumat dan alamat pelanggan tetap anda.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Buka Pelanggan</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </div>
          </div>

          {/* Step 2 */}
          <div 
            onClick={() => onNavigate('invoices')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Langkah 02</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Invois Jualan</h4>
              <p className="text-xs text-slate-500 mt-1">Keluarkan invois rasmi dan pos ke lejar secara automatik.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Buat Invois</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </div>
          </div>

          {/* Step 3 */}
          <div 
            onClick={() => onNavigate('payments')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Langkah 03</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Terima Bayaran</h4>
              <p className="text-xs text-slate-500 mt-1">Rekod bayaran penuh atau separa (tunai / bank).</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Rekod Bayaran</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </div>
          </div>

          {/* Step 4 */}
          <div 
            onClick={() => onNavigate('ar-aging')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Langkah 04</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Semak Baki</h4>
              <p className="text-xs text-slate-500 mt-1">Pantau senarai pelanggan yang masih belum menjelaskan baki.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Buka Pelanggan Belum Bayar</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Workflow B: Pembelian */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">B. Aliran Kerja Pembelian & Bayaran Bil</h3>
              <p className="text-xs text-slate-500">Pengurusan bil pembekal dan rekod perbelanjaan operasi.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('purchase-bills')}
            className="py-2 px-3.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <span>Tambah Bil Pembelian</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Step 1 */}
          <div 
            onClick={() => onNavigate('suppliers')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Langkah 01</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">Daftar Pembekal</h4>
              <p className="text-xs text-slate-500 mt-1">Simpan maklumat vendor dan senarai pembekal bahan mentah.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Buka Pembekal</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
            </div>
          </div>

          {/* Step 2 */}
          <div 
            onClick={() => onNavigate('purchase-bills')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Langkah 02</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">Bil Pembelian</h4>
              <p className="text-xs text-slate-500 mt-1">Rekod bil pembekal untuk mengiktiraf kos dan liabiliti.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Tambah Bil</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
            </div>
          </div>

          {/* Step 3 */}
          <div 
            onClick={() => onNavigate('supplier-payments')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Langkah 03</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">Bayar Pembekal</h4>
              <p className="text-xs text-slate-500 mt-1">Buat bayaran melalui bank untuk melunaskan bil.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Bayar Bil</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
            </div>
          </div>

          {/* Step 4 */}
          <div 
            onClick={() => onNavigate('ap-aging')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Langkah 04</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">Semak Baki Bil</h4>
              <p className="text-xs text-slate-500 mt-1">Pantau bil belum dibayar dan tempoh kredit.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Buka Bil Belum Dibayar</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Workflow C: Bank dan Tunai */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">C. Aliran Kerja Bank & Penyesuaian</h3>
              <p className="text-xs text-slate-500">Memadankan rekod penyata bank dengan buku perakaunan.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('bank-recon')}
            className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <span>Padankan Rekod Bank</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Step 1 */}
          <div 
            onClick={() => onNavigate('bank-recon')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Langkah 01</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Muat Naik Penyata</h4>
              <p className="text-xs text-slate-500 mt-1">Import fail CSV penyata bank ke dalam sistem.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Buka Penyesuaian</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
            </div>
          </div>

          {/* Step 2 */}
          <div 
            onClick={() => onNavigate('bank-recon')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Langkah 02</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Padankan Rekod</h4>
              <p className="text-xs text-slate-500 mt-1">Sistem menyemak dan memadankan transaksi secara automatik.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Padan Transaksi</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
            </div>
          </div>

          {/* Step 3 */}
          <div 
            onClick={() => onNavigate('bank-recon')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Langkah 03</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Semak Perbezaan</h4>
              <p className="text-xs text-slate-500 mt-1">Pastikan perbezaan baki bersamaan dengan RM 0.00.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Semak Baki</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
            </div>
          </div>

          {/* Step 4 */}
          <div 
            onClick={() => onNavigate('bank-recon')}
            className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Langkah 04</div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Lengkapkan Sesi</h4>
              <p className="text-xs text-slate-500 mt-1">Kunci sesi penyesuaian bank apabila semua padanan selesai.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Selesai Sesi</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Apa yang perlu saya buat? Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="w-5 h-5 text-slate-800" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Apa yang perlu saya buat? (Panduan Pantas Harian)</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs">
            <h4 className="font-bold text-slate-900 mb-1">Hari ini ada jualan baru kepada pelanggan?</h4>
            <p className="text-slate-500 mb-3">Terus ke menu <span className="font-semibold text-slate-700">Invois Jualan</span> dan klik "Tambah Invois". Masukkan kuantiti dan harga produk.</p>
            <button onClick={() => onNavigate('invoices')} className="font-bold text-blue-600 hover:underline">Pergi ke Invois Jualan →</button>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs">
            <h4 className="font-bold text-slate-900 mb-1">Menerima bayaran tunai atau pindahan bank?</h4>
            <p className="text-slate-500 mb-3">Pergi ke <span className="font-semibold text-slate-700">Bayaran Pelanggan</span> untuk mengaitkan bayaran dengan invois terbuka.</p>
            <button onClick={() => onNavigate('payments')} className="font-bold text-blue-600 hover:underline">Pergi ke Bayaran Pelanggan →</button>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs">
            <h4 className="font-bold text-slate-900 mb-1">Membayar bil utiliti atau sewa kedai?</h4>
            <p className="text-slate-500 mb-3">Gunakan menu <span className="font-semibold text-slate-700">Perbelanjaan</span> untuk merekod kos perniagaan secara langsung.</p>
            <button onClick={() => onNavigate('expenses')} className="font-bold text-blue-600 hover:underline">Pergi ke Perbelanjaan →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
