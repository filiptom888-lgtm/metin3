// Supabase Edge Function: upgrade-item
// Deploy: supabase functions deploy upgrade-item
// Uses service role; validates auth.uid() owns character; never trusts client "success".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UPGRADE_TABLE = {
  0: { chance: 0.9, yang: 1000, downgrade: false, destroyOnFail: false },
  1: { chance: 0.8, yang: 2500, downgrade: false, destroyOnFail: false },
  2: { chance: 0.7, yang: 5000, downgrade: false, destroyOnFail: false },
  3: { chance: 0.55, yang: 10000, downgrade: true, destroyOnFail: false },
  4: { chance: 0.45, yang: 20000, downgrade: true, destroyOnFail: false },
  5: { chance: 0.35, yang: 40000, downgrade: true, destroyOnFail: true },
  6: { chance: 0.28, yang: 80000, downgrade: true, destroyOnFail: true },
  7: { chance: 0.2, yang: 150000, downgrade: true, destroyOnFail: true },
  8: { chance: 0.12, yang: 300000, downgrade: true, destroyOnFail: true },
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );

    const anon = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await anon.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ ok: false, msg: "Unauthorized" }, 401);

    const body = await req.json();
    const { characterId, instanceUid } = body;
    if (!characterId || !instanceUid) return json({ ok: false, msg: "Missing fields" }, 400);

    const { data: ch, error } = await supabase
      .from("characters")
      .select("*")
      .eq("id", characterId)
      .eq("user_id", user.id)
      .single();
    if (error || !ch) return json({ ok: false, msg: "Character not found" }, 404);

    const inventory = Array.isArray(ch.inventory) ? [...ch.inventory] : [];
    const equipment = ch.equipment && typeof ch.equipment === "object" ? { ...ch.equipment } : {};
    let inst =
      inventory.find((x) => x.uid === instanceUid) ||
      Object.values(equipment).find((x) => x?.uid === instanceUid);
    if (!inst) return json({ ok: false, msg: "Item not found" }, 404);

    const level = inst.upgrade || 0;
    if (level >= 9) return json({ ok: false, msg: "Already +9" });
    const recipe = UPGRADE_TABLE[level];
    if ((ch.gold || 0) < recipe.yang) return json({ ok: false, msg: "Not enough Yang" });

    let gold = ch.gold - recipe.yang;
    const roll = Math.random();
    let msg;
    let ok = false;

    if (roll <= recipe.chance) {
      inst.upgrade = level + 1;
      ok = true;
      msg = `Success! Now +${inst.upgrade}`;
    } else if (recipe.destroyOnFail && roll > recipe.chance + 0.35) {
      const invIdx = inventory.findIndex((x) => x.uid === instanceUid);
      if (invIdx >= 0) inventory.splice(invIdx, 1);
      for (const slot of Object.keys(equipment)) {
        if (equipment[slot]?.uid === instanceUid) delete equipment[slot];
      }
      msg = "Upgrade failed — item destroyed!";
    } else if (recipe.downgrade && level > 0) {
      inst.upgrade = level - 1;
      msg = `Failed — downgraded to +${inst.upgrade}`;
    } else {
      msg = "Upgrade failed";
    }

    // write back mutated instance refs
    for (let i = 0; i < inventory.length; i++) {
      if (inventory[i].uid === instanceUid) inventory[i] = inst;
    }
    for (const slot of Object.keys(equipment)) {
      if (equipment[slot]?.uid === instanceUid) equipment[slot] = inst;
    }

    const { error: upErr } = await supabase
      .from("characters")
      .update({ gold, inventory, equipment, updated_at: new Date().toISOString() })
      .eq("id", characterId)
      .eq("user_id", user.id);
    if (upErr) return json({ ok: false, msg: upErr.message }, 500);

    return json({ ok, msg, upgrade: inst.upgrade, gold, inventory, equipment });
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
