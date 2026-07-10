"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authStyles as s } from "../authStyles";
import { HeroCard } from "../AuthHero";

function SignupForm() {
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
      router.push(next);
      router.refresh();
    } else {
      setCheckEmail(true);
    }
  };

  const loginHref = `/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`;

  const LeftPanel = (
    <div className="wp-auth-left" style={s.leftPanel}>
      <div style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <Zap size={20} color="var(--teal)" />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, color: "var(--text)" }}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span>
          </span>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 700, color: "var(--text)", lineHeight: 1.15, margin: "0 0 16px" }}>
          Know before your contract renews.
        </h2>
        <p style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 36px", maxWidth: 380 }}>
          Every account tracked, every bill read automatically, and a market rate comparison the moment you need one.
        </p>
        <HeroCard />
      </div>
    </div>
  );

  if (checkEmail) {
    return (
      <div style={s.page}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
          @media (max-width: 900px) { .wp-auth-left { display: none !important; } }
        `}</style>
        {LeftPanel}
        <div style={s.rightPanel}>
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
      </div>
    );
  }

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        @media (max-width: 900px) { .wp-auth-left { display: none !important; } }
      `}</style>
      {LeftPanel}
      <div style={s.rightPanel}>
        <div style={s.card}>
          <div style={s.brand}>
            <Zap size={20} color="var(--teal)" />
            <span style={s.brandText}>
              Watt<span style={{ color: "var(--teal)" }}>pryce</span>
            </span>
          </div>
          <h1 style={s.h1}>Create your account</h1>
          <p style={s.tagline}>Takes about a minute.</p>
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
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
