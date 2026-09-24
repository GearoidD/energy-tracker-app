import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomePage from "./HomePage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <HomePage />;
}