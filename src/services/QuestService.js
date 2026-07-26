import { QUESTS } from "../data/quests.js";
import { ITEM_TEMPLATES } from "../data/items.js";
import { InventoryService } from "./InventoryService.js";
import { DropService } from "./DropService.js";
import { xpForLevel, MAX_LEVEL } from "../data/stats.js";

/** Map kill report kinds → quest targets */
const KIND_ALIASES = {
  dog: ["dog"],
  wolf: ["wolf"],
  alpha_wolf: ["wolf", "alpha_wolf"],
  ork: ["ork"],
  elite_ork: ["ork", "elite_ork"],
  black_ork: ["ork", "black_ork"],
  black_ork_brute: ["ork", "black_ork", "black_ork_brute"],
  orc_chief: ["ork", "black_ork", "orc_chief"],
  bandit: ["bandit", "human", "soldier", "rogue_chief"],
  soldier: ["soldier", "bandit", "human", "rogue_chief"],
  human: ["bandit", "human", "soldier", "rogue_chief"],
  rogue_chief: ["rogue_chief"],
  metin: ["metin"],
};

/** Normalize reward.item / reward.items into grant list */
export function normalizeRewardItems(reward = {}) {
  const grants = [];
  if (reward.item) {
    grants.push({ id: reward.item, qty: reward.itemQty || 1 });
  }
  for (const g of reward.items || []) {
    if (!g?.id) continue;
    grants.push({ id: g.id, qty: g.qty ?? 1 });
  }
  return grants;
}

/** Human-readable reward line for UI */
export function formatQuestReward(reward = {}) {
  const parts = [];
  if (reward.xp) parts.push(`${reward.xp} XP`);
  if (reward.yang) parts.push(`${reward.yang} Yang`);
  for (const g of normalizeRewardItems(reward)) {
    const name = ITEM_TEMPLATES[g.id]?.name || g.id;
    parts.push(g.qty > 1 ? `${name} ×${g.qty}` : name);
  }
  if (reward.loot?.length) parts.push("bonus loot roll");
  return parts.join(" · ") || "—";
}

