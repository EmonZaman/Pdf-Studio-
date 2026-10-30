import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Every page and API route requires a valid session, except the login screen and its API.
export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(token)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "Sign in required" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Static assets, the pdf.js worker and the login route stay public
  matcher: ["/((?!_next/|images/|pdfjs/|pdf\\.worker\\.min\\.mjs|favicon\\.ico|login$|api/auth/).*)"],
};
