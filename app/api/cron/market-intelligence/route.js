import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body, status = 200) => NextResponse.json(body, { status });

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function textBlocks(payload) {
  return (payload?.content || [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean);
}

function extractJsonObject(payload) {
  const blocks = textBlocks(payload);
  // Prefer a text block that is already a complete JSON object.
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const clean = blocks[i].replace(/```json|```/gi, "").trim();
    try {
      const parsed = JSON.parse(clean);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  // Fall back to extracting the outermost object from all final text blocks.
  const joined = blocks.join("\n").replace(/```json|```/gi, "").trim();
  const start = joined.indexOf("{");
  const end = joined.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(joined.slice(start, end + 1)); } catch {}
  }
  return null;
}

function extractSources(payload, parsed) {
  const seen = new Set();
  const out = [];
  const add = (name, url, asOf = null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ name: name || "Source", url, as_of: asOf || null });
  };

  for (const block of payload?.content || []) {
    if (block?.type === "text") {
      for (const citation of block.citations || []) {
        add(citation?.title, citation?.url);
      }
    }
    if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result?.type === "web_search_result") add(result.title, result.url, result.page_age);
      }
    }
  }
  for (const source of parsed?.sources || []) add(source?.name, source?.url, source?.as_of);
  return out.slice(0, 12);
}

function normaliseSnapshot(parsed, sources, requestId, searchRequests) {
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
    narrative: typeof parsed.narrative === "string" ? parsed.narrative.slice(0, 1600) : "Market evidence was incomplete today. GnóRate has kept the directional signal close to neutral. This is not a retail-price forecast.",
    source_meta: {
      sources,
      method: "One scheduled Anthropic Messages API request per day, with at most one server-side web search; directional procurement signal, not a retail-price forecast",
      generated_at: new Date().toISOString(),
      anthropic_request_id: requestId || null,
      web_search_requests: searchRequests ?? null,
    },
  };
}

export async function GET(request) {
  if (!authorised(request)) return json({ error: "Unauthorized" }, 401);
  const rawAnthropicKey = process.env.ANTHROPIC_API_KEY || "";
  const anthropicKey = rawAnthropicKey.trim();
  const keyDiagnostic = {
    detected: Boolean(rawAnthropicKey),
    valid_prefix: anthropicKey.startsWith("sk-ant-"),
    length: anthropicKey.length,
    whitespace_trimmed: rawAnthropicKey !== anthropicKey,
  };
  if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY is not configured in Vercel.", diagnostic: keyDiagnostic }, 500);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel." }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();

  // Idempotency: a retry of today's cron must not spend another Claude call if today is already stored.
  const { data: existing } = await admin
    .from("market_snapshots")
    .select("id,snapshot_date")
    .eq("snapshot_date", today)
    .maybeSingle();
  if (existing) return json({ ok: true, skipped: true, reason: "Today's shared market snapshot already exists." });

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MARKET_MODEL || "claude-sonnet-5",
        max_tokens: 4096,
        // One Messages API request and at most one web-search execution per day.
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 1,
          allowed_callers: ["direct"],
        }],
        messages: [{
          role: "user",
          content: `Today is ${today}. Create today's GnóRate Irish commercial-energy market snapshot. Use at most ONE broad web search covering Irish SEM electricity, European/TTF gas, Brent, EU ETS carbon, EUR/USD and major current energy drivers. Prioritise primary/reputable sources.\n\nIMPORTANT: Be extremely concise. Do not write research notes, analysis, citations or prose before the final answer. After the search, immediately return ONLY one compact valid JSON object. Never invent numbers; use null when unverified. Keep pressure_score near 50 when evidence is incomplete.\n\nJSON keys exactly: sem_day_ahead_eur_mwh, sem_change_7d_pct, gas_eur_mwh, gas_change_7d_pct, brent_usd_bbl, brent_change_7d_pct, carbon_eur_t, carbon_change_7d_pct, eur_usd, pressure_score, pressure_label, narrative, sources. pressure_label must be Low, Stable, Elevated or High. narrative must be <=80 words and state this is not a retail-price forecast. sources must contain at most 5 objects with name, url and as_of. Weight verified electricity and gas most heavily, then carbon, oil and FX. Supplier hedging means retail prices can lag wholesale markets. OUTPUT JSON ONLY.`,
        }],
      }),
      cache: "no-store",
    });
  } catch (error) {
    return json({ error: "Daily Anthropic request failed; yesterday's snapshot remains available.", detail: error?.message || String(error) }, 502);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({
      error: "Anthropic API returned an error; the previous successful snapshot remains live.",
      status: response.status,
      detail: payload?.error?.message || payload?.error?.type || "Unknown Anthropic error",
      request_id: response.headers.get("request-id") || payload?.request_id || null,
      diagnostic: {
        ...keyDiagnostic,
        endpoint: "api.anthropic.com/v1/messages",
        auth_method: "x_api_key",
        model: process.env.ANTHROPIC_MARKET_MODEL || "claude-sonnet-5",
        anthropic_error_type: payload?.error?.type || null,
      },
    }, 502);
  }

  // We deliberately do not continue pause_turn: that would create a second Claude API request.
  if (payload?.stop_reason === "pause_turn") {
    return json({ error: "Daily research did not finish within the single-call limit; previous snapshot retained.", stop_reason: "pause_turn" }, 502);
  }

  const parsed = extractJsonObject(payload);
  if (!parsed) {
    return json({
      error: "Anthropic did not return a parseable final market snapshot; previous snapshot retained.",
      stop_reason: payload?.stop_reason || null,
      text_blocks: textBlocks(payload).length,
      request_id: payload?.id || null,
    }, 502);
  }

  const sources = extractSources(payload, parsed);
  const searchRequests = payload?.usage?.server_tool_use?.web_search_requests ?? null;
  const row = normaliseSnapshot(parsed, sources, payload?.id, searchRequests);
  const { error } = await admin.from("market_snapshots").insert(row);
  if (error) return json({ error: error.message, previous_snapshot_retained: true }, 500);

  return json({ ok: true, snapshot_date: row.snapshot_date, anthropic_request_id: payload?.id || null, web_search_requests: searchRequests });
}
