import { supabase } from "./supabase.js";

/**
 * Smart multiplayer over Supabase Realtime:
 * - Presence = who's in the room (join/leave, host election)
 * - Broadcast player @ ~12Hz (positions you see each other)
 * - Broadcast world @ ~8Hz from host only (mobs/metins stay in sync)
 * - Broadcast events for attacks / hits / toasts
 */
export class RoomNet {
  constructor() {
    this.channel = null;
    this.roomCode = "";
    this.playerId = "";
    this.isHost = false;
    this.peers = new Map();
    this.onPeers = () => {};
    this.onPlayerState = () => {};
    this.onWorldState = () => {};
    this.onEvent = () => {};
    this.onHostChange = () => {};
    this._joinedAt = Date.now();
  }

  async join(roomCode, profile) {
    if (!supabase) throw new Error("Supabase not configured");
    await this.leave();

    this.roomCode = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "ARENA";
    this.playerId = profile.id;
    this._joinedAt = Date.now();
    this.peers.clear();

    const topic = `metin3:${this.roomCode}`;
    this.channel = supabase.channel(topic, {
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
        if (!payload) return;
        this.onEvent(payload);
      });

    const ok = await new Promise((resolve) => {
      this.channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.channel.track({
            id: profile.id,
            name: profile.name,
            classId: profile.classId,
            color: profile.color,
            joinedAt: this._joinedAt,
            metins: 0,
            kills: 0,
            level: 1,
          });
          resolve(true);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(false);
      });
    });

    if (!ok) {
      await this.leave();
      throw new Error("Could not join realtime channel — check Supabase Realtime is enabled");
    }

    this._syncPresence();
    return this.roomCode;
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
    if (!this.channel) return;
    const me = this.peers.get(this.playerId) || {};
    await this.channel.track({ ...me, ...patch, id: this.playerId });
  }

  async leave() {
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.peers.clear();
    this.isHost = false;
  }
}
