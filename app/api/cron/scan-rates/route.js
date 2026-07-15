import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ELECTRICITY_TIERS = ["DG5", "DG6"]; // the two that cover the overwhelming majority of SMEs
const GAS_TIERS = ["SBU", "MBU"];

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results = [];

  const targets = [
    ...ELECTRICITY_TIERS.map((t) => ({ fuel_type: "electricity", tariff_tier: t })),
    ...GAS_TIERS.map((t) => ({ fuel_type: "gas", tariff_tier: t })),
  ];

  for (const target of targets) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 600,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [
            {
              role: "user",
              content: `Search for current indicative Irish business ${target.fuel_type} rates for a ${target.fuel_type === "gas" ? "gas" : "electricity"} account classified as ${target.tariff_tier}. I need a realistic current unit rate in c/kWh, based on real published or broker-cited figures — not a guess. If you genuinely cannot find real current data for this specific tier, say so clearly rather than estimating. Respond with ONLY a JSON object, no other text, no markdown fences:
{
  "rate": number or null — the indicative unit rate in c/kWh,
  "capacity_charge": number or null — only for electricity, an indicative capacity charge per kVA per year if found,
  "source_note": "string — briefly describe where this figure came from (e.g. 'Utilityfair published range, July 2026') so a human can judge how much to trust it. If no real data was found, explain that here and set rate to null."
}`,
            },
          ],
        }),
      });

      const data = await response.json();
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock) continue;

      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        continue;
      }

      if (parsed.rate === null || parsed.rate === undefined) continue;

      await admin.from("rate_scan_queue").insert({
        fuel_type: target.fuel_type,
        tariff_tier: target.tariff_tier,
        rate: parsed.rate,
        capacity_charge: parsed.capacity_charge || null,
        source_note: parsed.source_note || null,
        status: "pending",
      });

      results.push({ ...target, rate: parsed.rate });
    } catch (e) {
      console.error(`Scan failed for ${target.fuel_type}/${target.tariff_tier}:`, e.message);
    }
  }

  return NextResponse.json({ scanned: targets.length, queued: results.length, results });
}
