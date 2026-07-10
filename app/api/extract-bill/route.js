import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// This runs on the server only — the API key never reaches the browser.
export async function POST(request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { fuelType, usageBand, micKva, gasTariff } = await request.json();

    if (!fuelType) {
      return NextResponse.json({ error: "Missing fuel type" }, { status: 400 });
    }

    let supplyContext;
    if (fuelType === "gas" && gasTariff) {
      const tariffExplainer = {
        SBU: "SBU (Small Business User) — under 73,000 kWh/year, priced as a standing charge plus a commodity unit rate, no separate capacity charge",
        MBU: "MBU (Medium Business User) — 73,000 to 750,000 kWh/year with Supply Point Capacity under 3,750 kWh, priced as a standing charge, unit rate, AND a separate capacity charge",
        FVT: "FVT (Fuel Variation Tariff) — over 750,000 kWh/year or SPC over 3,750 kWh, complex high-demand billing",
      };
      supplyContext = `This business is classified as an Irish ${tariffExplainer[gasTariff] || gasTariff} gas tariff. Search specifically for current ${gasTariff} gas rates — not a generic business gas rate, since the pricing structure genuinely differs between SBU, MBU, and FVT tiers.`;
    } else if (fuelType !== "gas" && micKva) {
      supplyContext = `This business has a Maximum Import Capacity (MIC) of ${micKva} kVA, which in Ireland means its electricity pricing structure includes both a per-unit rate AND a separate MIC/capacity charge (typically billed per kVA per year or month), not just a flat unit rate — search for both parts, not only the unit rate.`;
    } else if (fuelType !== "gas") {
      supplyContext = `This is a standard small/medium business account without a separate MIC capacity charge — search for its typical all-in unit rate, the way most SME accounts under ~30kVA are priced in Ireland.`;
    } else {
      supplyContext = `This is a standard small business gas account — search for typical SBU (Small Business User) gas rates, since that's the default tier for lower-usage gas accounts in Ireland.`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content: `Search for the current typical unit rate for small/medium business ${fuelType} in Ireland${
              usageBand ? ` for a business using around ${usageBand} kWh per year` : ""
            }. ${supplyContext} Note that Irish SME energy pricing is usually quoted per business rather than published as a fixed rate card, so if you can't find an SME-specific figure, use published residential rates as a reasonable proxy and say so clearly in the note.

After searching, respond with ONLY a JSON object, no other text, no markdown fences, with these exact keys:
{
  "typical_rate": number, the typical unit rate in cents per kWh,
  "typical_standing_charge": number or null, typical daily standing charge in cents if you found one,
  "typical_mic_charge": number or null, only if a MIC/capacity charge is relevant — typical charge per kVA (state the unit, e.g. "per kVA per annum", within source_note) — otherwise null,
  "supplier": "string or null — if the figure you found is attributed to a specific named supplier (e.g. Energia, Electric Ireland, Bord Gáis, SSE Airtricity, Pinergy), name them here. If it's a blended/average figure from a comparison site with no single supplier attached, set this to null",
  "source_note": "a short string naming the website/source you found this on, and whether this is an SME figure or a residential proxy, e.g. 'Selectra.ie, residential proxy, July 2026'",
  "as_of": "the month/year this data reflects, as a string"
}
Do not fabricate a number if you found nothing relevant — in that case set typical_rate to null and explain briefly in source_note instead.`,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || "Claude API error" }, { status: 500 });
    }

    const textBlock = [...(data.content || [])].reverse().find((c) => c.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "No response from Claude" }, { status: 500 });
    }

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    let suggestion;
    try {
      suggestion = JSON.parse(cleaned);
    } catch (e) {
      // Fall back to pulling out just the {...} object in case there's stray text around it
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          suggestion = JSON.parse(match[0]);
        } catch (e2) {
          return NextResponse.json({ error: "Couldn't parse the suggested rate. Raw response: " + cleaned.slice(0, 300) }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: "Couldn't parse the suggested rate. Raw response: " + cleaned.slice(0, 300) }, { status: 500 });
      }
    }

    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Something went wrong" }, { status: 500 });
  }
}
