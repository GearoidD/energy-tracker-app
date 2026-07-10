"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Mail, Phone } from "lucide-react";
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

function emptyForm() {
  return {
    name: "",
    electricity: true,
    gas: false,
    contact_email: "",
    contact_phone: "",
    accepts_email_quotes: false,
    notes: "",
  };
}

export default function SuppliersBoard() {
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("suppliers").select("*").order("name");
    if (error) setError(error.message);
    else setSuppliers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startEdit = (s) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      electricity: s.fuel_types.includes("electricity"),
      gas: s.fuel_types.includes("gas"),
      contact_email: s.contact_email || "",
      contact_phone: s.contact_phone || "",
      accepts_email_quotes: s.accepts_email_quotes,
      notes: s.notes || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim()) {
      alert("Supplier name is required.");
      return;
    }
    const fuel_types = [form.electricity && "electricity", form.gas && "gas"].filter(Boolean);
    if (fuel_types.length === 0) {
      alert("Pick at least one fuel type.");
      return;
    }
    const payload = {
      name: form.name,
      fuel_types,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      accepts_email_quotes: form.accepts_email_quotes,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    };

    const query = editingId ? supabase.from("suppliers").update(payload).eq("id", editingId) : supabase.from("suppliers").insert(payload);

    const { error } = await query;
    if (error) {
      setError(error.message);
      return;
    }
    cancelEdit();
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this supplier?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) {
      alert("Couldn't delete: " + error.message);
      return;
    }
    load();
  };

  return (
    <div style={{ maxWidth: 900, margin: "48px auto 0" }}>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Suppliers</h2>
      <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 24 }}>
        Presaved contact details used by the "Request a quote" button on every account. If a supplier doesn't take quotes by
        email, leave "Accepts email quotes" off — the app will show their phone number instead of guessing at an email.
      </p>

      {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
            Supplier name
            <input style={inputStyle} value={form.name} onChange={set("name")} placeholder="e.g. Energia" />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingBottom: 8 }}>
            <label style={{ fontSize: 12.5, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={form.electricity} onChange={(e) => setForm((f) => ({ ...f, electricity: e.target.checked }))} />
              Electricity
            </label>
            <label style={{ fontSize: 12.5, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={form.gas} onChange={(e) => setForm((f) => ({ ...f, gas: e.target.checked }))} />
              Gas
            </label>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
            Contact email (leave blank if none)
            <input style={inputStyle} value={form.contact_email} onChange={set("contact_email")} placeholder="e.g. businesssales@..." />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5 }}>
            Contact phone
            <input style={inputStyle} value={form.contact_phone} onChange={set("contact_phone")} placeholder="e.g. 1800 30 50 70" />
          </label>
        </div>
        <label style={{ fontSize: 12.5, color: "var(--text)", display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={form.accepts_email_quotes}
            onChange={(e) => setForm((f) => ({ ...f, accepts_email_quotes: e.target.checked }))}
          />
          Accepts quote requests by email (uncheck if they only take quotes by phone/form)
        </label>
        <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
          Notes (optional)
          <input style={inputStyle} value={form.notes} onChange={set("notes")} placeholder="e.g. Ask for the SME sales team" />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={save}
            style={{ background: "var(--teal)", border: "none", color: "#06201d", padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            {editingId ? "Save changes" : "Add supplier"}
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

      {loading ? (
        <div style={{ color: "var(--muted)" }}>Loading…</div>
      ) : suppliers.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No suppliers yet — add one above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suppliers.map((s) => (
            <div
              key={s.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px" }}
            >
              <div>
                <div style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 600 }}>
                  {s.name} <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>({s.fuel_types.join(" & ")})</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", gap: 12, marginTop: 3 }}>
                  {s.accepts_email_quotes && s.contact_email ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--teal)" }}>
                      <Mail size={11} /> {s.contact_email}
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Phone size={11} /> {s.contact_phone || "no phone saved"} · email quotes not accepted
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => startEdit(s)}
                  style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(s.id)}
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