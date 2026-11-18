"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Hourglass, Search, Bell, Loader2 } from "lucide-react";

interface VerifiedStatement {
  accountNo: string;
  accountName: string;
  period: string;
  openingBalance: string;
  closingBalance: string;
  generatedOn: string;
  createdAt?: string;
}

type Result =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; statement: VerifiedStatement }
  | { status: "missing"; message: string };

function parseExpirySeconds(generatedOn?: string, createdAt?: string): number {
  try {
    const refDateStr = generatedOn || createdAt;
    if (refDateStr) {
      const parsed = Date.parse(refDateStr);
      if (!isNaN(parsed)) {
        // 180 days validity
        const expiry = parsed + 180 * 86400 * 1000;
        const now = Date.now();
        const diff = Math.floor((expiry - now) / 1000);
        if (diff > 0 && diff <= 180 * 86400) {
          return diff;
        }
      }
    }
  } catch {
    // fallback
  }
  // Default exact countdown from reference image: 163d 06:39:41
  return 163 * 86400 + 6 * 3600 + 39 * 60 + 41;
}

function formatCountdown(totalSec: number): string {
  if (totalSec <= 0) return "00d 00:00:00";
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function VerificationPage() {
  const [ref, setRef] = useState("");
  const [acc, setAcc] = useState("");
  const [result, setResult] = useState<Result>({ status: "idle" });
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const lookup = async (refValue: string, accValue: string) => {
    setResult({ status: "loading" });
    try {
      const params = new URLSearchParams({ ref: refValue.trim(), acc: accValue.trim() });
      const res = await fetch(`/api/verify?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success && json.statement) {
        setResult({ status: "found", statement: json.statement });
        setSecondsRemaining(parseExpirySeconds(json.statement.generatedOn, json.statement.createdAt));
      } else {
        setResult({ status: "missing", message: json.error || "No matching statement was found" });
      }
    } catch {
      setResult({ status: "missing", message: "Could not reach the verification service. Try again." });
    }
  };

  // URL query params auto-fill and auto-verify, plus set tab title & favicon
  useEffect(() => {
    document.title = "Statement Verification";
    try {
      const existingIcons = document.querySelectorAll("link[rel*='icon']");
      existingIcons.forEach((el) => el.parentNode?.removeChild(el));

      const iconLink = document.createElement("link");
      iconLink.rel = "icon";
      iconLink.type = "image/png";
      iconLink.href = "/images/city-bank-favicon.png";
      document.head.appendChild(iconLink);
    } catch {
      // Ignored
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const refParam = params.get("ref") || "";
      const accParam = params.get("acc") || "";
      if (refParam) setRef(refParam);
      if (accParam) setAcc(accParam);
      if (refParam && accParam) {
        void lookup(refParam, accParam);
      }
    } catch {
      // Ignored
    }
  }, []);

  // Tick countdown timer
  useEffect(() => {
    if (result.status !== "found" || secondsRemaining === null || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [result.status, secondsRemaining]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ref.trim() || !acc.trim()) {
      setResult({ status: "missing", message: "Enter both the reference number and the account number" });
      return;
    }
    void lookup(ref, acc);
  };

  const handleReset = () => {
    startTransition(() => {
      setResult({ status: "idle" });
      setRef("");
      setAcc("");
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch {
        // Ignored
      }
    });
  };

  const isFormValid = ref.trim().length > 0 && acc.trim().length > 0;
  const isFound = result.status === "found";
  const isLoading = result.status === "loading";

  return (
    <div className="h-full min-h-screen overflow-y-auto flex flex-col justify-between bg-[#f5f5f5] text-[#1e293b] font-sans antialiased">
      {/* Top Navigation Bar */}
      <header className="w-full bg-[#fafafa] border-b border-[#e5e5e5] h-[51px] px-6 flex items-center justify-between">
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center cursor-pointer border-none bg-transparent p-0 focus:outline-none"
            title="City Bank"
          >
            <img
              src="/images/city-bank-nav-logo.png"
              alt="city bank"
              className="h-[25px] w-auto object-contain"
            />
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Expiration badge shown on top right when statement is verified */}
          {isFound && secondsRemaining !== null && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff1f0] border border-[#ffccc7] text-[11px] text-[#e53935] leading-none">
              <Hourglass className="w-3 h-3 text-[#e53935] stroke-[2]" />
              <span>
                Expires: <strong className="font-bold text-[#e53935]">{formatCountdown(secondsRemaining)}</strong>
              </span>
            </div>
          )}

          {/* Search Icon */}
          <button
            type="button"
            className="text-[#64748b] hover:text-[#1e293b] transition-colors p-0.5 focus:outline-none"
            title="Search"
            aria-label="Search"
          >
            <Search className="w-4 h-4 stroke-[1.6]" />
          </button>

          {/* Bell Icon */}
          <button
            type="button"
            className="text-[#64748b] hover:text-[#1e293b] transition-colors p-0.5 focus:outline-none"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 stroke-[1.6]" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-start pt-5 sm:pt-7 px-4">
        {isFound ? (
          <>
            {/* Statement Verified Result Card */}
            <div className="w-[487px] max-w-full bg-white rounded-[6px] border border-[#e5e5e5] shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
              {/* Card Header */}
              <div className="h-[32px] px-4 flex items-center border-b border-[#f0f0f0]">
                <h1 className="text-[13px] font-bold text-[#2c3e50] tracking-tight">
                  Statement Verification
                </h1>
              </div>

              {/* 2-Column Key-Value Grid */}
              <div className="grid grid-cols-2 divide-x divide-[#f0f0f0]">
                {/* Column 1 */}
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 text-[9.5px]">
                    <span className="text-[#6b7280] whitespace-nowrap">Account Number</span>
                    <span className="font-bold text-[#1f2937] text-right whitespace-nowrap">
                      {result.statement.accountNo}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[9.5px]">
                    <span className="text-[#6b7280] whitespace-nowrap">Account Name</span>
                    <span
                      className="font-bold text-[#1f2937] text-right uppercase truncate whitespace-nowrap"
                      title={result.statement.accountName}
                    >
                      {result.statement.accountName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[9.5px]">
                    <span className="text-[#6b7280] whitespace-nowrap">Statement Period</span>
                    <span className="font-bold text-[#1f2937] text-right whitespace-nowrap">
                      {result.statement.period}
                    </span>
                  </div>
                </div>

                {/* Column 2 */}
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 text-[9.5px]">
                    <span className="text-[#6b7280] whitespace-nowrap">Opening Balance</span>
                    <span className="font-bold text-[#1f2937] text-right whitespace-nowrap">
                      {result.statement.openingBalance}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[9.5px]">
                    <span className="text-[#6b7280] whitespace-nowrap">Closing Balance</span>
                    <span className="font-bold text-[#1f2937] text-right whitespace-nowrap">
                      {result.statement.closingBalance}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[9.5px]">
                    <span className="text-[#6b7280] whitespace-nowrap">Statement Generation Date</span>
                    <span className="font-bold text-[#1f2937] text-right whitespace-nowrap">
                      {result.statement.generatedOn}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom divider and space */}
              <div className="border-t border-[#f0f0f0] h-[27px] bg-white" />
            </div>

            {/* Quick link to verify another statement */}
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] text-[#6b7280] hover:text-[#ED1C24] font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>← Verify another statement</span>
              </button>
            </div>
          </>
        ) : (
          /* Statement Lookup Form Card */
          <div className="w-[487px] max-w-full bg-white rounded-[6px] border border-[#e5e5e5] shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
            {/* Card Header */}
            <div className="h-[32px] px-4 flex items-center border-b border-[#f0f0f0]">
              <h1 className="text-[13px] font-bold text-[#2c3e50] tracking-tight">
                Statement Verification
              </h1>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-4 py-3 space-y-2.5">
              <div>
                <label className="block text-[10.5px] font-bold text-[#374151] mb-1">
                  Reference Number <span className="text-[#e53935]">*</span>
                </label>
                <input
                  type="text"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Enter your reference number"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full h-[28px] px-2.5 text-[11px] text-[#1e293b] placeholder:text-[#9ca3af] border border-[#e5e5e5] rounded-[4px] focus:outline-none focus:border-[#e53935] focus:ring-1 focus:ring-[#e53935] transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-[#374151] mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={acc}
                  onChange={(e) => setAcc(e.target.value)}
                  placeholder="Enter your account number"
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full h-[28px] px-2.5 text-[11px] text-[#1e293b] placeholder:text-[#9ca3af] border border-[#e5e5e5] rounded-[4px] focus:outline-none focus:border-[#e53935] focus:ring-1 focus:ring-[#e53935] transition-colors"
                />
              </div>

              {result.status === "missing" && (
                <div className="text-[10.5px] text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1 text-center">
                  {result.message}
                </div>
              )}

              <div className="flex justify-center pt-1.5 pb-0.5">
                <button
                  type="submit"
                  disabled={!isFormValid || isLoading}
                  className={`w-[143px] h-[25px] flex items-center justify-center text-[10.5px] font-medium rounded-[4px] transition-colors ${
                    !isFormValid || isLoading
                      ? "bg-[#c2c5c9] text-white cursor-not-allowed"
                      : "bg-[#ED1C24] hover:bg-[#d6161d] text-white cursor-pointer shadow-xs"
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Verifying...</span>
                    </span>
                  ) : (
                    "View Statement Details"
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full text-center pb-5 pt-4 text-[10.5px] text-[#8c9ba5]">
        <p>© 2026 City Bank PLC. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
