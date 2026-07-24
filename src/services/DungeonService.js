import { DEMON_TOWER, floorConfig } from "../data/demonTower.js";
import { PartyService } from "./PartyService.js";

/** Demon Tower instance orchestration */
export const DungeonService = {
  enabled: true,
  tower: DEMON_TOWER,
  /** @type {{ instanceId: string, floor: number, leaderId: string, partyId: string|null, active: boolean } | null} */
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
    };
    return this.run;
  },

  setFloor(n) {
    if (!this.run) return null;
    this.run.floor = Math.min(DEMON_TOWER.maxFloor, Math.max(1, n));
    this.run.cleared = false;
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

  exit() {
    this.run = null;
  },

  /** Party may enter together if local is leader or solo */
  canEnter(localId) {
    if (!PartyService.party) return { ok: true, withParty: false };
    if (PartyService.isLeader(localId)) return { ok: true, withParty: true };
    return { ok: false, reason: "Only the party leader can enter the Demon Tower" };
  },

  arenaPos(index = 0, total = 1) {
    const a = DEMON_TOWER.arena;
    const ang = (index / Math.max(1, total)) * Math.PI * 2;
    return { x: a.x + Math.cos(ang) * 2.2, z: a.z + Math.sin(ang) * 2.2 };
  },
};
