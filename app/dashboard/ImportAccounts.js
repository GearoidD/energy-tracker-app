"use client";

import { useState } from "react";
import Papa from "papaparse";
import { X, Upload, AlertTriangle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const FIELD_ALIASES = {
  name: ["name", "site", "site name", "account name"],
  account_number: ["account_number", "mprn", "gprn", "mprn/gprn", "meter number", "meter point"],
  fuel_type: ["fuel_type", "fuel", "type"],
  provider: ["provider", "supplier"],
  rate: ["rate", "unit rate", "rate (c/kwh)", "rate c/kwh"],
  standing_charge: ["standing_charge", "standing charge"],
  usage: ["usage", "annual usage", "usage (kwh)"],
  contract_end: ["contract_end", "contract end", "renewal date", "end date", "contract end date"],
  mic_kva: ["mic_kva", "mic"],
  spc_kwh: ["spc_kwh", "spc"],
};

function normalizeHeader(header) {
  const clean = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(clean)) return field;
  }
  return null;
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const field = normalizeHeader(key);
    if (field && value !== undefined && value !== null && String(value).trim() !== "") {
      out[field] = String(value).trim();
    }
  }
  if (out.fuel_type) {
    out.fuel_type = out.fuel_type.toLowerCase().includes("gas") ? "gas" : "electricity";
  }
  return out;
}

export default function ImportAccounts({ companyId, existingAccounts = [], onCancel, onDone }) {
  const supabase = createClient();
  const [stage, setStage] = useState("pick"); // pick, preview, importing, done
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleFile = (file) => {
    setError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          setError("Couldn't find any rows in that file.");
          return;
        }
        const normalized = results.data.map(normalizeRow);
        const existingNumbers = new Set(existingAccounts.map((a) => a.account_number).filter(Boolean));
        const seenInFile = new Set();

        const checked = normalized.map((row) => {
          const issues = [];
          if (!row.name) issues.push("Missing site name");
          if (!row.account_number) issues.push("Missing MPRN/GPRN");
          else if (existingNumbers.has(row.account_number)) issues.push("Already exists in your accounts");
          else if (seenInFile.has(row.account_number)) issues.push("Duplicate within this file");
          if (row.account_number) seenInFile.add(row.account_number);
          return { ...row, issues };
        });

        setRows(checked);
        setStage("preview");
      },
      error: (err) => setError(err.message),
    });
  };

  const validRows = rows.filter((r) => r.issues.length === 0);
  const invalidRows = rows.filter((r) => r.issues.length > 0);

  const runImport = async () => {
    setStage("importing");
    const payload = validRows.map((r) => ({
      company_id: companyId,
      name: r.name,
      account_number: r.account_number,
      fuel_type: r.fuel_type || "electricity",
      provider: r.provider || null,
      rate: r.rate || null,
      standing_charge: r.standing_charge || null,
      usage: r.usage || null,
      contract_end: r.contract_end || null,
      mic_kva: r.mic_kva || null,
      spc_kwh: r.spc_kwh || null,
    }));

    const { data, error } = await supabase.from("accounts").insert(payload).select();

    if (error) {
      setError(error.message);
      setStage("preview");
      return;
    }

    setResult({ created: data.length });
    setStage("done");
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}
      onClick={stage === "importing" ? undefined : onCancel}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 640, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Import accounts</h2>
          {stage !== "importing" && (
            <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
              <X size={20} />
            </button>
          )}
        </div>

        {stage === "pick" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Upload a CSV with your existing accounts. Useful columns: site name, MPRN/GPRN, fuel type, provider, rate,
              usage, contract end date, MIC, SPC — only site name and MPRN/GPRN are required, everything else is optional.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
              style={{ display: "none" }}
              id="csv-input"
            />
            <label
              htmlFor="csv-input"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                border: "1px dashed var(--border-light)",
                borderRadius: 10,
                padding: "32px 20px",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              <Upload size={22} color="var(--teal)" />
              <span style={{ fontSize: 13 }}>Choose a CSV file</span>
            </label>
            {error && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--red)", fontSize: 13, marginTop: 12 }}>
                <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                {error}
              </div>
            )}
          </div>
        )}

        {stage === "preview" && (
          <div>
            <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
              <span style={{ color: "var(--green)" }}>
                <Check size={13} style={{ display: "inline", marginRight: 4 }} />
                {validRows.length} ready to import
              </span>
              {invalidRows.length > 0 && (
                <span style={{ color: "var(--amber)" }}>
                  <AlertTriangle size={13} style={{ display: "inline", marginRight: 4 }} />
                  {invalidRows.length} will be skipped
                </span>
              )}
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              {rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
                    background: r.issues.length > 0 ? "var(--bg)" : "none",
                  }}
                >
                  <div style={{ fontSize: 12.5, color: "var(--text)" }}>
                    {r.name || <span style={{ color: "var(--muted)" }}>(no name)</span>}
                    {r.account_number ? ` · ${r.account_number}` : ""}
                  </div>
                  {r.issues.length > 0 ? (
                    <span style={{ fontSize: 11, color: "var(--amber)" }}>{r.issues.join(", ")}</span>
                  ) : (
                    <Check size={13} color="var(--green)" />
                  )}
                </div>
              ))}
            </div>

            {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                Cancel
              </button>
              <button
                onClick={runImport}
                disabled={validRows.length === 0}
                style={{
                  background: validRows.length === 0 ? "var(--border)" : "var(--teal)",
                  border: "none",
                  color: "#06201d",
                  padding: "9px 18px",
                  borderRadius: 6,
                  cursor: validRows.length === 0 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Import {validRows.length} account{validRows.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        {stage === "importing" && (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)", fontSize: 13 }}>Importing…</div>
        )}

        {stage === "done" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)", fontSize: 14, marginBottom: 18 }}>
              <Check size={18} />
              {result.created} account{result.created === 1 ? "" : "s"} imported successfully.
            </div>
            <button
              onClick={onDone}
              style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
