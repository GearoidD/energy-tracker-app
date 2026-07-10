import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MasterRatesBoard from "./MasterRatesBoard";
import SuppliersBoard from "./SuppliersBoard";

export const dynamic = "force-dynamic";

export default async function AdminRatesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();

  if (!profile?.is_platform_admin) redirect("/dashboard");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "40px 24px" }}>
      <MasterRatesBoard />
      <SuppliersBoard />
    </div>
  );
}
