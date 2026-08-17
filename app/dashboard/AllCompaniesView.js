"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Zap, Flame, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MISSING_BILL_DAYS = 45;

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return null;
  return "€" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function estimatedAnnualSpend(acc, readings) {
  const rated = (readings || []).filter((r) => r.usage != null && r.rate != null && r.reading_date);
  if (rated.length === 0) {
    const rate = parseFloat(acc.rate);
    const usage = parseFloat(acc.usage);
    const standing = parseFloat(acc.standing_charge) || 0;
    if (isNaN(rate) || isNaN(usage)) return null;
    return (rate / 100) * usage + (standing / 100) * 365;
  }
  const sorted = [...rated].sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
  const first = new Date(sorted[0].reading_date);
  const last = new Date(sorted[sorted.length - 1].reading_date);
  const daySpan = Math.max((last - first) / 86400000, 30);
  const scaleFactor = 365 / daySpan;
  const allHaveTotalCost = sorted.every((r) => r.total_cost !== null && r.total_cost !== undefined);
  if (allHaveTotalCost) {
    const totalActualCost = sorted.reduce((sum, r) => sum + parseFloat(r.total_cost), 0);
    return totalActualCost * scaleFactor;
  }
  const totalEnergyCost = sorted.reduce((sum, r) => sum + (parseFloat(r.rate) / 100) * parseFloat(r.usage), 0);
  const standing = parseFloat(acc.standing_charge) || 0;
  return totalEnergyCost * scaleFactor + (standing / 100) * 365;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr + "T00:00:00");
  return Math.round((end - today) / 86400000);
}

function statusOf(daysLeft) {
  if (daysLeft === null) return "unknown";
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 30) return "urgent";
  if (daysLeft <= 90) return "soon";
  return "ok";
}

function needsAttention(acc, latestReading) {
  const daysLeft = daysUntil(acc.contract_end);
  const status = statusOf(daysLeft);
  const renewalStatus = acc.renewal_status || "not_started";
  const beingHandled = renewalStatus === "quote_requested" || renewalStatus === "switching";
  if ((status === "overdue" || status === "urgent") && !beingHandled) return true;

  let daysSince = null;
  if (latestReading?.reading_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    daysSince = Math.round((today - new Date(latestReading.reading_date + "T00:00:00")) / 86400000);
  }
  if (!latestReading || (daysSince !== null && daysSince > MISSING_BILL_DAYS)) return true;
  if (latestReading?.confidence === "low") return true;
  return false;
}

export default function AllCompaniesView({ companies }) {
  const supabase = createClient();
  const router = useRouter();
  const [companyData, setCompanyData] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedCompany, setExpandedCompany] = useState(null);

  const load = useCallback(async () => {
    const companyIds = companies.map((c) => c.id);
    if (companyIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data: accounts } = await supabase.from("accounts").select("*").in("company_id", companyIds);
    const { data: readings } = await supabase
      .from("readings")
      .select("account_id, company_id, reading_date, rate, usage, standing_charge, total_cost, confidence")
      .in("company_id", companyIds)
      .order("reading_date", { ascending: false, nullsFirst: false });

    const readingsByAccount = {};
    (readings || []).forEach((r) => {
      if (!readingsByAccount[r.account_id]) readingsByAccount[r.account_id] = [];
      readingsByAccount[r.account_id].push(r);
    });

    const byCompany = {};
    companies.forEach((c) => {
      byCompany[c.id] = { accounts: [], totalSpend: 0, attentionCount: 0 };
    });

    (accounts || []).forEach((a) => {
      if (!byCompany[a.company_id]) return;
      const latest = readingsByAccount[a.id]?.[0];
      const cost = estimatedAnnualSpend(a, readingsByAccount[a.id]);
      const attention = needsAttention(a, latest);
      byCompany[a.company_id].accounts.push({ ...a, cost, attention, latest });
      if (cost) byCompany[a.company_id].totalSpend += cost;
      if (attention) byCompany[a.company_id].attentionCount++;
    });

    setCompanyData(byCompany);
    setLoading(false);
  }, [companies]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div style={{ color: "var(--muted)", padding: 40 }}>Loading every company…</div>;
  }

  const grandTotalAccounts = Object.values(companyData).reduce((s, c) => s + c.accounts.length, 0);
  const grandTotalAttention = Object.values(companyData).reduce((s, c) => s + c.attentionCount, 0);
  const grandTotalSpend = Object.values(companyData).reduce((s, c) => s + c.totalSpend, 0);

  return (
    <div>
      <h1 style={{ fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>All companies</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
        {companies.length} compan{companies.length === 1 ? "y" : "ies"} · {grandTotalAccounts} account{grandTotalAccounts === 1 ? "" : "s"} total
        {grandTotalAttention > 0 && <span style={{ color: "var(--amber)", fontWeight: 600 }}> · {grandTotalAttention} need attention</span>}
        {grandTotalSpend > 0 && <span> · {fmtMoney(grandTotalSpend)} combined est. spend</span>}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {companies.map((company) => {
          const data = companyData[company.id] || { accounts: [], totalSpend: 0, attentionCount: 0 };
          const isExpanded = expandedCompany === company.id;
          return (
            <div key={company.id} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderLeft: `3px solid ${data.attentionCount > 0 ? "var(--amber)" : "var(--green)"}`, borderRadius: 10 }}>
              <button
                onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
                style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", background: "none", border: "none", padding: "14px 18px", cursor: "pointer", textAlign: "left" }}
              >
                <ChevronDown size={14} color="var(--muted)" style={{ transform: isExpanded ? "none" : "rotate(-90deg)", flexShrink: 0, transition: "transform 0.15s ease" }} />
                <strong style={{ fontFamily: "'Lora', serif", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{company.name}</strong>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{data.accounts.length} account{data.accounts.length === 1 ? "" : "s"}</span>
                {data.attentionCount > 0 && (
                  <span style={{ fontSize: 12.5, color: "var(--amber)", fontWeight: 600 }}>{data.attentionCount} need attention</span>
                )}
                {data.totalSpend > 0 && <span style={{ fontSize: 12.5, color: "var(--text)", marginLeft: "auto" }}>{fmtMoney(data.totalSpend)}/yr est.</span>}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push("/dashboard");
                  }}
                  style={{ background: "none", border: "1px solid var(--border-light)", color: "var(--teal)", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", flexShrink: 0 }}
                >
                  Open →
                </button>
              </button>
              {isExpanded && (
                <div className="wp-soft-in" style={{ padding: "0 18px 14px" }}>
                  {data.accounts.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No accounts yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {data.accounts.map((a) => (
                        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted)", padding: "4px 0" }}>
                          {a.fuel_type === "gas" ? <Flame size={11} color="var(--amber)" /> : <Zap size={11} color="var(--teal)" />}
                          <span style={{ color: "var(--text)" }}>{a.name}</span>
                          {a.attention && <span style={{ color: "var(--amber)", fontSize: 11, fontWeight: 600 }}>needs attention</span>}
                          {a.cost && <span style={{ marginLeft: "auto", color: "var(--text)" }}>{fmtMoney(a.cost)}/yr</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
