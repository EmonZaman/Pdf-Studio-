"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { DocumentTemplate, DocumentData, CanvasElement, UnitType } from "@/types/template";
import { DEFAULT_TEMPLATES } from "@/lib/templates";
import { computeDocumentLayout } from "@/lib/engine/layout";
import { generatePdf } from "@/lib/engine/pdf-generator";
import { StudioHeader, ViewMode } from "@/components/editor/StudioHeader";
import { StatementHistory } from "@/components/history/StatementHistory";
import type { StatementHistoryEntry } from "@/lib/history-storage";
import { Toolbar } from "@/components/editor/Toolbar";
import { LayerPanel } from "@/components/editor/LayerPanel";
import { Canvas } from "@/components/editor/Canvas";
import { PropertyPanel } from "@/components/editor/PropertyPanel";
import { DynamicDataForm } from "@/components/forms/DynamicDataForm";
import { LivePdfViewer } from "@/components/preview/LivePdfViewer";
import { LivePreviewPane } from "@/components/preview/LivePreviewPane";
import { BatchExportModal } from "@/components/batch/BatchExportModal";
import { TemplateManagerModal } from "@/components/templates/TemplateManagerModal";
import { PdfImportModal } from "@/components/import/PdfImportModal";

export default function StudioPage() {
  // Available templates
  const [templates, setTemplates] = useState<DocumentTemplate[]>(() =>
    Object.values(DEFAULT_TEMPLATES).map((t) => t.template)
  );

  // Active template
  const [template, setTemplate] = useState<DocumentTemplate>(
    DEFAULT_TEMPLATES["city-bank-statement"].template
  );

  // Active data
  const [data, setData] = useState<DocumentData>(
    DEFAULT_TEMPLATES["city-bank-statement"].sampleData
  );

  // Active view mode
  const [activeView, setActiveView] = useState<ViewMode>("form");

  // Saved statement history (server-side) and its loading state
  const [savedStatements, setSavedStatements] = useState<StatementHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Selection & Zoom
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(0.9);
  const [unit, setUnit] = useState<UnitType>("pt");
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modals
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isPdfImportModalOpen, setIsPdfImportModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  // Undo / Redo history
  const [history, setHistory] = useState<DocumentTemplate[]>([template]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isUndoRedoAction = useRef(false);

  // Compute total pages based on template and table rows
  const layout = computeDocumentLayout(template, data);
  const totalPages = Math.max(1, layout.totalPages);

  // Ensure current page does not exceed total pages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Push to history when template changes
  const updateTemplateWithHistory = useCallback((newTemplate: DocumentTemplate) => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    setTemplate(newTemplate);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, newTemplate].slice(-30); // keep last 30
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 29));
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setTemplate(prev);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setTemplate(next);
    }
  }, [history, historyIndex]);

  // Load initial templates from backend API if available
  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch("/api/templates");
        if (res.ok) {
          const json = await res.json();
          if (json.templates && json.templates.length > 0) {
            setTemplates(json.templates);
          }
        }
      } catch (err) {
        console.warn("Could not fetch remote templates, using defaults", err);
      }
    }
    loadTemplates();
  }, []);

  // Switch template handler
  const handleSelectTemplate = (selected: DocumentTemplate) => {
    setTemplate(selected);
    setSelectedId(null);
    setCurrentPage(1);
    setHistory([selected]);
    setHistoryIndex(0);

    // Switch sample data if available
    const found = DEFAULT_TEMPLATES[selected.id];
    if (found) {
      setData(found.sampleData);
    }
  };

  // Update canvas element
  const handleUpdateElement = (id: string, updates: Partial<CanvasElement>) => {
    const updatedElements = template.elements.map((el) => {
      if (el.id === id) {
        return {
          ...el,
          ...updates,
          style: {
            ...el.style,
            ...(updates.style || {}),
          },
        };
      }
      return el;
    });

    updateTemplateWithHistory({
      ...template,
      elements: updatedElements,
      updatedAt: new Date().toISOString(),
    });
  };

  // Add canvas element
  const handleAddElement = (type: any) => {
    const newId = `elem-${Date.now()}`;
    const defaultWidth = type === "table" ? 523 : type === "qr_code" ? 60 : type === "divider" ? 523 : 150;
    const defaultHeight = type === "table" ? 250 : type === "qr_code" ? 60 : type === "divider" ? 1 : 24;

    const newElement: CanvasElement = {
      id: newId,
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type,
      x: template.pageSettings.margins.left,
      y: 100,
      width: defaultWidth,
      height: defaultHeight,
      style: {
        fontSize: 10,
        color: "#111827",
        fontFamily: "Helvetica",
      },
      content: type === "text" ? "New Text Content" : undefined,
      qrData: type === "qr_code" ? "https://example.com" : undefined,
      pageTarget: "all",
    };

    updateTemplateWithHistory({
      ...template,
      elements: [...template.elements, newElement],
    });
    setSelectedId(newId);
  };

  // Delete element
  const handleDeleteElement = (id: string) => {
    const updated = template.elements.filter((el) => el.id !== id);
    updateTemplateWithHistory({
      ...template,
      elements: updated,
    });
    if (selectedId === id) setSelectedId(null);
  };

  // Duplicate element
  const handleDuplicateSelected = () => {
    if (!selectedId) return;
    const orig = template.elements.find((el) => el.id === selectedId);
    if (!orig) return;

    const dupId = `elem-${Date.now()}`;
    const dup: CanvasElement = {
      ...orig,
      id: dupId,
      name: `${orig.name} (Copy)`,
      x: orig.x + 15,
      y: orig.y + 15,
    };

    updateTemplateWithHistory({
      ...template,
      elements: [...template.elements, dup],
    });
    setSelectedId(dupId);
  };

  // Reorder element
  const handleReorderElement = (id: string, direction: "up" | "down") => {
    const idx = template.elements.findIndex((el) => el.id === id);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === template.elements.length - 1) return;

    const newElements = [...template.elements];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const temp = newElements[idx];
    newElements[idx] = newElements[targetIdx];
    newElements[targetIdx] = temp;

    updateTemplateWithHistory({
      ...template,
      elements: newElements,
    });
  };

  // Align element
  const handleAlignElement = (align: "left" | "center" | "right") => {
    if (!selectedId) return;
    const el = template.elements.find((e) => e.id === selectedId);
    if (!el) return;

    const pageW = template.pageSettings.width;
    const margins = template.pageSettings.margins;
    let newX = el.x;

    if (align === "left") {
      newX = margins.left;
    } else if (align === "center") {
      newX = Math.round((pageW - el.width) / 2);
    } else if (align === "right") {
      newX = pageW - margins.right - el.width;
    }

    handleUpdateElement(selectedId, { x: newX });
  };

  // Update page settings
  const handleUpdatePageSettings = (settings: Partial<DocumentTemplate["pageSettings"]>) => {
    updateTemplateWithHistory({
      ...template,
      pageSettings: {
        ...template.pageSettings,
        ...settings,
      },
    });
  };

  // Restore the built-in statement data for the active template
  const handleResetData = () => {
    const sample = DEFAULT_TEMPLATES[template.id]?.sampleData;
    if (!sample) return;
    if (!window.confirm("Reset all fields and ledger rows to the original statement data?")) return;
    setData(JSON.parse(JSON.stringify(sample)));
    setCurrentPage(1);
  };

  // Export PDF directly
  const handleExportPdf = async () => {
    try {
      const bytes = await generatePdf(template, data);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      recordStatement();
    } catch (err) {
      alert("Failed to export PDF: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // ---- Statement history ----
  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const json = await res.json();
      if (json.success) setSavedStatements(json.entries);
    } catch (err) {
      console.error("Could not load history", err);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  // Every export is saved so the statement can be reopened later
  const recordStatement = async () => {
    const accountName = String(data.customerName || "");
    const accountNo = String(data.accountNo || "");
    const period = [data.openingDate, data.statementEndDate].filter(Boolean).join(" to ");
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: [accountName, accountNo, data.statementEndDate].filter(Boolean).join(" · ") || template.name,
          templateId: template.id,
          bankName: template.name,
          accountName,
          accountNo,
          period,
          data,
        }),
      });
      if (!res.ok) throw new Error(`History save failed (${res.status})`);
    } catch (err) {
      console.error("Could not record statement in history", err);
    }
  };

  const handleOpenStatement = (entry: StatementHistoryEntry) => {
    const found = DEFAULT_TEMPLATES[entry.templateId]?.template;
    if (!found) {
      alert("The bank template for this statement is no longer available.");
      return;
    }
    const tpl: DocumentTemplate = JSON.parse(JSON.stringify(found));
    setTemplate(tpl);
    setHistory([tpl]);
    setHistoryIndex(0);
    setSelectedId(null);
    setData(entry.data);
    setCurrentPage(1);
    setActiveView("form");
  };

  const handleRenameStatement = async (entry: StatementHistoryEntry, label: string) => {
    const res = await fetch(`/api/history/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      setSavedStatements((prev) => prev.map((e) => (e.id === entry.id ? { ...e, label } : e)));
    } else {
      alert("Could not rename this statement.");
    }
  };

  const handleDeleteStatement = async (entry: StatementHistoryEntry) => {
    const res = await fetch(`/api/history/${entry.id}`, { method: "DELETE" });
    if (res.ok) {
      setSavedStatements((prev) => prev.filter((e) => e.id !== entry.id));
    } else {
      alert("Could not delete this statement.");
    }
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };

  // Save template to server
  const handleSaveTemplate = async () => {
    try {
      setIsSaving(true);
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      if (res.ok) {
        setHasSaved(true);
        setTimeout(() => setHasSaved(false), 2500);
      }
    } catch (err) {
      console.error("Save template error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicate template
  const handleDuplicateTemplate = (tpl: DocumentTemplate) => {
    const dup: DocumentTemplate = {
      ...tpl,
      id: `${tpl.id}-copy-${Date.now()}`,
      name: `${tpl.name} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    const updated = [...templates, dup];
    setTemplates(updated);
    setTemplate(dup);
  };

  // Delete template
  const handleDeleteTemplate = async (id: string) => {
    const filtered = templates.filter((t) => t.id !== id);
    setTemplates(filtered);
    if (template.id === id && filtered.length > 0) {
      setTemplate(filtered[0]);
    }
    try {
      await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  // Import template
  const handleImportTemplate = (imported: DocumentTemplate) => {
    setTemplates((prev) => [...prev.filter((t) => t.id !== imported.id), imported]);
    setTemplate(imported);
  };

  const handleApplyImportedPdf = (importedData: DocumentData, suggestedTemplateId?: string) => {
    const targetId = suggestedTemplateId || template.id;
    const cleanDefault = DEFAULT_TEMPLATES[targetId]?.template;
    const targetTpl = cleanDefault
      ? JSON.parse(JSON.stringify(cleanDefault))
      : templates.find((t) => t.id === targetId) || template;

    setTemplate(targetTpl);
    setHistory([targetTpl]);
    setHistoryIndex(0);
    setSelectedId(null);
    setData({ ...importedData });
    setCurrentPage(1);
  };

  const templateMap = Object.fromEntries(Object.entries(DEFAULT_TEMPLATES).map(([id, v]) => [id, v.template]));

  const selectedElement = template.elements.find((el) => el.id === selectedId) || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-100 font-sans">
      {/* Studio Top Navigation Header */}
      <StudioHeader
        template={template}
        templates={templates}
        onSelectTemplate={handleSelectTemplate}
        activeView={activeView}
        setActiveView={(view) => {
          setActiveView(view);
          if (view === "history") loadHistory();
        }}
        onSignOut={handleSignOut}
        onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
        onOpenImportPdfModal={() => setIsPdfImportModalOpen(true)}
        onExportPdf={handleExportPdf}
        onSaveTemplate={handleSaveTemplate}
        isSaving={isSaving}
        hasSaved={hasSaved}
      />

      {/* VIEW MODE 1: VISUAL CANVAS EDITOR */}
      {activeView === "editor" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Action Toolbar */}
          <Toolbar
            zoom={zoom}
            setZoom={setZoom}
            unit={unit}
            setUnit={setUnit}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            currentPage={currentPage}
            totalPages={totalPages}
            setCurrentPage={setCurrentPage}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}
            selectedElementId={selectedId}
            onDeleteSelected={() => selectedId && handleDeleteElement(selectedId)}
            onDuplicateSelected={handleDuplicateSelected}
            onFitWidth={() => setZoom(1.0)}
            onFitPage={() => setZoom(0.75)}
            onAlignElement={handleAlignElement}
          />

          {/* Canvas Workspace: Left Layers + Center Canvas + Right Properties */}
          <div className="flex-1 flex overflow-hidden">
            <LayerPanel
              template={template}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddElement={handleAddElement}
              onUpdateElement={handleUpdateElement}
              onDeleteElement={handleDeleteElement}
              onReorderElement={handleReorderElement}
              currentPage={currentPage}
              totalPages={totalPages}
              onSetCurrentPage={setCurrentPage}
            />

            <Canvas
              template={template}
              data={data}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdateElement={handleUpdateElement}
              zoom={zoom}
              unit={unit}
              showGrid={showGrid}
              currentPage={currentPage}
              totalPages={totalPages}
              onDeleteSelected={() => selectedId && handleDeleteElement(selectedId)}
              onDuplicateSelected={handleDuplicateSelected}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />

            <PropertyPanel
              element={selectedElement}
              template={template}
              unit={unit}
              onUpdateElement={(updates) => selectedId && handleUpdateElement(selectedId, updates)}
              onUpdatePageSettings={handleUpdatePageSettings}
            />
          </div>
        </div>
      )}

      {/* VIEW MODE 2: DYNAMIC DATA FORM BUILDER */}
      {activeView === "form" && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left half: editable data */}
          <div className="flex-1 lg:flex-none lg:w-1/2 min-h-0 min-w-0 flex flex-col bg-white">
            <DynamicDataForm
              template={template}
              data={data}
              onChange={setData}
              onReset={handleResetData}
            />
          </div>

          {/* Right half: live PDF output */}
          <div className="h-[65vh] lg:h-auto lg:flex-none lg:w-1/2 min-h-0 min-w-0 border-t lg:border-t-0 lg:border-l border-neutral-200">
            <LivePreviewPane template={template} data={data} onDownload={handleExportPdf} />
          </div>
        </div>
      )}

      {/* VIEW MODE 4: STATEMENT HISTORY */}
      {activeView === "history" && (
        <StatementHistory
          entries={savedStatements}
          isLoading={isHistoryLoading}
          templates={templateMap}
          onOpen={handleOpenStatement}
          onRename={handleRenameStatement}
          onDelete={handleDeleteStatement}
        />
      )}

      {/* VIEW MODE 3: LIVE VECTOR PDF PREVIEW */}
      {activeView === "preview" && (
        <LivePdfViewer
          template={template}
          data={data}
        />
      )}

      {/* PDF Statement Import Modal */}
      <PdfImportModal
        isOpen={isPdfImportModalOpen}
        onClose={() => setIsPdfImportModalOpen(false)}
        onApplyData={handleApplyImportedPdf}
      />

      {/* Batch Generation Modal */}
      <BatchExportModal
        template={template}
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
      />

      {/* Template Studio Manager Modal */}
      <TemplateManagerModal
        templates={templates}
        activeTemplate={template}
        isOpen={isTemplateManagerOpen}
        onClose={() => setIsTemplateManagerOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        onSaveCurrentTemplate={handleSaveTemplate}
        onDuplicateTemplate={handleDuplicateTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onImportTemplate={handleImportTemplate}
        onApplyImportedStatement={handleApplyImportedPdf}
      />
    </div>
  );
}
