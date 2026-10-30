"use client";

import React, { useState } from "react";
import { CanvasElement, DocumentTemplate, ElementType } from "@/types/template";
import {
  Type,
  Square,
  Minus,
  QrCode,
  Table,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Layers,
  Variable,
  FileText,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface LayerPanelProps {
  template: DocumentTemplate;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddElement: (type: ElementType) => void;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  onDeleteElement: (id: string) => void;
  onReorderElement: (id: string, direction: "up" | "down") => void;
  currentPage: number;
  totalPages: number;
  onSetCurrentPage: (p: number) => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  template,
  selectedId,
  onSelect,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
  onReorderElement,
  currentPage,
  totalPages,
  onSetCurrentPage,
}) => {
  const [activeTab, setActiveTab] = useState<"layers" | "variables" | "pages">("layers");

  const getIcon = (type: ElementType) => {
    switch (type) {
      case "text":
        return <Type className="w-3.5 h-3.5 text-blue-600" />;
      case "shape":
        return <Square className="w-3.5 h-3.5 text-purple-600" />;
      case "divider":
        return <Minus className="w-3.5 h-3.5 text-emerald-600" />;
      case "qr_code":
        return <QrCode className="w-3.5 h-3.5 text-amber-600" />;
      case "table":
        return <Table className="w-3.5 h-3.5 text-indigo-600" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-neutral-500" />;
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col h-full text-xs select-none">
      {/* Panel Tabs */}
      <div className="flex border-b border-neutral-200 bg-neutral-50">
        <button
          onClick={() => setActiveTab("layers")}
          className={`flex-1 py-2 px-2 flex items-center justify-center gap-1.5 font-medium border-b-2 transition-colors ${
            activeTab === "layers"
              ? "border-blue-600 text-blue-600 bg-white"
              : "border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Layers</span>
        </button>
        <button
          onClick={() => setActiveTab("variables")}
          className={`flex-1 py-2 px-2 flex items-center justify-center gap-1.5 font-medium border-b-2 transition-colors ${
            activeTab === "variables"
              ? "border-blue-600 text-blue-600 bg-white"
              : "border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          <Variable className="w-3.5 h-3.5" />
          <span>Fields</span>
        </button>
        <button
          onClick={() => setActiveTab("pages")}
          className={`flex-1 py-2 px-2 flex items-center justify-center gap-1.5 font-medium border-b-2 transition-colors ${
            activeTab === "pages"
              ? "border-blue-600 text-blue-600 bg-white"
              : "border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Pages</span>
        </button>
      </div>

      {/* TAB 1: LAYERS */}
      {activeTab === "layers" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Quick Add Elements Palette */}
          <div className="p-2 border-b border-neutral-200 bg-neutral-50/50">
            <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
              Insert Element
            </div>
            <div className="grid grid-cols-5 gap-1">
              <button
                onClick={() => onAddElement("text")}
                title="Add Text Block"
                className="flex flex-col items-center justify-center p-1.5 rounded bg-white border border-neutral-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors shadow-2xs"
              >
                <Type className="w-4 h-4 text-neutral-700" />
                <span className="text-[9px] mt-0.5">Text</span>
              </button>
              <button
                onClick={() => onAddElement("shape")}
                title="Add Box / Shape"
                className="flex flex-col items-center justify-center p-1.5 rounded bg-white border border-neutral-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors shadow-2xs"
              >
                <Square className="w-4 h-4 text-neutral-700" />
                <span className="text-[9px] mt-0.5">Box</span>
              </button>
              <button
                onClick={() => onAddElement("divider")}
                title="Add Line / Divider"
                className="flex flex-col items-center justify-center p-1.5 rounded bg-white border border-neutral-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors shadow-2xs"
              >
                <Minus className="w-4 h-4 text-neutral-700" />
                <span className="text-[9px] mt-0.5">Line</span>
              </button>
              <button
                onClick={() => onAddElement("qr_code")}
                title="Add Verification QR"
                className="flex flex-col items-center justify-center p-1.5 rounded bg-white border border-neutral-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors shadow-2xs"
              >
                <QrCode className="w-4 h-4 text-neutral-700" />
                <span className="text-[9px] mt-0.5">QR</span>
              </button>
              <button
                onClick={() => onAddElement("table")}
                title="Add Dynamic Table"
                className="flex flex-col items-center justify-center p-1.5 rounded bg-white border border-neutral-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors shadow-2xs"
              >
                <Table className="w-4 h-4 text-neutral-700" />
                <span className="text-[9px] mt-0.5">Table</span>
              </button>
            </div>
          </div>

          {/* Layer List */}
          <div className="flex-1 overflow-y-auto p-1 divide-y divide-neutral-100">
            {template.elements.map((el, index) => {
              const isSelected = el.id === selectedId;
              return (
                <div
                  key={el.id}
                  onClick={() => onSelect(el.id)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group transition-colors ${
                    isSelected
                      ? "bg-blue-50 text-blue-900 font-medium"
                      : "hover:bg-neutral-100 text-neutral-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate flex-1 mr-1">
                    {getIcon(el.type)}
                    <span className="truncate text-xs">{el.name || el.type}</span>
                  </div>

                  {/* Actions: Visibility, Lock, Reorder */}
                  <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateElement(el.id, { hidden: !el.hidden });
                      }}
                      title={el.hidden ? "Unhide" : "Hide"}
                      className="p-1 hover:text-blue-600 rounded"
                    >
                      {el.hidden ? (
                        <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-neutral-600" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateElement(el.id, { locked: !el.locked });
                      }}
                      title={el.locked ? "Unlock" : "Lock"}
                      className="p-1 hover:text-blue-600 rounded"
                    >
                      {el.locked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-neutral-400" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorderElement(el.id, "up");
                      }}
                      disabled={index === 0}
                      title="Move Up"
                      className="p-0.5 hover:text-blue-600 disabled:opacity-20"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorderElement(el.id, "down");
                      }}
                      disabled={index === template.elements.length - 1}
                      title="Move Down"
                      className="p-0.5 hover:text-blue-600 disabled:opacity-20"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: VARIABLES */}
      {activeTab === "variables" && (
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Dynamic Schema Variables
          </div>
          <p className="text-[11px] text-neutral-500 mb-3 leading-relaxed">
            Click any variable below to copy its tag or bind it to text.
          </p>
          <div className="space-y-1.5">
            {template.fields.map((f) => (
              <div
                key={f.id}
                onClick={() => {
                  navigator.clipboard.writeText(`{{${f.key}}}`);
                }}
                className="p-1.5 bg-neutral-50 border border-neutral-200 rounded hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-800 text-[11px]">{f.label}</span>
                  <span className="text-[9px] bg-neutral-200 text-neutral-700 px-1 rounded uppercase font-mono">
                    {f.type}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-blue-600 mt-0.5 truncate">
                  {"{{" + f.key + "}}"}
                </div>
              </div>
            ))}

            <div className="pt-2 border-t border-neutral-200">
              <div className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">
                System Context
              </div>
              <div className="space-y-1 font-mono text-[10px] text-neutral-600">
                <div className="p-1 bg-neutral-100 rounded">{"{{pageNumber}}"} - Current Page</div>
                <div className="p-1 bg-neutral-100 rounded">{"{{totalPages}}"} - Total Pages</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PAGES */}
      {activeTab === "pages" && (
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Document Pages ({totalPages})
          </div>
          <div className="space-y-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const isCurrent = p === currentPage;
              return (
                <div
                  key={p}
                  onClick={() => onSetCurrentPage(p)}
                  className={`p-2.5 rounded-md border flex items-center justify-between cursor-pointer transition-all ${
                    isCurrent
                      ? "bg-blue-50 border-blue-500 text-blue-900 shadow-xs"
                      : "bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-8 bg-neutral-100 border border-neutral-300 rounded-xs flex items-center justify-center font-mono text-[9px] font-bold">
                      {p}
                    </div>
                    <div>
                      <div className="font-semibold text-xs">Page {p}</div>
                      <div className="text-[10px] text-neutral-500">
                        {p === 1 ? "First Page Header & Summary" : p === totalPages ? "Final Page & End Note" : "Ledger Continuation"}
                      </div>
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
};
