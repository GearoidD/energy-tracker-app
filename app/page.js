// GnoRate marketing landing page
"use client";

import Link from "next/link";
import {
  BarChart3,
  FileText,
  Leaf,
  PiggyBank,
  Zap,
  Flame,
  Droplet,
  Trash2,
  CheckCircle2,
  ArrowRight,
  PlayCircle,
} from "lucide-react";

const C = {
  darkGreen: "#0A3D2C",
  darkGreen2: "#0D4A36",
  mint: "#1FBE7A",
  mintDim: "#189A63",
  text: "#0F1F1A",
  muted: "#5B6B66",
  mutedLight: "#8FA39C",
  bgLight: "#F6FAF8",
  border: "#E2E8E5",
  white: "#FFFFFF",
};

function Logo({ onDark = false }) {
  return (
    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
      <span style={{ color: onDark ? C.white : C.text }}>Gnó</span>
      <span style={{ color: C.mint }}>Rate</span>
    </span>
  );
}

function IrishFlag({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.67} viewBox="0 0 30 20" style={{ flexShrink: 0, borderRadius: 2 }}>
      <rect width="10" height="20" fill="#169B62" />
      <rect x="10" width="10" height="20" fill="#FFFFFF" />
      <rect x="20" width="10" height="20" fill="#FF883E" />
    </svg>
  );
}

// A map pin mark - avoids needing an accurate country silhouette, reads clearly at any size
function IrelandMark({ size = 140 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `${C.mint}1F`, border: `2px solid ${C.mint}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none" stroke={C.mint} strokeWidth="1.6">
        <path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.6" fill={C.mint} stroke="none" />
      </svg>
    </div>
  );
}

function PlaceholderPhoto({ label, height = "100%" }) {
  return (
    <div
      style={{
        width: "100%",
        height,
        background: `linear-gradient(135deg, ${C.darkGreen}22, ${C.mint}33)`,
        border: `1px dashed ${C.mutedLight}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.muted,
        fontSize: 12,
        textAlign: "center",
        padding: 20,
      }}
    >
      [ Photo placeholder — {label} — replace with licensed photography ]
    </div>
  );
}

