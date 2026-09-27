import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runMarketScan } from "@/app/api/cron/market-intelligence/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to run the test scan." }, { status: 401 });
  return runMarketScan();
}
