import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anon && !url.includes("YOUR_PROJECT") && anon !== "YOUR_ANON_KEY");

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
export const supabase = hasSupabase ? createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
}) : null;

export async function ensureAuth() {
  if (!supabase) throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signed.user;
}

export function configHint() {
  if (hasSupabase) return "Supabase connected · realtime multiplayer on";
  return "Add .env from .env.example (Supabase URL + anon key) for multiplayer";
}
