import "./style.css";
import { CLASSES } from "./game/data.js";
import { Game } from "./game/Game.js";
import { RoomNet } from "./net/room.js";
import { ensureAuth, hasSupabase, configHint, supabase } from "./net/supabase.js";
import { MAP_SIZE } from "./game/data.js";

const $ = (s) => document.querySelector(s);

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
    $("#bar-hp").style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
    $("#bar-sp").style.transform = `scaleX(${Math.max(0, p.sp / p.maxSp)})`;
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

    const to = (x, z) => [
      ((x + MAP_SIZE / 2) / MAP_SIZE) * w,
      ((z + MAP_SIZE / 2) / MAP_SIZE) * h,
    ];

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

// Lobby class picker
let selectedClass = "warrior";
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

$("#inp-room").value = "ARENA";
$("#inp-name").value = `Hero${Math.floor(Math.random() * 90 + 10)}`;
$("#config-hint").textContent = configHint();

const net = new RoomNet();
const game = new Game($("#c"), ui, net);

function show(screen) {
  $("#lobby").classList.toggle("active", screen === "lobby");
  $("#game-screen").classList.toggle("active", screen === "game");
}

$("#btn-join").addEventListener("click", async () => {
  const err = $("#lobby-error");
  err.hidden = true;
  const btn = $("#btn-join");
  btn.disabled = true;
  btn.textContent = "Connecting…";

  try {
    const name = ($("#inp-name").value || "Wanderer").trim().slice(0, 16);
    const room = ($("#inp-room").value || "ARENA").trim();
    const cls = CLASSES[selectedClass];

    // Offline solo (no Supabase) — still 3D playable while you wire keys
    if (!hasSupabase) {
      const profile = {
        id: `local_${Math.random().toString(36).slice(2, 9)}`,
        name,
        classId: cls.id,
        color: cls.color,
      };
      net.playerId = profile.id;
      net.roomCode = "SOLO";
      net.isHost = true;
      net.sendPlayer = () => {};
      net.sendWorld = () => {};
      net.sendEvent = () => {};
      net.updatePresence = async () => {};
      net.leave = async () => {};
      show("game");
      game.start(profile);
      ui.setRoom("SOLO");
      ui.setHost(true);
      ui.setPlayers(1);
      ui.toast("Solo mode · add Supabase env for multiplayer");
      return;
    }

    const user = await ensureAuth();
    const profile = {
      id: user.id,
      name,
      classId: cls.id,
      color: cls.color,
    };

    const code = await net.join(room, profile);
    show("game");
    game.start(profile);
    ui.toast(`Joined ${code}`);

    try {
      await supabase.from("arena_scores").insert({
        room_code: code,
        player_name: name,
        class_id: cls.id,
        metins: 0,
        kills: 0,
      });
    } catch {
      /* table optional */
    }
  } catch (e) {
    console.error(e);
    err.hidden = false;
    err.textContent = e.message || String(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enter Arena";
  }
});

$("#btn-leave").addEventListener("click", async () => {
  game.stop();
  await net.leave();
  show("lobby");
});

// Helpful boot log
console.info(`[METIN3] supabase=${hasSupabase ? "ready" : "missing env"}`);
