/**
 * Metin2-style quest scroll mail — notices & updates delivered as letters.
 * Accept / claim still happen at NPCs; mail only informs and asks Continue.
 */
import { QUESTS } from "../data/quests.js";
import { QuestService } from "./QuestService.js";

/** @typedef {{ id: string, type: 'hint'|'update'|'complete'|'accept'|'claim', title: string, body: string, questId?: string, ribbon?: string }} QuestMailMsg */

/** @type {QuestMailMsg[]} */
let queue = [];
/** Hints already sent this session (questId → true) */
const hinted = new Set();
let seq = 0;

function nextId(prefix) {
  seq += 1;
  return `${prefix}_${seq}_${Date.now()}`;
}

function giverName(giver) {
  if (giver === "biologist") return "Biologist";
  if (giver === "quest_elder") return "Village Elder";
  return "Questgiver";
}

export const QuestMail = {
  clear() {
    queue = [];
    hinted.clear();
  },

  /** Unread letters waiting to be opened */
  count() {
    return queue.length;
  },

  peek() {
    return queue[0] || null;
  },

  list() {
    return queue.slice();
  },

  /**
   * Push a letter. Progress updates for the same quest refresh in-place
   * so you don’t get 12 stacked wolf-kill letters.
   */
  push(msg) {
    if (!msg?.title || !msg?.body) return null;
    if (msg.type === "update" && msg.questId) {
      const existing = queue.find((m) => m.type === "update" && m.questId === msg.questId);
      if (existing) {
        existing.title = msg.title;
        existing.body = msg.body;
        existing.ribbon = msg.ribbon || existing.ribbon;
        return existing;
      }
    }
    if (msg.type === "complete" && msg.questId) {
      queue = queue.filter((m) => !(m.questId === msg.questId && m.type === "update"));
    }
    const entry = {
      id: msg.id || nextId("qm"),
      type: msg.type || "update",
      title: msg.title,
      body: msg.body,
      questId: msg.questId || null,
      ribbon: msg.ribbon || "Quest",
    };
    queue.push(entry);
    return entry;
  },

  /** Remove and return the front letter */
  shift() {
    return queue.shift() || null;
  },

  /** Dismiss current without removing? — use shift after Continue */
  dismissFront() {
    return this.shift();
  },

  /** Progress / complete from QuestService.onKill results */
  fromKillUpdates(updates) {
    if (!updates?.length) return;
    for (const u of updates) {
      if (u.completed) {
        this.push({
          type: "complete",
          questId: u.id,
          ribbon: "Quest Complete",
          title: u.name,
          body: `Objective finished (${u.progress}/${u.count}). Return to the quest giver and claim your reward.`,
        });
      } else {
        this.push({
          type: "update",
          questId: u.id,
          ribbon: "Quest Update",
          title: u.name,
          body: `Progress: ${u.progress} / ${u.count}. Keep hunting, then return when finished.`,
        });
      }
    }
  },

  /** After accepting at an NPC */
  onAccepted(q) {
    if (!q) return;
    this.push({
      type: "accept",
      questId: q.id,
      ribbon: "Quest Accepted",
      title: q.name,
      body: `${q.desc}\n\nObjective: ${q.count}× ${q.target || "target"}. Report back to the ${giverName(q.giver)} when done.`,
    });
  },

  /** After claiming reward */
  onClaimed(q, grantLine) {
    if (!q) return;
    this.push({
      type: "claim",
      questId: q.id,
      ribbon: "Reward",
      title: q.name,
      body: grantLine
        ? `You received: ${grantLine}`
        : `The ${giverName(q.giver)} thanks you. The kingdom is safer for your work.`,
    });
  },

  /**
   * Soft “go talk to NPC” notices for the next available quest per giver.
   * Re-checks when previous hint quest was accepted/finished.
   */
  scanHints(ch) {
    if (!ch) return;
    QuestService.ensure(ch);
    const givers = ["quest_elder", "biologist"];
    for (const giver of givers) {
      const q = QUESTS.find((x) => (x.giver || "quest_elder") === giver && QuestService.canAccept(ch, x) === null);
      if (!q) continue;
      if (hinted.has(q.id)) continue;
      hinted.add(q.id);
      const who = giverName(giver);
      const where = giver === "biologist" ? "near the research tents" : "in Shinsoo city";
      this.push({
        type: "hint",
        questId: q.id,
        ribbon: "Quest Notice",
        title: who,
        body: `${who} has a task for you — “${q.name}”. Find them ${where} and accept the quest.`,
      });
    }
  },
};
