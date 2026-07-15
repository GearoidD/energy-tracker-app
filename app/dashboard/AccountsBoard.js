"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X, AlertTriangle, Zap, Flame, TrendingDown, Search, Trash2, Pencil, Upload, ChevronDown, ChevronUp, LineChart as LineChartIcon, Download, MoreHorizontal, BarChart3, Loader2, Mail } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";
import { createClient } from "@/lib/supabase/client";
import UploadReading from "./UploadReading";
import ImportAccounts from "./ImportAccounts";
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
  switching: { label: "Switching", color: "var(--teal)" },
  renewed: { label: "Renewed", color: "var(--green)" },
};

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "€" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function exportAccountsCSV(accounts) {
  const headers = [
    "Site name",
    "Provider",
    "MPRN/GPRN",
    "Fuel type",
    "Contract end date",
    "Annual usage (kWh)",
    "Current rate (c/kWh)",
    "Standing charge (c/day)",
    "Market/quoted rate (c/kWh)",
    "Notes",
  ];

  const escapeCell = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = accounts.map((a) =>
    [
      a.name,
      a.provider,
      a.account_number,
      a.fuel_type,
      a.contract_end,
      a.usage,
      a.rate,
      a.standing_charge,
      a.market_rate,
      a.notes,
    ]
      .map(escapeCell)
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wattpryce-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

function overallStatusFor(a) {
  const renewalStatus = a.renewal_status || "not_started";
  const beingHandled = renewalStatus === "quote_requested" || renewalStatus === "switching";

  if ((a.status === "overdue" || a.status === "urgent") && !beingHandled) {
    return { label: "Action needed", color: "var(--red)" };
  }
  if (beingHandled) {
    return { label: RENEWAL_STATUS_META[renewalStatus].label, color: "var(--teal)" };
  }
  if (a.confidence.missingBill) {
    return { label: "Missing bill", color: "var(--amber)" };
  }
  if (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD) {
    return { label: "Rate jumped", color: "var(--amber)" };
  }
  if (a.status === "soon") {
    return { label: "Renewing soon", color: "var(--amber)" };
  }
  if (a.confidence.score < 50) {
    return { label: "Needs review", color: "var(--amber)" };
  }
  return { label: "On track", color: "var(--green)" };
}

function severityRank(a) {
  const label = overallStatusFor(a).label;
  if (label === "Action needed") return 0;
  if (label === "Missing bill") return 1;
  if (label === "Rate jumped") return 2;
  if (label === "Renewing soon") return 3;
  if (label === "Needs review") return 4;
  if (label === "On track") return 6;
  return 5; // being-handled: Quote requested / Switching
}

function masterRateFor(acc, masterRates) {
  const fuel = acc.fuel_type || "electricity";
  const candidates = masterRates.filter((r) => r.fuel_type === fuel);
  if (candidates.length === 0) return null;

  const tier = fuel === "gas" ? gasTariffFor(acc) : acc.mic_kva ? "MIC" : "standard";
  const tierMatch = candidates.find((r) => r.tariff_tier === tier);
  if (tierMatch) return tierMatch;

  const usage = parseFloat(acc.usage);
  if (isNaN(usage)) return null;
  return (
    candidates.find(
      (r) => !r.tariff_tier && usage >= (r.min_usage || 0) && (r.max_usage === null || r.max_usage === undefined || usage <= r.max_usage)
    ) || null
  );
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
    return {
      rate: parseFloat(master.rate),
      source: "verified",
      note: master.note,
      supplierName: master.suppliers?.name,
      updatedAt: master.updated_at,
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
  const rated = (readings || []).filter((r) => r.usage != null && r.rate != null && r.reading_date);

  if (rated.length === 0) {
    // No bill history yet — fall back to whatever was entered directly on the account,
    // rather than showing €0 next to a non-zero savings figure, which is actively misleading.
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

  const totalEnergyCost = sorted.reduce((sum, r) => sum + (parseFloat(r.rate) / 100) * parseFloat(r.usage), 0);
  const scaleFactor = 365 / daySpan;

  const standing = parseFloat(acc.standing_charge) || 0;
  const annualStanding = (standing / 100) * 365;

  return totalEnergyCost * scaleFactor + annualStanding;
}

function annualSaving(acc) {
  const rate = parseFloat(acc.rate);
  const market = parseFloat(acc.market_rate);
  const usage = parseFloat(acc.usage);
  if (isNaN(rate) || isNaN(market) || isNaN(usage)) return null;
  return ((rate - market) / 100) * usage;
}

function RateSparkline({ readings }) {
  const rated = [...(readings || [])]
    .filter((r) => r.rate !== null && r.rate !== undefined && r.reading_date)
    .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date))
    .slice(-6);

  const width = 56;
  const height = 40;

  if (rated.length < 2) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 8.5, color: "var(--muted)", textAlign: "center" }}>no trend yet</span>
      </div>
    );
  }

  const rates = rated.map((r) => Number(r.rate));
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 1;

  const coords = rates.map((r, i) => ({
    x: (i / (rates.length - 1)) * (width - 6) + 3,
    y: height - 5 - ((r - min) / range) * (height - 10),
  }));

  const trendUp = rates[rates.length - 1] > rates[0];
  const color = trendUp ? "#E8A33D" : "#2FA79A";
  const last = coords[coords.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
      <svg width={width} height={height}>
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r={2.5} fill={color} />
      </svg>
      <span style={{ fontSize: 8.5, color: "var(--muted)" }}>rate {trendUp ? "↑" : "↓"}</span>
    </div>
  );
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
  fontSize: 14,
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

