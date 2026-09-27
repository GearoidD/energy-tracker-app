import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { runMarketScan } from "@/app/api/cron/market-intelligence/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to run the test scan." }, { status: 401 });

  // Diagnostic is added as an HTTP response header, independent of Anthropic's
  // response body, so an upstream 401 cannot overwrite or hide it.
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  const fingerprint = key ? createHash("sha256").update(key, "utf8").digest("hex") : "NONE";

  const response = await runMarketScan();
  response.headers.set("x-gnorate-build", "7P");
  response.headers.set("x-gnorate-key-sha256", fingerprint);
  return response;
}
