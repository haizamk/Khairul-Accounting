import { db } from '../db/index.ts';
import { accounts, accountingPeriods, journalEntries, journalLines } from '../db/schema.ts';
import { eq, and, lte, gte, sql, asc, inArray } from 'drizzle-orm';

export interface ReportFilterParams {
  periodId?: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
}

// Helper: Resolve date range from periodId or startDate/endDate
export async function resolveDateRange(params: ReportFilterParams) {
  let startDate = params.startDate;
  let endDate = params.endDate || params.asOfDate;
  let periodName = 'Custom Range';

  if (params.periodId) {
    const periodList = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, params.periodId));
    if (periodList.length > 0) {
      const p = periodList[0];
      startDate = p.startDate;
      endDate = p.endDate;
      periodName = p.name;
    }
  }

  return {
    startDate: startDate || '1970-01-01',
    endDate: endDate || new Date().toISOString().split('T')[0],
    periodName,
  };
}

// -----------------------------------------------------------------------------
// 1. PROFIT & LOSS STATEMENT (PENYATA UNTUNG RUGI)
// -----------------------------------------------------------------------------

export interface PnLAccountRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  subType: string;
  amountCents: number; // Positive = Revenue or Expense amount
}

export interface PnLGroup {
  subType: string;
  label: string;
  totalCents: number;
  rows: PnLAccountRow[];
}

export interface ProfitLossReport {
  startDate: string;
  endDate: string;
  periodName: string;
  revenueGroups: PnLGroup[];
  totalRevenueCents: number;
  cogsGroups: PnLGroup[];
  totalCogsCents: number;
  grossProfitCents: number;
  expenseGroups: PnLGroup[];
  totalOperatingExpenseCents: number;
  netIncomeCents: number; // Positive = Profit, Negative = Loss
  isProfit: boolean;
}

