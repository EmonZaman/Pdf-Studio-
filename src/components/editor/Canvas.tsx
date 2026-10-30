"use client";

import React, { useRef, useState, useEffect } from "react";
import { DocumentTemplate, DocumentData, CanvasElement as ICanvasElement, UnitType } from "@/types/template";
import { computeDocumentLayout } from "@/lib/engine/layout";
import { CanvasElement } from "./CanvasElement";
import { Rulers } from "./Rulers";
import { GuideLines } from "./GuideLines";
import { interpolateString } from "@/lib/interpolate";

interface CanvasProps {
  template: DocumentTemplate;
  data: DocumentData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateElement: (id: string, updates: Partial<ICanvasElement>) => void;
  zoom: number;
  unit: UnitType;
  showGrid: boolean;
  currentPage: number;
  totalPages: number;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  template,
  data,
  selectedId,
  onSelect,
  onUpdateElement,
  zoom,
  unit,
  showGrid,
  currentPage,
  totalPages,
  onDeleteSelected,
  onDuplicateSelected,
  onUndo,
  onRedo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const pageW = template.pageSettings.width;
  const pageH = template.pageSettings.height;

  // Compute multi-page layout
  const layout = computeDocumentLayout(template, data);
  const currentPageInfo = layout.pages[currentPage - 1] || layout.pages[0];

