import { supabase } from "./supabase.js";
import { createNewCharacter, toDbRow, fromDbRow } from "../game/character.js";

export async function loadOrCreateCharacter(userId, name, classId) {
  if (!supabase) {
    return { character: createNewCharacter(name, classId), offline: true };
  }

  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Table missing or RLS — fall back offline but warn
    console.warn("[persist] load failed", error.message);
    return {
      character: createNewCharacter(name, classId),
      offline: true,
      error: error.message,
    };
  }

  if (data) {
    return { character: fromDbRow(data), offline: false };
  }

  const fresh = createNewCharacter(name, classId);
  const row = toDbRow(userId, fresh);
  const { data: inserted, error: insErr } = await supabase
    .from("characters")
    .insert(row)
    .select("*")
    .single();

  if (insErr) {
    console.warn("[persist] insert failed", insErr.message);
    return { character: fresh, offline: true, error: insErr.message };
  }

  return { character: fromDbRow(inserted), offline: false };
}

export async function saveCharacter(userId, ch) {
  if (!supabase || !userId) return { ok: false, reason: "no-client" };
  const row = toDbRow(userId, ch);
  const { error } = await supabase.from("characters").upsert(row, { onConflict: "user_id" });
  if (error) {
    console.warn("[persist] save failed", error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}
