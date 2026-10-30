"use client";

import React, { useState, useRef, useEffect } from "react";
import { CanvasElement as ICanvasElement, UnitType } from "@/types/template";
import { fromPoints } from "@/lib/units";
import { QrCode } from "lucide-react";

interface CanvasElementProps {
  element: ICanvasElement;
  isSelected: boolean;
  zoom: number;
  unit: UnitType;
  displayContent?: string;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (updated: Partial<ICanvasElement>) => void;
  tableData?: any[];
}

export const CanvasElement: React.FC<CanvasElementProps> = ({
  element,
  isSelected,
  zoom,
  unit,
  displayContent,
  onSelect,
  onUpdate,
  tableData = [],
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const startPos = useRef<{ x: number; y: number; elemX: number; elemY: number; elemW: number; elemH: number }>({
    x: 0,
    y: 0,
    elemX: 0,
    elemY: 0,
    elemW: 0,
    elemH: 0,
  });

  // Handle Drag Move
  const handleMouseDown = (e: React.MouseEvent) => {
    if (element.locked) return;
    e.stopPropagation();
    onSelect(e);

    setIsDragging(true);
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: element.x,
      elemY: element.y,
      elemW: element.width,
      elemH: element.height,
    };
  };

  // Handle Resize Start
  const handleResizeStart = (e: React.MouseEvent, handle: string) => {
    if (element.locked) return;
    e.stopPropagation();
    setIsResizing(handle);
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: element.x,
      elemY: element.y,
      elemW: element.width,
      elemH: element.height,
    };
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - startPos.current.x) / zoom;
      const dy = (e.clientY - startPos.current.y) / zoom;

      if (isDragging) {
        onUpdate({
          x: Math.round(Math.max(0, startPos.current.elemX + dx) * 10) / 10,
          y: Math.round(Math.max(0, startPos.current.elemY + dy) * 10) / 10,
        });
      } else if (isResizing) {
        let newX = startPos.current.elemX;
        let newY = startPos.current.elemY;
        let newW = startPos.current.elemW;
        let newH = startPos.current.elemH;

        if (isResizing.includes("e")) newW = Math.max(10, startPos.current.elemW + dx);
        if (isResizing.includes("s")) newH = Math.max(5, startPos.current.elemH + dy);
        if (isResizing.includes("w")) {
          const delta = Math.min(dx, startPos.current.elemW - 10);
          newX = startPos.current.elemX + delta;
          newW = startPos.current.elemW - delta;
        }
        if (isResizing.includes("n")) {
          const delta = Math.min(dy, startPos.current.elemH - 5);
          newY = startPos.current.elemY + delta;
          newH = startPos.current.elemH - delta;
        }

        onUpdate({
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10,
          width: Math.round(newW * 10) / 10,
          height: Math.round(newH * 10) / 10,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, zoom, onUpdate]);

  if (element.hidden) return null;

  const style = element.style;
  const content = displayContent !== undefined ? displayContent : element.content || "";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute group select-none transition-shadow ${
        element.locked ? "cursor-not-allowed" : "cursor-move"
      } ${
        isSelected
          ? "ring-2 ring-blue-500 ring-offset-1 z-30 shadow-lg"
          : "hover:ring-1 hover:ring-blue-300 z-20"
      }`}
      style={{
        left: element.x * zoom,
        top: element.y * zoom,
        width: element.width * zoom,
        height: element.height * zoom,
      }}
    >
      {/* Element Content Render */}
      <div
        className="w-full h-full overflow-hidden flex flex-col justify-start"
        style={{
          fontFamily: style.fontFamily || "Arial, Helvetica, sans-serif",
          fontSize: `${(style.fontSize || 9) * zoom}px`,
          fontWeight: style.fontWeight || "normal",
          fontStyle: style.fontStyle || "normal",
          color: style.color || "#000000",
          backgroundColor: style.backgroundColor || "transparent",
          borderColor: style.borderColor || "transparent",
          borderWidth: style.borderWidth ? `${style.borderWidth * zoom}px` : "0px",
          borderRadius: style.borderRadius ? `${style.borderRadius * zoom}px` : "0px",
          borderStyle: style.borderStyle || (style.borderWidth ? "solid" : "none"),
          textAlign: style.textAlign || "left",
          lineHeight: style.lineHeight || 1.25,
          opacity: style.opacity ?? 1,
          padding: style.padding ? `${style.padding * zoom}px` : 0,
        }}
      >
        {/* Bank Logo / Image */}
        {element.type === "image" && (
          <div className="w-full h-full flex items-center">
            {element.url ? (
              <img
                src={element.url}
                alt={element.name}
                className="w-full h-full object-contain object-left pointer-events-none select-none"
              />
            ) : (
              <img
                src="/images/city-bank-logo.png"
                alt="Bank Logo"
                className="w-full h-full object-contain object-left pointer-events-none select-none"
              />
            )}
          </div>
        )}

        {/* Regular Text Element */}
        {element.type === "text" && (
          <div className="w-full h-full whitespace-pre-wrap break-words leading-tight">
            {element.id === "elem-footer-web" ? (
              <div className="flex items-center h-full" style={{ gap: `${5.5 * zoom}px` }}>
                <img
                  src="/images/ref-Im1.png"
                  alt="Globe"
                  className="pointer-events-none select-none shrink-0"
                  style={{ width: `${7.28 * zoom}px`, height: `${7.28 * zoom}px` }}
                />
                <span className="font-bold text-black" style={{ fontSize: `${7 * zoom}px` }}>
                  {content}
                </span>
              </div>
            ) : element.id === "elem-footer-phones" ? (
              <div className="flex items-center h-full" style={{ gap: `${5.5 * zoom}px`, fontSize: `${7 * zoom}px` }}>
                <img
                  src="/images/ref-Im2.png"
                  alt="Hotline"
                  className="pointer-events-none select-none shrink-0"
                  style={{ width: `${7.28 * zoom}px`, height: `${7.28 * zoom}px` }}
                />
                <div className="flex items-center whitespace-nowrap">
                  <span className="font-bold text-black">16234</span>
                  <span className="font-normal text-[#646464] ml-0.5">(Local)</span>
                  <span className="font-bold text-black" style={{ marginLeft: `${16 * zoom}px` }}>
                    +880 2 8331040
                  </span>
                  <span className="font-normal text-[#646464] ml-0.5">(Overseas)</span>
                </div>
              </div>
            ) : element.id === "elem-footer-notes" ? (
              <div style={{ lineHeight: 1.18 }}>
                <span className="font-bold text-black block" style={{ fontSize: `${6 * zoom}px` }}>
                  Notes:
                </span>
                <span className="block text-[#595959]" style={{ fontSize: `${6 * zoom}px`, marginTop: `${1.5 * zoom}px` }}>
                  {content.replace(/^Notes:\s*/, "")}
                </span>
              </div>
            ) : element.id === "elem-footer-page-num" ? (
              <div className="w-full text-right text-[#797979]" style={{ fontSize: `${7 * zoom}px` }}>
                {(() => {
                  const m = content.match(/^Page\s+(\d+)\s+of\s+(\d+)$/i);
                  if (!m) return content;
                  return (
                    <>
                      <span>Page </span>
                      <span className="font-bold">{m[1]}</span>
                      <span> of </span>
                      <span className="font-bold">{m[2]}</span>
                    </>
                  );
                })()}
              </div>
            ) : element.id?.startsWith("elem-p1-summary-c") ? (
              <div className="w-full flex flex-col items-end text-right">
                {(() => {
                  const parts = content.split("\n");
                  const label = parts[0] || "";
                  const val = parts[1] || "";
                  return (
                    <>
                      <span className="font-normal text-[#888888] whitespace-nowrap" style={{ fontSize: `${7 * zoom}px` }}>
                        {label}
                      </span>
                      <span
                        className="font-bold text-black whitespace-nowrap"
                        style={{ fontSize: `${8 * zoom}px`, marginTop: `${2.2 * zoom}px` }}
                      >
                        {val}
                      </span>
                    </>
                  );
                })()}
              </div>
            ) : element.id === "elem-p1-acct-meta" ? (
              <div className="w-full h-full relative" style={{ fontSize: `${7 * zoom}px` }}>
                {(() => {
                  const lines = content.split("\n");
                  const l1 = lines[0] || "";
                  const l2 = lines[1] || "";
                  const acctNoMatch = l1.match(/Account No\.\s*:\s*(\S+)/);
                  const acctTypeMatch = l1.match(/Account Type\s*:\s*(.+)$/);
                  const statusMatch = l2.match(/Account Status\s*:\s*(\S+)/);
                  const branchMatch = l2.match(/Branch\s*:\s*(.+)$/);
                  return (
                    <div className="flex flex-col" style={{ gap: `${2.2 * zoom}px` }}>
                      <div className="flex items-baseline whitespace-nowrap">
                        <span className="text-[#888888] inline-block" style={{ width: `${50.7 * zoom}px` }}>
                          Account No.
                        </span>
                        <span className="text-[#888888] inline-block" style={{ width: `${4.85 * zoom}px` }}>
                          :
                        </span>
                        <span className="text-black inline-block" style={{ width: `${87.55 * zoom}px` }}>
                          {acctNoMatch ? acctNoMatch[1] : ""}
                        </span>
                        <span className="text-[#888888] inline-block" style={{ width: `${46.25 * zoom}px` }}>
                          Account Type
                        </span>
                        <span className="text-[#888888] inline-block" style={{ width: `${4.85 * zoom}px` }}>
                          :
                        </span>
                        <span className="text-black" style={{ fontSize: `${6 * zoom}px` }}>
                          {acctTypeMatch ? acctTypeMatch[1] : ""}
                        </span>
                      </div>
                      <div className="flex items-baseline whitespace-nowrap">
                        <span className="text-[#888888] inline-block" style={{ width: `${50.7 * zoom}px` }}>
                          Account Status
                        </span>
                        <span className="text-[#888888] inline-block" style={{ width: `${4.85 * zoom}px` }}>
                          :
                        </span>
                        <span className="text-black inline-block" style={{ width: `${87.55 * zoom}px` }}>
                          {statusMatch ? statusMatch[1] : ""}
                        </span>
                        <span className="text-[#888888] inline-block" style={{ width: `${46.25 * zoom}px` }}>
                          Branch
                        </span>
                        <span className="text-[#888888] inline-block" style={{ width: `${4.85 * zoom}px` }}>
                          :
                        </span>
                        <span className="text-black">
                          {branchMatch ? branchMatch[1] : ""}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : element.id === "elem-p1-verify-text" ? (
              <div style={{ fontSize: `${6 * zoom}px`, lineHeight: 1.33 }}>
                {(() => {
                  const lines = content.split("\n");
                  return (
                    <>
                      <div className="text-[#888888]">{lines[0] || ""}</div>
                      <div className="text-[#888888]">{lines[1] || ""}</div>
                      <div className="text-black">{lines[2] || ""}</div>
                    </>
                  );
                })()}
              </div>
            ) : element.id === "elem-sub-cust-info" ? (
              <div className="w-full flex items-center justify-between whitespace-nowrap" style={{ fontSize: `${8 * zoom}px`, letterSpacing: "-0.3px" }}>
                {(() => {
                  const m = content.match(/Name\s*:\s*(.+?)\s+Account No\.\s*:\s*(\S+)/);
                  return (
                    <>
                      <div>
                        <span className="font-normal text-[#0a0a0a]">Name : </span>
                        <span className="font-bold text-[#0a0a0a]">{m ? m[1] : ""}</span>
                      </div>
                      <div>
                        <span className="font-normal text-[#0a0a0a]">Account No. : </span>
                        <span className="font-bold text-[#0a0a0a]">{m ? m[2] : ""}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : content.startsWith("TRANSACTIONS") ? (
              <div className="w-full flex items-center justify-between whitespace-nowrap">
                <div className="flex items-center">
                  <span className="text-[#ed1c24] font-bold" style={{ fontSize: `${9 * zoom}px` }}>
                    TRANSACTIONS
                  </span>
                  <span
                    className="inline-block bg-[#cccccc]"
                    style={{
                      width: `${0.5 * zoom}px`,
                      height: `${10.7 * zoom}px`,
                      marginLeft: `${7.5 * zoom}px`,
                      marginRight: `${7.5 * zoom}px`,
                    }}
                  />
                  <span className="text-[#888888]" style={{ fontSize: `${7 * zoom}px` }}>
                    {content.match(/From .+?(?=\s{2,}|Date of Generation)/)?.[0] || "From 01 Oct 2025 to 24 Oct 2026"}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-[#888888]" style={{ fontSize: `${7 * zoom}px` }}>
                    Date of Generation:&nbsp;
                  </span>
                  <span className="text-[#0a0a0a]" style={{ fontSize: `${6 * zoom}px` }}>
                    {content.match(/Date of Generation:\s*(.+?)\s*\|/)?.[1] || "25 Oct 2026"}
                  </span>
                  <span
                    className="inline-block bg-[#cccccc]"
                    style={{
                      width: `${0.5 * zoom}px`,
                      height: `${10.7 * zoom}px`,
                      marginLeft: `${8.5 * zoom}px`,
                      marginRight: `${8.5 * zoom}px`,
                    }}
                  />
                  <span className="text-[#888888]" style={{ fontSize: `${7 * zoom}px` }}>
                    Currency:&nbsp;
                  </span>
                  <span className="text-[#0a0a0a]" style={{ fontSize: `${6 * zoom}px` }}>
                    {content.match(/Currency:\s*(\S+)/)?.[1] || "BDT"}
                  </span>
                </div>
              </div>
            ) : content.includes("VERIFY THIS STATEMENT") ? (
              <div className="flex items-baseline whitespace-nowrap overflow-hidden" style={{ gap: `${4 * zoom}px` }}>
                <span className="font-bold text-black" style={{ fontSize: `${6 * zoom}px` }}>
                  VERIFY THIS STATEMENT
                </span>
                <span className="text-[#888888] font-normal" style={{ fontSize: `${5 * zoom}px` }}>
                  Valid for 6 months
                </span>
              </div>
            ) : (
              content
            )}
          </div>
        )}

        {element.type === "shape" && (
          <div className="w-full h-full" />
        )}

        {/* Divider: Supports both horizontal lines and vertical column separators */}
        {element.type === "divider" && (
          element.height > element.width ? (
            <div
              className="h-full mx-auto border-l"
              style={{
                borderColor: style.borderColor || "#ececec",
                borderWidth: `${(style.borderWidth || 0.5) * zoom}px`,
              }}
            />
          ) : (
            <div
              className="w-full my-auto border-t"
              style={{
                borderColor: style.borderColor || "#ed1c24",
                borderWidth: `${(style.borderWidth || 0.5) * zoom}px`,
              }}
            />
          )
        )}

        {/* QR Code: Uses the exact extracted dot-matrix QR image from Reference PDF */}
        {element.type === "qr_code" && (
          <div className="w-full h-full flex items-center justify-center bg-white relative">
            <img
              src="/images/ref-Im3.png"
              alt="Verification QR Code"
              className="w-full h-full object-contain pointer-events-none select-none"
            />
          </div>
        )}
      </div>

      {/* Selected Transform Handles & Tooltip */}
      {isSelected && !element.locked && (
        <>
          {/* Dimension badge */}
          <div className="absolute -top-6 left-0 bg-neutral-900 text-white text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap font-mono z-40">
            {fromPoints(element.x, unit)}{unit}, {fromPoints(element.y, unit)}{unit} | {fromPoints(element.width, unit)} × {fromPoints(element.height, unit)}{unit}
          </div>

          {/* 8 Handles */}
          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => {
            let posClass = "";
            if (handle === "nw") posClass = "-top-1 -left-1 cursor-nwse-resize";
            if (handle === "n") posClass = "-top-1 left-1/2 -translate-x-1/2 cursor-ns-resize";
            if (handle === "ne") posClass = "-top-1 -right-1 cursor-nesw-resize";
            if (handle === "e") posClass = "top-1/2 -right-1 -translate-y-1/2 cursor-ew-resize";
            if (handle === "se") posClass = "-bottom-1 -right-1 cursor-nwse-resize";
            if (handle === "s") posClass = "-bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize";
            if (handle === "sw") posClass = "-bottom-1 -left-1 cursor-nesw-resize";
            if (handle === "w") posClass = "top-1/2 -left-1 -translate-y-1/2 cursor-ew-resize";

            return (
              <div
                key={handle}
                onMouseDown={(e) => handleResizeStart(e, handle)}
                className={`absolute w-2.5 h-2.5 bg-white border-2 border-blue-600 rounded-sm z-40 shadow-sm ${posClass}`}
              />
            );
          })}
        </>
      )}
    </div>
  );
};
