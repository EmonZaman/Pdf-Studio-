"use client";

import React, { useEffect, useState } from "react";
import { DocumentTemplate, DocumentData } from "@/types/template";
import { generatePdf } from "@/lib/engine/pdf-generator";
import { Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { PdfCanvasStack } from "./PdfCanvasStack";

interface LivePdfViewerProps {
  template: DocumentTemplate;
  data: DocumentData;
}

export const LivePdfViewer: React.FC<LivePdfViewerProps> = ({ template, data }) => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        const bytes = await generatePdf(template, data);
        if (!isCancelled) setPdfBytes(bytes);
      } catch (err) {
        console.error("PDF preview generation failed:", err);
        if (!isCancelled) setError(err instanceof Error ? err.message : "Failed to generate PDF preview");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }, 250); // Debounced

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [template, data]);

  const handleDownload = async () => {
    try {
      const bytes = await generatePdf(template, data);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-200/70 min-h-0">
      {/* Viewer Header */}
      <div className="h-12 shrink-0 bg-white border-b border-neutral-200 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-neutral-900">Official PDF Output Preview</span>
          <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Vector PDF (100% Deterministic)</span>
          </span>
        </div>

        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download PDF</span>
        </button>
      </div>

      {/* PDF Viewport */}
      <div className="flex-1 relative min-h-0 overflow-auto p-4 sm:p-6">
        {isLoading && (
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/90 border border-neutral-200 rounded-full px-3 py-1 text-xs text-neutral-600 shadow-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
            <span>Rendering PDF pages…</span>
          </div>
        )}

        {error ? (
          <div className="text-red-700 text-sm bg-red-50 p-4 rounded-md border border-red-200 max-w-md mx-auto text-center">
            {error}
          </div>
        ) : (
          <PdfCanvasStack bytes={pdfBytes} />
        )}
      </div>
    </div>
  );
};
