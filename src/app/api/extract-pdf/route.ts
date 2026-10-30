import { NextRequest, NextResponse } from "next/server";
import { recalculateStatementBalances, sortTransactionsChronologically } from "@/lib/balance-calculator";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No PDF file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF text using direct pdf-parse library with coordinate-aware pagerender
    let text = "";
    try {
      const nodeRequire = eval("require");
      const pdf = nodeRequire("pdf-parse/lib/pdf-parse.js");
      const pagerender = (pageData: any) => {
        return pageData.getTextContent().then((textContent: any) => {
          let lastY: number | null = null;
          let text = "";
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || lastY === null) {
              text += " " + item.str;
            } else {
              text += "\n" + item.str;
            }
            lastY = item.transform[5];
          }
          return text;
        });
      };
      const parsed = await pdf(buffer, { pagerender });
      text = parsed.text || "";
    } catch (parseErr) {
      console.warn("pdf-parse fallback to pypdf triggered:", parseErr);
      const { execFileSync } = await import("child_process");
      const fs = await import("fs");
      const tmpPdf = `/tmp/extract-${Date.now()}.pdf`;
      fs.writeFileSync(tmpPdf, buffer);
      try {
        text = execFileSync("python3", [
          "-c",
          "import pypdf, sys; r = pypdf.PdfReader(sys.argv[1]); print('\\n'.join(p.extract_text() for p in r.pages))",
          tmpPdf,
        ], { encoding: "utf-8" });
      } finally {
        if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
      }
    }

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Could not extract text from the PDF document. Ensure it is a valid vector/text PDF." },
        { status: 422 }
      );
    }

    // Detect Bank from header text (first 1500 chars)
    const headerSlice = text.substring(0, 1500).toLowerCase();
    let templateId = "city-bank-statement";
    let bankName = "City Bank";

    if (headerSlice.includes("islami bank") || headerSlice.includes("ibbl") || headerSlice.includes("mudaraba")) {
      templateId = "islami-bank-statement";
      bankName = "Islami Bank Bangladesh";
    } else if (headerSlice.includes("brac bank") || headerSlice.includes("astha")) {
      templateId = "brac-bank-statement";
      bankName = "BRAC Bank";
    } else if (headerSlice.includes("eastern bank") || headerSlice.includes("ebl") || headerSlice.includes("skybanking")) {
      templateId = "eastern-bank-statement";
      bankName = "Eastern Bank (EBL)";
    } else if (headerSlice.includes("city bank") || headerSlice.includes("citybank") || headerSlice.includes("citytouch") || headerSlice.includes("cbl.fyi")) {
      templateId = "city-bank-statement";
      bankName = "City Bank";
    }

    // Extract Account Holder Name
    let customerName = "MD. MONIRUZZAMAN EMON";
    const nameMatch =
      text.match(/Page\s+1\s+of\s+\d+\s*\n+([^\n\r]+)/i) ||
      text.match(/Page\s+\d+\s+of\s+\d+\s*\n+([A-Z\.\s]{3,50})\s+VERIFY/i) ||
      text.match(/((?:MD\.|MR\.|MS\.|MRS\.)\s+[A-Z\.\s]{3,40})/i);

    if (nameMatch) {
      const raw = nameMatch[1] || nameMatch[0];
      customerName = raw.split("\n")[0].replace(/VERIFY.*/i, "").trim();
    }

    // Extract Address (supports 1 or 2 lines between VERIFY THIS STATEMENT and Can't scan / Account No.)
    let address = "";
    const addrBlockMatch = text.match(
      /VERIFY\s*THIS\s*STATEMENT[^\n\r]*\n+([\s\S]+?)(?=\n+\s*(?:Can't scan|Account No\.))/i
    );
    if (addrBlockMatch && addrBlockMatch[1]) {
      const cleanedLines = addrBlockMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(
          (l) =>
            l.length > 0 &&
            !/VERIFY\s*THIS\s*STATEMENT/i.test(l) &&
            !/Valid\s*for/i.test(l) &&
            !/^Page\s+\d+/i.test(l) &&
            l.toUpperCase() !== customerName.toUpperCase()
        );
      if (cleanedLines.length > 0) {
        address = cleanedLines.join("\n");
      }
    }
    if (!address) {
      const fallbackAddr = text.match(/([^\n\r]{10,120},\s*DHAKA[^\n\r]*)/i);
      if (fallbackAddr) {
        address = fallbackAddr[1].replace(/Can't scan[\s\S]*/i, "").trim();
      } else {
        address = "TWINBIT LTD,HOUSE-715,ROAD-11 AVENUE-03,MIRPUR , DHAKA, BANGLADESH";
      }
    }

    // Extract Account No
    let accountNo = "2304435091001";
    const accMatch = text.match(/Account No\.?\s*:\s*([0-9]{8,20})/i);
    if (accMatch) {
      accountNo = accMatch[1].trim();
    }

    // Extract Account Type
    let accountType = "HIGH VALUE SAVINGS A/C";
    const typeMatch = text.match(/Account Type\s*:\s*\n*\s*([^\n\r]+?)(?=\s*Account Status|\s*Branch|\n|$)/i);
    if (typeMatch) {
      accountType = typeMatch[1].trim();
    }

    // Extract Account Status
    let accountStatus = "ACTIVE";
    const statusMatch = text.match(/Account Status\s*:\s*([A-Za-z]+?)(?=\s*Branch|\n|$)/i);
    if (statusMatch) {
      accountStatus = statusMatch[1].trim().toUpperCase();
    }

    // Extract Branch
    let branch = "PALLABI BRANCH";
    const branchMatch = text.match(/Branch\s*:\s*([A-Za-z0-9\s]+?)(?=\n|0S|\s*$)/i);
    if (branchMatch) {
      branch = branchMatch[1].trim().replace(/\s+0S[A-Z0-9]+.*/i, "").trim();
    }

    // Extract Reference No
    let referenceNo = "0S18HDHYANSPV";
    const refMatch = text.match(/([0-9A-Z]{12,18})(?=\s*ACCOUNT SUMMARY|\s*\n)/);
    if (refMatch) {
      referenceNo = refMatch[1].trim();
    }

    // Extract Verification URL
    let verifyUrl = "http://t.cbl.fyi/i/10/stmt";
    const urlMatch = text.match(/(https?:\/\/[^\s\n\r]+)/i);
    if (urlMatch) {
      verifyUrl = urlMatch[1].trim();
    }

    // Extract Dates
    let openingDate = "01 Oct 2025";
    let statementEndDate = "24 Oct 2026";
    let generationDate = "25 Oct 2026";
    let currency = "BDT";

    const dateRangeMatch = text.match(/From\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*to\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
    if (dateRangeMatch) {
      openingDate = dateRangeMatch[1].trim();
      statementEndDate = dateRangeMatch[2].trim();
    }

    const genMatch = text.match(/Date of Generation:\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
    if (genMatch) {
      generationDate = genMatch[1].trim();
    }

    const currMatch = text.match(/Currency:\s*([A-Z]{3})/i);
    if (currMatch) {
      currency = currMatch[1].trim();
    }

    // Extract Opening Balance
    let openingBalance = "2,261.58";
    const openBalRowMatch = text.match(/Opening Balance\s+[-—]\s+([0-9,]+\.[0-9]{2})/i);
    if (openBalRowMatch) {
      openingBalance = openBalRowMatch[1].trim();
    }

    // Parse Transactions
    const lines = text.split("\n");
    const transactions: any[] = [];
    const txRegex = /^(\d{2}\s+[A-Za-z]{3}\s+\d{4})\s+(.+?)\s+([-\w]+)\s+([0-9,]+\.[0-9]{2})\s+([0-9,]+\.[0-9]{2})\s+([0-9,]+\.[0-9]{2})$/;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const m = line.match(txRegex);
      if (m) {
        transactions.push({
          date: m[1].trim(),
          description: m[2].trim(),
          chq: m[3].trim(),
          withdrawal: m[4].trim(),
          deposit: m[5].trim(),
          balance: m[6].trim(),
        });
      }
    }

    // Ensure all transactions are sorted chronologically
    const sortedTransactions = sortTransactionsChronologically(transactions);

    // Run high-precision automatic balance calculations
    const calc = recalculateStatementBalances(openingBalance, sortedTransactions, true);

    const extractedData = {
      customerName,
      address,
      accountNo,
      accountType,
      accountStatus,
      branch,
      verifyUrl,
      referenceNo,
      openingDate,
      statementEndDate,
      generationDate,
      currency,
      openingBalance,
      totalDeposits: calc.totalDeposits,
      totalWithdrawals: calc.totalWithdrawals,
      availableBalance: calc.availableBalance,
      website: templateId === "islami-bank-statement" ? "islamibankbd.com" : templateId === "brac-bank-statement" ? "bracbank.com" : templateId === "eastern-bank-statement" ? "ebl.com.bd" : "citybankplc.com",
      phoneLocal: templateId === "islami-bank-statement" ? "16259 (Local)" : templateId === "brac-bank-statement" ? "16221 (Local)" : templateId === "eastern-bank-statement" ? "16230 (Local)" : "16234 (Local)",
      phoneOverseas: templateId === "islami-bank-statement" ? "+880 2 8331000 (Overseas)" : templateId === "brac-bank-statement" ? "+880 2 8801221 (Overseas)" : templateId === "eastern-bank-statement" ? "+880 2 8332230 (Overseas)" : "+880 2 8331040 (Overseas)",
      notesDisclaimer: "This is a system generated statement and requires no signature. Please advise the bank of any discrepancy within 14 days of receipt of this statement (if any), otherwise, this statement will be deemed correct.",
      transactions: calc.updatedTransactions,
    };

    return NextResponse.json({
      success: true,
      bankName,
      templateId,
      totalRows: calc.updatedTransactions.length,
      data: extractedData,
    });
  } catch (error: any) {
    console.error("PDF Extraction error:", error);
    return NextResponse.json({ error: error.message || "Failed to process PDF" }, { status: 500 });
  }
}
