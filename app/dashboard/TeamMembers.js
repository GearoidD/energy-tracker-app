"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Shield, User as UserIcon, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function TeamMembers({ companyId, currentUserId, isAdmin, onClose }) {
  const supabase = createClient();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("company_members")
      .select("id, user_id, role, profiles(email)")
      .eq("company_id", companyId);
    if (error) setError(error.message);
    else setMembers(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRole = async (member) => {
    const newRole = member.role === "admin" ? "member" : "admin";
    const { error } = await supabase.from("company_members").update({ role: newRole }).eq("id", member.id);
    if (error) {
      alert("Couldn't update role: " + error.message);
      return;
    }
    load();
  };

  const removeMember = async (member) => {
    if (member.user_id === currentUserId) {
      alert("You can't remove yourself. Ask another admin to do it, or delete the company entirely if you're the only one.");
      return;
    }
    const confirmed = window.confirm(`Remove ${member.profiles?.email || "this person"} from the team?`);
    if (!confirmed) return;
    const { error } = await supabase.from("company_members").delete().eq("id", member.id);
    if (error) {
      alert("Couldn't remove: " + error.message);
      return;
    }
    load();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 480, maxWidth: "100%", maxHeight: "80vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, margin: 0 }}>Team</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <X size={22} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>
          {isAdmin ? "As an admin, you can promote, demote, or remove people here." : "Only admins can change roles or remove people."}
        </p>

        {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {m.role === "admin" ? <Shield size={15} color="var(--teal)" /> : <UserIcon size={15} color="var(--muted)" />}
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>
                      {m.profiles?.email || "Unknown"}
                      {m.user_id === currentUserId && <span style={{ color: "var(--muted)" }}> (you)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: m.role === "admin" ? "var(--teal)" : "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      {m.role}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => toggleRole(m)}
                      style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}
                    >
                      {m.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    <button
                      onClick={() => removeMember(m)}
                      style={{ background: "none", border: "1px solid var(--border)", color: "var(--red)", borderRadius: 6, padding: "6px 8px", cursor: "pointer" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}