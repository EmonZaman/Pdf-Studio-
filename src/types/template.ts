import { z } from "zod";

export type UnitType = "pt" | "mm" | "px";

export type ElementType = "text" | "shape" | "image" | "qr_code" | "table" | "divider";

export interface ElementStyle {
  fontFamily?: string;
  fontSize?: number; // in points
  fontWeight?: "normal" | "bold" | "500" | "600" | "700";
  fontStyle?: "normal" | "italic";
  color?: string; // hex or rgb
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number; // multiplier, e.g. 1.2
  letterSpacing?: number;
  opacity?: number;
  padding?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
}

export interface TableColumn {
  id: string;
  label: string;
  key: string;
  width: number; // width in points or percentage
  align: "left" | "center" | "right";
  format?: "text" | "currency" | "date" | "number";
}

export interface CanvasElement {
  id: string;
  name: string;
  type: ElementType;
  x: number; // in points (pt)
  y: number; // in points (pt)
  width: number; // in points (pt)
  height: number; // in points (pt)
  style: ElementStyle;
  content?: string; // For text, dynamic variables like {{customerName}}
  url?: string; // For images
  qrData?: string; // For QR code content template
  tableColumns?: TableColumn[];
  tableDataKey?: string; // e.g. "transactions"
  tableRowHeight?: number;
  tableHeaderHeight?: number;
  tableHeaderBg?: string;
  tableHeaderTextColor?: string;
  tableBorderColor?: string;
  showTableHeader?: boolean;
  pageTarget?: "first" | "subsequent" | "all" | "last";
  locked?: boolean;
  hidden?: boolean;
}

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox" | "table" | "computed";
  defaultValue?: any;
  required?: boolean;
  options?: string[]; // for select
  formula?: string; // for computed
  description?: string;
  category?: string;
}

export interface PageSettings {
  size: "A4" | "LETTER" | "LEGAL" | "CUSTOM";
  width: number; // in points (pt), A4 is 595.28
  height: number; // in points (pt), A4 is 841.89
  orientation: "portrait" | "landscape";
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  backgroundColor?: string;
  unit: UnitType;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  category: "banking" | "invoice" | "certificate" | "report" | "custom";
  createdAt: string;
  updatedAt: string;
  pageSettings: PageSettings;
  fields: FieldDefinition[];
  elements: CanvasElement[];
  meta?: Record<string, any>;
}

// Zod Schemas for validation
export const ElementStyleSchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.enum(["normal", "bold", "500", "600", "700"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
  borderRadius: z.number().optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  opacity: z.number().optional(),
  padding: z.number().optional(),
  paddingHorizontal: z.number().optional(),
  paddingVertical: z.number().optional(),
});

export const TableColumnSchema = z.object({
  id: z.string(),
  label: z.string(),
  key: z.string(),
  width: z.number(),
  align: z.enum(["left", "center", "right"]),
  format: z.enum(["text", "currency", "date", "number"]).optional(),
});

export const CanvasElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["text", "shape", "image", "qr_code", "table", "divider"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  style: ElementStyleSchema,
  content: z.string().optional(),
  url: z.string().optional(),
  qrData: z.string().optional(),
  tableColumns: z.array(TableColumnSchema).optional(),
  tableDataKey: z.string().optional(),
  tableRowHeight: z.number().optional(),
  tableHeaderHeight: z.number().optional(),
  tableHeaderBg: z.string().optional(),
  tableHeaderTextColor: z.string().optional(),
  tableBorderColor: z.string().optional(),
  showTableHeader: z.boolean().optional(),
  pageTarget: z.enum(["first", "subsequent", "all", "last"]).optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export const FieldDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "date", "select", "checkbox", "table", "computed"]),
  defaultValue: z.any().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  formula: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});

export const PageSettingsSchema = z.object({
  size: z.enum(["A4", "LETTER", "LEGAL", "CUSTOM"]),
  width: z.number(),
  height: z.number(),
  orientation: z.enum(["portrait", "landscape"]),
  margins: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  }),
  backgroundColor: z.string().optional(),
  unit: z.enum(["pt", "mm", "px"]),
});

export const DocumentTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  version: z.string().default("1.0.0"),
  category: z.enum(["banking", "invoice", "certificate", "report", "custom"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  pageSettings: PageSettingsSchema,
  fields: z.array(FieldDefinitionSchema),
  elements: z.array(CanvasElementSchema),
  meta: z.record(z.string(), z.any()).optional(),
});

export type DocumentData = Record<string, any>;
