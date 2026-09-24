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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#dce6df" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#b87412"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fill)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 600, color: "#16342b", lineHeight: 1 }}>62</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#71847b", letterSpacing: 1 }}>DAYS LEFT</span>
      </div>
    </div>
  );
}

export function HeroCard() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #cbd9d0",
        borderLeft: "3px solid #b87412",
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
        <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontSize: 15, color: "#16342b", marginBottom: 6 }}>
          Warehouse 2 — Cork
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#ffffff", background: "#b87412", display: "inline-flex", borderRadius: 5, padding: "3px 8px", marginBottom: 9 }}>
          Renewing soon
        </div>
        <div style={{ fontSize: 12, color: "#71847b", marginBottom: 4 }}>Energia · 24.9c/kWh</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#278453", fontSize: 12 }}>
          <TrendingDown size={12} />
          Save ~€410/yr by switching
        </div>
      </div>
    </div>
  );
}