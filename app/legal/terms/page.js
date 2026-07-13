const wrap = { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif" };
const inner = { maxWidth: 720, margin: "0 auto", padding: "60px 24px 100px" };
const h1 = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, marginBottom: 8 };
const h2 = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 10 };
const p = { fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)", marginBottom: 14 };

export default function TermsPage() {
  return (
    <div style={wrap}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');` }} />
      <div style={inner}>
        <h1 style={h1}>Terms of Service</h1>
        <p style={{ ...p, fontSize: 13, marginBottom: 30 }}>Last updated: July 2026</p>

        <p style={p}>
          This is a plain-language summary of the terms for using Wattpryce, a tool for tracking energy contract
          renewals and comparing rates for businesses in Ireland. It is not a substitute for professional legal
          advice, and you should have it reviewed by a solicitor before relying on it for a commercial deployment.
        </p>

        <h2 style={h2}>What Wattpryce is</h2>
        <p style={p}>
          Wattpryce lets you track electricity and gas accounts, upload bills for automatic data extraction, and see
          market rate comparisons. Market rate information is provided for guidance only — it may be an AI-generated
          estimate, a manually verified figure, or a live quote, and is clearly labeled as such. It does not constitute
          financial or professional advice, and you should confirm any rate directly with a supplier before making a
          decision.
        </p>

        <h2 style={h2}>Your account</h2>
        <p style={p}>
          You're responsible for keeping your login credentials secure and for the accuracy of information you enter
          or upload. You can invite others to your company's account; anyone you invite can see the same accounts and
          data your team has added.
        </p>

        <h2 style={h2}>Acceptable use</h2>
        <p style={p}>
          Don't use Wattpryce to upload content you don't have the right to use, to attempt to access other companies'
          data, or to misuse the AI features (bill reading, market rate lookups) in a way that could disrupt the
          service for others.
        </p>

        <h2 style={h2}>No guarantee of accuracy</h2>
        <p style={p}>
          Bill data is extracted using AI and may occasionally be incorrect — this is why every extraction carries a
          confidence indicator. Market rate estimates depend on publicly available information at the time of lookup
          and may not reflect your exact eligible rate. Always verify important figures independently before acting
          on them.
        </p>

        <h2 style={h2}>Service availability</h2>
        <p style={p}>
          Wattpryce is provided "as is," without warranty of any kind. We aim to keep the service running reliably but
          don't guarantee uninterrupted availability.
        </p>

        <h2 style={h2}>Changes</h2>
        <p style={p}>These terms may be updated as the service evolves. Continued use after a change means you accept the update.</p>

        <h2 style={h2}>Contact</h2>
        <p style={p}>Questions about these terms can be sent to the email address associated with your account invitation.</p>
      </div>
    </div>
  );
}
