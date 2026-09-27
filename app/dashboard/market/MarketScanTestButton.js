"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarketScanTestButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  async function runScan() {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/market-intelligence/test", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({
          ok: false,
          message: [body.error, body.detail, body.stop_reason && `stop reason: ${body.stop_reason}`, body.request_id && `request: ${body.request_id}`].filter(Boolean).join(" · ") || `Scan failed (${response.status}).`,
          diagnostic: body.diagnostic || null,
        });
        return;
      }
      setResult({ ok: true, message: body.skipped ? (body.reason || "Today's snapshot already exists.") : `Market snapshot saved for ${body.snapshot_date || "today"}.`, diagnostic: body.diagnostic || null });
      router.refresh();
    } catch (error) {
      setResult({ ok: false, message: error?.message || "Unable to run the market scan." });
    } finally {
      setRunning(false);
    }
  }

  return <div style={{marginTop:16}}>
    <button type="button" onClick={runScan} disabled={running} style={{border:0,borderRadius:10,padding:"11px 16px",fontWeight:800,cursor:running?"wait":"pointer",background:"var(--teal)",color:"white",opacity:running?.7:1}}>
      {running ? "Running live market scan…" : "Run Market Intelligence"}
    </button>
    {result && <div style={{marginTop:10,fontSize:12,lineHeight:1.5,color:result.ok?"var(--teal)":"#b42318",maxWidth:760}}>
      <div>{result.message}</div>
      {result.diagnostic && <div style={{marginTop:8,color:"var(--muted)"}}>
        Key detected: {result.diagnostic.detected ? "Yes" : "No"} · Prefix valid: {result.diagnostic.valid_prefix ? "Yes" : "No"} · Length: {result.diagnostic.length ?? "—"} · Whitespace trimmed: {result.diagnostic.whitespace_trimmed ? "Yes" : "No"} · Model: {result.diagnostic.model || "—"} · Endpoint: {result.diagnostic.endpoint || "—"}<br/>SHA-256 fingerprint: <span style={{fontFamily:"monospace",wordBreak:"break-all"}}>{result.diagnostic.sha256 || "—"}</span>
      </div>}
    </div>}
  </div>;
}
