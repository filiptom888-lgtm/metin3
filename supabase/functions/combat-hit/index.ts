// Stub: authoritative hit resolution. Client predicts VFX; server returns damage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, msg: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await anon.auth.getUser();
    if (!userData?.user) return json({ ok: false, msg: "Unauthorized" }, 401);

    const body = await req.json();
    // Never trust body.damage — recompute from stats
    const attacker = body.attacker || {};
    const defender = body.defender || {};
    const skillMul = Number(body.skillMul) || 1;
    const isMagic = !!body.isMagic;

    const missChance = Math.max(0.02, 0.08 - (attacker.dex || 0) * 0.004 + (defender.dex || 0) * 0.003);
    if (Math.random() < missChance) {
      return json({ ok: true, hit: false, kind: "miss", damage: 0 });
    }

    const atk = isMagic ? attacker.matk || 0 : attacker.atk || 0;
    const def = isMagic ? defender.mdef || 0 : defender.def || 0;
    let raw = atk * skillMul;
    const crit = Math.random() < (attacker.crit || 0.05);
    const pierce = Math.random() < (attacker.pierce || 0.02);
    if (crit) raw *= 1.75;
    if (!pierce) raw = Math.max(1, raw - def * 0.55);
    else raw = Math.max(1, raw - def * 0.15);

    return json({
      ok: true,
      hit: true,
      kind: crit ? "crit" : pierce ? "pierce" : "hit",
      damage: Math.floor(raw),
      note: "stub — host still applies HP until world authority migrates",
    });
  } catch (e) {
    return json({ ok: false, msg: String(e?.message || e) }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
