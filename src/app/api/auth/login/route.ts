import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  clearFailures,
  createSessionToken,
  isLockedOut,
  isPasswordConfigured,
  recordFailure,
  verifyPassword,
} from "@/lib/auth";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: NextRequest) {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { success: false, error: "Access password is not set. Run `npm run set-password` on the server." },
      { status: 503 }
    );
  }

  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyPassword(password, process.env.GT_STUDIO_PASSWORD_HASH)) {
    recordFailure(ip);
    return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
  }

  clearFailures(ip);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}
