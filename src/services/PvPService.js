/**
 * Metin2-style duel challenges.
 * Flow: invite → accept → countdown 5..0 → active PvP → death ends duel.
 */
export const PvPService = {
  enabled: true,

  /** @type {{ from: string, fromName: string, to: string } | null} */
  pendingChallenge: null,

  /**
   * @type {{
   *   id: string,
   *   a: string,
   *   b: string,
   *   aName: string,
   *   bName: string,
   *   state: "countdown" | "active",
   *   countdown: number,
   *   countdownAcc: number,
   * } | null}
   */
  duel: null,

  canChallenge(fromId, toId) {
    if (!this.enabled) return "PvP is disabled";
    if (!toId || toId === fromId) return "Invalid target";
    if (this.duel) return "Already in a duel";
    if (this.pendingChallenge) return "Challenge pending";
    return null;
  },

  isDueling(playerId) {
    if (!this.duel || this.duel.state !== "active") return false;
    return this.duel.a === playerId || this.duel.b === playerId;
  },

  isOpponent(localId, otherId) {
    if (!this.duel) return false;
    const { a, b, state } = this.duel;
    if (state !== "active") return false;
    return (localId === a && otherId === b) || (localId === b && otherId === a);
  },

  opponentId(localId) {
    if (!this.duel) return null;
    if (this.duel.a === localId) return this.duel.b;
    if (this.duel.b === localId) return this.duel.a;
    return null;
  },

  opponentName(localId) {
    if (!this.duel) return "";
    if (this.duel.a === localId) return this.duel.bName;
    if (this.duel.b === localId) return this.duel.aName;
    return "";
  },

  beginCountdown({ id, a, b, aName, bName }) {
    this.pendingChallenge = null;
    this.duel = {
      id,
      a,
      b,
      aName: aName || "Challenger",
      bName: bName || "Opponent",
      state: "countdown",
      countdown: 5,
      countdownAcc: 0,
    };
  },

  /** @returns {number | null} current countdown digit if changed, or "start" when fight begins */
  tickCountdown(dt) {
    if (!this.duel || this.duel.state !== "countdown") return null;
    this.duel.countdownAcc += dt;
    if (this.duel.countdownAcc < 1) return null;
    this.duel.countdownAcc -= 1;
    this.duel.countdown -= 1;
    if (this.duel.countdown <= 0) {
      this.duel.state = "active";
      this.duel.countdown = 0;
      return "start";
    }
    return this.duel.countdown;
  },

  end() {
    this.duel = null;
    this.pendingChallenge = null;
  },
};
