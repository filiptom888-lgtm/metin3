import { supabase } from "./supabase.js";

/**
 * Single persistent open world — everyone joins metin3:openworld
 * High-frequency updates go over WebSocket only (never silent REST fallback).
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
    this._status = "closed";
    this._reconnecting = false;
    this._authUnsub = null;
    this._reconnectTimer = 0;
  }

  get isCreator() {
    return this.isHost;
  }

  get roomCode() {
    return "WORLD";
  }

  /** True when broadcast can go over the live WebSocket (no REST fallback). */
  get canPush() {
    return !!this.channel && this._status === "SUBSCRIBED" && this.channel.state === "joined";
  }

  async join(_ignored, profile) {
    if (!supabase) throw new Error("Supabase not configured");
    await this.leave();

    this.playerId = profile.id;
    this._joinedAt = Date.now();
    this._profile = profile;
    this.peers.clear();
    this.started = true;

    // Keep Realtime JWT in sync (token refresh used to drop push → REST spam)
    await this._syncRealtimeAuth();
    if (!this._authUnsub) {
      const { data } = supabase.auth.onAuthStateChange(async () => {
        await this._syncRealtimeAuth();
      });
      this._authUnsub = data?.subscription || null;
    }

    const ok = await this._subscribeChannel();
    if (!ok) {
      await this.leave();
      throw new Error("Could not join open world — check Realtime + Anonymous auth");
    }

    this._syncPresence();
    return "WORLD";
  }

  async _syncRealtimeAuth() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) await supabase.realtime.setAuth(token);
  }

  async _subscribeChannel() {
    if (!supabase || !this._profile) return false;

    if (this.channel) {
      try {
        await supabase.removeChannel(this.channel);
      } catch {
        /* ignore */
      }
      this.channel = null;
    }

    this._status = "joining";
    this.channel = supabase.channel("metin3:openworld", {
      config: {
        presence: { key: this.playerId },
        broadcast: { self: false, ack: false },
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

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      this.channel.subscribe(async (status, err) => {
        this._status = status;
        if (status === "SUBSCRIBED") {
          this._reconnecting = false;
          try {
            await this.channel.track({
              id: this._profile.id,
              name: this._profile.name,
              classId: this._profile.classId,
              color: this._profile.color,
              level: this._profile.level || 1,
              joinedAt: this._joinedAt,
              metins: this._profile.metins || 0,
              kills: this._profile.kills || 0,
            });
          } catch (e) {
            console.warn("[world] presence track failed", e);
          }
          finish(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("[world] channel status", status, err || "");
          finish(false);
          this._scheduleReconnect();
        }
      });

      // Don't hang forever on first join
      setTimeout(() => finish(false), 12000);
    });
  }

  _scheduleReconnect() {
    if (!this._profile || this._reconnecting) return;
    this._reconnecting = true;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(async () => {
      if (!this._profile) {
        this._reconnecting = false;
        return;
      }
      console.info("[world] reconnecting realtime…");
      await this._syncRealtimeAuth();
      const ok = await this._subscribeChannel();
      this._reconnecting = false;
      if (ok) this._syncPresence();
      else this._scheduleReconnect();
    }, 1500);
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

  /** WebSocket broadcast only — skip if socket can't push (avoids REST deprecation spam). */
  _broadcast(event, payload) {
    if (!this.canPush) return false;
    try {
      this.channel.send({ type: "broadcast", event, payload });
      return true;
    } catch (e) {
      console.warn("[world] send failed", e);
      return false;
    }
  }

  sendPlayer(state) {
    this._broadcast("player", state);
  }

  sendWorld(state) {
    if (!this.isHost) return;
    this._broadcast("world", state);
  }

  sendEvent(evt) {
    this._broadcast("evt", evt);
  }

  async updatePresence(patch) {
    if (!this.channel || !this._profile || !this.canPush) return;
    const me = this.peers.get(this.playerId) || {};
    try {
      await this.channel.track({
        ...me,
        ...patch,
        id: this.playerId,
        name: this._profile.name,
        classId: this._profile.classId,
        color: this._profile.color,
        joinedAt: this._joinedAt,
      });
    } catch {
      /* ignore during flap */
    }
  }

  startMatch() {}

  async leave() {
    clearTimeout(this._reconnectTimer);
    this._reconnecting = false;
    this._profile = null;
    this._status = "closed";
    if (this._authUnsub) {
      this._authUnsub.unsubscribe?.();
      this._authUnsub = null;
    }
    if (this.channel && supabase) {
      try {
        await supabase.removeChannel(this.channel);
      } catch {
        /* ignore */
      }
    }
    this.channel = null;
    this.peers.clear();
    this.isHost = false;
  }
}
