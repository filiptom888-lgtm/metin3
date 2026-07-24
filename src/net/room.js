import { supabase } from "./supabase.js";

/**
 * Room flow:
 * 1) Create / Join → waiting lobby (Presence)
 * 2) Creator broadcasts "start" → everyone loads the match
 * 3) During match: player/world/evt broadcasts
 */
export class RoomNet {
  constructor() {
    this.channel = null;
    this.roomCode = "";
    this.playerId = "";
    this.isCreator = false;
    this.isHost = false;
    this.started = false;
    this.peers = new Map();
    this.onPeers = () => {};
    this.onPlayerState = () => {};
    this.onWorldState = () => {};
    this.onEvent = () => {};
    this.onHostChange = () => {};
    this.onMatchStart = () => {};
    this._joinedAt = Date.now();
    this._profile = null;
  }

  async join(roomCode, profile, { asCreator = false } = {}) {
    if (!supabase) throw new Error("Supabase not configured");
    await this.leave();

    this.roomCode = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "ARENA";
    this.playerId = profile.id;
    this.isCreator = asCreator;
    this.started = false;
    this._joinedAt = Date.now();
    this._profile = profile;
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
        if (payload.type === "start") {
          this._handleStart(payload);
          return;
        }
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
            isCreator: asCreator,
            metins: 0,
            kills: 0,
            level: 1,
            ready: true,
          });
          resolve(true);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(false);
      });
    });

    if (!ok) {
      await this.leave();
      throw new Error("Could not join realtime channel — enable Anonymous Auth + Realtime in Supabase");
    }

    this._syncPresence();
    return this.roomCode;
  }

  _handleStart(payload) {
    if (this.started) return;
    this.started = true;
    this.onMatchStart(payload);
  }

  /** Creator only — starts the match for everyone */
  startMatch() {
    if (!this.isCreator) throw new Error("Only the room creator can start");
    if (this.started) return;
    const payload = {
      type: "start",
      from: this.playerId,
      room: this.roomCode,
      at: Date.now(),
    };
    this.channel?.send({ type: "broadcast", event: "evt", payload });
    // self:false → creator must start locally too
    this._handleStart(payload);
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

    // Keep creator flag if we created, even if presence lag
    const me = this.peers.get(this.playerId);
    if (me?.isCreator) this.isCreator = true;

    this._electHost();
    this.onPeers([...this.peers.values()]);
  }

  _electHost() {
    const list = [...this.peers.values()];
    if (!list.length) return;
    // Prefer original creator; else earliest joiner
    const creator = list.find((p) => p.isCreator);
    let hostId;
    if (creator) hostId = creator.id;
    else {
      list.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.id).localeCompare(String(b.id)));
      hostId = list[0].id;
    }
    const was = this.isHost;
    this.isHost = hostId === this.playerId;
    if (was !== this.isHost) this.onHostChange(this.isHost, hostId);
  }

  sendPlayer(state) {
    if (!this.started) return;
    this.channel?.send({ type: "broadcast", event: "player", payload: state });
  }

  sendWorld(state) {
    if (!this.isHost || !this.started) return;
    this.channel?.send({ type: "broadcast", event: "world", payload: state });
  }

  sendEvent(evt) {
    if (!this.started && evt?.type !== "start") return;
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
      isCreator: this.isCreator,
      joinedAt: this._joinedAt,
    });
  }

  async leave() {
    if (this.channel && supabase) {
      await supabase.removeChannel(this.channel);
    }
    this.channel = null;
    this.peers.clear();
    this.isHost = false;
    this.isCreator = false;
    this.started = false;
    this._profile = null;
  }
}

export function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}
