import { NextResponse, type NextRequest } from "next/server";
import { liveConfig } from "@/lib/sources/config";
import { liveMe } from "@/lib/sources/live";

function back(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/workspace/chat?chat=${reason}`, request.url));
}

/** Opens Chatwoot already logged in, through the Platform API single sign-on link for this staff member. */
export async function GET(request: NextRequest) {
  const chat = (await liveConfig()).chatwoot;
  if (!chat) return back(request, "not-connected");
  if (!chat.platformToken) return NextResponse.redirect(`${chat.url}/app/login`);
  let chatwootUserId: string | undefined;
  try {
    chatwootUserId = (await liveMe()).chatwootUserId;
  } catch {
    return NextResponse.redirect(new URL("/login?next=/workspace/chat", request.url));
  }
  if (!chatwootUserId) return back(request, "no-user");
  const res = await fetch(`${chat.url}/platform/api/v1/users/${encodeURIComponent(chatwootUserId)}/login`, {
    headers: { api_access_token: chat.platformToken },
    cache: "no-store",
  });
  if (!res.ok) return back(request, "sso-failed");
  const { url } = (await res.json()) as { url?: string };
  return url ? NextResponse.redirect(url) : back(request, "sso-failed");
}
