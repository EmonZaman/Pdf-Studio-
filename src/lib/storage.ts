import fs from "fs";
import path from "path";
import { DocumentTemplate, DocumentData } from "@/types/template";
import { DEFAULT_TEMPLATES } from "./templates";

const DATA_DIR = path.join(process.cwd(), "data");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");

interface SavedDocument {
  id: string;
  templateId: string;
  name: string;
  data: DocumentData;
  createdAt: string;
  updatedAt: string;
}

const DOCUMENTS_FILE = path.join(DATA_DIR, "documents.json");

function ensureDirectoryExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getTemplates(): DocumentTemplate[] {
  try {
    ensureDirectoryExists(DATA_DIR);
    const defaults = Object.values(DEFAULT_TEMPLATES).map((t) => t.template);
    if (!fs.existsSync(TEMPLATES_FILE)) {
      // Seed default templates
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(defaults, null, 2), "utf-8");
      return defaults;
    }
    const content = fs.readFileSync(TEMPLATES_FILE, "utf-8");
    const stored: DocumentTemplate[] = JSON.parse(content);
    // Ensure all default templates exist in the studio
    let updated = false;
    for (const def of defaults) {
      const idx = stored.findIndex((t) => t.id === def.id);
      if (idx === -1) {
        stored.push(def);
        updated = true;
      } else if (def.id.includes("bank")) {
        // Keep official bank templates fresh with latest definitions
        stored[idx] = def;
        updated = true;
      }
    }
    if (updated) {
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(stored, null, 2), "utf-8");
    }
    return stored;
  } catch (err) {
    console.error("Failed to read templates", err);
    return Object.values(DEFAULT_TEMPLATES).map((t) => t.template);
  }
}

export function saveTemplate(template: DocumentTemplate): DocumentTemplate {
  ensureDirectoryExists(DATA_DIR);
  const templates = getTemplates();
  const index = templates.findIndex((t) => t.id === template.id);
  const updated = {
    ...template,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    templates[index] = updated;
  } else {
    templates.push(updated);
  }

  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), "utf-8");
  return updated;
}

export function deleteTemplate(id: string): boolean {
  try {
    const templates = getTemplates();
    const filtered = templates.filter((t) => t.id !== id);
    if (filtered.length === templates.length) return false;
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(filtered, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Failed to delete template", err);
    return false;
  }
}

export function getDocuments(): SavedDocument[] {
  try {
    ensureDirectoryExists(DATA_DIR);
    if (!fs.existsSync(DOCUMENTS_FILE)) {
      return [];
    }
    const content = fs.readFileSync(DOCUMENTS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Failed to read documents", err);
    return [];
  }
}

export function saveDocument(doc: SavedDocument): SavedDocument {
  ensureDirectoryExists(DATA_DIR);
  const documents = getDocuments();
  const index = documents.findIndex((d) => d.id === doc.id);
  const updated = {
    ...doc,
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) {
    documents[index] = updated;
  } else {
    documents.push(updated);
  }
  fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documents, null, 2), "utf-8");
  return updated;
}
