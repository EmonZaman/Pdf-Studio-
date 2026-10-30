import { NextRequest, NextResponse } from "next/server";
import { deleteHistory, renameHistory } from "@/lib/history-storage";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 120) : "";
  if (!label) {
    return NextResponse.json({ success: false, error: "A name is required" }, { status: 400 });
  }
  const entry = renameHistory(id, label);
  if (!entry) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, entry });
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const ok = deleteHistory(id);
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 404 });
}
