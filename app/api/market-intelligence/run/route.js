import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("active_company_id").eq("id", user.id).single();
  if (!profile?.active_company_id) return NextResponse.json({ error: "No active company" }, { status: 403 });

  const { data: membership } = await supabase.from("company_members").select("role").eq("company_id", profile.active_company_id).eq("user_id", user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not a company member" }, { status: 403 });

  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured in Vercel." }, { status: 500 });

  const origin = new URL(request.url).origin;
  const result = await fetch(`${origin}/api/cron/market-intelligence`, {
    method: "GET",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
  });
  const payload = await result.json().catch(() => ({ error: "Market scan returned an unreadable response." }));
  return NextResponse.json(payload, { status: result.status });
}