export async function generateProfitAndLoss(params: ReportFilterParams): Promise<ProfitLossReport> {
  const { startDate, endDate, periodName } = await resolveDateRange(params);

  // Fetch all Revenue and Expense accounts
  const allAccounts = await db.select().from(accounts).orderBy(asc(accounts.code));
  const pnlAccounts = allAccounts.filter(a => a.type === 'Revenue' || a.type === 'Expense');
  const pnlAccountIds = pnlAccounts.map(a => a.id);

  if (pnlAccountIds.length === 0) {
    return {
      startDate,
      endDate,
      periodName,
      revenueGroups: [],
      totalRevenueCents: 0,
      cogsGroups: [],
      totalCogsCents: 0,
      grossProfitCents: 0,
      expenseGroups: [],
      totalOperatingExpenseCents: 0,
      netIncomeCents: 0,
      isProfit: true,
    };
  }

  // Aggregate posted journal lines within date range
  const aggregates = await db.select({
    accountId: journalLines.accountId,
    totalDebit: sql<number>`COALESCE(sum(${journalLines.debit}), 0)::int`,
    totalCredit: sql<number>`COALESCE(sum(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(
    inArray(journalLines.accountId, pnlAccountIds),
    eq(journalEntries.status, 'Posted'),
    gte(journalEntries.entryDate, startDate),
    lte(journalEntries.entryDate, endDate)
  ))
  .groupBy(journalLines.accountId);

  const aggMap = new Map(aggregates.map(a => [a.accountId, a]));

  const revenueRows: PnLAccountRow[] = [];
  const cogsRows: PnLAccountRow[] = [];
  const operatingExpenseRows: PnLAccountRow[] = [];

  for (const acc of pnlAccounts) {
    const agg = aggMap.get(acc.id) || { totalDebit: 0, totalCredit: 0 };
    if (agg.totalDebit === 0 && agg.totalCredit === 0) continue;

    if (acc.type === 'Revenue') {
      // Net Revenue = Credit - Debit
      const netCents = agg.totalCredit - agg.totalDebit;
      revenueRows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subType: acc.subType,
        amountCents: netCents,
      });
    } else if (acc.type === 'Expense') {
      // Net Expense = Debit - Credit
      const netCents = agg.totalDebit - agg.totalCredit;
      if (acc.subType === 'CostOfGoodsSold') {
        cogsRows.push({
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          subType: acc.subType,
          amountCents: netCents,
        });
      } else {
        operatingExpenseRows.push({
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          subType: acc.subType,
          amountCents: netCents,
        });
      }
    }
  }

  // Group helper
  const groupBySubType = (rows: PnLAccountRow[], labelMap: Record<string, string>): PnLGroup[] => {
    const groups = new Map<string, PnLAccountRow[]>();
    for (const row of rows) {
      const existing = groups.get(row.subType) || [];
      existing.push(row);
      groups.set(row.subType, existing);
    }

    const result: PnLGroup[] = [];
    for (const [subType, groupRows] of groups.entries()) {
      const totalCents = groupRows.reduce((sum, r) => sum + r.amountCents, 0);
      result.push({
        subType,
        label: labelMap[subType] || subType,
        totalCents,
        rows: groupRows,
      });
    }
    return result;
  };

  const revenueSubLabels: Record<string, string> = {
    SalesRevenue: 'Hasil Jualan / Sales Revenue',
    ServiceRevenue: 'Hasil Perkhidmatan / Service Revenue',
    OtherIncome: 'Pendapatan Lain / Other Income',
  };

  const cogsSubLabels: Record<string, string> = {
    CostOfGoodsSold: 'Kos Jualan / Cost of Goods Sold',
  };

  const expenseSubLabels: Record<string, string> = {
    GeneralExpense: 'Belanja Am / General Expenses',
    PayrollExpense: 'Belanja Gaji / Payroll Expenses',
    RentExpense: 'Belanja Sewa / Rent Expenses',
    UtilitiesExpense: 'Belanja Utiliti / Utilities',
    DepreciationExpense: 'Susut Nilai / Depreciation',
    FinanceExpense: 'Caj Kewangan & Faedah / Finance & Interest',
  };

  const revenueGroups = groupBySubType(revenueRows, revenueSubLabels);
  const totalRevenueCents = revenueRows.reduce((sum, r) => sum + r.amountCents, 0);

  const cogsGroups = groupBySubType(cogsRows, cogsSubLabels);
  const totalCogsCents = cogsRows.reduce((sum, r) => sum + r.amountCents, 0);

  const grossProfitCents = totalRevenueCents - totalCogsCents;

  const expenseGroups = groupBySubType(operatingExpenseRows, expenseSubLabels);
  const totalOperatingExpenseCents = operatingExpenseRows.reduce((sum, r) => sum + r.amountCents, 0);

  const netIncomeCents = grossProfitCents - totalOperatingExpenseCents;

  return {
    startDate,
    endDate,
    periodName,
    revenueGroups,
    totalRevenueCents,
    cogsGroups,
    totalCogsCents,
    grossProfitCents,
    expenseGroups,
    totalOperatingExpenseCents,
    netIncomeCents,
    isProfit: netIncomeCents >= 0,
  };
}

// -----------------------------------------------------------------------------
// 2. BALANCE SHEET (PENYATA KEDUDUKAN KEWANGAN)
// -----------------------------------------------------------------------------

export interface BalanceSheetAccountRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  subType: string;
  balanceCents: number;
}

export interface BalanceSheetGroup {
  subType: string;
  label: string;
  totalCents: number;
  rows: BalanceSheetAccountRow[];
}

export interface BalanceSheetReport {
  asOfDate: string;
  periodName: string;
  assetGroups: BalanceSheetGroup[];
  totalAssetsCents: number;
  liabilityGroups: BalanceSheetGroup[];
  totalLiabilitiesCents: number;
  equityGroups: BalanceSheetGroup[];
  totalEquityAccountsCents: number;
  currentNetIncomeCents: number;
  totalEquityAndNetIncomeCents: number;
  totalLiabilitiesAndEquityCents: number;
  isBalanced: boolean;
  differenceCents: number;
  errorWarning?: string;
}

export async function generateBalanceSheet(params: ReportFilterParams): Promise<BalanceSheetReport> {
  const { endDate: asOfDate, periodName } = await resolveDateRange(params);

  const allAccounts = await db.select().from(accounts).orderBy(asc(accounts.code));

  // Fetch cumulative aggregates up to asOfDate for ALL accounts
  const aggregates = await db.select({
    accountId: journalLines.accountId,
    totalDebit: sql<number>`COALESCE(sum(${journalLines.debit}), 0)::int`,
    totalCredit: sql<number>`COALESCE(sum(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(
    eq(journalEntries.status, 'Posted'),
    lte(journalEntries.entryDate, asOfDate)
  ))
  .groupBy(journalLines.accountId);

  const aggMap = new Map(aggregates.map(a => [a.accountId, a]));

  const assetRows: BalanceSheetAccountRow[] = [];
  const liabilityRows: BalanceSheetAccountRow[] = [];
  const equityRows: BalanceSheetAccountRow[] = [];

  let totalRevenueCum = 0;
  let totalExpenseCum = 0;

  for (const acc of allAccounts) {
    const agg = aggMap.get(acc.id) || { totalDebit: 0, totalCredit: 0 };
    if (agg.totalDebit === 0 && agg.totalCredit === 0) continue;

    if (acc.type === 'Asset') {
      // Asset Net Balance = Debit - Credit
      const bal = agg.totalDebit - agg.totalCredit;
      assetRows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subType: acc.subType,
        balanceCents: bal,
      });
    } else if (acc.type === 'Liability') {
      // Liability Net Balance = Credit - Debit
      const bal = agg.totalCredit - agg.totalDebit;
      liabilityRows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subType: acc.subType,
        balanceCents: bal,
      });
    } else if (acc.type === 'Equity') {
      // Equity Net Balance = Credit - Debit
      const bal = agg.totalCredit - agg.totalDebit;
      equityRows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subType: acc.subType,
        balanceCents: bal,
      });
    } else if (acc.type === 'Revenue') {
      totalRevenueCum += (agg.totalCredit - agg.totalDebit);
    } else if (acc.type === 'Expense') {
      totalExpenseCum += (agg.totalDebit - agg.totalCredit);
    }
  }

  // Group helpers
  const groupBS = (rows: BalanceSheetAccountRow[], labelMap: Record<string, string>): BalanceSheetGroup[] => {
    const groups = new Map<string, BalanceSheetAccountRow[]>();
    for (const row of rows) {
      const existing = groups.get(row.subType) || [];
      existing.push(row);
      groups.set(row.subType, existing);
    }

    const result: BalanceSheetGroup[] = [];
    for (const [subType, groupRows] of groups.entries()) {
      const totalCents = groupRows.reduce((sum, r) => sum + r.balanceCents, 0);
      result.push({
        subType,
        label: labelMap[subType] || subType,
        totalCents,
        rows: groupRows,
      });
    }
    return result;
  };

  const assetSubLabels: Record<string, string> = {
    CashBox: 'Tunai di Tangan / Cash Box',
    Checking: 'Akaun Bank Semasa / Checking Account',
    Savings: 'Akaun Simpanan / Savings Account',
    AccountsReceivable: 'Penghutang / Accounts Receivable',
    Inventory: 'Inventori / Stock Inventory',
    FixedAsset: 'Aset Tetap / Fixed Assets',
    AccumulatedDepreciation: 'Susut Nilai Terkumpul / Accumulated Depreciation',
    OtherCurrentAsset: 'Aset Semasa Lain / Other Current Assets',
  };

  const liabilitySubLabels: Record<string, string> = {
    AccountsPayable: 'Pemiutang / Accounts Payable',
    ShortTermLiability: 'Liabiliti Jangka Pendek / Short-Term Liabilities',
    TaxPayable: 'Cukai Kena Bayar / Tax Payable',
    AccruedExpenses: 'Belanja Terakru / Accrued Expenses',
    LongTermLiability: 'Liabiliti Jangka Panjang / Long-Term Liabilities',
    BankLoan: 'Pinjaman Bank / Bank Loans',
  };

  const equitySubLabels: Record<string, string> = {
    EquityCapital: 'Modal Pemilik / Owner\'s Capital',
    OwnersDraw: 'Pengeluaran Pemilik / Owner\'s Draw',
    RetainedEarnings: 'Perolehan Tertahan / Retained Earnings',
  };

  const assetGroups = groupBS(assetRows, assetSubLabels);
  const totalAssetsCents = assetRows.reduce((sum, r) => sum + r.balanceCents, 0);

  const liabilityGroups = groupBS(liabilityRows, liabilitySubLabels);
  const totalLiabilitiesCents = liabilityRows.reduce((sum, r) => sum + r.balanceCents, 0);

  const equityGroups = groupBS(equityRows, equitySubLabels);
  const totalEquityAccountsCents = equityRows.reduce((sum, r) => sum + r.balanceCents, 0);

  // Current Cumulative Net Income from inception up to asOfDate
  const currentNetIncomeCents = totalRevenueCum - totalExpenseCum;
  const totalEquityAndNetIncomeCents = totalEquityAccountsCents + currentNetIncomeCents;

  const totalLiabilitiesAndEquityCents = totalLiabilitiesCents + totalEquityAndNetIncomeCents;

  const differenceCents = totalAssetsCents - totalLiabilitiesAndEquityCents;
  const isBalanced = (differenceCents === 0);

  let errorWarning: string | undefined = undefined;
  if (!isBalanced) {
    errorWarning = `Accounting Parity Warning: Total Assets (RM ${(totalAssetsCents/100).toFixed(2)}) does not equal Total Liabilities & Equity (RM ${(totalLiabilitiesAndEquityCents/100).toFixed(2)}). Discrepancy is RM ${(Math.abs(differenceCents)/100).toFixed(2)}. Unbalanced journal entries may exist in the database.`;
  }

  return {
    asOfDate,
    periodName,
    assetGroups,
    totalAssetsCents,
    liabilityGroups,
    totalLiabilitiesCents,
    equityGroups,
    totalEquityAccountsCents,
    currentNetIncomeCents,
    totalEquityAndNetIncomeCents,
    totalLiabilitiesAndEquityCents,
    isBalanced,
    differenceCents,
    errorWarning,
  };
}

