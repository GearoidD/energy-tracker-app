"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CompanySetup({ onDone }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Refresh the page and log in again.");
      setLoading(false);
      return;
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({ name: companyName })
      .select()
      .single();

    if (companyError) {
      setError(companyError.message);
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("company_members").insert({
      user_id: user.id,
      company_id: company.id,
      role: "admin",
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    // make sure a profile row exists, and point it at the new company
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, email: user.email, active_company_id: company.id });

    setLoading(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    if (onDone) onDone(company);
    router.refresh();
  };

  return (
    <div style={{ maxWidth: 420, margin: "60px auto 0" }}>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, marginBottom: 6 }}>Set up your company</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
        This creates a workspace you can switch into later from the header. You can add more companies at any time.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          Company name
          <input
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "10px 11px",
              color: "var(--text)",
              fontSize: 14,
            }}
            value={companyName}
            required
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Acme Facilities Ltd"
          />
        </label>
        {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            background: "var(--teal)",
            border: "none",
            color: "#06201d",
            padding: "11px 16px",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {loading ? "Creating…" : "Create workspace"}
        </button>
      </form>
    </div>
  );
}
