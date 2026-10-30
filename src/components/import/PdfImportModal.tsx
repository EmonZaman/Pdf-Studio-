"use client";

import React, { useState, useRef, useEffect } from "react";
import { DocumentData } from "@/types/template";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ArrowRight,
  Sparkles,
  Building2,
  Database,
} from "lucide-react";

interface PdfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyData: (data: DocumentData, templateId?: string) => void;
}

export const PdfImportModal: React.FC<PdfImportModalProps> = ({
  isOpen,
  onClose,
  onApplyData,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<{
    bankName: string;
    templateId: string;
    totalRows: number;
    data: DocumentData;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setError(null);
      setExtractedResult(null);
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== "application/pdf" && !selected.name.endsWith(".pdf")) {
        setError("Please upload a valid PDF document.");
        return;
      }
      setFile(selected);
      setError(null);
      setExtractedResult(null);
    }
  };

  const handleExtract = async () => {
    if (!file) return;

    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to extract statement data from PDF");
      }

      setExtractedResult({
        bankName: json.bankName,
        templateId: json.templateId,
        totalRows: json.totalRows,
        data: json.data,
      });
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during PDF parsing.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleApply = () => {
    if (extractedResult) {
      onApplyData(extractedResult.data, extractedResult.templateId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl border border-neutral-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-14 px-6 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-900">Import Bank Statement PDF</h3>
              <p className="text-[11px] text-neutral-500">
                Extract ledger rows, accounts, and balances into editable template
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {!extractedResult ? (
            <>
              {/* Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  file
                    ? "border-blue-500 bg-blue-50/40"
                    : "border-neutral-300 hover:border-blue-400 bg-neutral-50 hover:bg-neutral-100/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-neutral-200 flex items-center justify-center text-blue-600 mb-3">
                  <FileText className="w-6 h-6" />
                </div>
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-bold text-neutral-800">{file.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB — Ready to extract
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-xs font-semibold text-neutral-800">
                      Click to choose or drag & drop Bank Statement PDF
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Supports City Bank, Islami Bank, BRAC Bank, Eastern Bank (EBL) statements
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                disabled={!file || isUploading}
                onClick={handleExtract}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Parsing Statement & Extracting Ledger...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Extract Statement Data</span>
                  </>
                )}
              </button>
            </>
          ) : (
            /* Extracted Results Summary */
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">
                      Statement Extracted Successfully
                    </h4>
                    <p className="text-[11px] text-emerald-700">
                      {extractedResult.bankName} • {extractedResult.totalRows} transactions parsed
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                  Ready
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold tracking-wider">
                    Account Holder
                  </span>
                  <span className="font-semibold text-neutral-900">
                    {extractedResult.data.customerName || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold tracking-wider">
                    Account Number
                  </span>
                  <span className="font-semibold text-neutral-900 font-mono">
                    {extractedResult.data.accountNo || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold tracking-wider">
                    Date Range
                  </span>
                  <span className="font-semibold text-neutral-900">
                    {extractedResult.data.openingDate} to {extractedResult.data.statementEndDate}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold tracking-wider">
                    Available Balance
                  </span>
                  <span className="font-bold text-blue-700 font-mono">
                    {extractedResult.data.availableBalance} {extractedResult.data.currency}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setExtractedResult(null)}
                  className="flex-1 py-2.5 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  Upload Different PDF
                </button>
                <button
                  onClick={handleApply}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Apply to Document</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
