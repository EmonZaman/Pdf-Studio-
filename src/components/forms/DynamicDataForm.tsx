"use client";

import React, { useEffect, useRef, useState } from "react";
import { DocumentTemplate, DocumentData, TableColumn } from "@/types/template";
import { interpolateString } from "@/lib/interpolate";
import { generateQrDataUrl } from "@/lib/engine/qr-helper";
import {
  recalculateStatementBalances,
  sortTransactionsChronologically,
  parseAmount,
  formatCurrency,
} from "@/lib/balance-calculator";
import {
  FileText,
  User,
  PieChart,
  Table as TableIcon,
  ShieldAlert,
  Plus,
  Trash2,
  Calculator,
  RefreshCw,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Lock,
} from "lucide-react";

interface DynamicDataFormProps {
  template: DocumentTemplate;
  data: DocumentData;
  onChange: (newData: DocumentData) => void;
  onReset?: () => void;
}

type FormTab = "nav" | "account" | "summary" | "transactions" | "footer";

const FORM_TABS: { id: FormTab; label: string; icon: React.ElementType }[] = [
  { id: "nav", label: "Header", icon: FileText },
  { id: "account", label: "Account", icon: User },
  { id: "summary", label: "Summary", icon: PieChart },
  { id: "transactions", label: "Ledger", icon: TableIcon },
  { id: "footer", label: "Footer", icon: ShieldAlert },
];

// Small live QR preview. Encodes the same string the PDF engine prints.
const QrPreview: React.FC<{ value: string; customSrc?: string }> = ({ value, customSrc }) => {
  const [generatedSrc, setGeneratedSrc] = useState("");

  useEffect(() => {
    if (customSrc) return;
    let cancelled = false;
    generateQrDataUrl(value, { width: 240 }).then((url) => {
      if (!cancelled) setGeneratedSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, customSrc]);

  const src = customSrc || generatedSrc;

  return (
    <div className="shrink-0 w-28 h-28 p-1.5 bg-white border border-neutral-200 rounded-lg flex items-center justify-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="QR code printed on the statement" className="w-full h-full object-contain" />
      ) : (
        <span className="text-[10px] text-neutral-400">Generating…</span>
      )}
    </div>
  );
};

