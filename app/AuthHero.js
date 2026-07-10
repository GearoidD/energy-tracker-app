"use client";

import { useState, useEffect } from "react";
import { TrendingDown } from "lucide-react";

export function HeroGauge() {
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setFill(0.62), 200);
    return () => clearTimeout(t);
  }, []);

  const size = 140;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#24403F" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E8A33D"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fill)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 600, color: "#EDF3F1", lineHeight: 1 }}>62</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8FA6A3", letterSpacing: 1 }}>DAYS LEFT</span>
      </div>
    </div>
  );
}

export function HeroCard() {
  return (
    <div
      style={{
        background: "#142A2E",
        border: "1px solid #2E4C4A",
        borderLeft: "3px solid #E8A33D",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        width: 360,
        maxWidth: "100%",
        boxShadow: "0 24px 60px -20px rgba(0,0,0,0.5)",
      }}
    >
      <HeroGauge />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: "#EDF3F1", marginBottom: 6 }}>
          Warehouse 2 — Cork
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#0E1A1D", background: "#E8A33D", display: "inline-flex", borderRadius: 5, padding: "3px 8px", marginBottom: 9 }}>
          Renewing soon
        </div>
        <div style={{ fontSize: 12, color: "#8FA6A3", marginBottom: 4 }}>Energia · 24.9c/kWh</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#4C9A6A", fontSize: 12 }}>
          <TrendingDown size={12} />
          Save ~€410/yr by switching
        </div>
      </div>
    </div>
  );
}