/** Party invite / leave / sync (open-world + Demon Tower) */
export const PartyService = {
  enabled: true,
  /** @type {{ id: string, leaderId: string, members: { id: string, name: string, classId?: string, level?: number }[] } | null} */
  party: null,
  /** pending invite shown to local player */
  pendingInvite: null,

  create(leader) {
    this.party = {
      id: `pty_${leader.id}_${Date.now().toString(36)}`,
      leaderId: leader.id,
      members: [{ id: leader.id, name: leader.name, classId: leader.classId, level: leader.level }],
    };
    this.pendingInvite = null;
    return this.party;
  },

  isInParty(playerId) {
    return !!this.party?.members.some((m) => m.id === playerId);
  },

  isLeader(playerId) {
    return this.party?.leaderId === playerId;
  },

  memberIds() {
    return (this.party?.members || []).map((m) => m.id);
  },

  size() {
    return this.party?.members.length || 0;
  },

  invite(toId, fromProfile) {
    if (!this.party) this.create(fromProfile);
    if (!this.isLeader(fromProfile.id)) return "Only the party leader can invite";
    if (this.party.members.length >= 4) return "Party is full (4)";
    if (this.party.members.some((m) => m.id === toId)) return "Already in party";
    return null;
  },

  applyRemoteParty(party) {
    this.party = party;
    this.pendingInvite = null;
  },

  addMember(member) {
    if (!this.party) return;
    if (this.party.members.some((m) => m.id === member.id)) return;
    if (this.party.members.length >= 4) return;
    this.party.members.push({
      id: member.id,
      name: member.name,
      classId: member.classId,
      level: member.level,
    });
  },

  removeMember(playerId) {
    if (!this.party) return;
    this.party.members = this.party.members.filter((m) => m.id !== playerId);
    if (!this.party.members.length) {
      this.party = null;
      return;
    }
    if (this.party.leaderId === playerId) {
      this.party.leaderId = this.party.members[0].id;
    }
  },

  /** Local player leaves; returns remaining party snapshot for sync (or null if empty). */
  leaveLocal(localId) {
    if (!this.party) return null;
    const remaining = {
      id: this.party.id,
      leaderId: this.party.leaderId,
      members: this.party.members.filter((m) => m.id !== localId),
    };
    if (remaining.leaderId === localId && remaining.members.length) {
      remaining.leaderId = remaining.members[0].id;
    }
    this.party = null;
    this.pendingInvite = null;
    return remaining.members.length ? remaining : null;
  },

  disband() {
    this.party = null;
    this.pendingInvite = null;
  },
};
