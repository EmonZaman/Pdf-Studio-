import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DocumentData } from "@/types/template";

// Every exported statement is recorded so it can be reopened, renamed or re-downloaded later.

export interface StatementHistoryEntry {
  id: string;
  label: string;
  templateId: string;
  bankName: string;
  accountName: string;
  accountNo: string;
  period: string;
  createdAt: string;
  updatedAt: string;
  data: DocumentData;
}

const DATA_DIR = path.join(process.cwd(), "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

function readAll(): StatementHistoryEntry[] {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeAll(entries: StatementHistoryEntry[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temp file first so a crash cannot corrupt the history
  const tmp = `${HISTORY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), "utf8");
  fs.renameSync(tmp, HISTORY_FILE);
}

export function listHistory(): StatementHistoryEntry[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addHistory(input: Omit<StatementHistoryEntry, "id" | "createdAt" | "updatedAt">): StatementHistoryEntry {
  const now = new Date().toISOString();
  const entry: StatementHistoryEntry = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  writeAll([...readAll(), entry]);
  return entry;
}

export function renameHistory(id: string, label: string): StatementHistoryEntry | null {
  const entries = readAll();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.label = label;
  entry.updatedAt = new Date().toISOString();
  writeAll(entries);
  return entry;
}

export function deleteHistory(id: string): boolean {
  const entries = readAll();
  const remaining = entries.filter((e) => e.id !== id);
  if (remaining.length === entries.length) return false;
  writeAll(remaining);
  return true;
}
