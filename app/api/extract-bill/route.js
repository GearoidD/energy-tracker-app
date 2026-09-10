import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Runs on the server only.
// ANTHROPIC_API_KEY is never exposed to the browser.

export async function POST(request) {
  try {
    // ---------------------------------------------------------
    // AUTH
    // ---------------------------------------------------------

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not logged in" },
        { status: 401 }
      );
    }

    // ---------------------------------------------------------
    // READ REQUEST
    // ---------------------------------------------------------

    const body = await request.json();

    /*
     * Supported formats:
     *
     * NEW:
     * {
     *   front: {
     *     base64: "...",
     *     mediaType: "image/jpeg"
     *   },
     *   back: {
     *     base64: "...",
     *     mediaType: "image/jpeg"
     *   }
     * }
     *
     * OLD:
     * {
     *   base64: "...",
     *   mediaType: "image/jpeg"
     * }
     *
     * ALSO:
     * {
     *   pages: [...]
     * }
     */

    let pages = [];

    // ---------------------------------------------------------
    // NEW FRONT / BACK FORMAT
    // ---------------------------------------------------------

    if (body.front?.base64) {
      pages.push({
        base64: body.front.base64,
        mediaType:
          body.front.mediaType || "image/jpeg",
        side: "front",
      });
    }

    if (body.back?.base64) {
      pages.push({
        base64: body.back.base64,
        mediaType:
          body.back.mediaType || "image/jpeg",
        side: "back",
      });
    }

    // ---------------------------------------------------------
    // EXISTING PAGES FORMAT
    // ---------------------------------------------------------

    if (
      pages.length === 0 &&
      Array.isArray(body.pages)
    ) {
      pages = body.pages
        .filter(
          (page) =>
            page &&
            page.base64
        )
        .map((page) => ({
          base64: page.base64,
          mediaType:
            page.mediaType || "image/jpeg",
        }));
    }

    // ---------------------------------------------------------
    // EXISTING SINGLE FILE FORMAT
    // ---------------------------------------------------------

    if (
      pages.length === 0 &&
      body.base64
    ) {
      pages = [
        {
          base64: body.base64,
          mediaType:
            body.mediaType || "image/jpeg",
        },
      ];
    }

    // ---------------------------------------------------------
    // VALIDATION
    // ---------------------------------------------------------

    if (pages.length === 0) {
      return NextResponse.json(
        {
          error:
            "Missing bill image. Please upload the front of the bill.",
        },
        { status: 400 }
      );
    }

    if (pages.length > 2) {
      return NextResponse.json(
        {
          error:
            "A bill can contain a maximum of two photos.",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // VALIDATE IMAGES
    // ---------------------------------------------------------

    const allowedImageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    for (const page of pages) {
      if (!page.base64) {
        return NextResponse.json(
          {
            error:
              "One of the uploaded bill images is empty.",
          },
          { status: 400 }
        );
      }

      if (
        page.mediaType !== "application/pdf" &&
        !allowedImageTypes.includes(
          page.mediaType
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Unsupported image type. Please use JPG, PNG or WebP.",
          },
          { status: 400 }
        );
      }
    }

    // ---------------------------------------------------------
    // BUILD CLAUDE CONTENT
    // ---------------------------------------------------------

    const contentBlocks = [];

    for (const page of pages) {
      const isPdf =
        page.mediaType ===
        "application/pdf";

      if (isPdf) {
        contentBlocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: page.mediaType,
            data: page.base64,
          },
        });
      } else {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: page.mediaType,
            data: page.base64,
          },
        });
      }
    }

    // ---------------------------------------------------------
    // EXTRACTION INSTRUCTIONS
    // ---------------------------------------------------------

    const hasFrontAndBack =
      pages.length === 2;

    const extractionPrompt = `
You are an expert energy-bill data extraction system.

The uploaded image${hasFrontAndBack ? "s are the FRONT and BACK of the SAME energy bill" : " is an energy bill"}.

${hasFrontAndBack
  ? `
