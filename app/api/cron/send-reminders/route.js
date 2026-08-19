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

function buildEmailHtml(accountsForCompany) {
  const rows = accountsForCompany
    .map((a) => {
      const overdue = a.daysLeft < 0;
      const statusColor = overdue ? "#d9573b" : a.daysLeft <= 14 ? "#e8a33d" : "#8fa6a3";
      return `
        <tr>
          <td style="padding: 16px 20px; border-bottom: 1px solid #e5e3dd;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #1f2124; padding-bottom: 4px;">
                  ${a.name}${a.provider ? ` <span style="font-weight: 400; color: #6b6d70;">(${a.provider})</span>` : ""}
                </td>
              </tr>
              <tr>
                <td style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color: ${statusColor}; padding-bottom: 10px;">
                  ${urgencyLine(a.daysLeft)}
                </td>
              </tr>
              <tr>
                <td>
                  <a href="https://wattpryce.com/dashboard?renew=${a.id}" style="display: inline-block; background-color: #2fa79a; color: #06201d; font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 12.5px; font-weight: 600; text-decoration: none; padding: 8px 14px; border-radius: 6px;">
                    Just renewed? Update it here
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3efe6; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; max-width: 560px;">
            <tr>
              <td style="background-color: #0e1a1d; padding: 24px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #ffffff;">
                      Watt<span style="color: #2fa79a;">pryce</span>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 6px;">
                  <tr>
                    <td style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 12.5px; color: #8fa6a3;">
                      Know before your contract renews.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 28px 8px;">
                <p style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; color: #1f2124; margin: 0;">
                  Here's what's coming up on your energy accounts:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 28px;">
                <a href="https://wattpryce.com/dashboard" style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 13px; color: #2fa79a; text-decoration: none; font-weight: 600;">
                  Log in to Wattpryce to review everything →
                </a>
              </td>
            </tr>
            <tr>
              <td style="background-color: #faf9f6; padding: 18px 28px; border-top: 1px solid #e5e3dd;">
                <p style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11.5px; color: #8fa6a3; margin: 0;">
                  You're receiving this because your team tracks energy accounts with Wattpryce.<br />
                  Wattpryce · <a href="https://wattpryce.com" style="color: #8fa6a3;">wattpryce.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function buildEmailText(accountsForCompany) {
  const lines = accountsForCompany.map(
    (a) =>
      `- ${a.name}${a.provider ? ` (${a.provider})` : ""} — ${urgencyLine(a.daysLeft)}\n  Just renewed? Update it here: https://wattpryce.com/dashboard?renew=${a.id}`
  );
  return [
    "Wattpryce — here's what's coming up on your energy accounts:",
    "",
    ...lines,
    "",
    "Log in to review everything: https://wattpryce.com/dashboard",
    "",
    "You're receiving this because your team tracks energy accounts with Wattpryce.",
  ].join("\n");
}

export async function GET(request) {
  // Only Vercel's Cron scheduler (or you, manually, with the secret) can trigger this.
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

  // Only accounts that hit an exact reminder milestone today, or are overdue
  // (overdue accounts get a reminder every day, since that's the whole point).
  const dueAccounts = (accounts || [])
    .map((a) => ({ ...a, daysLeft: daysUntil(a.contract_end) }))
    .filter((a) => a.daysLeft < 0 || REMINDER_DAYS.includes(a.daysLeft));

  if (dueAccounts.length === 0) {
    return NextResponse.json({ sent: 0, message: "Nothing due today" });
  }

  // Group by company so each team gets one email, not one per account
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

    try {
      await resend.emails.send({
        from: "Wattpryce <renewals@wattpryce.com>",
        to: emails,
        subject: `Wattpryce: ${accountsForCompany.length} account(s) need your attention`,
        html: buildEmailHtml(accountsForCompany),
        text: buildEmailText(accountsForCompany),
      });
      emailsSent++;
    } catch (e) {
      console.error(`Failed to send reminder for company ${companyId}:`, e.message);
    }
  }

  return NextResponse.json({ sent: emailsSent, accountsChecked: dueAccounts.length });
}