export const QuestService = {
  all: QUESTS,

  ensure(ch) {
    if (!ch) return;
    let q = ch.quests;
    if (typeof q === "string") {
      try {
        q = JSON.parse(q);
      } catch {
        q = {};
      }
    }
    if (!q || typeof q !== "object" || Array.isArray(q)) q = {};
    ch.quests = q;
  },

  get(questId) {
    return QUESTS.find((x) => x.id === questId) || null;
  },

  forGiver(giverId) {
    if (!giverId) return QUESTS.slice();
    return QUESTS.filter((q) => (q.giver || "quest_elder") === giverId);
  },

  stateOf(ch, questId) {
    this.ensure(ch);
    return ch.quests[questId] || null;
  },

  canAccept(ch, q) {
    this.ensure(ch);
    if (!q) return "Unknown quest";
    if (ch.level < q.levelReq) return `Need Lv.${q.levelReq}`;
    const st = ch.quests[q.id];
    if (st?.state === "claimed") return "Already finished";
    if (st?.state === "accepted" || st?.state === "completed") return "Already taken";
    if (q.requires) {
      const prev = ch.quests[q.requires];
      if (!prev || prev.state !== "claimed") {
        const need = this.get(q.requires);
        return `Finish "${need?.name || q.requires}" first`;
      }
    }
    return null;
  },

  accept(ch, questId) {
    this.ensure(ch);
    const q = this.get(questId);
    const err = this.canAccept(ch, q);
    if (err) return err;
    ch.quests = { ...ch.quests, [questId]: { state: "accepted", progress: 0 } };
    return null;
  },

  /**
   * @returns {{ id: string, name: string, progress: number, count: number, completed: boolean }[]}
   */
  onKill(ch, kind) {
    this.ensure(ch);
    const aliases = KIND_ALIASES[kind] || [kind];
    const updates = [];
    let changed = false;
    const next = { ...ch.quests };

    for (const q of QUESTS) {
      const st = next[q.id];
      if (!st || st.state !== "accepted") continue;

      let match = false;
      if (q.type === "kill" && aliases.includes(q.target)) match = true;
      if (q.type === "metin" && (kind === "metin" || aliases.includes("metin"))) match = true;
      if (!match) continue;

      const progress = Math.min(q.count, (st.progress || 0) + 1);
      const completed = progress >= q.count;
      next[q.id] = {
        ...st,
        progress,
        state: completed ? "completed" : "accepted",
      };
      changed = true;
      updates.push({
        id: q.id,
        name: q.name,
        progress,
        count: q.count,
        completed,
      });
    }

    if (changed) ch.quests = next;
    return updates;
  },

  /**
   * Claim rewards. Returns null on success, or error string.
   * On success also sets ch._lastQuestGrants for UI toast.
   */
  claim(ch, questId) {
    this.ensure(ch);
    const q = this.get(questId);
    const st = ch.quests[questId];
    if (!q || !st || st.state !== "completed") return "Not ready — finish the objective first";

    const reward = q.reward || {};
    const grants = normalizeRewardItems(reward);

    // Validate items before applying currency
    for (const g of grants) {
      if (!ITEM_TEMPLATES[g.id]) return `Unknown reward item: ${g.id}`;
    }

    ch.gold += reward.yang || 0;
    ch.xp += reward.xp || 0;
    while (ch.xp >= xpForLevel(ch.level) && ch.level < MAX_LEVEL) {
      ch.xp -= xpForLevel(ch.level);
      ch.level += 1;
      ch.statPoints += 3;
    }
    if (ch.level > MAX_LEVEL) ch.level = MAX_LEVEL;
    ch.xpNext = xpForLevel(ch.level);

    const granted = [];
    for (const g of grants) {
      const ok = InventoryService.add(ch, g.id, g.qty ?? 1);
      if (!ok) return `Could not grant ${g.id}`;
      granted.push({
        id: g.id,
        qty: g.qty ?? 1,
        name: ITEM_TEMPLATES[g.id]?.name || g.id,
      });
    }

    // Optional bonus loot roll (no global scarcity — quest chances as written)
    if (reward.loot?.length) {
      const rolled = DropService.rollEntries(reward.loot, 1);
      for (const inst of rolled) {
        const t = ITEM_TEMPLATES[inst.itemId];
        if (!t) continue;
        if (t.stackable) {
          InventoryService.add(ch, inst.itemId, inst.qty || 1);
        } else {
          ch.inventory.push(inst);
        }
        granted.push({
          id: inst.itemId,
          qty: inst.qty || 1,
          name: t.name || inst.itemId,
          bonus: true,
        });
      }
    }

    ch.quests = { ...ch.quests, [questId]: { ...st, state: "claimed", progress: q.count } };
    ch._lastQuestGrants = {
      questId,
      name: q.name,
      xp: reward.xp || 0,
      yang: reward.yang || 0,
      items: granted,
    };
    return null;
  },

  formatReward: formatQuestReward,

  activeList(ch) {
    this.ensure(ch);
    const out = [];
    for (const q of QUESTS) {
      const st = ch.quests[q.id];
      if (!st) continue;
      if (st.state === "accepted" || st.state === "completed") {
        out.push({
          id: q.id,
          name: q.name,
          desc: q.desc,
          progress: st.progress || 0,
          count: q.count,
          state: st.state,
          giver: q.giver || "quest_elder",
        });
      }
    }
    out.sort((a, b) => (a.state === "completed" ? 0 : 1) - (b.state === "completed" ? 0 : 1));
    return out;
  },

  label(state) {
    return (
      {
        available: "Available",
        accepted: "In progress",
        completed: "Ready to turn in",
        claimed: "Finished",
        locked: "Locked",
      }[state] || state
    );
  },
};
