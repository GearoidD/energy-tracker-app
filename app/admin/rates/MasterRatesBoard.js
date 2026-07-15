"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Zap, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const GAS_TIERS = ["SBU", "MBU", "FVT"];
const ELEC_TIERS = ["DG1", "DG2", "DG3", "DG4", "DG5", "DG6", "DG7", "DG8", "DG9", "DG10"];

function emptyForm() {
  return {
    fuel_type: "electricity",
    tariff_tier: "DG5",
    min_usage: "",
    max_usage: "",
    rate: "",
    standing_charge: "",
    capacity_charge: "",
    note: "",
    supplier_id: "",
  };
}

export default function MasterRatesBoard() {
  const supabase = createClient();
  const [rates, setRates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("master_rates").select("*, suppliers(name)").order("fuel_type").order("tariff_tier");
    if (error) setError(error.message);
    else setRates(data || []);
    setLoading(false);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data || []);
  }, []);

  useEffect(() => {
    load();
    loadSuppliers();
  }, [load, loadSuppliers]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startEdit = (r) => {
    setEditingId(r.id);
    setForm({
      fuel_type: r.fuel_type,
      tariff_tier: r.tariff_tier || "",
      min_usage: r.min_usage ?? "",
      max_usage: r.max_usage ?? "",
      rate: r.rate ?? "",
      standing_charge: r.standing_charge ?? "",
      capacity_charge: r.capacity_charge ?? "",
      note: r.note || "",
      supplier_id: r.supplier_id || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async () => {
    setError(null);
    if (!form.rate) {
      alert("Rate is required.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      fuel_type: form.fuel_type,
      tariff_tier: form.tariff_tier || null,
      min_usage: form.min_usage || null,
      max_usage: form.max_usage || null,
      rate: form.rate,
      standing_charge: form.standing_charge || null,
      capacity_charge: form.capacity_charge || null,
      note: form.note || null,
      supplier_id: form.supplier_id || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    const query = editingId ? supabase.from("master_rates").update(payload).eq("id", editingId) : supabase.from("master_rates").insert(payload);

    const { error } = await query;
    if (error) {
      setError(error.message);
      return;
    }
    cancelEdit();
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this rate? Anyone currently matched to it will lose their comparison until it's replaced.")) return;
    const { error } = await supabase.from("master_rates").delete().eq("id", id);
    if (error) {
      alert("Couldn't delete: " + error.message);
      return;
    }
    load();
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>
          Master rates
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 12 }}>
          These feed into every customer's market comparison automatically — labeled "Wattpryce verified" — ahead of the AI
          estimate. Keep the date current; a stale rate is worse than an honest AI estimate.
        </p>

        <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", marginBottom: 24, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>How matching actually works:</strong> every customer's account is
          automatically classified — gas accounts by usage and SPC into <strong style={{ color: "var(--text)" }}>SBU / MBU / FVT</strong>,
          electricity accounts by their real <strong style={{ color: "var(--text)" }}>DG Group</strong> (DG1–DG10, read straight off
          the bill — most SMEs are DG5 or DG6). DG Group is what actually determines which rate structure applies, not MIC — MIC
          is just the number used to calculate the capacity charge within whichever DG plan an account is on. Set a{" "}
          <strong style={{ color: "var(--text)" }}>Tariff tier</strong> below and this rate applies to every matching account
          automatically — no manual linking needed. Only use <strong style={{ color: "var(--text)" }}>Min/Max usage</strong> instead
          if you want a plain usage-band fallback with no tier logic. A tier match always takes priority over a usage-band match.
          <br />
          <br />
          Example: adding a <strong style={{ color: "var(--text)" }}>Electricity / DG6</strong> rate instantly applies to every
          electricity account across every customer currently classified as DG6 — you don't pick which ones.
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

        {/* Form */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 10, padding: 20, marginBottom: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
              Fuel type
              <select
                style={inputStyle}
                value={form.fuel_type}
                onChange={(e) => setForm((f) => ({ ...f, fuel_type: e.target.value, tariff_tier: e.target.value === "gas" ? "SBU" : "DG5" }))}
              >
                <option value="electricity">Electricity</option>
                <option value="gas">Gas</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
              Tariff tier
              <select style={inputStyle} value={form.tariff_tier} onChange={set("tariff_tier")}>
                <option value="">None (use usage band below)</option>
                {(form.fuel_type === "gas" ? GAS_TIERS : ELEC_TIERS).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
              Min usage (kWh, optional)
              <input style={inputStyle} type="number" value={form.min_usage} onChange={set("min_usage")} />
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
              Max usage (kWh, optional)
              <input style={inputStyle} type="number" value={form.max_usage} onChange={set("max_usage")} />
            </label>
          </div>

          <div style={{ background: "var(--panel2, var(--bg))", border: "1px dashed var(--border-light)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--teal)", marginBottom: 12 }}>
            This rate will apply to: {form.tariff_tier
              ? `every ${form.fuel_type} account classified as ${form.tariff_tier}`
              : form.min_usage || form.max_usage
              ? `every ${form.fuel_type} account using between ${form.min_usage || "0"} and ${form.max_usage || "∞"} kWh/yr with no tariff tier set`
              : "nothing yet — set a tariff tier or a usage range above"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
              Rate (c/kWh) *
              <input style={inputStyle} type="number" step="0.01" value={form.rate} onChange={set("rate")} />
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
              Standing charge (c/day)
              <input style={inputStyle} type="number" step="0.01" value={form.standing_charge} onChange={set("standing_charge")} />
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
              Capacity charge (MIC/MBU)
              <input style={inputStyle} type="number" step="0.01" value={form.capacity_charge} onChange={set("capacity_charge")} />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
            Supplier
            <select style={inputStyle} value={form.supplier_id} onChange={set("supplier_id")}>
              <option value="">None / not from a specific supplier</option>
              {suppliers
                .filter((s) => s.fuel_types.includes(form.fuel_type))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
            Note (source, date obtained — shown to customers)
            <input style={inputStyle} value={form.note} onChange={set("note")} placeholder="e.g. Direct quote, 10 Jul 2026" />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={save}
              style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              {editingId ? "Save changes" : "Add rate"}
            </button>
            {editingId && (
              <button
                onClick={cancelEdit}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ color: "var(--muted)" }}>Loading…</div>
        ) : rates.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No master rates yet — add one above.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rates.map((r) => (
              <div
                key={r.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {r.fuel_type === "gas" ? <Flame size={14} color="var(--amber)" /> : <Zap size={14} color="var(--teal)" />}
                  <div>
                    <div style={{ fontSize: 13.5, color: "var(--text)" }}>
                      {r.tariff_tier ? `${r.tariff_tier} · ` : ""}
                      {r.rate}c/kWh
                      {r.capacity_charge ? ` · ${r.capacity_charge}/kVA` : ""}
                      {!r.tariff_tier && (r.min_usage || r.max_usage) ? ` · ${r.min_usage || 0}–${r.max_usage || "∞"} kWh` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {r.suppliers?.name ? `${r.suppliers.name} · ` : ""}
                      {r.note ? `${r.note} · ` : ""}
                      Updated {new Date(r.updated_at).toLocaleDateString("en-IE")}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => startEdit(r)}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--red)", borderRadius: 6, padding: "6px 8px", cursor: "pointer" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
  );
}
