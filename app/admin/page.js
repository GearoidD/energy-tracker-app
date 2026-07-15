import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { Zap, Building2, Users, Zap as ZapIcon } from "lucide-react";
import DeleteCompanyButton from "./DeleteCompanyButton";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_platform_admin) redirect("/dashboard");

  const admin = createAdminClient();

  const { data: companies } = await admin.from("companies").select("id, name, created_at").order("created_at", { ascending: false });
  const { data: accounts } = await admin.from("accounts").select("id, company_id, created_at");
  const { data: readings } = await admin.from("readings").select("company_id, created_at");
  const { data: members } = await admin.from("company_members").select("company_id");

  const accountsByCompany = {};
  (accounts || []).forEach((a) => {
    accountsByCompany[a.company_id] = (accountsByCompany[a.company_id] || 0) + 1;
  });

  const membersByCompany = {};
  (members || []).forEach((m) => {
    membersByCompany[m.company_id] = (membersByCompany[m.company_id] || 0) + 1;
  });

  const lastActivityByCompany = {};
  (accounts || []).forEach((a) => {
    const t = new Date(a.created_at).getTime();
    if (!lastActivityByCompany[a.company_id] || t > lastActivityByCompany[a.company_id]) {
      lastActivityByCompany[a.company_id] = t;
    }
  });
  (readings || []).forEach((r) => {
    const t = new Date(r.created_at).getTime();
    if (!lastActivityByCompany[r.company_id] || t > lastActivityByCompany[r.company_id]) {
      lastActivityByCompany[r.company_id] = t;
    }
  });

  const totalCompanies = (companies || []).length;
  const totalAccounts = (accounts || []).length;
  const totalReadings = (readings || []).length;

  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "40px 24px", fontFamily: "Inter, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');` }} />
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Zap size={20} color="var(--teal)" />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span> — Platform
          </span>
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 24, fontSize: 13 }}>
          <Link href="/admin" style={{ color: "var(--text)", fontWeight: 600, textDecoration: "none", borderBottom: "2px solid var(--teal)", paddingBottom: 4 }}>
            Overview
          </Link>
          <Link href="/admin/rates" style={{ color: "var(--muted)", textDecoration: "none", paddingBottom: 4 }}>
            Rates &amp; suppliers
          </Link>
        </div>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, margin: "0 0 24px" }}>
          Platform overview
        </h1>

        <div style={{ display: "flex", gap: 0, marginBottom: 32, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
          <div style={{ padding: "0 24px 0 0" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600 }}>{totalCompanies}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Companies signed up</div>
          </div>
          <div style={{ padding: "0 24px", borderLeft: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600 }}>{totalAccounts}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Accounts tracked, platform-wide</div>
          </div>
          <div style={{ padding: "0 24px", borderLeft: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600 }}>{totalReadings}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Bills/readings uploaded</div>
          </div>
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, marginBottom: 14 }}>COMPANIES</p>

        {(companies || []).length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No companies yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {companies.map((c) => {
              const last = lastActivityByCompany[c.id];
              const isActive = last && now - last < THIRTY_DAYS;
              return (
                <div
                  key={c.id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Building2 size={15} color="var(--muted)" />
                    <div>
                      <div style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        Signed up {new Date(c.created_at).toLocaleDateString("en-IE")}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)" }}>
                      <ZapIcon size={12} /> {accountsByCompany[c.id] || 0} accounts
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)" }}>
                      <Users size={12} /> {membersByCompany[c.id] || 0} member{(membersByCompany[c.id] || 0) === 1 ? "" : "s"}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: isActive ? "var(--green)" : "var(--muted)",
                        border: `1px solid ${isActive ? "var(--green)" : "var(--border)"}`,
                        borderRadius: 4,
                        padding: "2px 7px",
                        textTransform: "uppercase",
                      }}
                    >
                      {last ? (isActive ? "Active" : "Quiet") : "No activity yet"}
                    </span>
                    <DeleteCompanyButton companyId={c.id} companyName={c.name} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
