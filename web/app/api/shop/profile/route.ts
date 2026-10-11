import { NextResponse } from "next/server";
import { currentShop } from "@/lib/workspace";

/** The onboarding toolkit reads this file: `dropout-onboard plan dropout-profile.json`. */
export async function GET() {
  const shop = await currentShop();
  if (!shop) return NextResponse.json({ error: "還沒選現場與功能" }, { status: 404 });
  return new NextResponse(JSON.stringify({ version: 1, profile: shop }, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dropout-profile.json"',
    },
  });
}