// -----------------------------------------------------------------------------
// 3. CASH FLOW STATEMENT (PENYATA ALIRAN TUNAI - INDIRECT METHOD)
// -----------------------------------------------------------------------------

export interface CashFlowLine {
  description: string;
  amountCents: number; // Positive = Inflow, Negative = Outflow
  notes?: string;
}

export interface CashFlowSection {
  title: string;
  lines: CashFlowLine[];
  netSectionCents: number;
}

export interface CashFlowReport {
  startDate: string;
  endDate: string;
  periodName: string;
  beginningCashCents: number;
  endingCashCents: number;
  netCashChangeCents: number;
  operatingSection: CashFlowSection;
  investingSection: CashFlowSection;
  financingSection: CashFlowSection;
  totalCalculatedNetCashFlowCents: number;
  reconciliationDifferenceCents: number;
  isReconciled: boolean;
  unclassifiedGapNotes?: string;
}

export async function generateCashFlowStatement(params: ReportFilterParams): Promise<CashFlowReport> {
  const { startDate, endDate, periodName } = await resolveDateRange(params);

  const allAccounts = await db.select().from(accounts).orderBy(asc(accounts.code));

  // Target Cash/Bank Accounts
  const cashAccounts = allAccounts.filter(a => a.type === 'Asset' && ['CashBox', 'Checking', 'Savings'].includes(a.subType));
  const cashAccountIds = cashAccounts.map(a => a.id);

  // A. Calculate Beginning Cash Balance (< startDate)
  let beginningCashCents = 0;
  if (cashAccountIds.length > 0) {
    const begAgg = await db.select({
      totalDebit: sql<number>`COALESCE(sum(${journalLines.debit}), 0)::int`,
      totalCredit: sql<number>`COALESCE(sum(${journalLines.credit}), 0)::int`
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(
      inArray(journalLines.accountId, cashAccountIds),
      eq(journalEntries.status, 'Posted'),
      sql`${journalEntries.entryDate} < ${startDate}`
    ));

    beginningCashCents = (begAgg[0]?.totalDebit || 0) - (begAgg[0]?.totalCredit || 0);
  }

  // B. Calculate Ending Cash Balance (<= endDate)
  let endingCashCents = 0;
  if (cashAccountIds.length > 0) {
    const endAgg = await db.select({
      totalDebit: sql<number>`COALESCE(sum(${journalLines.debit}), 0)::int`,
      totalCredit: sql<number>`COALESCE(sum(${journalLines.credit}), 0)::int`
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(
      inArray(journalLines.accountId, cashAccountIds),
      eq(journalEntries.status, 'Posted'),
      lte(journalEntries.entryDate, endDate)
    ));

    endingCashCents = (endAgg[0]?.totalDebit || 0) - (endAgg[0]?.totalCredit || 0);
  }

  const netCashChangeCents = endingCashCents - beginningCashCents;

  // C. Compute P&L Net Income for the period (startDate to endDate)
  const pnl = await generateProfitAndLoss({ startDate, endDate });
  const periodNetIncomeCents = pnl.netIncomeCents;

  // D. Calculate changes in non-cash accounts during period (startDate <= entryDate <= endDate)
  const nonCashAccounts = allAccounts.filter(a => !cashAccountIds.includes(a.id));
  const nonCashAccountIds = nonCashAccounts.map(a => a.id);

  const periodAggregates = await db.select({
    accountId: journalLines.accountId,
    periodDebit: sql<number>`COALESCE(sum(${journalLines.debit}), 0)::int`,
    periodCredit: sql<number>`COALESCE(sum(${journalLines.credit}), 0)::int`
  })
  .from(journalLines)
  .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
  .where(and(
    inArray(journalLines.accountId, nonCashAccountIds),
    eq(journalEntries.status, 'Posted'),
    gte(journalEntries.entryDate, startDate),
    lte(journalEntries.entryDate, endDate)
  ))
  .groupBy(journalLines.accountId);

  const periodAggMap = new Map(periodAggregates.map(a => [a.accountId, a]));

  const operatingLines: CashFlowLine[] = [
    {
      description: 'Untung / (Rugi) Bersih Tempoh (Net Income)',
      amountCents: periodNetIncomeCents,
      notes: 'Dipetik daripada Penyata Untung Rugi',
    }
  ];

  const investingLines: CashFlowLine[] = [];
  const financingLines: CashFlowLine[] = [];

  for (const acc of nonCashAccounts) {
    const agg = periodAggMap.get(acc.id) || { periodDebit: 0, periodCredit: 0 };
    if (agg.periodDebit === 0 && agg.periodCredit === 0) continue;

    // Skip P&L accounts (Revenue & Expense) as their net effect is already captured in Net Income!
    if (acc.type === 'Revenue' || acc.type === 'Expense') {
      // Check if it's Depreciation Expense (non-cash adjustment)
      if (acc.subType === 'DepreciationExpense') {
        const depAmount = agg.periodDebit - agg.periodCredit;
        if (depAmount !== 0) {
          operatingLines.push({
            description: `Pelarasan Bukan Tunai: Susut Nilai (${acc.name})`,
            amountCents: depAmount, // Add back non-cash depreciation
            notes: 'Pelarasan perbelanjaan bukan tunai',
          });
        }
      }
      continue;
    }

    // Balance Sheet Non-Cash Account Changes during period
    if (acc.type === 'Asset') {
      // Net Asset Change = Debit - Credit
      const assetIncrease = agg.periodDebit - agg.periodCredit;
      if (assetIncrease === 0) continue;

      if (acc.subType === 'AccountsReceivable') {
        // Increase in AR is Cash OUTFLOW (-), Decrease is Cash INFLOW (+)
        operatingLines.push({
          description: `Perubahan Penghutang (AR): ${acc.name}`,
          amountCents: -assetIncrease,
          notes: assetIncrease > 0 ? 'Peningkatan AR (Cash Outflow)' : 'Penurunan AR (Cash Inflow)',
        });
      } else if (acc.subType === 'Inventory' || acc.subType === 'OtherCurrentAsset') {
        operatingLines.push({
          description: `Perubahan Aset Semasa: ${acc.name}`,
          amountCents: -assetIncrease,
        });
      } else if (acc.subType === 'FixedAsset') {
        investingLines.push({
          description: `Perolehan / Pelupusan Aset Tetap: ${acc.name}`,
          amountCents: -assetIncrease, // Purchase = Cash Outflow (-)
          notes: assetIncrease > 0 ? 'Pembelian Aset Tetap' : 'Penjualan Aset Tetap',
        });
      } else if (acc.subType === 'AccumulatedDepreciation') {
        // Accum Dep is a contra asset, Credit - Debit = Increase in Depreciation
        const accumDepIncrease = agg.periodCredit - agg.periodDebit;
        operatingLines.push({
          description: `Susut Nilai Terkumpul: ${acc.name}`,
          amountCents: accumDepIncrease, // Non-cash addback (+)
        });
      }
    } else if (acc.type === 'Liability') {
      // Net Liability Change = Credit - Debit
      const liabilityIncrease = agg.periodCredit - agg.periodDebit;
      if (liabilityIncrease === 0) continue;

      if (acc.subType === 'AccountsPayable' || acc.subType === 'AccruedExpenses' || acc.subType === 'TaxPayable' || acc.subType === 'ShortTermLiability') {
        // Increase in AP is Cash INFLOW (+), Decrease is Cash OUTFLOW (-)
        operatingLines.push({
          description: `Perubahan Pemiutang / Liabiliti Semasa: ${acc.name}`,
          amountCents: liabilityIncrease,
          notes: liabilityIncrease > 0 ? 'Peningkatan Pemiutang (Cash Inflow)' : 'Pembayaran Pemiutang (Cash Outflow)',
        });
      } else if (acc.subType === 'LongTermLiability' || acc.subType === 'BankLoan') {
        financingLines.push({
          description: `Pinjaman / Liabiliti Jangka Panjang: ${acc.name}`,
          amountCents: liabilityIncrease, // Loan drawdown (+), Repayment (-)
          notes: liabilityIncrease > 0 ? 'Pengeluaran Pinjaman' : 'Pembayaran Balik Pinjaman',
        });
      }
    } else if (acc.type === 'Equity') {
      // Net Equity Change = Credit - Debit
      const equityIncrease = agg.periodCredit - agg.periodDebit;
      if (equityIncrease === 0) continue;

      if (acc.subType === 'EquityCapital') {
        financingLines.push({
          description: `Suntikan / Perubahan Modal: ${acc.name}`,
          amountCents: equityIncrease, // Capital injection (+)
        });
      } else if (acc.subType === 'OwnersDraw') {
        financingLines.push({
          description: `Pengeluaran Pemilik: ${acc.name}`,
          amountCents: equityIncrease, // Owner draw (-)
        });
      }
    }
  }

  const netOperatingCents = operatingLines.reduce((sum, l) => sum + l.amountCents, 0);
  const netInvestingCents = investingLines.reduce((sum, l) => sum + l.amountCents, 0);
  const netFinancingCents = financingLines.reduce((sum, l) => sum + l.amountCents, 0);

  const totalCalculatedNetCashFlowCents = netOperatingCents + netInvestingCents + netFinancingCents;

  const reconciliationDifferenceCents = netCashChangeCents - totalCalculatedNetCashFlowCents;
  const isReconciled = (reconciliationDifferenceCents === 0);

  let unclassifiedGapNotes: string | undefined = undefined;
  if (!isReconciled) {
    unclassifiedGapNotes = `Cash Flow GAP Warning: Net Cash Flow calculated from indirect activity items (RM ${(totalCalculatedNetCashFlowCents/100).toFixed(2)}) differs from actual GL Bank Balance Change (RM ${(netCashChangeCents/100).toFixed(2)}). Unclassified Gap is RM ${(Math.abs(reconciliationDifferenceCents)/100).toFixed(2)}. This indicates manual journal entries involving bank accounts without standard offsetting classifications exist.`;
  }

  return {
    startDate,
    endDate,
    periodName,
    beginningCashCents,
    endingCashCents,
    netCashChangeCents,
    operatingSection: {
      title: 'Aktiviti Operasi (Operating Activities)',
      lines: operatingLines,
      netSectionCents: netOperatingCents,
    },
    investingSection: {
      title: 'Aktiviti Pelaburan (Investing Activities)',
      lines: investingLines,
      netSectionCents: netInvestingCents,
    },
    financingSection: {
      title: 'Aktiviti Pembiayaan (Financing Activities)',
      lines: financingLines,
      netSectionCents: netFinancingCents,
    },
    totalCalculatedNetCashFlowCents,
    reconciliationDifferenceCents,
    isReconciled,
    unclassifiedGapNotes,
  };
}
