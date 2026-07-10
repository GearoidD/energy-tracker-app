"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authStyles as s } from "../authStyles";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.brand}>
          <Zap size={20} color="var(--teal)" />
          <span style={s.brandText}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span>
          </span>
        </div>
        <h1 style={s.h1}>Log in</h1>
        <p style={s.tagline}>Know before your contract renews.</p>
        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>
            Email
            <input style={s.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={s.label}>
            Password
            <input style={s.input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div style={s.error}>{error}</div>}
          <button style={s.button} type="submit" disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p style={s.footNote}>
          No account yet? <Link href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create one</Link>
        </p>
      </div>
    </div>
  );
}
