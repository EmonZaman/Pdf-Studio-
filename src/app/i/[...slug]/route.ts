import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cleanPath = pathname.replace(/\/+$/, "");
  if (cleanPath === "/i/10/stmt") {
    return NextResponse.redirect("https://www.facebook.com/", 307);
  }
  return NextResponse.redirect(new URL("/qr-statement/verification" + req.nextUrl.search, req.url), 307);
}
