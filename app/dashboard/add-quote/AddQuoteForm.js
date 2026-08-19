"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddQuoteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/quotes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteText: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setResult(data);
        setText("");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the full quote email here, including any tables or rate breakdowns..."
        rows={14}
        style={{
          width: "100%",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 14,
          color: "var(--text)",
          fontSize: 16,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          marginBottom: 14,
        }}
      />

      <button
        onClick={submit}
        disabled={loading || text.trim().length < 20}
        style={{
          background: "var(--teal)",
          border: "none",
          color: "#06201d",
          padding: "10px 20px",
          borderRadius: 8,
          cursor: loading || text.trim().length < 20 ? "default" : "pointer",
          fontWeight: 600,
          fontSize: 13.5,
          opacity: text.trim().length < 20 ? 0.6 : 1,
        }}
      >
        {loading ? "Reading quote…" : "Extract rates"}
      </button>

      {error && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--panel)", border: "1px solid var(--red)", borderRadius: 8, color: "var(--red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16, padding: "16px 18px", background: "var(--panel)", border: "1px solid var(--green)", borderRadius: 8 }}>
          <p style={{ color: "var(--green)", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
            ✓ Added {result.added} verified rate{result.added === 1 ? "" : "s"} — now used across every comparison
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.rates.map((r, i) => (
              <div key={i} style={{ fontSize: 12.5, color: "var(--text)", borderTop: i > 0 ? "1px solid var(--border)" : "none", paddingTop: i > 0 ? 8 : 0 }}>
                <strong>{r.provider}</strong> — {r.fuel_type}
                {r.tariff_band ? ` (${r.tariff_band})` : ""} — {r.unit_rate_cents}c/kWh, {r.standing_charge_cents}c/day standing
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ marginTop: 14, background: "none", border: "1px solid var(--border-light)", color: "var(--teal)", padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}
          >
            Back to dashboard →
          </button>
        </div>
      )}
    </div>
  );
}