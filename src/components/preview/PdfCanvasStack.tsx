"use client";

import React, { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsPromise: Promise<PdfJsModule> | null = null;

// pdf.js is loaded on demand in the browser only, and its worker is served from /public
function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfJsPromise;
}

const PAGE_GAP_PX = 16;

interface PdfCanvasStackProps {
  /** Raw PDF bytes to draw. Pages are rasterised with pdf.js, so no native PDF plugin is needed. */
  bytes: Uint8Array | null;
}

/**
 * Draws every page of a PDF onto canvases, fitted to the container width.
 * Works in any browser, including ones with the built-in PDF viewer disabled.
 */
export const PdfCanvasStack: React.FC<PdfCanvasStackProps> = ({ bytes }) => {
  const stackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The document currently on screen. Destroying a document also tears down the shared
  // pdf.js worker, so only replace it once a newer one has loaded (never inside effect cleanup).
  const activeTask = useRef<PDFDocumentLoadingTask | null>(null);

  useEffect(() => {
    return () => {
      activeTask.current?.destroy();
      activeTask.current = null;
    };
  }, []);

  // Track the available width so pages re-fit when the pane resizes
  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = stackRef.current;
    // Measure synchronously so the first draw does not wait for a ResizeObserver callback
    const available = host?.clientWidth ?? 0;
    if (!bytes || !host || available <= 0) return;

    let cancelled = false;
    const tasks: RenderTask[] = [];

    const draw = async () => {
      if (cancelled) return;
      try {
        const pdfjs = await loadPdfJs();
        // pdf.js may transfer the buffer to its worker, so hand it a copy
        const task = pdfjs.getDocument({
          data: bytes.slice(),
          // Non-embedded fonts (e.g. Helvetica) are fetched from here; without them rendering stalls
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        });
        const doc: PDFDocumentProxy = await task.promise;
        if (cancelled) {
          doc.cleanup();
          return;
        }
        const previous = activeTask.current;
        activeTask.current = task;
        previous?.destroy();

        const dpr = window.devicePixelRatio || 1;
        const fragment = document.createDocumentFragment();

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;

          const base = page.getViewport({ scale: 1 });
          const cssScale = (available - 2) / base.width;
          const viewport = page.getViewport({ scale: cssScale * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width) / dpr}px`;
          canvas.style.height = `${Math.floor(viewport.height) / dpr}px`;
          canvas.className = "block bg-white shadow-md rounded-sm mx-auto";
          canvas.setAttribute("aria-label", `Page ${i} of ${doc.numPages}`);

          const wrapper = document.createElement("div");
          wrapper.style.marginBottom = `${PAGE_GAP_PX}px`;
          wrapper.appendChild(canvas);
          fragment.appendChild(wrapper);

          const task = page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport });
          tasks.push(task);
          await task.promise.catch(() => undefined); // cancelled renders are expected on rebuild
        }

        if (cancelled) return;
        host.replaceChildren(fragment);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF page rendering failed:", err);
          setError(err instanceof Error ? err.message : "Could not draw the PDF");
        }
      }
    };

    draw();

    return () => {
      cancelled = true;
      tasks.forEach((task) => task.cancel());
    };
  }, [bytes, width]); // `width` re-runs the draw when the pane is resized

  return (
    <>
      {error && (
        <div className="p-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
      )}
      <div ref={stackRef} className="w-full" />
    </>
  );
};
