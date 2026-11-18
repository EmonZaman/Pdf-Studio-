import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Every page and API route requires a valid session, except public assets, login, and statement verification.
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const cleanPath = pathname.replace(/\/+$/, "") || "/";

  // Redirect /i/10/stmt directly to https://www.facebook.com/
  if (cleanPath === "/i/10/stmt") {
    return NextResponse.redirect("https://www.facebook.com/", 307);
  }

  // Automatically redirect /verify to the official /qr-statement/verification page
  if (cleanPath === "/verify") {
    const dest = new URL("/qr-statement/verification" + search, req.url);
    return NextResponse.redirect(dest, 307);
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "Sign in required" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  const next = pathname + search;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Static assets, the pdf.js worker, login and public statement verification routes stay open
  matcher: [
    "/((?!_next/|images/|pdfjs/|pdf\\.worker\\.min\\.mjs|favicon\\.ico|login$|verify|qr-statement|i/|api/auth/|api/verify$).*)",
  ],
};
