"use client";

import React, { useState, useRef } from "react";
import { DocumentTemplate, DocumentData } from "@/types/template";
import {
  X,
  Copy,
  Trash2,
  Download,
  Upload,
  Check,
  AlertCircle,
  Plus,
  FileText,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface TemplateManagerModalProps {
  templates: DocumentTemplate[];
  activeTemplate: DocumentTemplate;
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: DocumentTemplate) => void;
  onSaveCurrentTemplate: () => void;
  onDuplicateTemplate: (template: DocumentTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onImportTemplate: (template: DocumentTemplate) => void;
  onApplyImportedStatement?: (data: DocumentData, templateId?: string) => void;
}

export const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  templates,
  activeTemplate,
  isOpen,
  onClose,
  onSelectTemplate,
  onSaveCurrentTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onImportTemplate,
  onApplyImportedStatement,
}) => {
  const [activeTab, setActiveTab] = useState<"library" | "import-pdf" | "export">("library");

  // PDF Import state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<{
    bankName: string;
    templateId: string;
    totalRows: number;
    data: DocumentData;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(activeTemplate, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTemplate.id}-template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== "application/pdf" && !selected.name.endsWith(".pdf")) {
        setExtractError("Please upload a valid PDF document.");
        return;
      }
      setPdfFile(selected);
      setExtractError(null);
      setExtractedResult(null);
    }
  };

  const handleExtractPdf = async () => {
    if (!pdfFile) return;

    try {
      setIsExtracting(true);
      setExtractError(null);

      const formData = new FormData();
      formData.append("file", pdfFile);

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
      setExtractError(err.message || "An error occurred during PDF parsing.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleApplyExtracted = () => {
    if (extractedResult && onApplyImportedStatement) {
      onApplyImportedStatement(extractedResult.data, extractedResult.templateId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="h-14 px-6 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div>
            <h3 className="font-bold text-base text-neutral-900">Template Studio Manager</h3>
            <p className="text-xs text-neutral-500">
              Manage bank statement templates, import PDFs, or export configurations
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-200 px-6 gap-6 text-xs font-semibold bg-white">
          <button
            onClick={() => setActiveTab("library")}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === "library"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Template Library ({templates.length})
          </button>
          <button
            onClick={() => setActiveTab("import-pdf")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "import-pdf"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Statement PDF</span>
          </button>
          <button
            onClick={() => setActiveTab("export")}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === "export"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Export Configuration
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {activeTab === "library" && (
            <div className="space-y-3">
              {templates.map((tpl) => {
                const isActive = tpl.id === activeTemplate.id;
                return (
                  <div
                    key={tpl.id}
                    className={`p-3.5 rounded-lg border transition-all flex items-center justify-between ${
                      isActive
                        ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500 shadow-xs"
                        : "border-neutral-200 hover:border-neutral-300 bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-neutral-900">{tpl.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 uppercase font-mono">
                          {tpl.category}
                        </span>
                        {isActive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-500 text-xs mt-1 max-w-md">{tpl.description}</p>
                      <div className="flex items-center gap-4 text-[11px] text-neutral-400 mt-2 font-mono">
                        <span>{tpl.elements.length} elements</span>
                        <span>{tpl.fields.length} dynamic fields</span>
                        <span>
                          {tpl.pageSettings.size} ({tpl.pageSettings.orientation})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isActive && (
                        <button
                          onClick={() => {
                            onSelectTemplate(tpl);
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded font-medium text-xs transition-colors"
                        >
                          Use Template
                        </button>
                      )}
                      <button
                        onClick={() => onDuplicateTemplate(tpl)}
                        title="Duplicate Template"
                        className="p-1.5 border border-neutral-200 rounded text-neutral-600 hover:bg-neutral-100"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => onDeleteTemplate(tpl.id)}
                          title="Delete Template"
                          className="p-1.5 border border-neutral-200 rounded text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "import-pdf" && (
            <div className="space-y-4">
              <p className="text-neutral-600 text-xs">
                Upload a real bank statement PDF (City Bank, Islami Bank, BRAC Bank, or Eastern Bank).
                The studio will automatically parse all customer info, account balances, and ledger rows:
              </p>

              {!extractedResult ? (
                <>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                      pdfFile
                        ? "border-blue-500 bg-blue-50/40"
                        : "border-neutral-300 hover:border-blue-400 bg-neutral-50 hover:bg-neutral-100/50"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={handlePdfChange}
                    />
                    <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-neutral-200 flex items-center justify-center text-blue-600 mb-2">
                      <FileText className="w-5 h-5" />
                    </div>
                    {pdfFile ? (
                      <div className="text-center">
                        <p className="text-xs font-bold text-neutral-800">{pdfFile.name}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          {(pdfFile.size / 1024).toFixed(1)} KB — Click extract to proceed
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-xs font-semibold text-neutral-800">
                          Click to select Bank Statement PDF
                        </p>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          Compatible with City Bank, IBBL, BRAC, and EBL statements
                        </p>
                      </div>
                    )}
                  </div>

                  {extractError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{extractError}</span>
                    </div>
                  )}

                  <button
                    disabled={!pdfFile || isExtracting}
                    onClick={handleExtractPdf}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    {isExtracting ? (
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
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-emerald-900">
                          {extractedResult.bankName} Statement Extracted
                        </h4>
                        <p className="text-[11px] text-emerald-700">
                          {extractedResult.totalRows} ledger rows parsed and balances calculated
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                      Validated
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                        Account Holder
                      </span>
                      <span className="font-semibold text-neutral-900">
                        {extractedResult.data.customerName || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                        Account Number
                      </span>
                      <span className="font-semibold text-neutral-900 font-mono">
                        {extractedResult.data.accountNo || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                        Opening Balance
                      </span>
                      <span className="font-semibold text-neutral-900 font-mono">
                        {extractedResult.data.openingBalance} {extractedResult.data.currency}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">
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
                      className="flex-1 py-2 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-semibold"
                    >
                      Upload Different PDF
                    </button>
                    <button
                      onClick={handleApplyExtracted}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <span>Load into Studio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "export" && (
            <div className="space-y-3">
              <p className="text-neutral-600">
                You can download or copy the complete JSON definition of &quot;{activeTemplate.name}&quot;
                including all vector elements, styling, and schema fields.
              </p>
              <textarea
                readOnly
                rows={10}
                value={JSON.stringify(activeTemplate, null, 2)}
                className="w-full p-3 font-mono text-[11px] bg-neutral-50 border border-neutral-300 rounded-md select-all"
              />
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download JSON File</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
