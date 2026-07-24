import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabase = Boolean(
  url &&
    key &&
    !String(url).includes("YOUR_PROJECT") &&
    !String(key).includes("YOUR_ANON") &&
    !String(key).includes("your_anon")
);

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
export const supabase = hasSupabase
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: { eventsPerSecond: 24 },
      },
    })
  : null;

export async function ensureAuth() {
  if (!supabase) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (or PUBLISHABLE_KEY)");
  }
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `${error.message} — enable Anonymous sign-ins in Supabase Auth → Providers`
    );
  }
  return signed.user;
}

export function configHint() {
  if (hasSupabase) return "Supabase connected · create or join a room";
  return "Add VITE_SUPABASE_URL + publishable key to .env / Vercel";
}
