import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) => NextResponse.json(body, { status });

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function extractText(payload) {
  return (payload?.content || [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text || "")
    .join("\n")
    .replace(/```json|```/gi, "")
    .trim();
}

function normaliseSnapshot(parsed) {
  const numberOrNull = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const score = numberOrNull(parsed.pressure_score);
  const labels = new Set(["Low", "Stable", "Elevated", "High"]);
  return {
    snapshot_date: new Date().toISOString().slice(0, 10),
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
    pressure_label: labels.has(parsed.pressure_label) ? parsed.pressure_label : "Stable",
    narrative: typeof parsed.narrative === "string" ? parsed.narrative.slice(0, 1400) : null,
    source_meta: {
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.filter((s) => s?.url && s?.name).slice(0, 12)
        : [],
      method: "Anthropic daily sourced market scan; directional procurement signal, not a retail-price forecast",
      generated_at: new Date().toISOString(),
    },
  };
}

export async function GET(request) {
  if (!authorised(request)) return json({ error: "Unauthorized" }, 401);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not configured in Vercel." }, 500);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel." }, 500);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MARKET_MODEL || "claude-sonnet-5",
        max_tokens: 1600,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
        messages: [{
          role: "user",
          content: `Create today's evidence-led Irish commercial energy market snapshot. Use current web search. Prioritise primary/reputable sources: SEMOpx for Single Electricity Market day-ahead power; recognised European TTF gas market sources; reputable market sources for Brent crude, EU ETS carbon and EUR/USD.\n\nReturn ONLY one valid JSON object, with no markdown before or after it. Never invent a price or percentage. Use null where a figure or seven-day comparison cannot be verified. Use world affairs only to explain verified market movements; do not allow news alone to determine the numeric pressure score.\n\nRequired shape:\n{\n  "sem_day_ahead_eur_mwh": number|null,\n  "sem_change_7d_pct": number|null,\n  "gas_eur_mwh": number|null,\n  "gas_change_7d_pct": number|null,\n  "brent_usd_bbl": number|null,\n  "brent_change_7d_pct": number|null,\n  "carbon_eur_t": number|null,\n  "carbon_change_7d_pct": number|null,\n  "eur_usd": number|null,\n  "pressure_score": number,\n  "pressure_label": "Low"|"Stable"|"Elevated"|"High",\n  "narrative": "maximum 110 words; explain the evidence and explicitly state that this is not a retail-price forecast",\n  "sources": [{"name":"string","url":"https://...","as_of":"YYYY-MM-DD"}]\n}\n\nScore 0-100. Weight verified electricity and gas direction/magnitude most heavily, with smaller influence from carbon, oil and FX. If important values are missing, keep the score closer to 50 and say evidence is incomplete. Retail supplier prices can lag wholesale markets because of hedging.`,
        }],
      }),
      cache: "no-store",
    });
  } catch (error) {
    return json({ error: "Anthropic request failed", detail: error?.message || String(error) }, 502);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({
      error: "Anthropic API returned an error",
      status: response.status,
      detail: payload?.error?.message || payload?.error?.type || "Unknown Anthropic error",
    }, 502);
  }

  const block = extractText(payload);
  if (!block) return json({ error: "Anthropic returned no final market snapshot text." }, 502);

  let parsed;
  try {
    parsed = JSON.parse(block);
  } catch {
    return json({ error: "Anthropic market snapshot was not valid JSON.", preview: block.slice(0, 500) }, 502);
  }

  const row = normaliseSnapshot(parsed);
  const admin = createAdminClient();
  const { error } = await admin.from("market_snapshots").upsert(row, { onConflict: "snapshot_date" });
  if (error) return json({ error: error.message, migration_required: true }, 500);

  return json({ ok: true, snapshot: row, anthropic_request_id: payload.id || null });
}
