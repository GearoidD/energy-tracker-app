"use client";

import { useState } from "react";
import Papa from "papaparse";
import { X, Upload, AlertTriangle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { comparableMeterPoint, meterPointIssue, normalizeMeterPoint } from "@/lib/meter-points";

const FIELD_ALIASES = {
  name: ["name", "site", "site name", "account name"],
  location: ["location", "site location", "building", "premises", "address"],
  account_number: ["account_number", "mprn", "gprn", "mprn/gprn", "meter number", "meter point"],
  fuel_type: ["fuel_type", "fuel", "type"],
  provider: ["provider", "supplier"],
  supplier_account_number: ["supplier_account_number", "supplier account number", "customer number"],
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

function normalizeIrishDate(value) {
  const clean = String(value || "").trim();
  const dmy = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return clean;
}

function isValidISODate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const field = normalizeHeader(key);
    if (field && value !== undefined && value !== null && String(value).trim() !== "") {
      out[field] = String(value).trim();
      const header = key.trim().toLowerCase();
      if (field === "account_number" && header.includes("gprn") && header.includes("mprn")) out.meter_point_type = "combined";
      else if (field === "account_number" && header.includes("gprn")) out.meter_point_type = "gas";
      else if (field === "account_number" && header.includes("mprn")) out.meter_point_type = "electricity";
    }
  }
  if (out.fuel_type) {
    out.fuel_type = out.fuel_type.toLowerCase().includes("gas") ? "gas" : "electricity";
  } else if (out.meter_point_type === "gas" || out.meter_point_type === "electricity") {
    out.fuel_type = out.meter_point_type;
  } else if (out.account_number && String(out.account_number).replace(/\D/g, "").length <= 7) {
    // Generic “meter point” columns can still be classified by Irish ID length.
    out.fuel_type = "gas";
  } else {
    out.fuel_type = "electricity";
  }
  if (out.account_number) out.account_number = normalizeMeterPoint(out.account_number, out.fuel_type);
  if (out.contract_end) out.contract_end = normalizeIrishDate(out.contract_end);
  const numericFields = ["rate", "standing_charge", "usage", "mic_kva", "spc_kwh"];
  out.invalidNumericFields = [];
  numericFields.forEach((field) => {
    if (out[field] === undefined) return;
    const numericValue = String(out[field]).replace(/,/g, "").trim();
    if (/^\d+(\.\d+)?$/.test(numericValue)) out[field] = numericValue;
    else out.invalidNumericFields.push(field.replaceAll("_", " "));
  });
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
        const hasMeterPointColumn = (results.meta.fields || []).some((field) => normalizeHeader(field) === "account_number");
        if (!hasMeterPointColumn) {
          setError("I couldn’t find an MPRN/GPRN column. Add a column named MPRN, GPRN, or MPRN/GPRN and try again.");
          return;
        }
        const existingNumbers = new Set(existingAccounts.map((a) => comparableMeterPoint(normalizeMeterPoint(a.account_number, a.fuel_type))).filter(Boolean));
        const numberCounts = {};
        normalized.forEach((row) => {
          const key = comparableMeterPoint(row.account_number);
          if (key) numberCounts[key] = (numberCounts[key] || 0) + 1;
        });

        const checked = normalized.map((row) => {
          const issues = row.invalidNumericFields.map((field) => `${field} must be a number`);
          const warnings = [];
          const meterPointKey = comparableMeterPoint(row.account_number);
          if (!row.name) issues.push("Missing site name");
          if (!row.account_number) issues.push("Missing MPRN/GPRN");
          else {
            if ((row.meter_point_type === "gas" || row.meter_point_type === "electricity") && row.meter_point_type !== row.fuel_type) issues.push(`The ${row.meter_point_type === "gas" ? "GPRN" : "MPRN"} column conflicts with the fuel type`);
            const formatIssue = meterPointIssue(row.account_number, row.fuel_type);
            if (formatIssue) issues.push(formatIssue);
            if (existingNumbers.has(meterPointKey)) issues.push("Already exists in this company");
            if (numberCounts[meterPointKey] > 1) issues.push("Duplicate within this file — keep only one row");
          }
          if (!row.location) warnings.push("No location — harder to group by site");
          if (!row.provider) warnings.push("No supplier recorded");
          if (!row.contract_end) warnings.push("No contract end date — renewal tracking will be limited");
          else if (!isValidISODate(row.contract_end)) issues.push("Contract end date must be DD/MM/YYYY or YYYY-MM-DD");
          return { ...row, issues, warnings };
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
      account_number: normalizeMeterPoint(r.account_number, r.fuel_type),
      fuel_type: r.fuel_type || "electricity",
      location: r.location || null,
      provider: r.provider || null,
      supplier_account_number: r.supplier_account_number || null,
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
          <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Import accounts</h2>
          {stage !== "importing" && (
            <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
              <X size={20} />
            </button>
          )}
        </div>

        {stage === "pick" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Upload a CSV of your utility accounts. Use one row per MPRN/GPRN; if a site has electricity and gas, use two rows with the same location. MPRNs must be 11 digits starting with 10; GPRNs are 7 digits. If a spreadsheet removed a GPRN’s leading zero, it will be restored. Use a dot for decimal values; commas in whole numbers are removed. Missing location, supplier or end-date details are allowed, but clearly flagged before import.
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
            <a href="data:text/csv;charset=utf-8,Site%20name%2CLocation%2CMPRN%2FGPRN%2CFuel%20type%2CSupplier%2CSupplier%20account%20number%2CUnit%20rate%20(c%2FkWh)%2CStanding%20charge%2CAnnual%20usage%20(kWh)%2CContract%20end%20date%2CMIC%20(kVA)%2CSPC%20(kWh)%0A" download="gnorate-account-import-template.csv" style={{ display: "inline-block", marginTop: 10, color: "var(--teal)", fontSize: 12, fontWeight: 600 }}>Download a CSV template</a>
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
            <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 13, flexWrap: "wrap" }}>
              <span style={{ color: "var(--green)" }}>
                <Check size={13} style={{ display: "inline", marginRight: 4 }} />
                {validRows.length} ready to import
              </span>
              {invalidRows.length > 0 && (
                <span style={{ color: "var(--amber)" }}>
                  <AlertTriangle size={13} style={{ display: "inline", marginRight: 4 }} />
                  {invalidRows.length} need fixing or will be skipped
                </span>
              )}
              {rows.filter((row) => row.warnings?.length).length > 0 && <span style={{ color: "var(--muted)" }}>{rows.filter((row) => row.warnings?.length).length} have useful details missing</span>}
            </div>

            <p style={{ color: "var(--muted)", fontSize: 11.5, margin: "0 0 10px" }}>Rows with warnings can still be imported. Rows with errors are excluded; correct the CSV and choose it again to include them.</p>
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
                  <div style={{ minWidth: 0, fontSize: 12.5, color: "var(--text)" }}>
                    <strong>{r.name || <span style={{ color: "var(--muted)" }}>(no site name)</span>}</strong>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 11, marginTop: 2 }}>{r.account_number ? `${r.fuel_type === "gas" ? "GPRN" : "MPRN"} ${r.account_number}` : "No meter point number"}{r.location ? ` · ${r.location}` : ""}{r.provider ? ` · ${r.provider}` : ""}</span>
                    {(r.issues.length > 0 || r.warnings?.length > 0) && <span style={{ display: "block", color: r.issues.length ? "var(--amber)" : "var(--muted)", fontSize: 10.5, marginTop: 3 }}>{[...r.issues, ...(r.warnings || [])].join(" · ")}</span>}
                  </div>
                  {r.issues.length > 0 ? <AlertTriangle size={14} color="var(--amber)" style={{ flexShrink: 0 }} /> : <Check size={13} color="var(--green)" style={{ flexShrink: 0 }} />}
                </div>
              ))}
            </div>

            {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
              <button onClick={() => { setRows([]); setError(null); setStage("pick"); }} style={{ background: "none", border: "1px solid var(--border)", color: "var(--teal)", padding: "9px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                Choose a different file
              </button>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                Cancel
              </button>
              <button
                onClick={runImport}
                disabled={validRows.length === 0}
                style={{
                  background: validRows.length === 0 ? "var(--border)" : "var(--teal)",
                  border: "none",
                  color: "#ffffff",
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
              style={{ background: "var(--teal)", border: "none", color: "#ffffff", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
