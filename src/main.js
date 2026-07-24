import "./style.css";
import { CLASSES, MAP_SIZE } from "./game/data.js";
import { Game } from "./game/Game.js";
import { RoomNet, randomRoomCode } from "./net/room.js";
import { ensureAuth, hasSupabase, configHint, supabase } from "./net/supabase.js";

const $ = (s) => document.querySelector(s);

let selectedClass = "warrior";
let currentProfile = null;

const ui = {
  toastTimer: 0,
  bindLocal(p, cls) {
    $("#hud-name").textContent = p.name;
    const bar = $("#skill-bar");
    bar.innerHTML = "";
    cls.skills.forEach((sk, i) => {
      const el = document.createElement("div");
      el.className = "skill-slot";
      el.dataset.i = String(i);
      el.innerHTML = `<span class="k">${i + 1}</span>${sk.name}<div class="cd" hidden></div>`;
      bar.appendChild(el);
    });
  },
  updateHud(p) {
    $("#hud-level").textContent = `Lv.${p.level}`;
    const hpR = Math.max(0, Math.min(1, p.hp / p.maxHp));
    const spR = Math.max(0, Math.min(1, p.sp / p.maxSp));
    $("#bar-hp").style.transform = `scaleX(${hpR})`;
    $("#bar-sp").style.transform = `scaleX(${spR})`;
    $("#txt-hp").textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    $("#txt-sp").textContent = `${Math.floor(p.sp)}/${p.maxSp}`;
    $("#stat-metins").textContent = String(p.metins);
    $("#stat-kills").textContent = String(p.kills);
    const slots = $("#skill-bar").children;
    for (let i = 0; i < slots.length; i++) {
      const cd = p.skillCd[i];
      const cdEl = slots[i].querySelector(".cd");
      if (cd > 0.05) {
        cdEl.hidden = false;
        cdEl.textContent = cd.toFixed(1);
      } else cdEl.hidden = true;
    }
  },
  toast(msg) {
    const el = $("#toast");
    el.hidden = false;
    el.textContent = msg;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 1500);
  },
  setRoom(code) {
    $("#room-chip").textContent = code;
  },
  setHost(isHost) {
    const el = $("#host-chip");
    el.textContent = isHost ? "HOST" : "CLIENT";
    el.classList.toggle("host", isHost);
  },
  setPlayers(n) {
    $("#players-chip").textContent = `${n} online`;
  },
  setScoreboard(on) {
    $("#scoreboard").hidden = !on;
  },
  updateScoreboard(peers) {
    const list = $("#score-list");
    list.innerHTML = "";
    const sorted = [...peers].sort((a, b) => (b.metins || 0) - (a.metins || 0) || (b.kills || 0) - (a.kills || 0));
    for (const p of sorted) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${p.name} <small style="opacity:.6">${p.classId || ""}</small></span><span>${p.metins || 0}M · ${p.kills || 0}K</span>`;
      list.appendChild(li);
    }
  },
  updateWaiting(peers, isCreator, roomCode) {
    $("#wait-code").textContent = roomCode;
    $("#wait-role").textContent = isCreator ? "You are the creator" : "Waiting as member";
    $("#wait-count").textContent = `${peers.length} player${peers.length === 1 ? "" : "s"}`;
    $("#btn-start").hidden = !isCreator;
    $("#wait-status").textContent = isCreator
      ? "Start when your party is ready."
      : "Waiting for host to start…";

    const list = $("#wait-list");
    list.innerHTML = "";
    const sorted = [...peers].sort((a, b) => Number(b.isCreator) - Number(a.isCreator) || (a.joinedAt || 0) - (b.joinedAt || 0));
    for (const p of sorted) {
      const li = document.createElement("li");
      const cls = CLASSES[p.classId]?.name || p.classId || "?";
      li.innerHTML = `<span>${p.name} · ${cls}</span><span class="tag">${p.isCreator ? "Creator" : "Ready"}</span>`;
      list.appendChild(li);
    }
  },
  drawMinimap(local, remotes, metins, mobs) {
    const c = $("#mini");
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0c1612";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(201,162,39,0.35)";
    ctx.strokeRect(1, 1, w - 2, h - 2);
    const to = (x, z) => [((x + MAP_SIZE / 2) / MAP_SIZE) * w, ((z + MAP_SIZE / 2) / MAP_SIZE) * h];
    ctx.fillStyle = "#8b1e1e";
    for (const [, m] of metins) {
      const [px, py] = to(m.x, m.z);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#5a6b4a";
    for (const [, m] of mobs) {
      const [px, py] = to(m.x, m.z);
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    ctx.fillStyle = "#3a9fd4";
    for (const [, r] of remotes) {
      const [px, py] = to(r.state.x, r.state.z);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (local) {
      ctx.fillStyle = "#e8d48b";
      const [px, py] = to(local.x, local.z);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

const row = $("#class-row");
Object.values(CLASSES).forEach((cls) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "class-btn" + (cls.id === selectedClass ? " selected" : "");
  btn.style.setProperty("--accent", cls.color);
  btn.innerHTML = `<div class="g">${cls.glyph}</div><small>${cls.name}</small>`;
  btn.addEventListener("click", () => {
    selectedClass = cls.id;
    row.querySelectorAll(".class-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
  row.appendChild(btn);
});

$("#inp-name").value = `Hero${Math.floor(Math.random() * 90 + 10)}`;
$("#config-hint").textContent = configHint();

const net = new RoomNet();
const game = new Game($("#c"), ui, net);

function show(screen) {
  $("#lobby").classList.toggle("active", screen === "lobby");
  $("#waiting").classList.toggle("active", screen === "waiting");
  $("#game-screen").classList.toggle("active", screen === "game");
}

function readProfileBase() {
  const name = ($("#inp-name").value || "Wanderer").trim().slice(0, 16);
  const cls = CLASSES[selectedClass];
  return { name, cls };
}

async function enterWaiting(roomCode, asCreator) {
  const err = $("#lobby-error");
  err.hidden = true;
  const { name, cls } = readProfileBase();

  if (!hasSupabase) {
    // Solo offline: skip waiting, go straight in as host
    currentProfile = {
      id: `local_${Math.random().toString(36).slice(2, 9)}`,
      name,
      classId: cls.id,
      color: cls.color,
    };
    net.playerId = currentProfile.id;
    net.roomCode = "SOLO";
    net.isHost = true;
    net.isCreator = true;
    net.started = true;
    net.sendPlayer = () => {};
    net.sendWorld = () => {};
    net.sendEvent = () => {};
    net.updatePresence = async () => {};
    net.leave = async () => {};
    show("game");
    game.start(currentProfile);
    ui.setRoom("SOLO");
    ui.setHost(true);
    ui.setPlayers(1);
    ui.toast("Solo mode · set Supabase env on Vercel for multiplayer");
    return;
  }

  const user = await ensureAuth();
  currentProfile = {
    id: user.id,
    name,
    classId: cls.id,
    color: cls.color,
  };

  const code = await net.join(roomCode, currentProfile, { asCreator });
  show("waiting");
  ui.updateWaiting([...net.peers.values()], net.isCreator, code);
  $("#wait-error").hidden = true;
}

net.onPeers = (peers) => {
  if (game.running) game.onPeers(peers);
  if ($("#waiting").classList.contains("active")) {
    ui.updateWaiting(peers, net.isCreator, net.roomCode);
  }
  if ($("#game-screen").classList.contains("active")) {
    ui.setPlayers(peers.length);
    ui.updateScoreboard(peers);
  }
};

net.onMatchStart = () => {
  if (!currentProfile) return;
  show("game");
  game.start(currentProfile);
  ui.setRoom(net.roomCode);
  ui.setHost(net.isHost);
  ui.setPlayers(net.peers.size);
  ui.toast("Match started");
};

async function withBusy(btn, label, fn) {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } catch (e) {
    console.error(e);
    const err = $("#lobby").classList.contains("active") ? $("#lobby-error") : $("#wait-error");
    err.hidden = false;
    err.textContent = e.message || String(e);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

$("#btn-create").addEventListener("click", () => {
  withBusy($("#btn-create"), "Creating…", () => enterWaiting(randomRoomCode(), true));
});

$("#btn-join").addEventListener("click", () => {
  withBusy($("#btn-join"), "Joining…", async () => {
    const room = ($("#inp-room").value || "").trim();
    if (!room) throw new Error("Enter a room code to join");
    await enterWaiting(room, false);
  });
});

$("#btn-start").addEventListener("click", () => {
  withBusy($("#btn-start"), "Starting…", async () => {
    net.startMatch();
    try {
      await supabase?.from("arena_scores").insert({
        room_code: net.roomCode,
        player_name: currentProfile?.name || "?",
        class_id: currentProfile?.classId || "warrior",
        metins: 0,
        kills: 0,
      });
    } catch {
      /* optional */
    }
  });
});

$("#btn-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(net.roomCode);
    $("#btn-copy").textContent = "Copied";
    setTimeout(() => {
      $("#btn-copy").textContent = "Copy";
    }, 1000);
  } catch {
    $("#btn-copy").textContent = net.roomCode;
  }
});

async function leaveAll() {
  game.stop();
  await net.leave();
  currentProfile = null;
  show("lobby");
}

$("#btn-leave-wait").addEventListener("click", leaveAll);
$("#btn-leave").addEventListener("click", leaveAll);

console.info(`[METIN3] supabase=${hasSupabase ? "ready" : "missing env"}`);
