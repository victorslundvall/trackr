import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      SUPABASE_URL,
      SUPABASE_KEY,
    );
  }
  return client;
}
