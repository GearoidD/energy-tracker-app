"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  color: "var(--text)",
  fontSize: 14,
  outline: "none",
};

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function BenchmarkForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || {
      fuel_type: "electricity",
      usage_min: "",
      usage_max: "",
      typical_rate: "",
      typical_standing_charge: "",
      source_note: "",
    }
  );
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}
      onClick={onCancel}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 460, maxWidth: "100%", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
            {initial ? "Edit benchmark" : "Add a market rate benchmark"}
          </h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
          Enter what you believe a typical rate looks like right now for a usage band — from a quote you got, a comparison site, or CRU/Ofgem published figures. This isn't a live feed; update it whenever you get new information.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Fuel type">
            <select style={inputStyle} value={form.fuel_type} onChange={set("fuel_type")}>
              <option value="electricity">Electricity</option>
              <option value="gas">Gas</option>
            </select>
          </Field>
          <div />
          <Field label="Usage band: from (kWh/yr)">
            <input type="number" style={inputStyle} value={form.usage_min} onChange={set("usage_min")} placeholder="e.g. 0" />
          </Field>
          <Field label="Usage band: to (kWh/yr)">
            <input type="number" style={inputStyle} value={form.usage_max} onChange={set("usage_max")} placeholder="leave blank for no upper limit" />
          </Field>
          <Field label="Typical rate (c/kWh)">
            <input type="number" step="0.01" style={inputStyle} value={form.typical_rate} onChange={set("typical_rate")} placeholder="e.g. 21.5" />
          </Field>
          <Field label="Typical standing charge (c/day)">
            <input type="number" step="0.01" style={inputStyle} value={form.typical_standing_charge} onChange={set("typical_standing_charge")} placeholder="Optional" />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Source / note">
              <input style={inputStyle} value={form.source_note} onChange={set("source_note")} placeholder="e.g. Quote from Energia, July 2026" />
            </Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!form.typical_rate) return;
              onSave(form);
            }}
            style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            {initial ? "Save changes" : "Add benchmark"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BenchmarksBoard({ companyId, onClose }) {
  const supabase = createClient();
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("benchmarks")
      .select("*")
      .eq("company_id", companyId)
      .order("fuel_type")
      .order("usage_min");
    if (error) setError(error.message);
    else setBenchmarks(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (form) => {
    const payload = {
      company_id: companyId,
      fuel_type: form.fuel_type,
      usage_min: form.usage_min || 0,
      usage_max: form.usage_max || null,
      typical_rate: form.typical_rate,
      typical_standing_charge: form.typical_standing_charge || null,
      source_note: form.source_note || null,
      updated_at: new Date().toISOString(),
    };
    let res;
    if (form.id) {
      res = await supabase.from("benchmarks").update(payload).eq("id", form.id);
    } else {
      res = await supabase.from("benchmarks").insert(payload);
    }
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setShowForm(false);
    setEditing(null);
    load();
  };

  const remove = async (id) => {
    const confirmed = window.confirm("Delete this benchmark?");
    if (!confirmed) return;
    const { error } = await supabase.from("benchmarks").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 620, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, margin: 0 }}>Market rate benchmarks</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={22} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>
          These aren't live quotes — they're figures your team enters from wherever you trust (a broker call, a comparison site, a quote you received). Accounts without a manual market rate will be estimated against the matching band here.
        </p>

        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, marginBottom: 16 }}
        >
          <Plus size={16} /> Add benchmark
        </button>

        {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        ) : benchmarks.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0" }}>
            No benchmarks yet. Add one to start seeing automatic market comparisons on accounts without a manual quote.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {benchmarks.map((b) => (
              <div key={b.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {b.fuel_type === "gas" ? "Gas" : "Electricity"} · {b.usage_min || 0}–{b.usage_max || "∞"} kWh/yr
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                    {b.typical_rate}c/kWh{b.typical_standing_charge ? ` · ${b.typical_standing_charge}c/day standing` : ""}
                    {b.source_note ? ` · ${b.source_note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setEditing(b); setShowForm(true); }} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: 6, color: "var(--muted)", cursor: "pointer" }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => remove(b.id)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: 6, color: "var(--muted)", cursor: "pointer" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <BenchmarkForm
          initial={editing}
          onSave={save}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
