import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: companies } = await supabase.from("companies").select("id, name");
  if (!companies || companies.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let emailsSent = 0;

  for (const company of companies) {
    const { data: members } = await supabase.from("company_members").select("profiles(email)").eq("company_id", company.id);
    const emails = (members || []).map((m) => m.profiles?.email).filter(Boolean);
    if (emails.length === 0) continue;

    try {
      await resend.emails.send({
        from: "Wattpryce <renewals@wattpryce.com>",
        to: emails,
        subject: `Your ${new Date().toLocaleDateString("en-IE", { month: "long" })} Wattpryce summary is ready`,
        html: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3efe6; padding: 24px 0;">
            <tr><td align="center">
              <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; max-width: 520px;">
                <tr><td style="background-color: #0e1a1d; padding: 24px 28px;">
                  <span style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #ffffff;">Watt<span style="color: #2fa79a;">pryce</span></span>
                </td></tr>
                <tr><td style="padding: 24px 28px;">
                  <p style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; color: #1f2124; margin: 0 0 12px;">
                    Your monthly portfolio summary is ready to view — renewals coming up, spend trends, and anything that needs attention.
                  </p>
                  <a href="https://wattpryce.com/dashboard" style="display: inline-block; background-color: #2fa79a; color: #06201d; font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 18px; border-radius: 6px;">
                    View your dashboard →
                  </a>
                  <p style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 12px; color: #6b6d70; margin: 16px 0 0;">
                    Download the full report as a PDF from the "⋯" menu once you're logged in.
                  </p>
                </td></tr>
                <tr><td style="background-color: #faf9f6; padding: 18px 28px; border-top: 1px solid #e5e3dd;">
                  <p style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11.5px; color: #8fa6a3; margin: 0;">
                    Wattpryce · <a href="https://wattpryce.com" style="color: #8fa6a3;">wattpryce.com</a>
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        `,
        text: `Your monthly Wattpryce summary is ready — log in to view it: https://wattpryce.com/dashboard`,
      });
      emailsSent++;
    } catch (e) {
      console.error(`Failed to send report reminder for company ${company.id}:`, e.message);
    }
  }

  return NextResponse.json({ sent: emailsSent, companiesChecked: companies.length });
}