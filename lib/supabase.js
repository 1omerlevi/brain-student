import { createClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "./config.js";

let supabaseClient;

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      getRequiredEnv("SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
    );
  }

  return supabaseClient;
}
