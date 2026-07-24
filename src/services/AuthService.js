import { supabase, hasSupabase, ensureAuth } from "../net/supabase.js";

export const AuthService = {
  hasSupabase,
  async ensureSession() {
    return ensureAuth();
  },
  async signInEmail(email, password) {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signUpEmail(email, password) {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signInAnonymous() {
    return ensureAuth();
  },
  async resetPassword(email) {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  },
  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  },
  async getUser() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user;
  },
};
