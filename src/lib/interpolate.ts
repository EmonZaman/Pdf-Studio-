import { DocumentData } from "@/types/template";

/**
 * Resolves a dotted path or simple key from data
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.trim().split(".");
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Interpolates variables like {{name}} or {{account.number}} in text
 */
export function interpolateString(
  template: string,
  data: DocumentData,
  context?: { pageNumber?: number; totalPages?: number }
): string {
  if (!template) return "";
  
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    if (key === "page" || key === "pageNumber" || key === "page_number") {
      return String(context?.pageNumber ?? 1);
    }
    if (key === "totalPages" || key === "total_pages") {
      return String(context?.totalPages ?? 1);
    }
    const val = getNestedValue(data, key);
    if (val === undefined || val === null) {
      return "";
    }
    return String(val);
  });
}

/**
 * Formats a value according to type
 */
export function formatValue(value: any, format?: "text" | "currency" | "date" | "number", currency = "BDT"): string {
  if (value === undefined || value === null || value === "") return "-";
  if (format === "currency" || format === "number") {
    const num = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
    if (isNaN(num)) return String(value);
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return String(value);
}
