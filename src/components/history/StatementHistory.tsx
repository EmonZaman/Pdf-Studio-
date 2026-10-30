"use client";

import React, { useMemo, useState } from "react";
import { DocumentTemplate } from "@/types/template";
import type { StatementHistoryEntry } from "@/lib/history-storage";
import { generatePdf } from "@/lib/engine/pdf-generator";
import {
  Search,
  FolderOpen,
  Pencil,
  Check,
  X,
  Trash2,
  Download,
  History as HistoryIcon,
  ArrowUpRight,
} from "lucide-react";

interface StatementHistoryProps {
  entries: StatementHistoryEntry[];
  isLoading: boolean;
  templates: Record<string, DocumentTemplate>;
  onOpen: (entry: StatementHistoryEntry) => void;
  onRename: (entry: StatementHistoryEntry, label: string) => Promise<void>;
  onDelete: (entry: StatementHistoryEntry) => Promise<void>;
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const StatementHistory: React.FC<StatementHistoryProps> = ({
  entries,
  isLoading,
  templates,
  onOpen,
  onRename,
  onDelete,
}) => {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.label, e.bankName, e.accountName, e.accountNo, e.period].some((v) => v.toLowerCase().includes(q))
    );
  }, [entries, query]);

  // Group by bank so each bank's statements sit together
  const groups = useMemo(() => {
    const map = new Map<string, StatementHistoryEntry[]>();
    for (const entry of filtered) {
      const key = entry.templateId;
      map.set(key, [...(map.get(key) || []), entry]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const startRename = (entry: StatementHistoryEntry) => {
    setEditingId(entry.id);
    setDraftLabel(entry.label);
  };

  const saveRename = async (entry: StatementHistoryEntry) => {
    const label = draftLabel.trim();
    if (!label || label === entry.label) {
      setEditingId(null);
      return;
    }
    setBusyId(entry.id);
    await onRename(entry, label);
    setBusyId(null);
    setEditingId(null);
  };

  const handleDelete = async (entry: StatementHistoryEntry) => {
    if (!window.confirm(`Delete "${entry.label}" from history? This cannot be undone.`)) return;
    setBusyId(entry.id);
    await onDelete(entry);
    setBusyId(null);
  };

  const handleDownload = async (entry: StatementHistoryEntry) => {
    const template = templates[entry.templateId];
    if (!template) return;
    setBusyId(entry.id);
    try {
      const bytes = await generatePdf(template, entry.data);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entry.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-50">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-neutral-900 flex items-center gap-2">
              <HistoryIcon className="w-5 h-5 text-blue-600" />
              Statement history
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Every statement you export is saved here, grouped by bank. Open one to edit it again, rename it, or download it.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, account, bank or date"
              className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
        </div>

        {isLoading && entries.length === 0 && (
          <p className="text-sm text-neutral-500 py-12 text-center">Loading history…</p>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="flex flex-col items-center text-center gap-2 py-16 border border-dashed border-neutral-300 rounded-2xl bg-white">
            <FolderOpen className="w-8 h-8 text-neutral-400" />
            <p className="text-sm font-semibold text-neutral-800">No statements yet</p>
            <p className="text-xs text-neutral-500 max-w-xs">Export a PDF from the Edit & Preview screen and it will appear here.</p>
          </div>
        )}

        {entries.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-neutral-500 py-12 text-center">No statements match “{query}”.</p>
        )}

        {groups.map(([templateId, rows]) => {
          const bankName = templates[templateId]?.name || rows[0].bankName || "Unknown bank";
          return (
            <section key={templateId} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">{bankName}</h3>
                <span className="text-[11px] font-mono text-neutral-500">
                  {rows.length} {rows.length === 1 ? "statement" : "statements"}
                </span>
              </div>

              <ul className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100 shadow-2xs overflow-hidden">
                {rows.map((entry) => {
                  const isEditing = editingId === entry.id;
                  const isBusy = busyId === entry.id;
                  return (
                    <li key={entry.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 hover:bg-neutral-50/70 transition-colors">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={draftLabel}
                              onChange={(e) => setDraftLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename(entry);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              aria-label="Statement name"
                              className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-blue-400 rounded-md text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/30"
                            />
                            <button
                              onClick={() => saveRename(entry)}
                              disabled={isBusy}
                              className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
                              aria-label="Save name"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                              aria-label="Cancel rename"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-neutral-900 truncate">{entry.label}</p>
                        )}
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">
                          {entry.accountNo && (
                            <>
                              Account <span className="font-mono">{entry.accountNo}</span>
                            </>
                          )}
                          {entry.period && <span>{entry.accountNo ? " · " : ""}Period {entry.period}</span>}
                        </p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">Exported {formatWhen(entry.createdAt)}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onOpen(entry)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          Open
                        </button>
                        <button
                          onClick={() => handleDownload(entry)}
                          disabled={isBusy}
                          title="Download PDF"
                          className="p-2 rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => startRename(entry)}
                          disabled={isBusy}
                          title="Rename"
                          className="p-2 rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry)}
                          disabled={isBusy}
                          title="Delete"
                          className="p-2 rounded-md border border-neutral-300 text-neutral-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
};
