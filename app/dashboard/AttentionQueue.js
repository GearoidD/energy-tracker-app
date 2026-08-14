"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, Mail, Zap, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import WoodpeckerMascot from "@/app/WoodpeckerMascot";

const MISSING_BILL_DAYS = 45;
const RATE_JUMP_THRESHOLD = 5;

const RENEWAL_STATUS_META = {
  not_started: { label: "Not started", color: "var(--muted)" },
  quote_requested: { label: "Quote requested", color: "var(--amber)" },
  switching: { label: "Switching", color: "var(--state)" },
  renewed: { label: "Renewed", color: "var(--green)" },
};

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
  const annualStanding = (standing / 100) * 365;

  return totalEnergyCost * scaleFactor + annualStanding;
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

function accountConfidence(acc, latest) {
  let daysSinceLastReading = null;
  if (!latest) {
    return { missingBill: true, daysSinceLastReading: null };
  }
  if (latest.reading_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    daysSinceLastReading = Math.round((today - new Date(latest.reading_date + "T00:00:00")) / 86400000);
  }
  const missingBill = daysSinceLastReading !== null && daysSinceLastReading > MISSING_BILL_DAYS;
  return { missingBill, daysSinceLastReading };
}

// accounts needing "critical" treatment for out-of-contract / overdue status
function overallLabelFor(a) {
  const renewalStatus = a.renewal_status || "not_started";
  const beingHandled = renewalStatus === "quote_requested" || renewalStatus === "switching";
  if ((a.status === "overdue" || a.status === "urgent") && !beingHandled) return "Action needed";
  if (beingHandled) return RENEWAL_STATUS_META[renewalStatus].label;
  return null; // determined by the issue-detection pass below
}

