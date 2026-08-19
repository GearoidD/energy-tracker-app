import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("active_company_id").eq("id", user.id).maybeSingle();

  const { quoteText } = await request.json();
  if (!quoteText || quoteText.trim().length < 20) {
    return NextResponse.json({ error: "Paste the full quote text first" }, { status: 400 });
  }

  const extractionPrompt = `You are reading a business energy quote email from an Irish energy supplier. Extract every distinct rate offer mentioned - a single email can contain several (different fuel types, different tariff bands like SBU/MBU/FVT for gas, or DG1-DG10 for electricity).

For EACH distinct rate offer found, extract:
- provider: the supplier company name (e.g. "Electric Ireland", "Flogas", "Energia")
- fuel_type: "electricity" or "gas"
- tariff_band: the specific classification if stated (e.g. "SBU", "MBU", "FVT", "DG1", "DG5") - null if not stated
- unit_rate_cents: the per-kWh rate, converted to CENTS (e.g. €0.09923/kWh becomes 9.923)
- standing_charge_cents: the per-day standing charge, converted to CENTS (e.g. €0.4610/day becomes 46.10)
- contract_length_months: if stated, otherwise null
- valid_until: if a validity/expiry date is stated, in YYYY-MM-DD format, otherwise null
- notes: any other relevant detail in one short sentence (exit fees, conditions, meter/GPRN numbers mentioned) - otherwise null

Respond with ONLY a JSON array, no other text, no markdown fences:
[{"provider": "...", "fuel_type": "...", "tariff_band": "...", "unit_rate_cents": 0, "standing_charge_cents": 0, "contract_length_months": null, "valid_until": null, "notes": "..."}]

Quote text:
${quoteText}`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: extractionPrompt }],
      }),
    });
    const claudeData = await claudeRes.json();
    const textBlock = claudeData.content?.find((c) => c.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "Couldn't read that quote - try pasting it again" }, { status: 500 });
    }

    let cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1) {
      cleaned = cleaned.slice(firstBracket, lastBracket + 1);
    }

    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch (e) {
      return NextResponse.json({ error: "Couldn't parse the extracted rates - the quote format may be unusual" }, { status: 500 });
    }

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return NextResponse.json({ error: "No rates found in that quote" }, { status: 400 });
    }

    const admin = createAdminClient();
    const rows = extracted.map((r) => ({
      provider: r.provider || null,
      fuel_type: r.fuel_type || null,
      tariff_tier: r.tariff_band || null,
      rate: r.unit_rate_cents ?? null,
      standing_charge: r.standing_charge_cents ?? null,
      valid_until: r.valid_until || null,
      source: "user_verified",
      submitted_by: user.id,
      submitted_by_company: profile?.active_company_id || null,
    }));

    const { error: insertError } = await admin.from("master_rates").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: `Extraction worked, but saving failed: ${insertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ added: rows.length, rates: extracted });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Something went wrong" }, { status: 500 });
  }
}