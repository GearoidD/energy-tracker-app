const wrap = { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif" };
const inner = { maxWidth: 720, margin: "0 auto", padding: "60px 24px 100px" };
const h1 = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, marginBottom: 8 };
const h2 = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 10 };
const p = { fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)", marginBottom: 14 };
const li = { fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)", marginBottom: 6 };

export default function PrivacyPolicyPage() {
  return (
    <div style={wrap}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');` }} />
      <div style={inner}>
        <h1 style={h1}>Privacy Policy</h1>
        <p style={{ ...p, fontSize: 13, marginBottom: 30 }}>Last updated: July 2026</p>

        <p style={p}>
          This is a plain-language account of what data Wattpryce collects and why. It is not a substitute for
          professional legal advice, and should be reviewed by a solicitor before being relied on for a commercial
          deployment, particularly around GDPR compliance.
        </p>

        <h2 style={h2}>What we collect</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li style={li}>Your email address and password, for account access</li>
          <li style={li}>Company and team information you enter (account names, MPRN/GPRN numbers, rates, providers, contract dates)</li>
          <li style={li}>Bill images or PDFs you upload, and the data extracted from them</li>
          <li style={li}>Notes you or your team add to accounts</li>
        </ul>

        <h2 style={h2}>How it's used</h2>
        <p style={p}>
          Your data is used to run the core service — tracking your accounts, sending renewal reminders, and
          generating market rate comparisons. We do not sell your data, and we don't use it to serve advertising.
        </p>

        <h2 style={h2}>Third parties involved</h2>
        <p style={p}>A few external services are used to run Wattpryce:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li style={li}><strong style={{ color: "var(--text)" }}>Supabase</strong> — stores your account data and handles login</li>
          <li style={li}><strong style={{ color: "var(--text)" }}>Anthropic (Claude)</strong> — reads uploaded bills and performs market rate lookups</li>
          <li style={li}><strong style={{ color: "var(--text)" }}>Resend</strong> — sends renewal reminder emails and password reset links</li>
          <li style={li}><strong style={{ color: "var(--text)" }}>Vercel</strong> — hosts the website itself</li>
        </ul>

        <h2 style={h2}>Who can see your data</h2>
        <p style={p}>
          Only people you or another admin have invited to your company can see your accounts. Data isn't shared
          across different companies using Wattpryce.
        </p>

        <h2 style={h2}>Your rights</h2>
        <p style={p}>
          You can ask for your data to be corrected or deleted at any time by contacting us via the email associated
          with your account invitation.
        </p>

        <h2 style={h2}>Changes</h2>
        <p style={p}>This policy may be updated as the service evolves.</p>
      </div>
    </div>
  );
}