export const DynamicDataForm: React.FC<DynamicDataFormProps> = ({
  template,
  data,
  onChange,
  onReset,
}) => {
  const [activeTab, setActiveTab] = useState<FormTab>("account");

  const tableElem = template.elements.find((el) => el.type === "table");
  const tableDataKey = tableElem?.tableDataKey || "transactions";
  const tableRows: any[] = data[tableDataKey] || [];
  const columns: TableColumn[] = tableElem?.tableColumns || [];

  // QR content exactly as the PDF engine resolves it
  const qrContent = interpolateString("{{verifyUrl}}?ref={{referenceNo}}", data, { pageNumber: 1, totalPages: 1 });

  // Replace the generated QR with an uploaded PNG/JPG image (stored as a data URL)
  const handleQrUpload = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      alert("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Please choose an image under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => handleFieldChange("qrImage", reader.result as string);
    reader.readAsDataURL(file);
  };

  // Newly added ledger row: where it landed, its highlight, and the success notice
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const focusRowRef = useRef<number | null>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // After a row is added, scroll to it and put the cursor in its description
  useEffect(() => {
    const target = focusRowRef.current;
    if (target === null) return;
    focusRowRef.current = null;
    const row = tableBodyRef.current?.querySelector<HTMLTableRowElement>(`[data-row-index="${target}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    row?.querySelector<HTMLInputElement>("input[data-field='description']")?.focus({ preventScroll: true });
  }, [tableRows]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  // Update simple key-value field
  const handleFieldChange = (key: string, value: any) => {
    const updated = {
      ...data,
      [key]: value,
    };

    // If opening balance changed in banking template, recalculate all running balances automatically
    if (key === "openingBalance" && template.category === "banking") {
      const calc = recalculateStatementBalances(value, tableRows, true);
      updated.totalDeposits = calc.totalDeposits;
      updated.totalWithdrawals = calc.totalWithdrawals;
      updated.availableBalance = calc.availableBalance;
      updated[tableDataKey] = calc.updatedTransactions;
    }

    onChange(updated);
  };

  // Update a single table row cell while typing (without formatting inputs to prevent cursor jumping)
  const handleTableRowChange = (index: number, key: string, value: any) => {
    const updatedRows = [...tableRows];
    updatedRows[index] = {
      ...updatedRows[index],
      [key]: value,
    };

    if (template.category === "banking" && (key === "withdrawal" || key === "deposit")) {
      // Calculate running balance and totals while preserving raw user keystrokes
      const calc = recalculateStatementBalances(data.openingBalance, updatedRows, false);
      onChange({
        ...data,
        totalDeposits: calc.totalDeposits,
        totalWithdrawals: calc.totalWithdrawals,
        availableBalance: calc.availableBalance,
        [tableDataKey]: calc.updatedTransactions,
      });
    } else {
      onChange({
        ...data,
        [tableDataKey]: updatedRows,
      });
    }
  };

  // On blur of date or numbers: format amounts with commas and sort chronologically
  const handleTableRowBlur = (index: number, key: string) => {
    if (template.category === "banking") {
      let rowsToProcess = [...tableRows];
      if (key === "date") {
        const edited = rowsToProcess[index];
        rowsToProcess = sortTransactionsChronologically(rowsToProcess);
        const newIndex = rowsToProcess.indexOf(edited);
        // Dates re-sort the ledger: tell the user where the edited row went
        if (newIndex !== -1 && newIndex !== index) {
          highlightRow(newIndex, `Row moved to #${newIndex + 1} to keep date order.`);
        }
      }
      const calc = recalculateStatementBalances(data.openingBalance, rowsToProcess, true);
      onChange({
        ...data,
        totalDeposits: calc.totalDeposits,
        totalWithdrawals: calc.totalWithdrawals,
        availableBalance: calc.availableBalance,
        [tableDataKey]: calc.updatedTransactions,
      });
    }
  };

  // Add new transaction row (auto sorted by date)
  const handleAddTableRow = () => {
    const newRow = {
      date: data.statementEndDate || "",
      description: "New transaction",
      chq: "-",
      withdrawal: "0.00",
      deposit: "0.00",
      balance: "0.00",
    };

    let updatedRows = [...tableRows, newRow];
    let insertedAt = updatedRows.length - 1;
    if (template.category === "banking") {
      // Sorting keeps object identity, so indexOf finds the row's new position
      updatedRows = sortTransactionsChronologically(updatedRows);
      insertedAt = updatedRows.indexOf(newRow);
      const calc = recalculateStatementBalances(data.openingBalance, updatedRows, true);
      onChange({
        ...data,
        totalDeposits: calc.totalDeposits,
        totalWithdrawals: calc.totalWithdrawals,
        availableBalance: calc.availableBalance,
        [tableDataKey]: calc.updatedTransactions,
      });
    } else {
      onChange({
        ...data,
        [tableDataKey]: updatedRows,
      });
    }

    // Make the new row impossible to miss: scroll to it, highlight it, and explain where it went
    focusRowRef.current = insertedAt;
    highlightRow(
      insertedAt,
      `Added row #${insertedAt + 1}${newRow.date ? ` dated ${newRow.date}` : ""}. Type its description and amounts; the balance updates automatically.`
    );
  };

  // Highlight a ledger row for a few seconds and show a status message above the table
  const highlightRow = (index: number, message: string) => {
    setHighlightIndex(index);
    setNotice(message);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightIndex(null), 2800);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 8000);
  };

  // Delete transaction row
  const handleDeleteTableRow = (index: number) => {
    const updatedRows = tableRows.filter((_, i) => i !== index);
    if (template.category === "banking") {
      const calc = recalculateStatementBalances(data.openingBalance, updatedRows, true);
      onChange({
        ...data,
        totalDeposits: calc.totalDeposits,
        totalWithdrawals: calc.totalWithdrawals,
        availableBalance: calc.availableBalance,
        [tableDataKey]: calc.updatedTransactions,
      });
    } else {
      onChange({
        ...data,
        [tableDataKey]: updatedRows,
      });
    }
  };

  // Explicit full recalculation and sort button
  const handleRecalculateAll = () => {
    if (template.category === "banking") {
      const sorted = sortTransactionsChronologically(tableRows);
      const calc = recalculateStatementBalances(data.openingBalance, sorted, true);
      onChange({
        ...data,
        totalDeposits: calc.totalDeposits,
        totalWithdrawals: calc.totalWithdrawals,
        availableBalance: calc.availableBalance,
        [tableDataKey]: calc.updatedTransactions,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden text-neutral-800">
      {/* Section stepper + banking actions */}
      <div className="shrink-0 border-b border-neutral-200 bg-neutral-50/80 px-4 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <nav
            aria-label="Form sections"
            className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {FORM_TABS.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const label = tab.id === "transactions" ? `${tab.label} (${tableRows.length})` : tab.label;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? "step" : undefined}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-white text-blue-700 shadow-xs ring-1 ring-blue-200"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-white/70"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      isActive ? "bg-blue-600 text-white" : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-neutral-500 truncate">
            Every change updates the live PDF on the right.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {onReset && (
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 px-2.5 py-1 text-neutral-600 hover:text-neutral-900 hover:bg-white rounded-md text-[11px] font-semibold border border-transparent hover:border-neutral-200 transition"
                title="Restore the original statement data"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            {template.category === "banking" && (
              <button
                onClick={handleRecalculateAll}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md text-[11px] font-semibold border border-blue-200 transition-colors"
                title="Auto-calculate ledger balances, sort dates, and update totals"
              >
                <Calculator className="w-3 h-3 text-blue-600" />
                <span>Auto-Calculate &amp; Sort</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
        <div className={`space-y-6 ${activeTab === "transactions" ? "" : "max-w-3xl mx-auto"}`}>
          {/* TAB 1: HEADER & NAVIGATION */}
          {activeTab === "nav" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="border-b border-neutral-200 pb-3">
                <h3 className="text-sm font-bold text-neutral-900">Document Navigation & Verification Details</h3>
                <p className="text-xs text-neutral-500">
                  QR validation URLs, reference hashes, currency, and generation metadata
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Date of Generation
                  </label>
                  <input
                    type="text"
                    value={data.generationDate || ""}
                    onChange={(e) => handleFieldChange("generationDate", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Currency Symbol / Code
                  </label>
                  <input
                    type="text"
                    value={data.currency || "BDT"}
                    onChange={(e) => handleFieldChange("currency", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div className="md:col-span-2 p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
                  <div className="flex items-start gap-4">
                    <QrPreview value={qrContent} customSrc={data.qrImage || undefined} />
                    <div className="flex-1 min-w-0 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                          Verification URL (QR target)
                        </label>
                        <input
                          type="text"
                          value={data.verifyUrl || ""}
                          onChange={(e) => handleFieldChange("verifyUrl", e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors">
                          {data.qrImage ? "Replace image" : "Upload QR image"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="sr-only"
                            onChange={(e) => {
                              handleQrUpload(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {data.qrImage && (
                          <button
                            onClick={() => handleFieldChange("qrImage", "")}
                            className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold transition-colors"
                          >
                            Use generated QR
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        {data.qrImage ? (
                          "The PDF prints your uploaded image in place of the generated QR."
                        ) : (
                          <>
                            The PDF prints a QR generated from this URL:{" "}
                            <span className="font-mono text-neutral-800 break-all">{qrContent}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Reference code (printed under the QR, and appended to the URL)
                  </label>
                  <input
                    type="text"
                    value={data.referenceNo || ""}
                    onChange={(e) => handleFieldChange("referenceNo", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOMER & ACCOUNT INFO */}
          {activeTab === "account" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="border-b border-neutral-200 pb-3">
                <h3 className="text-sm font-bold text-neutral-900">Account Holder & Branch Information</h3>
                <p className="text-xs text-neutral-500">
                  Official registered account holder identity, address, and banking branch
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={data.customerName || ""}
                    onChange={(e) => handleFieldChange("customerName", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-bold text-neutral-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Customer Address
                  </label>
                  <textarea
                    rows={2}
                    value={data.address || ""}
                    onChange={(e) => handleFieldChange("address", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={data.accountNo || ""}
                    onChange={(e) => handleFieldChange("accountNo", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Account Type
                  </label>
                  <input
                    type="text"
                    value={data.accountType || ""}
                    onChange={(e) => handleFieldChange("accountType", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Account Status
                  </label>
                  <input
                    type="text"
                    value={data.accountStatus || ""}
                    onChange={(e) => handleFieldChange("accountStatus", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs uppercase font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    value={data.branch || ""}
                    onChange={(e) => handleFieldChange("branch", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACCOUNT SUMMARY & BALANCES */}
          {activeTab === "summary" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="border-b border-neutral-200 pb-3">
                <h3 className="text-sm font-bold text-neutral-900">Account Summary & Balance Calculations</h3>
                <p className="text-xs text-neutral-500">
                  Balances are strictly calculated from the Transaction Ledger records. Only Opening Balance takes user input.
                </p>
              </div>

              {/* Only Opening Balance takes Input */}
              <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-blue-900">
                      Opening Balance (Primary Input)
                    </label>
                    <p className="text-[11px] text-blue-700">
                      Changing this starting balance immediately recalculates every ledger row and closing balance
                    </p>
                  </div>
                  <span className="text-[10px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded">
                    Input Field
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-neutral-400 text-xs">
                    {data.currency || "BDT"}
                  </span>
                  <input
                    type="text"
                    value={data.openingBalance || ""}
                    onChange={(e) => handleFieldChange("openingBalance", e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-12 pr-4 py-2.5 bg-white border-2 border-blue-400 focus:border-blue-600 rounded-lg text-sm font-mono font-black text-neutral-900 focus:ring-2 focus:ring-blue-500 outline-hidden shadow-xs"
                  />
                </div>
              </div>

              {/* Strictly Auto-Calculated Cards from Ledger */}
              <div>
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Auto-Calculated Totals (From Transaction Ledger)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Total Deposits */}
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                    <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800">
                      <span>Total Deposits (Cr)</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-emerald-200/70 text-emerald-900 rounded font-mono">
                        Auto
                      </span>
                    </div>
                    <div className="mt-2 font-mono font-black text-lg text-emerald-700">
                      {data.totalDeposits || "0.00"}
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-1">Sum of all deposit transactions</p>
                  </div>

                  {/* Total Withdrawals */}
                  <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-xl">
                    <div className="flex items-center justify-between text-[11px] font-bold text-rose-800">
                      <span>Total Withdrawals (Dr)</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-rose-200/70 text-rose-900 rounded font-mono">
                        Auto
                      </span>
                    </div>
                    <div className="mt-2 font-mono font-black text-lg text-rose-700">
                      {data.totalWithdrawals || "0.00"}
                    </div>
                    <p className="text-[10px] text-rose-600 mt-1">Sum of all withdrawal transactions</p>
                  </div>

                  {/* Available Balance */}
                  <div className="p-4 bg-neutral-900 border border-neutral-800 text-white rounded-xl shadow-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-neutral-300">
                      <span>Available Closing Balance</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-blue-500 text-white rounded font-mono">
                        Live
                      </span>
                    </div>
                    <div className="mt-2 font-mono font-black text-lg text-white">
                      {data.availableBalance || "0.00"}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Opening + Deposits − Withdrawals
                    </p>
                  </div>
                </div>
              </div>

              {/* Statement Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Opening Date</span>
                  </label>
                  <input
                    type="text"
                    placeholder="DD Mmm YYYY"
                    value={data.openingDate || ""}
                    onChange={(e) => handleFieldChange("openingDate", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Statement End Date</span>
                  </label>
                  <input
                    type="text"
                    placeholder="DD Mmm YYYY"
                    value={data.statementEndDate || ""}
                    onChange={(e) => handleFieldChange("statementEndDate", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TRANSACTIONS LEDGER */}
          {activeTab === "transactions" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Transaction Ledger Records ({tableRows.length} Rows)
                  </h3>
                  <p className="text-xs text-neutral-500">
                    New rows are placed in date order. Running balances update automatically.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddTableRow}
                    title="Add a transaction row (placed in date order)"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add transaction</span>
                  </button>
                </div>
              </div>

              {notice && (
                <div
                  role="status"
                  className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800"
                >
                  <span className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-px shrink-0 text-emerald-600" />
                    <span>{notice}</span>
                  </span>
                  <button
                    onClick={() => setNotice(null)}
                    aria-label="Dismiss message"
                    className="text-emerald-700 hover:text-emerald-900 font-bold leading-none px-1"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Table Editor */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[640px] text-left text-xs border-collapse">
                    <thead className="bg-neutral-100 text-neutral-700 font-bold sticky top-0 z-10 border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 px-2 w-8 text-center">#</th>
                        <th className="py-2.5 px-2 w-28">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-1 w-12 text-center">Chq</th>
                        <th className="py-2.5 px-2 w-24 text-right">Withdrawal</th>
                        <th className="py-2.5 px-2 w-24 text-right">Deposit</th>
                        <th className="py-2.5 px-2 w-28 text-right bg-blue-50/50">Balance</th>
                        <th className="py-2.5 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody ref={tableBodyRef} className="divide-y divide-neutral-100 bg-white">
                      {tableRows.map((row, idx) => {
                        const isOpening = idx === 0 && (row.description === "Opening Balance" || !row.withdrawal && !row.deposit);
                        const isHighlighted = highlightIndex === idx;
                        return (
                          <tr
                            key={idx}
                            data-row-index={idx}
                            className={`transition-colors duration-700 group ${
                              isHighlighted ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : "hover:bg-neutral-50/70"
                            }`}
                          >
                            <td className="py-1.5 px-3 text-center text-neutral-400 font-mono text-[10px]">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                placeholder="DD Mmm YYYY"
                                value={row.date || ""}
                                onChange={(e) => handleTableRowChange(idx, "date", e.target.value)}
                                onBlur={() => handleTableRowBlur(idx, "date")}
                                className="w-full px-2 py-1 border border-transparent hover:border-neutral-300 focus:border-blue-500 rounded text-xs font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={row.description || ""}
                                data-field="description"
                                onChange={(e) => handleTableRowChange(idx, "description", e.target.value)}
                                className={`w-full px-2 py-1 border border-transparent hover:border-neutral-300 focus:border-blue-500 rounded text-xs ${
                                  isOpening ? "font-bold text-neutral-900" : ""
                                }`}
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <input
                                type="text"
                                value={row.chq || "-"}
                                onChange={(e) => handleTableRowChange(idx, "chq", e.target.value)}
                                className="w-full px-1 py-1 border border-transparent hover:border-neutral-300 focus:border-blue-500 rounded text-xs text-center font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                disabled={isOpening}
                                value={row.withdrawal === "-" ? "" : row.withdrawal ?? ""}
                                placeholder={isOpening ? "-" : "0.00"}
                                onChange={(e) => handleTableRowChange(idx, "withdrawal", e.target.value)}
                                onBlur={() => handleTableRowBlur(idx, "withdrawal")}
                                className="w-full px-2 py-1 border border-transparent hover:border-neutral-300 focus:border-blue-500 rounded text-xs text-right font-mono text-rose-700 font-medium"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                disabled={isOpening}
                                value={row.deposit === "-" ? "" : row.deposit ?? ""}
                                placeholder={isOpening ? "-" : "0.00"}
                                onChange={(e) => handleTableRowChange(idx, "deposit", e.target.value)}
                                onBlur={() => handleTableRowBlur(idx, "deposit")}
                                className="w-full px-2 py-1 border border-transparent hover:border-neutral-300 focus:border-blue-500 rounded text-xs text-right font-mono text-emerald-700 font-medium"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-neutral-900 bg-blue-50/20">
                              {row.balance || "0.00"}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              {!isOpening && (
                                <button
                                  onClick={() => handleDeleteTableRow(idx)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-red-600 rounded transition-opacity"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={handleAddTableRow}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-dashed border-neutral-300 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add transaction at the end of the list (it moves to its date order)</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: FOOTER & LEGAL NOTES */}
          {activeTab === "footer" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="border-b border-neutral-200 pb-3">
                <h3 className="text-sm font-bold text-neutral-900">Footer, Hotline & Legal Disclaimer</h3>
                <p className="text-xs text-neutral-500">
                  Customizable customer service contact numbers, official website, and statement notes
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Official Website (Printed with Red Globe Icon)
                  </label>
                  <input
                    type="text"
                    value={data.website || "citybankplc.com"}
                    onChange={(e) => handleFieldChange("website", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-bold text-neutral-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Local Support Hotline (Printed with Red Headset Icon)
                  </label>
                  <input
                    type="text"
                    value={data.phoneLocal || "16234 (Local)"}
                    onChange={(e) => handleFieldChange("phoneLocal", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-bold text-neutral-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Overseas Support Hotline
                  </label>
                  <input
                    type="text"
                    value={data.phoneOverseas || "+880 2 8331040 (Overseas)"}
                    onChange={(e) => handleFieldChange("phoneOverseas", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-bold text-neutral-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Legal Notes Disclaimer (Printed below red divider)
                  </label>
                  <textarea
                    rows={3}
                    value={data.notesDisclaimer || ""}
                    onChange={(e) => handleFieldChange("notesDisclaimer", e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
