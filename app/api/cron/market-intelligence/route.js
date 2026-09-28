import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Unique marker - if this string is NOT in the response you see live,
// the deployed code is definitely not this version.
const CODE_VERSION = "MKT-V9-DIRECT";

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function extractJsonObject(text) {
  const cleaned = (text || "").replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function keyDiagnostic() {
  const key = process.env.ANTHROPIC_API_KEY || "";
  return {
    length: key.length,
    starts_with: key.slice(0, 12),
    ends_with: key.slice(-6),
  };
}

async function runMarketScan() {
  try {
    return await runMarketScanInner();
  } catch (e) {
    return NextResponse.json(
      { version: CODE_VERSION, error: "Uncaught error: " + (e?.message || String(e)), stack: e?.stack || null, key_length_only: (process.env.ANTHROPIC_API_KEY || "").length },
      { status: 500 }
    );
  }
}

async function runMarketScanInner() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ version: CODE_VERSION, error: "ANTHROPIC_API_KEY is not configured.", key_length_only: (process.env.ANTHROPIC_API_KEY || "").length }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ version: CODE_VERSION, error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 500 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await admin
    .from("market_snapshots")
    .select("id")
    .eq("snapshot_date", today)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ version: CODE_VERSION, ok: true, skipped: true, reason: "Today's snapshot already exists." });
  }

  const prompt = `Today is ${today}. Provide a brief Irish commercial energy market snapshot using only information you're confident about. Never invent current market figures - set anything you can't support to null, and keep pressure_score at 50 with pressure_label "Stable" when current evidence is unavailable.

Respond with ONLY a single compact JSON object, no other text, using exactly these keys: sem_day_ahead_eur_mwh, sem_change_7d_pct, gas_eur_mwh, gas_change_7d_pct, brent_usd_bbl, brent_change_7d_pct, carbon_eur_t, carbon_change_7d_pct, eur_usd, pressure_score, pressure_label (must be "Low", "Stable", "Elevated" or "High"), narrative (under 80 words, must state this is not a retail-price forecast), sources (up to 5 objects with name, url, as_of).`;

  let claudeRes;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return NextResponse.json({ version: CODE_VERSION, error: "Couldn't reach Anthropic: " + e.message, key_length_only: (process.env.ANTHROPIC_API_KEY || "").length }, { status: 502 });
  }

  const claudeData = await claudeRes.json();
  if (!claudeRes.ok) {
    return NextResponse.json(
      {
        version: CODE_VERSION,
        error: claudeData?.error?.message || "Anthropic returned an error",
        anthropic_status: claudeRes.status,
        anthropic_raw: claudeData,
        previous_snapshot_retained: true,
        key_length_only: (process.env.ANTHROPIC_API_KEY || "").length,
      },
      { status: 502 }
    );
  }

  const textBlock = claudeData.content?.find((c) => c.type === "text");
  const parsed = textBlock ? extractJsonObject(textBlock.text) : null;
  if (!parsed) {
    return NextResponse.json(
      { version: CODE_VERSION, error: "Couldn't parse a market snapshot from the response", previous_snapshot_retained: true },
      { status: 502 }
    );
  }

  const score = numberOrNull(parsed.pressure_score);
  const validLabels = new Set(["Low", "Stable", "Elevated", "High"]);

  const row = {
    snapshot_date: today,
    sem_day_ahead_eur_mwh: numberOrNull(parsed.sem_day_ahead_eur_mwh),
    sem_change_7d_pct: numberOrNull(parsed.sem_change_7d_pct),
    gas_eur_mwh: numberOrNull(parsed.gas_eur_mwh),
    gas_change_7d_pct: numberOrNull(parsed.gas_change_7d_pct),
    brent_usd_bbl: numberOrNull(parsed.brent_usd_bbl),
    brent_change_7d_pct: numberOrNull(parsed.brent_change_7d_pct),
    carbon_eur_t: numberOrNull(parsed.carbon_eur_t),
    carbon_change_7d_pct: numberOrNull(parsed.carbon_change_7d_pct),
    eur_usd: numberOrNull(parsed.eur_usd),
    pressure_score: Math.max(0, Math.min(100, score ?? 50)),
    pressure_label: validLabels.has(parsed.pressure_label) ? parsed.pressure_label : "Stable",
    narrative:
      typeof parsed.narrative === "string"
        ? parsed.narrative.slice(0, 1600)
        : "Market evidence was incomplete today. This is not a retail-price forecast.",
    source_meta: {
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [],
      generated_at: new Date().toISOString(),
    },
  };

  const { error } = await admin.from("market_snapshots").insert(row);
  if (error) {
    return NextResponse.json({ version: CODE_VERSION, error: error.message, previous_snapshot_retained: true }, { status: 500 });
  }

  return NextResponse.json({ version: CODE_VERSION, ok: true, snapshot_date: row.snapshot_date });
}

export async function GET(request) {
  if (!authorised(request)) return NextResponse.json({ version: CODE_VERSION, error: "Unauthorized" }, { status: 401 });
  return runMarketScan();
}

export async function POST(request) {
  if (!authorised(request)) return NextResponse.json({ version: CODE_VERSION, error: "Unauthorized" }, { status: 401 });
  return runMarketScan();
}