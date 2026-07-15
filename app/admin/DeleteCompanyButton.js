"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteCompanyButton({ companyId, companyName }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/admin/delete-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }
    router.refresh();
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{ background: "none", border: "1px solid var(--border)", color: "var(--red)", borderRadius: 6, padding: "5px 8px", cursor: "pointer" }}
      >
        <Trash2 size={13} />
      </button>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,12,14,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }}
      onClick={() => setConfirming(false)}
    >
      <div
        style={{ background: "var(--panel)", border: "1px solid var(--border-light)", borderRadius: 12, width: 420, maxWidth: "100%", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 600, margin: "0 0 8px", color: "var(--red)" }}>
          Delete {companyName}?
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          This permanently deletes this company and every account, bill, note, and team member in it. This cannot be
          undone. Type the company name exactly to confirm:
        </p>
        <input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={companyName}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "var(--text)", fontSize: 13, marginBottom: 14 }}
        />
        {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={() => setConfirming(false)}
            style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={typedName !== companyName || deleting}
            style={{
              background: typedName === companyName ? "var(--red)" : "var(--border)",
              border: "none",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 6,
              cursor: typedName === companyName ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
