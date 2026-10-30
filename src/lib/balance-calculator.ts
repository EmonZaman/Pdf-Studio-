/**
 * High-precision balance and ledger calculation utility for bank statements.
 * Automatically computes running ledger balances, total withdrawals,
 * total deposits, and available closing balance.
 * Supports date parsing, chronological sorting, and typing-safe recomputation.
 */

export interface CalculationResult {
  totalDeposits: string;
  totalWithdrawals: string;
  availableBalance: string;
  updatedTransactions: any[];
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses statement date formats like "01 Oct 2025", "14-Oct-2025", "2025-10-01"
 * into a millisecond timestamp for chronological sorting.
 */
export function parseStatementDate(dateStr?: string): number {
  if (!dateStr || typeof dateStr !== "string") return 0;
  const clean = dateStr.trim();
  if (!clean || clean === "-") return 0;

  // Format: "DD Mmm YYYY" or "DD-Mmm-YYYY" (e.g. "01 Oct 2025")
  const mmmMatch = clean.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]{3})[\s\-\/]+(\d{4})$/);
  if (mmmMatch) {
    const day = parseInt(mmmMatch[1], 10);
    const mStr = mmmMatch[2].toLowerCase();
    const month = MONTH_MAP[mStr] ?? 0;
    const year = parseInt(mmmMatch[3], 10);
    return new Date(year, month, day).getTime();
  }

  // Format: "YYYY-MM-DD"
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10)).getTime();
  }

  const d = Date.parse(clean);
  return isNaN(d) ? 0 : d;
}

/**
 * Sorts transactions chronologically by date, always preserving the Opening Balance
 * row at index 0.
 */
export function sortTransactionsChronologically(rows: any[]): any[] {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;

  let openingRow: any = null;
  const regularRows: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isOpening =
      i === 0 &&
      (String(row.description || "").toLowerCase().includes("opening balance") ||
        (row.withdrawal === "-" && row.deposit === "-") ||
        (!row.withdrawal && !row.deposit));

    if (isOpening) {
      openingRow = row;
    } else {
      regularRows.push(row);
    }
  }

  regularRows.sort((a, b) => {
    const timeA = parseStatementDate(a.date);
    const timeB = parseStatementDate(b.date);
    return timeA - timeB;
  });

  return openingRow ? [openingRow, ...regularRows] : regularRows;
}

export function parseAmount(val: any): number {
  if (val === undefined || val === null || val === "" || val === "-") return 0;
  const clean = String(val).replace(/,/g, "").trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function formatCurrency(num: number): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Recalculates all running balances and summary totals.
 * When `formatInputs` is false (while user is actively typing), the withdrawal/deposit
 * string inputs are preserved as typed to avoid annoying cursor jumps.
 */
export function recalculateStatementBalances(
  openingBalanceRaw: any,
  transactions: any[],
  formatInputs: boolean = true
): CalculationResult {
  const openBal = parseAmount(openingBalanceRaw);
  let runningBal = openBal;
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      totalDeposits: "0.00",
      totalWithdrawals: "0.00",
      availableBalance: formatCurrency(openBal),
      updatedTransactions: [],
    };
  }

  const updatedTransactions = transactions.map((row, idx) => {
    const isOpeningRow =
      idx === 0 &&
      (String(row.description || "").toLowerCase().includes("opening balance") ||
        (row.withdrawal === "-" && row.deposit === "-") ||
        (!row.withdrawal && !row.deposit));

    if (isOpeningRow) {
      return {
        ...row,
        withdrawal: "-",
        deposit: "",
        balance: formatCurrency(openBal),
      };
    }

    const wdl = parseAmount(row.withdrawal);
    const dep = parseAmount(row.deposit);

    totalWithdrawals += wdl;
    totalDeposits += dep;
    runningBal = runningBal + dep - wdl;

    let finalWithdrawal = row.withdrawal;
    let finalDeposit = row.deposit;

    if (formatInputs) {
      finalWithdrawal = wdl > 0 ? formatCurrency(wdl) : (row.withdrawal === "-" ? "-" : "0.00");
      finalDeposit = dep > 0 ? formatCurrency(dep) : (row.deposit === "-" ? "-" : "0.00");
    }

    return {
      ...row,
      withdrawal: finalWithdrawal,
      deposit: finalDeposit,
      balance: formatCurrency(runningBal),
    };
  });

  return {
    totalDeposits: formatCurrency(totalDeposits),
    totalWithdrawals: formatCurrency(totalWithdrawals),
    availableBalance: formatCurrency(runningBal),
    updatedTransactions,
  };
}
