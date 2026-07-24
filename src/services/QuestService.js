import { QUESTS } from "../data/quests.js";
import { InventoryService } from "./InventoryService.js";
import { xpForLevel } from "../data/stats.js";

export const QuestService = {
  all: QUESTS,
  ensure(ch) {
    if (!ch.quests) ch.quests = {};
  },
  accept(ch, questId) {
    this.ensure(ch);
    const q = QUESTS.find((x) => x.id === questId);
    if (!q) return "Unknown quest";
    if (ch.level < q.levelReq) return `Need Lv.${q.levelReq}`;
    if (ch.quests[questId]?.state === "claimed") return "Already done";
    ch.quests[questId] = { state: "accepted", progress: 0 };
    return null;
  },
  onKill(ch, kind) {
    this.ensure(ch);
    for (const q of QUESTS) {
      const st = ch.quests[q.id];
      if (!st || st.state !== "accepted") continue;
      if (q.type === "kill" && q.target === kind) {
        st.progress = (st.progress || 0) + 1;
        if (st.progress >= q.count) st.state = "completed";
      }
      if (q.type === "metin" && kind === "metin") {
        st.progress = (st.progress || 0) + 1;
        if (st.progress >= q.count) st.state = "completed";
      }
    }
  },
  claim(ch, questId) {
    this.ensure(ch);
    const q = QUESTS.find((x) => x.id === questId);
    const st = ch.quests[questId];
    if (!q || !st || st.state !== "completed") return "Not ready";
    ch.gold += q.reward.yang || 0;
    ch.xp += q.reward.xp || 0;
    while (ch.xp >= xpForLevel(ch.level) && ch.level < 99) {
      ch.xp -= xpForLevel(ch.level);
      ch.level += 1;
      ch.statPoints += 3;
    }
    ch.xpNext = xpForLevel(ch.level);
    if (q.reward.item) InventoryService.add(ch, q.reward.item, 1);
    st.state = "claimed";
    return null;
  },
};
