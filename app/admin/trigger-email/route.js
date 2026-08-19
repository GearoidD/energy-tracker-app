import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = {
  reminders: "send-reminders",
  "missing-bills": "missing-bill-nudges",
  "scan-rates": "scan-rates",
  "report-reminder": "report-reminder",
};

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { type } = await request.json();

  // Test email doesn't go through the cron proxy - it's a direct, simple send to yourself
  if (type === "test") {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: "Wattpryce <renewals@wattpryce.com>",
        to: [user.email],
        subject: "Wattpryce test email",
        html: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3efe6; padding: 24px 0;">
            <tr><td align="center">
              <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; max-width: 480px;">
                <tr><td style="background-color: #0e1a1d; padding: 24px 28px;">
                  <span style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #ffffff;">Watt<span style="color: #2fa79a;">pryce</span></span>
                </td></tr>
                <tr><td style="padding: 24px 28px;">
                  <p style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; color: #1f2124; margin: 0 0 8px;">This is a test email.</p>
                  <p style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 13px; color: #6b6d70; margin: 0;">Sent from the admin panel to confirm branding and delivery are working correctly. Sent ${new Date().toLocaleString("en-IE")}.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        `,
        text: `This is a test email from Wattpryce's admin panel, confirming delivery is working. Sent ${new Date().toLocaleString("en-IE")}.`,
      });
      return NextResponse.json({ sent: true, to: user.email });
    } catch (e) {
      return NextResponse.json({ error: e.message || "Failed to send test email" }, { status: 500 });
    }
  }

  const cronPath = ALLOWED_TYPES[type];
  if (!cronPath) {
    return NextResponse.json({ error: "Unknown email type" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://wattpryce.com/api/cron/${cronPath}`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error || "Failed to trigger" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message || "Something went wrong" }, { status: 500 });
  }
}