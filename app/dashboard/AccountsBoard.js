// GnóRate Accounts dashboard

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, AlertTriangle, Zap, Flame, TrendingDown, Search, Trash2, Pencil, Upload, ChevronDown, ChevronUp, LineChart as LineChartIcon, Download, MoreHorizontal, BarChart3, Loader2, Mail, SlidersHorizontal, FileText, Building2, Users, Activity } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";
import { createClient } from "@/lib/supabase/client";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import UploadReading from "./UploadReading";
import ImportAccounts from "./ImportAccounts";
import { comparableMeterPoint, meterPointIssue, normalizeMeterPoint } from "@/lib/meter-points";
import { projectedAnnualCost } from "@/lib/cost-engine";
import BenchmarksBoard from "./BenchmarksBoard";
import CompanyOverview from "./CompanyOverview";

const HORIZON_DAYS = 120;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr + "T00:00:00");
  return Math.round((end - today) / 86400000);
}

function renewalNextStep(account) {
  const status = account.renewal_status || "not_started";
  if (status === "switching") return "Verify switch";
  if (status === "quote_requested") return "Compare quotes";
  if (status === "renewed") return "Renewal complete";
  const d = account.daysLeft;
  if (d === null) return "Add contract date";
  if (d < 0) return "Confirm current terms";
  if (d <= 14) return "Approve / switch now";
  if (d <= 30) return "Compare & approve";
  if (d <= 60) return "Request quotes";
  if (d <= 90) return "Review usage & market";
  return "Plan renewal";
}

function statusOf(daysLeft) {
  if (daysLeft === null) return "unknown";
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 30) return "urgent";
  if (daysLeft <= 90) return "soon";
  return "ok";
}

const STATUS_META = {
  overdue: { label: "Out of contract", color: "var(--red)" },
  urgent: { label: "Renew now", color: "var(--red)" },
  soon: { label: "Renewing soon", color: "var(--amber)" },
  ok: { label: "Active", color: "var(--green)" },
  unknown: { label: "No date set", color: "var(--muted)" },
};

const RENEWAL_STATUS_META = {
  not_started: { label: "Not started", color: "var(--muted)" },
  quote_requested: { label: "Quote requested", color: "var(--amber)" },
  switching: { label: "Switching", color: "var(--state)" },
  renewed: { label: "Renewed", color: "var(--green)" },
};

function renewalMeta(status) {
  return RENEWAL_STATUS_META[status] || RENEWAL_STATUS_META.not_started;
}

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "€" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtReportRate(rate) {
  if (rate === null || rate === undefined || rate === "" || Number.isNaN(Number(rate))) return "-";
  return `${Number(rate).toLocaleString("en-IE", { maximumFractionDigits: 2 })}c/kWh`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IE");
}