function AttentionQueueInner({ companyId, companyName }) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const criticalOnly = searchParams.get("filter") === "critical";
  const [accounts, setAccounts] = useState([]);
  const [readingSummaries, setReadingSummaries] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    const { data: accts } = await supabase.from("accounts").select("*").eq("company_id", companyId);
    const { data: readings } = await supabase
      .from("readings")
      .select("account_id, reading_date, rate, usage, standing_charge, confidence, created_at")
      .eq("company_id", companyId)
      .order("reading_date", { ascending: false, nullsFirst: false });

    const grouped = {};
    (readings || []).forEach((r) => {
      if (!grouped[r.account_id]) grouped[r.account_id] = [];
      grouped[r.account_id].push(r);
    });

    setAccounts(accts || []);
    setReadingSummaries(grouped);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div style={{ color: "var(--muted)", padding: 40 }}>Loading attention queue…</div>;
  }

  // Build the same issue list as the main dashboard's hero, but this is the whole point of this page
  const issueGroups = {}; // groupLabel -> { color, severity, items: [{account, location, detail}] }

  accounts.forEach((a) => {
    const daysLeft = daysUntil(a.contract_end);
    const status = statusOf(daysLeft);
    const confidence = accountConfidence(a, readingSummaries[a.id]?.[0]);
    const renewalStatus = a.renewal_status || "not_started";
    const beingHandled = renewalStatus === "quote_requested" || renewalStatus === "switching";

    const ratedReadings = (readingSummaries[a.id] || []).filter((r) => r.rate !== null && r.rate !== undefined);
    let rateChange = null;
    if (ratedReadings.length >= 2) {
      const [newest, prev] = ratedReadings;
      if (prev.rate) {
        const pct = ((newest.rate - prev.rate) / prev.rate) * 100;
        rateChange = { pct, from: prev.rate, to: newest.rate };
      }
    }

    const addTo = (key, color, severity, detail) => {
      if (!issueGroups[key]) issueGroups[key] = { color, severity, items: [] };
      issueGroups[key].items.push({ account: a, location: a.location || "No location set", detail });
    };

    if (status === "overdue" && !beingHandled) {
      addTo("Out of contract — likely on penalty rates", "var(--red)", 0, null);
    } else if (status === "urgent" && !beingHandled) {
      addTo("Renewing soon", "var(--red)", 1, `${daysLeft} day(s) left`);
    }
    if (confidence.missingBill) {
      addTo(
        `No bill in ${MISSING_BILL_DAYS}+ days — spend may be out of date`,
        "var(--amber)",
        2,
        confidence.daysSinceLastReading ? `${confidence.daysSinceLastReading} days since last bill` : "no bills added yet"
      );
    }
    const latest = readingSummaries[a.id]?.[0];
    if (latest?.confidence === "low") {
      addTo("Bill data uncertain — verify before relying on it", "var(--amber)", 3, null);
    }
    if (rateChange && rateChange.pct >= RATE_JUMP_THRESHOLD) {
      addTo("Unexpected rate jump", "var(--amber)", 1.5, `${rateChange.pct.toFixed(1)}% (${rateChange.from}c → ${rateChange.to}c)`);
    }
  });

  const allGroups = Object.entries(issueGroups).sort((a, b) => a[1].severity - b[1].severity);
  const sortedGroups = criticalOnly ? allGroups.filter(([, g]) => g.color === "var(--red)") : allGroups;
  const totalAccounts = new Set(sortedGroups.flatMap(([, g]) => g.items.map((i) => i.account.id))).size;
  const totalIssues = sortedGroups.reduce((sum, [, g]) => sum + g.items.length, 0);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: `
        .wp-dashboard-root select { appearance: none; -webkit-appearance: none; }
        @keyframes wpSoftIn { from { opacity: 0; } to { opacity: 1; } }
        .wp-soft-in { animation: wpSoftIn 0.22s ease both; }
      ` }} />
      <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", textDecoration: "none", marginBottom: 16, width: "fit-content" }}>
        <ChevronLeft size={14} /> All accounts
      </Link>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <WoodpeckerMascot size={48} />
        <div>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>{criticalOnly ? "Critical accounts" : "Attention queue"}</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
            {totalAccounts} account{totalAccounts === 1 ? "" : "s"} · {totalIssues} issue{totalIssues === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 999, padding: "6px 12px", fontSize: 12, color: "var(--text)" }}>
          Priority: highest first
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 999, padding: "6px 12px", fontSize: 12, color: "var(--text)" }}>
          Grouped: Issue
        </span>
        {criticalOnly && (
          <button
            onClick={() => router.push("/dashboard/attention")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--panel)", border: "1px solid var(--red)", borderRadius: 999, padding: "6px 12px", fontSize: 12, color: "var(--red)", cursor: "pointer", fontWeight: 600 }}
          >
            Critical only ×
          </button>
        )}
      </div>

      {sortedGroups.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: 12 }}>
          Nothing needs attention right now.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {sortedGroups.map(([groupLabel, group]) => {
            const byLocation = {};
            group.items.forEach((item) => {
              if (!byLocation[item.location]) byLocation[item.location] = [];
              byLocation[item.location].push(item);
            });
            const locationEntries = Object.entries(byLocation).sort((a, b) => b[1].length - a[1].length);

            return (
              <div key={groupLabel}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                  <h2 style={{ fontFamily: "'Lora', serif", fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text)" }}>{groupLabel}</h2>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{group.items.length} account{group.items.length === 1 ? "" : "s"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {locationEntries.map(([location, items]) => (
                    <div key={location} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderLeft: `3px solid ${group.color}`, borderRadius: 8, padding: "10px 14px" }}>
                      <button
                        onClick={() => location !== "No location set" && router.push(`/dashboard/locations/${encodeURIComponent(location)}`)}
                        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: location !== "No location set" ? "pointer" : "default", width: "100%", textAlign: "left" }}
                      >
                        <strong style={{ color: "var(--text)", fontSize: 13, fontWeight: 600 }}>{location}</strong>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>— {items.length}</span>
                        {location !== "No location set" && <span style={{ marginLeft: "auto", color: "var(--teal)", fontSize: 11.5, fontWeight: 600 }}>View →</span>}
                      </button>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                        {items.slice(0, 5).map((item) => {
                          const spend = fmtMoney(estimatedAnnualSpend(item.account, readingSummaries[item.account.id]));
                          return (
                            <div key={item.account.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                              {item.account.fuel_type === "gas" ? <Flame size={11} color="var(--amber)" /> : <Zap size={11} color="var(--teal)" />}
                              {item.account.name}
                              {item.detail ? ` — ${item.detail}` : ""}
                              {spend && <span style={{ marginLeft: "auto", color: "var(--text)", fontWeight: 600, flexShrink: 0 }}>{spend}/yr</span>}
                            </div>
                          );
                        })}
                        {items.length > 5 && (
                          <span style={{ fontSize: 11.5, color: "var(--muted)", opacity: 0.75 }}>+ {items.length - 5} more</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AttentionQueue(props) {
  return (
    <Suspense fallback={<div style={{ color: "var(--muted)", padding: 40 }}>Loading attention queue…</div>}>
      <AttentionQueueInner {...props} />
    </Suspense>
  );
}
