"use client";

import React from "react";
import { DocumentTemplate } from "@/types/template";
import {
  FileText,
  Sliders,
  Eye,
  Download,
  FolderOpen,
  Layers,
  Save,
  Check,
  ChevronDown,
  Upload,
} from "lucide-react";

type ViewMode = "editor" | "form" | "preview";

const MODES: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: "form", label: "Edit & Preview", icon: Sliders },
  { id: "editor", label: "Layout", icon: Layers },
  { id: "preview", label: "Full PDF", icon: Eye },
];

interface StudioHeaderProps {
  template: DocumentTemplate;
  templates: DocumentTemplate[];
  onSelectTemplate: (t: DocumentTemplate) => void;
  activeView: "editor" | "form" | "preview";
  setActiveView: (view: "editor" | "form" | "preview") => void;
  onOpenTemplateManager: () => void;
  onOpenImportPdfModal: () => void;
  onExportPdf: () => void;
  onSaveTemplate: () => void;
  isSaving: boolean;
  hasSaved: boolean;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  template,
  templates,
  onSelectTemplate,
  activeView,
  setActiveView,
  onOpenTemplateManager,
  onOpenImportPdfModal,
  onExportPdf,
  onSaveTemplate,
  isSaving,
  hasSaved,
}) => {
  return (
    <header className="h-14 shrink-0 bg-white border-b border-neutral-200 px-3 sm:px-4 gap-3 flex items-center justify-between z-30 select-none shadow-2xs whitespace-nowrap overflow-x-auto">
      {/* Left: Branding & Template Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-tight text-neutral-900 flex items-center gap-1.5">
              <span>GTPdfStudio</span>
              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded font-semibold uppercase">
                Pro
              </span>
            </div>
            <div className="hidden xl:block text-[10px] text-neutral-500 font-mono -mt-0.5">
              Vector PDF Engine v1.0
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-neutral-200" />

        {/* Template Selector */}
        <div className="relative group">
          <select
            value={template.id}
            onChange={(e) => {
              const selected = templates.find((t) => t.id === e.target.value);
              if (selected) onSelectTemplate(selected);
            }}
            className="appearance-none bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 text-xs font-semibold py-1.5 pl-3 pr-8 rounded-md cursor-pointer outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <button
          onClick={onOpenTemplateManager}
          title="Open Template Manager"
          className="flex items-center gap-1 px-2.5 py-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md text-xs font-medium border border-neutral-200"
        >
          <FolderOpen className="w-3.5 h-3.5 text-neutral-500" />
          <span className="hidden sm:inline">Templates</span>
        </button>
      </div>

      {/* Middle: Mode Switcher Tabs */}
      <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeView === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setActiveView(mode.id)}
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                isActive ? "bg-white text-blue-700 shadow-xs" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{mode.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenImportPdfModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-semibold border border-blue-200 transition-colors"
          title="Import and extract data from existing statement PDF"
        >
          <Upload className="w-3.5 h-3.5 text-blue-600" />
          <span className="hidden lg:inline">Import PDF</span>
        </button>

        <button
          onClick={onSaveTemplate}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md text-xs font-semibold border border-neutral-300 transition-colors"
        >
          {hasSaved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 text-neutral-600" />
              <span className="hidden lg:inline">Save</span>
            </>
          )}
        </button>

        <button
          onClick={onExportPdf}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-bold shadow-xs transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export PDF</span>
        </button>
      </div>
    </header>
  );
};