function exportAccountsExcel(accounts) {
  const headers = [
    "Site name",
    "Location",
    "Provider",
    "MPRN/GPRN",
    "Supplier account number",
    "Fuel type",
    "Contract end date",
    "Annual usage (kWh)",
    "Current rate (c/kWh)",
    "Standing charge (c/day)",
    "Market/quoted rate (c/kWh)",
    "Notes",
  ];

  const rows = accounts.map((a) => [
    a.name || "",
    a.location || "",
    a.provider || "",
    a.account_number || "",
    a.supplier_account_number || "",
    a.fuel_type || "",
    a.contract_end || "",
    a.usage != null ? Number(a.usage) : "",
    a.rate != null ? Number(a.rate) : "",
    a.standing_charge != null ? Number(a.standing_charge) : "",
    a.market_rate != null ? Number(a.market_rate) : "",
    a.notes || "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Filter dropdowns on every column header, active the moment the file opens
  const lastCol = XLSX.utils.encode_col(headers.length - 1);
  ws["!autofilter"] = { ref: `A1:${lastCol}${rows.length + 1}` };

  // Sensible column widths so nothing's cut off on first open
  ws["!cols"] = [
    { wch: 26 }, // Site name
    { wch: 16 }, // Location
    { wch: 16 }, // Provider
    { wch: 14 }, // MPRN/GPRN
    { wch: 18 }, // Supplier account number
    { wch: 11 }, // Fuel type
    { wch: 14 }, // Contract end date
    { wch: 15 }, // Annual usage
    { wch: 14 }, // Current rate
    { wch: 16 }, // Standing charge
    { wch: 18 }, // Market/quoted rate
    { wch: 30 }, // Notes
  ];

  ws["!freeze"] = { xSplit: 0, ySplit: 1 }; // keep the header row visible while scrolling

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Accounts");
  XLSX.writeFile(wb, `gnorate-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const MISSING_BILL_DAYS = 45;
const RATE_JUMP_THRESHOLD = 5; // percent increase vs the previous bill that triggers a flag

function accountConfidence(acc, latest) {
  let score = 100;
  const reasons = [];

  if (!acc.rate) {
    score -= 20;
    reasons.push("no current rate on file");
  }
  if (!acc.usage) {
    score -= 15;
    reasons.push("no usage on file");
  }
  if (!acc.contract_end) {
    score -= 15;
    reasons.push("no contract end date");
  }
  if (!acc.standing_charge) {
    score -= 10;
    reasons.push("no standing charge on file");
  }

  let daysSinceLastReading = null;
  if (!latest) {
    score -= 20;
    reasons.push("no readings ever added");
  } else {
    if (latest.reading_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysSinceLastReading = Math.round((today - new Date(latest.reading_date + "T00:00:00")) / 86400000);
      if (daysSinceLastReading > MISSING_BILL_DAYS) {
        score -= 15;
        reasons.push(`last bill was ${daysSinceLastReading} days ago`);
      }
    }
    if (latest.confidence === "low") {
      score -= 15;
      reasons.push("last upload was low-confidence — worth double-checking");
    } else if (latest.confidence === "medium") {
      score -= 5;
    }
  }

  score = Math.max(0, Math.min(100, score));

  const missingBill = !latest || (daysSinceLastReading !== null && daysSinceLastReading > MISSING_BILL_DAYS);

  return { score, reasons, missingBill, daysSinceLastReading };
}

function gasTariffFor(acc) {
  if ((acc.fuel_type || "electricity") !== "gas") return null;
  const usage = parseFloat(acc.usage);
  const spc = parseFloat(acc.spc_kwh);
  if (isNaN(usage)) return null;
  if (usage < 73000) return "SBU";
  if (usage <= 750000 && (isNaN(spc) || spc < 3750)) return "MBU";
  return "FVT";
}

function attentionLevelFor(a) {
  const renewalStatus = a.renewal_status || "not_started";
  const renewalActive = renewalStatus === "quote_requested" || renewalStatus === "switching";
  const renewalComplete = renewalStatus === "renewed";
  const d = a.daysLeft;

  // Contract timing always drives urgency. An active quote/switch is still work in progress,
  // so it remains visible instead of being flattened to “non urgent”.
  if (!renewalComplete && d !== null && (d < 0 || d <= 30)) return "urgent";
  if (!renewalComplete && d !== null && d <= 60) return "check";
  if (renewalActive) return "check";
  if (a.lowConfidenceBill || (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD && (a.rateChange.reviewStatus || "unreviewed") === "unreviewed")) return "check";
  return "none";
}

function overallStatusFor(a) {
  const renewalStatus = a.renewal_status || "not_started";
  const beingHandled = renewalStatus === "quote_requested" || renewalStatus === "switching";

  if ((a.status === "overdue" || a.status === "urgent") && !beingHandled) {
    return { label: "Contract needs action", color: "var(--red)" };
  }
  if (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD && (a.rateChange.reviewStatus || "unreviewed") === "unreviewed") {
    return { label: "Rate increase to check", color: "var(--amber)" };
  }
  if (a.lowConfidenceBill) {
    return { label: "Bill details to check", color: "var(--amber)" };
  }
  if (beingHandled) {
    return { label: renewalMeta(renewalStatus).label, color: "var(--teal)" };
  }
  if (a.status === "soon") {
    return { label: "Renewal coming up", color: "var(--state)" };
  }
  if (a.confidence.missingBill) {
    return { label: "Bill data may be out of date", color: "var(--muted)" };
  }
  if (!a.provider || !a.rate || !a.usage || !a.contract_end || !a.standing_charge || !a.location || !a.account_number) {
    return { label: "Account details incomplete", color: "var(--muted)" };
  }
  return { label: "On track", color: "var(--green)" };
}

function accountStatusDetail(a) {
  const renewalStatus = a.renewal_status || "not_started";
  const beingHandled = renewalStatus === "quote_requested" || renewalStatus === "switching";
  if ((a.status === "overdue" || a.status === "urgent") && !beingHandled) {
    return a.status === "overdue"
      ? "Contract end date passed " + Math.abs(a.daysLeft) + " day" + (Math.abs(a.daysLeft) === 1 ? "" : "s") + " ago. Confirm the current terms with the supplier."
      : "Contract ends in " + a.daysLeft + " day" + (a.daysLeft === 1 ? "" : "s") + ". Start reviewing renewal options.";
  }
  if (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD && (a.rateChange.reviewStatus || "unreviewed") === "unreviewed") return "Recorded rate rose " + a.rateChange.pct.toFixed(1) + "% between bills (" + a.rateChange.from + "c to " + a.rateChange.to + "c/kWh). Check the latest bill to confirm the change.";
  if (a.lowConfidenceBill) return "Some bill details could not be read confidently. Compare them with the original bill.";
  if (renewalStatus === "quote_requested") return "A renewal quote has been requested.";
  if (renewalStatus === "switching") return "A supplier change is in progress.";
  if (a.status === "soon") return "Contract ends in " + a.daysLeft + " days. Compare renewal options when ready.";
  if (a.confidence.missingBill) {
    return a.confidence.daysSinceLastReading != null
      ? "Latest bill on file is " + a.confidence.daysSinceLastReading + " days old. Billing cycles vary, so check whether a newer bill is expected."
      : "No bill is on file yet. Upload one when available to see recorded usage and confirm rates.";
  }
  if (a.confidence.score < 50 && a.confidence.reasons.length) return "Some account details are not recorded yet: " + a.confidence.reasons.join("; ") + ".";
  const missing = [];
  if (!a.location) missing.push("site location");
  if (!a.account_number) missing.push(a.fuel_type === "gas" ? "GPRN" : "MPRN");
  if (!a.provider) missing.push("supplier");
  if (!a.rate) missing.push("current rate");
  if (!a.usage) missing.push("annual usage");
  if (!a.contract_end) missing.push("contract end date");
  if (!a.standing_charge) missing.push("standing charge");
  if (missing.length) return "Not recorded: " + missing.join(", ") + ". Add these details to improve comparisons.";
  return a.contract_end ? "Contract currently recorded through " + new Date(a.contract_end + "T00:00:00").toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) + "." : "No current account issue flagged from the information on file.";
}

function accountNextSteps(a) {
  const steps = [];
  const renewalStatus = a.renewal_status || "not_started";
  const renewalInProgress = renewalStatus === "quote_requested" || renewalStatus === "switching";

  if ((a.status === "overdue" || a.status === "urgent") && !renewalInProgress) {
    steps.push({ kind: "action", action: "renewal", title: a.status === "overdue" ? "Confirm the current contract" : "Review the upcoming renewal", detail: a.status === "overdue" ? "The recorded end date has passed. Confirm the current terms with the supplier, then update the renewal stage." : `The contract ends in ${a.daysLeft} days. Decide whether to request a quote or begin a supplier change.`, button: "Update renewal stage" });
  }
  if (a.daysLeft !== null && a.daysLeft > 30 && a.daysLeft <= HORIZON_DAYS && !renewalInProgress) {
    steps.push({ kind: "info", action: "renewal", title: "Contract renewal coming up", detail: `The contract ends in ${a.daysLeft} days. Plan to review supplier options before the end date.`, button: "View renewal stage" });
  }
  if (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD && (a.rateChange.reviewStatus || "unreviewed") === "unreviewed") {
    steps.push({ kind: "check", action: "confirm-rate", title: "Confirm the recorded rate increase", detail: `The latest bill rate changed ${a.rateChange.pct.toFixed(1)}% from ${a.rateChange.from}c to ${a.rateChange.to}c/kWh. Confirm it, correct it, or dismiss the alert after checking the bill.`, button: "Review & confirm rate" });
  }
  if (a.lowConfidenceBill) {
    steps.push({ kind: "check", action: "upload", title: "Verify bill details", detail: "Some bill details were uncertain. Upload a clearer copy or check the saved figures against the original bill.", button: "Upload a clearer bill" });
  }
  if (a.confidence.missingBill) {
    steps.push({ kind: "info", action: "upload", title: "Bill information may be out of date", detail: a.confidence.daysSinceLastReading != null ? `The latest saved bill is ${a.confidence.daysSinceLastReading} days old. Billing cycles vary; add a newer bill when you receive one.` : "No bill is saved yet. Add one when available to record usage and confirm the current rate.", button: "Upload a bill" });
  }
  const missing = [];
  if (!a.location) missing.push("site location");
  if (!a.account_number) missing.push(a.fuel_type === "gas" ? "GPRN" : "MPRN");
  if (!a.provider) missing.push("supplier");
  if (!a.rate) missing.push("current rate");
  if (!a.usage) missing.push("annual usage");
  if (!a.contract_end) missing.push("contract end date");
  if (!a.standing_charge) missing.push("standing charge");
  if (missing.length) {
    steps.push({ kind: "info", action: "edit", title: "Some account details are missing", detail: `Add ${missing.join(", ")} to improve rate comparisons, renewal reminders and spend estimates.`, button: "Complete account details" });
  }
  if (!a.comparison || a.comparison.source === "estimated") {
    steps.push({ kind: "info", action: "market", title: a.comparison ? "Market figure is an estimate" : "No market comparison is saved", detail: "Review available rates and request a supplier quote before making a switching decision. Any savings shown are indicative.", button: "Review rates and quotes" });
  }
  if (renewalInProgress) {
    steps.push({ kind: "info", action: "renewal", title: "Renewal marked as in progress", detail: `Current stage: ${renewalMeta(renewalStatus).label}. Update this when the supplier process changes.`, button: "Update renewal stage" });
  }
  if (!steps.length) {
    steps.push({ kind: "info", action: null, title: "No action currently flagged", detail: "This is a status summary based on the information saved in GnóRate. Review it when you receive a new bill or supplier update.", button: null });
  }
  return steps;
}

function formatAccountDate(dateStr) {
  return dateStr ? new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded";
}

function severityRank(a) {
  const label = overallStatusFor(a).label;
  if (label === "Contract needs action") return 0;
  if (label === "Rate increase to check" || label === "Bill details to check") return 1;
  if (label === "Renewal coming up") return 2;
  if (label === "Bill data may be out of date" || label === "Account details incomplete") return 4;
  if (label === "On track") return 6;
  return 5; // being-handled: Quote requested / Switching
}

function allMasterRatesFor(acc, masterRates) {
  const fuel = acc.fuel_type || "electricity";
  const candidates = masterRates.filter((r) => r.fuel_type === fuel);
  if (candidates.length === 0) return [];

  const tier = fuel === "gas" ? gasTariffFor(acc) : acc.dg_group || null;
  const tierMatches = tier ? candidates.filter((r) => r.tariff_tier === tier) : [];
  if (tierMatches.length > 0) {
    return [...tierMatches].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
  }

  const usage = parseFloat(acc.usage);
  if (isNaN(usage)) return [];
  const usageMatches = candidates.filter(
    (r) => !r.tariff_tier && usage >= (r.min_usage || 0) && (r.max_usage === null || r.max_usage === undefined || usage <= r.max_usage)
  );
  return [...usageMatches].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
}

function masterRateFor(acc, masterRates) {
  const all = allMasterRatesFor(acc, masterRates);
  return all.length > 0 ? all[0] : null;
}

function marketComparisonFor(acc, benchmarks, masterRates = []) {
  const usage = parseFloat(acc.usage);
  const accRate = parseFloat(acc.rate);
  if (isNaN(accRate)) return null;

  // A manually entered quote always wins over anything else
  const manualRate = parseFloat(acc.market_rate);
  if (!isNaN(manualRate)) {
    return { rate: manualRate, source: "quoted" };
  }

  // A rate you've manually verified beats a company-specific benchmark or an AI estimate
  const master = masterRateFor(acc, masterRates);
  if (master) {
    const micVal = parseFloat(acc.mic_kva);
    const estCapacityCost =
      master.capacity_charge && !isNaN(micVal) ? parseFloat(master.capacity_charge) * micVal : null;
    return {
      rate: parseFloat(master.rate),
      source: "verified",
      note: master.note,
      supplierName: master.suppliers?.name,
      updatedAt: master.updated_at,
      dgGroup: master.tariff_tier,
      estCapacityCost,
    };
  }

  if (isNaN(usage)) return null;
  const match = benchmarks.find(
    (b) =>
      b.fuel_type === (acc.fuel_type || "electricity") &&
      usage >= (b.usage_min || 0) &&
      (b.usage_max === null || b.usage_max === undefined || usage <= b.usage_max)
  );
  if (!match) return null;
  return { rate: parseFloat(match.typical_rate), source: "estimated" };
}

function estimatedAnnualSpend(acc, readings) {
  return projectedAnnualCost(acc, readings).projected;
}

function annualCostDetail(acc, readings, quote = null) {
  return projectedAnnualCost(acc, readings, quote);
}

function annualSaving(acc) {
  const rate = parseFloat(acc.rate);
  const market = parseFloat(acc.market_rate);
  const usage = parseFloat(acc.usage);
  if (isNaN(rate) || isNaN(market) || isNaN(usage)) return null;
  return ((rate - market) / 100) * usage;
}

function Gauge({ daysLeft, status, size = 64 }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let frac;
  if (daysLeft === null) frac = 0;
  else if (daysLeft < 0) frac = 1;
  else frac = Math.min(1, Math.max(0, (HORIZON_DAYS - daysLeft) / HORIZON_DAYS));
  const color = STATUS_META[status].color;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, lineHeight: 1 }}>
          {daysLeft === null ? "–" : Math.abs(daysLeft)}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 7, color: "var(--muted)", letterSpacing: 0.5 }}>
          {daysLeft === null ? "" : daysLeft < 0 ? "OVER" : "DAYS"}
        </span>
      </div>
    </div>
  );
}

const inputStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  color: "var(--text)",
  fontSize: 16,
  outline: "none",
};

function Field({ label, required, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
      <span>
        {label}
        {required ? <span style={{ color: "var(--red)" }}> *</span> : <span style={{ color: "var(--muted)", opacity: 0.7 }}> (optional)</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--muted)", opacity: 0.8, marginTop: -2 }}>{hint}</span>}
    </label>
  );
}

function AccountForm({ initial, existingLocations = [], existingAccounts = [], onSave, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? { ...initial }
      : {
          name: "",
          provider: "",
          account_number: "",
          fuel_type: "electricity",
          contract_end: "",
          rate: "",
          standing_charge: "",
          usage: "",
          market_rate: "",
          notes: "",
          mic_kva: "",
          spc_kwh: "",
          bill_delivery_method: "",
          portal_login_email: "",
        }
  );
  const [formError, setFormError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
      onClick={onCancel}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
            {initial ? "Edit account" : "Add account"}
          </h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Site / account name" required hint="Use the same format for every site — makes search and sorting easier later.">
            <input style={inputStyle} value={form.name} onChange={set("name")} placeholder="e.g. 12 Main Street, Unit 3" />
          </Field>
          <Field label="Location" hint="If this building has both gas and electricity, use the same location name for both.">
            <input style={inputStyle} value={form.location || ""} onChange={set("location")} placeholder="e.g. Palm Grove" list="location-suggestions" />
            <datalist id="location-suggestions">
              {existingLocations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </Field>
          <Field label="Fuel type" required>
            <select style={inputStyle} value={form.fuel_type} onChange={set("fuel_type")}>
              <option value="electricity">Electricity</option>
              <option value="gas">Gas</option>
            </select>
          </Field>
          <Field label={form.fuel_type === "gas" ? "GPRN (Gas Point Reference Number)" : "MPRN (Meter Point Reference Number)"} required>
            <input
              style={inputStyle}
              value={form.account_number || ""}
              onChange={set("account_number")}
              placeholder={form.fuel_type === "gas" ? "7-digit GPRN, on your bill" : "11-digit MPRN, on your bill"}
            />
          </Field>
          <Field label="Supplier account number" hint="The supplier's own customer/account number — different from the MPRN/GPRN, but useful for matching their correspondence.">
            <input
              style={inputStyle}
              value={form.supplier_account_number || ""}
              onChange={set("supplier_account_number")}
              placeholder="e.g. the number on their renewal letter"
            />
          </Field>
          <Field label="Provider">
            <input style={inputStyle} value={form.provider || ""} onChange={set("provider")} placeholder="e.g. Energia" />
          </Field>
          <Field label="How do bills arrive?" hint="So the team knows where to look for the next one.">
            <select style={inputStyle} value={form.bill_delivery_method || ""} onChange={set("bill_delivery_method")}>
              <option value="">Not sure</option>
              <option value="portal">Online portal</option>
              <option value="email">Email</option>
              <option value="post">Post</option>
            </select>
          </Field>
          {form.bill_delivery_method === "portal" && (
            <Field label="Portal login email" hint="Just the email used to log in — never store the password here.">
              <input
                style={inputStyle}
                value={form.portal_login_email || ""}
                onChange={set("portal_login_email")}
                placeholder="e.g. accounts@yourcompany.ie"
              />
            </Field>
          )}
          <Field label="Contract end date">
            <input type="date" style={inputStyle} value={form.contract_end || ""} onChange={set("contract_end")} />
          </Field>
          <Field label="Annual usage (kWh)">
            <input type="number" style={inputStyle} value={form.usage || ""} onChange={set("usage")} placeholder="e.g. 45000" />
          </Field>
          <Field label="Current unit rate (c/kWh)">
            <input type="number" step="0.01" style={inputStyle} value={form.rate || ""} onChange={set("rate")} placeholder="e.g. 24.5" />
          </Field>
          <Field label="Standing charge (c/day)">
            <input type="number" step="0.01" style={inputStyle} value={form.standing_charge || ""} onChange={set("standing_charge")} placeholder="e.g. 90" />
          </Field>
          {form.fuel_type !== "gas" && (
            <Field label="MIC / capacity (kVA)">
              <input
                type="number"
                step="0.01"
                style={inputStyle}
                value={form.mic_kva || ""}
                onChange={set("mic_kva")}
                placeholder="Only for larger connections — leave blank if unsure"
              />
            </Field>
          )}
          {form.fuel_type !== "gas" && (
            <Field label="DG Group" hint="Printed near the MPRN on your bill — determines your actual rate structure.">
              <input style={inputStyle} value={form.dg_group || ""} onChange={set("dg_group")} placeholder="e.g. DG5, DG6" />
            </Field>
          )}
          {form.fuel_type === "gas" && (
            <Field label="SPC (Supply Point Capacity, kWh)">
              <input
                type="number"
                style={inputStyle}
                value={form.spc_kwh || ""}
                onChange={set("spc_kwh")}
                placeholder="On your bill — determines SBU/MBU/FVT tariff"
              />
            </Field>
          )}
          <Field label="Best market rate found (c/kWh)">
            <input type="number" step="0.01" style={inputStyle} value={form.market_rate || ""} onChange={set("market_rate")} placeholder="Optional" />
            {form.market_rate && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11.5, color: "var(--muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.share_rate_with_wattpryce || false}
                  onChange={(e) => setForm((f) => ({ ...f, share_rate_with_wattpryce: e.target.checked }))}
                />
                Share this rate with GnóRate to help other customers (reviewed before it's ever shown to anyone)
              </label>
            )}
          </Field>
          <div />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Notes">
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes || ""} onChange={set("notes")} placeholder="Broker contact, special clauses, etc." />
            </Field>
          </div>
        </div>

        {formError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 14 }}>{formError}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!form.name.trim()) {
                setFormError("Site/account name is required.");
                return;
              }
              if (!form.account_number || !String(form.account_number).trim()) {
                setFormError(`${form.fuel_type === "gas" ? "GPRN" : "MPRN"} is required.`);
                return;
              }
              const number = normalizeMeterPoint(form.account_number, form.fuel_type);
              const meterPointError = meterPointIssue(number, form.fuel_type);
              if (meterPointError) {
                setFormError(meterPointError);
                return;
              }
              const duplicate = existingAccounts.some((account) => account.id !== form.id && account.fuel_type === form.fuel_type && comparableMeterPoint(normalizeMeterPoint(account.account_number, account.fuel_type)) === comparableMeterPoint(number));
              if (duplicate) {
                setFormError(`This ${form.fuel_type === "gas" ? "GPRN" : "MPRN"} is already listed in this company.`);
                return;
              }
              setFormError(null);
              onSave({ ...form, account_number: number });
            }}
            style={{ background: "var(--teal)", border: "none", color: "#ffffff", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            {initial ? "Save changes" : "Add account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatChartDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}

function ReadingsChart({ readings, marketRate }) {
  const data = [...readings]
    .filter((r) => r.reading_date)
    .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date))
    .map((r) => ({
      date: r.reading_date,
      dateLabel: formatChartDate(r.reading_date),
      usage: r.usage ? Number(r.usage) : null,
      rate: r.rate ? Number(r.rate) : null,
    }));

  if (data.length < 2) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>
        Add at least two dated readings to see a trend chart here.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 240, marginBottom: 10 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#dce6df" strokeDasharray="3 3" />
          <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: "#71847b" }} />
          <YAxis
            yAxisId="usage"
            tick={{ fontSize: 10, fill: "#71847b" }}
            width={44}
            label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 10, fill: "#71847b" }}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tick={{ fontSize: 10, fill: "#71847b" }}
            width={44}
            label={{ value: "c/kWh", angle: 90, position: "insideRight", fontSize: 10, fill: "#71847b" }}
          />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border-light)", fontSize: 12 }}
            labelStyle={{ color: "var(--text)" }}
            formatter={(value, name) => [name === "Usage (kWh)" ? `${value} kWh` : `${value}c/kWh`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#71847b" }} />
          {marketRate && (
            <ReferenceLine
              yAxisId="rate"
              y={marketRate}
              stroke="#71847b"
              strokeDasharray="4 4"
              label={{ value: "Market rate", fontSize: 9, fill: "#71847b", position: "insideTopRight" }}
            />
          )}
          <Line yAxisId="usage" type="monotone" dataKey="usage" name="Usage (kWh)" stroke="#12895d" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line yAxisId="rate" type="monotone" dataKey="rate" name="Rate (c/kWh)" stroke="#b87412" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ManualReadingForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ reading_date: "", usage: "", rate: "", standing_charge: "", total_cost: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}
      onClick={onCancel}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 380, maxWidth: "100%", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Add a reading</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Billing period end date">
            <input type="date" style={inputStyle} value={form.reading_date} onChange={set("reading_date")} />
          </Field>
          <Field label="Usage (kWh)">
            <input type="number" style={inputStyle} value={form.usage} onChange={set("usage")} placeholder="e.g. 5400" />
          </Field>
          <Field label="Unit rate (c/kWh)">
            <input type="number" step="0.01" style={inputStyle} value={form.rate} onChange={set("rate")} placeholder="e.g. 24.5" />
          </Field>
          <Field label="Standing charge (c/day)">
            <input type="number" step="0.01" style={inputStyle} value={form.standing_charge} onChange={set("standing_charge")} placeholder="Optional" />
          </Field>
          <Field label="Total bill amount (€)" hint="Enter the actual bill total shown on the bill, if available.">
            <input type="number" step="0.01" style={inputStyle} value={form.total_cost} onChange={set("total_cost")} placeholder="Optional" />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            style={{ background: "var(--teal)", border: "none", color: "#ffffff", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            Save reading
          </button>
        </div>
      </div>
    </div>
  );
}

function recommendationFor(a) {
  if (!a.comparison) {
    return { verdict: "unknown", label: "No comparison yet", detail: "Add a supplier quote or current benchmark to compare this account.", color: "var(--muted)" };
  }
  const saving = a.saving;
  if (saving === null) {
    return { verdict: "unknown", label: "Not enough data", detail: "Add the current unit rate and annual usage to estimate a difference.", color: "var(--muted)" };
  }
  if (saving <= 20) {
    return { verdict: "stay", label: "No material unit-rate gap", detail: "The recorded rates are close. Compare the full annual charges before deciding.", color: "var(--green)" };
  }
  const detail = `The unit-rate difference is about ${fmtMoney(saving)} per year using the annual usage on this account. This excludes standing charges, capacity charges, levies, VAT and contract fees. Check a full supplier quote before switching.`;
  if (saving <= 100) {
    return { verdict: "marginal", label: "Small rate difference", detail, color: "var(--amber)" };
  }
  return { verdict: "switch", label: "Request a full quote", detail, color: "var(--teal)" };
}

function buildProviderNegotiationContent(acc, comparison, companyName) {
  const fuel = (acc.fuel_type || "electricity") === "gas" ? "gas" : "electricity";
  const subject = `Renewal check-in — ${acc.name}${acc.account_number ? ` (${acc.account_number})` : ""}`;

  const lines = [
    "Hi,",
    "",
    `Ahead of my ${fuel} contract renewal, I wanted to check in on the account below:`,
    "",
    companyName ? `Business: ${companyName}` : null,
    `Site: ${acc.name}`,
    acc.account_number ? `${fuel === "gas" ? "GPRN" : "MPRN"}: ${acc.account_number}` : null,
    acc.rate ? `Current rate: ${acc.rate}c/kWh` : null,
    acc.standing_charge ? `Current standing charge: ${acc.standing_charge}c/day` : null,
    fuel !== "gas" && acc.dg_group ? `DG Group: ${acc.dg_group}` : null,
    acc.contract_end ? `Contract end date: ${acc.contract_end}` : null,
    "",
    comparison && comparison.rate < acc.rate
      ? `I've seen current market rates around ${comparison.rate}c/kWh for a similar account. Could you match or improve on this ahead of my renewal?`
      : "Could you let me know what rate you can offer for the upcoming renewal period?",
    "",
    "Thanks,",
  ].filter(Boolean);

  return { subject, body: lines.join("\n") };
}

function providerNegotiationMailto(acc, providerEmail, comparison, companyName) {
  const { subject, body } = buildProviderNegotiationContent(acc, comparison, companyName);
  return `mailto:${providerEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildBulkQuoteRequestContent(accs, companyName) {
  const subject = `Rate quote request — ${accs.length} account${accs.length === 1 ? "" : "s"}`;

  const lines = [
    "Hi,",
    "",
    companyName ? `Business: ${companyName}` : null,
    `I'd like current business rate quotes for the following ${accs.length} account${accs.length === 1 ? "" : "s"}:`,
    "",
  ].filter(Boolean);

  accs.forEach((acc, i) => {
    const fuel = (acc.fuel_type || "electricity") === "gas" ? "gas" : "electricity";
    const tariff = gasTariffFor(acc);
    lines.push(`${i + 1}. ${acc.name}`);
    if (acc.account_number) lines.push(`   ${fuel === "gas" ? "GPRN" : "MPRN"}: ${acc.account_number}`);
    if (acc.provider) lines.push(`   Current supplier: ${acc.provider}`);
    if (acc.rate) lines.push(`   Current rate: ${acc.rate}c/kWh`);
    if (acc.standing_charge) lines.push(`   Current standing charge: ${acc.standing_charge}c/day`);
    if (acc.usage) lines.push(`   Annual usage: ${acc.usage} kWh`);
    if (fuel === "gas" && tariff) lines.push(`   Tariff tier: ${tariff}`);
    if (fuel === "gas" && acc.spc_kwh) lines.push(`   Supply Point Capacity: ${acc.spc_kwh} kWh`);
    if (fuel !== "gas" && acc.mic_kva) lines.push(`   MIC: ${acc.mic_kva} kVA`);
    if (fuel !== "gas" && acc.dg_group) lines.push(`   DG Group: ${acc.dg_group}`);
    if (acc.contract_end) lines.push(`   Contract end date: ${acc.contract_end}`);
    lines.push("");
  });

  lines.push("Could you send over your best current rates for these accounts?", "", "Thanks,");

  return { subject, body: lines.join("\n") };
}

function bulkQuoteRequestMailto(accs, supplierEmail, companyName) {
  const { subject, body } = buildBulkQuoteRequestContent(accs, companyName);
  return `mailto:${supplierEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function bulkQuoteRequestMailtoBCC(accs, supplierEmails, companyName) {
  const { subject, body } = buildBulkQuoteRequestContent(accs, companyName);
  return `mailto:?bcc=${encodeURIComponent(supplierEmails.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildQuoteRequestContent(acc, companyName) {
  const fuel = (acc.fuel_type || "electricity") === "gas" ? "gas" : "electricity";
  const tariff = gasTariffFor(acc);

  const subject = `Rate quote request — ${acc.name}${acc.account_number ? ` (${acc.account_number})` : ""}`;

  const lines = [
    "Hi,",
    "",
    `I'd like a current business ${fuel} rate quote for the following account:`,
    "",
    companyName ? `Business: ${companyName}` : null,
    `Site: ${acc.name}`,
    acc.account_number ? `${fuel === "gas" ? "GPRN" : "MPRN"}: ${acc.account_number}` : null,
    acc.provider ? `Current supplier: ${acc.provider}` : null,
    acc.rate ? `Current rate: ${acc.rate}c/kWh` : null,
    acc.standing_charge ? `Current standing charge: ${acc.standing_charge}c/day` : null,
    acc.usage ? `Annual usage: ${acc.usage} kWh` : null,
    fuel === "gas" && tariff ? `Tariff tier: ${tariff}` : null,
    fuel === "gas" && acc.spc_kwh ? `Supply Point Capacity: ${acc.spc_kwh} kWh` : null,
    fuel !== "gas" && acc.mic_kva ? `MIC: ${acc.mic_kva} kVA` : null,
    fuel !== "gas" && acc.dg_group ? `DG Group: ${acc.dg_group}` : null,
    acc.contract_end ? `Current contract end date: ${acc.contract_end}` : null,
    "",
    "Could you send over your best current rate for this account?",
    "",
    "Thanks,",
  ].filter(Boolean);

  return { subject, body: lines.join("\n") };
}

function quoteRequestMailtoBCC(acc, supplierEmails, companyName) {
  const { subject, body } = buildQuoteRequestContent(acc, companyName);
  return `mailto:?bcc=${encodeURIComponent(supplierEmails.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function quoteRequestMailto(acc, supplierEmail, companyName) {
  const { subject, body } = buildQuoteRequestContent(acc, companyName);
  return `mailto:${supplierEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const GNORATE_REPORT = {
  deep: [0, 61, 50],
  green: [11, 149, 105],
  bright: [30, 190, 134],
  ink: [20, 36, 58],
  muted: [96, 113, 135],
  amber: [202, 133, 24],
  red: [183, 63, 52],
  pale: [243, 248, 249],
  border: [222, 233, 230],
  white: [255, 255, 255],
};

function drawGnReportHeader(doc, title, companyName) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const c = GNORATE_REPORT;
  doc.setFillColor(...c.deep);
  doc.rect(0, 0, pageWidth, 39, "F");
  doc.setFillColor(...c.green);
  doc.rect(0, 38, pageWidth, 1.2, "F");

  drawGnReportMark(doc, 14, 8, 10);
  doc.setTextColor(...c.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Gnó", 28, 16);
  const brandWidth = doc.getTextWidth("Gnó");
  doc.setTextColor(...c.bright);
  doc.text("Rate", 28 + brandWidth, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.3);
  doc.setTextColor(140, 220, 188);
  doc.text("COMMERCIAL UTILITY INTELLIGENCE", 28, 23);

  doc.setTextColor(...c.white);
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.text(title, pageWidth - 14, 13.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(190, 216, 205);
  doc.text(
    `${companyName || "All companies"}  ·  ${new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}`,
    pageWidth - 14,
    21,
    { align: "right", maxWidth: pageWidth - 70 }
  );
}

function drawGnReportMark(doc, x, y, size = 10) {
  const c = GNORATE_REPORT;
  const scale = size / 40;
  const cx = x + size / 2;
  const cy = y + size / 2;
  doc.setFillColor(...c.green);
  doc.roundedRect(x, y, size, size, size * 0.3, size * 0.3, "F");
  doc.setDrawColor(...c.white);
  doc.setLineWidth(size * 0.075);
  doc.ellipse(cx, cy, size * 0.285, size * 0.285, "S");
  doc.setFillColor(...c.green);
  doc.rect(x + size * 0.69, y + size * 0.25, size * 0.31, size * 0.5, "F");
  doc.setDrawColor(...c.white);
  doc.setLineWidth(size * 0.078);
  doc.line(cx, cy, x + size * 0.82, cy);
  doc.setFillColor(...c.bright);
  doc.circle(x + size * 0.83, cy, size * 0.04, "F");
  return { x: x + size + 4 * scale, y };
}

function gnReportTableStyles() {
  const c = GNORATE_REPORT;
  return {
    theme: "plain",
    headStyles: { fillColor: c.deep, textColor: c.white, font: "helvetica", fontSize: 7.6, fontStyle: "bold", cellPadding: 3.5, lineColor: c.deep, lineWidth: 0 },
    bodyStyles: { font: "helvetica", fontSize: 7.8, textColor: c.ink, cellPadding: 3.5, lineColor: c.border, lineWidth: { bottom: 0.18 } },
    alternateRowStyles: { fillColor: [249, 251, 251] },
    margin: { top: 25, bottom: 22, left: 14, right: 14 },
  };
}

function drawGnReportSectionHeading(doc, title, y, detail = "") {
  const c = GNORATE_REPORT;
  doc.setFillColor(...c.green);
  doc.roundedRect(14, y - 4.5, 1.4, detail ? 10 : 7, 0.6, 0.6, "F");
  doc.setTextColor(...c.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text(title, 19, y);
  if (detail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...c.muted);
    doc.text(detail, 19, y + 5);
  }
  return y + (detail ? 13 : 9);
}

function drawGnReportInsight(doc, { y, pageWidth, eyebrow, title, detail, value }) {
  const c = GNORATE_REPORT;
  const x = 14;
  const w = pageWidth - 28;
  const h = 29;
  doc.setFillColor(...c.deep);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  doc.setFillColor(...c.green);
  doc.roundedRect(x, y, 2, h, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(117, 219, 179);
  doc.text(eyebrow.toUpperCase(), x + 7, y + 7);
  doc.setFontSize(11);
  doc.setTextColor(...c.white);
  doc.text(title, x + 7, y + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(205, 224, 215);
  doc.text(detail, x + 7, y + 22, { maxWidth: w - 62 });
  if (value) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...c.bright);
    doc.text(value, x + w - 7, y + 17, { align: "right" });
  }
  return y + h;
}

function drawGnReportFooters(doc, reportTitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    if (i > 1) {
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFillColor(...GNORATE_REPORT.deep);
      doc.rect(0, 0, pageWidth, 18, "F");
      doc.setFillColor(...GNORATE_REPORT.green);
      doc.rect(0, 17.5, pageWidth, 0.7, "F");
      const logoText = drawGnReportMark(doc, 14, 4.5, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GNORATE_REPORT.white);
      doc.text("Gnó", logoText.x, 11.5);
      const continuedBrandWidth = doc.getTextWidth("Gnó");
      doc.setTextColor(...GNORATE_REPORT.bright);
      doc.text("Rate", logoText.x + continuedBrandWidth, 11.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(190, 216, 205);
      doc.text(reportTitle, pageWidth - 14, 11.5, { align: "right" });
    }
    doc.setDrawColor(...GNORATE_REPORT.border);
    doc.setLineWidth(0.25);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);
    doc.setFillColor(...GNORATE_REPORT.green);
    doc.rect(14, pageHeight - 16.3, 22, 0.6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GNORATE_REPORT.muted);
    doc.text("GnóRate  ·  Commercial utility intelligence", 14, pageHeight - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: "right" });
  }
}

function generatePortfolioReport(enrichedAccounts, summaryStats, attentionGroups, companyName, readingSummaries) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const { green, ink: dark, muted, amber, red, pale: lightBg } = GNORATE_REPORT;
  const teal = green;

  drawGnReportHeader(doc, "Portfolio overview", companyName);

  let y = drawGnReportSectionHeading(doc, "Portfolio at a glance", 52);

  // ---- KPI cards ----
  const cardW = (pageWidth - 28 - 3 * 6) / 4;
  const cardH = 31;
  const spendValue = summaryStats.hasAnyCost ? fmtMoney(summaryStats.totalSpend) : summaryStats.partialBillCount > 0 ? "Needs more data" : "-";
  const cards = [
    { label: "Total accounts", value: String(summaryStats.total), accent: teal, small: false },
    { label: "Need attention", value: String(summaryStats.needAttention), accent: summaryStats.needAttention > 0 ? amber : green, small: false },
    { label: "Projected annual cost", value: spendValue, accent: teal, small: !summaryStats.hasAnyCost },
    { label: "Rate opportunity", value: summaryStats.hasAnyComparison ? fmtMoney(summaryStats.potentialSavings) : "-", accent: green, small: false },
  ];
  cards.forEach((card, i) => {
    const x = 14 + i * (cardW + 6);
    doc.setFillColor(...lightBg);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
    doc.setDrawColor(...GNORATE_REPORT.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "S");
    doc.setFillColor(...card.accent);
    doc.rect(x, y, 1.2, cardH, "F");

    doc.setFontSize(7.5);
    doc.setFont(undefined, "normal");
    doc.setTextColor(...muted);
    doc.text(card.label, x + 6, y + 10, { maxWidth: cardW - 10 });
    doc.setTextColor(...dark);
    doc.setFontSize(card.small ? 9.5 : 14);
    doc.setFont(undefined, "bold");
    doc.text(card.value, x + 6, y + 23, { maxWidth: cardW - 10 });
  });

  y += cardH + 7;

  if (summaryStats.partialBillCount > 0) {
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.setFont(undefined, "italic");
    doc.text(
      summaryStats.hasAnyCost
        ? `${summaryStats.partialBillCount} more account${summaryStats.partialBillCount === 1 ? "" : "s"} have some bill history but aren't included above yet - each needs 5+ bills for a reliable estimate.`
        : `${summaryStats.partialBillCount} account${summaryStats.partialBillCount === 1 ? " has" : "s have"} some bill history, but need at least 5 bills before a reliable annual estimate is shown.`,
      14,
      y,
      { maxWidth: pageWidth - 28 }
    );
    doc.setFont(undefined, "normal");
    y += 8;
  }

  y = drawGnReportInsight(doc, {
    y,
    pageWidth,
    eyebrow: "Portfolio pulse",
    title: summaryStats.needAttention ? `${summaryStats.needAttention} account${summaryStats.needAttention === 1 ? " needs" : "s need"} a review` : "Portfolio currently on track",
    detail: `${summaryStats.criticalCount} urgent  ·  ${summaryStats.reviewCount} checks  ·  ${summaryStats.total - summaryStats.needAttention} not currently flagged`,
    value: `${summaryStats.renewingSoon90} renewing soon`,
  }) + 9;

  // ---- Spend trend chart (last 6 months, from real bill history) ----
  const monthBuckets = {}; // Month key -> actual invoice total, or null if no total is recorded.
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = null;
  }
  Object.values(readingSummaries || {})
    .flat()
    .forEach((r) => {
      if (!r.reading_date) return;
      const key = r.reading_date.slice(0, 7);
      const totalCost = Number(r.total_cost);
      if (key in monthBuckets && r.total_cost !== null && r.total_cost !== undefined && r.total_cost !== "" && Number.isFinite(totalCost) && totalCost >= 0) {
        monthBuckets[key] = (monthBuckets[key] || 0) + totalCost;
      }
    });
  const monthKeys = Object.keys(monthBuckets);
  const monthValues = monthKeys.map((k) => monthBuckets[k]);
  const hasChartData = monthValues.some((v) => v !== null && v > 0);

  if (hasChartData) {
    y = drawGnReportSectionHeading(doc, "Spend trend", y, "Recorded bill costs over the last six months");

    const chartX = 14;
    const chartW = pageWidth - 28;
    const chartH = 39;
    const maxVal = Math.max(...monthValues, 1);

    doc.setFillColor(...lightBg);
    doc.roundedRect(chartX, y - 2, chartW, chartH + 15, 2.5, 2.5, "F");
    doc.setDrawColor(...GNORATE_REPORT.border);
    doc.setLineWidth(0.18);
    doc.line(chartX + 7, y + chartH / 3, chartX + chartW - 7, y + chartH / 3);
    doc.line(chartX + 7, y + (chartH * 2) / 3, chartX + chartW - 7, y + (chartH * 2) / 3);
    doc.line(chartX, y, chartX, y + chartH);
    doc.line(chartX, y + chartH, chartX + chartW, y + chartH);

    const points = monthKeys.map((k, i) => ({
      x: chartX + 7 + (i / (monthKeys.length - 1)) * (chartW - 14),
      yVal: monthBuckets[k] === null ? null : y + chartH - (monthBuckets[k] / maxVal) * (chartH - 6),
      val: monthBuckets[k],
      label: new Date(k + "-01").toLocaleDateString("en-IE", { month: "short", year: "2-digit" }),
    }));

    doc.setDrawColor(...teal);
    doc.setLineWidth(0.8);
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i].yVal !== null && points[i + 1].yVal !== null) doc.line(points[i].x, points[i].yVal, points[i + 1].x, points[i + 1].yVal);
    }
    points.forEach((p) => {
      if (p.yVal !== null) {
        doc.setFillColor(...teal);
        doc.circle(p.x, p.yVal, 1.1, "F");
        doc.setFontSize(6.5);
        doc.setTextColor(...dark);
        doc.text(fmtMoney(p.val) || "€0", p.x, p.yVal - 3, { align: "center" });
      }
      doc.setTextColor(...muted);
      doc.text(p.label, p.x, y + chartH + 6, { align: "center" });
    });

    y += chartH + 20;
  }

  // ---- Data coverage ----
  const allBillRecords = Object.values(readingSummaries || {}).flat().filter((reading) => reading.reading_date);
  const accountsWithBillHistory = enrichedAccounts.filter((account) => (readingSummaries?.[account.id] || []).some((reading) => reading.reading_date)).length;
  const accountsWithUsageAndRate = enrichedAccounts.filter((account) => account.usage !== null && account.usage !== undefined && account.rate !== null && account.rate !== undefined).length;
  const invoiceTotalsCount = allBillRecords.filter((reading) => reading.total_cost !== null && reading.total_cost !== undefined && reading.total_cost !== "" && Number.isFinite(Number(reading.total_cost))).length;
  const coverageRows = [
    ["Location recorded", `${enrichedAccounts.filter((account) => Boolean(account.location)).length} / ${enrichedAccounts.length}`, "Helps group spend and activity by site."],
    ["Contract end date recorded", `${enrichedAccounts.filter((account) => Boolean(account.contract_end)).length} / ${enrichedAccounts.length}`, "Needed for reliable renewal planning."],
    ["Dated usage / cost history", `${accountsWithBillHistory} / ${enrichedAccounts.length} accounts`, `${allBillRecords.length} dated reading records are on file.`],
    ["Usage and current rate recorded", `${accountsWithUsageAndRate} / ${enrichedAccounts.length} accounts`, "Supports comparisons and estimated costs."],
    ["Actual bill totals recorded", `${invoiceTotalsCount} / ${allBillRecords.length || "—"} reading records`, "These are invoice amounts; other cost figures are estimates."],
  ];
  if (enrichedAccounts.length > 0) {
    if (y > 213) { doc.addPage(); y = 28; }
    y = drawGnReportSectionHeading(doc, "Data coverage", y, "A quick check of what is and is not recorded in GnóRate");
    autoTable(doc, {
      startY: y,
      head: [["Data check", "Coverage", "Why it matters"]],
      body: coverageRows,
      ...gnReportTableStyles(),
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 38, halign: "center" } },
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ---- Spend by account, ranked ----
  const spendByAccount = enrichedAccounts
    .filter((a) => a.cost)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 12);

  if (spendByAccount.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 28;
    }
    y = drawGnReportSectionHeading(doc, "Spend by account", y, "Highest estimated annual spend first");

    autoTable(doc, {
      startY: y,
      head: [["Account", "Projected annual cost"]],
      body: spendByAccount.map((a) => [a.name, fmtMoney(a.cost)]),
      ...gnReportTableStyles(),
      columnStyles: { 1: { halign: "right" } },
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ---- Upcoming renewals ----
  const upcoming = enrichedAccounts
    .filter((a) => a.daysLeft !== null && a.daysLeft <= 90)
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  if (upcoming.length > 0) {
    y = drawGnReportSectionHeading(doc, "Upcoming renewals", y, "Next 90 days, soonest first");

    autoTable(doc, {
      startY: y,
      head: [["Account", "Location", "Provider", "Days left", "Rate (c/kWh)"]],
      body: upcoming.slice(0, 30).map((a) => [
        a.name,
        a.location || "-",
        a.provider || "-",
        a.daysLeft < 0 ? `${Math.abs(a.daysLeft)}d overdue` : `${a.daysLeft}d`,
        fmtReportRate(a.rate),
      ]),
      ...gnReportTableStyles(),
      willDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const raw = data.cell.raw;
          if (typeof raw === "string" && raw.includes("overdue")) {
            doc.setTextColor(...red);
          }
        }
      },
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ---- Actionable account review queue ----
  if (attentionGroups.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 28;
    }
    y = drawGnReportSectionHeading(doc, "Accounts to review", y, "Each row shows why the account was flagged and a practical next step");

    const reviewRows = attentionGroups.flatMap((group) => group.items.map((item) => {
      const account = item.account || {};
      const priority = item.severity <= 1 ? "Urgent" : "Check";
      const nextStep = item.id.endsWith("-contract")
        ? "Confirm the current supplier terms and update the contract end date."
        : item.id.endsWith("-lowconf")
          ? "Compare the recorded fields with the original bill and correct any mismatch."
          : item.id.endsWith("-ratejump")
            ? "Check the new unit rate on the bill; contact the supplier if the change is unexplained."
            : "Open this account and confirm the recorded details.";
      const meterPoint = account.account_number ? `${account.fuel_type === "gas" ? "GPRN" : "MPRN"} ${account.account_number}` : "Meter point not recorded";
      return [priority, `${account.name || "Account"}\n${account.location || "Location not set"} · ${meterPoint}`, `${item.groupLabel}\nNext: ${nextStep}`, item.detail || "-"];
    }));

    autoTable(doc, {
      startY: y,
      head: [["Priority", "Account and meter point", "What to do", "Recorded detail"]],
      body: reviewRows,
      ...gnReportTableStyles(),
      columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 48 }, 2: { cellWidth: 72 } },
      didParseCell: (data) => { if (data.section === "body" && data.column.index === 0) data.cell.styles.textColor = data.cell.raw === "Urgent" ? red : amber; },
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ---- By location ----
  const byLocation = {};
  enrichedAccounts.forEach((a) => {
    if (!a.location) return;
    if (!byLocation[a.location]) byLocation[a.location] = { total: 0, attention: 0, spend: 0 };
    byLocation[a.location].total++;
    const c = a.status;
    const isAttention = attentionGroups.some((g) => g.items.some((i) => i.account?.id === a.id));
    if (isAttention) byLocation[a.location].attention++;
    if (a.cost) byLocation[a.location].spend += a.cost;
  });
  const locationRows = Object.entries(byLocation).sort((a, b) => b[1].attention - a[1].attention);

  if (locationRows.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 28;
    }
    y = drawGnReportSectionHeading(doc, "Portfolio by location", y, "Account count, open issues and annual spend");

    autoTable(doc, {
      startY: y,
      head: [["Location", "Accounts", "Need attention", "Projected annual cost"]],
      body: locationRows.map(([loc, d]) => [loc, String(d.total), d.attention > 0 ? String(d.attention) : "-", d.spend > 0 ? fmtMoney(d.spend) : "Needs more data"]),
      ...gnReportTableStyles(),
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
  }

  drawGnReportFooters(doc, "Portfolio overview");

  doc.save(`gnorate-portfolio-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function generateSavingsReport(enrichedAccounts, summaryStats, companyName) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const { green, ink: dark, muted, amber, pale: lightBg } = GNORATE_REPORT;
  const teal = green;

  drawGnReportHeader(doc, "Savings & renewal opportunities", companyName);

  let y = drawGnReportSectionHeading(doc, "Renewal performance", 52);

  // ---- KPI cards ----
  const renewedCount = enrichedAccounts.filter((a) => a.renewal_status === "renewed").length;
  const inProgressCount = enrichedAccounts.filter((a) => a.renewal_status === "quote_requested" || a.renewal_status === "switching").length;
  const sourcedRateDifference = enrichedAccounts.reduce((sum, a) => {
    if (a.comparison && (a.comparison.source === "verified" || a.comparison.source === "quoted") && a.saving && a.saving > 0) {
      return sum + a.saving;
    }
    return sum;
  }, 0);

  const cardW = (pageWidth - 28 - 3 * 6) / 4;
  const cardH = 31;
  const cards = [
    { label: "Quoted/verified rate estimate", value: sourcedRateDifference > 0 ? fmtMoney(sourcedRateDifference) : "-", accent: green },
    { label: "All unit-rate estimates", value: summaryStats.hasAnyComparison ? fmtMoney(summaryStats.potentialSavings) : "-", accent: teal },
    { label: "Renewals in progress", value: String(inProgressCount), accent: amber },
    { label: "Accounts renewed", value: String(renewedCount), accent: green },
  ];
  cards.forEach((card, i) => {
    const x = 14 + i * (cardW + 6);
    doc.setFillColor(...lightBg);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
    doc.setDrawColor(...GNORATE_REPORT.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "S");
    doc.setFillColor(...card.accent);
    doc.rect(x, y, 1.2, cardH, "F");
    doc.setFontSize(7);
    doc.setFont(undefined, "normal");
    doc.setTextColor(...muted);
    doc.text(card.label, x + 6, y + 10, { maxWidth: cardW - 10 });
    doc.setTextColor(...dark);
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(card.value, x + 6, y + 23, { maxWidth: cardW - 10 });
  });
  y += cardH + 8;

  y = drawGnReportInsight(doc, {
    y,
    pageWidth,
    eyebrow: "What this estimate means",
    title: sourcedRateDifference > 0 ? "A quote or verified rate supports this comparison" : "Add a supplier quote to strengthen this comparison",
    detail: "This is still an indicative unit-rate difference multiplied by recorded annual usage, not confirmed bill savings. It excludes standing and capacity charges, levies, VAT and contract fees; compare full annual quotes before deciding.",
    value: summaryStats.hasAnyComparison ? fmtMoney(summaryStats.potentialSavings) : "-",
  }) + 12;

  // ---- Top savings opportunities ----
  const opportunities = enrichedAccounts
    .filter((a) => a.saving && a.saving > 20 && a.comparison)
    .sort((a, b) => b.saving - a.saving)
    .slice(0, 15);

  if (opportunities.length > 0) {
    y = drawGnReportSectionHeading(doc, "Highest-value opportunities", y, "Unit-rate difference × annual usage; excludes other bill charges");
    const topOpportunities = opportunities.slice(0, 5);
    const maxSaving = Math.max(...topOpportunities.map((a) => a.saving), 1);
    const panelY = y - 3;
    const panelH = topOpportunities.length * 10 + 5;
    doc.setFillColor(...lightBg);
    doc.roundedRect(14, panelY, pageWidth - 28, panelH, 2.5, 2.5, "F");
    topOpportunities.forEach((account, index) => {
      const rowY = y + index * 10;
      const name = account.name || "Account";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(...dark);
      doc.text(name.length > 23 ? `${name.slice(0, 20)}...` : name, 19, rowY + 5.8, { maxWidth: 44 });
      doc.setFillColor(222, 235, 230);
      doc.roundedRect(67, rowY + 2.5, 91, 3.3, 1.3, 1.3, "F");
      doc.setFillColor(...green);
      doc.roundedRect(67, rowY + 2.5, Math.max(2, (account.saving / maxSaving) * 91), 3.3, 1.3, 1.3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...green);
      doc.text(fmtMoney(account.saving), pageWidth - 19, rowY + 5.8, { align: "right" });
    });
    y += panelH + 8;

    y = drawGnReportSectionHeading(doc, "Opportunity detail", y, "Current rate, comparison rate and estimate source");

    autoTable(doc, {
      startY: y,
      head: [["Account", "Annual usage", "Current rate", "Comparison rate", "Unit-rate est./yr", "Rate source"]],
      body: opportunities.map((a) => [
        a.name,
        a.usage != null ? `${Number(a.usage).toLocaleString("en-IE")} kWh` : "-",
        fmtReportRate(a.rate),
        fmtReportRate(a.comparison.rate),
        fmtMoney(a.saving),
        a.comparison.source === "verified" ? "Verified rate" : a.comparison.source === "quoted" ? "Quoted rate" : "Estimated rate",
      ]),
      ...gnReportTableStyles(),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ---- Renewals in progress ----
  const inProgress = enrichedAccounts.filter((a) => a.renewal_status === "quote_requested" || a.renewal_status === "switching");
  if (inProgress.length > 0) {
    if (y > 238) {
      doc.addPage();
      y = 28;
    }
    y = drawGnReportSectionHeading(doc, "Renewals in progress", y, "Quotes requested or supplier changes underway");

    autoTable(doc, {
      startY: y,
      head: [["Account", "Location", "Status"]],
      body: inProgress.map((a) => [a.name, a.location || "-", a.renewal_status === "quote_requested" ? "Quote requested" : "Switching"]),
      ...gnReportTableStyles(),
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ---- Recently renewed ----
  const renewed = enrichedAccounts.filter((a) => a.renewal_status === "renewed");
  if (renewed.length > 0) {
    if (y > 238) {
      doc.addPage();
      y = 28;
    }
    y = drawGnReportSectionHeading(doc, "Recently renewed", y, "Accounts with a renewal marked complete");

    autoTable(doc, {
      startY: y,
      head: [["Account", "Provider", "Rate", "New contract end"]],
      body: renewed.map((a) => [a.name, a.provider || "-", fmtReportRate(a.rate), a.contract_end || "-"]),
      ...gnReportTableStyles(),
      headStyles: { fillColor: GNORATE_REPORT.deep, textColor: GNORATE_REPORT.white, fontStyle: "bold", cellPadding: 2.2 },
      bodyStyles: { textColor: GNORATE_REPORT.ink, cellPadding: 2.2, fontSize: 7.5 },
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
  }

  drawGnReportFooters(doc, "Savings and renewal opportunities");

  doc.save(`gnorate-savings-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function generateUsageCostReport(enrichedAccounts, readingSummaries, companyName, rangeMonths = 12) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const { green, ink: dark, muted, pale: lightBg } = GNORATE_REPORT;
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - rangeMonths + 1, 1);
  const months = Array.from({ length: rangeMonths }, (_, index) => {
    const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString("en-IE", { month: "short", year: "2-digit" }), billCount: 0, usage: 0, usageCount: 0, actualCost: 0, actualCostCount: 0, estimatedCost: 0, estimatedCostCount: 0 };
  });
  const monthMap = Object.fromEntries(months.map((month) => [month.key, month]));
  const byAccount = {};
  let billCount = 0;

  enrichedAccounts.forEach((account) => {
    const record = { usage: 0, usageCount: 0, billCount: 0, actualCost: 0, actualCostCount: 0, estimatedCost: 0, estimatedCostCount: 0, latestDate: null };
    (readingSummaries?.[account.id] || []).forEach((reading) => {
      if (!reading.reading_date) return;
      const month = monthMap[reading.reading_date.slice(0, 7)];
      if (!month) return;
      month.billCount += 1;
      record.billCount += 1;
      billCount += 1;
      if (!record.latestDate || reading.reading_date > record.latestDate) record.latestDate = reading.reading_date;

      const usage = Number(reading.usage);
      const hasUsage = reading.usage !== null && reading.usage !== undefined && reading.usage !== "" && Number.isFinite(usage);
      if (hasUsage) {
        month.usage += usage;
        month.usageCount += 1;
        record.usage += usage;
        record.usageCount += 1;
      }

      const totalCost = Number(reading.total_cost);
      const hasActualTotal = reading.total_cost !== null && reading.total_cost !== undefined && reading.total_cost !== "" && Number.isFinite(totalCost);
      if (hasActualTotal) {
        month.actualCost += totalCost;
        month.actualCostCount += 1;
        record.actualCost += totalCost;
        record.actualCostCount += 1;
        return;
      }

      const rate = Number(reading.rate);
      if (hasUsage && reading.rate !== null && reading.rate !== undefined && reading.rate !== "" && Number.isFinite(rate) && rate >= 0) {
        const standingCharge = Number(reading.standing_charge ?? account.standing_charge);
        const estimate = (rate / 100) * usage + (Number.isFinite(standingCharge) ? (standingCharge / 100) * 30 : 0);
        month.estimatedCost += estimate;
        month.estimatedCostCount += 1;
        record.estimatedCost += estimate;
        record.estimatedCostCount += 1;
      }
    });
    byAccount[account.id] = record;
  });

  const totalUsage = months.reduce((sum, month) => sum + month.usage, 0);
  const actualTotal = months.reduce((sum, month) => sum + month.actualCost, 0);
  const estimatedTotal = months.reduce((sum, month) => sum + month.estimatedCost, 0);
  const accountsWithRecords = Object.values(byAccount).filter((record) => record.billCount > 0).length;

  drawGnReportHeader(doc, "Usage & cost report", companyName);
  let y = drawGnReportSectionHeading(doc, `Last ${rangeMonths} months at a glance`, 52, `${months[0].label}–${months[months.length - 1].label} · dated reading records only`);
  const cardW = (pageWidth - 28 - 3 * 6) / 4;
  const cardH = 31;
  const cards = [
    { label: "Accounts with readings", value: `${accountsWithRecords} / ${enrichedAccounts.length}` },
    { label: "Dated readings", value: String(billCount) },
    { label: "Recorded usage", value: `${Math.round(totalUsage).toLocaleString("en-IE")} kWh` },
    { label: "Invoice totals recorded", value: fmtMoney(actualTotal) },
  ];
  cards.forEach((card, index) => {
    const x = 14 + index * (cardW + 6);
    doc.setFillColor(...lightBg);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
    doc.setDrawColor(...GNORATE_REPORT.border);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "S");
    doc.setFillColor(...green);
    doc.rect(x, y, 1.2, cardH, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.setTextColor(...muted);
    doc.text(card.label, x + 6, y + 10, { maxWidth: cardW - 10 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...dark);
    doc.text(card.value, x + 6, y + 23, { maxWidth: cardW - 10 });
  });
  y += cardH + 9;

  y = drawGnReportInsight(doc, {
    y,
    pageWidth,
    eyebrow: "How to read these figures",
    title: `${fmtMoney(actualTotal)} in invoice totals · ${fmtMoney(estimatedTotal)} estimated`,
    detail: "Invoice totals are copied from bills where entered. Estimates use recorded unit rate × usage plus up to 30 days of standing charge; they may exclude taxes and other charges. Blank data means no figure was recorded.",
    value: `${Math.round(totalUsage).toLocaleString("en-IE")} kWh`,
  }) + 10;

  y = drawGnReportSectionHeading(doc, "Month-by-month record", y, "Figures are grouped by reading date; a billing period may span more than one month");
  autoTable(doc, {
    startY: y,
    head: [["Month", "Reading records", "Usage (kWh)", "Invoice totals", "Cost estimates"]],
    body: months.map((month) => [
      month.label,
      String(month.billCount),
      month.usageCount ? Math.round(month.usage).toLocaleString("en-IE") : "No usage data",
      month.actualCostCount ? fmtMoney(month.actualCost) : "No invoice totals",
      month.estimatedCostCount ? fmtMoney(month.estimatedCost) : "No estimate",
    ]),
    ...gnReportTableStyles(),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { top: 25, bottom: 22, left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 12;

  if (y > 230) { doc.addPage(); y = 28; }
  y = drawGnReportSectionHeading(doc, "By account", y, `Accounts with a dated reading in the last ${rangeMonths} months, ranked by recorded and estimated costs`);
  const accountRows = enrichedAccounts
    .filter((account) => byAccount[account.id]?.billCount > 0)
    .sort((a, b) => (byAccount[b.id].actualCost + byAccount[b.id].estimatedCost) - (byAccount[a.id].actualCost + byAccount[a.id].estimatedCost))
    .map((account) => {
      const record = byAccount[account.id];
      const meterPoint = account.account_number ? `${account.fuel_type === "gas" ? "GPRN" : "MPRN"} ${account.account_number}` : "No meter point";
      return [
        `${account.name}\n${account.location || "Location not set"} · ${meterPoint}`,
        account.fuel_type === "gas" ? "Gas" : "Electricity",
        record.usageCount ? `${Math.round(record.usage).toLocaleString("en-IE")} kWh` : "-",
        record.actualCostCount ? fmtMoney(record.actualCost) : "-",
        record.estimatedCostCount ? fmtMoney(record.estimatedCost) : "-",
        `${record.billCount} · ${formatAccountDate(record.latestDate)}`,
      ];
    });

  if (accountRows.length) {
    autoTable(doc, {
      startY: y,
      head: [["Account / site", "Utility", "Usage", "Invoice totals", "Estimates", "Readings · latest"]],
      body: accountRows,
      ...gnReportTableStyles(),
      columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 22 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { top: 25, bottom: 22, left: 14, right: 14 },
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("No dated readings were recorded in this period.", 14, y + 5);
  }

  drawGnReportFooters(doc, "Usage and cost report");
  doc.save(`gnorate-usage-cost-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}


function projectedQuoteAnnualCost(account, offer) {
  const usage = Number(account?.usage);
  const rate = Number(offer?.unit_rate_cents);
  if (!Number.isFinite(usage) || !Number.isFinite(rate)) return null;
  const standing = Number(offer?.standing_charge_cents || 0) * 365 / 100;
  return (usage * rate / 100) + standing + Number(offer?.capacity_charge_annual || 0) + Number(offer?.other_annual_charges || 0);
}

function RenewalCommandCenter({ accounts, quoteOffers, onRenewalStatus, onQuoteStatus, onOpenAccount, onAddQuote }) {
  const pipeline = accounts
    .filter((a) => a.renewal_status !== "renewed" && (a.daysLeft === null || a.daysLeft <= HORIZON_DAYS || ["quote_requested","switching"].includes(a.renewal_status)))
    .sort((a,b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  const offersFor = (id) => (quoteOffers || []).filter((q) => q.account_id === id);
  const stats = {
    overdue: pipeline.filter(a => a.daysLeft !== null && a.daysLeft < 0).length,
    d30: pipeline.filter(a => a.daysLeft !== null && a.daysLeft >= 0 && a.daysLeft <= 30).length,
    d60: pipeline.filter(a => a.daysLeft > 30 && a.daysLeft <= 60).length,
    quotes: (quoteOffers || []).filter(q => q.status !== "rejected").length,
  };
  return <section style={{marginBottom:22}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:14}}>
      {[["Overdue",stats.overdue,"var(--red)"],["Due ≤30 days",stats.d30,"var(--red)"],["Due 31–60 days",stats.d60,"var(--amber)"],["Live quote options",stats.quotes,"var(--teal)"]].map(([label,value,color])=><div key={label} style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:10,padding:"13px 15px"}}><div style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</div><div style={{fontSize:24,fontWeight:800,color,marginTop:3}}>{value}</div></div>)}
    </div>
    <div style={{background:"var(--panel)",border:"1px solid var(--border-light)",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"15px 17px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h2 style={{fontSize:16,margin:0,fontFamily:"'Manrope',sans-serif"}}>Renewal command centre</h2><p style={{fontSize:12,color:"var(--muted)",margin:"4px 0 0"}}>One place to move contracts from warning → quotes → decision → renewal.</p></div><button onClick={onAddQuote} style={{background:"var(--teal)",color:"#fff",border:0,borderRadius:7,padding:"8px 12px",fontWeight:700,cursor:"pointer"}}>+ Feed in a quote</button></div>
      {pipeline.length===0 ? <div style={{padding:24,color:"var(--muted)",fontSize:13}}>No renewals currently need action.</div> : pipeline.map(a=>{
        const offers=offersFor(a.id).sort((x,y)=>(projectedQuoteAnnualCost(a,x)??Infinity)-(projectedQuoteAnnualCost(a,y)??Infinity));
        const currentCost = Number(a.cost) || (Number(a.usage)>0 && Number(a.rate)>0 ? Number(a.usage)*Number(a.rate)/100 + Number(a.standing_charge||0)*365/100 : null);
        return <div key={a.id} style={{padding:"15px 17px",borderBottom:"1px solid var(--border)"}}>
          <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1.5fr) minmax(140px,.8fr) minmax(170px,1fr)",gap:14,alignItems:"start"}}>
            <div><button onClick={()=>onOpenAccount(a)} style={{background:"none",border:0,padding:0,color:"var(--text)",fontWeight:800,fontSize:14,cursor:"pointer",textAlign:"left"}}>{a.name}</button><div style={{fontSize:11.5,color:"var(--muted)",marginTop:3}}>{a.location||"Location not set"} · {a.provider||"Supplier not set"} · {a.rate?`${a.rate}c/kWh`:"Rate missing"}</div><div style={{fontSize:12,marginTop:7,color:a.daysLeft!==null&&a.daysLeft<=30?"var(--red)":"var(--amber)",fontWeight:700}}>{a.daysLeft===null?"Contract date missing":a.daysLeft<0?`${Math.abs(a.daysLeft)} days overdue`:`${a.daysLeft} days remaining`} · {renewalNextStep(a)}</div></div>
            <div><label style={{display:"block",fontSize:10.5,color:"var(--muted)",fontWeight:700,marginBottom:5}}>RENEWAL STAGE</label><select value={a.renewal_status||"not_started"} onChange={e=>onRenewalStatus(a.id,e.target.value)} style={{width:"100%",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"7px 9px",fontSize:12}}><option value="not_started">Not started</option><option value="quote_requested">Quote requested</option><option value="switching">Switching</option><option value="renewed">Renewed</option></select></div>
            <div><div style={{fontSize:10.5,color:"var(--muted)",fontWeight:700,marginBottom:5}}>CURRENT ANNUAL BASIS</div><strong style={{fontSize:14}}>{currentCost?fmtMoney(currentCost):"Needs usage/rate data"}</strong><div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>Energy + recorded standing charge</div></div>
          </div>
          <div style={{marginTop:11,paddingTop:10,borderTop:"1px solid var(--border)"}}>
            {offers.length===0 ? <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}><span style={{fontSize:12,color:"var(--muted)"}}>No account-specific supplier quotes captured yet.</span><button onClick={onAddQuote} style={{background:"none",border:"1px solid var(--border)",color:"var(--teal)",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11.5}}>Add quote</button></div> : <div style={{display:"grid",gap:6}}>{offers.map((q,i)=>{const cost=projectedQuoteAnnualCost(a,q);const diff=currentCost&&cost?currentCost-cost:null;return <div key={q.id} style={{display:"grid",gridTemplateColumns:"1.2fr .7fr .9fr .8fr",gap:10,alignItems:"center",background:i===0?"var(--bg)":"transparent",borderRadius:7,padding:"8px 9px"}}><div><strong style={{fontSize:12.5}}>{q.supplier_name}</strong><div style={{fontSize:10.5,color:"var(--muted)"}}>{q.contract_length_months?`${q.contract_length_months} months · `:""}{q.valid_until?`valid to ${q.valid_until}`:"validity not recorded"}</div></div><div style={{fontSize:12}}><strong>{q.unit_rate_cents}c</strong>/kWh<div style={{fontSize:10.5,color:"var(--muted)"}}>{q.standing_charge_cents??"—"}c/day</div></div><div><strong style={{fontSize:12.5}}>{cost?fmtMoney(cost):"—"}</strong><div style={{fontSize:10.5,color:diff>0?"var(--green)":"var(--muted)"}}>{diff!=null?(diff>0?`${fmtMoney(diff)} below current`:`${fmtMoney(Math.abs(diff))} above current`):"Projected annual cost"}</div></div><select value={q.status||"received"} onChange={e=>onQuoteStatus(q,e.target.value)} style={{background:"var(--panel)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"6px 8px",fontSize:11.5}}><option value="received">Received</option><option value="shortlisted">Shortlist</option><option value="approved">Accept offer</option><option value="rejected">Reject</option></select></div>})}</div>}
          </div>
        </div>
      })}
    </div>
  </section>;
}

export default function AccountsBoard({ companyId, companyName, lockedLocation, companyIds, companiesById, section = "overview" }) {
  const combinedMode = Array.isArray(companyIds) && companyIds.length > 0;
  const sectionHref = (target) => combinedMode ? `/dashboard/all-companies?section=${target}` : `/dashboard?scope=company&section=${target}`;
  const supabase = createClient();
  const searchParams = useSearchParams();
  const currentSearchTerm = searchParams.get("search") || "";
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState(currentSearchTerm);
  const [filterFuel, setFilterFuel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRenewal, setFilterRenewal] = useState("all");
  const [filterLocation, setFilterLocation] = useState(lockedLocation || "all");
  const [usageRangeMonths, setUsageRangeMonths] = useState(12);
  const [usageMetric, setUsageMetric] = useState("usage");
  const [reportRangeMonths, setReportRangeMonths] = useState(12);
  const [usageLocation, setUsageLocation] = useState("all");
  const [usageAccount, setUsageAccount] = useState("all");
  const [usageFuel, setUsageFuel] = useState("all");
  const [usageSearch, setUsageSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationOverflowOpen, setLocationOverflowOpen] = useState(false);
  const [locationSearchText, setLocationSearchText] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activityItems, setActivityItems] = useState(null);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [bulkQuotePickerOpen, setBulkQuotePickerOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [spendBreakdownOpen, setSpendBreakdownOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ location: "", contract_end: "", provider: "", renewal_status: "" });
  const [bulkEditSaving, setBulkEditSaving] = useState(false);
  const [bulkQuoteSupplierSelection, setBulkQuoteSupplierSelection] = useState(new Set());
  const [uploadingFor, setUploadingFor] = useState(null);
  const [addingReadingFor, setAddingReadingFor] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedTab, setExpandedTab] = useState("details");
  const [notesByAccount, setNotesByAccount] = useState({});
  const [newNoteText, setNewNoteText] = useState({});
  const [menuForId, setMenuForId] = useState(null);
  const [readingsByAccount, setReadingsByAccount] = useState({});
  const [benchmarks, setBenchmarks] = useState([]);
  const [masterRates, setMasterRates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [quotePickerFor, setQuotePickerFor] = useState(null);
  const [quoteSupplierSelection, setQuoteSupplierSelection] = useState({});
  const [quickRenewFor, setQuickRenewFor] = useState(null);
  const [quickRenewForm, setQuickRenewForm] = useState({ rate: "", provider: "", contract_end: "", share_rate_with_wattpryce: false });
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [ratePullFor, setRatePullFor] = useState(null);
  const [ratePullLoading, setRatePullLoading] = useState(false);
  const [ratePullResult, setRatePullResult] = useState(null);
  const [ratePullError, setRatePullError] = useState(null);
  const [showAccountNumbers, setShowAccountNumbers] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [rateReviewFor, setRateReviewFor] = useState(null);
  const [rateCorrection, setRateCorrection] = useState("");
  const [rateReviewSaving, setRateReviewSaving] = useState(false);
  const [quoteOffers, setQuoteOffers] = useState([]);
  const [marketSignal, setMarketSignal] = useState(null);
  const [quoteOffersAvailable, setQuoteOffersAvailable] = useState(true);

  useEffect(() => {
    setSearch(currentSearchTerm);
  }, [currentSearchTerm]);

  const pullMarketRate = async (account) => {
    setRatePullFor(account.id);
    setRatePullLoading(true);
    setRatePullResult(null);
    setRatePullError(null);
    try {
      const res = await fetch("/api/suggest-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuelType: account.fuel_type || "electricity",
          usageBand: account.usage,
          micKva: account.mic_kva,
          gasTariff: gasTariffFor(account),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      if (data.suggestion.typical_rate === null) {
        setRatePullError(data.suggestion.source_note || "Couldn't find a current rate for this account.");
      } else {
        setRatePullResult(data.suggestion);
      }
    } catch (e) {
      setRatePullError(e.message);
    } finally {
      setRatePullLoading(false);
    }
  };

  const acceptPulledRate = async (accountId) => {
    const { error } = await supabase
      .from("accounts")
      .update({
        market_rate: ratePullResult.typical_rate,
        mic_charge: ratePullResult.typical_mic_charge || null,
      })
      .eq("id", accountId);
    if (error) {
      alert("Couldn't save: " + error.message);
      return;
    }
    setRatePullFor(null);
    setRatePullResult(null);
    loadAccounts();
  };

  const [readingSummaries, setReadingSummaries] = useState({});
  const [readingSummaryError, setReadingSummaryError] = useState(null);
  const [rateReviewMigrationPending, setRateReviewMigrationPending] = useState(false);

  const loadReadingSummaries = useCallback(async () => {
    const applyCompanyScope = (query) =>
      combinedMode ? query.in("company_id", companyIds) : query.eq("company_id", companyId);

    // Prefer the enhanced Pass-3 schema, but do not make historical bill visibility
    // depend on the rate-review migration having been applied to Supabase yet.
    let result = await applyCompanyScope(
      supabase
        .from("readings")
        .select("id, account_id, reading_date, billing_period_start, billing_period_end, rate, usage, standing_charge, total_cost, source, confidence, rate_review_status, rate_reviewed_at, created_at")
        .order("reading_date", { ascending: false, nullsFirst: false })
    );

    if (result.error) {
      console.warn("Enhanced readings query failed; retrying with legacy schema:", result.error.message);
      setRateReviewMigrationPending(true);
      result = await applyCompanyScope(
        supabase
          .from("readings")
          .select("id, account_id, reading_date, rate, usage, standing_charge, total_cost, source, confidence, created_at")
          .order("reading_date", { ascending: false, nullsFirst: false })
      );
    } else {
      setRateReviewMigrationPending(false);
    }

    if (result.error) {
      console.error("Could not load saved bill readings:", result.error.message);
      setReadingSummaryError(result.error.message || "Saved bill records could not be loaded.");
      return; // Keep the last known summaries; never convert a query failure into 'no bill saved'.
    }

    const grouped = {};
    (result.data || []).forEach((r) => {
      if (!grouped[r.account_id]) grouped[r.account_id] = [];
      grouped[r.account_id].push(r);
    });
    setReadingSummaryError(null);
    setReadingSummaries(grouped);
  }, [companyId, combinedMode, companyIds]);

  useEffect(() => {
    loadReadingSummaries();
  }, [loadReadingSummaries]);

  const loadBenchmarks = useCallback(async () => {
    let query = supabase.from("benchmarks").select("*");
    query = combinedMode ? query.in("company_id", companyIds) : query.eq("company_id", companyId);
    const { data } = await query;
    setBenchmarks(data || []);
  }, [companyId, combinedMode, companyIds]);

  const loadMasterRates = useCallback(async () => {
    const { data } = await supabase.from("master_rates").select("*, suppliers(name)");
    setMasterRates(data || []);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data || []);
  }, []);

  const loadMarketSignal = useCallback(async () => {
    const { data } = await supabase
      .from("market_snapshots")
      .select("pressure_score, pressure_label, snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    setMarketSignal(data || null);
  }, []);

  const loadQuoteOffers = useCallback(async () => {
    let query = supabase.from("quote_offers").select("*").order("created_at", { ascending: false });
    query = combinedMode ? query.in("company_id", companyIds) : query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) {
      console.warn("Quote offers unavailable; run the current schema migration to enable full quote comparison:", error.message);
      setQuoteOffersAvailable(false);
      setQuoteOffers([]);
      return;
    }
    setQuoteOffersAvailable(true);
    setQuoteOffers(data || []);
  }, [companyId, combinedMode, companyIds]);

  useEffect(() => { loadQuoteOffers(); }, [loadQuoteOffers]);
  useEffect(() => { loadMarketSignal(); }, [loadMarketSignal]);

  const updateQuoteStatus = async (offer, status) => {
    if (status === "approved" && !window.confirm(`Accept ${offer.supplier_name}'s offer and move this account to Switching?\n\nThis records the commercial decision in GnóRate. It does not replace any supplier contract/authority document unless the supplier's terms are attached and executed.`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    const enhancedUpdate = status === "approved" ? { status, accepted_at: new Date().toISOString(), accepted_by: user?.id || null, authority_confirmed: true } : { status };
    let result = await supabase.from("quote_offers").update(enhancedUpdate).eq("id", offer.id);
    if (result.error && status === "approved") result = await supabase.from("quote_offers").update({ status }).eq("id", offer.id);
    if (result.error) { alert("Couldn't update quote: " + result.error.message); return; }
    const account = accounts.find(a => a.id === offer.account_id);
    if (status === "approved" && account) await supabase.from("accounts").update({ renewal_status: "switching" }).eq("id", account.id);
    if (account) await supabase.from("activity_log").insert({ company_id: account.company_id || companyId, account_id: account.id, actor_id: user?.id || null, event_type: `quote_${status}`, detail: `${offer.supplier_name} quote marked ${status}.` });
    await Promise.all([loadQuoteOffers(), loadAccounts(), loadActivity?.()]);
  };

  const loadActivity = useCallback(async () => {
    const scoped = (q) => (combinedMode ? q.in("company_id", companyIds) : q.eq("company_id", companyId));
    const [notesRes, readingsRes, accountsRes] = await Promise.all([
      scoped(
        supabase
          .from("account_notes")
          .select("id, body, created_at, accounts(name), profiles(email)")
          .order("created_at", { ascending: false })
          .limit(8)
      ),
      scoped(
        supabase
          .from("readings")
          .select("id, created_at, source, accounts(name)")
          .order("created_at", { ascending: false })
          .limit(8)
      ),
      scoped(
        supabase
          .from("accounts")
          .select("id, name, created_at")
          .order("created_at", { ascending: false })
          .limit(8)
      ),
    ]);

    const items = [];
    (notesRes.data || []).forEach((n) =>
      items.push({
        id: `note-${n.id}`,
        timestamp: n.created_at,
        text: `${n.profiles?.email || "Someone"} added a note on ${n.accounts?.name || "an account"}`,
      })
    );
    (readingsRes.data || []).forEach((r) =>
      items.push({
        id: `reading-${r.id}`,
        timestamp: r.created_at,
        text: `Bill ${r.source === "upload" ? "uploaded" : "added"} for ${r.accounts?.name || "an account"}`,
      })
    );
    (accountsRes.data || []).forEach((a) =>
      items.push({
        id: `account-${a.id}`,
        timestamp: a.created_at,
        text: `Account created: ${a.name}`,
      })
    );

    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    setActivityItems(items.slice(0, 10));
  }, [companyId, combinedMode, companyIds]);

  useEffect(() => {
    loadBenchmarks();
    loadMasterRates();
    loadSuppliers();
    loadActivity();
  }, [loadBenchmarks, loadMasterRates, loadSuppliers, loadActivity]);

  const toggleReadings = async (accountId) => {
    if (expandedId === accountId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(accountId);
    setExpandedTab("details");
    if (!readingsByAccount[accountId]) {
      const { data } = await supabase
        .from("readings")
        .select("*")
        .eq("account_id", accountId)
        .order("reading_date", { ascending: false });
      setReadingsByAccount((prev) => ({ ...prev, [accountId]: data || [] }));
    }
  };

  const openQuickRenew = (account) => {
    setQuickRenewFor(account.id);
    setQuickRenewForm({ rate: account.rate || "", provider: account.provider || "", contract_end: "", share_rate_with_wattpryce: false });
  };

  useEffect(() => {
    const renewId = searchParams.get("renew");
    if (renewId && accounts.length > 0) {
      const match = accounts.find((a) => a.id === renewId);
      if (match) openQuickRenew(match);
    }
    const uploadId = searchParams.get("upload");
    if (uploadId && accounts.length > 0) {
      const match = accounts.find((a) => a.id === uploadId);
      if (match) setUploadingFor(match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, searchParams]);

  const sendSupplierEmail = async ({ to, bcc, subject, body, accountIds, supplierName, logNote }) => {
    setSendingEmail(true);
    try {
      const resolvedCompanyId = accounts.find((a) => accountIds?.includes(a.id))?.company_id || companyId;
      const res = await fetch("/api/send-supplier-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, bcc, subject, body, companyId: resolvedCompanyId, accountIds, supplierName, logNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Couldn't send: " + (data.error || "Unknown error"));
        return false;
      }
      loadActivity();
      return true;
    } catch (e) {
      alert("Couldn't send: " + e.message);
      return false;
    } finally {
      setSendingEmail(false);
    }
  };

  const saveBulkEdit = async () => {
    const payload = {};
    if (bulkEditForm.location.trim()) payload.location = bulkEditForm.location.trim();
    if (bulkEditForm.contract_end) payload.contract_end = bulkEditForm.contract_end;
    if (bulkEditForm.provider.trim()) payload.provider = bulkEditForm.provider.trim();
    if (bulkEditForm.renewal_status) payload.renewal_status = bulkEditForm.renewal_status;

    if (Object.keys(payload).length === 0) {
      alert("Fill in at least one field to apply.");
      return;
    }

    setBulkEditSaving(true);
    const { error } = await supabase.from("accounts").update(payload).in("id", [...selectedIds]);
    setBulkEditSaving(false);

    if (error) {
      alert("Couldn't save: " + error.message);
      return;
    }

    setBulkEditOpen(false);
    setSelectedIds(new Set());
    loadAccounts();
  };

  const saveQuickRenew = async (accountId) => {
    if (!quickRenewForm.contract_end) {
      alert("New contract end date is required.");
      return;
    }
    const { error } = await supabase
      .from("accounts")
      .update({
        rate: quickRenewForm.rate || null,
        provider: quickRenewForm.provider || null,
        contract_end: quickRenewForm.contract_end,
        renewal_status: "not_started",
      })
      .eq("id", accountId);
    if (error) {
      alert("Couldn't save: " + error.message);
      return;
    }

    if (quickRenewForm.share_rate_with_wattpryce && quickRenewForm.rate) {
      const acc = accounts.find((a) => a.id === accountId);
      if (acc) {
        const fuel = acc.fuel_type || "electricity";
        const tier = fuel === "gas" ? gasTariffFor(acc) : acc.dg_group || null;
        if (tier) {
          const matchedSupplier = quickRenewForm.provider
            ? suppliers.find((s) => s.name.toLowerCase() === quickRenewForm.provider.toLowerCase())
            : null;
          await supabase.from("rate_scan_queue").insert({
            fuel_type: fuel,
            tariff_tier: tier,
            rate: quickRenewForm.rate,
            supplier_id: matchedSupplier?.id || null,
            source_note: matchedSupplier
              ? "Submitted by a customer after renewing — their actual new contracted rate, not just a quote."
              : `Submitted by a customer after renewing with ${quickRenewForm.provider || "an unlisted supplier"} — add this supplier if you want it linked properly.`,
            status: "pending",
          });
        } else {
          alert(
            fuel === "gas"
              ? "Saved the renewal, but couldn't share the rate — this account needs its usage and SPC set first so it can be classified (SBU/MBU/FVT)."
              : "Saved the renewal, but couldn't share the rate — this account needs a DG Group set first (edit the account and add it from the bill)."
          );
        }
      }
    }

    setQuickRenewFor(null);
    loadAccounts();
  };

  const loadNotes = async (accountId) => {
    const { data, error } = await supabase
      .from("account_notes")
      .select("*, profiles(email)")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (!error) {
      setNotesByAccount((prev) => ({ ...prev, [accountId]: data || [] }));
    }
  };

  const addNote = async (accountId) => {
    const text = (newNoteText[accountId] || "").trim();
    if (!text) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const account = accounts.find((a) => a.id === accountId);
    const { error } = await supabase.from("account_notes").insert({
      account_id: accountId,
      company_id: account?.company_id || companyId,
      body: text,
      created_by: user.id,
    });
    if (error) {
      alert("Couldn't save note: " + error.message);
      return;
    }
    setNewNoteText((prev) => ({ ...prev, [accountId]: "" }));
    loadNotes(accountId);
  };

  const deleteNote = async (noteId, accountId) => {
    const { error } = await supabase.from("account_notes").delete().eq("id", noteId);
    if (error) {
      alert("Couldn't delete: " + error.message);
      return;
    }
    loadNotes(accountId);
  };

  const refetchReadings = async (accountId) => {
    const { data } = await supabase
      .from("readings")
      .select("*")
      .eq("account_id", accountId)
      .order("reading_date", { ascending: false });
    setReadingsByAccount((prev) => ({ ...prev, [accountId]: data || [] }));
  };

  const deleteReading = async (readingId, accountId) => {
    const confirmed = window.confirm("Delete this reading? This can't be undone.");
    if (!confirmed) return;
    const { error } = await supabase.from("readings").delete().eq("id", readingId);
    if (error) {
      alert("Couldn't delete: " + error.message);
      return;
    }
    refetchReadings(accountId);
    loadReadingSummaries();
  };

  const saveManualReading = async (accountId, form) => {
    const account = accounts.find((a) => a.id === accountId);
    const { error } = await supabase.from("readings").insert({
      account_id: accountId,
      company_id: account?.company_id || companyId,
      reading_date: form.reading_date || null,
      usage: form.usage || null,
      rate: form.rate || null,
      standing_charge: form.standing_charge || null,
      total_cost: form.total_cost === "" || form.total_cost == null ? null : Number(form.total_cost),
      source: "manual",
    });
    if (error) {
      const isDuplicate = error.code === "23505" || (error.message || "").includes("readings_account_date_unique");
      if (isDuplicate) {
        alert("A reading for this account on this date has already been saved.");
      } else {
        alert("Couldn't save: " + error.message);
      }
      return;
    }
    setAddingReadingFor(null);
    refetchReadings(accountId);
    loadReadingSummaries();
  };


  const reviewDetectedRate = async (account, decision) => {
    const change = account?.rateChange;
    if (!change?.readingId) return;
    const corrected = parseFloat(rateCorrection);
    if (decision === "corrected" && (!Number.isFinite(corrected) || corrected <= 0)) {
      alert("Enter the correct unit rate before saving.");
      return;
    }
    setRateReviewSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const trustedRate = decision === "corrected" ? corrected : Number(change.to);
    const reviewedAt = new Date().toISOString();
    const readingUpdate = {
      rate_review_status: decision,
      rate_reviewed_at: reviewedAt,
      rate_reviewed_by: user?.id || null,
      ...(decision === "corrected" ? { rate: trustedRate, confidence: "high" } : {}),
    };
    const { error: readingError } = await supabase.from("readings").update(readingUpdate).eq("id", change.readingId);
    if (readingError) { alert("Couldn't review the rate: " + readingError.message); setRateReviewSaving(false); return; }
    if (decision !== "dismissed") {
      const { error: accountError } = await supabase.from("accounts").update({ rate: trustedRate, updated_at: reviewedAt }).eq("id", account.id);
      if (accountError) { alert("The bill was reviewed, but the account rate couldn't be updated: " + accountError.message); }
    }
    await supabase.from("activity_log").insert({
      company_id: account.company_id || companyId, account_id: account.id, actor_id: user?.id || null,
      event_type: `rate_${decision}`,
      detail: decision === "dismissed" ? `Reviewed ${change.from}c → ${change.to}c/kWh rate alert and dismissed it without changing the account rate.` : decision === "corrected" ? `Corrected detected bill rate from ${change.to}c to ${trustedRate}c/kWh and updated the trusted account rate.` : `Confirmed detected bill rate increase from ${change.from}c to ${change.to}c/kWh and updated the trusted account rate.`,
    });
    setRateReviewFor(null); setRateCorrection(""); setRateReviewSaving(false);
    await Promise.all([loadAccounts(), loadReadingSummaries(), refetchReadings(account.id), loadActivity()]);
  };

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from("accounts").select("*").order("contract_end", { ascending: true, nullsFirst: false });
    query = combinedMode ? query.in("company_id", companyIds) : query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) setError(error.message);
    else {
      setAccounts(data || []);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, [companyId, combinedMode, companyIds]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const saveAccount = async (form) => {
    setError(null);
    const previous = accounts.find((a) => a.id === form.id);
    const contractEndChanged = previous && form.contract_end && previous.contract_end !== form.contract_end;
    const isLaterDate = contractEndChanged && new Date(form.contract_end) > new Date(previous.contract_end || 0);

    const payload = {
      name: form.name,
      location: form.location || null,
      provider: form.provider || null,
      account_number: form.account_number || null,
      supplier_account_number: form.supplier_account_number || null,
      fuel_type: form.fuel_type || "electricity",
      contract_end: form.contract_end || null,
      rate: form.rate || null,
      standing_charge: form.standing_charge || null,
      usage: form.usage || null,
      market_rate: form.market_rate || null,
      notes: form.notes || null,
      mic_kva: form.mic_kva || null,
      dg_group: form.dg_group || null,
      spc_kwh: form.spc_kwh || null,
      bill_delivery_method: form.bill_delivery_method || null,
      portal_login_email: form.bill_delivery_method === "portal" ? form.portal_login_email || null : null,
      updated_at: new Date().toISOString(),
      // Editing keeps the account's own existing company - never overwrite it.
      // Only a brand-new account needs a company assigned, and that's only possible
      // outside combined mode, where companyId is a single real value.
      ...(form.id ? {} : { company_id: companyId }),
      // A later contract end date means a renewal actually happened —
      // reset the workflow status so next cycle starts fresh, not stuck on "Switching"
      ...(isLaterDate ? { renewal_status: "not_started" } : {}),
    };
    let res;
    if (form.id) {
      res = await supabase.from("accounts").update(payload).eq("id", form.id);
    } else {
      res = await supabase.from("accounts").insert(payload);
    }
    if (res.error) {
      const isDuplicate = res.error.code === "23505" || (res.error.message || "").includes("accounts_company_account_number_unique");
      if (isDuplicate) {
        alert("That MPRN/GPRN is already used by another account.");
      } else {
        setError(res.error.message);
      }
      return;
    }
    if (form.share_rate_with_wattpryce && form.market_rate) {
      const fuel = form.fuel_type || "electricity";
      const tier = fuel === "gas" ? gasTariffFor(form) : form.dg_group || null;
      if (tier) {
        await supabase.from("rate_scan_queue").insert({
          fuel_type: fuel,
          tariff_tier: tier,
          rate: form.market_rate,
          source_note: "Submitted by a customer via their own account — not independently verified yet.",
          status: "pending",
        });
      } else {
        alert(
          fuel === "gas"
            ? "Saved the account, but couldn't share the rate — set this account's usage and SPC first so it can be classified (SBU/MBU/FVT)."
            : "Saved the account, but couldn't share the rate — set this account's DG Group first (found on the bill)."
        );
      }
    }

    setShowForm(false);
    setEditing(null);
    loadAccounts();
  };

  const switchToCompany = async (targetCompanyId) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ active_company_id: targetCompanyId }).eq("id", user.id);
    if (error) {
      alert("Couldn't switch company: " + error.message);
      return;
    }
    router.push(`/dashboard?scope=company&section=${encodeURIComponent(section || "accounts")}`);
  };

  const deleteAccount = async (id) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) setError(error.message);
    else loadAccounts();
  };

  const updateRenewalStatus = async (accountId, status) => {
    const { error } = await supabase.from("accounts").update({ renewal_status: status }).eq("id", accountId);
    if (error) alert("Couldn't update status: " + error.message);
    else loadAccounts();
  };

  const enrichedAll = useMemo(() => {
    return accounts.map((a) => {
      const daysLeft = daysUntil(a.contract_end);
      const status = statusOf(daysLeft);
      const latestReading = readingSummaries[a.id]?.[0];
      const currentRate = latestReading?.rate ?? a.rate;
      const comparison = marketComparisonFor({ ...a, rate: currentRate }, benchmarks, masterRates);
      const preliminaryCost = annualCostDetail({ ...a, rate: currentRate }, readingSummaries[a.id]);
      const usageNum = Number(preliminaryCost.usage);
      const rateNum = parseFloat(currentRate);
      const saving =
        comparison && Number.isFinite(usageNum) && !isNaN(rateNum)
          ? ((rateNum - comparison.rate) / 100) * usageNum
          : null;
      const confidence = accountConfidence(a, latestReading);
      const lowConfidenceBill = latestReading?.confidence === "low";

      const ratedReadings = (readingSummaries[a.id] || []).filter((r) => r.rate !== null && r.rate !== undefined);
      let rateChange = null;
      if (ratedReadings.length >= 2) {
        const [newest, prev] = ratedReadings;
        if (prev.rate) {
          const pct = ((newest.rate - prev.rate) / prev.rate) * 100;
          rateChange = { pct, from: prev.rate, to: newest.rate, fromDate: prev.reading_date, toDate: newest.reading_date, readingId: newest.id, reviewStatus: newest.rate_review_status || "unreviewed" };
        }
      }

      const costDetail = preliminaryCost;
      return { ...a, rate: currentRate, daysLeft, status, saving, cost: costDetail.projected, costDetail, comparison, confidence, lowConfidenceBill, rateChange };
    });
  }, [accounts, benchmarks, masterRates, readingSummaries]);

  const enriched = useMemo(() => {
    return enrichedAll
      .filter((a) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          (a.name || "").toLowerCase().includes(q) ||
          (a.location || "").toLowerCase().includes(q) ||
          (a.provider || "").toLowerCase().includes(q) ||
          (a.account_number || "").toLowerCase().includes(q) ||
          (a.supplier_account_number || "").toLowerCase().includes(q) ||
          (combinedMode && (companiesById?.[a.company_id] || "").toLowerCase().includes(q));
        const matchesFuel = filterFuel === "all" || (a.fuel_type || "electricity") === filterFuel;
        const matchesStatus =
          filterStatus === "all" ||
          (filterStatus === "__needs_attention__"
            ? attentionLevelFor(a) !== "none"
            : filterStatus === "__needs_review_only__"
            ? attentionLevelFor(a) === "check"
            : overallStatusFor(a).label === filterStatus);
        const matchesRenewal = filterRenewal === "all" || (a.renewal_status || "not_started") === filterRenewal;
        const matchesLocation = filterLocation === "all" || (a.location || "") === filterLocation;
        const hasRecordedUsage = (readingSummaries[a.id] || []).some((reading) => reading.usage != null && reading.reading_date);
        const matchesSection = section === "rates" ? !!a.comparison : section === "usage" ? (a.usage != null || hasRecordedUsage) : section === "renewals" ? (a.daysLeft !== null && a.daysLeft <= HORIZON_DAYS) : section === "savings" ? (a.saving != null && a.saving > 0) : true;
        return matchesSearch && matchesFuel && matchesStatus && matchesRenewal && matchesLocation && matchesSection;
      })
      .sort((a, b) => {
        const rankDiff = severityRank(a) - severityRank(b);
        if (rankDiff !== 0) return rankDiff;
        return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
      });
  }, [enrichedAll, search, filterFuel, filterStatus, filterRenewal, filterLocation, section, readingSummaries]);

  const [groupByLocation, setGroupByLocation] = useState(!lockedLocation && !currentSearchTerm);
  const [expandedLocationGroups, setExpandedLocationGroups] = useState(new Set());
  const [locationSortMode, setLocationSortMode] = useState("attention"); // alphabetical or attention

  const displayItems = useMemo(() => {
    if (!groupByLocation) {
      return enriched.map((a) => ({ type: "account", account: a }));
    }
    const groups = {};
    enriched.forEach((a) => {
      const location = a.location || "Location not set";
      // Keep similarly named sites separate when viewing several companies together.
      const groupKey = combinedMode ? `${a.company_id}::${location}` : location;
      if (!groups[groupKey]) groups[groupKey] = { groupKey, location, companyName: companiesById?.[a.company_id], accounts: [] };
      groups[groupKey].accounts.push(a);
    });
    const attentionCountFor = (accts) => accts.filter((a) => attentionLevelFor(a) !== "none").length;

    const groupList = Object.values(groups)
      .map((group) => ({
        ...group,
        accounts: [...group.accounts].sort((a, b) => severityRank(a) - severityRank(b) || a.name.localeCompare(b.name, undefined, { numeric: true })),
        attentionCount: attentionCountFor(group.accounts),
      }))
      .sort((a, b) =>
        locationSortMode === "attention"
          ? b.attentionCount - a.attentionCount || a.location.localeCompare(b.location, undefined, { numeric: true })
          : a.location.localeCompare(b.location, undefined, { numeric: true })
      );

    const items = [];
    groupList.forEach((g) => {
      items.push({ type: "location-header", groupKey: g.groupKey, location: g.location, companyName: g.companyName, accounts: g.accounts });
      if (expandedLocationGroups.has(g.groupKey)) {
        g.accounts.forEach((a) => items.push({ type: "account", account: a }));
      }
    });
    return items;
  }, [enriched, groupByLocation, expandedLocationGroups, locationSortMode, combinedMode, companiesById]);

  const summaryStats = useMemo(() => {
    const urgentCount = enrichedAll.filter((a) => attentionLevelFor(a) === "urgent").length;
    const reviewCount = enrichedAll.filter((a) => attentionLevelFor(a) === "check").length;
    const needAttention = urgentCount + reviewCount;
    const criticalCount = urgentCount;

    const renewingSoon90 = enrichedAll.filter((a) => a.daysLeft !== null && a.daysLeft >= 0 && a.daysLeft <= 90).length;

    const potentialSavings = enrichedAll.reduce((sum, a) => (a.saving && a.saving > 20 ? sum + a.saving : sum), 0);
    const totalSpend = enrichedAll.reduce((sum, a) => (a.cost ? sum + a.cost : sum), 0);
    const hasAnyComparison = enrichedAll.some((a) => a.comparison);
    const hasAnyCost = enrichedAll.some((a) => a.cost !== null && a.cost !== undefined);

    let realBillCount = 0;
    let partialBillCount = 0;
    let noCostCount = 0;
    enrichedAll.forEach((a) => {
      const rated = (readingSummaries[a.id] || []).filter((r) => r.usage != null && r.rate != null && r.reading_date);
      if (a.cost !== null && a.cost !== undefined) realBillCount++;
      else if (rated.length > 0) partialBillCount++;
      else noCostCount++;
    });

    return {
      total: enrichedAll.length,
      needAttention,
      criticalCount,
      reviewCount,
      renewingSoon90,
      potentialSavings,
      totalSpend,
      hasAnyComparison,
      hasAnyCost,
      realBillCount,
      partialBillCount,
      noCostCount,
    };
  }, [enrichedAll, readingSummaries]);

  const portfolioReadiness = useMemo(() => {
    if (!enrichedAll.length) return { score: 0, missing: [] };
    const checks = [
      ["supplier", (a) => Boolean(a.provider)], ["contract end date", (a) => Boolean(a.contract_end)],
      ["current unit rate", (a) => Number(a.rate) > 0], ["annual usage", (a) => Number(a.costDetail?.usage) > 0],
      ["standing charge", (a) => Number(a.standing_charge) > 0], ["location", (a) => Boolean(a.location)],
      ["meter point", (a) => Boolean(a.account_number)], ["recent bill", (a) => !a.confidence?.missingBill],
    ];
    let complete = 0;
    const missing = checks.map(([label, test]) => { const count = enrichedAll.filter((a) => !test(a)).length; complete += enrichedAll.length - count; return { label, count }; }).filter((item) => item.count > 0).sort((a,b) => b.count-a.count);
    return { score: Math.round((complete / (enrichedAll.length * checks.length)) * 100), missing };
  }, [enrichedAll]);

  const attentionItems = useMemo(() => {
    const items = [];
    enrichedAll.forEach((a) => {
      const status = a.renewal_status || "not_started";
      const beingHandled = status === "quote_requested" || status === "switching";
      const statusSuffix = beingHandled ? ` — ${renewalMeta(status).label}` : "";

      if ((a.status === "overdue" || a.status === "urgent") && status !== "renewed") {
        items.push({
          id: `${a.id}-contract`,
          account: a,
          severity: a.status === "overdue" ? 0 : 1,
          color: "var(--red)",
          groupLabel: a.status === "overdue" ? "Contract end date passed — confirm current supplier terms" : "Contract ends within 30 days",
          detail: `${a.status === "overdue" ? `${Math.abs(a.daysLeft)} day${Math.abs(a.daysLeft) === 1 ? "" : "s"} past the recorded end date` : `${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} until the recorded end date`}${statusSuffix}`,
        });
      } else if (a.daysLeft !== null && a.daysLeft > 30 && a.daysLeft <= 60 && status !== "renewed") {
        items.push({ id: `${a.id}-renewal-action`, account: a, severity: 2, color: "var(--amber)", groupLabel: "Renewal action due within 60 days", detail: `${a.daysLeft} days until contract end${statusSuffix}. Next: ${renewalNextStep(a)}.` });
      } else if (beingHandled) {
        items.push({ id: `${a.id}-renewal-progress`, account: a, severity: 2.2, color: "var(--amber)", groupLabel: "Renewal in progress — follow-up required", detail: `${renewalMeta(status).label}. Next: ${renewalNextStep(a)}.` });
      }
      const latest = readingSummaries[a.id]?.[0];
      if (latest?.confidence === "low") {
        items.push({ id: `${a.id}-lowconf`, account: a, severity: 3, color: "var(--amber)", groupLabel: "Bill reading needs a quick check", detail: "Compare the recorded details with the original bill." });
      }
      if (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD && (a.rateChange.reviewStatus || "unreviewed") === "unreviewed") {
        items.push({
          id: `${a.id}-ratejump`,
          account: a,
          severity: 1.8,
          color: "var(--amber)",
          groupLabel: "Rate increase recorded on latest bill",
          detail: `${a.rateChange.pct.toFixed(1)}% (${a.rateChange.from}c → ${a.rateChange.to}c) · confirm if expected`,
        });
      }
    });
    return items.sort((x, y) => x.severity - y.severity);
  }, [enrichedAll, readingSummaries]);

  const attentionGroups = useMemo(() => {
    const map = {};
    attentionItems.forEach((item) => {
      const key = `${item.color}::${item.groupLabel}`;
      if (!map[key]) map[key] = { color: item.color, groupLabel: item.groupLabel, severity: item.severity, items: [] };
      map[key].items.push(item);
    });
    return Object.values(map).sort((a, b) => a.severity - b.severity);
  }, [attentionItems]);

  const [expandedAttentionGroups, setExpandedAttentionGroups] = useState(new Set());

  const jumpToAccount = async (account) => {
    setGroupByLocation(false);
    setSearch(account.name);
    setExpandedId(account.id);
    if (!readingsByAccount[account.id]) {
      const { data } = await supabase
        .from("readings")
        .select("*")
        .eq("account_id", account.id)
        .order("reading_date", { ascending: false });
      setReadingsByAccount((prev) => ({ ...prev, [account.id]: data || [] }));
    }
  };

  const counts = useMemo(() => {
    const c = { overdue: 0, urgent: 0, soon: 0, ok: 0 };
    accounts.forEach((a) => {
      const s = statusOf(daysUntil(a.contract_end));
      if (c[s] !== undefined) c[s]++;
    });
    return c;
  }, [accounts]);

  const utilitySpend = useMemo(() => {
    const groups = { electricity: 0, gas: 0 };
    enrichedAll.forEach((account) => {
      const fuel = account.fuel_type === "gas" ? "gas" : "electricity";
      if (account.cost != null) groups[fuel] += account.cost;
    });
    return groups;
  }, [enrichedAll]);

  const billUsageTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (5 - index));
      return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: date.toLocaleDateString("en-IE", { month: "short" }), usage: 0 };
    });
    const monthMap = Object.fromEntries(months.map((month) => [month.key, month]));
    Object.values(readingSummaries).flat().forEach((reading) => {
      if (!reading.reading_date || reading.usage == null) return;
      const date = new Date(`${reading.reading_date}T00:00:00`);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (monthMap[key]) monthMap[key].usage += Number(reading.usage) || 0;
    });
    return months;
  }, [readingSummaries]);

  const usageLocations = useMemo(() => [...new Set(enrichedAll.map((account) => account.location).filter(Boolean))].sort(), [enrichedAll]);
  const usageFilterAccounts = useMemo(() => enrichedAll.filter((account) =>
    (usageLocation === "all" || account.location === usageLocation) &&
    (usageFuel === "all" || (account.fuel_type || "electricity") === usageFuel) &&
    (!usageSearch.trim() || [account.name, account.location, account.provider, account.account_number].some((value) => String(value || "").toLowerCase().includes(usageSearch.trim().toLowerCase())))
  ), [enrichedAll, usageLocation, usageFuel, usageSearch]);
  const usageWindow = useMemo(() => {
    const now = new Date();
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - usageRangeMonths + 1, 1);
    const points = Array.from({ length: usageRangeMonths }, (_, index) => {
      const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: date.toLocaleDateString("en-IE", { month: "short", year: usageRangeMonths > 6 ? "2-digit" : undefined }), usage: 0, cost: 0, actualCost: 0, estimatedCost: 0, billCount: 0, usageRecordCount: 0, costRecordCount: 0, actualCostCount: 0, estimatedCostCount: 0, accounts: new Set() };
    });
    const byMonth = Object.fromEntries(points.map((point) => [point.key, point]));
    const includedIds = new Set(usageFilterAccounts.filter((account) => usageAccount === "all" || account.id === usageAccount).map((account) => account.id));
    const byAccount = {};
    const accountById = Object.fromEntries(usageFilterAccounts.map((account) => [account.id, account]));
    let billCount = 0;
    let usageRecordCount = 0;
    let costRecordCount = 0;
    let actualCostCount = 0;
    let estimatedCostCount = 0;
    Object.entries(readingSummaries).forEach(([accountId, readings]) => {
      if (!includedIds.has(accountId)) return;
      readings.forEach((reading) => {
        if (!reading.reading_date) return;
        const key = reading.reading_date.slice(0, 7);
        const point = byMonth[key];
        if (!point) return;
        billCount += 1;
        point.billCount += 1;
        point.accounts.add(accountId);
        if (!byAccount[accountId]) byAccount[accountId] = { usage: 0, cost: 0, billCount: 0, usageRecordCount: 0, costRecordCount: 0, actualCostCount: 0, estimatedCostCount: 0, latestDate: null };
        byAccount[accountId].billCount += 1;
        if (!byAccount[accountId].latestDate || reading.reading_date > byAccount[accountId].latestDate) byAccount[accountId].latestDate = reading.reading_date;
        const usage = Number(reading.usage);
        const hasUsage = reading.usage !== null && reading.usage !== undefined && reading.usage !== "" && Number.isFinite(usage);
        if (hasUsage) {
          point.usage += usage;
          point.usageRecordCount += 1;
          usageRecordCount += 1;
          byAccount[accountId].usage += usage;
          byAccount[accountId].usageRecordCount += 1;
        }

        const invoiceTotal = Number(reading.total_cost);
        const hasInvoiceTotal = reading.total_cost !== null && reading.total_cost !== undefined && reading.total_cost !== "" && Number.isFinite(invoiceTotal);
        const unitRate = Number(reading.rate);
        const standingCharge = Number(reading.standing_charge ?? accountById[accountId]?.standing_charge);
        const hasRateEstimate = hasUsage && reading.rate !== null && reading.rate !== undefined && reading.rate !== "" && Number.isFinite(unitRate) && unitRate >= 0;
        const estimatedTotal = hasRateEstimate ? (unitRate / 100) * usage + (Number.isFinite(standingCharge) ? (standingCharge / 100) * 30 : 0) : null;
        const cost = hasInvoiceTotal ? invoiceTotal : estimatedTotal;
        if (cost !== null) {
          point.cost += cost;
          point.costRecordCount += 1;
          byAccount[accountId].cost += cost;
          byAccount[accountId].costRecordCount += 1;
          costRecordCount += 1;
          if (hasInvoiceTotal) {
            point.actualCost += invoiceTotal;
            point.actualCostCount += 1;
            byAccount[accountId].actualCostCount += 1;
            actualCostCount += 1;
          } else {
            point.estimatedCost += estimatedTotal;
            point.estimatedCostCount += 1;
            byAccount[accountId].estimatedCostCount += 1;
            estimatedCostCount += 1;
          }
        }
      });
    });
    const monthly = points.map((point) => ({ ...point, accounts: point.accounts.size, usage: point.usageRecordCount ? Math.round(point.usage) : null, cost: point.costRecordCount ? Math.round(point.cost * 100) / 100 : null, actualCost: point.actualCostCount ? Math.round(point.actualCost * 100) / 100 : null, estimatedCost: point.estimatedCostCount ? Math.round(point.estimatedCost * 100) / 100 : null }));
    const totalUsage = monthly.reduce((sum, point) => sum + (point.usage || 0), 0);
    const totalCost = monthly.reduce((sum, point) => sum + (point.cost || 0), 0);
    return { monthly, byAccount, billCount, usageRecordCount, totalUsage, costRecordCount, actualCostCount, estimatedCostCount, totalCost };
  }, [readingSummaries, usageFilterAccounts, usageAccount, usageRangeMonths]);

  const opportunityCount = enrichedAll.filter((account) => account.saving != null && account.saving > 20).length;
  const spendTotal = utilitySpend.electricity + utilitySpend.gas;
  const showAccountTable = ["accounts", "rates", "renewals", "savings"].includes(section) || !!lockedLocation;
  const dashboardRenewals = enrichedAll
    .filter((account) => account.daysLeft !== null && account.daysLeft <= HORIZON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);
  const dashboardActions = [...new Map(attentionItems.map((item) => [item.account.id, item])).values()].slice(0, 5);
  const firstDashboardAction = dashboardActions[0] || null;
  const openDashboardAccount = (account) => {
    setGroupByLocation(false);
    setSearch(account.name);
    setExpandedId(account.id);
    jumpToAccount(account);
    router.push(`${sectionHref("accounts")}&search=${encodeURIComponent(account.name)}`);
  };

  if (loading) {
    return <div style={{ color: "var(--muted)", padding: 40 }}>Loading accounts…</div>;
  }

  return (
    <div className="wp-dashboard-root">
      <style dangerouslySetInnerHTML={{ __html: `
        .wp-dashboard-root select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238fa6a3' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 30px !important;
          cursor: pointer;
        }
        .wp-dashboard-root input:focus,
        .wp-dashboard-root select:focus,
        .wp-dashboard-root textarea:focus {
          outline: none;
          border-color: var(--state) !important;
          box-shadow: 0 0 0 3px rgba(59, 91, 122, 0.15);
        }
        .wp-dashboard-root input,
        .wp-dashboard-root select,
        .wp-dashboard-root textarea {
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        @keyframes wpSoftIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .wp-soft-in { animation: wpSoftIn 0.22s ease both; }
        @media (max-width: 640px) {
          .wp-row-collapsed { flex-wrap: wrap !important; }
        }
      ` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: lockedLocation ? "flex" : "none", alignItems: "flex-start", gap: 12 }}>
          <span className="gn-section-mark"><Building2 size={19}/></span>
          <div>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 24, fontWeight: 700, margin: 0 }}>{({ overview: combinedMode ? "All company accounts" : "Portfolio overview", accounts: "Accounts", rates: "Rate opportunities", usage: "Usage", renewals: "Upcoming renewals", savings: "Savings opportunities", reports: "Reports", settings: "Workspace settings" }[section] || "Accounts")}</h1>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
              {combinedMode ? "Every account across every company you belong to." : section === "rates" ? "Accounts with a current market comparison, connected to your Irish tariff data." : section === "usage" ? "Review dated usage and cost records by month, location and account. Blank periods stay visible as gaps." : section === "renewals" ? "Contracts ending within the next 120 days, ordered by urgency." : section === "savings" ? "Accounts where current market comparisons indicate a potential saving." : "Your utility portfolio, connected to your existing account and bill data."}
            </p>
            {lastUpdated && (
              <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 3, opacity: 0.75 }}>
                Data updated {lastUpdated.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })} · {lastUpdated.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
          {!combinedMode && ["overview", "accounts", "usage"].includes(section) && (
            <button
              onClick={() => setUploadingFor("new")}
              style={{ background: "none", border: "1px solid var(--border-light)", color: "var(--text)", padding: "10px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              <Upload size={16} /> Upload a bill
            </button>
          )}
          {!combinedMode && ["overview", "accounts"].includes(section) && (
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              style={{ background: "var(--teal)", border: "none", color: "#ffffff", padding: "10px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              <Plus size={16} /> Add account
            </button>
          )}
          {combinedMode && (
            <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
              Switch to a specific company to add accounts or upload bills
            </span>
          )}
          <div style={{ position: "relative", display: ["overview", "accounts"].includes(section) ? "block" : "none" }}>
            <button
              onClick={() => setShowMoreMenu((v) => !v)}
              style={{ background: "none", border: "1px solid var(--border-light)", color: "var(--muted)", padding: "10px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <MoreHorizontal size={17} /><span style={{ fontSize: 12 }}>More actions</span>
            </button>
            {showMoreMenu && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  background: "var(--panel)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                  minWidth: 180,
                  zIndex: 30,
                  overflow: "hidden",
                }}
              >
                {[
                  { icon: BarChart3, label: "Open company overview", onClick: () => setShowOverview(true) },
                  { icon: FileText, label: "Download report (PDF)", onClick: () => generatePortfolioReport(enrichedAll, summaryStats, attentionGroups, companyName, readingSummaries) },
                  { icon: Mail, label: "Feed in a quote", onClick: () => router.push("/dashboard/add-quote") },
                  { icon: TrendingDown, label: "Download savings report (PDF)", onClick: () => generateSavingsReport(enrichedAll, summaryStats, companyName) },
                  ...(combinedMode ? [] : [{ icon: Upload, label: "Import accounts", onClick: () => setShowImport(true) }]),
                  { icon: Download, label: "Export Excel", onClick: () => exportAccountsExcel(accounts) },
                  ...(combinedMode ? [] : [{ icon: LineChartIcon, label: "Market rates", onClick: () => setShowBenchmarks(true) }]),
                  { icon: SlidersHorizontal, label: showAccountNumbers ? "Hide account numbers" : "Show account numbers", onClick: () => setShowAccountNumbers((v) => !v) },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setShowMoreMenu(false);
                      item.onClick();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: "10px 14px",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <item.icon size={15} color="var(--muted)" /> {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {section === "overview" && !lockedLocation && loading && <div className="gn-dashboard-load-state" role="status"><div><strong>Loading your company information…</strong>Account totals and activity will appear here in a moment.</div></div>}
      {section === "overview" && !lockedLocation && !loading && error && <div className="gn-dashboard-load-state" role="alert"><div><strong>We couldn’t load this dashboard.</strong>{error}</div><button type="button" onClick={loadAccounts}>Try again</button></div>}
      {section === "overview" && !lockedLocation && !loading && !error && (
        <section className="gn-overview" aria-label="Portfolio overview">
          {combinedMode && <section className="gn-company-overview" aria-label="Companies overview">
            <div className="gn-company-overview-heading"><h2>Companies overview</h2><p>See each company’s accounts and open its dashboard directly.</p></div>
            <div className="gn-company-overview-grid">{companyIds.map((id) => {
              const companyAccounts = enrichedAll.filter((account) => account.company_id === id);
              const companySpend = companyAccounts.reduce((total, account) => total + (account.cost || 0), 0);
              const needsCheck = companyAccounts.filter((account) => attentionLevelFor(account) !== "none").length;
              return <article className="gn-company-overview-card" key={id}>
                <h3>{companiesById?.[id] || "Company"}</h3>
                <div className="gn-company-overview-stats"><div><span>Accounts</span><strong>{companyAccounts.length}</strong></div><div><span>Items to check</span><strong>{needsCheck}</strong></div><div><span>Projected annual energy cost</span><strong>{companySpend > 0 ? fmtMoney(companySpend) : "Not available"}</strong></div></div>
                <button type="button" onClick={() => switchToCompany(id)}>Open this company’s dashboard →</button>
              </article>;
            })}</div>
          </section>}
          {marketSignal && (() => {
            const styleByLabel = {
              Low: { bg: "#EAF6EE", border: "#2F8A52", text: "#1E6B3D", tagline: "Market rates are currently low — a good window to consider locking in." },
              Stable: { bg: "#EAF6F3", border: "var(--teal)", text: "var(--teal-dim)", tagline: "Market rates are stable right now." },
              Elevated: { bg: "#FCF3E3", border: "#C8790A", text: "#9C5F08", tagline: "Market rates are elevated — worth reviewing upcoming renewals sooner rather than later." },
              High: { bg: "#FBEAE6", border: "#C0432A", text: "#96341F", tagline: "Market rates are high — worth reviewing renewals closely before committing." },
            };
            const s = styleByLabel[marketSignal.pressure_label] || styleByLabel.Stable;
            return (
              <Link
                href="/dashboard/market"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  borderRadius: 12,
                  padding: "16px 20px",
                  marginBottom: 18,
                  textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: s.border,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {Math.round(marketSignal.pressure_score)}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: s.text, textTransform: "uppercase" }}>
                      Market signal — {marketSignal.pressure_label}
                    </div>
                    <div style={{ fontSize: 14.5, color: s.text, marginTop: 2, fontWeight: 600 }}>{s.tagline}</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.text, whiteSpace: "nowrap" }} aria-hidden="true">
                  View detail →
                </span>
              </Link>
            );
          })()}
          <div className="gn-welcome-panel">
            <div className="gn-welcome-copy">
              <span className="gn-welcome-eyebrow"><i /> {firstDashboardAction ? "NEXT ACCOUNT ACTION" : summaryStats.total ? "PORTFOLIO STATUS" : "GET STARTED"}</span>
              <h2>{firstDashboardAction ? firstDashboardAction.groupLabel : summaryStats.total ? "No urgent account actions." : "Add your first utility account."}</h2>
              <p>{firstDashboardAction ? `${firstDashboardAction.account.name}${firstDashboardAction.account.location ? ` · ${firstDashboardAction.account.location}` : ""}. ${firstDashboardAction.detail || "Open the account to see what to check."}` : summaryStats.total ? "You can plan ahead using the upcoming renewals list below. Older bills and missing account details are shown as information, not urgent alerts." : "Add an account or bill to start seeing costs, usage and contract dates in one place."}</p>
              <div className="gn-welcome-actions">
                {firstDashboardAction ? <button className="gn-welcome-primary" type="button" onClick={() => openDashboardAccount(firstDashboardAction.account)}>Open {firstDashboardAction.account.name} <span aria-hidden="true">→</span></button> : <Link className="gn-welcome-primary" href={sectionHref("accounts")}>{summaryStats.total ? "View accounts" : "Add an account"} <span aria-hidden="true">→</span></Link>}
                <Link href={firstDashboardAction ? "/dashboard/attention" : dashboardRenewals.length ? sectionHref("renewals") : sectionHref("usage")}>{firstDashboardAction ? "See all items to check" : dashboardRenewals.length ? "See contract dates" : "View usage and bills"} <span aria-hidden="true">→</span></Link>
              </div>
            </div>
            <div className="gn-welcome-insight">
              <span>Portfolio health</span>
              <strong>{summaryStats.needAttention ? `${summaryStats.needAttention} accounts to check` : "No urgent issues"}</strong>
              <small>{summaryStats.needAttention ? "Open the list to see the reason and account" : dashboardRenewals.length ? `${dashboardRenewals.length} contract date${dashboardRenewals.length === 1 ? "" : "s"} listed below` : "We will show an alert if an account needs action"}</small>
            </div>
            <div className="gn-welcome-orb" aria-hidden="true" />
          </div>
          {summaryStats.total > 0 && portfolioReadiness.score < 100 && <section className="gn-readiness-card" aria-label="Portfolio setup readiness">
            <div className="gn-readiness-copy"><span>PORTFOLIO READINESS</span><strong>{portfolioReadiness.score}% ready for reliable renewal decisions</strong><p>Complete missing data to improve rate comparisons, reminders and reporting confidence.</p><div className="gn-readiness-missing">{portfolioReadiness.missing.slice(0,4).map((item) => <span key={item.label}><b>{item.count}</b> missing {item.label}</span>)}</div></div>
            <div className="gn-readiness-score"><strong>{portfolioReadiness.score}%</strong><span>complete</span><div><i style={{width:`${portfolioReadiness.score}%`}} /></div><Link href={sectionHref("accounts")}>Complete account data →</Link></div>
          </section>}
          <div className="gn-kpis">
            <Link href={sectionHref("accounts")} className="gn-kpi"><span>Projected annual energy cost</span><strong>{summaryStats.hasAnyCost ? fmtMoney(summaryStats.totalSpend) : "Awaiting bills"}</strong><small>{summaryStats.realBillCount} accounts with a spend estimate</small><i className="gn-kpi-line" /></Link>
            <Link href={sectionHref("savings")} className="gn-kpi gn-kpi-highlight"><span>Rate opportunity</span><strong>{summaryStats.hasAnyComparison ? fmtMoney(summaryStats.potentialSavings) : "—"}</strong><small>{summaryStats.hasAnyComparison ? "Unit-rate estimate; excludes other bill charges" : "Add rates to identify opportunities"}</small><i className="gn-kpi-line" /></Link>
            <Link href={sectionHref("accounts")} className="gn-kpi"><span>Tracked accounts</span><strong>{summaryStats.total}</strong><small>{summaryStats.renewingSoon90} renewing in the next 90 days</small><i className="gn-kpi-icon"><FileText size={20}/></i></Link>
            <Link href={sectionHref("savings")} className="gn-kpi"><span>Rate opportunities</span><strong>{opportunityCount}</strong><small>Positive savings estimates over €20/yr</small><i className="gn-kpi-icon"><TrendingDown size={20}/></i></Link>
          </div>
          {(() => {
            const opportunities = enrichedAll
              .filter((account) => account.saving != null && Number(account.saving) > 20)
              .sort((a, b) => Number(b.saving || 0) - Number(a.saving || 0))
              .slice(0, 3);
            const opportunityTotal = enrichedAll.reduce((sum, account) => sum + (Number(account.saving) > 20 ? Number(account.saving) : 0), 0);
            return (
              <section className="gn-savings-command" aria-label="Savings opportunities">
                <div className="gn-savings-command-head">
                  <div>
                    <span className="gn-savings-eyebrow"><TrendingDown size={13}/> SAVINGS OPPORTUNITIES</span>
                    <h2>{opportunities.length ? `${fmtMoney(opportunityTotal)} potential annual saving identified` : "Build your savings opportunity view"}</h2>
                    <p>{opportunities.length ? "Indicative unit-rate opportunities from the accounts currently on file. Confirm full annual quotes before switching." : "Add current and market rates to identify where your portfolio may have room to save."}</p>
                  </div>
                  <Link href={sectionHref("savings")} className="gn-savings-command-action">Open savings centre <span>→</span></Link>
                </div>
                {opportunities.length ? (
                  <div className="gn-savings-opportunity-list">
                    {opportunities.map((account, index) => (
                      <button type="button" className="gn-savings-opportunity" key={account.id} onClick={() => openDashboardAccount(account)}>
                        <span className="gn-savings-rank">{String(index + 1).padStart(2, "0")}</span>
                        <span className="gn-savings-opportunity-copy"><strong>{account.name}</strong><small>{account.location || "Location not set"} · {account.fuel_type === "gas" ? "Gas" : "Electricity"} · {account.provider || "Supplier not set"}</small></span>
                        <span className="gn-savings-opportunity-rate"><small>{account.rate != null ? `${Number(account.rate).toLocaleString("en-IE", { maximumFractionDigits: 2 })}c current` : "Current rate not set"}</small><b>{fmtMoney(account.saving)}<em>/yr indicative</em></b></span>
                        <span className="gn-savings-chevron">→</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="gn-savings-empty"><span><CircleDollarSign size={17}/></span><div><strong>No opportunities identified yet</strong><small>Once GnóRate has enough rate and usage data, the highest-value accounts will appear here.</small></div><Link href={sectionHref("rates")}>Review rates →</Link></div>
                )}
              </section>
            );
          })()}
          <div className="gn-insight-grid">
            <article className="gn-card">
              <div className="gn-card-heading"><div><h2>Spend by utility</h2><p>Based on available account estimates</p></div><span className="gn-card-menu">Annual</span></div>
              {spendTotal > 0 ? <div className="gn-donut-row"><div className="gn-donut" style={{ "--electric-share": `${Math.round((utilitySpend.electricity / spendTotal) * 100)}%` }}><b>{fmtMoney(spendTotal)}</b></div><div className="gn-legend"><span><i className="gn-dot electric"/> Electricity <b>{Math.round((utilitySpend.electricity / spendTotal) * 100)}%</b></span><span><i className="gn-dot gas"/> Gas <b>{Math.round((utilitySpend.gas / spendTotal) * 100)}%</b></span></div></div> : <div className="gn-empty-chart">Add bill readings and account usage to build your spend breakdown.</div>}
            </article>
            <article className="gn-card">
              <div className="gn-card-heading"><div><h2>Recorded usage</h2><p>Bill usage by month · bar height is relative to the highest month</p></div><Link href={sectionHref("usage")} className="gn-card-link">Filter usage →</Link></div>
              {billUsageTrend.some((month) => month.usage > 0) ? <div className="gn-bars">{billUsageTrend.map((month) => { const max = Math.max(...billUsageTrend.map((point) => point.usage), 1); return <div className="gn-bar-column" key={month.key} title={`${month.label}: ${Math.round(month.usage).toLocaleString("en-IE")} kWh`}><em>{month.usage ? Math.round(month.usage).toLocaleString("en-IE") : "-"}</em><div className="gn-bar-track"><i style={{ height: month.usage ? `${Math.max(5, (month.usage / max) * 100)}%` : "0%" }}/></div><small>{month.label}</small></div>; })}</div> : <div className="gn-empty-chart">Your monthly usage trend will appear here as bills are uploaded.</div>}
            </article>
          </div>
          <div className="gn-overview-foot"><Link className="gn-overview-status" href={summaryStats.needAttention ? "/dashboard/attention" : dashboardRenewals.length ? sectionHref("renewals") : sectionHref("accounts")}><i className="gn-status-dot"/> {summaryStats.needAttention ? `${summaryStats.needAttention} accounts need attention` : dashboardRenewals.length ? "Contract dates are coming up" : "Portfolio currently on track"} <span aria-hidden="true">→</span></Link><Link href={sectionHref("accounts")}>View all accounts <span aria-hidden="true">→</span></Link></div>
          <div className="gn-task-grid">
            <article className="gn-card gn-task-card"><div className="gn-card-heading"><div><h2>Needs attention</h2><p>Contracts ending within 30 days, rate rises of 5%+, or bill details to verify</p></div><Link href="/dashboard/attention" className="gn-card-link">View queue →</Link></div>
              {dashboardActions.length ? <div className="gn-task-list">{dashboardActions.map((item) => <button key={item.account.id} onClick={() => openDashboardAccount(item.account)}><span className="gn-task-mark" style={{ background: item.color }}/><span><b>{item.account.name}</b><small>{item.groupLabel}{item.detail ? ` · ${item.detail}` : ""}</small></span><strong>Review →</strong></button>)}</div> : <div className="gn-task-empty">No outstanding account actions.</div>}
            </article>
            <article className="gn-card gn-task-card"><div className="gn-card-heading"><div><h2>Renewal timeline</h2><p>Dates in the next 120 days; past dates stay here until the record is updated</p></div><Link href={sectionHref("renewals")} className="gn-card-link">View all →</Link></div>
              {dashboardRenewals.length ? <div className="gn-task-list">{dashboardRenewals.map((account) => <button key={account.id} onClick={() => openDashboardAccount(account)}><span className="gn-task-date">{account.daysLeft < 0 ? `${Math.abs(account.daysLeft)}d` : `${account.daysLeft}d`}</span><span><b>{account.name}</b><small>{account.provider || "Supplier not set"} · {account.daysLeft < 0 ? "contract end date passed" : `ends in ${account.daysLeft} days`}</small></span><strong>{renewalNextStep(account)}</strong></button>)}</div> : <div className="gn-task-empty">No contracts are due in the next 120 days.</div>}
            </article>
          </div>
        </section>
      )}

      {showAccountTable && section !== "accounts" && !lockedLocation && section !== "usage" && <div className="gn-section-summary"><strong>{enriched.length}</strong><span>{section === "rates" ? "accounts with a current market comparison" : section === "renewals" ? "contracts overdue or ending within the next 120 days" : `${fmtMoney(enriched.reduce((sum, account) => sum + (account.saving > 20 ? account.saving : 0), 0))} estimated savings per year across positive comparisons`}</span>{section === "rates" && <button className="gn-inline-action" onClick={() => setShowBenchmarks(true)}>Market benchmarks →</button>}</div>}

      {section === "usage" && !lockedLocation && (
        <section className="gn-card gn-usage-explorer" aria-label="Recorded account usage">
          <div className="gn-card-heading">
            <div><h2>{usageMetric === "usage" ? "Usage by month" : "Energy cost by month"}</h2><p>{usageMetric === "usage" ? "Recorded kWh from dated usage readings. Missing months stay blank." : "Invoice totals where entered; otherwise an estimate from the recorded rate, usage and standing charge."}</p></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div className="gn-usage-range" role="group" aria-label="Choose usage or cost">
                {[{ value: "usage", label: "Usage (kWh)" }, { value: "cost", label: "Cost (€)" }].map((option) => <button key={option.value} type="button" aria-pressed={usageMetric === option.value} className={usageMetric === option.value ? "active" : ""} onClick={() => setUsageMetric(option.value)}>{option.label}</button>)}
              </div>
              <div className="gn-usage-range" role="group" aria-label="Date range">
                {[6, 12, 24].map((months) => <button key={months} type="button" aria-pressed={usageRangeMonths === months} className={usageRangeMonths === months ? "active" : ""} onClick={() => setUsageRangeMonths(months)}>{months} months</button>)}
              </div>
            </div>
          </div>
          <div className="gn-usage-filters">
            <label>Location<select value={usageLocation} onChange={(e) => { setUsageLocation(e.target.value); setUsageAccount("all"); }}><option value="all">All locations</option>{usageLocations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
            <label>Utility<select value={usageFuel} onChange={(e) => { setUsageFuel(e.target.value); setUsageAccount("all"); }}><option value="all">All utilities</option><option value="electricity">Electricity</option><option value="gas">Gas</option></select></label>
            <label>Find a site or meter<input type="search" value={usageSearch} onChange={(e) => { setUsageSearch(e.target.value); setUsageAccount("all"); }} placeholder="Site name, MPRN or GPRN" /></label>
            <label>Account<select value={usageAccount} onChange={(e) => setUsageAccount(e.target.value)}><option value="all">All matching accounts</option>{usageFilterAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            {(usageLocation !== "all" || usageFuel !== "all" || usageAccount !== "all" || usageSearch || usageRangeMonths !== 12 || usageMetric !== "usage") && <button className="gn-usage-clear" type="button" onClick={() => { setUsageLocation("all"); setUsageFuel("all"); setUsageAccount("all"); setUsageSearch(""); setUsageRangeMonths(12); setUsageMetric("usage"); }}>Clear filters and date range</button>}
          </div>
          <div className="gn-usage-stats">
            <div><span>{usageMetric === "usage" ? "Recorded usage in period" : "Cost represented in period"}</span><strong>{usageMetric === "usage" ? (usageWindow.usageRecordCount ? `${usageWindow.totalUsage.toLocaleString("en-IE")} kWh` : "—") : (usageWindow.costRecordCount ? fmtMoney(usageWindow.totalCost) : "—")}</strong></div>
            <div><span>{usageMetric === "usage" ? "Records with usage" : "Records with cost"}</span><strong>{usageMetric === "usage" ? `${usageWindow.usageRecordCount} / ${usageWindow.billCount}` : `${usageWindow.costRecordCount} / ${usageWindow.billCount}`}</strong><small>{usageMetric === "cost" ? `${usageWindow.actualCostCount} invoice totals · ${usageWindow.estimatedCostCount} estimates` : "Dated records in selected range"}</small></div>
            <div><span>Accounts represented</span><strong>{Object.keys(usageWindow.byAccount).length}</strong></div>
          </div>
          {(usageMetric === "usage" ? usageWindow.usageRecordCount : usageWindow.costRecordCount) > 0 ? (
            <>
            <div className="gn-usage-chart-wrap">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={usageWindow.monthly} margin={{ top: 12, right: 14, left: 10, bottom: 4 }}>
                  <CartesianGrid stroke="#e2ebe5" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#61756a" }} axisLine={{ stroke: "#cbd9d0" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#61756a" }} tickFormatter={(value) => usageMetric === "cost" ? `€${Number(value).toLocaleString("en-IE")}` : Number(value).toLocaleString("en-IE")} width={72} domain={usageMetric === "cost" ? ["auto", "auto"] : [0, "auto"]} allowDecimals={false} label={{ value: usageMetric === "cost" ? "€" : "kWh", position: "insideTopLeft", offset: 0, fontSize: 11, fill: "#61756a" }} />
                  <Tooltip content={(props) => {
                    if (!props.active || !props.payload?.length) return null;
                    const point = props.payload[0].payload;
                    const value = usageMetric === "cost" ? (point.cost === null ? "No cost data available" : `${fmtMoney(point.cost)} combined cost`) : (point.usage === null ? "No usage figure on file" : `${point.usage.toLocaleString("en-IE")} kWh recorded`);
                    return <div style={{ padding: "9px 11px", border: "1px solid #dce6df", borderRadius: 8, background: "#fff", boxShadow: "0 5px 16px #143d2b18", fontSize: 11 }}><strong style={{ display: "block", marginBottom: 4, color: "#173b2d" }}>{point.label} · {point.key}</strong><span>{value}</span>{usageMetric === "cost" && <small style={{ display: "block", marginTop: 4, color: "#53685d" }}>Invoice totals: {point.actualCost === null ? "—" : fmtMoney(point.actualCost)}<br/>Estimates: {point.estimatedCost === null ? "—" : fmtMoney(point.estimatedCost)}</small>}<small style={{ display: "block", marginTop: 3, color: "#71847b" }}>{point.billCount} dated record{point.billCount === 1 ? "" : "s"} · {usageMetric === "cost" ? `${point.actualCostCount} invoice totals, ${point.estimatedCostCount} estimates` : `${point.usageRecordCount} with usage`}</small></div>;
                  }} />
                  {usageMetric === "cost" ? <>
                    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 10, color: "#61756a" }} />
                    <Bar dataKey="actualCost" name="Invoice totals" stackId="cost" fill="#087b59" radius={[0, 0, 0, 0]} maxBarSize={38} />
                    <Bar dataKey="estimatedCost" name="Estimated cost" stackId="cost" fill="#77cba6" radius={[5, 5, 0, 0]} maxBarSize={38} />
                  </> : <Bar dataKey="usage" name="Recorded usage" fill="#0b9569" radius={[5, 5, 0, 0]} maxBarSize={38} />}
                </BarChart>
              </ResponsiveContainer>
              <p className="gn-usage-data-note">Blank months mean no matching figure is on file, not zero {usageMetric === "cost" ? "cost" : "usage"}. Values are grouped by reading date. {usageMetric === "cost" ? "Actual invoice totals are used when available; estimates use recorded rate × usage plus up to 30 days of standing charge." : "No gaps are filled with estimates."}</p>
            </div>
            <div className="gn-usage-month-table" aria-label="Monthly recorded usage details">
              {usageWindow.monthly.map((point) => {
                const hasData = usageMetric === "cost" ? point.cost !== null : point.usage !== null;
                const metricValue = usageMetric === "cost" ? (point.cost === null ? "No cost figure" : fmtMoney(point.cost)) : (point.usage === null ? "No usage figure" : `${point.usage.toLocaleString("en-IE")} kWh`);
                return <div key={point.key}><span>{point.label} · {point.key}</span><strong>{hasData ? metricValue : point.billCount ? "Record on file; figure missing" : "No reading on file"}</strong><small>{point.billCount} dated record{point.billCount === 1 ? "" : "s"}{usageMetric === "cost" ? ` · ${point.actualCostCount} actual / ${point.estimatedCostCount} estimated` : ` · ${point.usageRecordCount} with usage`}</small></div>;
              })}
            </div>
            </>
          ) : (
            <div className="gn-usage-empty-panel"><Activity size={20} /><div><strong>{usageMetric === "cost" ? "No cost figures for these filters" : "No recorded usage for these filters"}</strong><span>{usageWindow.billCount > 0 ? (usageMetric === "cost" ? "Records are on file, but they need an invoice total or both usage and a unit rate to show cost." : "Records are on file, but they do not include a usage figure in this period.") : "Try a wider date range or another location, or upload a bill that includes the figures you need."}</span></div><button onClick={() => setUploadingFor(usageAccount === "all" ? "new" : usageAccount)}><Upload size={14} /> Upload a bill</button></div>
          )}
          <div className="gn-usage-table-heading"><div><h3>Accounts in this view</h3><p>{usageMetric === "cost" ? "Invoice total when available; otherwise an estimate. See counts beside each account." : "Totals include only dated records with recorded usage."}</p></div><span>{Object.keys(usageWindow.byAccount).length} accounts</span></div>
          <div className="gn-usage-account-list">
            {usageFilterAccounts.filter((account) => usageAccount === "all" || account.id === usageAccount).filter((account) => usageWindow.byAccount[account.id]).sort((a, b) => usageWindow.byAccount[b.id][usageMetric] - usageWindow.byAccount[a.id][usageMetric]).map((account) => {
              const record = usageWindow.byAccount[account.id];
              const status = overallStatusFor(account);
              return <div className="gn-usage-account-row" key={account.id}>
                <div className="gn-usage-account-name"><strong>{account.name}</strong><span>{account.location || "Location not set"} · {account.fuel_type === "gas" ? "Gas" : "Electricity"} · {account.provider || "Supplier not set"}</span></div>
                <div><small>{usageMetric === "cost" ? "Cost represented" : "Recorded usage"}</small><strong>{usageMetric === "cost" ? (record.costRecordCount ? fmtMoney(record.cost) : "Not recorded") : (record.usageRecordCount ? `${Math.round(record.usage).toLocaleString("en-IE")} kWh` : "Not recorded")}</strong></div>
                <div><small>{usageMetric === "cost" ? "Actual / estimated" : "Records with usage"}</small><strong>{usageMetric === "cost" ? `${record.actualCostCount} / ${record.estimatedCostCount}` : record.usageRecordCount}</strong></div>
                <div><small>Latest dated record</small><strong>{formatAccountDate(record.latestDate)}</strong></div>
                <div className="gn-usage-account-status"><span style={{ color: status.color }}>{status.label}</span><small>{accountStatusDetail(account)}</small></div>
                <button type="button" onClick={() => openDashboardAccount(account)}>Review account →</button>
              </div>;
            })}
          </div>
          {usageFilterAccounts.filter((account) => (usageAccount === "all" || account.id === usageAccount) && !usageWindow.byAccount[account.id]).length > 0 && (
            <div className="gn-usage-no-records">
              <div><strong>No dated records in this period</strong><span>These accounts have no saved reading within the selected dates. Check their last recorded date and expected billing cycle before deciding whether anything is missing.</span></div>
              {usageFilterAccounts.filter((account) => (usageAccount === "all" || account.id === usageAccount) && !usageWindow.byAccount[account.id]).map((account) => {
                const latestBill = (readingSummaries[account.id] || []).find((reading) => reading.reading_date)?.reading_date;
                const status = overallStatusFor(account);
                return <div className="gn-usage-no-record-row" key={account.id}><span><strong>{account.name}</strong><small>{account.location || "Location not set"} · {account.fuel_type === "gas" ? "Gas" : "Electricity"} · Latest dated record: {formatAccountDate(latestBill)}</small></span><span style={{ color: status.color }}>{status.label}</span><button type="button" onClick={() => openDashboardAccount(account)}>Review account →</button></div>;
              })}
            </div>
          )}
        </section>
      )}

      {section === "reports" && <>
        <div className="gn-report-settings"><div><strong>Choose a report</strong><span>PDFs include {combinedMode ? "the visible companies’" : "the active company’s"} data. Missing figures remain clearly marked.</span></div><label>Usage report period<select value={reportRangeMonths} onChange={(event) => setReportRangeMonths(Number(event.target.value))}><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option><option value={24}>Last 24 months</option></select></label></div>
        <section className="gn-action-grid">
          <button onClick={() => generatePortfolioReport(enrichedAll, summaryStats, attentionGroups, companyName, readingSummaries)}><FileText size={20}/><b>Portfolio report</b><span>See account coverage, spend trends, renewals and actions that may need review.</span><strong>Download PDF →</strong></button>
          <button onClick={() => generateUsageCostReport(enrichedAll, readingSummaries, companyName, reportRangeMonths)}><Activity size={20}/><b>Usage &amp; cost report</b><span>Compare monthly kWh with invoice totals and separately labelled estimates for the selected period.</span><strong>Download {reportRangeMonths}-month PDF →</strong></button>
          <button onClick={() => generateSavingsReport(enrichedAll, summaryStats, companyName)}><TrendingDown size={20}/><b>Savings report</b><span>Review rate comparisons, renewal progress and indicative annual savings.</span><strong>Download PDF →</strong></button>
          <button onClick={() => exportAccountsExcel(accounts)}><Download size={20}/><b>Account data</b><span>Export the account register for checking or sharing.</span><strong>Export Excel →</strong></button>
          <button onClick={() => setShowOverview(true)}><BarChart3 size={20}/><b>Portfolio overview</b><span>Explore your current portfolio data before downloading a report.</span><strong>Open overview →</strong></button>
        </section>
      </>}

      {section === "settings" && <section className="gn-settings-grid"><article className="gn-card"><div className="gn-settings-icon"><Building2 size={20}/></div><h2>Company workspace</h2><p>{companyName || "Set up a company workspace"}</p><span>Company data, accounts and utility records are shared with your invited team members.</span><button onClick={() => router.push("/dashboard/all-companies")}>Manage companies →</button></article><article className="gn-card"><div className="gn-settings-icon"><Users size={20}/></div><h2>Team access</h2><p>Invite colleagues and manage membership.</p><span>Team access follows the active company selected in the header.</span><button onClick={() => window.dispatchEvent(new Event("gnorate:open-team"))}>Manage team →</button></article><article className="gn-card"><div className="gn-settings-icon"><BarChart3 size={20}/></div><h2>Market benchmarks</h2><p>Review benchmark rates for your account categories.</p><span>Current comparisons use account details alongside available Irish tariff data.</span><button onClick={() => setShowBenchmarks(true)}>Open benchmarks →</button></article></section>}

      {lockedLocation ? (
        <div style={{ marginBottom: 22 }}>
          <Link href={sectionHref("accounts")} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", textDecoration: "none", marginBottom: 12, width: "fit-content" }}>
            <ChevronDown size={13} style={{ transform: "rotate(90deg)" }} /> All locations
          </Link>
          <h2 style={{ fontFamily: "'Manrope', serif", fontSize: 20, fontWeight: 600, margin: 0 }}>{lockedLocation}</h2>
        </div>
      ) : section === "accounts" ? (
        <>
          {/* HERO — the dominant element on the page: what needs attention, why, where, what to do next */}
          <details className="gn-account-attention-panel">
            <summary className="gn-account-attention-summary">
              <strong>{summaryStats.needAttention}</strong>
              <span>{summaryStats.needAttention === 1 ? "account needs attention" : "accounts need attention"}</span>
              <small>{summaryStats.criticalCount} urgent · {summaryStats.reviewCount} to check</small>
              <span className="gn-attention-disclosure-label">What this means</span>
            </summary>
            <p className="gn-attention-criteria">An account is flagged only when its contract has ended or ends within 30 days and renewal is not marked as underway, a bill shows a rate increase of 5% or more, or bill details were read with low confidence. Old or missing bills, incomplete account details, and renewals more than 30 days away are shown as information instead.</p>
            {summaryStats.needAttention > 0 && (
              <div style={{ display: "flex", gap: 16, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                {summaryStats.criticalCount > 0 && (
                  <button
                    onClick={() => { setFilterStatus("Contract needs action"); setGroupByLocation(false); }}
                    style={{ background: "none", border: "none", padding: 0, color: "var(--red)", cursor: "pointer" }}
                  >
                    {summaryStats.criticalCount} contract dates passed or due within 30 days
                  </button>
                )}
                {summaryStats.reviewCount > 0 && (
                  <button
                    onClick={() => { setFilterStatus("__needs_review_only__"); setGroupByLocation(false); }}
                    style={{ background: "none", border: "none", padding: 0, color: "var(--amber)", cursor: "pointer" }}
                  >
                    {summaryStats.reviewCount} to review
                  </button>
                )}
              </div>
            )}

            {attentionGroups.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, marginBottom: 4 }}>
                  WHAT THE RECORDS SHOW — {attentionItems.length} item{attentionItems.length === 1 ? "" : "s"} to check across {summaryStats.needAttention} account{summaryStats.needAttention === 1 ? "" : "s"}
                  {attentionItems.length !== summaryStats.needAttention ? " (some accounts have more than one item)" : ""}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {attentionGroups.map((group) => {
                    const key = `${group.color}::${group.groupLabel}`;
                    const isExpanded = expandedAttentionGroups.has(key);
                    return (
                      <div key={key}>
                        <button
                          onClick={() =>
                            group.items.length === 1
                              ? jumpToAccount(group.items[0].account)
                              : setExpandedAttentionGroups((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderLeft: `3px solid ${group.color}`,
                            borderRadius: 8,
                            padding: "10px 14px",
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                          }}
                        >
                          <strong style={{ color: "var(--text)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{group.items.length}</strong>
                          <span style={{ fontSize: 13, color: "var(--text)" }}>{group.groupLabel}</span>
                          <span style={{ marginLeft: "auto", color: group.color, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                            {group.items.length === 1 ? "Review →" : isExpanded ? "Hide" : "Review →"}
                          </span>
                        </button>
                        {isExpanded && group.items.length > 1 && (
                          <div className="wp-soft-in" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, marginLeft: 16, paddingLeft: 10, borderLeft: "1px solid var(--border)" }}>
                            {group.items.slice(0, 6).map((item) => (
                              <button
                                key={item.id}
                                onClick={() => jumpToAccount(item.account)}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontSize: 12, color: "var(--muted)" }}
                              >
                                {item.account.name}
                                {item.detail ? ` (${item.detail})` : ""}
                              </button>
                            ))}
                            {group.items.length > 6 && (
                              <span style={{ fontSize: 11.5, color: "var(--muted)", opacity: 0.75 }}>
                                + {group.items.length - 6} more — use search or Filters below
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(() => {
              const locAttention = [...new Set(accounts.map((a) => a.location).filter(Boolean))]
                .map((loc) => {
                  const locAccts = enrichedAll.filter((a) => a.location === loc);
                  const count = locAccts.filter((a) => attentionLevelFor(a) !== "none").length;
                  const urgent = locAccts.filter((a) => attentionLevelFor(a) === "urgent").length;
                  return { loc, count, urgent, total: locAccts.length };
                })
                .sort((a, b) => b.count - a.count || a.loc.localeCompare(b.loc, undefined, { numeric: true }));
              if (locAttention.length === 0) return null;
              return (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, marginBottom: 8 }}>LOCATIONS WITH ACCOUNT CHECKS</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    {locAttention.map(({ loc, count, urgent, total }) => (
                      <button
                        key={loc}
                        onClick={() => router.push(`/dashboard/locations/${encodeURIComponent(loc)}`)}
                        style={{
                          background: "var(--bg)",
                          border: `1px solid ${urgent > 0 ? "var(--red)" : count > 0 ? "var(--amber)" : "var(--border)"}`,
                          borderRadius: 999,
                          padding: "7px 14px",
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          color: urgent > 0 ? "var(--red)" : count > 0 ? "var(--amber)" : "var(--green)",
                        }}
                      >
                        {loc} — {count > 0 ? `${count}/${total} have items to check` : `${total} accounts · no flagged items`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <button
              onClick={() => router.push(summaryStats.criticalCount > 0 ? "/dashboard/attention?filter=critical" : "/dashboard/attention")}
              disabled={summaryStats.needAttention === 0}
              style={{
                background: summaryStats.needAttention > 0 ? "var(--teal)" : "var(--border)",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "11px 20px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: summaryStats.needAttention > 0 ? "pointer" : "default",
              }}
            >
              {summaryStats.criticalCount > 0
                ? `Review ${summaryStats.criticalCount} critical account${summaryStats.criticalCount === 1 ? "" : "s"} →`
                : summaryStats.needAttention > 0
                ? "Review accounts →"
                : "Nothing needs attention right now"}
            </button>
          </details>

          {/* Supporting stats — deliberately smaller than the attention summary */}
          <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap", fontSize: 12.5, color: "var(--muted)" }}>
            <span>
              <strong style={{ color: "var(--text)" }}>{accounts.length}</strong> total accounts
            </span>
            <span style={{ position: "relative" }}>
              <button
                onClick={() => (summaryStats.hasAnyCost || summaryStats.partialBillCount > 0) && setSpendBreakdownOpen((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  color: "var(--muted)",
                  cursor: summaryStats.hasAnyCost || summaryStats.partialBillCount > 0 ? "pointer" : "default",
                  textDecoration: summaryStats.hasAnyCost || summaryStats.partialBillCount > 0 ? "underline dotted" : "none",
                }}
              >
                {summaryStats.hasAnyCost ? (
                  <>
                    <strong style={{ color: "var(--text)" }}>{fmtMoney(summaryStats.totalSpend)}</strong> projected annual cost
                  </>
                ) : summaryStats.partialBillCount > 0 ? (
                  "Needs more data"
                ) : (
                  "No bill data yet"
                )}
              </button>
              {spendBreakdownOpen && (summaryStats.hasAnyCost || summaryStats.partialBillCount > 0) && (
                <>
                  <div onClick={() => setSpendBreakdownOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 24 }} />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="wp-soft-in"
                    style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 10, padding: 14, zIndex: 25, width: 260, textAlign: "left" }}
                  >
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, marginBottom: 8 }}>HOW THIS IS CALCULATED</p>
                    {summaryStats.realBillCount > 0 && (
                      <div style={{ fontSize: 12.5, color: "var(--text)", marginBottom: 6 }}>
                        <strong>{summaryStats.realBillCount}</strong> account{summaryStats.realBillCount === 1 ? "" : "s"} — 5+ real bills on file, included in the estimate
                      </div>
                    )}
                    {summaryStats.partialBillCount > 0 && (
                      <div style={{ fontSize: 12.5, color: "var(--text)", marginBottom: 6 }}>
                        <strong>{summaryStats.partialBillCount}</strong> account{summaryStats.partialBillCount === 1 ? "" : "s"} — has bill history, but fewer than 5 bills isn't enough to reliably estimate a full year yet
                      </div>
                    )}
                    {summaryStats.noCostCount > 0 && (
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        <strong>{summaryStats.noCostCount}</strong> account{summaryStats.noCostCount === 1 ? "" : "s"} — no bills uploaded yet
                      </div>
                    )}
                  </div>
                </>
              )}
            </span>
            {summaryStats.hasAnyComparison && (
              <span>
                <strong style={{ color: "var(--green)" }}>{fmtMoney(summaryStats.potentialSavings)}</strong> estimated unit-rate difference/yr
              </span>
            )}
          </div>
        </>
      ) : null}

      {section === "renewals" && (
        <>
          {!quoteOffersAvailable && <div style={{marginBottom:12,padding:"10px 12px",border:"1px solid var(--amber)",borderRadius:8,color:"var(--muted)",fontSize:12}}>Renewal command centre is active. Multi-quote comparison will appear after the current <code>quote_offers</code> schema migration is applied; existing renewal tracking continues to work.</div>}
          <RenewalCommandCenter accounts={enrichedAll} quoteOffers={quoteOffers} onRenewalStatus={updateRenewalStatus} onQuoteStatus={updateQuoteStatus} onOpenAccount={jumpToAccount} onAddQuote={()=>router.push("/dashboard/add-quote")} />
        </>
      )}

      {showAccountTable && (() => {
        const locations = [...new Set(accounts.map((a) => a.location).filter(Boolean))].sort();
        const locationFuelInfo = {};
        locations.forEach((loc) => {
          const locAccounts = accounts.filter((a) => a.location === loc);
          const elecCount = locAccounts.filter((a) => (a.fuel_type || "electricity") !== "gas").length;
          const gasCount = locAccounts.filter((a) => a.fuel_type === "gas").length;
          locationFuelInfo[loc] = elecCount > 0 && gasCount > 0 ? `${elecCount} Elec, ${gasCount} Gas` : elecCount > 0 ? "Electricity" : "Gas";
        });
        const activeFilterCount = [filterFuel, filterStatus, filterRenewal, filterLocation].filter((f) => f !== "all").length;
        const clearAll = () => {
          setFilterFuel("all");
          setFilterStatus("all");
          setFilterRenewal("all");
          setFilterLocation("all");
          setSearch("");
          setGroupByLocation(!lockedLocation);
          setExpandedLocationGroups(new Set());
          setFiltersOpen(false);
        };
        return (
          <div style={{ position: "relative", marginBottom: 18 }}>
            <div className="gn-account-list-toolbar" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative", maxWidth: 320, flex: 1, minWidth: 200 }}>
                <Search size={15} color="var(--muted)" style={{ position: "absolute", left: 10, top: 10 }} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setGroupByLocation(!e.target.value && !lockedLocation);
                  }}
                  placeholder="Search accounts or sites…"
                  style={{ ...inputStyle, width: "100%", paddingLeft: 32, boxSizing: "border-box" }}
                />
              </div>
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: filtersOpen ? "var(--panel)" : "none",
                  border: "1px solid var(--border-light)",
                  color: "var(--text)",
                  borderRadius: 7,
                  padding: "8px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <SlidersHorizontal size={14} /> Filter accounts
                {activeFilterCount > 0 && (
                  <span style={{ background: "var(--teal)", color: "#ffffff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {locations.length > 0 && !lockedLocation && (
                <button
                  onClick={() => {
                    setGroupByLocation((v) => !v);
                    if (!groupByLocation) setExpandedLocationGroups(new Set());
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: `1px solid ${groupByLocation ? "var(--state)" : "var(--border-light)"}`,
                    color: groupByLocation ? "var(--state)" : "var(--text)",
                    borderRadius: 7,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: groupByLocation ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {groupByLocation ? "Show accounts as a list" : "Group accounts by location"}
                </button>
              )}
              {locations.length > 0 && !lockedLocation && groupByLocation && (
                <label style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 12 }}>
                  Sort sites by
                  <select aria-label="Sort sites by" value={locationSortMode} onChange={(e) => setLocationSortMode(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                    <option value="attention">Needs review first</option>
                    <option value="alphabetical">Site name A to Z</option>
                  </select>
                </label>
              )}
            </div>

            {filtersOpen && (
              <div
                onClick={() => setFiltersOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 24 }}
              />
            )}
            {filtersOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="wp-soft-in"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  background: "var(--panel)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 10,
                  padding: 16,
                  zIndex: 25,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  minWidth: 320,
                }}
              >
                <select value={filterFuel} onChange={(e) => setFilterFuel(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  <option value="all">All fuel types</option>
                  <option value="electricity">Electricity</option>
                  <option value="gas">Gas</option>
                </select>

                <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setGroupByLocation(e.target.value === "all" && !lockedLocation); }} style={{ ...inputStyle, width: "auto" }}>
                  <option value="all">All statuses</option>
                  <option value="Contract needs action">Contract needs action</option>
                  <option value="Rate increase to check">Rate increase to check</option>
                  <option value="Bill details to check">Bill details to check</option>
                  <option value="Renewal coming up">Renewal coming up</option>
                  <option value="Bill data may be out of date">Bill data may be out of date</option>
                  <option value="Account details incomplete">Account details incomplete</option>
                  <option value="Quote requested">Quote requested</option>
                  <option value="Switching">Switching</option>
                  <option value="On track">On track</option>
                </select>

                <select value={filterRenewal} onChange={(e) => setFilterRenewal(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  <option value="all">All renewal stages</option>
                  <option value="not_started">Not started</option>
                  <option value="quote_requested">Quote requested</option>
                  <option value="switching">Switching</option>
                  <option value="renewed">Renewed</option>
                </select>

                {locations.length > 0 && (
                  <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                    <option value="all">All locations</option>
                    {locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc} ({locationFuelInfo[loc]})
                      </option>
                    ))}
                  </select>
                )}

                {(activeFilterCount > 0 || search) && (
                  <button onClick={clearAll} style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: 12.5 }}>
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {showAccountTable && filterLocation !== "all" && (
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 20, fontSize: 12.5, color: "var(--muted)" }}>
          <span>
            <strong style={{ color: "var(--text)" }}>{enriched.length}</strong> account{enriched.length === 1 ? "" : "s"} at {filterLocation}
          </span>
          {(() => {
            const hasAnyCost = enriched.some((a) => a.cost !== null && a.cost !== undefined);
            const hasAnyComparison = enriched.some((a) => a.comparison);
            return (
              <>
                <span>
                  Combined spend:{" "}
                  <strong style={{ color: hasAnyCost ? "var(--text)" : "var(--muted)" }}>
                    {hasAnyCost ? fmtMoney(enriched.reduce((s, a) => (a.cost ? s + a.cost : s), 0)) : "no bill data yet"}
                  </strong>
                </span>
                <span>
                  Combined estimated unit-rate savings:{" "}
                  <strong style={{ color: hasAnyComparison ? "var(--green)" : "var(--muted)" }}>
                    {hasAnyComparison ? fmtMoney(enriched.reduce((s, a) => (a.saving && a.saving > 20 ? s + a.saving : s), 0)) : "no comparison yet"}
                  </strong>
                </span>
              </>
            );
          })()}
        </div>
      )}

      {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {showAccountTable && selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <button
            onClick={() => {
              setBulkQuoteSupplierSelection(new Set());
              setBulkQuotePickerOpen(true);
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", color: "var(--teal)", cursor: "pointer", fontSize: 12.5 }}
          >
            <Mail size={13} /> Email selected accounts
          </button>
          <button
            onClick={() => {
              setBulkEditForm({ location: "", contract_end: "", provider: "", renewal_status: "" });
              setBulkEditOpen(true);
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", color: "var(--teal)", cursor: "pointer", fontSize: 12.5 }}
          >
            <Pencil size={13} /> Bulk edit
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12.5 }}
          >
            Clear selection
          </button>
        </div>
      )}

      {bulkQuotePickerOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 65, padding: 20 }}
          onClick={() => setBulkQuotePickerOpen(false)}
        >
          <div
            style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 420, maxWidth: "100%", padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>
              Email {selectedIds.size} account{selectedIds.size === 1 ? "" : "s"}
            </h2>
            {(() => {
              const selectedAccounts = enriched.filter((a) => selectedIds.has(a.id));
              const fuelsPresent = new Set(selectedAccounts.map((a) => a.fuel_type || "electricity"));
              const matching = suppliers.filter((s) => s.fuel_types.some((f) => fuelsPresent.has(f)));
              if (matching.length === 0) {
                return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No saved suppliers match these accounts yet. Add some in the admin rates page.</div>;
              }
              const selectedSupplierIds = bulkQuoteSupplierSelection;
              const toggleSupplier = (id) => {
                setBulkQuoteSupplierSelection((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              };
              const chosenSuppliers = matching.filter((s) => selectedSupplierIds.has(s.id));
              const emailableChosen = chosenSuppliers.filter((s) => s.accepts_email_quotes && s.contact_email);

              return (
                <>
                  {chosenSuppliers.length > 1 && emailableChosen.length === chosenSuppliers.length && (
                    <a
                      href={bulkQuoteRequestMailtoBCC(selectedAccounts, emailableChosen.map((s) => s.contact_email), companyName)}
                      onClick={() => setBulkQuotePickerOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "var(--teal)",
                        color: "#ffffff",
                        textDecoration: "none",
                        borderRadius: 6,
                        padding: "8px 12px",
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 10,
                      }}
                    >
                      <Mail size={12} /> Email all {emailableChosen.length} selected at once (BCC — they won't see each other)
                    </a>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {matching.map((s) => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer" }}>
                          <input type="checkbox" checked={selectedSupplierIds.has(s.id)} onChange={() => toggleSupplier(s.id)} />
                          {s.name}
                        </label>
                        {s.accepts_email_quotes && s.contact_email ? (
                          <a
                            href={bulkQuoteRequestMailto(selectedAccounts, s.contact_email, companyName)}
                            onClick={() => setBulkQuotePickerOpen(false)}
                            style={{ color: "var(--teal)", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}
                          >
                            <Mail size={12} /> Email
                          </a>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 11.5 }}>Call {s.contact_phone || "— no number saved"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={() => setBulkQuotePickerOpen(false)}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showAccountTable && (enriched.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: 12 }}>
          <Flame size={28} color="var(--teal-dim)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>
            {accounts.length === 0 ? "No accounts yet. Add your first utility account to start tracking rates and renewals." : section === "rates" ? "No current market comparisons. Check that account usage and supplier rate data are available." : section === "usage" ? "No accounts have usage data yet. Upload a bill or add usage details to start a trend." : section === "renewals" ? "No contracts are overdue or ending within 120 days." : section === "savings" ? "No positive savings comparisons are available yet. Review current rates and account usage." : "No accounts match that search or filter."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayItems.map((item) => {
            if (item.type === "location-header") {
              const isExpanded = expandedLocationGroups.has(item.groupKey);
              const groupAttentionCount = item.accounts.filter((a) => attentionLevelFor(a) !== "none").length;
              const groupUrgentCount = item.accounts.filter((a) => attentionLevelFor(a) === "urgent").length;
              const worstColor = groupUrgentCount > 0 ? "var(--red)" : groupAttentionCount > 0 ? "var(--amber)" : "var(--green)";
              const elecCount = item.accounts.filter((a) => (a.fuel_type || "electricity") !== "gas").length;
              const gasCount = item.accounts.filter((a) => a.fuel_type === "gas").length;
              const fuelLabel = elecCount > 0 && gasCount > 0 ? `${elecCount} Electricity, ${gasCount} Gas` : elecCount > 0 ? "Electricity" : "Gas";
              return (
                <button
                  key={`loc-${item.groupKey}`}
                  onClick={() =>
                    setExpandedLocationGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.groupKey)) next.delete(item.groupKey);
                      else next.add(item.groupKey);
                      return next;
                    })
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${worstColor}`,
                    borderRadius: 10,
                    padding: "12px 16px",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <ChevronDown size={14} color="var(--muted)" style={{ transform: isExpanded ? "none" : "rotate(-90deg)", flexShrink: 0, transition: "transform 0.15s ease" }} />
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14.5, fontWeight: 600, color: "var(--text)" }}>{item.location}</span>
                  {combinedMode && item.companyName && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--state)", background: "var(--bg)", borderRadius: 5, padding: "3px 7px" }}>{item.companyName}</span>}
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {item.accounts.length} account{item.accounts.length === 1 ? "" : "s"} · {fuelLabel}
                    {groupAttentionCount > 0 ? (
                      <span style={{ color: worstColor, fontWeight: 600 }}> · {groupAttentionCount} with items to check</span>
                    ) : (
                      <span style={{ color: "var(--green)", fontWeight: 600 }}> · no flagged items</span>
                    )}
                  </span>
                </button>
              );
            }

            const a = item.account;
            const overall = overallStatusFor(a);
            const nextSteps = accountNextSteps(a);
            const isExpanded = expandedId === a.id;
            const openAccountTab = async (tab) => {
              if (expandedId !== a.id) await toggleReadings(a.id);
              setExpandedTab(tab);
              if (tab === "details") requestAnimationFrame(() => {
                const renewalControl = document.getElementById(`renewal-status-${a.id}`);
                renewalControl?.scrollIntoView({ block: "center", behavior: "smooth" });
                renewalControl?.focus();
              });
            };
            return (
              <div
                key={a.id}
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${overall.color}`,
                  borderRadius: 10,
                  marginLeft: groupByLocation && a.location ? 20 : 0,
                }}
              >
                <div
                  onClick={() => toggleReadings(a.id)}
                  className="gn-account-primary-row"
                  style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.id)) next.delete(a.id);
                        else next.add(a.id);
                        return next;
                      });
                    }}
                    style={{ flexShrink: 0, cursor: "pointer", width: 15, height: 15 }}
                  />
                  {(a.fuel_type || "electricity") === "gas" ? (
                    <Flame size={13} color="var(--amber)" style={{ flexShrink: 0 }} />
                  ) : (
                    <Zap size={13} color="var(--teal)" style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, overflow: "hidden" }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.name}
                    </span>
                    {combinedMode && companiesById?.[a.company_id] && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          switchToCompany(a.company_id);
                        }}
                        title={`Switch to ${companiesById[a.company_id]}`}
                        style={{ fontSize: 10.5, fontWeight: 600, color: "var(--state)", background: "none", border: "1px solid var(--state)55", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer" }}
                      >
                        {companiesById[a.company_id]}
                      </button>
                    )}
                    {a.location && !groupByLocation && (
                      <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>📍 {a.location}</span>
                    )}
                    {a.bill_delivery_method && (
                      <span
                        title={a.bill_delivery_method === "portal" && a.portal_login_email ? `Portal login: ${a.portal_login_email}` : undefined}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--muted)",
                          border: "1px solid var(--border-light)",
                          borderRadius: 4,
                          padding: "1px 6px",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          textTransform: "capitalize",
                        }}
                      >
                        {a.bill_delivery_method}
                      </span>
                    )}
                    {showAccountNumbers && (a.account_number || a.supplier_account_number) && (
                      <span style={{ fontSize: 10.5, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {a.account_number ? `${a.fuel_type === "gas" ? "GPRN" : "MPRN"} ${a.account_number}` : ""}
                        {a.account_number && a.supplier_account_number ? " · " : ""}
                        {a.supplier_account_number ? `Supplier # ${a.supplier_account_number}` : ""}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      borderRadius: 5,
                      padding: "3px 9px",
                      ...(overall.color === "var(--red)"
                        ? { color: "#ffffff", background: overall.color }
                        : { color: overall.color, background: "none", border: `1px solid ${overall.color}66` }),
                    }}
                  >
                {overall.color === "var(--red)" && <AlertTriangle size={11} />}
                    {overall.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }} title="Recorded contract end date">
                    {a.daysLeft === null ? "End date not set" : a.daysLeft < 0 ? `Ended ${Math.abs(a.daysLeft)} days ago` : `Ends in ${a.daysLeft} days`}
                  </span>
                  <button
                    type="button"
                    className="gn-account-details-button"
                    aria-expanded={isExpanded}
                    onClick={(e) => { e.stopPropagation(); toggleReadings(a.id); }}
                  >
                    {isExpanded ? "Hide details" : overall.label === "On track" ? "View details" : "View next steps"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setUploadingFor(a.id); }}
                    title="Upload a bill for this account"
                    aria-label={`Upload a bill for ${a.name}` }
                    style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: 5, flexShrink: 0 }}
                  >
                    <Upload size={14} />
                  </button>
                  <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setMenuForId(menuForId === a.id ? null : a.id)}
                      aria-label={`More actions for ${a.name}`}
                      title="More actions"
                      style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex", padding: 4 }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuForId === a.id && (
                      <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 8, minWidth: 160, zIndex: 20, overflow: "hidden" }}>
                        <button
                          onClick={() => { setMenuForId(null); openQuickRenew(a); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", color: "var(--teal)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                        >
                          Just renewed?
                        </button>
                        <button
                          onClick={() => { setMenuForId(null); setEditing(a); setShowForm(true); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", color: "var(--text)", cursor: "pointer", fontSize: 13 }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setMenuForId(null); deleteAccount(a.id); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", color: "var(--red)", cursor: "pointer", fontSize: 13 }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                </div>

                <div className="gn-account-info-grid">
                  <div className="gn-account-info-cell"><small>Supplier <em>Saved detail</em></small><strong>{a.provider || "Not recorded"}</strong>{isExpanded && !a.provider && <button type="button" onClick={() => { setEditing(a); setShowForm(true); }}>Add supplier</button>}</div>
                  <div className="gn-account-info-cell"><small>Current unit rate <em>From saved details or bill</em></small><strong>{a.rate ? `${Number(a.rate).toLocaleString("en-IE", { maximumFractionDigits: 2 })}c/kWh` : "Not recorded"}</strong>{isExpanded && !a.rate && <button type="button" onClick={() => setUploadingFor(a.id)}>Add rate from bill</button>}</div>
                  <div className="gn-account-info-cell"><small>Standing charge <em>Daily supplier charge</em></small><strong>{a.standing_charge ? `${Number(a.standing_charge).toLocaleString("en-IE", { maximumFractionDigits: 2 })}c/day` : "Not recorded"}</strong>{isExpanded && !a.standing_charge && <button type="button" onClick={() => { setEditing(a); setShowForm(true); }}>Add standing charge</button>}</div>
                  <div className="gn-account-info-cell"><small>Projected annual usage <em>{a.costDetail?.usageEstimate?.source === "bills" ? "Calculated from bill periods" : a.costDetail?.usageEstimate?.source === "historical-bills" ? "Estimated from historical bill dates" : "Manually entered"}</em></small><strong>{a.costDetail?.usage != null ? `${Number(a.costDetail.usage).toLocaleString("en-IE")} kWh` : "Not recorded"}</strong><span>{a.costDetail?.usageEstimate?.detail || "Upload bills with exact billing-period dates to calculate a more reliable annual projection."}</span>{isExpanded && !a.costDetail?.usage && <button type="button" onClick={() => { setEditing(a); setShowForm(true); }}>Add annual usage</button>}</div>
                  <div className="gn-account-info-cell"><small>Latest bill on file <em>Reading date</em></small><strong>{formatAccountDate(readingSummaries[a.id]?.[0]?.reading_date)}</strong>{isExpanded && (!readingSummaries[a.id]?.[0]?.reading_date || a.confidence.missingBill) && <button type="button" onClick={() => setUploadingFor(a.id)}>{readingSummaries[a.id]?.[0]?.reading_date ? "Add newer bill" : "Upload first bill"}</button>}</div>
                  <div className="gn-account-info-cell"><small>Contract end date <em>Saved detail</em></small><strong>{formatAccountDate(a.contract_end)}</strong>{isExpanded && !a.contract_end && <button type="button" onClick={() => { setEditing(a); setShowForm(true); }}>Add end date</button>}</div>
                  <div className="gn-account-info-cell gn-account-estimate"><small>Projected annual energy cost <em>Estimate · not a bill total</em></small><strong>{a.cost !== null && a.cost !== undefined ? `~${fmtMoney(a.cost)}/yr` : "Not enough bill data"}</strong><span>Transparent projection from annual usage and saved tariff components; open the account for the calculation basis.</span>{isExpanded && <button type="button" onClick={() => setUploadingFor(a.id)}>Upload a bill to improve estimate</button>}</div>{isExpanded && a.costDetail && <div className="gn-account-info-cell"><small>Cost calculation <em>{a.costDetail.confidence}% data confidence</em></small><strong>{a.costDetail.usage != null ? `${Number(a.costDetail.usage).toLocaleString("en-IE")} kWh × ${a.costDetail.rate ?? "—"}c/kWh` : "Annual usage needed"}</strong><span>{a.costDetail.usageEstimate?.method} · {a.costDetail.usageEstimate?.coverageDays || 0} days covered · {a.costDetail.usageEstimate?.billCount || 0} bills used · usage confidence {a.costDetail.usageEstimate?.confidence || 0}%</span><span>Energy {fmtMoney(a.costDetail.components.energy)} · Standing {fmtMoney(a.costDetail.components.standing)} · Capacity/fixed {fmtMoney((a.costDetail.components.capacity||0)+(a.costDetail.components.other||0))}</span><span>{a.costDetail.trailingRecorded != null ? `Recorded invoice totals: ${fmtMoney(a.costDetail.trailingRecorded)}${a.costDetail.trailingIsAnnual ? " across approximately a year" : " (not annualised)"}.` : "No invoice totals recorded yet."}</span></div>}
                  <div className="gn-account-status-detail" style={{ borderColor: `${overall.color}44` }}><strong style={{ color: overall.color }}>{overall.label}</strong><span>{accountStatusDetail(a)}</span></div>
                </div>

                {isExpanded && <section className="gn-account-next-steps" aria-label={`Next steps for ${a.name}`}>
                  <div className="gn-account-next-heading"><strong>What you can do next</strong><span>{nextSteps.some((step) => step.kind === "action") ? "Action required" : nextSteps.some((step) => step.kind === "check") ? "Check recommended" : nextSteps.some((step) => step.action) ? "Information and options" : "Information only"}</span><button type="button" onClick={() => { setEditing(a); setShowForm(true); }}>Edit account details</button></div>
                  {nextSteps.map((step, index) => <div key={`${step.title}-${index}`} className={`gn-account-next-item is-${step.kind}`}><span className="gn-account-next-copy"><strong>{step.title}</strong><small>{step.detail}</small></span>{step.button && <button type="button" onClick={() => {
                    if (step.action === "upload") setUploadingFor(a.id);
                    if (step.action === "edit") { setEditing(a); setShowForm(true); }
                    if (step.action === "history") void openAccountTab("history");
                    if (step.action === "confirm-rate") { setRateReviewFor(a); setRateCorrection(String(a.rateChange?.to ?? "")); }
                    if (step.action === "market") { void openAccountTab("market"); pullMarketRate(a); }
                    if (step.action === "renewal") void openAccountTab("details");
                  }}>{step.button}</button>}</div>)}
                </section>}

                {isExpanded && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>

                    <div style={{ display: "flex", gap: 4, marginTop: 14, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
                      {[
                        { key: "details", label: "Details" },
                        { key: "market", label: "Market rate" },
                        { key: "history", label: "History" },
                        { key: "notes", label: "Notes" },
                      ].map((t) => (
                        <button
                          key={t.key}
                          onClick={() => {
                            setExpandedTab(t.key);
                            if (t.key === "notes" && !notesByAccount[a.id]) loadNotes(a.id);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            borderBottom: expandedTab === t.key ? "2px solid var(--state)" : "2px solid transparent",
                            color: expandedTab === t.key ? "var(--text)" : "var(--muted)",
                            fontWeight: expandedTab === t.key ? 600 : 400,
                            padding: "6px 10px",
                            cursor: "pointer",
                            fontSize: 12.5,
                            marginBottom: -1,
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {expandedTab === "details" && (
                    <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {a.fuel_type === "gas" ? <Flame size={13} color="var(--muted)" /> : <Zap size={13} color="var(--muted)" />}
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        {a.provider || "No provider set"}
                        {a.contract_end ? ` · ends ${a.contract_end}` : " · no end date set"}
                        {a.rate ? ` · ${a.rate}c/kWh` : ""}
                        {a.fuel_type === "gas" && a.spc_kwh ? ` · SPC ${a.spc_kwh} kWh` : ""}
                        {a.fuel_type !== "gas" && a.mic_kva ? ` · MIC ${a.mic_kva} kVA` : ""}
                      </span>
                      <span
                        title={`Completeness indicator based on saved account fields and bill freshness. ${a.confidence.reasons.join(" · ") || "No missing account fields or old bills flagged."} This is not a bill accuracy score.`}
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: a.confidence.score >= 80 ? "var(--green)" : a.confidence.score >= 50 ? "var(--amber)" : "var(--red)",
                          border: `1px solid ${a.confidence.score >= 80 ? "var(--green)" : a.confidence.score >= 50 ? "var(--amber)" : "var(--red)"}55`,
                          borderRadius: 4,
                          padding: "1px 5px",
                          cursor: "help",
                        }}
                      >
                        DATA COMPLETENESS {a.confidence.score}%
                      </span>
                      {gasTariffFor(a) && (
                        <span
                          title="Based on annual usage and Supply Point Capacity — determines which gas rates actually apply"
                          style={{ fontSize: 9, fontWeight: 600, color: "var(--teal)", border: "1px solid var(--teal)55", borderRadius: 4, padding: "1px 5px", cursor: "help" }}
                        >
                          {gasTariffFor(a)} TARIFF
                        </span>
                      )}
                    </div>
                    {gasTariffFor(a) && <div className="gn-account-info-note"><strong>Information only:</strong> {gasTariffFor(a)} tariff is calculated from annual usage and supply point capacity (SPC) to match the relevant gas rates.</div>}

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {a.fuel_type === "gas" ? "GPRN" : "MPRN"}: {a.account_number || "not set"}
                      </span>
                      {a.supplier_account_number && (
                        <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                          · Supplier account #: {a.supplier_account_number}
                        </span>
                      )}
                    </div>

                    {a.bill_delivery_method && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                        Bills arrive via: <strong style={{ color: "var(--text)", textTransform: "capitalize" }}>{a.bill_delivery_method}</strong>
                        {a.bill_delivery_method === "portal" && a.portal_login_email && (
                          <span>— login: <strong style={{ color: "var(--text)" }}>{a.portal_login_email}</strong></span>
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Renewal status:</span>
                      <select
                        id={`renewal-status-${a.id}`}
                        value={a.renewal_status || "not_started"}
                        onChange={(e) => {
                          if (e.target.value === "renewed") {
                            setEditing(a);
                            setShowForm(true);
                          } else {
                            updateRenewalStatus(a.id, e.target.value);
                          }
                        }}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: renewalMeta(a.renewal_status || "not_started").color,
                          background: "var(--bg)",
                          border: `1px solid ${renewalMeta(a.renewal_status || "not_started").color}55`,
                          borderRadius: 6,
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        {Object.entries(RENEWAL_STATUS_META).map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    </>
                    )}

                    {expandedTab === "market" && (
                    <>
                    {(() => {
                      const rec = recommendationFor(a);
                      return (
                        <div
                          style={{
                            background: "var(--bg)",
                            border: `1px solid ${rec.color}55`,
                            borderRadius: 8,
                            padding: "10px 12px",
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: rec.color, marginBottom: 3 }}>{rec.label}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>{rec.detail}</div>
                        </div>
                      );
                    })()}
                    {a.comparison && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: a.comparison.rate < a.rate ? "var(--green)" : "var(--muted)", fontSize: 12.5, flexWrap: "wrap" }}>
                        <TrendingDown size={13} />
                        Market rate: {a.comparison.rate}c/kWh
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            color: a.comparison.source === "verified" ? "var(--state)" : "var(--muted)",
                            border: `1px solid ${a.comparison.source === "verified" ? "var(--state)" : "var(--border)"}`,
                            borderRadius: 4,
                            padding: "1px 5px",
                          }}
                        >
                          {a.comparison.source === "quoted" ? "quoted rate" : a.comparison.source === "verified" ? "verified rate" : "estimated rate"}
                        </span>
                        {a.saving !== null && a.saving > 20 && ` · estimated unit-rate difference ~${fmtMoney(a.saving)}/yr`}
                      </div>
                    )}
                    {a.comparison?.source === "verified" && (a.comparison.supplierName || a.comparison.note) && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        {a.comparison.supplierName ? `${a.comparison.supplierName}` : ""}
                        {a.comparison.supplierName && a.comparison.note ? " · " : ""}
                        {a.comparison.note || ""}
                        {" · updated "}
                        {new Date(a.comparison.updatedAt).toLocaleDateString("en-IE")}
                      </div>
                    )}
                    {a.comparison && a.saving !== null && (
                      <div style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 8 }}>
                        Indicative unit-rate calculation only: excludes standing charges, capacity charges, levies, VAT and contract fees. Compare full quotes before switching.
                      </div>
                    )}
                    {a.comparison?.source === "verified" && a.comparison.dgGroup && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: a.comparison.estCapacityCost ? 4 : 10 }}>
                        Matched on {a.comparison.dgGroup}
                      </div>
                    )}
                    {a.comparison?.source === "verified" && a.comparison.estCapacityCost && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                        Est. capacity charge at this rate: {fmtMoney(a.comparison.estCapacityCost)}/yr (based on {a.mic_kva} kVA MIC)
                      </div>
                    )}

                    {(() => {
                      const allRates = allMasterRatesFor(a, masterRates);
                      if (allRates.length < 2) return null;
                      return (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, marginBottom: 6 }}>
                            ALL SUPPLIERS FOR THIS TIER
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {allRates.map((r, i) => (
                              <div
                                key={r.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: 12.5,
                                  background: i === 0 ? "var(--bg)" : "none",
                                  padding: i === 0 ? "6px 10px" : "0 10px",
                                  borderRadius: 6,
                                }}
                              >
                                <span style={{ color: i === 0 ? "var(--teal)" : "var(--muted)", fontWeight: i === 0 ? 600 : 400 }}>
                                  {r.suppliers?.name || "Unspecified supplier"} {i === 0 ? "· cheapest" : ""}
                                </span>
                                <span style={{ color: "var(--text)" }}>{r.rate}c/kWh</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {ratePullFor !== a.id && (!a.comparison || a.comparison.source === "estimated") && (
                        <button
                          onClick={() => pullMarketRate(a)}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", color: "var(--teal)", cursor: "pointer", fontSize: 12 }}
                        >
                          <Search size={12} /> Pull current market rate
                        </button>
                      )}
                      <button
                        onClick={() => setQuotePickerFor(quotePickerFor === a.id ? null : a.id)}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}
                      >
                        <Mail size={12} /> Request a quote
                      </button>
                      {a.provider && (
                        <a
                          href={providerNegotiationMailto(
                            a,
                            suppliers.find((s) => s.name.toLowerCase() === a.provider.toLowerCase())?.contact_email,
                            a.comparison,
                            companyName
                          )}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", color: "var(--muted)", cursor: "pointer", fontSize: 12, textDecoration: "none" }}
                        >
                          <Mail size={12} /> Email {a.provider}
                        </a>
                      )}
                    </div>

                    {quotePickerFor === a.id && (
                      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginTop: 8 }}>
                        {(() => {
                          const fuel = a.fuel_type || "electricity";
                          const matching = suppliers.filter((s) => s.fuel_types.includes(fuel));
                          if (matching.length === 0) {
                            return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No suppliers saved yet for {fuel}. Add some in the admin rates page.</div>;
                          }
                          const selected = quoteSupplierSelection[a.id] || new Set();
                          const toggle = (id) => {
                            setQuoteSupplierSelection((prev) => {
                              const next = new Set(prev[a.id] || []);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return { ...prev, [a.id]: next };
                            });
                          };
                          const selectedSuppliers = matching.filter((s) => selected.has(s.id));
                          return (
                            <>
                              {selectedSuppliers.length > 1 && (
                                <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--teal)", letterSpacing: 0.5, marginBottom: 6 }}>
                                    SELECTED — CLICK EACH TO SEND
                                  </div>
                                  {(() => {
                                    const emailable = selectedSuppliers.filter((s) => s.accepts_email_quotes && s.contact_email);
                                    if (emailable.length === selectedSuppliers.length) {
                                      return (
                                        <a
                                          href={quoteRequestMailtoBCC(a, emailable.map((s) => s.contact_email), companyName)}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            background: "var(--teal)",
                                            color: "#ffffff",
                                            textDecoration: "none",
                                            borderRadius: 6,
                                            padding: "6px 10px",
                                            fontSize: 12.5,
                                            fontWeight: 600,
                                            marginBottom: 8,
                                            width: "fit-content",
                                          }}
                                        >
                                          <Mail size={12} /> Email all {emailable.length} at once (BCC — they won't see each other)
                                        </a>
                                      );
                                    }
                                    return (
                                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
                                        One-at-a-time only — not every selected supplier accepts email.
                                      </div>
                                    );
                                  })()}
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {selectedSuppliers.map((s) => (
                                      <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                                        <span style={{ color: "var(--text)" }}>{s.name}</span>
                                        {s.accepts_email_quotes && s.contact_email ? (
                                          <a
                                            href={quoteRequestMailto(a, s.contact_email, companyName)}
                                            style={{ color: "var(--teal)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                                          >
                                            <Mail size={11} /> Email
                                          </a>
                                        ) : (
                                          <span style={{ color: "var(--muted)", fontSize: 11.5 }}>Call {s.contact_phone || "— no number saved"}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {matching.map((s) => (
                                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)", cursor: "pointer" }}>
                                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                                      {s.name}
                                    </label>
                                    {s.accepts_email_quotes && s.contact_email ? (
                                      <a
                                        href={quoteRequestMailto(a, s.contact_email, companyName)}
                                        style={{ color: "var(--teal)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                                      >
                                        <Mail size={11} /> Email
                                      </a>
                                    ) : (
                                      <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                                        Call {s.contact_phone || "— no number saved"}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                      {ratePullFor === a.id && ratePullLoading && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 12.5 }}>
                          <Loader2 size={13} className="animate-spin" /> Checking current rates for {a.usage ? `${a.usage} kWh/yr` : "this account"}…
                        </div>
                      )}
                      {ratePullFor === a.id && ratePullError && !ratePullLoading && (
                        <div style={{ color: "var(--amber)", fontSize: 12.5 }}>{ratePullError}</div>
                      )}
                      {ratePullFor === a.id && ratePullResult && !ratePullLoading && (
                        <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontSize: 12.5, color: "var(--text)", marginBottom: 6 }}>
                            Found: <strong>{ratePullResult.typical_rate}c/kWh</strong>
                            {ratePullResult.supplier ? ` (${ratePullResult.supplier})` : ""}
                            {ratePullResult.typical_standing_charge ? ` · ${ratePullResult.typical_standing_charge}c/day standing` : ""}
                            {ratePullResult.typical_mic_charge ? ` · ${ratePullResult.typical_mic_charge}/kVA capacity charge` : ""}
                          </div>
                          {a.rate && (
                            <div style={{ fontSize: 12.5, marginBottom: 6, color: ratePullResult.typical_rate < a.rate ? "var(--green)" : "var(--muted)" }}>
                              Your current rate: {a.rate}c/kWh
                              {ratePullResult.typical_rate < a.rate
                                ? ` — estimated unit-rate difference ~${fmtMoney(((a.rate - ratePullResult.typical_rate) / 100) * (parseFloat(a.usage) || 0))}/yr before other charges`
                                : " — your unit rate is already at or below this"}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                            {ratePullResult.source_note} ({ratePullResult.as_of})
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => { setRatePullFor(null); setRatePullResult(null); }}
                              style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}
                            >
                              Dismiss
                            </button>
                            <button
                              onClick={() => acceptPulledRate(a.id)}
                              style={{ background: "var(--teal)", border: "none", color: "#ffffff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                            >
                              Use this rate
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    </>
                    )}

                    {expandedTab === "history" && (
                    <div style={{ background: "var(--bg)", borderRadius: 6, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 8 }}>
                        <button
                          onClick={() => setAddingReadingFor(a.id)}
                          style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: 12, padding: 0 }}
                        >
                          + Add manually
                        </button>
                      </div>
                      {!readingsByAccount[a.id] ? (
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
                      ) : readingsByAccount[a.id].length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>No readings saved yet for this account.</div>
                      ) : (
                        <>
                          <ReadingsChart readings={readingsByAccount[a.id]} marketRate={a.comparison?.rate} />
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {readingsByAccount[a.id].map((r) => (
                              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text)" }}>
                                <span style={{ color: "var(--muted)" }}>{r.reading_date || "no date"}</span>
                                <span>{r.usage ? `${r.usage} kWh` : "—"}</span>
                                <span>{r.rate ? `${r.rate}c/kWh` : "—"}</span>
                                <span title="Actual total amount shown on the bill">Bill total {r.total_cost != null ? fmtMoney(Number(r.total_cost)) : "—"}</span>
                                <span style={{ color: "var(--muted)", fontSize: 10 }}>{r.source}</span>
                                <button
                                  onClick={() => deleteReading(r.id, a.id)}
                                  aria-label={`Delete reading from ${r.reading_date || "undated bill"}`}
                                  title="Delete this reading"
                                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, display: "flex" }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    )}

                    {expandedTab === "notes" && (
                      <div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                          <textarea
                            value={newNoteText[a.id] || ""}
                            onChange={(e) => setNewNoteText((prev) => ({ ...prev, [a.id]: e.target.value }))}
                            placeholder="e.g. Spoke to Energia, they'll call back Thursday"
                            rows={2}
                            style={{
                              flex: 1,
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "8px 10px",
                              color: "var(--text)",
                              fontSize: 16,
                              outline: "none",
                              resize: "vertical",
                              fontFamily: "inherit",
                            }}
                          />
                          <button
                            onClick={() => addNote(a.id)}
                            style={{ background: "var(--teal)", border: "none", color: "#ffffff", borderRadius: 6, padding: "0 16px", cursor: "pointer", fontWeight: 600, fontSize: 12.5, flexShrink: 0 }}
                          >
                            Add
                          </button>
                        </div>
                        {!notesByAccount[a.id] ? (
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
                        ) : notesByAccount[a.id].length === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>No notes yet for this account.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {notesByAccount[a.id].map((n) => (
                              <div key={n.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                                <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 6, whiteSpace: "pre-wrap" }}>{n.body}</div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                    {n.profiles?.email || "Unknown"} · {new Date(n.created_at).toLocaleString("en-IE")}
                                  </span>
                                  <button
                                    onClick={() => deleteNote(n.id, a.id)}
                                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, display: "flex" }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {showAccountTable && activityItems && activityItems.length > 0 && (
        <article className="gn-card" style={{ marginTop: 16 }}>
          <div className="gn-card-heading">
            <div>
              <h2>Recent activity</h2>
              <p>{activityItems.length} update{activityItems.length === 1 ? "" : "s"} across your accounts</p>
            </div>
            <button
              type="button"
              onClick={() => setActivityExpanded((v) => !v)}
              className="gn-card-link"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              {activityExpanded ? "Hide" : "Show all"}
              <ChevronDown size={13} style={{ transform: activityExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
            </button>
          </div>
          {!activityExpanded && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {activityItems[0].text} · {timeAgo(activityItems[0].timestamp)}
              {activityItems.length > 1 ? ` · +${activityItems.length - 1} more` : ""}
            </div>
          )}
          {activityExpanded && (
            <div className="wp-soft-in" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {activityItems.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                  <span>{item.text}</span>
                  <span style={{ flexShrink: 0, marginLeft: 12 }}>{timeAgo(item.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      )}

      <div style={{ marginTop: 48, paddingTop: 18, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "center", gap: 18 }}>
        <span style={{ fontSize: 11.5, color: "var(--muted)", opacity: 0.7 }}>GnóRate</span>
        <Link href="/help" style={{ fontSize: 11.5, color: "var(--muted)", opacity: 0.7, textDecoration: "none" }}>Help</Link>
        <Link href="/legal/terms" style={{ fontSize: 11.5, color: "var(--muted)", opacity: 0.7, textDecoration: "none" }}>Terms</Link>
        <Link href="/legal/privacy-policy" style={{ fontSize: 11.5, color: "var(--muted)", opacity: 0.7, textDecoration: "none" }}>Privacy</Link>
      </div>

      {showForm && (
        <AccountForm
          initial={editing}
          existingLocations={[...new Set(accounts.map((a) => a.location).filter(Boolean))]}
          existingAccounts={accounts}
          onSave={saveAccount}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {uploadingFor && (
        <UploadReading
          accountId={uploadingFor === "new" ? null : uploadingFor}
          companyId={uploadingFor !== "new" ? accounts.find((a) => a.id === uploadingFor)?.company_id || companyId : companyId}
          accounts={accounts}
          onCancel={() => setUploadingFor(null)}
          onDone={(savedAccountIds) => {
            setUploadingFor(null);
            const ids = Array.isArray(savedAccountIds) ? savedAccountIds : [savedAccountIds];
            setReadingsByAccount((prev) => {
              const next = { ...prev };
              ids.forEach((id) => delete next[id]);
              return next;
            });
            loadAccounts();
            loadReadingSummaries();
          }}
        />
      )}

      {addingReadingFor && (
        <ManualReadingForm
          onCancel={() => setAddingReadingFor(null)}
          onSave={(form) => saveManualReading(addingReadingFor, form)}
        />
      )}

      {showBenchmarks && (
        <BenchmarksBoard
          companyId={companyId}
          onClose={() => {
            setShowBenchmarks(false);
            loadBenchmarks();
          }}
        />
      )}

      {rateReviewFor && <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:1000, display:"grid", placeItems:"center", padding:20 }} onClick={() => !rateReviewSaving && setRateReviewFor(null)}><div style={{ width:"min(520px,100%)", background:"var(--panel)", border:"1px solid var(--border-light)", borderRadius:14, padding:22, boxShadow:"0 24px 70px rgba(0,0,0,.28)" }} onClick={(e)=>e.stopPropagation()}><div style={{fontSize:11,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"var(--amber)",marginBottom:7}}>Rate change detected</div><h2 style={{margin:"0 0 8px",fontSize:21}}>Confirm the latest unit rate</h2><p style={{margin:"0 0 16px",color:"var(--muted)",fontSize:13,lineHeight:1.55}}>The latest saved bill for <strong style={{color:"var(--text)"}}>{rateReviewFor.name}</strong> changed from <strong>{rateReviewFor.rateChange?.from}c</strong> to <strong>{rateReviewFor.rateChange?.to}c/kWh</strong>. Check the original bill, then choose how GnóRate should treat it.</p><label style={{display:"block",fontSize:12,fontWeight:700,marginBottom:6}}>Correct rate, if the detected figure is wrong</label><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><input type="number" step="0.01" min="0" value={rateCorrection} onChange={(e)=>setRateCorrection(e.target.value)} style={{flex:1,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:7,padding:"10px 11px",color:"var(--text)",fontSize:16}}/><span style={{fontSize:12,color:"var(--muted)"}}>c/kWh</span></div><div style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",fontSize:11.5,color:"var(--muted)",lineHeight:1.5,marginBottom:16}}>Confirm updates the trusted account rate to the detected bill rate. Correct updates both the bill record and account rate. Dismiss records that you reviewed the alert but leaves the account rate unchanged. Every choice is added to activity history.</div><div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}><button disabled={rateReviewSaving} onClick={()=>reviewDetectedRate(rateReviewFor,"dismissed")} style={{padding:"8px 11px",border:"1px solid var(--border)",borderRadius:7,background:"none",color:"var(--muted)",cursor:"pointer"}}>Dismiss alert</button><button disabled={rateReviewSaving} onClick={()=>reviewDetectedRate(rateReviewFor,"corrected")} style={{padding:"8px 11px",border:"1px solid var(--border-light)",borderRadius:7,background:"var(--bg)",color:"var(--text)",fontWeight:700,cursor:"pointer"}}>Save correction</button><button disabled={rateReviewSaving} onClick={()=>reviewDetectedRate(rateReviewFor,"confirmed")} style={{padding:"8px 12px",border:0,borderRadius:7,background:"var(--teal)",color:"white",fontWeight:800,cursor:"pointer"}}>{rateReviewSaving?"Saving…":"Confirm detected rate"}</button></div></div></div>}

      {showOverview && (
        <CompanyOverview accounts={accounts} readingSummaries={readingSummaries} onClose={() => setShowOverview(false)} />
      )}

      {showImport && (
        <ImportAccounts
          companyId={companyId}
          existingAccounts={accounts}
          onCancel={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            loadAccounts();
          }}
        />
      )}

      {bulkEditOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 65, padding: 20 }}
          onClick={() => setBulkEditOpen(false)}
        >
          <div
            style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 420, maxWidth: "100%", padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>
              Bulk edit {selectedIds.size} account{selectedIds.size === 1 ? "" : "s"}
            </h2>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
              Only fields you fill in get applied — leave the rest blank to keep each account's existing value.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
                Location
                <input
                  style={inputStyle}
                  value={bulkEditForm.location}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Bishop Street"
                  list="bulk-location-suggestions"
                />
                <datalist id="bulk-location-suggestions">
                  {[...new Set(accounts.map((a) => a.location).filter(Boolean))].map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </label>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
                Contract end date
                <input
                  type="date"
                  style={inputStyle}
                  value={bulkEditForm.contract_end}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, contract_end: e.target.value }))}
                />
              </label>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
                Provider
                <input
                  style={inputStyle}
                  value={bulkEditForm.provider}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, provider: e.target.value }))}
                  placeholder="e.g. Electric Ireland"
                />
              </label>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
                Renewal stage
                <select
                  style={inputStyle}
                  value={bulkEditForm.renewal_status}
                  onChange={(e) => setBulkEditForm((f) => ({ ...f, renewal_status: e.target.value }))}
                >
                  <option value="">Don't change</option>
                  <option value="not_started">Not started</option>
                  <option value="quote_requested">Quote requested</option>
                  <option value="switching">Switching</option>
                  <option value="renewed">Renewed</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setBulkEditOpen(false)}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={saveBulkEdit}
                disabled={bulkEditSaving}
                style={{ background: "var(--teal)", border: "none", color: "#ffffff", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                {bulkEditSaving ? "Saving…" : `Apply to ${selectedIds.size} account${selectedIds.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickRenewFor && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 65, padding: 20 }}
          onClick={() => setQuickRenewFor(null)}
        >
          <div
            style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 380, maxWidth: "100%", padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>Just renewed?</h2>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
              Three quick fields — full details can wait for the next bill.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
                New contract end date *
                <input
                  type="date"
                  style={inputStyle}
                  value={quickRenewForm.contract_end}
                  onChange={(e) => setQuickRenewForm((f) => ({ ...f, contract_end: e.target.value }))}
                />
              </label>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
                New rate (c/kWh)
                <input
                  type="number"
                  step="0.01"
                  style={inputStyle}
                  value={quickRenewForm.rate}
                  onChange={(e) => setQuickRenewForm((f) => ({ ...f, rate: e.target.value }))}
                />
              </label>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
                Provider
                <input
                  style={inputStyle}
                  value={quickRenewForm.provider}
                  onChange={(e) => setQuickRenewForm((f) => ({ ...f, provider: e.target.value }))}
                />
              </label>
              {quickRenewForm.rate && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--muted)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={quickRenewForm.share_rate_with_wattpryce || false}
                    onChange={(e) => setQuickRenewForm((f) => ({ ...f, share_rate_with_wattpryce: e.target.checked }))}
                  />
                  Share this rate with GnóRate to help other customers (reviewed before it's ever shown to anyone)
                </label>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setQuickRenewFor(null)}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={() => saveQuickRenew(quickRenewFor)}
                style={{ background: "var(--teal)", border: "none", color: "#ffffff", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}