/**
 * Metin2-style trade requests + two-sided offer window.
 * Offered items are pulled from inventory until cancel / complete.
 */
import { ITEM_TEMPLATES } from "../data/items.js";

function cloneInst(inst) {
  return {
    uid: inst.uid,
    itemId: inst.itemId,
    qty: inst.qty || 1,
    upgrade: inst.upgrade || 0,
    bonuses: (inst.bonuses || []).map((b) => ({ ...b })),
    sockets: [...(inst.sockets || [])],
    bound: !!inst.bound,
  };
}

export const TradeService = {
  enabled: true,

  /** @type {{ from: string, fromName: string, to: string } | null} */
  pendingInvite: null,

  /**
   * @type {{
   *   id: string,
   *   withId: string,
   *   withName: string,
   *   myItems: object[],
   *   theirItems: object[],
   *   myYang: number,
   *   theirYang: number,
   *   myLock: boolean,
   *   theirLock: boolean,
   *   myConfirm: boolean,
   *   theirConfirm: boolean,
   * } | null}
   */
  session: null,

  canInvite(fromId, toId) {
    if (!this.enabled) return "Trade is disabled";
    if (!toId || toId === fromId) return "Invalid target";
    if (this.session) return "Already trading";
    if (this.pendingInvite) return "Trade request pending";
    return null;
  },

  open(id, withId, withName) {
    this.pendingInvite = null;
    this.session = {
      id,
      withId,
      withName: withName || "Trader",
      myItems: [],
      theirItems: [],
      myYang: 0,
      theirYang: 0,
      myLock: false,
      theirLock: false,
      myConfirm: false,
      theirConfirm: false,
    };
  },

  close() {
    this.session = null;
    this.pendingInvite = null;
  },

  /** Move item from inventory into my offer */
  offerItem(ch, uid) {
    const s = this.session;
    if (!s || s.myLock) return "Offer is locked";
    if (s.myItems.length >= 8) return "Trade slots full";
    const i = ch.inventory.findIndex((x) => x.uid === uid);
    if (i < 0) return "Missing item";
    const stack = ch.inventory[i];
    const t = ITEM_TEMPLATES[stack.itemId];
    if (!t) return "Invalid item";
    // Take whole stack into trade
    const moved = cloneInst(stack);
    ch.inventory.splice(i, 1);
    s.myItems.push(moved);
    s.myConfirm = false;
    s.theirConfirm = false;
    return null;
  },

  /** Return one offered item to inventory */
  withdrawItem(ch, uid) {
    const s = this.session;
    if (!s || s.myLock) return "Offer is locked";
    const i = s.myItems.findIndex((x) => x.uid === uid);
    if (i < 0) return "Not in trade";
    const [inst] = s.myItems.splice(i, 1);
    ch.inventory.push(cloneInst(inst));
    s.myConfirm = false;
    s.theirConfirm = false;
    return null;
  },

  setYang(ch, amount) {
    const s = this.session;
    if (!s || s.myLock) return "Offer is locked";
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n > (ch.gold || 0)) return "Not enough Yang";
    s.myYang = n;
    s.myConfirm = false;
    s.theirConfirm = false;
    return null;
  },

  applyTheirOffer(items, yang) {
    const s = this.session;
    if (!s) return;
    s.theirItems = (items || []).map(cloneInst);
    s.theirYang = Math.max(0, Math.floor(yang || 0));
    s.myConfirm = false;
    s.theirConfirm = false;
  },

  setLock(mine, locked) {
    const s = this.session;
    if (!s) return;
    if (mine) {
      s.myLock = !!locked;
      if (!locked) {
        s.myConfirm = false;
        s.theirConfirm = false;
      }
    } else {
      s.theirLock = !!locked;
      if (!locked) {
        s.myConfirm = false;
        s.theirConfirm = false;
      }
    }
  },

  setConfirm(mine, confirmed) {
    const s = this.session;
    if (!s) return "No trade";
    if (!s.myLock || !s.theirLock) return "Both must lock first";
    if (mine) s.myConfirm = !!confirmed;
    else s.theirConfirm = !!confirmed;
    return null;
  },

  bothConfirmed() {
    const s = this.session;
    return !!(s && s.myLock && s.theirLock && s.myConfirm && s.theirConfirm);
  },

  /** Restore my offered items + keep yang (yang never left wallet until execute) */
  cancelRestore(ch) {
    const s = this.session;
    if (!s || !ch) {
      this.close();
      return;
    }
    for (const inst of s.myItems) ch.inventory.push(cloneInst(inst));
    s.myItems = [];
    this.close();
  },

  /** Finalize: spend my yang, keep their items (my items already removed) */
  execute(ch) {
    const s = this.session;
    if (!s || !ch) return "No trade";
    if ((ch.gold || 0) < s.myYang) return "Not enough Yang";
    ch.gold -= s.myYang;
    ch.gold += s.theirYang;
    for (const inst of s.theirItems) ch.inventory.push(cloneInst(inst));
    s.myItems = [];
    this.close();
    return null;
  },

  myOfferPayload() {
    const s = this.session;
    if (!s) return null;
    return {
      items: s.myItems.map(cloneInst),
      yang: s.myYang,
    };
  },
};