function AccountForm({ initial, onSave, onCancel }) {
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
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
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
          <Field label="Provider">
            <input style={inputStyle} value={form.provider || ""} onChange={set("provider")} placeholder="e.g. Energia" />
          </Field>
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
              setFormError(null);
              onSave(form);
            }}
            style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
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
          <CartesianGrid stroke="#24403F" strokeDasharray="3 3" />
          <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: "#8FA6A3" }} />
          <YAxis
            yAxisId="usage"
            tick={{ fontSize: 10, fill: "#8FA6A3" }}
            width={44}
            label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 10, fill: "#8FA6A3" }}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tick={{ fontSize: 10, fill: "#8FA6A3" }}
            width={44}
            label={{ value: "c/kWh", angle: 90, position: "insideRight", fontSize: 10, fill: "#8FA6A3" }}
          />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border-light)", fontSize: 12 }}
            labelStyle={{ color: "var(--text)" }}
            formatter={(value, name) => [name === "Usage (kWh)" ? `${value} kWh` : `${value}c/kWh`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#8FA6A3" }} />
          {marketRate && (
            <ReferenceLine
              yAxisId="rate"
              y={marketRate}
              stroke="#8FA6A3"
              strokeDasharray="4 4"
              label={{ value: "Market rate", fontSize: 9, fill: "#8FA6A3", position: "insideTopRight" }}
            />
          )}
          <Line yAxisId="usage" type="monotone" dataKey="usage" name="Usage (kWh)" stroke="#2FA79A" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line yAxisId="rate" type="monotone" dataKey="rate" name="Rate (c/kWh)" stroke="#E8A33D" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ManualReadingForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ reading_date: "", usage: "", rate: "", standing_charge: "" });
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
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Add a reading</h2>
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
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
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
    return { verdict: "unknown", label: "No comparison yet", detail: "Pull a market rate or add a quote to get a recommendation.", color: "var(--muted)" };
  }
  const saving = a.saving;
  const strongSource = a.comparison.source === "verified" || a.comparison.source === "quoted";

  if (saving === null) {
    return { verdict: "unknown", label: "Not enough data", detail: "Add your current rate and usage to get a recommendation.", color: "var(--muted)" };
  }
  if (saving <= 20) {
    return { verdict: "stay", label: "Stay put", detail: "Your current rate already looks competitive — switching wouldn't meaningfully help.", color: "var(--green)" };
  }
  if (saving <= 100) {
    return {
      verdict: "marginal",
      label: "Marginal — your call",
      detail: `Switching could save ~${fmtMoney(saving)}/yr, but that's a small gain${strongSource ? "" : ", and this is only an estimate"}.`,
      color: "var(--amber)",
    };
  }
  return {
    verdict: "switch",
    label: strongSource ? "Worth switching" : "Likely worth switching",
    detail: `Switching could save ~${fmtMoney(saving)}/yr${strongSource ? "" : " — based on an estimate, worth confirming with a real quote before you commit"}.`,
    color: "var(--teal)",
  };
}

