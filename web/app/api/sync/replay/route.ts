import { NextResponse, type NextRequest } from "next/server";
import { here } from "@/lib/auth";
import { sameOrigin } from "@/lib/actions";
import { liveConfig } from "@/lib/sources/config";
import { getMe } from "@/lib/sources";

/** Resends one dead letter through the glue. Only ERPNext System Managers may do this. */
export async function POST(request: NextRequest) {
  const config = await liveConfig();
  const glue = config.glue;
  const back = (state: string) => NextResponse.redirect(here(`/workspace/settings?sync=${state}#sync`, request), 303);
  if (!glue) return back("not-connected");
  if (!sameOrigin(request, { json: false })) return back("denied");
  const me = await getMe();
  if (me.origin === "live" && !me.data?.roles.includes("System Manager")) return back("denied");
  if (me.origin === "error") return back("denied");
  const id = Number((await request.formData()).get("id"));
  if (!Number.isInteger(id) || id <= 0) return back("bad-id");
  const res = await fetch(`${glue.url}/admin/dead-letters/${id}/replay?site=${encodeURIComponent(glue.site)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${glue.adminToken}` },
    cache: "no-store",
  });
  return back(res.ok ? "replayed" : "failed");
}
