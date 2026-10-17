import { companyProfile, accounts, accountingPeriods } from './schema.ts';

// Refactored to be transaction-bound. Every query runs on the transaction context 'tx'
export async function seedDatabase(tx: any) {
  try {
    console.log("Starting database seeding inside transaction...");

    // 1. Seed Company Profile if empty
    const existingProfiles = await tx.select().from(companyProfile);
    if (existingProfiles.length === 0) {
      await tx.insert(companyProfile).values({
        name: "Khairul Fresh Food",
        registrationNumber: "202603123456 (MS0012345-X)",
        address: "No. 12, Jalan Fresh, Kawasan Perindustrian Batu Caves, 68100 Batu Caves, Selangor, Malaysia",
        phone: "+603-6188 9988",
        email: "finance@khairulfresh.com.my",
        taxNumber: "SST-W10-2406-32000123",
        financialYearStart: "01-01",
        currency: "MYR",
      });
      console.log("Seeded company profile for Khairul Fresh Food.");
    } else {
      console.log("Company profile already exists.");
    }

    // 2. Seed default Accounting Periods if empty
    const existingPeriods = await tx.select().from(accountingPeriods);
    if (existingPeriods.length === 0) {
      await tx.insert(accountingPeriods).values([
        {
          name: "FY 2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          status: "Open",
        },
        {
          name: "FY 2027",
          startDate: "2027-01-01",
          endDate: "2027-12-31",
          status: "Open",
        }
      ]);
      console.log("Seeded standard accounting periods (FY 2026 & FY 2027).");
    } else {
      console.log("Accounting periods already exist.");
    }

    // 3. Seed Malaysia Chart of Accounts if empty
    const existingAccounts = await tx.select().from(accounts);
    if (existingAccounts.length === 0) {
      const defaultCOA = [
        // --- ASSETS (1000 - 1999) ---
        { code: "1000", name: "Cash on Hand", type: "Asset", subType: "CashBox", normalBalance: "Debit" },
        { code: "1010", name: "Maybank Operating Account", type: "Asset", subType: "Checking", normalBalance: "Debit" },
        { code: "1100", name: "Accounts Receivable (Trade)", type: "Asset", subType: "AccountsReceivable", normalBalance: "Debit" },
        { code: "1200", name: "Other Current Assets", type: "Asset", subType: "GeneralAsset", normalBalance: "Debit" },
        { code: "1500", name: "Equipment & Machinery", type: "Asset", subType: "FixedAsset", normalBalance: "Debit" },
        { code: "1510", name: "Motor Vehicles", type: "Asset", subType: "FixedAsset", normalBalance: "Debit" },

        // --- LIABILITIES (2000 - 2999) ---
        { code: "2000", name: "Accounts Payable (Trade)", type: "Liability", subType: "AccountsPayable", normalBalance: "Credit" },
        { code: "2100", name: "Accrued Liabilities", type: "Liability", subType: "AccruedLiability", normalBalance: "Credit" },
        { code: "2200", name: "SST Payable", type: "Liability", subType: "TaxPayable", normalBalance: "Credit" },
        { code: "2500", name: "CIMB Term Loan", type: "Liability", subType: "LongTermDebt", normalBalance: "Credit" },

        // --- EQUITY (3000 - 3999) ---
        { code: "3000", name: "Owner's Capital", type: "Equity", subType: "Capital", normalBalance: "Credit" },
        { code: "3100", name: "Owner's Drawings", type: "Equity", subType: "Drawings", normalBalance: "Debit" },
        { code: "3200", name: "Retained Earnings", type: "Equity", subType: "RetainedEarnings", normalBalance: "Credit" },

        // --- REVENUE (4000 - 4999) ---
        { code: "4000", name: "Sales Revenue", type: "Revenue", subType: "SalesRevenue", normalBalance: "Credit" },
        { code: "4100", name: "Other Revenue / Interest Income", type: "Revenue", subType: "OtherIncome", normalBalance: "Credit" },

        // --- EXPENSES (5000 - 5999) ---
        { code: "5000", name: "Cost of Goods Sold (COGS)", type: "Expense", subType: "CostOfGoodsSold", normalBalance: "Debit" },
        { code: "5100", name: "Rent & Premises Expenses", type: "Expense", subType: "RentExpense", normalBalance: "Debit" },
        { code: "5110", name: "Water & Electricity Utilities", type: "Expense", subType: "UtilitiesExpense", normalBalance: "Debit" },
        { code: "5120", name: "Telephone, Mobile & Internet", type: "Expense", subType: "UtilitiesExpense", normalBalance: "Debit" },
        { code: "5200", name: "Staff Salaries & Wages", type: "Expense", subType: "WagesExpense", normalBalance: "Debit" },
        { code: "5210", name: "EPF & SOCSO Contributions", type: "Expense", subType: "WagesExpense", normalBalance: "Debit" },
        { code: "5300", name: "Motor Vehicle & Fuel Expenses", type: "Expense", subType: "GeneralExpense", normalBalance: "Debit" },
        { code: "5400", name: "Bank Service Charges", type: "Expense", subType: "GeneralExpense", normalBalance: "Debit" },
        { code: "5500", name: "Secretarial & Professional Fees", type: "Expense", subType: "ProfessionalExpense", normalBalance: "Debit" },
        { code: "5600", name: "Repairs & Maintenance", type: "Expense", subType: "GeneralExpense", normalBalance: "Debit" },
        { code: "5700", name: "Stationery & Office Expenses", type: "Expense", subType: "GeneralExpense", normalBalance: "Debit" },
        { code: "5800", name: "Advertising, Branding & Marketing", type: "Expense", subType: "MarketingExpense", normalBalance: "Debit" },
        { code: "5999", name: "Miscellaneous Other Expenses", type: "Expense", subType: "GeneralExpense", normalBalance: "Debit" },
      ];

      await tx.insert(accounts).values(defaultCOA);
      console.log(`Seeded ${defaultCOA.length} default Malaysian Chart of Accounts.`);
    } else {
      console.log("Chart of accounts already seeded.");
    }

    console.log("Database seeding completed successfully inside active transaction!");
  } catch (error) {
    console.error("Failed to seed database, rolling back transaction:", error);
    throw error; // Re-throw to cause active transaction to rollback
  }
}
