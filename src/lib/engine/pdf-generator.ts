import { PDFDocument, StandardFonts, rgb, RGB } from "pdf-lib";
import { DocumentTemplate, DocumentData } from "@/types/template";
import { computeDocumentLayout } from "./layout";
import { generateQrBuffer } from "./qr-helper";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * Parses hex color strings (#rrggbb or #rgb) to pdf-lib RGB (0..1)
 */
export function parseColor(hex?: string): RGB {
  if (!hex || typeof hex !== "string" || hex === "transparent") return rgb(0, 0, 0);
  let clean = hex.trim().replace("#", "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return rgb(0, 0, 0);

  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Generates high-fidelity vector PDF bytes from a template and data
 */
export async function generatePdf(
  template: DocumentTemplate,
  data: DocumentData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Pre-load standard vector fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Pre-load authentic reference images (logo, globe, headset)
  let embeddedBankLogo: any = null;
  let embeddedGlobeIcon: any = null;
  let embeddedPhoneIcon: any = null;

  async function loadAssetPng(relPath: string): Promise<any> {
    try {
      if (typeof window !== "undefined") {
        const res = await fetch(relPath);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          return await pdfDoc.embedPng(new Uint8Array(ab));
        }
      } else {
        const nodeRequire = eval("require");
        const fs = nodeRequire("fs");
        const path = nodeRequire("path");
        const fullPath = path.join(process.cwd(), "public", relPath.replace(/^\//, ""));
        if (fs.existsSync(fullPath)) {
          const bytes = fs.readFileSync(fullPath);
          return await pdfDoc.embedPng(bytes);
        }
      }
    } catch (e) {
      console.warn("Could not embed PNG:", relPath, e);
    }
    return null;
  }

  embeddedBankLogo = (await loadAssetPng("/images/ref-Im0.png")) || (await loadAssetPng("/images/city-bank-logo.png"));
  embeddedGlobeIcon = await loadAssetPng("/images/ref-Im1.png");
  embeddedPhoneIcon = await loadAssetPng("/images/ref-Im2.png");

  const pageW = template.pageSettings.width;
  const pageH = template.pageSettings.height;
  const isCityBank = template.id === "city-bank-statement";

  // Compute exact layout and pages
  const layout = computeDocumentLayout(template, data);

  for (const pageInfo of layout.pages) {
    const page = pdfDoc.addPage([pageW, pageH]);
    const isP1 = pageInfo.pageNumber === 1;

    // Optional background fill
    if (template.pageSettings.backgroundColor && template.pageSettings.backgroundColor !== "#ffffff") {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
        color: parseColor(template.pageSettings.backgroundColor),
      });
    }

    // 1. Draw Static / Dynamic Canvas Elements
    for (const item of pageInfo.elements) {
      const el = item.element;
      const x = el.x;
      const y = el.y;
      const w = el.width;
      const h = el.height;
      const pdfY = pageH - y - h;

      if (el.type === "image") {
        if (embeddedBankLogo && (el.id === "elem-logo" || el.url?.includes("city-bank") || el.url?.includes("ref-Im0"))) {
          if (isCityBank) {
            page.drawImage(embeddedBankLogo, {
              x: isP1 ? 35.94 : 39.27,
              y: isP1 ? 742.964 : 739.114,
              width: 48.674,
              height: 31.036,
            });
          } else {
            page.drawImage(embeddedBankLogo, {
              x,
              y: pdfY,
              width: w,
              height: h,
            });
          }
          continue;
        }

        // Fallback Vector Logo Mark if image not loaded
        const ox = x + 2;
        const oy = pdfY + 6;
        const scale = 0.85;
        const redPrimary = rgb(0.929, 0.109, 0.141);
        page.drawText("city bank", {
          x: ox + 36,
          y: oy + 7,
          size: 16,
          font: fontBold,
          color: redPrimary,
        });
      } else if (el.type === "shape") {
        page.drawRectangle({
          x,
          y: pdfY,
          width: w,
          height: h,
          color: el.style.backgroundColor && el.style.backgroundColor !== "transparent" ? parseColor(el.style.backgroundColor) : undefined,
          borderColor: el.style.borderColor ? parseColor(el.style.borderColor) : undefined,
          borderWidth: el.style.borderWidth || 0,
          opacity: el.style.opacity ?? 1,
        });
      } else if (el.type === "divider") {
        if (isCityBank) {
          const rawAddr = String(data.address || "TWINBIT LTD,HOUSE-715,ROAD-11 AVENUE-03,MIRPUR , DHAKA, BANGLADESH").trim();
          const isMultiAddr = rawAddr.includes("\n") || rawAddr.length > 68;
          if (el.id === "elem-p1-cust-line") {
            page.drawRectangle({
              x: 36,
              y: isMultiAddr ? 691.398 : 698.898,
              width: 338.15,
              height: 0.5,
              color: rgb(0.925, 0.925, 0.925),
            });
            continue;
          }
          if (el.id === "elem-p1-verify-line") {
            page.drawRectangle({ x: 461.1, y: 720.882, width: 132.9, height: 0.5, color: rgb(0.929, 0.109, 0.141) });
            continue;
          }
          if (el.id === "elem-p1-summary-top-line") {
            page.drawRectangle({ x: 36, y: 628.022, width: 558, height: 0.5, color: rgb(0.929, 0.109, 0.141) });
            continue;
          }
          if (el.id === "elem-p1-summary-bottom-line") {
            page.drawRectangle({ x: 36, y: 598.619, width: 558, height: 0.5, color: rgb(0.929, 0.109, 0.141) });
            continue;
          }
          if (el.id === "elem-p1-summary-div-1" || el.id === "elem-p1-summary-div-2" || el.id === "elem-p1-summary-div-3") {
            const divX = el.id === "elem-p1-summary-div-1" ? 175.2 : el.id === "elem-p1-summary-div-2" ? 314.65 : 454.4;
            page.drawRectangle({ x: divX, y: 603.119, width: 0.5, height: 20.252, color: rgb(0.866, 0.866, 0.866) });
            continue;
          }
          if (el.id === "elem-footer-divider") {
            page.drawRectangle({ x: 36, y: isP1 ? 60.726 : 57.257, width: 558, height: 0.5, color: rgb(0.929, 0.109, 0.141) });
            continue;
          }
          if (el.id === "elem-footer-div1" || el.id === "elem-footer-div2" || el.id === "elem-footer-div3") {
            const divX = el.id === "elem-footer-div1" ? 335.7 : el.id === "elem-footer-div2" ? 421.95 : 494.65;
            page.drawRectangle({
              x: divX,
              y: isP1 ? 23.383 : 28.245,
              width: 0.5,
              height: isP1 ? 30.342 : 22.012,
              color: rgb(0.925, 0.925, 0.925),
            });
            continue;
          }
        }

        const thickness = el.style.borderWidth || 0.5;
        if (h > w) {
          page.drawLine({
            start: { x: x + w / 2, y: pdfY },
            end: { x: x + w / 2, y: pdfY + h },
            thickness,
            color: el.style.borderColor ? parseColor(el.style.borderColor) : parseColor("#ececec"),
          });
        } else {
          const lineY = pageH - y;
          page.drawLine({
            start: { x, y: lineY },
            end: { x: x + w, y: lineY },
            thickness,
            color: el.style.borderColor ? parseColor(el.style.borderColor) : parseColor("#ed1c24"),
          });
        }
      } else if (el.type === "qr_code") {
        // A custom QR image uploaded in the form replaces the generated code
        const customQr = typeof data.qrImage === "string" ? data.qrImage : "";
        if (customQr.startsWith("data:image/")) {
          try {
            const bytes = dataUrlToBytes(customQr);
            const img = customQr.startsWith("data:image/png") ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
            const scale = Math.min(w / img.width, h / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            page.drawImage(img, { x: x + (w - drawW) / 2, y: pdfY + (h - drawH) / 2, width: drawW, height: drawH });
          } catch (err) {
            console.error("Error drawing custom QR image", err);
          }
          continue;
        }

        // Otherwise the QR is generated from the template data, so edits to the
        // verification URL / reference code appear in the PDF.
        const qrContent = item.resolvedQrData || el.qrData || "";
        if (qrContent) {
          const qrBuffer = await generateQrBuffer(qrContent);
          if (qrBuffer) {
            try {
              const qrImage = await pdfDoc.embedPng(qrBuffer);
              page.drawImage(qrImage, {
                x,
                y: pdfY,
                width: w,
                height: h,
              });
            } catch (err) {
              console.error("Error drawing QR image", err);
            }
          }
        }
      } else if (el.type === "text") {
        const textContent = item.interpolatedContent || "";
        if (!textContent) continue;

        if (isCityBank) {
          // Exact Reference PDF text placements
          if (el.id === "elem-statement-title") {
            page.drawText("Statement of Account", {
              x: isP1 ? 393.55 : 438.5,
              y: isP1 ? 750.824 : 746.974,
              size: 16,
              font: fontBold,
              color: rgb(0.039, 0.039, 0.039),
            });
            continue;
          }

          if (el.id === "elem-p1-cust-name") {
            page.drawText(data.customerName || "MD. MONIRUZZAMAN EMON", {
              x: 36,
              y: 725.565,
              size: 7,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
            continue;
          }

          if (el.id === "elem-p1-address") {
            const rawAddr = String(
              data.address || "TWINBIT LTD,HOUSE-715,ROAD-11 AVENUE-03,MIRPUR , DHAKA, BANGLADESH"
            ).trim();
            const rawLines = rawAddr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const addrLines: string[] = [];
            for (const rl of rawLines) {
              if (fontRegular.widthOfTextAtSize(rl, 7) <= 345) {
                addrLines.push(rl);
              } else {
                const words = rl.split(" ");
                let cur = "";
                for (const w of words) {
                  const cand = cur ? `${cur} ${w}` : w;
                  if (fontRegular.widthOfTextAtSize(cand, 7) <= 345 || !cur) {
                    cur = cand;
                  } else {
                    addrLines.push(cur);
                    cur = w;
                  }
                }
                if (cur) addrLines.push(cur);
              }
            }
            let addrY = 711.673;
            for (const line of addrLines.slice(0, 3)) {
              page.drawText(line, {
                x: 36,
                y: addrY,
                size: 7,
                font: fontRegular,
                color: rgb(0.533, 0.533, 0.533),
              });
              addrY -= 8.092;
            }
            continue;
          }

          if (el.id === "elem-p1-acct-meta") {
            const rawAddr = String(
              data.address || "TWINBIT LTD,HOUSE-715,ROAD-11 AVENUE-03,MIRPUR , DHAKA, BANGLADESH"
            ).trim();
            const isMultiAddr = rawAddr.includes("\n") || rawAddr.length > 68;
            const row1Y = isMultiAddr ? 679.339 : 686.839;
            const row2Y = isMultiAddr ? 670.034 : 677.534;
            const grey = rgb(0.533, 0.533, 0.533);
            const black = rgb(0, 0, 0);
            // Shrink long values to fit their column so they stay on one line and on the label baseline
            const drawFitted = (text: string, x: number, y: number, maxWidth: number) => {
              let size = 7;
              while (size > 5 && fontRegular.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
              page.drawText(text, { x, y, size, font: fontRegular, color: black });
            };
            // Row 1
            page.drawText("Account No.", { x: 37.45, y: row1Y, size: 7, font: fontRegular, color: grey });
            page.drawText(":", { x: 88.15, y: row1Y, size: 7, font: fontRegular, color: grey });
            page.drawText(String(data.accountNo || "2304435091001"), { x: 93, y: row1Y, size: 7, font: fontRegular, color: black });

            page.drawText("Account Type", { x: 180.55, y: row1Y, size: 7, font: fontRegular, color: grey });
            page.drawText(":", { x: 226.8, y: row1Y, size: 7, font: fontRegular, color: grey });
            drawFitted(String(data.accountType || "HIGH VALUE SAVINGS A/C"), 231.65, row1Y, 150);

            // Row 2
            page.drawText("Account Status", { x: 37.45, y: row2Y, size: 7, font: fontRegular, color: grey });
            page.drawText(":", { x: 88.15, y: row2Y, size: 7, font: fontRegular, color: grey });
            page.drawText(String(data.accountStatus || "ACTIVE"), { x: 93, y: row2Y, size: 7, font: fontRegular, color: black });

            page.drawText("Branch", { x: 180.55, y: row2Y, size: 7, font: fontRegular, color: grey });
            page.drawText(":", { x: 226.8, y: row2Y, size: 7, font: fontRegular, color: grey });
            drawFitted(String(data.branch || "PALLABI BRANCH"), 231.65, row2Y, 150);
            continue;
          }

          if (el.id === "elem-p1-verify-header") {
            const yHeader = 725.941;
            const black = rgb(0, 0, 0);
            const grey = rgb(0.533, 0.533, 0.533);
            page.drawText("VERIFY", { x: 461.1, y: yHeader, size: 6, font: fontBold, color: black });
            page.drawText("THIS", { x: 484.44, y: yHeader, size: 6, font: fontBold, color: black });
            page.drawText("STATEMENT", { x: 499.776, y: yHeader, size: 6, font: fontBold, color: black });
            page.drawText("Valid", { x: 539.778, y: yHeader, size: 5, font: fontRegular, color: grey });
            page.drawText("for", { x: 552.283, y: yHeader, size: 5, font: fontRegular, color: grey });
            page.drawText("6", { x: 559.508, y: yHeader, size: 5, font: fontRegular, color: grey });
            page.drawText("months", { x: 563.678, y: yHeader, size: 5, font: fontRegular, color: grey });
            continue;
          }

          if (el.id === "elem-p1-verify-text") {
            const grey = rgb(0.533, 0.533, 0.533);
            const black = rgb(0, 0, 0);
            page.drawText("Can't scan? Enter the reference number at the ", { x: 461.1, y: 707.88, size: 6, font: fontRegular, color: grey });
            page.drawText("URL below:", { x: 461.1, y: 699.904, size: 6, font: fontRegular, color: grey });
            page.drawText(String(data.verifyUrl || "http://t.cbl.fyi/i/10/stmt"), { x: 461.1, y: 691.928, size: 6, font: fontRegular, color: black });
            continue;
          }

          if (el.id === "elem-p1-verify-ref") {
            page.drawText(String(data.referenceNo || "0S18HDHYANSPV"), {
              x: 461.1,
              y: 669.296,
              size: 7,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
            continue;
          }

          if (el.id === "elem-p1-summary-title") {
            page.drawText("ACCOUNT", { x: 36, y: 632.485, size: 6, font: fontBold, color: rgb(0, 0, 0) });
            page.drawText("SUMMARY", { x: 67.662, y: 632.485, size: 6, font: fontBold, color: rgb(0, 0, 0) });
            continue;
          }

          if (el.id?.startsWith("elem-p1-summary-c")) {
            const parts = textContent.split("\n");
            const label = parts[0] || "";
            const val = parts[1] || "";
            const rightEdge =
              el.id === "elem-p1-summary-c1"
                ? 168.25
                : el.id === "elem-p1-summary-c2"
                ? 307.7
                : el.id === "elem-p1-summary-c3"
                ? 447.4
                : 594.0;
            const labelW = fontRegular.widthOfTextAtSize(label, 7);
            const valW = fontBold.widthOfTextAtSize(val, 8);
            page.drawText(label, {
              x: rightEdge - labelW,
              y: 616.813,
              size: 7,
              font: fontRegular,
              color: rgb(0.533, 0.533, 0.533),
            });
            page.drawText(val, {
              x: rightEdge - valW,
              y: 606.299,
              size: 8,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
            continue;
          }

          if (el.id === "elem-sub-cust-info") {
            const dark = rgb(0.039, 0.039, 0.039);
            page.drawText("Name :", { x: 35.1, y: 713.662, size: 8, font: fontRegular, color: dark });
            page.drawText(String(data.customerName || "MD. MONIRUZZAMAN EMON"), { x: 63.5, y: 713.662, size: 8, font: fontBold, color: dark });
            page.drawText("Account No. :", { x: 486.5, y: 713.662, size: 8, font: fontRegular, color: dark });
            page.drawText(String(data.accountNo || "2304435091001"), { x: 537.5, y: 713.662, size: 8, font: fontBold, color: dark });
            continue;
          }

          if (el.id === "elem-p1-tx-bar" || el.id === "elem-sub-tx-bar") {
            const txY = isP1 ? 568.914 : 679.155;
            const metaY = isP1 ? 569.785 : 680.026;
            const divY = isP1 ? 566.943 : 677.183;
            const genX = isP1 ? 428.077 : 408.477;
            const genValX = isP1 ? 491.112 : 471.512;
            const div2X = isP1 ? 530.75 : 511.15;

            page.drawText("TRANSACTIONS", {
              x: 36,
              y: txY,
              size: 9,
              font: fontBold,
              color: rgb(0.929, 0.109, 0.141),
            });
            page.drawRectangle({ x: 114.45, y: divY, width: 0.5, height: 10.71, color: rgb(0.8, 0.8, 0.8) });
            page.drawText(`From ${data.openingDate || "01 Oct 2025"} to ${data.statementEndDate || "24 Oct 2026"}`, {
              x: 121.9,
              y: metaY,
              size: 7,
              font: fontRegular,
              color: rgb(0.533, 0.533, 0.533),
            });
            page.drawText("Date of Generation: ", {
              x: genX,
              y: metaY,
              size: 7,
              font: fontRegular,
              color: rgb(0.533, 0.533, 0.533),
            });
            page.drawText(String(data.generationDate || "25 Oct 2026"), {
              x: genValX,
              y: metaY,
              size: 6,
              font: fontRegular,
              color: rgb(0.039, 0.039, 0.039),
            });
            page.drawRectangle({ x: div2X, y: divY, width: 0.5, height: 10.71, color: rgb(0.8, 0.8, 0.8) });
            page.drawText("Currency: ", {
              x: 549.716,
              y: metaY,
              size: 7,
              font: fontRegular,
              color: rgb(0.533, 0.533, 0.533),
            });
            page.drawText(String(data.currency || "BDT"), {
              x: 582,
              y: metaY,
              size: 6,
              font: fontRegular,
              color: rgb(0.039, 0.039, 0.039),
            });
            continue;
          }

          if (el.id === "elem-footer-notes") {
            const notesTitleY = isP1 ? 47.9 : 44.432;
            const line1Y = isP1 ? 39.963 : 36.495;
            const line2Y = isP1 ? 33.028 : 29.559;
            page.drawText("Notes:", {
              x: 41.75,
              y: notesTitleY,
              size: 6,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
            page.drawText("This is a system generated statement and requires no signature. Please advise the bank of any discrepancy ", {
              x: 41.75,
              y: line1Y,
              size: 6,
              font: fontRegular,
              color: rgb(0.349, 0.349, 0.349),
            });
            page.drawText("within 14 days of receipt of this statement (if any), otherwise, this statement will be deemed correct.", {
              x: 41.75,
              y: line2Y,
              size: 6,
              font: fontRegular,
              color: rgb(0.349, 0.349, 0.349),
            });
            continue;
          }

          if (el.id === "elem-footer-web") {
            const iconY = isP1 ? 39.079 : 35.612;
            const textY = isP1 ? 40.088 : 36.619;
            if (embeddedGlobeIcon) {
              page.drawImage(embeddedGlobeIcon, { x: 341.35, y: iconY, width: 7.28, height: 7.28 });
            }
            page.drawText(String(data.website || "citybankplc.com"), {
              x: 354.75,
              y: textY,
              size: 7,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
            continue;
          }

          if (el.id === "elem-footer-phones") {
            const iconY = isP1 ? 39.079 : 35.612;
            const textY = isP1 ? 40.088 : 36.619;
            if (embeddedPhoneIcon) {
              page.drawImage(embeddedPhoneIcon, { x: 427.6, y: iconY, width: 7.28, height: 7.28 });
            }
            page.drawText("16234", { x: 441, y: textY, size: 7, font: fontBold, color: rgb(0, 0, 0) });
            page.drawText("(Local)", { x: 462.406, y: textY, size: 7, font: fontRegular, color: rgb(0.392, 0.392, 0.392) });
            page.drawText("+880 2 8331040", { x: 500.3, y: textY, size: 7, font: fontBold, color: rgb(0, 0, 0) });
            page.drawText(" (Overseas)", { x: 551.092, y: textY, size: 7, font: fontRegular, color: rgb(0.392, 0.392, 0.392) });
            continue;
          }

          if (el.id === "elem-footer-page-num") {
            const pgY = isP1 ? 24.916 : 21.448;
            const pgColor = rgb(0.474, 0.474, 0.474);
            const pNumStr = String(pageInfo.pageNumber);
            const totStr = String(pageInfo.totalPages);
            page.drawText("Page ", { x: 548.903, y: pgY, size: 7, font: fontRegular, color: pgColor });
            const pNumX = 567.194;
            page.drawText(pNumStr, { x: pNumX, y: pgY, size: 7, font: fontBold, color: pgColor });
            const ofX = pNumX + fontBold.widthOfTextAtSize(pNumStr, 7);
            page.drawText(" of ", { x: ofX, y: pgY, size: 7, font: fontRegular, color: pgColor });
            const totX = ofX + fontRegular.widthOfTextAtSize(" of ", 7);
            page.drawText(totStr, { x: totX, y: pgY, size: 7, font: fontBold, color: pgColor });
            continue;
          }
        }

        // Standard generic text element rendering
        const fontSize = el.style.fontSize || 10;
        const lineHeight = el.style.lineHeight || 1.3;
        const textColor = el.style.color ? parseColor(el.style.color) : rgb(0, 0, 0);
        const font =
          el.style.fontWeight === "bold"
            ? fontBold
            : fontRegular;
        const lines = textContent.split("\n");
        let curLineY = pageH - el.y - fontSize;

        for (const rawLine of lines) {
          const words = rawLine.split(" ");
          const wrapped: string[] = [];
          let current = "";
          for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (font.widthOfTextAtSize(candidate, fontSize) <= el.width || !current) {
              current = candidate;
            } else {
              wrapped.push(current);
              current = word;
            }
          }
          if (current || wrapped.length === 0) wrapped.push(current);

          for (const wLine of wrapped) {
            const textW = font.widthOfTextAtSize(wLine, fontSize);
            let drawX = el.x;
            if (el.style.textAlign === "center") {
              drawX = el.x + (el.width - textW) / 2;
            } else if (el.style.textAlign === "right") {
              drawX = el.x + el.width - textW;
            }

            page.drawText(wLine, {
              x: drawX,
              y: curLineY,
              size: fontSize,
              font,
              color: textColor,
              opacity: el.style.opacity ?? 1,
            });
            curLineY -= fontSize * lineHeight;
          }
        }
      }
    }

    // 2. Draw Table Headers and Rows if present
    if (pageInfo.tableHeaders && pageInfo.tableRows) {
      if (isCityBank) {
        const isP1 = pageInfo.pageNumber === 1;
        // Page 12 has 0 rows: only draw two horizontal black continuation lines at y = 663.718
        if (pageInfo.tableRows.length === 0) {
          page.drawRectangle({ x: 36, y: 663.718, width: 247.9, height: 0.5, color: rgb(0, 0, 0) });
          page.drawRectangle({ x: 341.7, y: 663.718, width: 252.3, height: 0.5, color: rgb(0, 0, 0) });
        } else {
          const topHeaderLineY = isP1 ? 557.037 : 663.718;
          const bottomHeaderLineY = isP1 ? 538.397 : 645.078;
          const headerTextY = isP1 ? 545.711 : 652.391;
          const redColor = rgb(0.929, 0.109, 0.141);
          const hdrColor = rgb(0.039, 0.039, 0.039);

          page.drawRectangle({ x: 36, y: topHeaderLineY, width: 558, height: 0.5, color: redColor });
          page.drawRectangle({ x: 36, y: bottomHeaderLineY, width: 558, height: 0.5, color: redColor });

          page.drawText("DATE", { x: 36, y: headerTextY, size: 6, font: fontBold, color: hdrColor });
          page.drawText("DESCRIPTION", { x: 81, y: headerTextY, size: 6, font: fontBold, color: hdrColor });
          page.drawText("CHQ. NO.", { x: 378.764, y: headerTextY, size: 6, font: fontBold, color: hdrColor });
          page.drawText("WITHDRAWAL", { x: 431.612, y: headerTextY, size: 6, font: fontBold, color: hdrColor });
          page.drawText("DEPOSIT", { x: 510.26, y: headerTextY, size: 6, font: fontBold, color: hdrColor });
          page.drawText("BALANCE", { x: 564.672, y: headerTextY, size: 6, font: fontBold, color: hdrColor });

          for (const row of pageInfo.tableRows) {
            const rowPdfY = pageH - row.y - row.height;
            // Exact 0.5pt bottom separator rectangle at rowPdfY - 0.25
            page.drawRectangle({
              x: 36,
              y: rowPdfY - 0.25,
              width: 558,
              height: 0.5,
              color: rgb(0.925, 0.925, 0.925),
            });

            const textY = rowPdfY + 7.063;
            const dateVal = row.cells[0]?.value || "";
            const descVal = row.cells[1]?.value || "";
            const chqVal = row.cells[2]?.value || "";
            const wdlVal = row.cells[3]?.value || "";
            const depVal = row.cells[4]?.value || "";
            const balVal = row.cells[5]?.value || "";

            if (dateVal) {
              page.drawText(dateVal, { x: 36, y: textY, size: 6, font: fontRegular, color: rgb(0, 0, 0) });
            }
            if (descVal) {
              page.drawText(descVal, { x: 81, y: textY, size: 6, font: fontRegular, color: rgb(0, 0, 0) });
            }
            if (chqVal) {
              const chqW = fontRegular.widthOfTextAtSize(chqVal, 6);
              page.drawText(chqVal, { x: 406.1 - chqW, y: textY, size: 6, font: fontRegular, color: rgb(0, 0, 0) });
            }
            if (wdlVal) {
              const wdlW = fontRegular.widthOfTextAtSize(wdlVal, 6);
              page.drawText(wdlVal, { x: 473.6 - wdlW, y: textY, size: 6, font: fontRegular, color: rgb(0, 0, 0) });
            }
            if (depVal) {
              const depW = fontRegular.widthOfTextAtSize(depVal, 6);
              page.drawText(depVal, { x: 536.6 - depW, y: textY, size: 6, font: fontRegular, color: rgb(0, 0, 0) });
            }
            if (balVal) {
              const balW = fontRegular.widthOfTextAtSize(balVal, 6);
              page.drawText(balVal, { x: 594.0 - balW, y: textY, size: 6, font: fontRegular, color: rgb(0, 0, 0) });
            }
          }

          // End of Statement on Page 11 (or last non-empty page)
          if (
            (pageInfo.pageNumber === 11 && pageInfo.totalPages === 12) ||
            (pageInfo.isLastPage && pageInfo.tableRows.length > 0)
          ) {
            const lastRow = pageInfo.tableRows[pageInfo.tableRows.length - 1];
            const isExactP11 = pageInfo.pageNumber === 11 && pageInfo.tableRows.length === 28;
            const rawEndLineY = isExactP11 ? 79.754 : pageH - (lastRow.y + lastRow.height) - 22.92;
            const endLineY = Math.max(75, rawEndLineY);
            const endTextY = isExactP11 ? 83.415 : endLineY + 3.661;

            page.drawRectangle({ x: 36, y: endLineY, width: 247.9, height: 0.5, color: rgb(0, 0, 0) });
            page.drawText("End of Statement", {
              x: 285.755,
              y: endTextY,
              size: 7,
              font: fontRegular,
              color: rgb(0, 0, 0),
            });
            page.drawRectangle({ x: 341.7, y: endLineY, width: 252.3, height: 0.5, color: rgb(0, 0, 0) });
          }
        }
      } else {
        const tableElem = template.elements.find((el) => el.type === "table");
        const tableY = pageInfo.tableY ?? 236;
        const headerH = tableElem?.tableHeaderHeight ?? 20;
        const headerTextColor = parseColor(tableElem?.tableHeaderTextColor || "#111827");
        const tableAccentRed = parseColor(tableElem?.tableBorderColor || "#d61a21");
        const tableX = tableElem?.x || template.pageSettings.margins.left;
        const tableW = tableElem?.width || (pageW - template.pageSettings.margins.left - template.pageSettings.margins.right);

        // Draw Top & Bottom Header Red Lines (No background box)
        page.drawLine({
          start: { x: tableX, y: pageH - tableY },
          end: { x: tableX + tableW, y: pageH - tableY },
          thickness: 0.8,
          color: tableAccentRed,
        });
        page.drawLine({
          start: { x: tableX, y: pageH - tableY - headerH },
          end: { x: tableX + tableW, y: pageH - tableY - headerH },
          thickness: 0.8,
          color: tableAccentRed,
        });

        // Draw Header Column Labels
        for (const h of pageInfo.tableHeaders) {
          const label = h.column.label;
          const font = fontBold;
          const fontSize = 6.5;
          const textW = font.widthOfTextAtSize(label, fontSize);
          let colX = h.x;

          if (h.column.align === "center") {
            colX = h.x + (h.width - textW) / 2;
          } else if (h.column.align === "right") {
            colX = h.x + h.width - textW;
          } else {
            colX = h.x;
          }

          page.drawText(label, {
            x: colX,
            y: pageH - tableY - headerH + 6.5,
            size: fontSize,
            font,
            color: headerTextColor,
          });
        }

        // Draw Table Rows
        for (const row of pageInfo.tableRows) {
          const rowPdfY = pageH - row.y - row.height;

          // Faint bottom row separator line
          page.drawLine({
            start: { x: tableX, y: rowPdfY },
            end: { x: tableX + tableW, y: rowPdfY },
            thickness: 0.35,
            color: rgb(236 / 255, 236 / 255, 236 / 255),
          });

          // Draw Cells
          let cellX = tableX;
          for (const cell of row.cells) {
            const col = cell.column;
            const colW = col.width;
            const text = cell.value;
            const font = fontRegular;
            const fontSize = 6.2;
            const textW = font.widthOfTextAtSize(text, fontSize);

            let drawX = cellX;
            if (col.align === "center") {
              drawX = cellX + (colW - textW) / 2;
            } else if (col.align === "right") {
              drawX = cellX + colW - textW;
            } else {
              drawX = cellX;
            }

            if (text) {
              page.drawText(text, {
                x: Math.max(cellX, drawX),
                y: rowPdfY + (row.height - fontSize) / 2 + 1,
                size: fontSize,
                font,
                color: rgb(0, 0, 0),
              });
            }

            cellX += colW;
          }
        }

        // If last table page, draw "———— End of Statement ————"
        if (pageInfo.isLastPage && template.category === "banking") {
          const lastRow = pageInfo.tableRows[pageInfo.tableRows.length - 1];
          const endY = lastRow ? lastRow.y + lastRow.height + 14 : tableY + 50;
          const endPdfY = pageH - endY;
          const endText = "End of Statement";
          const textW = fontRegular.widthOfTextAtSize(endText, 7);
          const centerX = tableX + (tableW - textW) / 2;

          page.drawLine({
            start: { x: tableX, y: endPdfY + 2.5 },
            end: { x: centerX - 6, y: endPdfY + 2.5 },
            thickness: 0.5,
            color: rgb(0, 0, 0),
          });
          page.drawText(endText, {
            x: centerX,
            y: endPdfY,
            size: 7,
            font: fontRegular,
            color: rgb(0, 0, 0),
          });
          page.drawLine({
            start: { x: centerX + textW + 6, y: endPdfY + 2.5 },
            end: { x: tableX + tableW, y: endPdfY + 2.5 },
            thickness: 0.5,
            color: rgb(0, 0, 0),
          });
        }
      }
    }
  }

  return await pdfDoc.save();
}
