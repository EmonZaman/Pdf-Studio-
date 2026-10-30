import { NextRequest, NextResponse } from "next/server";
import { addHistory, listHistory } from "@/lib/history-storage";

export async function GET() {
  return NextResponse.json({ success: true, entries: listHistory() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.templateId !== "string" || typeof body.data !== "object" || body.data === null) {
    return NextResponse.json({ success: false, error: "templateId and data are required" }, { status: 400 });
  }
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  const entry = addHistory({
    label: str(body.label, 120) || `${str(body.bankName)} · ${str(body.accountName)}`,
    templateId: str(body.templateId),
    bankName: str(body.bankName),
    accountName: str(body.accountName),
    accountNo: str(body.accountNo),
    period: str(body.period),
    data: body.data,
  });
  return NextResponse.json({ success: true, entry }, { status: 201 });
}
