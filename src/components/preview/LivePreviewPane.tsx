"use client";

import React, { useEffect, useState } from "react";
import { DocumentTemplate, DocumentData } from "@/types/template";
import { generatePdf } from "@/lib/engine/pdf-generator";
import { computeDocumentLayout } from "@/lib/engine/layout";
import { Download, RefreshCw, FileWarning, Eye } from "lucide-react";
import { PdfCanvasStack } from "./PdfCanvasStack";

interface LivePreviewPaneProps {
  template: DocumentTemplate;
  data: DocumentData;
  onDownload: () => void;
}

const REBUILD_DELAY_MS = 300;

/**
 * Real vector PDF preview. Every edit re-renders the actual PDF output
 * (the same bytes that get exported), drawn page by page with pdf.js.
 */
export const LivePreviewPane: React.FC<LivePreviewPaneProps> = ({ template, data, onDownload }) => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageCount = Math.max(1, computeDocumentLayout(template, data).totalPages);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsRendering(true);
      try {
        const bytes = await generatePdf(template, data);
        if (cancelled) return;
        setPdfBytes(bytes);
        setError(null);
      } catch (err) {
        console.error("Live preview failed:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render the PDF preview");
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }, REBUILD_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, data]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-200/70">
      {/* Pane header */}
      <div className="h-12 shrink-0 px-4 flex items-center justify-between gap-3 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 truncate">Live PDF Preview</span>
          <span
            className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              isRendering
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {isRendering ? (
              <>
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Updating
              </>
            ) : (
              "Up to date"
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-neutral-500">
            {pageCount} {pageCount === 1 ? "page" : "pages"}
          </span>
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Document viewport: pages are drawn as images, so they always show */}
      <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-5">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-red-700 bg-red-50 border border-red-200 rounded-xl p-6">
            <FileWarning className="w-8 h-8" />
            <p className="text-sm font-semibold">Preview unavailable</p>
            <p className="text-xs text-red-600 max-w-sm">{error}</p>
          </div>
        ) : pdfBytes ? (
          <PdfCanvasStack bytes={pdfBytes} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-neutral-500 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            Rendering document…
          </div>
        )}
      </div>
    </div>
  );
};
