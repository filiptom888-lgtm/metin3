import { DEMON_TOWER, floorConfig, TOWER_SMITH_NPC } from "../data/demonTower.js";
import { PartyService } from "./PartyService.js";

/** Demon Tower instance orchestration */
export const DungeonService = {
  enabled: true,
  tower: DEMON_TOWER,
  smithNpc: TOWER_SMITH_NPC,
  /**
   * @type {{
   *   instanceId: string,
   *   floor: number,
   *   leaderId: string,
   *   partyId: string|null,
   *   active: boolean,
   *   cleared: boolean,
   *   smithReady: boolean,
   *   smithUses: Record<string, number>,
   * } | null}
   */
  run: null,

  floorConfig,

  isInside() {
    return !!this.run?.active;
  },

  start({ leaderId, partyId = null, instanceId = null }) {
    this.run = {
      instanceId: instanceId || `dt_${leaderId}_${Date.now().toString(36)}`,
      floor: 1,
      leaderId,
      partyId,
      active: true,
      cleared: false,
      smithReady: false,
      smithUses: {},
    };
    return this.run;
  },

  setFloor(n) {
    if (!this.run) return null;
    this.run.floor = Math.min(DEMON_TOWER.maxFloor, Math.max(1, n));
    this.run.cleared = false;
    this.run.smithReady = false;
    return floorConfig(this.run.floor);
  },

  markCleared() {
    if (this.run) this.run.cleared = true;
  },

  canAdvance() {
    return this.run?.cleared && this.run.floor < DEMON_TOWER.maxFloor;
  },

  isFinal() {
    return this.run?.floor >= DEMON_TOWER.maxFloor;
  },

  /** Enable Infernal Blacksmith after floor 7 metins */
  enableSmith(memberIds = []) {
    if (!this.run) return;
    this.run.smithReady = true;
    const uses = DEMON_TOWER.smithUses ?? 3;
    for (const id of memberIds) {
      if (this.run.smithUses[id] == null) this.run.smithUses[id] = uses;
    }
  },

  smithUsesLeft(playerId) {
    if (!this.run?.smithReady) return 0;
    if (this.run.smithUses[playerId] == null) {
      this.run.smithUses[playerId] = DEMON_TOWER.smithUses ?? 3;
    }
    return this.run.smithUses[playerId];
  },

  consumeSmithUse(playerId) {
    const left = this.smithUsesLeft(playerId);
    if (left <= 0) return false;
    this.run.smithUses[playerId] = left - 1;
    return true;
  },

  exit() {
    this.run = null;
  },

  /**
   * Solo always allowed. Party enter only for the leader.
   * @param {string} localId
   * @param {{ withParty?: boolean }} opts
   */
  canEnter(localId, { withParty = false } = {}) {
    if (!withParty) return { ok: true, withParty: false };
    if (!PartyService.party) return { ok: false, reason: "Form a party first (P)" };
    if (!PartyService.isLeader(localId)) {
      return { ok: false, reason: "Only the party leader can start a party run" };
    }
    return { ok: true, withParty: true };
  },

  arenaPos(index = 0, total = 1) {
    const a = DEMON_TOWER.arena;
    const ang = (index / Math.max(1, total)) * Math.PI * 2;
    return { x: a.x + Math.cos(ang) * 2.2, z: a.z + Math.sin(ang) * 2.2 };
  },
};
