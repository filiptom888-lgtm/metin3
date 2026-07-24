// Stub: claim quest reward once; validates character ownership.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const QUESTS = {
  q_wolves: { yang: 500, xp: 150, item: "red_potion" },
  q_metin: { yang: 2000, xp: 400, item: "upgrade_ore" },
  q_orks: { yang: 3500, xp: 600, item: "iron_blade" },
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
    if (!userData?.user) return json({ ok: false, msg: "Unauthorized" }, 401);

    const { characterId, questId } = await req.json();
    const reward = QUESTS[questId];
    if (!reward) return json({ ok: false, msg: "Unknown quest" }, 400);

    const { data: ch } = await supabase
      .from("characters")
      .select("*")
      .eq("id", characterId)
      .eq("user_id", userData.user.id)
      .single();
    if (!ch) return json({ ok: false, msg: "Character not found" }, 404);

    const quests = ch.quests || {};
    const st = quests[questId];
    if (!st || st.state !== "completed") return json({ ok: false, msg: "Not ready" });

    quests[questId] = { ...st, state: "claimed" };
    const gold = (ch.gold || 0) + reward.yang;
    const xp = (ch.xp || 0) + reward.xp;

    await supabase
      .from("characters")
      .update({ gold, xp, quests, updated_at: new Date().toISOString() })
      .eq("id", characterId);

    return json({ ok: true, reward, gold, xp, quests });
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
