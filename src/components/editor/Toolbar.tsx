"use client";

import React from "react";
import { UnitType } from "@/types/template";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  Grid,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sliders,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

interface ToolbarProps {
  zoom: number;
  setZoom: (z: number) => void;
  unit: UnitType;
  setUnit: (u: UnitType) => void;
  showGrid: boolean;
  setShowGrid: (s: boolean) => void;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (p: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedElementId: string | null;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onAlignElement: (align: "left" | "center" | "right") => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  zoom,
  setZoom,
  unit,
  setUnit,
  showGrid,
  setShowGrid,
  currentPage,
  totalPages,
  setCurrentPage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedElementId,
  onDeleteSelected,
  onDuplicateSelected,
  onFitWidth,
  onFitPage,
  onAlignElement,
}) => {
  return (
    <div className="h-12 bg-white border-b border-neutral-200 px-4 flex items-center justify-between text-neutral-700 text-sm select-none shadow-xs">
      {/* Left: History & Selection Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z / Cmd+Z)"
          className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z)"
          className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-neutral-200 mx-1" />

        <button
          onClick={onDuplicateSelected}
          disabled={!selectedElementId}
          title="Duplicate Element (Cmd+D)"
          className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={onDeleteSelected}
          disabled={!selectedElementId}
          title="Delete Element (Del / Backspace)"
          className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-neutral-200 mx-1" />

        {/* Quick alignment for selected element */}
        <button
          onClick={() => onAlignElement("left")}
          disabled={!selectedElementId}
          title="Align Left"
          className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAlignElement("center")}
          disabled={!selectedElementId}
          title="Align Center"
          className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAlignElement("right")}
          disabled={!selectedElementId}
          title="Align Right"
          className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30"
        >
          <AlignRight className="w-4 h-4" />
        </button>
      </div>

      {/* Middle: Page Switcher */}
      <div className="flex items-center gap-2 bg-neutral-100 px-2.5 py-1 rounded-md border border-neutral-200">
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-neutral-200 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-medium text-xs text-neutral-800">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="p-1 rounded hover:bg-neutral-200 disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Grid, Unit, Zoom Controls */}
      <div className="flex items-center gap-2">
        {/* Grid toggle */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Grid (G)"
          className={`p-1.5 rounded border ${
            showGrid ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          <Grid className="w-4 h-4" />
        </button>

        {/* Unit Selector */}
        <div className="flex items-center border border-neutral-300 rounded overflow-hidden text-xs">
          {(["pt", "mm", "px"] as UnitType[]).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-2 py-1 font-mono uppercase transition-colors ${
                unit === u
                  ? "bg-neutral-800 text-white font-bold"
                  : "bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-neutral-200 mx-1" />

        {/* Zoom */}
        <button
          onClick={() => setZoom(Math.max(0.3, zoom - 0.1))}
          className="p-1.5 rounded hover:bg-neutral-100"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="font-mono text-xs w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(Math.min(2.5, zoom + 0.1))}
          className="p-1.5 rounded hover:bg-neutral-100"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={onFitWidth}
          className="p-1.5 rounded hover:bg-neutral-100 text-xs flex items-center gap-1 border border-neutral-200"
          title="Fit Width"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Fit</span>
        </button>
      </div>
    </div>
  );
};
