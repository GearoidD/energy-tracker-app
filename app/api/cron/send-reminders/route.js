import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const REMINDER_DAYS = [90, 60, 30, 14, 7, 1];

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr + "T00:00:00");
  return Math.round((end - today) / 86400000);
}

function urgencyLine(daysLeft) {
  if (daysLeft < 0) return `${Math.abs(daysLeft)} day(s) OUT OF CONTRACT — likely on penalty rates`;
  if (daysLeft === 0) return "renews TODAY";
  return `renews in ${daysLeft} day(s)`;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, name, provider, contract_end, company_id")
    .not("contract_end", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueAccounts = (accounts || [])
    .map((a) => ({ ...a, daysLeft: daysUntil(a.contract_end) }))
    .filter((a) => a.daysLeft < 0 || REMINDER_DAYS.includes(a.daysLeft));

  if (dueAccounts.length === 0) {
    return NextResponse.json({ sent: 0, message: "Nothing due today" });
  }

  const byCompany = {};
  for (const a of dueAccounts) {
    if (!byCompany[a.company_id]) byCompany[a.company_id] = [];
    byCompany[a.company_id].push(a);
  }

  let emailsSent = 0;

  for (const companyId of Object.keys(byCompany)) {
    const { data: members } = await supabase
      .from("company_members")
      .select("profiles(email)")
      .eq("company_id", companyId);

    const emails = (members || []).map((m) => m.profiles?.email).filter(Boolean);
    if (emails.length === 0) continue;

    const accountsForCompany = byCompany[companyId];
    const listHtml = accountsForCompany
      .map(
        (a) =>
          `<li><strong>${a.name}</strong>${a.provider ? ` (${a.provider})` : ""} — ${urgencyLine(a.daysLeft)}</li>`
      )
      .join("");

    try {
      await resend.emails.send({
        from: "Wattpryce <onboarding@resend.dev>",
        to: emails,
        subject: `Wattpryce: ${accountsForCompany.length} account(s) need your attention`,
        html: `
          <p>Here's what's coming up on your energy accounts:</p>
          <ul>${listHtml}</ul>
          <p>Log in to Wattpryce to review or update these.</p>
        `,
      });
      emailsSent++;
    } catch (e) {
      console.error(`Failed to send reminder for company ${companyId}:`, e.message);
    }
  }

  return NextResponse.json({ sent: emailsSent, accountsChecked: dueAccounts.length });
}
