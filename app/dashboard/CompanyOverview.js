"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from "recharts";

const RANGE_OPTIONS = [
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "12 months", months: 12 },
  { label: "All time", months: null },
];

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IE", { month: "short", year: "2-digit" });
}

export default function CompanyOverview({ accounts, readingSummaries, onClose }) {
  const [rangeMonths, setRangeMonths] = useState(6);
  const [metric, setMetric] = useState("cost"); // cost or usage

  const cutoff = useMemo(() => {
    if (!rangeMonths) return null;
    const d = new Date();
    d.setMonth(d.getMonth() - rangeMonths);
    return d;
  }, [rangeMonths]);

  const allReadings = useMemo(() => {
    const list = [];
    accounts.forEach((a) => {
      (readingSummaries[a.id] || []).forEach((r) => {
        if (!r.reading_date) return;
        if (cutoff && new Date(r.reading_date) < cutoff) return;
        list.push({ ...r, accountName: a.name });
      });
    });
    return list;
  }, [accounts, readingSummaries, cutoff]);

  const monthly = useMemo(() => {
    const map = {};
    allReadings.forEach((r) => {
      const key = monthKey(r.reading_date);
      if (!map[key]) map[key] = { key, cost: 0, usage: 0 };
      const usage = Number(r.usage) || 0;
      const rate = Number(r.rate) || 0;
      const standing = Number(r.standing_charge) || 0;
      map[key].usage += usage;
      map[key].cost += r.total_cost !== null && r.total_cost !== undefined ? Number(r.total_cost) : (rate / 100) * usage + (standing / 100) * 30;
    });
    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ ...m, label: monthLabel(m.key), cost: Math.round(m.cost), usage: Math.round(m.usage) }));
  }, [allReadings]);

  const totals = useMemo(() => {
    const totalCost = monthly.reduce((s, m) => s + m.cost, 0);
    const totalUsage = monthly.reduce((s, m) => s + m.usage, 0);
    return { totalCost, totalUsage, accountCount: accounts.length };
  }, [monthly, accounts]);

  const byAccount = useMemo(() => {
    const map = {};
    allReadings.forEach((r) => {
      if (!map[r.accountName]) map[r.accountName] = 0;
      const usage = Number(r.usage) || 0;
      const rate = Number(r.rate) || 0;
      map[r.accountName] += (rate / 100) * usage;
    });
    return Object.entries(map)
      .map(([name, cost]) => ({ name, cost: Math.round(cost) }))
      .sort((a, b) => b.cost - a.cost);
  }, [allReadings]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 700, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, margin: 0 }}>Company overview</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={22} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setRangeMonths(opt.months)}
              style={{
                background: rangeMonths === opt.months ? "var(--teal)" : "none",
                color: rangeMonths === opt.months ? "#06201d" : "var(--muted)",
                border: `1px solid ${rangeMonths === opt.months ? "var(--teal)" : "var(--border)"}`,
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600 }}>{totals.accountCount}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Accounts</div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600 }}>€{totals.totalCost.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Estimated spend, this range</div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600 }}>{totals.totalUsage.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Total kWh, this range</div>
          </div>
        </div>

        {monthly.length < 2 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: "20px 0", textAlign: "center", border: "1px dashed var(--border)", borderRadius: 10, marginBottom: 20 }}>
            Add more dated readings across your accounts to see a spend trend here.
          </div>
        ) : (
          <>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
            {[
              { key: "cost", label: "Cost (€)" },
              { key: "usage", label: "Usage (kWh)" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                style={{
                  background: metric === m.key ? "var(--teal)" : "none",
                  color: metric === m.key ? "#06201d" : "var(--muted)",
                  border: `1px solid ${metric === m.key ? "var(--teal)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ width: "100%", height: 280, marginBottom: 24 }}>
            <ResponsiveContainer>
              <LineChart data={monthly} margin={{ top: 24, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="#24403F" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#B8C7C4" }} tickLine={false} axisLine={{ stroke: "#24403F" }} />
                <YAxis
                  tick={{ fontSize: 12, fill: "#B8C7C4" }}
                  width={64}
                  tickLine={false}
                  axisLine={{ stroke: "#24403F" }}
                  label={{ value: metric === "cost" ? "€" : "kWh", angle: -90, position: "insideLeft", fontSize: 12, fill: "#8FA6A3" }}
                />
                <Tooltip
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--border-light)", fontSize: 13, borderRadius: 8 }}
                  labelStyle={{ color: "var(--text)", fontWeight: 600 }}
                  formatter={(v) => [metric === "cost" ? `€${v.toLocaleString()}` : `${v.toLocaleString()} kWh`, metric === "cost" ? "Estimated cost" : "Usage"]}
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  name={metric === "cost" ? "Estimated cost" : "Usage"}
                  stroke={metric === "cost" ? "#2FA79A" : "#E8A33D"}
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 0, fill: metric === "cost" ? "#2FA79A" : "#E8A33D" }}
                  activeDot={{ r: 6 }}
                >
                  <LabelList
                    dataKey={metric}
                    position="top"
                    formatter={(v) => (metric === "cost" ? `€${v.toLocaleString()}` : v.toLocaleString())}
                    style={{ fontSize: 12, fill: "#EDF3F1", fontWeight: 600 }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
          </>
        )}

        <div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, fontWeight: 600 }}>Spend by account, this range</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {byAccount.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>No data in this range yet.</div>
            ) : (
              byAccount.map((a) => (
                <div key={a.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text)", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{a.name}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>€{a.cost.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 16 }}>
          Costs are estimated from usage × rate (plus a rough standing-charge allowance) recorded in each bill — not exact invoiced totals.
        </p>
      </div>
    </div>
  );
}
