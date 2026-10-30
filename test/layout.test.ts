import { describe, it, expect } from "vitest";
import { toPoints, fromPoints } from "../src/lib/units";
import { interpolateString, formatValue } from "../src/lib/interpolate";
import { computeDocumentLayout } from "../src/lib/engine/layout";
import { DEFAULT_TEMPLATES } from "../src/lib/templates";
import { DocumentTemplateSchema } from "../src/types/template";

describe("Unit Conversions", () => {
  it("converts mm to points accurately", () => {
    // 25.4 mm = 72 points
    const pts = toPoints(25.4, "mm");
    expect(pts).toBe(72);
  });

  it("converts points to mm accurately", () => {
    const mm = fromPoints(72, "mm");
    expect(mm).toBe(25.4);
  });

  it("converts pixels to points accurately", () => {
    const pts = toPoints(96, "px");
    expect(pts).toBe(72);
  });
});

describe("Dynamic Variable Interpolation", () => {
  it("interpolates simple string variables", () => {
    const template = "Statement for {{customerName}} - Acct: {{accountNo}}";
    const data = { customerName: "MD. OMAR FARUQ CHOWDHURY", accountNo: "1781920006484" };
    const res = interpolateString(template, data);
    expect(res).toBe("Statement for MD. OMAR FARUQ CHOWDHURY - Acct: 1781920006484");
  });

  it("handles missing variables gracefully", () => {
    const template = "Ref: {{missingKey}}";
    const res = interpolateString(template, {});
    expect(res).toBe("Ref: ");
  });

  it("resolves context variables pageNumber and totalPages", () => {
    const template = "Page {{pageNumber}} of {{totalPages}}";
    const res = interpolateString(template, {}, { pageNumber: 3, totalPages: 6 });
    expect(res).toBe("Page 3 of 6");
  });

  it("formats currency values", () => {
    const formatted = formatValue("384578.87", "currency");
    expect(formatted).toBe("384,578.87");
  });
});

describe("Document Template Schema Validation", () => {
  it("validates default templates against Zod schema", () => {
    for (const key of Object.keys(DEFAULT_TEMPLATES)) {
      const { template } = DEFAULT_TEMPLATES[key];
      const parsed = DocumentTemplateSchema.safeParse(template);
      expect(parsed.success).toBe(true);
    }
  });
});

describe("Table Pagination Engine", () => {
  it("computes exact multi-page pagination for City Bank statement", () => {
    const { template, sampleData } = DEFAULT_TEMPLATES["city-bank-statement"];
    const layout = computeDocumentLayout(template, sampleData);

    // The built-in City Bank statement (147 transactions, Jan–Oct 2026) spans 6 pages
    expect(layout.totalPages).toBe(6);
    expect(layout.pages.length).toBe(6);

    // Page 1 has specific first-page elements (address, summary card, QR)
    const p1 = layout.pages[0];
    expect(p1.pageNumber).toBe(1);
    expect(p1.tableRows && p1.tableRows.length > 0).toBe(true);

    // Page 6 is the last table page with End of Statement
    const p6 = layout.pages[5];
    expect(p6.isLastPage).toBe(true);
  });
});
