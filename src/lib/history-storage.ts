import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { get, put, del } from "@vercel/blob";
import { DocumentData } from "@/types/template";

// Every exported statement is recorded so it can be reopened, renamed or re-downloaded later.
// The whole history lives in Vercel Blob (production) with local fallback/mirror in data/history.json.

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

const BLOB_PATH = "gt-pdf-studio/history.json";
const LOCAL_HISTORY_PATH = path.join(process.cwd(), "data", "history.json");

async function readLocal(): Promise<StatementHistoryEntry[]> {
  try {
    const raw = await fs.readFile(LOCAL_HISTORY_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeLocal(entries: StatementHistoryEntry[]) {
  try {
    await fs.mkdir(path.dirname(LOCAL_HISTORY_PATH), { recursive: true });
    await fs.writeFile(LOCAL_HISTORY_PATH, JSON.stringify(entries, null, 2), "utf-8");
  } catch {
    // Local write error ignored
  }
}

async function readAll(): Promise<StatementHistoryEntry[]> {
  let blobEntries: StatementHistoryEntry[] = [];
  try {
    const result = await get(BLOB_PATH, { access: "private", useCache: false });
    if (result && result.statusCode === 200) {
      const text = await new Response(result.stream).text();
      blobEntries = JSON.parse(text);
    }
  } catch {
    blobEntries = [];
  }

  const localEntries = await readLocal();
  if (blobEntries.length === 0) return localEntries;

  // Merge unique entries by ID
  const map = new Map<string, StatementHistoryEntry>();
  for (const e of localEntries) map.set(e.id, e);
  for (const e of blobEntries) map.set(e.id, e);
  return Array.from(map.values());
}

async function writeAll(entries: StatementHistoryEntry[]) {
  // Always mirror to local file
  await writeLocal(entries);

  try {
    await put(BLOB_PATH, JSON.stringify(entries), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    console.warn("Could not write to Vercel Blob (using local history)", err);
  }
}

export async function listHistory(): Promise<StatementHistoryEntry[]> {
  return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addHistory(
  input: Omit<StatementHistoryEntry, "id" | "createdAt" | "updatedAt">
): Promise<StatementHistoryEntry> {
  const now = new Date().toISOString();
  const entry: StatementHistoryEntry = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await writeAll([...(await readAll()), entry]);
  return entry;
}

export async function renameHistory(id: string, label: string): Promise<StatementHistoryEntry | null> {
  const entries = await readAll();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.label = label;
  entry.updatedAt = new Date().toISOString();
  await writeAll(entries);
  return entry;
}

export async function deleteHistory(id: string): Promise<boolean> {
  const entries = await readAll();
  const remaining = entries.filter((e) => e.id !== id);
  if (remaining.length === entries.length) return false;
  if (remaining.length === 0) {
    await del(BLOB_PATH);
  } else {
    await writeAll(remaining);
  }
  return true;
}
