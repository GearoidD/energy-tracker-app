"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authStyles as s } from "../authStyles";
import { HeroCard } from "../AuthHero";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        @media (max-width: 900px) { .wp-auth-left { display: none !important; } }
      ` }} />

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

      <div style={s.rightPanel}>
        <div style={s.card}>
          <div style={s.brand}>
            <Zap size={20} color="var(--teal)" />
            <span style={s.brandText}>
              Watt<span style={{ color: "var(--teal)" }}>pryce</span>
            </span>
          </div>

          {sent ? (
            <>
              <h1 style={s.h1}>Check your email</h1>
              <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
                If an account exists for <strong style={{ color: "var(--text)" }}>{email}</strong>, a password reset link is
                on its way. Click it to set a new password.
              </p>
            </>
          ) : (
            <>
              <h1 style={s.h1}>Reset your password</h1>
              <p style={s.tagline}>We'll email you a link to set a new one.</p>
              <form onSubmit={handleSubmit} style={s.form}>
                <label style={s.label}>
                  Email
                  <input style={s.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                {error && <div style={s.error}>{error}</div>}
                <button style={s.button} type="submit" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
          <p style={s.footNote}>
            <Link href="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
