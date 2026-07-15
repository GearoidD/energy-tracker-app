import Link from "next/link";
import { Zap } from "lucide-react";

const wrap = { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif" };
const inner = { maxWidth: 760, margin: "0 auto", padding: "50px 24px 100px" };
const h1 = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 700, marginBottom: 8 };
const h2 = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 19, fontWeight: 600, marginTop: 38, marginBottom: 12, paddingTop: 20, borderTop: "1px solid var(--border)" };
const p = { fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)", marginBottom: 12 };
const li = { fontSize: 14.5, lineHeight: 1.75, color: "var(--muted)", marginBottom: 8 };
const strong = { color: "var(--text)" };
const code = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "var(--teal)" };

export default function HelpPage() {
  return (
    <div style={wrap}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`}</style>
      <div style={inner}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <Zap size={20} color="var(--teal)" />
          <Link href="/" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, color: "var(--text)", textDecoration: "none" }}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span>
          </Link>
        </div>

        <h1 style={h1}>Using Wattpryce</h1>
        <p style={{ ...p, fontSize: 15 }}>
          A guide to tracking your energy accounts, reading bills automatically, and knowing whether to renew or switch —
          before you roll onto a worse rate.
        </p>

        <h2 style={{ ...h2, marginTop: 30, paddingTop: 0, borderTop: "none" }}>Getting started</h2>
        <p style={p}>
          <strong style={strong}>Signing up:</strong> go to <Link href="/signup" style={{ color: "var(--teal)" }}>wattpryce.com/signup</Link>, enter your
          email and a password. If a teammate invited you via a link, clicking it will automatically add you to their
          company once you sign up or log in — no extra steps needed.
        </p>
        <p style={p}>
          <strong style={strong}>Setting up your company:</strong> if you're the first person from your business to join,
          you'll be asked to name your workspace. This becomes your shared company — everyone you invite later sees the
          same accounts.
        </p>
        <p style={p}>
          <strong style={strong}>Forgot your password?</strong> Click "Forgot password?" under the password field on the{" "}
          <Link href="/login" style={{ color: "var(--teal)" }}>login page</Link> and a reset link will be emailed to you.
        </p>

        <h2 style={h2}>Adding your energy accounts</h2>
        <p style={p}>There are three ways to add accounts, depending on your situation:</p>
        <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
          <li style={li}>
            <strong style={strong}>Manually</strong> — click "Add account" and fill in what you know. Only the site name
            and MPRN/GPRN are required.
          </li>
          <li style={li}>
            <strong style={strong}>By uploading a bill (recommended)</strong> — click "Upload a bill," take a photo or
            select a PDF, and it reads the rate, usage, provider, contract date, and meter number automatically. If it
            can't tell gas from electricity, it'll ask you to confirm — everything else stays intact. You can upload
            several at once.
          </li>
          <li style={li}>
            <strong style={strong}>By importing a CSV</strong> — use the "⋯" menu → "Import accounts." You'll see a
            preview before anything saves, with any rows missing required info or duplicating an existing account
            flagged automatically.
          </li>
        </ul>

        <h2 style={h2}>Reading the dashboard</h2>
        <p style={p}>
          The <strong style={strong}>stat row</strong> at the top shows how many accounts you're tracking, how many are
          renewing within 90 days, your total potential savings per year, and your estimated annual spend — the last two
          only appear once there's real data to calculate them from.
        </p>
        <p style={p}>
          The <strong style={strong}>"needs attention" panel</strong> lists anything urgent — overdue renewals, missing
          bills, low-confidence uploads, or an unexpected rate jump. Click any item to jump straight to that account.
        </p>
        <p style={p}>
          Use the <strong style={strong}>filter dropdowns</strong> next to search to narrow the list by fuel type,
          status, renewal stage, or location.
        </p>

        <h2 style={h2}>Working with an individual account</h2>
        <p style={p}>Click any account to expand it into four tabs:</p>
        <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
          <li style={li}><strong style={strong}>Details</strong> — core info, confidence score, and any data warnings.</li>
          <li style={li}>
            <strong style={strong}>Market rate</strong> — a clear recommendation, plus buttons to pull a live estimate,
            request a supplier quote, or email your current provider to negotiate.
          </li>
          <li style={li}><strong style={strong}>History</strong> — every bill you've added, with a usage and rate chart.</li>
          <li style={li}><strong style={strong}>Notes</strong> — a running log anyone on your team can add to.</li>
        </ul>
        <p style={p}>
          <strong style={strong}>"Just renewed?"</strong> — in any account's "⋯" menu, a fast 3-field shortcut (new
          rate, provider, contract end date) instead of the full edit form.
        </p>

        <h2 style={h2}>Getting a market rate comparison</h2>
        <p style={p}>Every comparison is labeled honestly, so you know how much to trust it:</p>
        <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
          <li style={li}><strong style={{ color: "var(--teal)" }}>Wattpryce verified</strong> — manually confirmed and kept current.</li>
          <li style={li}><strong style={{ color: "var(--amber)" }}>Estimated</strong> — a broader AI benchmark, less precise.</li>
          <li style={li}><strong style={strong}>Quoted</strong> — a rate you've entered yourself, e.g. from a real supplier quote.</li>
        </ul>

        <h2 style={h2}>Renewal reminders</h2>
        <p style={p}>
          You'll get an email as a renewal approaches — at 90, 60, 30, 14, 7, and 1 day(s) out, and daily once overdue.
          Each account in the email has its own <strong style={strong}>"Just renewed? Update it here"</strong> link, so
          you can update it directly from your inbox.
        </p>

        <h2 style={h2}>Working as a team</h2>
        <p style={p}>
          <strong style={strong}>Invite teammates</strong> from the header (admins only) — the link expires after 7
          days. <strong style={strong}>Team panel</strong> shows everyone in your company; admins can promote, demote,
          or remove people. Everyone sees the same accounts, notes, and history.
        </p>

        <h2 style={h2}>Grouping accounts by location</h2>
        <p style={p}>
          If one building has both an electricity and a gas account, give them the same <strong style={strong}>Location</strong> name.
          They'll show a small location tag, and you can filter to see just that building — including a combined spend
          and savings total.
        </p>

        <h2 style={h2}>Doing things in bulk</h2>
        <p style={p}>
          Tick the checkbox on any account row to select it. Once you've selected a few — say, everything renewing
          soon — click <strong style={strong}>"Email selected accounts"</strong> to build one email listing every
          selected account's details, ready to send to a broker or supplier covering multiple sites.
        </p>

        <h2 style={h2}>Tips for the most accurate results</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li style={li}>Upload a real bill when you can — it's faster and reads exact figures.</li>
          <li style={li}>Keep site names consistent — the form suggests existing names as you type.</li>
          <li style={li}>Check the confidence score after uploading — low-confidence flags are worth a quick glance.</li>
          <li style={li}>The more bill history an account has, the more accurate its annual spend estimate becomes.</li>
        </ul>
      </div>
    </div>
  );
}