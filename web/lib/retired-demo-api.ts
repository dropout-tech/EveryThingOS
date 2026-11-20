import { NextResponse, type NextRequest } from "next/server";
import { isRetiredDemoApiPath } from "./retired-demo";

export function retiredDemoApiBlocked(request: NextRequest): NextResponse | null {
  const path = new URL(request.url).pathname;
  if (!isRetiredDemoApiPath(path)) return null;
  return new NextResponse(null, { status: 404 });
}