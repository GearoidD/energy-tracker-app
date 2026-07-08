import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompanySetup from "./CompanySetup";
import AccountsBoard from "./AccountsBoard";
import Header from "./Header";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, role, companies(id, name)")
    .eq("user_id", user.id);

  const companies = (memberships || [])
    .filter((m) => m.companies)
    .map((m) => ({ ...m.companies, role: m.role }));

  if (companies.length === 0) {
    return (
      <div style={{ minHeight: "100vh" }}>
      <Header email={user.email} userId={user.id} companies={[]} activeCompanyId={null} />
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px 60px" }}>
          <CompanySetup />
        </div>
      </div>
    );
  }

  const activeCompanyId =
    profile?.active_company_id && companies.some((c) => c.id === profile.active_company_id)
      ? profile.active_company_id
      : companies[0].id;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header email={user.email} userId={user.id} companies={companies} activeCompanyId={activeCompanyId} />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px 60px" }}>
        <AccountsBoard companyId={activeCompanyId} />
      </div>
    </div>
  );
}