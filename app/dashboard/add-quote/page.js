import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Zap } from "lucide-react";
import AddQuoteForm from "./AddQuoteForm";

export const dynamic = "force-dynamic";

export default async function AddQuotePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "40px 24px", fontFamily: "Inter, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');` }} />
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <Zap size={20} color="var(--teal)" />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>
            Watt<span style={{ color: "var(--teal)" }}>pryce</span>
          </span>
        </div>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
          Feed in a real quote
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 28 }}>
          Paste the full text of a quote email you've received below. AI pulls out every distinct rate offer and adds it as a
          <strong style={{ color: "var(--text)" }}> verified market rate</strong> — since it came from a real supplier quote, it's
          used across every account's comparison, not just yours.
        </p>

        <AddQuoteForm />
      </div>
    </div>
  );
}