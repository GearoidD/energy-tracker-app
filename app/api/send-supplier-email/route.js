import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { to, bcc, subject, body, companyId, accountIds, supplierName, logNote } = await request.json();

  if ((!to && (!bcc || bcc.length === 0)) || !subject || !body || !companyId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Confirm this user actually belongs to the company they're claiming to email on behalf of
  const { data: membership } = await supabase
    .from("company_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized for this company" }, { status: 403 });
  }

  // Basic email format check - filters out empty/malformed addresses before they ever reach Resend
  const isValidEmail = (addr) => typeof addr === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.trim());

  const cleanTo = to && isValidEmail(to) ? to.trim() : null;
  const cleanBcc = (bcc || []).map((a) => (a || "").trim()).filter(isValidEmail);
  const invalidBcc = (bcc || []).filter((a) => !isValidEmail(a));

  if (!cleanTo && cleanBcc.length === 0) {
    return NextResponse.json(
      {
        error:
          invalidBcc.length > 0
            ? `Couldn't send — the saved email address${invalidBcc.length === 1 ? "" : "es"} (${invalidBcc.join(", ")}) ${invalidBcc.length === 1 ? "isn't" : "aren't"} valid. Check the supplier's contact email in the admin Suppliers page.`
            : "No valid email address to send to.",
      },
      { status: 400 }
    );
  }

  try {
    await resend.emails.send({
      from: "Wattpryce <onboarding@resend.dev>",
      to: cleanTo ? [cleanTo] : undefined,
      bcc: cleanBcc.length > 0 ? cleanBcc : undefined,
      replyTo: user.email,
      subject,
      text: body,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Failed to send email" }, { status: 500 });
  }

  // Log this as a note on every affected account, so it shows up in that
  // account's history and the company-wide activity feed automatically.
  if (accountIds && accountIds.length > 0) {
    const noteText = logNote || `Quote request emailed${supplierName ? ` to ${supplierName}` : ""} — sent via Wattpryce.`;
    const noteRows = accountIds.map((accountId) => ({
      account_id: accountId,
      company_id: companyId,
      body: noteText,
      created_by: user.id,
    }));
    await supabase.from("account_notes").insert(noteRows);
  }

  return NextResponse.json({ success: true });
}