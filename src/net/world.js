import { supabase } from "./supabase.js";

/**
 * Single persistent open world — everyone joins metin3:openworld
 */
export class WorldNet {
  constructor() {
    this.channel = null;
    this.playerId = "";
    this.isHost = false;
    this.started = true;
    this.peers = new Map();
    this.onPeers = () => {};
    this.onPlayerState = () => {};
    this.onWorldState = () => {};
    this.onEvent = () => {};
    this.onHostChange = () => {};
    this._joinedAt = Date.now();
    this._profile = null;
  }

  get isCreator() {
    return this.isHost;
  }

  get roomCode() {
    return "WORLD";
  }

  async join(_ignored, profile) {
    if (!supabase) throw new Error("Supabase not configured");
    await this.leave();

    this.playerId = profile.id;
    this._joinedAt = Date.now();
    this._profile = profile;
    this.peers.clear();
    this.started = true;

    this.channel = supabase.channel("metin3:openworld", {
      config: {
        presence: { key: this.playerId },
        broadcast: { self: false },
      },
    });

    this.channel
      .on("presence", { event: "sync" }, () => this._syncPresence())
      .on("broadcast", { event: "player" }, ({ payload }) => {
        if (!payload || payload.id === this.playerId) return;
        this.onPlayerState(payload);
      })
      .on("broadcast", { event: "world" }, ({ payload }) => {
        if (this.isHost) return;
        this.onWorldState(payload);
      })
      .on("broadcast", { event: "evt" }, ({ payload }) => {
        if (payload) this.onEvent(payload);
      });

    const ok = await new Promise((resolve) => {
      this.channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.channel.track({
            id: profile.id,
            name: profile.name,
            classId: profile.classId,
            color: profile.color,
            level: profile.level || 1,
            joinedAt: this._joinedAt,
            metins: profile.metins || 0,
            kills: profile.kills || 0,
          });
          resolve(true);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(false);
      });
    });

    if (!ok) {
      await this.leave();
      throw new Error("Could not join open world — check Realtime + Anonymous auth");
    }

    this._syncPresence();
    return "WORLD";
  }

  _syncPresence() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const next = new Map();
    for (const key of Object.keys(state)) {
      const meta = state[key]?.[0];
      if (!meta?.id) continue;
      next.set(meta.id, meta);
    }
    this.peers = next;
    this._electHost();
    this.onPeers([...this.peers.values()]);
  }

  _electHost() {
    const list = [...this.peers.values()];
    if (!list.length) return;
    list.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.id).localeCompare(String(b.id)));
    const hostId = list[0].id;
    const was = this.isHost;
    this.isHost = hostId === this.playerId;
    if (was !== this.isHost) this.onHostChange(this.isHost, hostId);
  }

  sendPlayer(state) {
    this.channel?.send({ type: "broadcast", event: "player", payload: state });
  }

  sendWorld(state) {
    if (!this.isHost) return;
    this.channel?.send({ type: "broadcast", event: "world", payload: state });
  }

  sendEvent(evt) {
    this.channel?.send({ type: "broadcast", event: "evt", payload: evt });
  }

  async updatePresence(patch) {
    if (!this.channel || !this._profile) return;
    const me = this.peers.get(this.playerId) || {};
    await this.channel.track({
      ...me,
      ...patch,
      id: this.playerId,
      name: this._profile.name,
      classId: this._profile.classId,
      color: this._profile.color,
      joinedAt: this._joinedAt,
    });
  }

  // Compatibility stubs from old RoomNet
  startMatch() {}

  async leave() {
    if (this.channel && supabase) {
      await supabase.removeChannel(this.channel);
    }
    this.channel = null;
    this.peers.clear();
    this.isHost = false;
    this._profile = null;
  }
}
