"use client";

import React from "react";

interface GuideLinesProps {
  pageWidth: number;
  pageHeight: number;
  zoom: number;
  margins: { top: number; right: number; bottom: number; left: number };
  showGrid?: boolean;
  gridSize?: number;
}

export const GuideLines: React.FC<GuideLinesProps> = ({
  pageWidth,
  pageHeight,
  zoom,
  margins,
  showGrid = true,
  gridSize = 20,
}) => {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: pageWidth * zoom, height: pageHeight * zoom }}
    >
      {/* Grid dots */}
      {showGrid && (
        <svg
          className="w-full h-full opacity-40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid-dots"
              width={gridSize * zoom}
              height={gridSize * zoom}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={1}
                cy={1}
                r={1}
                fill="#cbd5e1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-dots)" />
        </svg>
      )}

      {/* Margins Outline */}
      <div
        className="absolute border border-dashed border-blue-300 opacity-60"
        style={{
          top: margins.top * zoom,
          left: margins.left * zoom,
          width: (pageWidth - margins.left - margins.right) * zoom,
          height: (pageHeight - margins.top - margins.bottom) * zoom,
        }}
      />

      {/* Page Center Indicators */}
      <div
        className="absolute top-0 bottom-0 border-l border-dashed border-red-300 opacity-30"
        style={{ left: (pageWidth / 2) * zoom }}
      />
      <div
        className="absolute left-0 right-0 border-t border-dashed border-red-300 opacity-30"
        style={{ top: (pageHeight / 2) * zoom }}
      />
    </div>
  );
};
