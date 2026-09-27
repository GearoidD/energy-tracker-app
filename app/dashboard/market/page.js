import { createClient } from "@/lib/supabase/server";
import PortalShell from "../PortalShell";
import Header from "../Header";
import MarketScanTestButton from "./MarketScanTestButton";

function fmt(value, suffix = "") {
  if (value === null || value === undefined) return "Not verified";
  return `${Number(value).toLocaleString("en-IE", { maximumFractionDigits: 2 })}${suffix}`;
}

export default async function MarketPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("active_company_id, is_platform_admin").eq("id", user.id).single()
    : { data: null };

  const { data: company } = profile?.active_company_id
    ? await supabase.from("companies").select("name").eq("id", profile.active_company_id).single()
    : { data: null };

  const { data: rows } = await supabase
    .from("market_snapshots")
    .select("*")
    .order("snapshot_date", { ascending: false })
    .limit(8);

  const latest = rows?.[0];
  const sources = latest?.source_meta?.sources || [];

  const metrics = [
    ["SEM day-ahead", fmt(latest?.sem_day_ahead_eur_mwh, " €/MWh"), latest?.sem_change_7d_pct],
    ["European gas", fmt(latest?.gas_eur_mwh, " €/MWh"), latest?.gas_change_7d_pct],
    ["Brent crude", fmt(latest?.brent_usd_bbl, " $/bbl"), latest?.brent_change_7d_pct],
    ["EU carbon", fmt(latest?.carbon_eur_t, " €/t"), latest?.carbon_change_7d_pct],
    ["EUR / USD", fmt(latest?.eur_usd), null],
  ];

  return (
    <PortalShell companyName={company?.name} sectionOverride="market" header={<Header />}>
      <div className="gn-card" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              GnóRate market signal
            </div>
            <h2 style={{ margin: "6px 0", fontSize: 28 }}>{latest ? latest.pressure_label : "Awaiting first daily scan"}</h2>
            <p style={{ maxWidth: 760, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
              {latest?.narrative || "The shared market brief updates automatically once per day."}
            </p>
            {profile?.is_platform_admin && <MarketScanTestButton />}
          </div>
          {latest && (
            <div style={{ textAlign: "right" }}>
              <strong style={{ fontSize: 34 }}>{Math.round(latest.pressure_score)}</strong>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                directional pressure / 100
                <br />
                updated {latest.snapshot_date}
                <br />
                next update: daily
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 16 }}>
        {metrics.map(([label, value, change]) => (
          <div className="gn-card" style={{ padding: 16 }} key={label}>
            <small style={{ color: "var(--muted)" }}>{label}</small>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{value}</div>
            {change !== null && change !== undefined && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                {change >= 0 ? "+" : ""}
                {Number(change).toFixed(1)}% over 7 days
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="gn-card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Evidence &amp; interpretation</h3>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          This signal is designed to support procurement timing discussions. It is not a prediction of the retail tariff a
          supplier will quote. Supplier hedging, network charges, levies, taxes, load shape, credit and contract structure
          can cause retail pricing to move differently or later.
        </p>
        {sources.length > 0 && (
          <div style={{ display: "grid", gap: 7 }}>
            {sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--teal)", fontSize: 12 }}>
                {s.name} · {s.as_of || "source date not supplied"}
              </a>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}