"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, LogOut, ChevronDown, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CompanySetup from "./CompanySetup";

export default function Header({ email, userId, companies = [], activeCompanyId }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const switchCompany = async (companyId) => {
    setMenuOpen(false);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("profiles").update({ active_company_id: companyId }).eq("id", user.id);
    router.refresh();
  };

  const deleteCompany = async (company) => {
    const confirmed = window.confirm(
      `Delete "${company.name}"? This permanently removes all its accounts and data for every member. This can't be undone.`
    );
    if (!confirmed) return;

    const supabase = createClient();
    const { error } = await supabase.from("companies").delete().eq("id", company.id);
    if (error) {
      alert("Couldn't delete: " + error.message);
      return;
    }

    if (company.id === activeCompanyId) {
      const remaining = companies.filter((c) => c.id !== company.id);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase
        .from("profiles")
        .update({ active_company_id: remaining[0]?.id || null })
        .eq("id", user.id);
    }

    router.refresh();
  };

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={18} color="var(--teal)" />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15 }}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span>
          </span>
        </div>

        {companies.length > 0 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "var(--text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
              }}
            >
              {activeCompany?.name || "Select company"}
              <ChevronDown size={14} color="var(--muted)" />
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  background: "var(--panel)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                  minWidth: 200,
                  zIndex: 40,
                  overflow: "hidden",
                }}
              >
                {companies.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: c.id === activeCompanyId ? "var(--bg)" : "none",
                    }}
                  >
                    <button
                      onClick={() => switchCompany(c.id)}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: "9px 12px",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {c.name}
                    </button>
                    {c.role === "admin" && (
                      <button
                        onClick={() => deleteCompany(c)}
                        title="Delete company"
                        style={{
                          background: "none",
                          border: "none",
                          padding: "9px 10px",
                          color: "var(--muted)",
                          cursor: "pointer",
                          display: "flex",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowAddCompany(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    borderTop: "1px solid var(--border)",
                    padding: "9px 12px",
                    color: "var(--teal)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <Plus size={13} /> Add company
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{email}</span>
        <button
          onClick={handleLogout}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            color: "var(--muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
          }}
        >
          <LogOut size={13} /> Log out
        </button>
      </div>

      {showAddCompany && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,12,14,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 20,
          }}
          onClick={() => setShowAddCompany(false)}
        >
          <div
            style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, padding: 24, width: 460, maxWidth: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <CompanySetup onDone={() => setShowAddCompany(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
