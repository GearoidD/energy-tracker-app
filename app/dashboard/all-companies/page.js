import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountsBoard from "../AccountsBoard";
import Header from "../Header";

export const dynamic = "force-dynamic";

export default async function AllCompaniesPage() {
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

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header email={user.email} userId={user.id} companies={companies} activeCompanyId={activeCompanyId} />
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 20px 60px" }}>
        <AccountsBoard
          companyIds={companies.map((c) => c.id)}
          companiesById={companiesById}
          companyName="All companies"
        />
      </div>
    </div>
  );
}
