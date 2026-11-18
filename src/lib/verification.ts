import fs from "fs/promises";
import path from "path";
import { listHistory, StatementHistoryEntry } from "@/lib/history-storage";

// What a verifier may see. Transactions and other customer details are never returned.
export interface VerifiedStatement {
  accountNo: string;
  accountName: string;
  period: string;
  openingBalance: string;
  closingBalance: string;
  generatedOn: string;
  createdAt?: string;
}

const normalizeRef = (value: string) => value.trim().toUpperCase();
const normalizeAcc = (value: string) => value.replace(/\s+/g, "");

// Finds the newest statement GT-Pdf_Studio recorded for this reference and account number.
export async function findVerifiedStatement(referenceNo: string, accountNo: string): Promise<VerifiedStatement | null> {
  const ref = normalizeRef(referenceNo);
  const acc = normalizeAcc(accountNo);
  if (!ref || !acc) return null;

  let entries: StatementHistoryEntry[] = [];
  try {
    entries = await listHistory();
  } catch {
    entries = [];
  }

  let match = entries
    .filter(
      (entry) =>
        normalizeRef(String(entry.data?.referenceNo ?? "")) === ref &&
        normalizeAcc(String(entry.data?.accountNo ?? "")) === acc
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  // Fallback to local data/history.json for seeded/local statements
  if (!match) {
    try {
      const localPath = path.join(process.cwd(), "data", "history.json");
      const content = await fs.readFile(localPath, "utf-8");
      const localEntries = JSON.parse(content) as StatementHistoryEntry[];
      match = localEntries
        .filter(
          (entry) =>
            normalizeRef(String(entry.data?.referenceNo ?? "")) === ref &&
            normalizeAcc(String(entry.data?.accountNo ?? "")) === acc
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    } catch {
      // Local file not available or unreadable
    }
  }

  if (!match) return null;
  const d = match.data;
  return {
    accountNo: String(d.accountNo ?? ""),
    accountName: String(d.customerName ?? ""),
    period: [d.openingDate, d.statementEndDate].filter(Boolean).join(" to "),
    openingBalance: String(d.openingBalance ?? ""),
    closingBalance: String(d.availableBalance ?? d.closingBalance ?? ""),
    generatedOn: String(d.generationDate ?? ""),
    createdAt: match.createdAt,
  };
}
