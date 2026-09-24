"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Zap,
  Upload,
  ShieldCheck,
  TrendingDown,
  Users,
  ArrowRight,
  Flame,
} from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

import { HeroCard } from "./AuthHero";

const sectionStyle = { maxWidth: 1080, margin: "0 auto", padding: "0 24px" };

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const features = [
    {
      icon: Upload,
      title: "Upload a bill, done",
      body: "Snap a photo or drop in a PDF. It reads the rate, usage, MPRN/GPRN, and contract date for you — no typing.",
    },
    {
      icon: ShieldCheck,
      title: "Know what to trust",
      body: "Every account carries a data confidence score, so a stale or shaky reading never hides behind a green light.",
    },
    {
      icon: TrendingDown,
      title: "Market rate, tariff-aware",
      body: "Pulls a live comparison that actually accounts for MIC, and Irish gas tariff bands like SBU/MBU/FVT — not a flat guess.",
    },
    {
      icon: Users,
      title: "Built for a team",
      body: "Invite teammates with a link, set who's admin, and everyone sees the same renewal picture.",
    },
  ];

  const steps = [
    { n: "01", title: "Add your accounts", body: "Enter them once, or upload a bill and let it create the account for you." },
    { n: "02", title: "It watches the dates", body: "Every account is scored and sorted — the ones that need attention rise to the top automatically." },
    { n: "03", title: "Act with a real number", body: "See your current rate against the market before you renew, not after." },
  ];

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", color: "#16342b", fontFamily: "DM Sans, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: FONT_IMPORT }} />
      <style dangerouslySetInnerHTML={{ __html: `
        .wp-nav-link { color: #71847b; text-decoration: none; font-size: 14px; transition: color 0.15s ease; }
        .wp-nav-link:hover { color: #16342b; }
        .wp-cta { transition: transform 0.15s ease, opacity 0.15s ease; }
        .wp-cta:hover { opacity: 0.9; }
        .wp-feature-card { transition: border-color 0.2s ease, transform 0.2s ease; }
        .wp-feature-card:hover { border-color: #08784e55; transform: translateY(-2px); }
        @media (max-width: 720px) {
          .wp-hero-grid { grid-template-columns: 1fr !important; }
          .wp-hero-card-wrap { justify-content: flex-start !important; margin-top: 32px; }
          .wp-desktop-nav { display: none !important; }
          .wp-mobile-toggle { display: flex !important; }
        }
      ` }} />

      {/* Nav */}
      <header style={{ borderBottom: "1px solid #dce6df", position: "sticky", top: 0, background: "#ffffffcc", backdropFilter: "blur(8px)", zIndex: 20 }}>
        <div style={{ ...sectionStyle, display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={20} color="#08784e" />
            <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontSize: 16 }}>
              <span style={{ color: "#08784e" }}>GnóRate</span>
            </span>
          </div>
          <nav className="wp-desktop-nav" style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <a href="#how-it-works" className="wp-nav-link">How it works</a>
            <a href="#features" className="wp-nav-link">Features</a>
            <Link href="/login" className="wp-nav-link">Log in</Link>
            <Link
              href="/signup"
              className="wp-cta"
              style={{ background: "#08784e", color: "#ffffff", fontWeight: 600, fontSize: 13.5, padding: "9px 16px", borderRadius: 7, textDecoration: "none" }}
            >
              Get started
            </Link>
          </nav>
          <button
            className="wp-mobile-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            style={{ display: "none", background: "none", border: "1px solid #dce6df", borderRadius: 6, padding: 8, color: "#16342b", cursor: "pointer" }}
          >
            <div style={{ width: 16, height: 1.5, background: "currentColor", marginBottom: 4 }} />
            <div style={{ width: 16, height: 1.5, background: "currentColor" }} />
          </button>
        </div>
        {mobileOpen && (
          <div style={{ borderTop: "1px solid #dce6df", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <a href="#how-it-works" className="wp-nav-link" onClick={() => setMobileOpen(false)}>How it works</a>
            <a href="#features" className="wp-nav-link" onClick={() => setMobileOpen(false)}>Features</a>
            <Link href="/login" className="wp-nav-link">Log in</Link>
            <Link href="/signup" style={{ color: "#08784e", fontWeight: 600, fontSize: 14 }}>Get started →</Link>
          </div>
        )}
      </header>

      {/* Hero */}
      <section style={{ ...sectionStyle, padding: "88px 24px 96px" }}>
        <div className="wp-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 48, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#71847b", border: "1px solid #dce6df", borderRadius: 20, padding: "5px 12px", marginBottom: 22 }}>
              <Zap size={11} color="#08784e" /> Built for Irish SMB energy accounts
            </div>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.5px", margin: "0 0 20px" }}>
              Know before your contract renews.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: "#71847b", maxWidth: 460, margin: "0 0 32px" }}>
              GnóRate tracks every electricity and gas account, reads your bills automatically, and tells you whether renewing or switching is the right call — before you roll onto a worse rate.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <Link
                href="/signup"
                className="wp-cta"
                style={{ background: "#08784e", color: "#ffffff", fontWeight: 600, fontSize: 15, padding: "13px 22px", borderRadius: 8, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                Get started free <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="wp-nav-link" style={{ fontSize: 15 }}>
                Log in
              </Link>
            </div>
          </div>
          <div className="wp-hero-card-wrap" style={{ display: "flex", justifyContent: "flex-end" }}>
            <HeroCard />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={{ ...sectionStyle, padding: "72px 24px", borderTop: "1px solid #dce6df" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#08784e", letterSpacing: 1, marginBottom: 10 }}>HOW IT WORKS</p>
        <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 44px", maxWidth: 520 }}>
          Three steps, then it runs itself.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 32 }}>
          {steps.map((s) => (
            <div key={s.n}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#71847b", marginBottom: 10 }}>{s.n}</div>
              <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 17, fontWeight: 600, margin: "0 0 8px" }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: "#71847b", lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ ...sectionStyle, padding: "72px 24px", borderTop: "1px solid #dce6df" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#08784e", letterSpacing: 1, marginBottom: 10 }}>FEATURES</p>
        <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 44px", maxWidth: 520 }}>
          Everything a renewal actually needs.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {features.map((f) => (
            <div
              key={f.title}
              className="wp-feature-card"
              style={{ background: "#ffffff", border: "1px solid #dce6df", borderRadius: 12, padding: "24px 22px" }}
            >
              <f.icon size={20} color="#08784e" style={{ marginBottom: 14 }} />
              <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 15.5, fontWeight: 600, margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: 13.5, color: "#71847b", lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ireland-specific */}
      <section style={{ ...sectionStyle, padding: "72px 24px", borderTop: "1px solid #dce6df" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }} className="wp-hero-grid">
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#b87412", letterSpacing: 1, marginBottom: 10 }}>IRISH ENERGY, PROPERLY</p>
            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 26, fontWeight: 700, margin: "0 0 16px" }}>
              MIC. SBU. MBU. It actually knows the difference.
            </h2>
            <p style={{ fontSize: 14.5, color: "#71847b", lineHeight: 1.7, margin: 0 }}>
              Irish business energy isn't priced like a household bill. GnóRate reads your Maximum Import Capacity and Supply Point Capacity, classifies your gas tariff automatically, and searches for a market rate that reflects the tier you're actually on — not a generic average.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["MIC-aware electricity pricing", "SBU / MBU / FVT gas classification", "MPRN & GPRN auto-matching"].map((t) => (
              <div key={t} style={{ background: "#ffffff", border: "1px solid #dce6df", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#16342b", display: "flex", alignItems: "center", gap: 8 }}>
                <Flame size={13} color="#b87412" /> {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ ...sectionStyle, padding: "80px 24px 96px", borderTop: "1px solid #dce6df", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 30, fontWeight: 700, margin: "0 0 16px" }}>
          Stop finding out too late.
        </h2>
        <p style={{ fontSize: 15, color: "#71847b", margin: "0 0 32px" }}>Free to start. Add your first account in under a minute.</p>
        <Link
          href="/signup"
          className="wp-cta"
          style={{ background: "#08784e", color: "#ffffff", fontWeight: 600, fontSize: 15, padding: "13px 26px", borderRadius: 8, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          Get started free <ArrowRight size={16} />
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #dce6df" }}>
        <div style={{ ...sectionStyle, padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={15} color="#08784e" />
            <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontSize: 13 }}>
              <span style={{ color: "#08784e" }}>GnóRate</span>
            </span>
          </div>
          <span style={{ fontSize: 12, color: "#71847b" }}>Know before your contract renews.</span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/help" style={{ fontSize: 12, color: "#71847b", textDecoration: "none" }}>
              Help
            </Link>
            <Link href="/legal/terms" style={{ fontSize: 12, color: "#71847b", textDecoration: "none" }}>
              Terms
            </Link>
            <Link href="/legal/privacy-policy" style={{ fontSize: 12, color: "#71847b", textDecoration: "none" }}>
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
