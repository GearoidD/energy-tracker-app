"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Sparkles } from "lucide-react";
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

export default function RateReviewQueue() {
  const supabase = createClient();
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState({});
  const [selectedSupplier, setSelectedSupplier] = useState({});

  const load = useCallback(async () => {
    const [queueRes, suppliersRes] = await Promise.all([
      supabase.from("rate_scan_queue").select("*, suppliers(name)").eq("status", "pending").order("scanned_at", { ascending: false }),
      supabase.from("suppliers").select("*").order("name"),
    ]);
    const loadedItems = queueRes.data || [];
    setItems(loadedItems);
    setSuppliers(suppliersRes.data || []);
    // Pre-select any supplier already known from the original submission
    setSelectedSupplier((prev) => {
      const next = { ...prev };
      loadedItems.forEach((item) => {
        if (item.supplier_id && next[item.id] === undefined) next[item.id] = item.supplier_id;
      });
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async (item) => {
    const finalRate = editingRate[item.id] !== undefined ? editingRate[item.id] : item.rate;
    const supplierId = selectedSupplier[item.id] || null;

    // Does a master rate already exist for this exact fuel type + tier? Update it; otherwise create it.
    const { data: existing } = await supabase
      .from("master_rates")
      .select("id")
      .eq("fuel_type", item.fuel_type)
      .eq("tariff_tier", item.tariff_tier)
      .is("min_usage", null)
      .maybeSingle();

    const payload = {
      fuel_type: item.fuel_type,
      tariff_tier: item.tariff_tier,
      rate: finalRate,
      capacity_charge: item.capacity_charge,
      supplier_id: supplierId,
      note: item.source_note?.includes("Submitted by a customer")
        ? `Confirmed by admin — ${item.source_note}`
        : `AI-scanned, confirmed by admin — ${item.source_note || ""}`.trim(),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("master_rates").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("master_rates").insert(payload);
    }

    await supabase.from("rate_scan_queue").update({ status: "confirmed" }).eq("id", item.id);
    load();
  };

  const dismiss = async (item) => {
    await supabase.from("rate_scan_queue").update({ status: "dismissed" }).eq("id", item.id);
    load();
  };

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Sparkles size={16} color="var(--teal)" />
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>
          Rate review queue
        </h2>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
        AI-scanned, unconfirmed — nothing here is live until you confirm it. Adjust the rate if you have a better figure
        before confirming.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => (
          <div key={item.id} style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
                  {item.fuel_type === "gas" ? "Gas" : "Electricity"} · {item.tariff_tier}
                  {item.suppliers?.name && <span style={{ color: "var(--teal)" }}> · {item.suppliers.name}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {item.source_note?.includes("Submitted by a customer") ? "Customer submission" : "AI-scanned"} ·{" "}
                  {new Date(item.scanned_at).toLocaleDateString("en-IE")}
                  {item.capacity_charge ? ` · capacity charge €${item.capacity_charge}/kVA/yr` : ""}
                </div>
              </div>
              <div style={{ width: 100 }}>
                <input
                  type="number"
                  step="0.01"
                  style={inputStyle}
                  value={editingRate[item.id] !== undefined ? editingRate[item.id] : item.rate ?? ""}
                  onChange={(e) => setEditingRate((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
              </div>
            </div>
            {item.source_note && (
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, fontStyle: "italic" }}>{item.source_note}</p>
            )}
            <label style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              Which supplier is this rate with? (optional, but helps customers trust it)
              <select
                style={inputStyle}
                value={selectedSupplier[item.id] || ""}
                onChange={(e) => setSelectedSupplier((prev) => ({ ...prev, [item.id]: e.target.value }))}
              >
                <option value="">Not specified</option>
                {suppliers
                  .filter((s) => s.fuel_types.includes(item.fuel_type))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => confirm(item)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--teal)", border: "none", color: "#06201d", padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12.5 }}
              >
                <Check size={13} /> Confirm as verified
              </button>
              <button
                onClick={() => dismiss(item)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12.5 }}
              >
                <X size={13} /> Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
