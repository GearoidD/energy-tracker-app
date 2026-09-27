import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET as runScheduledMarketScan } from "@/app/api/cron/market-intelligence/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to run the test scan." }, { status: 401 });

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured in Vercel." }, { status: 500 });
  }

  // Execute the exact same handler used by the 06:15 scheduled job.
  const request = new Request("http://internal/api/cron/market-intelligence", {
    method: "GET",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return runScheduledMarketScan(request);
}
