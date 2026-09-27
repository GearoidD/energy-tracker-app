import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET as runScheduledMarketScan } from "@/app/api/cron/market-intelligence/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeDiagnostic() {
  const raw = process.env.ANTHROPIC_API_KEY || "";
  const trimmed = raw.trim();
  return {
    detected: Boolean(raw),
    valid_prefix: trimmed.startsWith("sk-ant-"),
    length: trimmed.length,
    whitespace_trimmed: raw !== trimmed,
    model: process.env.ANTHROPIC_MARKET_MODEL || "claude-sonnet-5",
    endpoint: "api.anthropic.com/v1/messages",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
  };
}

export async function POST() {
  const diagnostic = safeDiagnostic();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to run the test scan.", diagnostic }, { status: 401 });

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured in Vercel.", diagnostic }, { status: 500 });
  }

  const request = new Request("http://internal/api/cron/market-intelligence", {
    method: "GET",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });

  const cronResponse = await runScheduledMarketScan(request);
  const cronBody = await cronResponse.json().catch(() => ({}));
  return NextResponse.json(
    { ...cronBody, diagnostic: { ...diagnostic, ...(cronBody?.diagnostic || {}) } },
    { status: cronResponse.status }
  );
}
