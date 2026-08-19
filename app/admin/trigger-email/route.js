import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = {
  reminders: "send-reminders",
  "missing-bills": "missing-bill-nudges",
  "scan-rates": "scan-rates",
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
