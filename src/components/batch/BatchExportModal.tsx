"use client";

import React, { useState } from "react";
import { DocumentTemplate, DocumentData } from "@/types/template";
import { generatePdf } from "@/lib/engine/pdf-generator";
import { PDFDocument } from "pdf-lib";
import Papa from "papaparse";
import { X, Upload, FileText, Download, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

interface BatchExportModalProps {
  template: DocumentTemplate;
  isOpen: boolean;
  onClose: () => void;
}

export const BatchExportModal: React.FC<BatchExportModalProps> = ({
  template,
  isOpen,
  onClose,
}) => {
  const [inputMode, setInputMode] = useState<"csv" | "json">("csv");
  const [csvText, setCsvText] = useState<string>("");
  const [jsonText, setJsonText] = useState<string>("");
  const [parsedRecords, setParsedRecords] = useState<DocumentData[]>([]);
  const [status, setStatus] = useState<"idle" | "generating" | "complete" | "error">("idle");
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParseCsv = (text: string) => {
    setCsvText(text);
    try {
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (result.data && result.data.length > 0) {
        setParsedRecords(result.data as DocumentData[]);
        setErrorMsg(null);
      } else {
        setParsedRecords([]);
      }
    } catch (err: any) {
      setErrorMsg("Failed to parse CSV: " + err.message);
    }
  };

  const handleParseJson = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        setParsedRecords(parsed);
        setErrorMsg(null);
      } else {
        setErrorMsg("JSON input must be an array of objects [ { ... }, { ... } ]");
      }
    } catch (err: any) {
      setErrorMsg("Invalid JSON: " + err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (file.name.endsWith(".json")) {
        setInputMode("json");
        handleParseJson(content);
      } else {
        setInputMode("csv");
        handleParseCsv(content);
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateBatch = async () => {
    if (parsedRecords.length === 0) return;
    try {
      setStatus("generating");
      setErrorMsg(null);
      setProgress({ current: 0, total: parsedRecords.length });

      // Create merged master PDF document
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < parsedRecords.length; i++) {
        const record = parsedRecords[i];
        setProgress({ current: i + 1, total: parsedRecords.length });

        const singleBytes = await generatePdf(template, record);
        const singleDoc = await PDFDocument.load(singleBytes);
        const copiedPages = await mergedPdf.copyPages(singleDoc, singleDoc.getPageIndices());
        copiedPages.forEach((p) => mergedPdf.addPage(p));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch-${template.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${parsedRecords.length}-documents.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("complete");
    } catch (err: any) {
      console.error("Batch generation failed:", err);
      setStatus("error");
      setErrorMsg(err.message || "Failed to generate batch PDFs");
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="h-14 px-6 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div>
            <h3 className="font-bold text-base text-neutral-900">Batch Document Generator</h3>
            <p className="text-xs text-neutral-500">
              Generate multiple PDFs at once using CSV or JSON dataset for {template.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* File Upload or Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 border border-neutral-300 rounded-md p-0.5 bg-neutral-100">
              <button
                onClick={() => setInputMode("csv")}
                className={`px-3 py-1 rounded text-xs font-semibold ${
                  inputMode === "csv" ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600"
                }`}
              >
                CSV Format
              </button>
              <button
                onClick={() => setInputMode("json")}
                className={`px-3 py-1 rounded text-xs font-semibold ${
                  inputMode === "json" ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600"
                }`}
              >
                JSON Array
              </button>
            </div>

            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md cursor-pointer border border-neutral-300 font-medium">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload CSV / JSON File</span>
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Input text area */}
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">
              Paste {inputMode.toUpperCase()} Data
            </label>
            {inputMode === "csv" ? (
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => handleParseCsv(e.target.value)}
                placeholder="customerName,accountNo,availableBalance&#10;Alice Smith,991002341,45210.50&#10;Bob Jones,882003412,18500.00"
                className="w-full p-2.5 border border-neutral-300 rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <textarea
                rows={6}
                value={jsonText}
                onChange={(e) => handleParseJson(e.target.value)}
                placeholder='[&#10;  { "customerName": "Alice Smith", "accountNo": "991002341", "availableBalance": "45,210.50" },&#10;  { "customerName": "Bob Jones", "accountNo": "882003412", "availableBalance": "18,500.00" }&#10;]'
                className="w-full p-2.5 border border-neutral-300 rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Parsed records summary */}
          {parsedRecords.length > 0 && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-md flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-900">
                  {parsedRecords.length} records ready for processing
                </span>
              </div>
              <span className="text-neutral-500 text-[11px]">
                {Object.keys(parsedRecords[0]).length} columns detected
              </span>
            </div>
          )}

          {status === "generating" && (
            <div className="space-y-2">
              <div className="flex justify-between text-neutral-600 font-medium">
                <span>Generating PDFs...</span>
                <span>
                  {progress.current} of {progress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-14 px-6 border-t border-neutral-200 flex items-center justify-between bg-neutral-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-neutral-300 rounded-md text-neutral-700 hover:bg-neutral-100 font-medium text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateBatch}
            disabled={parsedRecords.length === 0 || status === "generating"}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md font-semibold text-xs shadow-xs transition-colors"
          >
            {status === "generating" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing Batch...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Generate & Download Combined PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
