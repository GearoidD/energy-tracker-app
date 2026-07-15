import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Zap } from "lucide-react";
import MasterRatesBoard from "./MasterRatesBoard";
import SuppliersBoard from "./SuppliersBoard";
import RateReviewQueue from "./RateReviewQueue";

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
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');` }} />
      <div style={{ maxWidth: 900, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Zap size={20} color="var(--teal)" />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, color: "var(--text)" }}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span> — Platform
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
          <Link href="/admin" style={{ color: "var(--muted)", textDecoration: "none", paddingBottom: 4 }}>
            Overview
          </Link>
          <Link href="/admin/rates" style={{ color: "var(--text)", fontWeight: 600, textDecoration: "none", borderBottom: "2px solid var(--teal)", paddingBottom: 4 }}>
            Rates &amp; suppliers
          </Link>
        </div>
      </div>
      <RateReviewQueue />
      <MasterRatesBoard />
      <SuppliersBoard />
    </div>
  );
}