  // Mouse move handler for rulers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const pageEl = document.getElementById("document-canvas-sheet");
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const ptX = (e.clientX - rect.left) / zoom;
    const ptY = (e.clientY - rect.top) / zoom;
    setCursorPos({ x: Math.round(ptX), y: Math.round(ptY) });
  };

  const handleMouseLeave = () => {
    setCursorPos(null);
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        onRedo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        onDuplicateSelected();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteSelected();
      } else if (selectedId && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const elem = template.elements.find((el) => el.id === selectedId);
        if (!elem || elem.locked) return;

        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;

        onUpdateElement(selectedId, {
          x: Math.max(0, elem.x + dx),
          y: Math.max(0, elem.y + dy),
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, template.elements, onUndo, onRedo, onDeleteSelected, onDuplicateSelected, onUpdateElement]);

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => onSelect(null)}
      className="relative flex-1 bg-neutral-200/80 overflow-auto flex items-start justify-center p-8 select-none"
    >
      {/* Precision Rulers */}
      <Rulers
        width={pageW}
        height={pageH}
        zoom={zoom}
        unit={unit}
        cursorPos={cursorPos}
      />

      {/* The Printable Page Sheet */}
      <div
        id="document-canvas-sheet"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(null);
        }}
        className="relative bg-white shadow-2xl transition-all border border-neutral-300 mt-6"
        style={{
          width: pageW * zoom,
          height: pageH * zoom,
          backgroundColor: template.pageSettings.backgroundColor || "#ffffff",
        }}
      >
        {/* Guides & Margin indicators */}
        <GuideLines
          pageWidth={pageW}
          pageHeight={pageH}
          zoom={zoom}
          margins={template.pageSettings.margins}
          showGrid={showGrid}
        />

        {/* 1. Render Applicable Elements for this Page */}
        {template.elements.map((el) => {
          if (el.hidden) return null;
          if (el.type === "table") return null; // Table rendered with computed pagination

          // Filter by page target
          if (el.pageTarget === "first" && !isFirstPage) return null;
          if (el.pageTarget === "subsequent" && isFirstPage) return null;
          if (el.pageTarget === "last" && !isLastPage) return null;

          const isSelected = el.id === selectedId;
          const displayContent = el.content
            ? interpolateString(el.content, data, { pageNumber: currentPage, totalPages })
            : undefined;

          const isMultiAddr =
            String(data.address || "").trim().includes("\n") ||
            String(data.address || "").trim().length > 68;
          const adjustedElement =
            isMultiAddr && (el.id === "elem-p1-cust-line" || el.id === "elem-p1-acct-meta")
              ? { ...el, y: el.y + 7.5 }
              : el;

          return (
            <CanvasElement
              key={el.id}
              element={adjustedElement}
              isSelected={isSelected}
              zoom={zoom}
              unit={unit}
              displayContent={displayContent}
              onSelect={() => onSelect(el.id)}
              onUpdate={(updates) => onUpdateElement(el.id, updates)}
            />
          );
        })}

        {/* 2. Render Dynamic Table with Exact Pagination Rows */}
        {currentPageInfo.tableHeaders && currentPageInfo.tableRows && (
          (() => {
            const tableElem = template.elements.find((el) => el.type === "table" && !el.hidden);
            if (!tableElem) return null;
            const isSelected = tableElem.id === selectedId;
            const tableY = currentPageInfo.tableY ?? 234.963;
            const headerH = tableElem.tableHeaderHeight || 18.64;
            const hasRows = currentPageInfo.tableRows.length > 0;

            return (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(tableElem.id);
                }}
                className={`absolute transition-shadow ${
                  isSelected ? "ring-2 ring-blue-500 z-30 shadow-md" : "hover:ring-1 hover:ring-blue-300 z-20"
                }`}
                style={{
                  left: tableElem.x * zoom,
                  top: tableY * zoom,
                  width: tableElem.width * zoom,
                  fontFamily: "Helvetica, Arial, sans-serif",
                }}
              >
                {/* If Page 12 has 0 rows in banking template, only draw the two black continuation lines */}
                {!hasRows && template.category === "banking" ? (
                  <div className="flex items-center justify-between w-full">
                    <div
                      className="bg-black"
                      style={{ width: `${247.9 * zoom}px`, height: `${0.5 * zoom}px` }}
                    />
                    <div
                      className="bg-black"
                      style={{ width: `${252.3 * zoom}px`, height: `${0.5 * zoom}px` }}
                    />
                  </div>
                ) : (
                  <>
                    {/* Table Header */}
                    <div
                      className="flex font-bold uppercase select-none"
                      style={{
                        height: `${headerH * zoom}px`,
                        backgroundColor: tableElem.tableHeaderBg === "transparent" ? "transparent" : (tableElem.tableHeaderBg || "transparent"),
                        color: tableElem.tableHeaderTextColor || "#0a0a0a",
                        borderTop: `${0.5 * zoom}px solid ${tableElem.tableBorderColor || "#ed1c24"}`,
                        borderBottom: `${0.5 * zoom}px solid ${tableElem.tableBorderColor || "#ed1c24"}`,
                        fontSize: `${6 * zoom}px`,
                      }}
                    >
                      {currentPageInfo.tableHeaders.map((h) => (
                        <div
                          key={h.column.id}
                          className={`flex items-center overflow-hidden whitespace-nowrap ${
                            h.column.align === "center"
                              ? "justify-center text-center"
                              : h.column.align === "right"
                              ? "justify-end text-right"
                              : "justify-start text-left"
                          }`}
                          style={{ width: `${h.width * zoom}px` }}
                        >
                          {h.column.label}
                        </div>
                      ))}
                    </div>

                    {/* 6.55pt Spacer Gap below Header Red Line (matches Reference PDF) */}
                    {template.category === "banking" && (
                      <div style={{ height: `${6.55 * zoom}px` }} />
                    )}

                    {/* Table Rows for This Page */}
                    <div className="flex flex-col bg-white">
                      {currentPageInfo.tableRows.map((row, rIdx) => {
                        const isOpening = row.cells.some(c => c.value === "Opening Balance");
                        return (
                          <div
                            key={rIdx}
                            className="flex items-center hover:bg-neutral-50/80 transition-colors"
                            style={{
                              height: `${row.height * zoom}px`,
                              fontSize: `${6 * zoom}px`,
                              color: "#000000",
                              borderBottom: `${0.5 * zoom}px solid #ececec`,
                            }}
                          >
                            {row.cells.map((cell) => {
                              const isNumericCol = cell.column.key === "withdrawal" || cell.column.key === "deposit";
                              const displayVal = (isOpening && isNumericCol && (cell.value === "-" || cell.value === "0.00")) ? "" : cell.value;
                              return (
                                <div
                                  key={cell.column.id}
                                  className={`overflow-hidden text-ellipsis whitespace-pre ${
                                    cell.column.align === "center"
                                      ? "text-center"
                                      : cell.column.align === "right"
                                      ? "text-right"
                                      : "text-left"
                                  }`}
                                  style={{ width: `${cell.column.width * zoom}px` }}
                                >
                                  {displayVal}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    {/* End of Statement indicator on last table page */}
                    {currentPageInfo.isLastPage && hasRows && template.category === "banking" && (
                      <div
                        className="flex items-center justify-between w-full"
                        style={{ marginTop: `${22.92 * zoom}px` }}
                      >
                        <div
                          className="bg-black"
                          style={{ width: `${247.9 * zoom}px`, height: `${0.5 * zoom}px` }}
                        />
                        <span
                          className="text-black font-normal whitespace-nowrap"
                          style={{ fontSize: `${7 * zoom}px`, marginTop: `${-5 * zoom}px` }}
                        >
                          End of Statement
                        </span>
                        <div
                          className="bg-black"
                          style={{ width: `${252.3 * zoom}px`, height: `${0.5 * zoom}px` }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};
