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

    const { base64, mediaType } = await request.json();

    if (!base64 || !mediaType) {
      return NextResponse.json({ error: "Missing file data" }, { status: 400 });
    }

    const isPdf = mediaType === "application/pdf";

    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `This is an energy bill (electricity or gas). Read it and return ONLY a JSON object, no other text, no markdown fences, with these exact keys:
{
  "reading_date": "YYYY-MM-DD or null, the billing period end date",
  "usage": number or null, the energy used in kWh for this billing period,
  "rate": number or null, the unit rate charged in cents per kWh (convert if shown in a different unit). If the bill shows separate day/night/peak rates rather than one flat rate, put the day rate here,
  "standing_charge": number or null, the daily standing charge in cents,
  "provider": "string or null, the supplier name",
  "account_number": "string or null, the MPRN (electricity) or GPRN (gas) shown on the bill — this is the meter point reference number, not the supplier's customer/account number",
  "fuel_type": "electricity or gas — read this from the bill itself, don't guess",
  "contract_end": "YYYY-MM-DD or null — only if the bill explicitly states a contract end/renewal/expiry date, not the billing period date",
  "mic_kva": number or null — only for electricity bills, the Maximum Import Capacity in kVA if shown,
  "spc_kwh": number or null — only for gas bills, the Supply Point Capacity in kWh if shown,
  "rate_note": "string or null — if the bill shows more than one rate (e.g. day/night/peak, or a tiered rate), briefly describe them here so the user knows the single 'rate' field above is a simplification. Otherwise null",
  "confidence": "high, medium, or low — how confident you are these numbers are read correctly"
}
If a field isn't visible on the bill, use null for it. Do not guess or estimate a number that isn't shown.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || "Claude API error" }, { status: 500 });
    }

    const textBlock = data.content?.find((c) => c.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "No response from Claude" }, { status: 500 });
    }

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch (e) {
      return NextResponse.json({ error: "Couldn't parse the extracted data" }, { status: 500 });
    }

    return NextResponse.json({ extracted });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Something went wrong" }, { status: 500 });
  }
}