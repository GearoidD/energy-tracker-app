"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FirstMarketScanButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function runScan() {
    setRunning(true);
    setMessage("Calling the same daily market scan used by Vercel Cron…");
    try {
      const response = await fetch("/api/cron/market-intelligence", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = [body.error, body.detail, body.stop_reason && `stop reason: ${body.stop_reason}`, body.request_id && `request: ${body.request_id}`].filter(Boolean).join(" · ");
        setMessage(details || `Market scan failed (${response.status}).`);
        return;
      }
      setMessage(body.skipped ? "Today's market snapshot already exists. Refreshing…" : `Market snapshot created for ${body.snapshot_date || "today"}. Refreshing…`);
      router.refresh();
    } catch (error) {
      setMessage(error?.message || "Could not run the market scan.");
    } finally {
      setRunning(false);
    }
  }

  return <div style={{marginTop:16}}>
    <button type="button" onClick={runScan} disabled={running} style={{border:0,borderRadius:10,padding:"10px 14px",fontWeight:800,cursor:running?"wait":"pointer",background:"var(--teal)",color:"white",opacity:running?.7:1}}>
      {running ? "Running first market scan…" : "Run first market scan"}
    </button>
    {message && <div style={{fontSize:12,color:"var(--muted)",marginTop:8,maxWidth:760,lineHeight:1.5}}>{message}</div>}
  </div>;
}
