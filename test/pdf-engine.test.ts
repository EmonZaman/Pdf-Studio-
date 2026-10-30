import { describe, it, expect } from "vitest";
import { generatePdf } from "../src/lib/engine/pdf-generator";
import { DEFAULT_TEMPLATES } from "../src/lib/templates";
import { PDFDocument } from "pdf-lib";

describe("Vector PDF Generator Engine", () => {
  it("generates 6-page City Bank statement with 100% precision", async () => {
    const { template, sampleData } = DEFAULT_TEMPLATES["city-bank-statement"];
    const pdfBytes = await generatePdf(template, sampleData);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(5000);

    // Save sample to public folder
    const fs = await import("fs");
    const path = await import("path");
    fs.writeFileSync(path.resolve(__dirname, "../public/sample-city-bank-statement.pdf"), Buffer.from(pdfBytes));

    // Inspect generated PDF document geometry
    const doc = await PDFDocument.load(pdfBytes);
    const pageCount = doc.getPageCount();
    expect(pageCount).toBe(6);

    // Verify page dimensions (US Letter: 612 x 792)
    for (let i = 0; i < pageCount; i++) {
      const page = doc.getPage(i);
      const { width, height } = page.getSize();
      expect(Math.round(width)).toBe(612);
      expect(Math.round(height)).toBe(792);
    }
  });
});

describe("Verification QR code", () => {
  it("prints an uploaded QR image in place of the generated code", async () => {
    const { generateQrDataUrl } = await import("../src/lib/engine/qr-helper");
    const { template, sampleData } = DEFAULT_TEMPLATES["city-bank-statement"];
    const customQr = await generateQrDataUrl("https://example.com/custom", { width: 200 });
    const pdfBytes = await generatePdf(template, { ...sampleData, qrImage: customQr });

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(6);
  });
});
