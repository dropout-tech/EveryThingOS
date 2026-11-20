import { NextResponse, type NextRequest } from "next/server";
import { isRetiredDemoApiPath } from "./lib/retired-demo";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isRetiredDemoApiPath(path)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/hr/:path*", "/api/letter/:path*", "/api/chat/open"],
};