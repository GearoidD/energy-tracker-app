"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarketScanTestButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(null);

  async function runScan() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/run-market-scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const cronData = data.received_from_cron || {};
        const keyInfo = cronData.key_length_only !== undefined ? `\nKey length seen: ${cronData.key_length_only}` : "";
        const rawInfo = cronData.anthropic_raw ? `\n\nRaw Anthropic response:\n${JSON.stringify(cronData.anthropic_raw, null, 2)}` : "";
        const fullDump = `\n\nFull admin response:\n${JSON.stringify(data, null, 2)}`;
        setMessage({
          ok: false,
          text: `[${data.version || "NO VERSION"}] ${data.error || cronData.error || "Couldn't run the scan."}${keyInfo}${rawInfo}${fullDump}`,
        });
        return;
      }
      const cronData = data.received_from_cron || {};
      setMessage({
        ok: true,
        text: cronData.skipped ? cronData.reason : `Snapshot saved for ${cronData.snapshot_date}.`,
      });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={runScan}
        disabled={running}
        style={{
          border: "none",
          borderRadius: 8,
          padding: "9px 16px",
          fontWeight: 600,
          fontSize: 13,
          cursor: running ? "wait" : "pointer",
          background: "var(--teal)",
          color: "#ffffff",
          opacity: running ? 0.7 : 1,
        }}
      >
        {running ? "Running…" : "Refresh market data now"}
      </button>
      {message && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: message.ok ? "var(--teal)" : "var(--red)", whiteSpace: "pre-wrap", fontFamily: message.ok ? "inherit" : "monospace" }}>
          {message.text}
        </div>
      )}
    </div>
  );
}