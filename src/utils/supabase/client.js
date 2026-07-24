import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Browser helper (Vite SPA) — same project keys as Next.js publishable setup */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey);
}
