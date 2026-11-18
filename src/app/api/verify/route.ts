import { NextRequest, NextResponse } from "next/server";
import { findVerifiedStatement } from "@/lib/verification";

// Public lookup used by the verification page. Needs both the reference number and the account number.
export async function GET(req: NextRequest) {
  const ref = (req.nextUrl.searchParams.get("ref") || "").trim();
  const acc = (req.nextUrl.searchParams.get("acc") || "").trim();
  if (!ref || !acc || ref.length > 40 || acc.length > 40) {
    return NextResponse.json({ success: false, error: "Enter both the reference number and the account number" }, { status: 400 });
  }

  const statement = await findVerifiedStatement(ref, acc);
  const headers = { "Cache-Control": "no-store" };
  if (!statement) {
    return NextResponse.json({ success: false, error: "No matching statement was found" }, { status: 404, headers });
  }
  return NextResponse.json({ success: true, statement }, { headers });
}
