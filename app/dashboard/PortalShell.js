"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, BarChart3, Building2, CircleDollarSign, Gauge, LayoutDashboard, ListChecks, Settings, Zap } from "lucide-react";

const groups = [
  ["Your business", [["overview", "Dashboard", LayoutDashboard], ["accounts", "Accounts", Building2], ["usage", "Usage and bills", Activity]]],
  ["Keep on track", [["renewals", "Renewals", Gauge], ["attention", "Needs attention", ListChecks]]],
  ["Reduce costs", [["rates", "Compare rates", Zap], ["savings", "Savings", CircleDollarSign]]],
  ["Manage", [["reports", "Reports", BarChart3], ["settings", "Settings", Settings]]],
];

const copy = {
  overview: ["Dashboard", "Your utility contracts at a glance."],
  accounts: ["Accounts", "Every site, supplier, contract and bill in one place."],
  rates: ["Compare rates", "See whether an available tariff may cost less."],
  usage: ["Usage and bills", "See recorded usage and bills by account, location and month."],
  renewals: ["Renewals", "See which contracts are ending and what needs a follow-up."],
  savings: ["Savings", "Review indicative unit-rate differences and check full quotes before switching."],
  reports: ["Reports", "Export account data and portfolio summaries."],
  settings: ["Settings", "Manage your company and team access."],
  attention: ["Needs attention", "Accounts with something to check, with the reason and next step."],
};

export default function PortalShell({ children, header, companyName, sectionOverride, allCompanies = false }) {
  const params = useSearchParams();
  const section = sectionOverride || params.get("section") || "overview";
  const [title, subtitle] = copy[section] || copy.overview;
  const activeItem = section;
  const dashboardBase = allCompanies ? "/dashboard/all-companies" : "/dashboard?scope=company";
  const sectionHref = (id) => `${dashboardBase}${allCompanies ? "?" : "&"}section=${id}`;
  return <div className="portal-layout">
    <aside className="portal-sidebar">
      <Link href={sectionHref("overview")} className="portal-brand"><span className="portal-brand-mark"><Zap size={20}/></span><span className="portal-brand-name">GnóRate</span></Link>
      {groups.map(([group, links]) => <div key={group}><div className="portal-nav-label">{group}</div><nav className="portal-nav">{links.map(([id, label, Icon]) => <Link key={id} href={id === "attention" ? "/dashboard/attention" : sectionHref(id)} className={activeItem === id ? "active" : ""}><Icon size={17}/>{label}</Link>)}</nav></div>)}
      <div className="portal-sidebar-foot">Irish by name. Built for business.<br/>Commercial utility intelligence</div>
    </aside>
    <main className="portal-main">{header}<div className="portal-content"><div className="portal-heading"><div><div className="portal-kicker">{companyName || "GnóRate client portal"}</div><h1>{title}</h1><p>{subtitle}</p></div></div>{children}</div></main>
    <style jsx>{`.portal-company-chip{display:flex;align-items:center;gap:8px;background:#e5f3e9;color:#176541;border:1px solid #cfe6d6;border-radius:9px;padding:10px 13px;font-size:12px;font-weight:700;white-space:nowrap}@media(max-width:600px){.portal-heading{align-items:flex-start;flex-direction:column}.portal-heading h1{font-size:24px}}`}</style>
  </div>;
}
