"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authStyles as s } from "../authStyles";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      // email confirmation is off in this Supabase project — go straight in
      router.push(next);
      router.refresh();
    } else {
      // email confirmation is on — user needs to click the link first
      setCheckEmail(true);
    }
  };

  const loginHref = `/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`;

  if (checkEmail) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.brand}>
            <Zap size={20} color="var(--teal)" />
            <span style={s.brandText}>
              Watt<span style={{ color: "var(--teal)" }}>pryce</span>
            </span>
          </div>
          <h1 style={s.h1}>Check your email</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
            We sent a confirmation link to <strong style={{ color: "var(--text)" }}>{email}</strong>. Click it, then{" "}
            <Link href={loginHref}>log in</Link>
            {next !== "/dashboard" ? " to finish joining the company you were invited to." : "."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.brand}>
          <Zap size={20} color="var(--teal)" />
          <span style={s.brandText}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span>
          </span>
        </div>
        <h1 style={s.h1}>Create your account</h1>
        <p style={s.tagline}>Know before your contract renews.</p>
        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>
            Work email
            <input style={s.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={s.label}>
            Password
            <input
              style={s.input}
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div style={s.error}>{error}</div>}
          <button style={s.button} type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p style={s.footNote}>
          Already have an account? <Link href={loginHref}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
