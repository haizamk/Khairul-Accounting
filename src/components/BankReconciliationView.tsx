import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  Lock, 
  Unlock, 
  FileText, 
  ArrowRightLeft,
  ChevronRight,
  ShieldCheck,
  Search,
  Wallet
} from 'lucide-react';

interface BankReconciliationViewProps {
  accounts: any[];
  token: string | null;
  userRole: string;
}

export default function BankReconciliationView({ accounts, token, userRole }: BankReconciliationViewProps) {
  const eligibleAccounts = accounts.filter(a => a.type === 'Asset' && ['Checking', 'CashBox', 'Savings'].includes(a.subType) && a.active);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(eligibleAccounts[0]?.id || '');

  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionSummary, setActiveSessionSummary] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Create Session Form State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('2026-10-01');
  const [endDate, setEndDate] = useState<string>('2026-10-31');
  const [openingRM, setOpeningRM] = useState<string>('0.00');
  const [endingRM, setEndingRM] = useState<string>('0.00');

  // CSV Import Modal State
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);

  // Bank Fee Quick-Post Modal State
  const [showFeeModal, setShowFeeModal] = useState<boolean>(false);
  const [feeDate, setFeeDate] = useState<string>('2026-10-15');
  const [feeDesc, setFeeDesc] = useState<string>('Maybank Monthly Bank Service Fee');
  const [feeRM, setFeeRM] = useState<string>('15.00');
  const [selectedStmtLineForFee, setSelectedStmtLineForFee] = useState<any>(null);

  // Reopen Modal State
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');

  // Matching Selection State
  const [selectedStmtLineId, setSelectedStmtLineId] = useState<string | null>(null);
  const [selectedGlLineId, setSelectedGlLineId] = useState<string | null>(null);

  const fetchSessions = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const url = selectedAccountId 
        ? `/api/bank-reconciliation/sessions?bankAccountId=${selectedAccountId}`
        : '/api/bank-reconciliation/sessions';
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0) {
          // Fetch active or latest session summary
          const activeS = data.find((s: any) => s.status === 'In_Progress') || data[0];
          fetchSessionSummary(activeS.id);
        } else {
          setActiveSessionSummary(null);
        }
      }
    } catch (err: any) {
      setError("Failed to fetch reconciliation sessions.");
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionSummary = async (sessionId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/bank-reconciliation/sessions/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const summary = await res.json();
        setActiveSessionSummary(summary);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [selectedAccountId, token]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const openingCents = Math.round(parseFloat(openingRM || '0') * 100);
    const endingCents = Math.round(parseFloat(endingRM || '0') * 100);

    try {
      const res = await fetch('/api/bank-reconciliation/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bankAccountId: selectedAccountId,
          statementStartDate: startDate,
          statementEndDate: endDate,
          statementOpeningBalance: openingCents,
          statementEndingBalance: endingCents,
        })
      });

      if (res.ok) {
        const newSession = await res.json();
        setSuccess("Reconciliation session created successfully!");
        setShowCreateModal(false);
        fetchSessions();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to create session.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create session.");
    }
  };

  // CSV Parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawCsvText(content);

      // Simple CSV line parser
      const lines = content.split('\n').filter(l => l.trim() !== '');
      const parsed: any[] = [];

      for (let i = 1; i < lines.length; i++) { // Skip header row
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"/, '').replace(/"$/, ''));
        if (cols.length >= 3) {
          const date = cols[0];
          const desc = cols[1];
          const ref = cols.length >= 4 ? cols[2] : '';
          const amtStr = cols.length >= 4 ? cols[3] : cols[2];
          const amtCents = Math.round(parseFloat(amtStr || '0') * 100);

          if (date && desc && !isNaN(amtCents) && amtCents !== 0) {
            parsed.push({
              transactionDate: date,
              description: desc,
              reference: ref,
              amount: amtCents,
            });
          }
        }
      }
      setParsedRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleImportCSV = async () => {
    if (!activeSessionSummary?.session?.id || parsedRows.length === 0) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/bank-reconciliation/sessions/${activeSessionSummary.session.id}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: csvFileName || 'statement.csv',
          fileContent: rawCsvText,
          rows: parsedRows,
        })
      });

      if (res.ok) {
        const result = await res.json();
        setSuccess(`Successfully imported ${result.insertedLines.length} statement transactions!`);
        setShowImportModal(false);
        setParsedRows([]);
        setRawCsvText('');
        fetchSessionSummary(activeSessionSummary.session.id);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to import CSV statement.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to import CSV statement.");
    }
  };

  const handleAutoMatch = async () => {
    if (!activeSessionSummary?.session?.id) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/bank-reconciliation/sessions/${activeSessionSummary.session.id}/auto-match`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const result = await res.json();
        setSuccess(`Auto-matching complete: Matched ${result.count} transactions!`);
        fetchSessionSummary(activeSessionSummary.session.id);
      } else {
        const errData = await res.json();
        setError(errData.error || "Auto-matching failed.");
      }
    } catch (err: any) {
      setError(err.message || "Auto-matching failed.");
    }
  };

  const handleMatchSelected = async () => {
    if (!activeSessionSummary?.session?.id || !selectedStmtLineId || !selectedGlLineId) return;
    setError('');
    setSuccess('');

    const stmtLine = activeSessionSummary.stmtLines.find((l: any) => l.id === selectedStmtLineId);
    if (!stmtLine) return;

    try {
      const res = await fetch(`/api/bank-reconciliation/sessions/${activeSessionSummary.session.id}/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          statementLineId: selectedStmtLineId,
          journalLineId: selectedGlLineId,
          amountCents: Math.abs(stmtLine.amount),
        })
      });

      if (res.ok) {
        setSuccess("Transaction matched successfully!");
        setSelectedStmtLineId(null);
        setSelectedGlLineId(null);
        fetchSessionSummary(activeSessionSummary.session.id);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to create match.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create match.");
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!activeSessionSummary?.session?.id) return;
    try {
      const res = await fetch(`/api/bank-reconciliation/matches/${matchId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccess("Match removed.");
        fetchSessionSummary(activeSessionSummary.session.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostBankFee = async () => {
    if (!activeSessionSummary?.session?.id || !selectedStmtLineForFee) return;
    setError('');
    setSuccess('');

    // Find 5400 Bank Charges account
    const bankChargeAcc = accounts.find(a => a.code === '5400') || accounts.find(a => a.type === 'Expense');
    if (!bankChargeAcc) {
      setError("No expense account found for Bank Service Charges.");
      return;
    }

    const amountCents = Math.round(parseFloat(feeRM || '0') * 100);

    try {
      // 1. Post Direct Expense
      const expRes = await fetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          expenseDate: feeDate,
          description: feeDesc,
          reference: selectedStmtLineForFee.reference || 'BANK-FEE',
          expenseAccountId: bankChargeAcc.id,
          paymentAccountId: selectedAccountId,
          amount: amountCents,
          status: 'Posted',
        })
      });

      if (expRes.ok) {
        const expData = await expRes.json();
        
        // Fetch updated session summary to get the newly created GL journal line ID
        const summaryRes = await fetch(`/api/bank-reconciliation/sessions/${activeSessionSummary.session.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const newSummary = await summaryRes.json();
        
        // Find GL line matching this new expense
        const newGLLine = newSummary.eligibleGLLines.find((gl: any) => gl.entryId === expData.postedJournalId);
        
        if (newGLLine) {
          // 2. Auto-match to statement line
          await fetch(`/api/bank-reconciliation/sessions/${activeSessionSummary.session.id}/match`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              statementLineId: selectedStmtLineForFee.id,
              journalLineId: newGLLine.lineId,
              amountCents: amountCents,
            })
          });
        }

        setSuccess("Bank fee posted and matched successfully!");
        setShowFeeModal(false);
        setSelectedStmtLineForFee(null);
        fetchSessionSummary(activeSessionSummary.session.id);
      } else {
        const errData = await expRes.json();
        setError(errData.error || "Failed to post bank fee.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to post bank fee.");
    }
  };

  const handleCompleteSession = async () => {
    if (!activeSessionSummary?.session?.id) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/bank-reconciliation/sessions/${activeSessionSummary.session.id}/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setSuccess("Reconciliation session completed and locked!");
        fetchSessions();
      } else {
        const errData = await res.json();
        setError(errData.error || "Completion blocked.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to complete session.");
    }
  };

  const handleReopenSession = async () => {
    if (!activeSessionSummary?.session?.id || !reopenReason.trim()) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/bank-reconciliation/sessions/${activeSessionSummary.session.id}/reopen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: reopenReason.trim() })
      });

      if (res.ok) {
        setSuccess("Reconciliation session reopened successfully.");
        setShowReopenModal(false);
        setReopenReason('');
        fetchSessions();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to reopen session.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to reopen session.");
    }
  };

  const formatCents = (cents: number) => {
    const isNeg = cents < 0;
    const abs = Math.abs(cents) / 100;
    const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNeg ? `-RM ${str}` : `RM ${str}`;
  };

  return (
    <div className="space-y-6 text-sm">
      
      {/* HEADER & BANK SELECTOR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 border border-slate-200 rounded-lg">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-800" />
            Bank Statement Reconciliation Workbench
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit-grade bank statement matching and ledger balance verification for Khairul Fresh Food.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Target Bank Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="text-xs font-semibold border border-slate-200 bg-white rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 min-w-[220px]"
            >
              {eligibleAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.subType})</option>
              ))}
            </select>
          </div>

          {userRole !== 'Viewer' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" /> Start Reconciliation Session
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-100 rounded-lg text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* ACTIVE SESSION WORKBENCH */}
      {activeSessionSummary && activeSessionSummary.session ? (
        <div className="space-y-6">
          
          {/* SESSION METRICS CARD */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${activeSessionSummary.session.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                  {activeSessionSummary.session.status}
                </span>
                <span className="font-semibold text-slate-700">
                  Statement Period: {activeSessionSummary.session.statementStartDate} to {activeSessionSummary.session.statementEndDate}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {activeSessionSummary.session.status === 'In_Progress' && userRole !== 'Viewer' && (
                  <>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" /> Import CSV Statement
                    </button>
                    <button
                      onClick={handleAutoMatch}
                      className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Auto-Match Lines
                    </button>
                    <button
                      onClick={handleCompleteSession}
                      disabled={!activeSessionSummary.canComplete}
                      className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold rounded flex items-center gap-1.5"
                      title={!activeSessionSummary.canComplete ? "Complete blocked: Difference must be 0 and no unmatched statement lines" : "Lock Session"}
                    >
                      <Lock className="w-3.5 h-3.5" /> Complete Reconciliation
                    </button>
                  </>
                )}

                {activeSessionSummary.session.status === 'Completed' && userRole === 'Admin' && (
                  <button
                    onClick={() => setShowReopenModal(true)}
                    className="py-1.5 px-3 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-xs font-semibold rounded flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Admin Reopen Session
                  </button>
                )}
              </div>
            </div>

            {/* FORMULA RECONCILIATION SUMMARY DASHBOARD */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Stmt Opening</span>
                <span className="font-bold text-slate-900">{formatCents(activeSessionSummary.statementOpeningBalance)}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Stmt Ending</span>
                <span className="font-bold text-slate-900">{formatCents(activeSessionSummary.statementEndingBalance)}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">GL Cutoff Book</span>
                <span className="font-bold text-slate-900">{formatCents(activeSessionSummary.glBookBalance)}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Deposits in Transit</span>
                <span className="font-bold text-emerald-700">+{formatCents(activeSessionSummary.unmatchedBookDeposits)}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Outstanding Checks</span>
                <span className="font-bold text-red-700">-{formatCents(activeSessionSummary.unmatchedBookWithdrawals)}</span>
              </div>
              <div className={`p-3 rounded border font-bold ${activeSessionSummary.difference === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                <span className="text-[10px] uppercase tracking-wider block mb-1">Recon Discrepancy</span>
                <span className="text-sm">{formatCents(activeSessionSummary.difference)}</span>
              </div>
            </div>
          </div>

          {/* TWO-COLUMN RECONCILIATION WORKBENCH */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* LEFT COLUMN: BANK STATEMENT TRANSACTIONS */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  Bank Statement Lines ({activeSessionSummary.stmtLines.length})
                </h3>
                <span className="text-xs text-slate-500 font-medium">Unmatched: {activeSessionSummary.unmatchedStmtCount}</span>
              </div>

              <div className="overflow-x-auto max-h-[450px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 sticky top-0">
                    <tr className="border-b border-slate-200">
                      <th className="p-2">Date</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2 text-center">Status</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeSessionSummary.stmtLines.map((line: any) => {
                      const isSelected = selectedStmtLineId === line.id;
                      return (
                        <tr key={line.id} className={`hover:bg-slate-50 ${isSelected ? 'bg-blue-50/70' : ''}`}>
                          <td className="p-2 font-mono whitespace-nowrap">{line.transactionDate}</td>
                          <td className="p-2 font-medium max-w-[150px] truncate" title={line.description}>{line.description}</td>
                          <td className={`p-2 text-right font-mono font-bold whitespace-nowrap ${line.amount > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {formatCents(line.amount)}
                          </td>
                          <td className="p-2 text-center">
                            {line.isFullyMatched ? (
                              <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[9px]">Matched</span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-bold text-[9px]">Unmatched</span>
                            )}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {!line.isFullyMatched && activeSessionSummary.session.status === 'In_Progress' && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setSelectedStmtLineId(isSelected ? null : line.id)}
                                  className={`py-0.5 px-2 text-[10px] font-bold rounded ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                >
                                  {isSelected ? 'Selected' : 'Select'}
                                </button>
                                {line.amount < 0 && (
                                  <button
                                    onClick={() => {
                                      setSelectedStmtLineForFee(line);
                                      setFeeRM((Math.abs(line.amount)/100).toFixed(2));
                                      setShowFeeModal(true);
                                    }}
                                    className="py-0.5 px-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[9px] font-bold rounded"
                                    title="Post as Bank Expense/Fee"
                                  >
                                    + Fee
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT COLUMN: GENERAL LEDGER BOOK TRANSACTIONS */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-slate-600" />
                  GL Book Transactions ({activeSessionSummary.eligibleGLLines.length})
                </h3>
                {selectedStmtLineId && selectedGlLineId && (
                  <button
                    onClick={handleMatchSelected}
                    className="py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded"
                  >
                    Confirm Pair Match
                  </button>
                )}
              </div>

              <div className="overflow-x-auto max-h-[450px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 sticky top-0">
                    <tr className="border-b border-slate-200">
                      <th className="p-2">Date</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 text-right">Net Flow</th>
                      <th className="p-2 text-center">State</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeSessionSummary.eligibleGLLines.map((gl: any) => {
                      const isSelected = selectedGlLineId === gl.lineId;
                      return (
                        <tr key={gl.lineId} className={`hover:bg-slate-50 ${isSelected ? 'bg-blue-50/70' : ''}`}>
                          <td className="p-2 font-mono whitespace-nowrap">{gl.entryDate}</td>
                          <td className="p-2 font-medium max-w-[150px] truncate" title={gl.description}>{gl.description}</td>
                          <td className={`p-2 text-right font-mono font-bold whitespace-nowrap ${gl.netCents > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {formatCents(gl.netCents)}
                          </td>
                          <td className="p-2 text-center">
                            {gl.isFullyMatched ? (
                              <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[9px]">Matched</span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-bold text-[9px]">Uncleared</span>
                            )}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {!gl.isFullyMatched && activeSessionSummary.session.status === 'In_Progress' && (
                              <button
                                onClick={() => setSelectedGlLineId(isSelected ? null : gl.lineId)}
                                className={`py-0.5 px-2 text-[10px] font-bold rounded ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                              >
                                {isSelected ? 'Selected' : 'Select'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* ACTIVE MATCHES TABLE */}
          {activeSessionSummary.matches.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Session Match Allocations ({activeSessionSummary.matches.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr className="border-b border-slate-200">
                      <th className="p-2">Match ID</th>
                      <th className="p-2">Type</th>
                      <th className="p-2 text-right">Allocated Amount</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeSessionSummary.matches.map((m: any) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="p-2 font-mono text-slate-600">{m.id.substring(0, 8)}...</td>
                        <td className="p-2 font-semibold text-slate-800">{m.matchType}</td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">{formatCents(m.allocatedAmount)}</td>
                        <td className="p-2 text-right">
                          {activeSessionSummary.session.status === 'In_Progress' && userRole !== 'Viewer' && (
                            <button
                              onClick={() => handleDeleteMatch(m.id)}
                              className="text-xs text-red-600 hover:underline font-medium"
                            >
                              Unmatch
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500">
          <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">No active bank reconciliation session for this account.</p>
          <p className="text-xs mt-1">Select or create a reconciliation session to launch the workbench.</p>
        </div>
      )}

      {/* CREATE SESSION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-3">
              Start Bank Reconciliation Session
            </h3>

            <form onSubmit={handleCreateSession} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">End Cutoff Date *</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Stmt Opening Balance (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingRM}
                    onChange={(e) => setOpeningRM(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Stmt Ending Balance (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={endingRM}
                    onChange={(e) => setEndingRM(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-1.5 px-4 bg-slate-900 text-white rounded font-semibold"
                >
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg max-w-lg w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-3">
              Import Bank Statement CSV
            </h3>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                Upload a CSV file containing bank statement lines. Standard columns: Date, Description, Reference, Amount (or Deposit/Withdrawal).
              </p>

              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="w-full border border-slate-200 rounded p-2 text-xs"
              />

              {parsedRows.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                  <p className="font-bold text-slate-900">Parsed Preview ({parsedRows.length} rows)</p>
                  <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[11px]">
                    {parsedRows.slice(0, 5).map((r, idx) => (
                      <div key={idx} className="flex justify-between text-slate-700">
                        <span>{r.transactionDate} — {r.description}</span>
                        <span className="font-bold">{formatCents(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 rounded font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={parsedRows.length === 0}
                onClick={handleImportCSV}
                className="py-1.5 px-4 bg-slate-900 disabled:opacity-40 text-white rounded font-semibold text-xs"
              >
                Execute Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK POST BANK FEE MODAL */}
      {showFeeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-3">
              Post Unrecorded Bank Expense / Fee
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Expense Date *</label>
                <input
                  type="date"
                  value={feeDate}
                  onChange={(e) => setFeeDate(e.target.value)}
                  className="w-full border border-slate-200 rounded p-2 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description *</label>
                <input
                  type="text"
                  value={feeDesc}
                  onChange={(e) => setFeeDesc(e.target.value)}
                  className="w-full border border-slate-200 rounded p-2"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Amount (RM) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={feeRM}
                  onChange={(e) => setFeeRM(e.target.value)}
                  className="w-full border border-slate-200 rounded p-2 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowFeeModal(false)}
                className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 rounded font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePostBankFee}
                className="py-1.5 px-4 bg-emerald-600 text-white rounded font-semibold text-xs"
              >
                Post Expense & Auto-Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN SESSION MODAL */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-3">
              Admin Reopen Reconciliation Session
            </h3>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                Reopening a completed reconciliation session requires a mandatory reason and generates an audit log entry.
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Reopen Reason *</label>
                <textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g. Discovered bank statement date cutoff adjustment required"
                  className="w-full border border-slate-200 rounded p-2 h-20 text-xs"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 rounded font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reopenReason.trim()}
                onClick={handleReopenSession}
                className="py-1.5 px-4 bg-amber-600 text-white rounded font-semibold text-xs disabled:opacity-40"
              >
                Confirm Reopen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