export default function GnoRateLandingPage() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: C.text, background: C.white }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
      ` }} />

      {/* NAV */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 48px", borderBottom: `1px solid ${C.border}` }}>
        <Logo />
        <nav style={{ display: "flex", gap: 32, fontSize: 14.5, fontWeight: 500 }}>
          <Link href="#product" style={{ color: C.text, textDecoration: "none" }}>Product</Link>
          <Link href="#solutions" style={{ color: C.text, textDecoration: "none" }}>Solutions</Link>
          <Link href="#utilities" style={{ color: C.text, textDecoration: "none" }}>Utilities</Link>
          <Link href="#resources" style={{ color: C.text, textDecoration: "none" }}>Resources</Link>
          <Link href="#about" style={{ color: C.text, textDecoration: "none" }}>About</Link>
          <Link href="/login" style={{ color: C.text, textDecoration: "none" }}>Log in</Link>
        </nav>
        <Link href="/login" style={{ background: C.mint, color: C.white, border: "none", borderRadius: 8, padding: "11px 20px", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textDecoration: "none" }}>
          Book a Demo <ArrowRight size={15} />
        </Link>
      </header>

      {/* HERO */}
      <section style={{ background: `linear-gradient(180deg, ${C.bgLight}, ${C.white})`, padding: "56px 48px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.mintDim, letterSpacing: 1 }}>COMMERCIAL UTILITY INTELLIGENCE</span>
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 42, fontWeight: 700, lineHeight: 1.15, margin: "0 0 18px" }}>
            Irish by name.<br />
            <span style={{ color: C.mint }}>Built for business.</span>
          </h1>
          <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.55, marginBottom: 26, maxWidth: 460 }}>
            GnoRate helps Irish businesses track, compare and manage their electricity, gas, water and waste contracts — all in one intelligent platform.
          </p>
          <div style={{ display: "flex", gap: 14, marginBottom: 40 }}>
            <Link href="/login" style={{ background: C.mint, color: C.white, border: "none", borderRadius: 8, padding: "13px 22px", fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textDecoration: "none" }}>
              Book a Demo <ArrowRight size={15} />
            </Link>
            <a href="#how-it-works" style={{ background: "none", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "13px 22px", fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textDecoration: "none" }}>
              See how it works <PlayCircle size={15} />
            </a>
          </div>
          <div style={{ display: "flex", gap: 28 }}>
            {[
              { icon: BarChart3, label: "Compare Rates" },
              { icon: FileText, label: "Manage Contracts" },
              { icon: Leaf, label: "Track Usage" },
              { icon: PiggyBank, label: "Identify Savings" },
            ].map((f) => (
              <div key={f.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 90 }}>
                <f.icon size={22} color={C.mintDim} strokeWidth={1.7} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text, textAlign: "center", lineHeight: 1.3 }}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <PlaceholderPhoto label="Irish town/coastal scene" height={320} />
          <div style={{ position: "absolute", top: -8, right: 8, background: C.white, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
            <IrishFlag />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
              BORN IN IRELAND<br />FOR A MORE SUSTAINABLE<br />BUSINESS FUTURE
            </span>
          </div>

          {/* Dashboard preview card */}
          <div style={{ position: "absolute", bottom: -30, left: -20, right: 40, background: C.white, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", border: `1px solid ${C.border}`, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Logo />
              <span style={{ fontSize: 10, color: C.muted }}>Last 12 months ▾</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Dashboard</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                { label: "Total Annual Spend", value: "€482,320", sub: "↓ 12%" },
                { label: "Potential Savings", value: "€64,800", sub: "↑ 18%" },
                { label: "Active Contracts", value: "12", sub: "2 renewing soon" },
                { label: "Rate Opportunities", value: "5", sub: "new opportunities" },
              ].map((k) => (
                <div key={k.label} style={{ background: C.bgLight, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{k.value}</div>
                  <div style={{ fontSize: 8.5, color: C.mintDim }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 60 }} />

      {/* DARK GREEN STATS BAND */}
      <section style={{ background: C.darkGreen, color: C.white, padding: "56px 48px", display: "grid", gridTemplateColumns: "auto 1fr", gap: 56, alignItems: "center" }}>
        <IrelandMark size={140} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 24, height: 2, background: C.mint }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.mint, letterSpacing: 1 }}>ROOTED IN IRELAND. BUILT FOR BUSINESS.</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, lineHeight: 1.3, margin: "0 0 30px", maxWidth: 520 }}>
            Supporting Irish businesses to <span style={{ color: C.mint }}>reduce costs</span> and build a <span style={{ color: C.mint }}>more sustainable future.</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {[
              { value: "100+", label: "Irish businesses already using GnoRate" },
              { value: "€Millions", label: "in potential savings identified" },
              { value: "4 Utilities", label: "Electricity, Gas, Water & Waste" },
              { value: "Smarter", label: "More efficient, more sustainable operations" },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 6 }}>{s.value}</div>
                <div style={{ fontSize: 12.5, color: "#B7CFC5", lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPLETE VISIBILITY */}
      <section style={{ padding: "64px 48px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mintDim, letterSpacing: 1, marginBottom: 10 }}>ONE PLATFORM. FOUR UTILITIES.</div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 16px" }}>
            Complete <span style={{ color: C.mint }}>visibility</span><br />across your <span style={{ color: C.mint }}>utility contracts.</span>
          </h2>
          <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.55, marginBottom: 26, maxWidth: 420 }}>
            Centralise all your electricity, gas, water and waste contracts in one place. Compare rates, monitor usage, identify savings and never miss a renewal.
          </p>
          <div style={{ display: "flex", gap: 28 }}>
            {[
              { icon: Zap, label: "Electricity" },
              { icon: Flame, label: "Gas" },
              { icon: Droplet, label: "Water" },
              { icon: Trash2, label: "Waste" },
            ].map((u) => (
              <div key={u.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <u.icon size={22} color={C.mintDim} strokeWidth={1.7} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{u.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <PlaceholderPhoto label="Modern office building" height={340} />
          <div style={{ position: "absolute", bottom: 20, left: 20, right: 20, background: C.white, borderRadius: 10, padding: "16px 18px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
            <div style={{ width: 20, height: 2, background: C.mint, marginBottom: 8 }} />
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Better rates. Stronger business.</div>
            <div style={{ fontSize: 12, color: C.muted }}>Helping Irish businesses make smarter utility decisions and lower their costs.</div>
          </div>
        </div>
      </section>

      {/* LOWER COSTS TODAY */}
      <section style={{ padding: "20px 48px 64px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <PlaceholderPhoto label="Irish coastal cliffs" height={340} />
          <div style={{ position: "absolute", top: 20, left: 20, background: C.white, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
            <Leaf size={20} color={C.mintDim} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>32%</div>
              <div style={{ fontSize: 10.5, color: C.muted }}>average potential savings identified</div>
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mintDim, letterSpacing: 1, marginBottom: 10 }}>A MORE SUSTAINABLE IRELAND</div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 16px" }}>
            Lower costs today.<br /><span style={{ color: C.mint }}>A greener tomorrow.</span>
          </h2>
          <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.55, marginBottom: 22, maxWidth: 420 }}>
            GnoRate gives Irish businesses the tools to reduce costs, improve efficiency and make more sustainable choices across all utilities.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["Identify savings opportunities", "Reduce consumption and waste", "Support your sustainability goals", "Make data-driven decisions"].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CheckCircle2 size={17} color={C.mint} />
                <span style={{ fontSize: 14 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ background: C.bgLight, padding: "64px 48px", textAlign: "center" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mintDim, letterSpacing: 1, marginBottom: 10 }}>HOW IT WORKS</div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 44px" }}>Simple, powerful, effective.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32, maxWidth: 960, margin: "0 auto" }}>
          {[
            { n: 1, title: "Connect your contracts", desc: "Add your utility contracts in one secure platform." },
            { n: 2, title: "See your data", desc: "Track usage, costs and rate opportunities." },
            { n: 3, title: "Compare and save", desc: "Identify better rates and potential savings." },
            { n: 4, title: "Stay in control", desc: "Get alerts for renewals and manage everything in one place." },
          ].map((s) => (
            <div key={s.n}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.mint}22`, color: C.mintDim, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, margin: "0 auto 16px" }}>
                {s.n}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={{ background: C.darkGreen, color: C.white, padding: "44px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
        <div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
            Ready to take control<br />of your utility costs?
          </h3>
          <p style={{ fontSize: 13.5, color: "#B7CFC5", margin: 0 }}>
            Join Irish businesses already using GnoRate to save money and build a more sustainable future.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <Link href="/login" style={{ background: C.mint, color: C.white, border: "none", borderRadius: 8, padding: "12px 22px", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textDecoration: "none" }}>
            Book a Demo <ArrowRight size={15} />
          </Link>
          <a href="#how-it-works" style={{ fontSize: 12.5, color: "#B7CFC5" }}>See how it works</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#08251B", color: "#B7CFC5", padding: "48px 48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto", gap: 32, marginBottom: 32 }}>
          <div>
            <Logo onDark />
            <p style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5, maxWidth: 220 }}>
              Commercial utility rate intelligence for smarter, more sustainable Irish businesses.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.white, marginBottom: 12 }}>Product</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
              <span>Features</span><span>Pricing</span><span>Integrations</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.white, marginBottom: 12 }}>Solutions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
              <span>By Business Type</span><span>Sustainability</span><span>Case Studies</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.white, marginBottom: 12 }}>Resources</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
              <span>Guides</span><span>Blog</span><span>FAQs</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            <IrishFlag size={26} />
            <span style={{ fontSize: 10.5, lineHeight: 1.4 }}>BORN IN IRELAND<br />FOR A MORE SUSTAINABLE<br />BUSINESS FUTURE</span>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1A4433", paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
          <span>© 2026 GnoRate. All rights reserved.</span>
          <div style={{ display: "flex", gap: 20 }}>
            <span>Privacy</span><span>Terms</span><span>Cookies</span>
          </div>
        </div>
      </footer>
    </div>
  );
}