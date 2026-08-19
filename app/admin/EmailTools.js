"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

const EMAIL_TYPES = [
  { key: "test", label: "Send test email to myself" },
  { key: "reminders", label: "Send renewal reminders now" },
  { key: "missing-bills", label: "Send missing-bill nudges now" },
  { key: "report-reminder", label: "Send monthly report reminder now" },
  { key: "scan-rates", label: "Run weekly rate scan now" },
];

function formatResult(key, data) {
  if (key === "test") {
    return `✓ Test email sent to ${data.to}.`;
  }
  if (key === "scan-rates") {
    return "✓ Rate scan complete — check the review queue on Rates & suppliers for anything new.";
  }
  if (typeof data?.sent === "number") {
    if (data.sent === 0) {
      return "✓ Ran successfully — nothing was due to send right now.";
    }
    return `✓ Sent to ${data.sent} compan${data.sent === 1 ? "y" : "ies"}.`;
  }
  return "✓ Done.";
}

export default function EmailTools() {
  const [loadingKey, setLoadingKey] = useState(null);
  const [results, setResults] = useState({});

  const trigger = async (key) => {
    setLoadingKey(key);
    setResults((prev) => ({ ...prev, [key]: null }));
    try {
      const res = await fetch("/api/admin/trigger-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults((prev) => ({ ...prev, [key]: { error: data.error || "Failed" } }));
      } else {
        setResults((prev) => ({ ...prev, [key]: { success: true, data } }));
      }
    } catch (e) {
      setResults((prev) => ({ ...prev, [key]: { error: e.message } }));
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, marginBottom: 14 }}>EMAIL TOOLS</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {EMAIL_TYPES.map((t) => (
          <div key={t.key} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)" }}>
                <Mail size={14} color="var(--muted)" /> {t.label}
              </span>
              <button
                onClick={() => trigger(t.key)}
                disabled={loadingKey === t.key}
                style={{
                  background: "var(--teal)",
                  border: "none",
                  color: "#06201d",
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: loadingKey === t.key ? "default" : "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {loadingKey === t.key ? "Sending…" : "Run now"}
              </button>
            </div>
            {results[t.key]?.error && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--red)" }}>Failed: {results[t.key].error}</div>
            )}
            {results[t.key]?.success && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--green)" }}>{formatResult(t.key, results[t.key].data)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}