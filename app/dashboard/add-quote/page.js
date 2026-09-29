import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Zap } from "lucide-react";
import AddQuoteForm from "./AddQuoteForm";
import { projectedAnnualCost } from "@/lib/cost-engine";

export const dynamic = "force-dynamic";

export default async function AddQuotePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("active_company_id").eq("id", user.id).maybeSingle();
  const { data: accounts } = profile?.active_company_id
    ? await supabase.from("accounts").select("id,name,location,fuel_type,usage,rate,standing_charge").eq("company_id", profile.active_company_id).order("name")
    : { data: [] };
  const { data: readings } = profile?.active_company_id
    ? await supabase.from("readings").select("account_id,reading_date,rate,usage,standing_charge,total_cost,created_at").eq("company_id", profile.active_company_id).order("reading_date", { ascending: false })
    : { data: [] };
  const grouped = {};
  (readings || []).forEach((r) => { (grouped[r.account_id] ||= []).push(r); });
  const enrichedAccounts = (accounts || []).map((a) => {
    const costDetail = projectedAnnualCost(a, grouped[a.id] || []);
    return { ...a, projectionEligible: !!costDetail.projectionEligible, projectedUsage: costDetail.usage, projectedCost: costDetail.projected, coverageDays: costDetail.usageEstimate?.coverageDays || 0, billCount: costDetail.usageEstimate?.billCount || 0, trailingIsAnnual: !!costDetail.trailingIsAnnual, trailingRecorded: costDetail.trailingRecorded };
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "40px 24px", fontFamily: "DM Sans, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');` }} />
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <Zap size={20} color="var(--teal)" />
          <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontSize: 16 }}>
            <span style={{ color: "var(--teal)" }}>GnóRate</span>
          </span>
        </div>

        <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
          Feed in a real quote
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 28 }}>
          Paste the full text of a quote email you've received below. AI pulls out every distinct rate offer and adds it as a
          <strong style={{ color: "var(--text)" }}> verified market rate</strong> — since it came from a real supplier quote, it's
          used across every account's comparison, not just yours.
        </p>

        <AddQuoteForm accounts={enrichedAccounts} />
      </div>
    </div>
  );
}