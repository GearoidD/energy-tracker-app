import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountsBoard from "../AccountsBoard";
import Header from "../Header";
import PortalShell from "../PortalShell";

export const dynamic = "force-dynamic";

export default async function AllCompaniesPage({ searchParams }) {
  const params = await searchParams;
  const requestedSection = params?.section || "overview";
  const section = ["overview", "accounts", "rates", "usage", "renewals", "savings", "reports", "settings"].includes(requestedSection) ? requestedSection : "overview";
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, role, companies(id, name)")
    .eq("user_id", user.id);

  const companies = (memberships || [])
    .filter((m) => m.companies)
    .map((m) => ({ ...m.companies, role: m.role }));

  if (companies.length === 0) redirect("/dashboard");

  const activeCompanyId =
    profileData?.active_company_id && companies.some((c) => c.id === profileData.active_company_id)
      ? profileData.active_company_id
      : companies[0].id;

  const companiesById = {};
  companies.forEach((c) => {
    companiesById[c.id] = c.name;
  });

  return <PortalShell allCompanies companyName="All companies" header={<Header email={user.email} userId={user.id} companies={companies} activeCompanyId={activeCompanyId} />}>
    <AccountsBoard companyIds={companies.map((c) => c.id)} companiesById={companiesById} companyName="All companies" section={section} />
  </PortalShell>;
}
