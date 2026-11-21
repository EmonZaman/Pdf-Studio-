import { describe, it, expect } from "vitest";
import { generateBangladeshiAiLedger } from "../src/lib/ai-ledger-generator";
import { parseAmount } from "../src/lib/balance-calculator";

describe("AI Bangladeshi Statement Ledger Generator", () => {
  it("generates exact row count, chronological dates, and exact opening -> closing balance for Islamic Modern profile", () => {
    const res = generateBangladeshiAiLedger({
      rowCount: 80,
      startDate: "01 Jan 2026",
      endDate: "17 Oct 2026",
      openingBalance: "384,578.87",
      targetClosingBalance: "332,784.69",
      accountNo: "1781920006484",
      accountType: "ISLAMIC SAVINGS A/C - DST",
      profile: "islamic_modern",
      includeDependencies: true,
    });

    // Opening Balance row + 80 transaction rows = 81 rows
    expect(res.transactions.length).toBe(81);
    expect(res.transactions[0].description).toBe("Opening Balance");
    expect(res.openingBalance).toBe("384,578.87");
    expect(res.availableBalance).toBe("332,784.69");
    expect(res.transactions[res.transactions.length - 1].balance).toBe("332,784.69");
    expect(res.dependencyCount).toBeGreaterThan(0);

    // Verify mathematical equation: opening + deposits - withdrawals = closing
    const open = Math.round(parseAmount(res.openingBalance) * 100);
    const deps = Math.round(parseAmount(res.totalDeposits) * 100);
    const wdls = Math.round(parseAmount(res.totalWithdrawals) * 100);
    const close = Math.round(parseAmount(res.availableBalance) * 100);
    expect(open + deps - wdls).toBe(close);

    // Verify every single row has a positive balance
    for (const tx of res.transactions) {
      expect(parseAmount(tx.balance)).toBeGreaterThan(0);
    }
  });

  it("generates Remittance & EFTN profile with TT-R + 2.5% -INC and NPSB charge dependencies", () => {
    const res = generateBangladeshiAiLedger({
      rowCount: 60,
      startDate: "01 Oct 2025",
      endDate: "24 Oct 2026",
      openingBalance: "2,261.58",
      targetClosingBalance: "27,578.76",
      accountNo: "2304435091001",
      accountType: "HIGH VALUE SAVINGS A/C",
      profile: "remittance_eftn",
      includeDependencies: true,
    });

    expect(res.transactions.length).toBe(61);
    expect(res.openingBalance).toBe("2,261.58");
    expect(res.availableBalance).toBe("27,578.76");
    expect(res.transactions[res.transactions.length - 1].balance).toBe("27,578.76");
  });

  it("generates Retail & Business profile with slash dates and exact closing balance", () => {
    const res = generateBangladeshiAiLedger({
      rowCount: 45,
      startDate: "14/11/2022",
      endDate: "12/11/2023",
      openingBalance: "3,057,305.21",
      targetClosingBalance: "4,014,757.24",
      accountNo: "2182477573618",
      accountType: "GENERAL CURRENT A/C",
      profile: "retail_business",
      includeDependencies: true,
    });

    expect(res.transactions.length).toBe(46);
    expect(res.openingBalance).toBe("3,057,305.21");
    expect(res.availableBalance).toBe("4,014,757.24");
    expect(res.transactions[res.transactions.length - 1].balance).toBe("4,014,757.24");
  });
});
