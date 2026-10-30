"use client";

import React from "react";
import { CanvasElement, DocumentTemplate, UnitType } from "@/types/template";
import { fromPoints, toPoints } from "@/lib/units";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Sliders,
  Maximize,
  Layers,
  Settings,
  Plus,
  Trash2,
} from "lucide-react";

interface PropertyPanelProps {
  element: CanvasElement | null;
  template: DocumentTemplate;
  unit: UnitType;
  onUpdateElement: (updates: Partial<CanvasElement>) => void;
  onUpdatePageSettings: (settings: Partial<DocumentTemplate["pageSettings"]>) => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  element,
  template,
  unit,
  onUpdateElement,
  onUpdatePageSettings,
}) => {
  if (!element) {
    // Show Page & Document Settings
    const ps = template.pageSettings;
    return (
      <aside className="w-72 bg-white border-l border-neutral-200 flex flex-col h-full text-xs select-none p-3 overflow-y-auto">
        <div className="flex items-center gap-1.5 font-bold text-sm text-neutral-800 pb-2 border-b border-neutral-200 mb-3">
          <Settings className="w-4 h-4 text-neutral-600" />
          <span>Page & Document Settings</span>
        </div>

        <div className="space-y-4">
          {/* Preset Size */}
          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
              Page Preset
            </label>
            <select
              value={ps.size}
              onChange={(e) => {
                const s = e.target.value as any;
                let w = ps.width;
                let h = ps.height;
                if (s === "A4") {
                  w = ps.orientation === "portrait" ? 595.28 : 841.89;
                  h = ps.orientation === "portrait" ? 841.89 : 595.28;
                } else if (s === "LETTER") {
                  w = ps.orientation === "portrait" ? 612 : 792;
                  h = ps.orientation === "portrait" ? 792 : 612;
                }
                onUpdatePageSettings({ size: s, width: w, height: h });
              }}
              className="w-full p-1.5 border border-neutral-300 rounded bg-white text-xs"
            >
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="LETTER">Letter (8.5 × 11 in)</option>
              <option value="LEGAL">Legal (8.5 × 14 in)</option>
              <option value="CUSTOM">Custom Dimensions</option>
            </select>
          </div>

          {/* Orientation */}
          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
              Orientation
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (ps.orientation !== "portrait") {
                    onUpdatePageSettings({
                      orientation: "portrait",
                      width: Math.min(ps.width, ps.height),
                      height: Math.max(ps.width, ps.height),
                    });
                  }
                }}
                className={`py-1.5 px-2 border rounded font-medium ${
                  ps.orientation === "portrait"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "border-neutral-300 bg-white hover:bg-neutral-50"
                }`}
              >
                Portrait
              </button>
              <button
                type="button"
                onClick={() => {
                  if (ps.orientation !== "landscape") {
                    onUpdatePageSettings({
                      orientation: "landscape",
                      width: Math.max(ps.width, ps.height),
                      height: Math.min(ps.width, ps.height),
                    });
                  }
                }}
                className={`py-1.5 px-2 border rounded font-medium ${
                  ps.orientation === "landscape"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "border-neutral-300 bg-white hover:bg-neutral-50"
                }`}
              >
                Landscape
              </button>
            </div>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-neutral-500 mb-0.5">Width ({unit})</label>
              <input
                type="number"
                value={fromPoints(ps.width, unit)}
                onChange={(e) => {
                  const val = toPoints(parseFloat(e.target.value) || 0, unit);
                  onUpdatePageSettings({ width: val, size: "CUSTOM" });
                }}
                className="w-full p-1.5 border border-neutral-300 rounded font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] text-neutral-500 mb-0.5">Height ({unit})</label>
              <input
                type="number"
                value={fromPoints(ps.height, unit)}
                onChange={(e) => {
                  const val = toPoints(parseFloat(e.target.value) || 0, unit);
                  onUpdatePageSettings({ height: val, size: "CUSTOM" });
                }}
                className="w-full p-1.5 border border-neutral-300 rounded font-mono text-xs"
              />
            </div>
          </div>

          {/* Margins */}
          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
              Page Margins ({unit})
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-neutral-500">Top</span>
                <input
                  type="number"
                  value={fromPoints(ps.margins.top, unit)}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...ps.margins, top: toPoints(parseFloat(e.target.value) || 0, unit) },
                    })
                  }
                  className="w-full p-1 border border-neutral-300 rounded font-mono text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-500">Bottom</span>
                <input
                  type="number"
                  value={fromPoints(ps.margins.bottom, unit)}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...ps.margins, bottom: toPoints(parseFloat(e.target.value) || 0, unit) },
                    })
                  }
                  className="w-full p-1 border border-neutral-300 rounded font-mono text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-500">Left</span>
                <input
                  type="number"
                  value={fromPoints(ps.margins.left, unit)}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...ps.margins, left: toPoints(parseFloat(e.target.value) || 0, unit) },
                    })
                  }
                  className="w-full p-1 border border-neutral-300 rounded font-mono text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-500">Right</span>
                <input
                  type="number"
                  value={fromPoints(ps.margins.right, unit)}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...ps.margins, right: toPoints(parseFloat(e.target.value) || 0, unit) },
                    })
                  }
                  className="w-full p-1 border border-neutral-300 rounded font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Background Color */}
          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
              Page Background
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={ps.backgroundColor || "#ffffff"}
                onChange={(e) => onUpdatePageSettings({ backgroundColor: e.target.value })}
                className="w-8 h-8 rounded border border-neutral-300 cursor-pointer"
              />
              <input
                type="text"
                value={ps.backgroundColor || "#ffffff"}
                onChange={(e) => onUpdatePageSettings({ backgroundColor: e.target.value })}
                className="flex-1 p-1.5 border border-neutral-300 rounded font-mono text-xs uppercase"
              />
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const s = element.style;

  return (
    <aside className="w-72 bg-white border-l border-neutral-200 flex flex-col h-full text-xs select-none p-3 overflow-y-auto space-y-4">
      {/* Element Header */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
        <div>
          <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
            {element.type} element
          </span>
          <input
            type="text"
            value={element.name}
            onChange={(e) => onUpdateElement({ name: e.target.value })}
            className="font-bold text-sm text-neutral-900 border-b border-transparent hover:border-neutral-300 focus:border-blue-500 outline-hidden px-0.5"
          />
        </div>
      </div>

      {/* Geometry (X, Y, W, H) */}
      <div>
        <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
          Position & Size ({unit})
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-neutral-500">X</span>
            <input
              type="number"
              value={fromPoints(element.x, unit)}
              onChange={(e) => onUpdateElement({ x: toPoints(parseFloat(e.target.value) || 0, unit) })}
              className="w-full p-1.5 border border-neutral-300 rounded font-mono text-xs"
            />
          </div>
          <div>
            <span className="text-[10px] text-neutral-500">Y</span>
            <input
              type="number"
              value={fromPoints(element.y, unit)}
              onChange={(e) => onUpdateElement({ y: toPoints(parseFloat(e.target.value) || 0, unit) })}
              className="w-full p-1.5 border border-neutral-300 rounded font-mono text-xs"
            />
          </div>
          <div>
            <span className="text-[10px] text-neutral-500">Width</span>
            <input
              type="number"
              value={fromPoints(element.width, unit)}
              onChange={(e) => onUpdateElement({ width: toPoints(parseFloat(e.target.value) || 0, unit) })}
              className="w-full p-1.5 border border-neutral-300 rounded font-mono text-xs"
            />
          </div>
          <div>
            <span className="text-[10px] text-neutral-500">Height</span>
            <input
              type="number"
              value={fromPoints(element.height, unit)}
              onChange={(e) => onUpdateElement({ height: toPoints(parseFloat(e.target.value) || 0, unit) })}
              className="w-full p-1.5 border border-neutral-300 rounded font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* Page Target */}
      <div>
        <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
          Render On Pages
        </label>
        <select
          value={element.pageTarget || "all"}
          onChange={(e) => onUpdateElement({ pageTarget: e.target.value as any })}
          className="w-full p-1.5 border border-neutral-300 rounded bg-white text-xs"
        >
          <option value="all">All Pages (Recurring)</option>
          <option value="first">First Page Only</option>
          <option value="subsequent">Subsequent Pages (2..N)</option>
          <option value="last">Last Page Only</option>
        </select>
      </div>

      {/* Text Content & Typography */}
      {element.type === "text" && (
        <>
          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
              Text Template Content
            </label>
            <textarea
              rows={3}
              value={element.content || ""}
              onChange={(e) => onUpdateElement({ content: e.target.value })}
              placeholder="Enter text or {{variables}}..."
              className="w-full p-2 border border-neutral-300 rounded text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
              Typography
            </label>
            <div className="space-y-2">
              <select
                value={s.fontFamily || "Helvetica"}
                onChange={(e) => onUpdateElement({ style: { ...s, fontFamily: e.target.value } })}
                className="w-full p-1.5 border border-neutral-300 rounded bg-white text-xs"
              >
                <option value="Helvetica">Helvetica (Sans-Serif)</option>
                <option value="Times-Roman">Times New Roman (Serif)</option>
                <option value="Courier">Courier (Monospace)</option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-neutral-500">Size (pt)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={s.fontSize || 9}
                    onChange={(e) =>
                      onUpdateElement({ style: { ...s, fontSize: parseFloat(e.target.value) || 9 } })
                    }
                    className="w-full p-1 border border-neutral-300 rounded font-mono text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500">Line Height</span>
                  <input
                    type="number"
                    step="0.1"
                    value={s.lineHeight || 1.25}
                    onChange={(e) =>
                      onUpdateElement({ style: { ...s, lineHeight: parseFloat(e.target.value) || 1.25 } })
                    }
                    className="w-full p-1 border border-neutral-300 rounded font-mono text-xs"
                  />
                </div>
              </div>

              {/* Bold, Italic & Align */}
              <div className="flex items-center gap-1 border border-neutral-300 rounded p-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateElement({
                      style: { ...s, fontWeight: s.fontWeight === "bold" ? "normal" : "bold" },
                    })
                  }
                  className={`p-1 rounded ${s.fontWeight === "bold" ? "bg-neutral-200" : "hover:bg-neutral-100"}`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateElement({
                      style: { ...s, fontStyle: s.fontStyle === "italic" ? "normal" : "italic" },
                    })
                  }
                  className={`p-1 rounded ${s.fontStyle === "italic" ? "bg-neutral-200" : "hover:bg-neutral-100"}`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <div className="h-4 w-px bg-neutral-200 mx-1" />
                {(["left", "center", "right", "justify"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => onUpdateElement({ style: { ...s, textAlign: align } })}
                    className={`p-1 rounded ${s.textAlign === align ? "bg-neutral-200" : "hover:bg-neutral-100"}`}
                  >
                    {align === "left" && <AlignLeft className="w-3.5 h-3.5" />}
                    {align === "center" && <AlignCenter className="w-3.5 h-3.5" />}
                    {align === "right" && <AlignRight className="w-3.5 h-3.5" />}
                    {align === "justify" && <AlignJustify className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>

              {/* Text Color */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.color || "#000000"}
                  onChange={(e) => onUpdateElement({ style: { ...s, color: e.target.value } })}
                  className="w-7 h-7 rounded border border-neutral-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={s.color || "#000000"}
                  onChange={(e) => onUpdateElement({ style: { ...s, color: e.target.value } })}
                  className="flex-1 p-1 border border-neutral-300 rounded font-mono text-xs uppercase"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* QR Code configuration */}
      {element.type === "qr_code" && (
        <div>
          <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
            QR Content Template
          </label>
          <textarea
            rows={2}
            value={element.qrData || ""}
            onChange={(e) => onUpdateElement({ qrData: e.target.value })}
            placeholder="URL or {{verifyUrl}}..."
            className="w-full p-2 border border-neutral-300 rounded text-xs font-mono"
          />
        </div>
      )}

      {/* Table Columns Editor */}
      {element.type === "table" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-neutral-700">
              Table Columns ({(element.tableColumns || []).length})
            </label>
            <button
              type="button"
              onClick={() => {
                const cols = element.tableColumns || [];
                const newCol = {
                  id: `col-${Date.now()}`,
                  label: "NEW COL",
                  key: "newKey",
                  width: 50,
                  align: "left" as const,
                };
                onUpdateElement({ tableColumns: [...cols, newCol] });
              }}
              className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold"
            >
              <Plus className="w-3 h-3" />
              <span>Add Column</span>
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {(element.tableColumns || []).map((col, idx) => (
              <div key={col.id} className="p-2 border border-neutral-200 rounded bg-neutral-50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[10px] text-neutral-600">Column {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const cols = (element.tableColumns || []).filter((c) => c.id !== col.id);
                      onUpdateElement({ tableColumns: cols });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={col.label}
                    placeholder="Label"
                    onChange={(e) => {
                      const cols = [...(element.tableColumns || [])];
                      cols[idx] = { ...cols[idx], label: e.target.value };
                      onUpdateElement({ tableColumns: cols });
                    }}
                    className="p-1 border border-neutral-300 rounded bg-white text-xs"
                  />
                  <input
                    type="text"
                    value={col.key}
                    placeholder="Data Key"
                    onChange={(e) => {
                      const cols = [...(element.tableColumns || [])];
                      cols[idx] = { ...cols[idx], key: e.target.value };
                      onUpdateElement({ tableColumns: cols });
                    }}
                    className="p-1 border border-neutral-300 rounded bg-white text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    value={col.width}
                    placeholder="Width (pt)"
                    onChange={(e) => {
                      const cols = [...(element.tableColumns || [])];
                      cols[idx] = { ...cols[idx], width: parseFloat(e.target.value) || 30 };
                      onUpdateElement({ tableColumns: cols });
                    }}
                    className="p-1 border border-neutral-300 rounded bg-white text-xs font-mono"
                  />
                  <select
                    value={col.align}
                    onChange={(e) => {
                      const cols = [...(element.tableColumns || [])];
                      cols[idx] = { ...cols[idx], align: e.target.value as any };
                      onUpdateElement({ tableColumns: cols });
                    }}
                    className="p-1 border border-neutral-300 rounded bg-white text-xs"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[10px] text-neutral-500 mb-0.5">Table Data Key</label>
            <input
              type="text"
              value={element.tableDataKey || ""}
              onChange={(e) => onUpdateElement({ tableDataKey: e.target.value })}
              className="w-full p-1 border border-neutral-300 rounded font-mono text-xs"
            />
          </div>
        </div>
      )}

      {/* Box Styling: Background, Border, Radius */}
      <div>
        <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
          Borders & Background
        </label>
        <div className="space-y-2">
          {/* Background color */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500 w-16">Fill:</span>
            <input
              type="color"
              value={s.backgroundColor || "#ffffff"}
              onChange={(e) => onUpdateElement({ style: { ...s, backgroundColor: e.target.value } })}
              className="w-6 h-6 rounded border border-neutral-300 cursor-pointer"
            />
            <input
              type="text"
              value={s.backgroundColor || "transparent"}
              onChange={(e) => onUpdateElement({ style: { ...s, backgroundColor: e.target.value } })}
              className="flex-1 p-1 border border-neutral-300 rounded font-mono text-xs uppercase"
            />
          </div>

          {/* Border color */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500 w-16">Border:</span>
            <input
              type="color"
              value={s.borderColor || "#000000"}
              onChange={(e) => onUpdateElement({ style: { ...s, borderColor: e.target.value } })}
              className="w-6 h-6 rounded border border-neutral-300 cursor-pointer"
            />
            <input
              type="number"
              step="0.5"
              value={s.borderWidth || 0}
              placeholder="Width"
              onChange={(e) =>
                onUpdateElement({ style: { ...s, borderWidth: parseFloat(e.target.value) || 0 } })
              }
              className="w-16 p-1 border border-neutral-300 rounded font-mono text-xs"
            />
          </div>

          {/* Corner radius */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500 w-16">Radius:</span>
            <input
              type="number"
              value={s.borderRadius || 0}
              onChange={(e) =>
                onUpdateElement({ style: { ...s, borderRadius: parseFloat(e.target.value) || 0 } })
              }
              className="flex-1 p-1 border border-neutral-300 rounded font-mono text-xs"
            />
          </div>
        </div>
      </div>
    </aside>
  );
};
