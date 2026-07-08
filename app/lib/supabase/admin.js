import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// DANGER: this client bypasses Row Level Security entirely. It must never be
// imported into anything that runs in the browser, and the service role key
// must never be exposed with a NEXT_PUBLIC_ prefix. Only use this for trusted
// server-side jobs like the daily reminder check.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
