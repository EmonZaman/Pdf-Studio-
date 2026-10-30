"use client";

import React, { useState } from "react";
import { FileText, Eye, EyeOff, Lock, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error || "Sign-in failed. Please try again.");
        setPassword("");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Only allow in-app redirects
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-xs mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">GT-Pdf_Studio</h1>
          <p className="text-xs text-neutral-500 mt-1">Enter the access password to open the studio.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-neutral-700 mb-1">
              Access password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full pl-9 pr-10 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-60"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-neutral-800 rounded-md"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password || isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold shadow-xs transition-colors"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isSubmitting ? "Checking…" : "Unlock studio"}</span>
          </button>
        </form>

        <p className="text-[11px] text-neutral-400 text-center mt-6">
          Protected workspace. Access is limited to authorised staff.
        </p>
      </div>
    </main>
  );
}