IMPORTANT:
- Treat both images as ONE bill.
- Do NOT treat them as separate bills.
- Information on either side may be required.
- If a value appears on the back, use it.
- If the front and back contain different information, combine it.
- Never overwrite a clearly visible value with a guess.
`
  : ""
}

Your job is to accurately extract the bill information.

ACCURACY IS MORE IMPORTANT THAN COMPLETENESS.

Never guess a number.
If a field is not clearly visible, return null.

Pay particular attention to:
- Billing period end date
- kWh usage
- Unit rates
- Standing charge
- Total bill amount
- Provider
- Supply address
- MPRN/GPRN
- Supplier account number
- Contract end/renewal date
- MIC
- DG Group
- Gas Supply Point Capacity

Return ONLY valid JSON.

Do not use markdown.
Do not include explanations.
Do not include comments.

Use exactly this structure:

{
  "reading_date": "YYYY-MM-DD or null",
  "usage": number or null,
  "rate": number or null,
  "standing_charge": number or null,
  "total_cost": number or null,
  "provider": "string or null",
  "supply_address": "string or null",
  "account_number": "string or null",
  "supplier_account_number": "string or null",
  "fuel_type": "electricity or gas or null",
  "contract_end": "YYYY-MM-DD or null",
  "mic_kva": number or null,
  "dg_group": "string or null",
  "spc_kwh": number or null,
  "rate_note": "string or null",
  "confidence": "high, medium, or low"
}

FIELD RULES:

reading_date:
The BILLING PERIOD END DATE.
Do not use the invoice date unless it is also clearly the billing period end date.

usage:
The actual energy consumption for this billing period in kWh.
Do not calculate it from meter readings unless the bill explicitly gives the usage.

rate:
The unit energy rate in cents per kWh.
If multiple rates exist, use the DAY rate here and explain the other rates in rate_note.

standing_charge:
The daily standing charge in cents per day.

total_cost:
The actual total amount due or charged for the billing period in euro.
Use the amount shown on the bill.
Do NOT calculate this value from usage and rate.

provider:
The energy supplier.

supply_address:
The physical address where the energy is supplied.
Do not use the billing/postal address if different.

account_number:
For electricity, this should be the MPRN.
For gas, this should be the GPRN.
Do NOT put the supplier's customer/account number here.

supplier_account_number:
The supplier's own customer/account number if shown.

fuel_type:
Read this from the bill.
Return either "electricity" or "gas".
Do not guess.

contract_end:
Only return a date if the bill explicitly shows a contract expiry, renewal or end date.
Do not mistake the billing period date for the contract end date.

mic_kva:
For electricity only.
Return the Maximum Import Capacity in kVA if explicitly shown.

dg_group:
For electricity only.
Return the Distribution Group such as DG1, DG5 or DG8 if explicitly shown.

spc_kwh:
For gas only.
Return the Supply Point Capacity in kWh if explicitly shown.

rate_note:
If there are multiple rates, briefly describe them.
For example:
"Day 24.5c/kWh, Night 15.2c/kWh"
Otherwise return null.

confidence:
Use:
- "high" when the relevant information is clearly visible
- "medium" when some information is slightly unclear
- "low" when important information is difficult to read

Again:
NEVER invent or estimate a value.
Return null when it cannot be read confidently.
`;

    // ---------------------------------------------------------
    // CALL ANTHROPIC
    // ---------------------------------------------------------

    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-api-key":
            process.env.ANTHROPIC_API_KEY,

          "anthropic-version":
            "2023-06-01",
        },

        body: JSON.stringify({
          model: "claude-sonnet-5",

          /*
           * 800 is plenty for the JSON response.
           * Keeping this low helps response speed.
           */
          max_tokens: 800,

          /*
           * Slightly lower temperature gives
           * more deterministic extraction.
           */
          temperature: 0,

          messages: [
            {
              role: "user",

              content: [
                ...contentBlocks,

                {
                  type: "text",
                  text: extractionPrompt,
                },
              ],
            },
          ],
        }),
      }
    );

    // ---------------------------------------------------------
    // HANDLE ANTHROPIC RESPONSE
    // ---------------------------------------------------------

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Anthropic API error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data.error?.message ||
            "Claude API error",
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // GET TEXT RESPONSE
    // ---------------------------------------------------------

    const textBlock =
      data.content?.find(
        (content) =>
          content.type === "text"
      );

    if (!textBlock?.text) {
      return NextResponse.json(
        {
          error:
            "Couldn't read this bill. Try taking the photo again with better lighting and make sure the entire bill is visible.",
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // CLEAN JSON
    // ---------------------------------------------------------

    let cleaned =
      textBlock.text.trim();

    /*
     * Remove accidental markdown fences.
     */
    cleaned = cleaned.replace(
      /^```json\s*/i,
      ""
    );

    cleaned = cleaned.replace(
      /^```\s*/i,
      ""
    );

    cleaned = cleaned.replace(
      /\s*```$/i,
      ""
    );

    cleaned = cleaned.trim();

    /*
     * If Claude accidentally adds text around
     * the JSON, salvage the JSON object.
     */
    const firstBrace =
      cleaned.indexOf("{");

    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace !== -1 &&
      lastBrace !== -1 &&
      lastBrace > firstBrace
    ) {
      cleaned = cleaned.slice(
        firstBrace,
        lastBrace + 1
      );
    }

    // ---------------------------------------------------------
    // PARSE JSON
    // ---------------------------------------------------------

    let extracted;

    try {
      extracted =
        JSON.parse(cleaned);
    } catch (parseError) {
      console.error(
        "Failed to parse Claude JSON:",
        cleaned
      );

      return NextResponse.json(
        {
          error:
            "Couldn't read this bill clearly enough. Please retake the photo with better lighting, less glare, and the entire page in frame.",
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // NORMALISE RESPONSE
    // ---------------------------------------------------------

    /*
     * Make sure the frontend always receives
     * the same fields, even if Claude omitted one.
     */

    const normalised = {
      reading_date:
        extracted.reading_date ??
        null,

      usage:
        extracted.usage ??
        null,

      rate:
        extracted.rate ??
        null,

      standing_charge:
        extracted.standing_charge ??
        null,

      total_cost:
        extracted.total_cost ??
        null,

      provider:
        extracted.provider ??
        null,

      supply_address:
        extracted.supply_address ??
        null,

      account_number:
        extracted.account_number ??
        null,

      supplier_account_number:
        extracted.supplier_account_number ??
        null,

      fuel_type:
        extracted.fuel_type ??
        null,

      contract_end:
        extracted.contract_end ??
        null,

      mic_kva:
        extracted.mic_kva ??
        null,

      dg_group:
        extracted.dg_group ??
        null,

      spc_kwh:
        extracted.spc_kwh ??
        null,

      rate_note:
        extracted.rate_note ??
        null,

      confidence:
        extracted.confidence ||
        "medium",
    };

    // ---------------------------------------------------------
    // BASIC DATA VALIDATION
    // ---------------------------------------------------------

    /*
     * Prevent obviously invalid fuel types
     * from reaching your database.
     */

    if (
      normalised.fuel_type !==
        "electricity" &&
      normalised.fuel_type !==
        "gas" &&
      normalised.fuel_type !== null
    ) {
      normalised.fuel_type =
        null;
    }

    /*
     * Prevent invalid confidence values.
     */

    if (
      ![
        "high",
        "medium",
        "low",
      ].includes(
        normalised.confidence
      )
    ) {
      normalised.confidence =
        "medium";
    }

    // ---------------------------------------------------------
    // RETURN
    // ---------------------------------------------------------

    return NextResponse.json({
      extracted: normalised,
    });
  } catch (err) {
    console.error(
      "Bill extraction error:",
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Something went wrong while reading the bill.",
      },
      { status: 500 }
    );
  }
}