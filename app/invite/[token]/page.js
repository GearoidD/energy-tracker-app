import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }) {
  const { token } = params;
  const supabase = createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const { data: invite } = await admin.from("invites").select("*").eq("token", token).maybeSingle();

  if (!invite) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}>
        This invite link isn't valid. Ask whoever sent it for a new one.
      </div>
    );
  }

  if (invite.used_at) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}>
        This invite link has already been used. Ask an admin for a new one.
      </div>
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}>
        This invite link has expired. Ask an admin for a new one.
      </div>
    );
  }

  // Add them to the company (ignore a duplicate — they might already be a member)
  await admin.from("company_members").insert({
    user_id: user.id,
    company_id: invite.company_id,
    role: invite.role || "member",
  });

  await admin.from("invites").update({ used_at: new Date().toISOString(), used_by: user.id }).eq("id", invite.id);

  await admin.from("profiles").upsert({ id: user.id, email: user.email, active_company_id: invite.company_id });

  redirect("/dashboard");
}