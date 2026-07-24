// Stub: server-side drop roll. Prefer creating item_instances rows when wired.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DROP_TABLES = {
  wolf: [
    { id: "red_potion", chance: 0.4, qty: [1, 2] },
    { id: "rusty_sword", chance: 0.05 },
    { id: "upgrade_ore", chance: 0.08 },
  ],
  ork: [
    { id: "orange_potion", chance: 0.15 },
    { id: "iron_blade", chance: 0.07 },
    { id: "upgrade_ore", chance: 0.15 },
  ],
  metin: [
    { id: "tiger_fang", chance: 0.09 },
    { id: "upgrade_ore", chance: 0.45, qty: [1, 4] },
    { id: "dragon_edge", chance: 0.025 },
  ],
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
    const anon = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await anon.auth.getUser();
    if (!userData?.user) return json({ ok: false, msg: "Unauthorized" }, 401);

    const body = await req.json();
    const tableId = body.tableId || "wolf";
    const table = DROP_TABLES[tableId] || DROP_TABLES.wolf;
    const items = [];
    for (const row of table) {
      if (Math.random() > row.chance) continue;
      const qty = row.qty
        ? row.qty[0] + ((Math.random() * (row.qty[1] - row.qty[0] + 1)) | 0)
        : 1;
      items.push({
        uid: `ii_${crypto.randomUUID().slice(0, 8)}`,
        itemId: row.id,
        qty,
        upgrade: 0,
        bonuses: [],
        sockets: [],
        bound: false,
      });
    }
    return json({ ok: true, items, note: "stub — client DropService still used as fallback" });
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