function providerNegotiationMailto(acc, providerEmail, comparison) {
  const fuel = (acc.fuel_type || "electricity") === "gas" ? "gas" : "electricity";
  const subject = `Renewal check-in — ${acc.name}${acc.account_number ? ` (${acc.account_number})` : ""}`;

  const lines = [
    "Hi,",
    "",
    `Ahead of my ${fuel} contract renewal, I wanted to check in on the account below:`,
    "",
    `Site: ${acc.name}`,
    acc.account_number ? `${fuel === "gas" ? "GPRN" : "MPRN"}: ${acc.account_number}` : null,
    acc.rate ? `Current rate: ${acc.rate}c/kWh` : null,
    acc.contract_end ? `Contract end date: ${acc.contract_end}` : null,
    "",
    comparison && comparison.rate < acc.rate
      ? `I've seen current market rates around ${comparison.rate}c/kWh for a similar account. Could you match or improve on this ahead of my renewal?`
      : "Could you let me know what rate you can offer for the upcoming renewal period?",
    "",
    "Thanks,",
  ].filter(Boolean);

  return `mailto:${providerEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function bulkQuoteRequestMailto(accs, supplierEmail) {
  const subject = `Rate quote request — ${accs.length} account${accs.length === 1 ? "" : "s"}`;

  const lines = [
    "Hi,",
    "",
    `I'd like current business rate quotes for the following ${accs.length} account${accs.length === 1 ? "" : "s"}:`,
    "",
  ];

  accs.forEach((acc, i) => {
    const fuel = (acc.fuel_type || "electricity") === "gas" ? "gas" : "electricity";
    const tariff = gasTariffFor(acc);
    lines.push(`${i + 1}. ${acc.name}`);
    if (acc.account_number) lines.push(`   ${fuel === "gas" ? "GPRN" : "MPRN"}: ${acc.account_number}`);
    if (acc.provider) lines.push(`   Current supplier: ${acc.provider}`);
    if (acc.rate) lines.push(`   Current rate: ${acc.rate}c/kWh`);
    if (acc.usage) lines.push(`   Annual usage: ${acc.usage} kWh`);
    if (fuel === "gas" && tariff) lines.push(`   Tariff tier: ${tariff}`);
    if (fuel === "gas" && acc.spc_kwh) lines.push(`   Supply Point Capacity: ${acc.spc_kwh} kWh`);
    if (fuel !== "gas" && acc.mic_kva) lines.push(`   MIC: ${acc.mic_kva} kVA`);
    if (acc.contract_end) lines.push(`   Contract end date: ${acc.contract_end}`);
    lines.push("");
  });

  lines.push("Could you send over your best current rates for these accounts?", "", "Thanks,");

  return `mailto:${supplierEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function quoteRequestMailto(acc, supplierEmail) {
  const fuel = (acc.fuel_type || "electricity") === "gas" ? "gas" : "electricity";
  const tariff = gasTariffFor(acc);

  const subject = `Rate quote request — ${acc.name}${acc.account_number ? ` (${acc.account_number})` : ""}`;

  const lines = [
    "Hi,",
    "",
    `I'd like a current business ${fuel} rate quote for the following account:`,
    "",
    `Site: ${acc.name}`,
    acc.account_number ? `${fuel === "gas" ? "GPRN" : "MPRN"}: ${acc.account_number}` : null,
    acc.provider ? `Current supplier: ${acc.provider}` : null,
    acc.rate ? `Current rate: ${acc.rate}c/kWh` : null,
    acc.usage ? `Annual usage: ${acc.usage} kWh` : null,
    fuel === "gas" && tariff ? `Tariff tier: ${tariff}` : null,
    fuel === "gas" && acc.spc_kwh ? `Supply Point Capacity: ${acc.spc_kwh} kWh` : null,
    fuel !== "gas" && acc.mic_kva ? `MIC: ${acc.mic_kva} kVA` : null,
    acc.contract_end ? `Current contract end date: ${acc.contract_end}` : null,
    "",
    "Could you send over your best current rate for this account?",
    "",
    "Thanks,",
  ].filter(Boolean);

  return `mailto:${supplierEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

export default function AccountsBoard({ companyId }) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterFuel, setFilterFuel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRenewal, setFilterRenewal] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkQuotePickerOpen, setBulkQuotePickerOpen] = useState(false);
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
  const [quickRenewFor, setQuickRenewFor] = useState(null);
  const [quickRenewForm, setQuickRenewForm] = useState({ rate: "", provider: "", contract_end: "" });
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [ratePullFor, setRatePullFor] = useState(null);
  const [ratePullLoading, setRatePullLoading] = useState(false);
  const [ratePullResult, setRatePullResult] = useState(null);
  const [ratePullError, setRatePullError] = useState(null);

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

  const loadReadingSummaries = useCallback(async () => {
    const { data } = await supabase
      .from("readings")
      .select("account_id, reading_date, rate, usage, standing_charge, confidence, created_at")
      .eq("company_id", companyId)
      .order("reading_date", { ascending: false, nullsFirst: false });
    const grouped = {};
    (data || []).forEach((r) => {
      if (!grouped[r.account_id]) grouped[r.account_id] = [];
      grouped[r.account_id].push(r);
    });
    setReadingSummaries(grouped);
  }, [companyId]);

  useEffect(() => {
    loadReadingSummaries();
  }, [loadReadingSummaries]);

  const loadBenchmarks = useCallback(async () => {
    const { data } = await supabase.from("benchmarks").select("*").eq("company_id", companyId);
    setBenchmarks(data || []);
  }, [companyId]);

  const loadMasterRates = useCallback(async () => {
    const { data } = await supabase.from("master_rates").select("*, suppliers(name)");
    setMasterRates(data || []);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data || []);
  }, []);

  useEffect(() => {
    loadBenchmarks();
    loadMasterRates();
    loadSuppliers();
  }, [loadBenchmarks, loadMasterRates, loadSuppliers]);

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
    setQuickRenewForm({ rate: account.rate || "", provider: account.provider || "", contract_end: "" });
  };

  useEffect(() => {
    const renewId = searchParams.get("renew");
    if (renewId && accounts.length > 0) {
      const match = accounts.find((a) => a.id === renewId);
      if (match) openQuickRenew(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, searchParams]);

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
    const { error } = await supabase.from("account_notes").insert({
      account_id: accountId,
      company_id: companyId,
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
    const { error } = await supabase.from("readings").insert({
      account_id: accountId,
      company_id: companyId,
      reading_date: form.reading_date || null,
      usage: form.usage || null,
      rate: form.rate || null,
      standing_charge: form.standing_charge || null,
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

  const loadAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("contract_end", { ascending: true, nullsFirst: false });
    if (error) setError(error.message);
    else setAccounts(data || []);
    setLoading(false);
  }, [companyId]);

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
      provider: form.provider || null,
      account_number: form.account_number || null,
      fuel_type: form.fuel_type || "electricity",
      contract_end: form.contract_end || null,
      rate: form.rate || null,
      standing_charge: form.standing_charge || null,
      usage: form.usage || null,
      market_rate: form.market_rate || null,
      notes: form.notes || null,
      mic_kva: form.mic_kva || null,
      spc_kwh: form.spc_kwh || null,
      company_id: companyId,
      updated_at: new Date().toISOString(),
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
    setShowForm(false);
    setEditing(null);
    loadAccounts();
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

  const enriched = useMemo(() => {
    return accounts
      .map((a) => {
        const daysLeft = daysUntil(a.contract_end);
        const status = statusOf(daysLeft);
        const comparison = marketComparisonFor(a, benchmarks, masterRates);
        const usageNum = parseFloat(a.usage);
        const rateNum = parseFloat(a.rate);
        const saving =
          comparison && !isNaN(usageNum) && !isNaN(rateNum)
            ? ((rateNum - comparison.rate) / 100) * usageNum
            : null;
        const confidence = accountConfidence(a, readingSummaries[a.id]?.[0]);

        const ratedReadings = (readingSummaries[a.id] || []).filter((r) => r.rate !== null && r.rate !== undefined);
        let rateChange = null;
        if (ratedReadings.length >= 2) {
          const [newest, prev] = ratedReadings;
          if (prev.rate) {
            const pct = ((newest.rate - prev.rate) / prev.rate) * 100;
            rateChange = { pct, from: prev.rate, to: newest.rate, fromDate: prev.reading_date, toDate: newest.reading_date };
          }
        }

        return { ...a, daysLeft, status, saving, cost: estimatedAnnualSpend(a, readingSummaries[a.id]), comparison, confidence, rateChange };
      })
      .filter((a) => {
        const q = search.toLowerCase();
        const matchesSearch = !q || a.name.toLowerCase().includes(q) || (a.provider || "").toLowerCase().includes(q);
        const matchesFuel = filterFuel === "all" || (a.fuel_type || "electricity") === filterFuel;
        const matchesStatus = filterStatus === "all" || overallStatusFor(a).label === filterStatus;
        const matchesRenewal = filterRenewal === "all" || (a.renewal_status || "not_started") === filterRenewal;
        return matchesSearch && matchesFuel && matchesStatus && matchesRenewal;
      })
      .sort((a, b) => {
        const rankDiff = severityRank(a) - severityRank(b);
        if (rankDiff !== 0) return rankDiff;
        return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
      });
  }, [accounts, search, filterFuel, filterStatus, filterRenewal, benchmarks, masterRates, readingSummaries]);

  const summaryStats = useMemo(() => {
    const needAttention = enriched.filter((a) => {
      const c = overallStatusFor(a).color;
      return c === "var(--red)" || c === "var(--amber)";
    }).length;

    const renewingSoon90 = enriched.filter((a) => a.daysLeft !== null && a.daysLeft >= 0 && a.daysLeft <= 90).length;

    const potentialSavings = enriched.reduce((sum, a) => (a.saving && a.saving > 20 ? sum + a.saving : sum), 0);
    const totalSpend = enriched.reduce((sum, a) => (a.cost ? sum + a.cost : sum), 0);
    const hasAnyComparison = enriched.some((a) => a.comparison);
    const hasAnyCost = enriched.some((a) => a.cost !== null && a.cost !== undefined);

    return {
      total: enriched.length,
      needAttention,
      renewingSoon90,
      potentialSavings,
      totalSpend,
      hasAnyComparison,
      hasAnyCost,
    };
  }, [enriched]);

  const attentionItems = useMemo(() => {
    const items = [];
    enriched.forEach((a) => {
      const status = a.renewal_status || "not_started";
      const beingHandled = status === "quote_requested" || status === "switching";
      const statusSuffix = beingHandled ? ` — ${RENEWAL_STATUS_META[status].label}` : "";

      if (a.status === "overdue") {
        items.push({ id: `${a.id}-overdue`, account: a, severity: beingHandled ? 1.5 : 0, color: beingHandled ? "var(--teal)" : "var(--red)", message: `${a.name}: out of contract — likely on penalty rates${statusSuffix}` });
      } else if (a.status === "urgent") {
        items.push({ id: `${a.id}-urgent`, account: a, severity: beingHandled ? 1.5 : 1, color: beingHandled ? "var(--teal)" : "var(--red)", message: `${a.name}: renews in ${a.daysLeft} day(s)${statusSuffix}` });
      }
      if (a.confidence.missingBill) {
        items.push({
          id: `${a.id}-missing`,
          account: a,
          severity: 2,
          color: "var(--amber)",
          message: `${a.name}: ${a.confidence.daysSinceLastReading ? `no bill added in ${a.confidence.daysSinceLastReading} days` : "no bills added yet"}`,
        });
      }
      const latest = readingSummaries[a.id]?.[0];
      if (latest?.confidence === "low") {
        items.push({ id: `${a.id}-lowconf`, account: a, severity: 3, color: "var(--amber)", message: `${a.name}: last upload was low-confidence — worth checking` });
      }
      if (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD) {
        items.push({
          id: `${a.id}-ratejump`,
          account: a,
          severity: 1.8,
          color: "var(--amber)",
          message: `${a.name}: rate jumped ${a.rateChange.pct.toFixed(1)}% since last bill (${a.rateChange.from}c → ${a.rateChange.to}c)`,
        });
      }
    });
    return items.sort((x, y) => x.severity - y.severity);
  }, [enriched, readingSummaries]);

  const jumpToAccount = async (account) => {
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

  if (loading) {
    return <div style={{ color: "var(--muted)", padding: 40 }}>Loading accounts…</div>;
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 640px) {
          .wp-summary-grid { flex-wrap: wrap !important; row-gap: 16px !important; }
          .wp-summary-grid > div { border-left: none !important; padding-left: 0 !important; padding-right: 24px !important; width: 45% !important; }
          .wp-row-collapsed { flex-wrap: wrap !important; }
        }
      ` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, margin: 0 }}>Accounts</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Everyone on your team sees this same list.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
          <button
            onClick={() => setUploadingFor("new")}
            style={{ background: "none", border: "1px solid var(--border-light)", color: "var(--text)", padding: "10px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            <Upload size={16} /> Upload a bill
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "10px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            <Plus size={16} /> Add account
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowMoreMenu((v) => !v)}
              style={{ background: "none", border: "1px solid var(--border-light)", color: "var(--muted)", padding: "10px 12px", borderRadius: 8, display: "flex", alignItems: "center", cursor: "pointer" }}
            >
              <MoreHorizontal size={18} />
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
                  { icon: BarChart3, label: "Overview", onClick: () => setShowOverview(true) },
                  { icon: Upload, label: "Import accounts", onClick: () => setShowImport(true) },
                  { icon: Download, label: "Export CSV", onClick: () => exportAccountsCSV(accounts) },
                  { icon: LineChartIcon, label: "Market rates", onClick: () => setShowBenchmarks(true) },
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

      <div
        style={{
          borderLeft: `3px solid ${attentionItems.length === 0 ? "var(--green)" : "var(--amber)"}`,
          padding: "4px 0 4px 16px",
          marginBottom: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: attentionItems.length === 0 ? 0 : 8 }}>
          <AlertTriangle size={15} color={attentionItems.length === 0 ? "var(--green)" : "var(--amber)"} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5, fontWeight: 600 }}>
            {attentionItems.length === 0 ? "Nothing needs attention right now" : `${attentionItems.length} thing${attentionItems.length === 1 ? "" : "s"} need attention`}
          </span>
        </div>
        {attentionItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {attentionItems.slice(0, 8).map((item) => (
              <button
                key={item.id}
                onClick={() => jumpToAccount(item.account)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12.5,
                  color: "var(--muted)",
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                {item.message}
              </button>
            ))}
            {attentionItems.length > 8 && (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>+ {attentionItems.length - 8} more</span>
            )}
          </div>
        )}
      </div>

      <div
        className="wp-summary-grid"
        style={{ display: "flex", gap: 0, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}
      >
        <div style={{ padding: "0 24px 0 0" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 600, color: "var(--text)" }}>{summaryStats.total}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Accounts tracked</div>
        </div>
        <div style={{ padding: "0 24px", borderLeft: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 600, color: summaryStats.renewingSoon90 > 0 ? "var(--amber)" : "var(--text)" }}>{summaryStats.renewingSoon90}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Renewing within 90 days</div>
        </div>
        <div style={{ padding: "0 24px", borderLeft: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 600, color: !summaryStats.hasAnyComparison ? "var(--muted)" : summaryStats.potentialSavings > 0 ? "var(--green)" : "var(--text)" }}>
            {summaryStats.hasAnyComparison ? fmtMoney(summaryStats.potentialSavings) : "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {summaryStats.hasAnyComparison ? "Potential savings/yr" : "No market comparison yet"}
          </div>
        </div>
        <div style={{ padding: "0 24px", borderLeft: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 600, color: summaryStats.hasAnyCost ? "var(--text)" : "var(--muted)" }}>
            {summaryStats.hasAnyCost ? fmtMoney(summaryStats.totalSpend) : "—"}
          </div>
          <div title="Extrapolated from the bills you've entered — the more history an account has, the more accurate this is" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, cursor: "help", textDecoration: "underline dotted" }}>
            {summaryStats.hasAnyCost ? "Est. annual spend" : "No bill data yet"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", maxWidth: 320, flex: 1, minWidth: 200 }}>
          <Search size={15} color="var(--muted)" style={{ position: "absolute", left: 10, top: 10 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search site or provider…" style={{ ...inputStyle, width: "100%", paddingLeft: 32, boxSizing: "border-box" }} />
        </div>

        <select value={filterFuel} onChange={(e) => setFilterFuel(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All fuel types</option>
          <option value="electricity">Electricity</option>
          <option value="gas">Gas</option>
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All statuses</option>
          <option value="Action needed">Action needed</option>
          <option value="Missing bill">Missing bill</option>
          <option value="Rate jumped">Rate jumped</option>
          <option value="Renewing soon">Renewing soon</option>
          <option value="Needs review">Needs review</option>
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

        {(filterFuel !== "all" || filterStatus !== "all" || filterRenewal !== "all" || search) && (
          <button
            onClick={() => {
              setFilterFuel("all");
              setFilterStatus("all");
              setFilterRenewal("all");
              setSearch("");
            }}
            style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: 12.5 }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <button
            onClick={() => setBulkQuotePickerOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", color: "var(--teal)", cursor: "pointer", fontSize: 12.5 }}
          >
            <Mail size={13} /> Email selected accounts
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
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>
              Email {selectedIds.size} account{selectedIds.size === 1 ? "" : "s"}
            </h2>
            {(() => {
              const selectedAccounts = enriched.filter((a) => selectedIds.has(a.id));
              const fuelsPresent = new Set(selectedAccounts.map((a) => a.fuel_type || "electricity"));
              const matching = suppliers.filter((s) => s.fuel_types.some((f) => fuelsPresent.has(f)));
              if (matching.length === 0) {
                return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No saved suppliers match these accounts yet. Add some in the admin rates page.</div>;
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {matching.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                      <span style={{ fontSize: 13, color: "var(--text)" }}>{s.name}</span>
                      {s.accepts_email_quotes && s.contact_email ? (
                        <a
                          href={bulkQuoteRequestMailto(selectedAccounts, s.contact_email)}
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

      {enriched.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: 12 }}>
          <Flame size={28} color="var(--teal-dim)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>
            {accounts.length === 0 ? "No accounts yet. Add your first energy account to start tracking renewals." : "No accounts match that search or filter."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {enriched.map((a) => {
            const overall = overallStatusFor(a);
            const isExpanded = expandedId === a.id;
            return (
              <div key={a.id} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderLeft: `3px solid ${overall.color}`, borderRadius: 10 }}>
                <div
                  onClick={() => toggleReadings(a.id)}
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
                  <RateSparkline readings={readingSummaries[a.id]} />
                  <span style={{ flex: 1, minWidth: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.name}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#0E1A1D",
                      background: overall.color,
                      borderRadius: 5,
                      padding: "3px 9px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {overall.label !== "On track" && <AlertTriangle size={11} />}
                    {overall.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }} title="Days until contract end date">
                    {a.daysLeft === null ? "–" : a.daysLeft < 0 ? `${Math.abs(a.daysLeft)}d overdue` : `${a.daysLeft}d to renew`}
                  </span>
                  <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setMenuForId(menuForId === a.id ? null : a.id)}
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
                          onClick={() => { setMenuForId(null); setUploadingFor(a.id); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", color: "var(--text)", cursor: "pointer", fontSize: 13 }}
                        >
                          Upload bill
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
                            borderBottom: expandedTab === t.key ? "2px solid var(--teal)" : "2px solid transparent",
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
                        title={a.confidence.reasons.join(" · ") || "All key data present and recent"}
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
                        DATA {a.confidence.score}%
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

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Renewal status:</span>
                      <select
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
                          color: RENEWAL_STATUS_META[a.renewal_status || "not_started"].color,
                          background: "var(--bg)",
                          border: `1px solid ${RENEWAL_STATUS_META[a.renewal_status || "not_started"].color}55`,
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

                    {(a.confidence.missingBill || a.status === "overdue" || (a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD)) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                        {a.confidence.missingBill && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--amber)", fontSize: 12.5 }}>
                            <AlertTriangle size={13} />
                            {a.confidence.daysSinceLastReading
                              ? `No bill added in ${a.confidence.daysSinceLastReading} days — check nothing's been missed`
                              : "No bills added yet for this account"}
                          </div>
                        )}
                        {a.rateChange && a.rateChange.pct >= RATE_JUMP_THRESHOLD && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--amber)", fontSize: 12.5 }}>
                            <AlertTriangle size={13} />
                            Rate jumped {a.rateChange.pct.toFixed(1)}% since last bill ({a.rateChange.from}c → {a.rateChange.to}c/kWh)
                          </div>
                        )}
                        {a.status === "overdue" && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--red)", fontSize: 12.5 }}>
                            <AlertTriangle size={13} />
                            Likely on out-of-contract rates — act now
                          </div>
                        )}
                      </div>
                    )}

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
                            color: a.comparison.source === "verified" ? "var(--teal)" : "var(--muted)",
                            border: `1px solid ${a.comparison.source === "verified" ? "var(--teal)" : "var(--border)"}`,
                            borderRadius: 4,
                            padding: "1px 5px",
                          }}
                        >
                          {a.comparison.source === "quoted" ? "quoted" : a.comparison.source === "verified" ? "Wattpryce verified" : "estimated"}
                        </span>
                        {a.saving !== null && a.saving > 20 && ` · switching could save ~${fmtMoney(a.saving)}/yr`}
                      </div>
                    )}
                    {a.comparison?.source === "verified" && (a.comparison.supplierName || a.comparison.note) && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                        {a.comparison.supplierName ? `${a.comparison.supplierName}` : ""}
                        {a.comparison.supplierName && a.comparison.note ? " · " : ""}
                        {a.comparison.note || ""}
                        {" · updated "}
                        {new Date(a.comparison.updatedAt).toLocaleDateString("en-IE")}
                      </div>
                    )}

                    <div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {ratePullFor !== a.id && (
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
                            a.comparison
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
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {matching.map((s) => (
                                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                                  <span style={{ color: "var(--text)" }}>{s.name}</span>
                                  {s.accepts_email_quotes && s.contact_email ? (
                                    <a
                                      href={quoteRequestMailto(a, s.contact_email)}
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
                                ? ` — this could save ~${fmtMoney(((a.rate - ratePullResult.typical_rate) / 100) * (parseFloat(a.usage) || 0))}/yr`
                                : " — you're already at or below this"}
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
                              style={{ background: "var(--teal)", border: "none", color: "#06201d", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
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
                                <span style={{ color: "var(--muted)", fontSize: 10 }}>{r.source}</span>
                                <button
                                  onClick={() => deleteReading(r.id, a.id)}
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
                              fontSize: 13,
                              outline: "none",
                              resize: "vertical",
                              fontFamily: "inherit",
                            }}
                          />
                          <button
                            onClick={() => addNote(a.id)}
                            style={{ background: "var(--teal)", border: "none", color: "#06201d", borderRadius: 6, padding: "0 16px", cursor: "pointer", fontWeight: 600, fontSize: 12.5, flexShrink: 0 }}
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
      )}

      {showForm && (
        <AccountForm
          initial={editing}
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
          companyId={companyId}
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

      {quickRenewFor && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 65, padding: 20 }}
          onClick={() => setQuickRenewFor(null)}
        >
          <div
            style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 380, maxWidth: "100%", padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>Just renewed?</h2>
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
                style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
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
