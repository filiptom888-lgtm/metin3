import "./style.css";
import { CLASSES, MAP_SIZE } from "./game/data.js";
import { Game } from "./game/Game.js";
import { WorldNet } from "./net/world.js";
import { ensureAuth, hasSupabase, configHint } from "./net/supabase.js";
import { loadOrCreateCharacter, saveCharacter } from "./net/persist.js";
import { createNewCharacter, derivedStats, xpForLevel } from "./game/character.js";
import { getItem, RARITY_COLOR, SLOTS } from "./game/items.js";

const $ = (s) => document.querySelector(s);

let selectedClass = "warrior";
let currentProfile = null;
let userId = null;
let offlineMode = false;

const ui = {
  toastTimer: 0,
  bindLocal(p, cls) {
    $("#hud-name").textContent = p.name;
    $("#hud-level").textContent = `Lv.${p.level} ${cls.name}`;
    const bar = $("#skill-bar");
    bar.innerHTML = "";
    cls.skills.forEach((sk, i) => {
      const el = document.createElement("div");
      el.className = "skill-slot";
      el.innerHTML = `<span class="k">${i + 1}</span><span class="sk-name">${sk.name}</span><div class="cd" hidden></div>`;
      bar.appendChild(el);
    });
    this.chat(`${p.name} entered the kingdom`, "sys");
  },
  updateHud(p, ch) {
    const cls = CLASSES[p.classId];
    $("#hud-level").textContent = `Lv.${p.level} ${cls?.name || ""}`;
    const hpR = Math.max(0, Math.min(1, p.hp / p.maxHp));
    const spR = Math.max(0, Math.min(1, p.sp / p.maxSp));
    const hpCirc = 2 * Math.PI * 42;
    const spCirc = 2 * Math.PI * 36;
    const orbHp = $("#orb-hp");
    const orbSp = $("#orb-sp");
    if (orbHp) {
      orbHp.style.strokeDasharray = `${hpCirc}`;
      orbHp.style.strokeDashoffset = `${hpCirc * (1 - hpR)}`;
    }
    if (orbSp) {
      orbSp.style.strokeDasharray = `${spCirc}`;
      orbSp.style.strokeDashoffset = `${spCirc * (1 - spR)}`;
    }
    $("#txt-hp").textContent = `${Math.ceil(p.hp)}`;
    $("#txt-sp").textContent = `${Math.floor(p.sp)}`;
    $("#stat-metins").textContent = String(p.metins);
    $("#stat-kills").textContent = String(p.kills);
    $("#stat-gold").textContent = String(p.gold || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (ch) {
      const xpNext = ch.xpNext || xpForLevel(ch.level);
      const xpR = Math.max(0, Math.min(1, ch.xp / xpNext));
      $("#bar-xp").style.transform = `scaleX(${xpR})`;
    }
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
  chat(msg, kind = "msg") {
    const log = $("#chat-log");
    if (!log) return;
    const line = document.createElement("div");
    line.className = `chat-line ${kind}`;
    line.textContent = msg;
    log.appendChild(line);
    while (log.children.length > 50) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
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
    this.chat(msg, "sys");
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
    for (const p of [...peers].sort((a, b) => (b.level || 1) - (a.level || 1))) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${p.name}</span><span>Lv.${p.level || 1}</span>`;
      list.appendChild(li);
    }
  },
  requestSave: null,
  drawMinimap(local, remotes, metins, mobs) {
    const c = $("#mini");
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#1a2e18";
    ctx.fillRect(0, 0, w, h);
    // city ring
    ctx.strokeStyle = "rgba(201,162,39,0.45)";
    ctx.beginPath();
    const cr = (22 / MAP_SIZE) * w;
    ctx.arc(w / 2, h / 2, cr, 0, Math.PI * 2);
    ctx.stroke();
    const to = (x, z) => [((x + MAP_SIZE / 2) / MAP_SIZE) * w, ((z + MAP_SIZE / 2) / MAP_SIZE) * h];
    ctx.fillStyle = "#c43c2e";
    for (const [, m] of metins) {
      const [px, py] = to(m.x, m.z);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#6b8f3a";
    for (const [, m] of mobs) {
      const [px, py] = to(m.x, m.z);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    ctx.fillStyle = "#4db0ff";
    for (const [, r] of remotes) {
      const [px, py] = to(r.state.x, r.state.z);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (local) {
      ctx.fillStyle = "#ffe28a";
      const [px, py] = to(local.x, local.z);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  },
};

function renderCharacterPanel(ch, local) {
  if (!ch) return;
  const d = derivedStats(ch);
  $("#char-title").textContent = `${ch.name} · Lv.${ch.level} ${CLASSES[ch.classId]?.name || ""}`;
  $("#stat-points").textContent = String(ch.statPoints);
  const grid = $("#stat-grid");
  grid.innerHTML = "";
  const rows = [
    ["STR", "str", d.str, "Attack"],
    ["VIT", "vit", d.vit, "HP / Def"],
    ["INT", "intel", d.intel, "SP / Magic"],
    ["DEX", "dex", d.dex, "Speed / Crit"],
  ];
  for (const [label, key, val, hint] of rows) {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span>${label} <small>${hint}</small></span><b>${val}</b>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "+";
    btn.disabled = ch.statPoints <= 0;
    btn.addEventListener("click", () => {
      game.allocateStat(key);
      renderCharacterPanel(game.character, game.local);
      renderInventory(game.character);
    });
    row.appendChild(btn);
    grid.appendChild(row);
  }
  const extra = document.createElement("div");
  extra.className = "derived";
  extra.innerHTML = `ATK ${d.atk} · DEF ${d.def} · Crit ${(d.crit * 100).toFixed(0)}% · HP ${d.maxHp} · SP ${d.maxSp}`;
  grid.appendChild(extra);

  const eq = $("#equip-preview");
  eq.innerHTML = SLOTS.map((s) => {
    const ref = ch.equipment[s];
    const id = ref ? (typeof ref === "string" ? ref : ref.itemId) : null;
    const def = id ? getItem(id) : null;
    return `<div class="eq-slot"><span>${s}</span><b style="color:${def ? RARITY_COLOR[def.rarity] : "#666"}">${def ? def.icon + " " + def.name : "—"}</b></div>`;
  }).join("");
}

function renderInventory(ch) {
  if (!ch) return;
  const slots = $("#equip-slots");
  slots.innerHTML = "";
  for (const s of SLOTS) {
    const ref = ch.equipment[s];
    const id = ref ? (typeof ref === "string" ? ref : ref.itemId) : null;
    const def = id ? getItem(id) : null;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "eq-chip";
    el.innerHTML = def
      ? `<small>${s}</small><span style="color:${RARITY_COLOR[def.rarity]}">${def.icon} ${def.name}</span>`
      : `<small>${s}</small><span>—</span>`;
    if (def) {
      el.addEventListener("click", () => {
        game.unequip(s);
        renderInventory(game.character);
        renderCharacterPanel(game.character, game.local);
      });
    }
    slots.appendChild(el);
  }

  const grid = $("#inv-grid");
  grid.innerHTML = "";
  for (const stack of ch.inventory) {
    const def = getItem(stack.itemId);
    if (!def) continue;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "inv-cell";
    cell.style.borderColor = RARITY_COLOR[def.rarity] || "#666";
    cell.innerHTML = `<span class="ico">${def.icon}</span><span class="nm">${def.name}</span><span class="qty">×${stack.qty}</span>`;
    cell.title = def.name;
    cell.addEventListener("click", () => {
      if (def.slot === "consumable") game.useItem(stack.uid);
      else game.equipItem(stack.uid);
      renderInventory(game.character);
      renderCharacterPanel(game.character, game.local);
    });
    cell.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      game.dropItem(stack.uid);
      renderInventory(game.character);
    });
    grid.appendChild(cell);
  }
}

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

const net = new WorldNet();
const game = new Game($("#c"), ui, net);

game.onCharacterChange = (ch) => {
  if (!$("#panel-char").hidden) renderCharacterPanel(ch, game.local);
  if (!$("#panel-inv").hidden) renderInventory(ch);
};

ui.requestSave = async (toast = true) => {
  if (!game.character || !userId) return;
  game.persistToCharacter();
  if (offlineMode) {
    localStorage.setItem("metin3_char", JSON.stringify(game.character));
    if (toast) ui.toast("Saved locally");
    return;
  }
  const res = await saveCharacter(userId, game.character);
  if (toast) ui.toast(res.ok ? "Progress saved" : `Save failed: ${res.reason}`);
};

function show(screen) {
  $("#lobby").classList.toggle("active", screen === "lobby");
  $("#game-screen").classList.toggle("active", screen === "game");
}

function togglePanel(name) {
  const map = { char: "#panel-char", inv: "#panel-inv", menu: "#panel-menu" };
  const el = $(map[name]);
  if (!el) return;
  const open = el.hidden;
  $("#panel-char").hidden = true;
  $("#panel-inv").hidden = true;
  $("#panel-menu").hidden = true;
  if (open) {
    el.hidden = false;
    if (name === "char") renderCharacterPanel(game.character, game.local);
    if (name === "inv") renderInventory(game.character);
  }
}

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("#panel-char").hidden = true;
    $("#panel-inv").hidden = true;
  });
});

window.addEventListener("keydown", (e) => {
  if (!$("#game-screen").classList.contains("active")) return;
  const k = e.key.toLowerCase();
  if (k === "c") togglePanel("char");
  if (k === "i") togglePanel("inv");
  if (k === "escape") togglePanel("menu");
  if (e.key === "Tab") {
    e.preventDefault();
    ui.setScoreboard(true);
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Tab") ui.setScoreboard(false);
});

net.onPeers = (peers) => {
  if (game.running) game.onPeers(peers);
  ui.setPlayers(peers.length);
  ui.updateScoreboard(peers);
};

$("#btn-enter").addEventListener("click", async () => {
  const err = $("#lobby-error");
  err.hidden = true;
  const btn = $("#btn-enter");
  btn.disabled = true;
  btn.textContent = "Entering…";

  try {
    const name = ($("#inp-name").value || "Wanderer").trim().slice(0, 16);
    if (name.length < 2) throw new Error("Name too short");
    const cls = CLASSES[selectedClass];

    if (!hasSupabase) {
      offlineMode = true;
      userId = "local";
      let ch = null;
      try {
        ch = JSON.parse(localStorage.getItem("metin3_char") || "null");
      } catch {
        ch = null;
      }
      if (!ch || ch.classId !== cls.id) ch = createNewCharacter(name, cls.id);
      else ch.name = name;
      currentProfile = { id: "local_" + Math.random().toString(36).slice(2, 8), name, classId: cls.id, color: cls.color, level: ch.level };
      net.playerId = currentProfile.id;
      net.isHost = true;
      net.started = true;
      net.sendPlayer = () => {};
      net.sendWorld = () => {};
      net.sendEvent = () => {};
      net.updatePresence = async () => {};
      net.leave = async () => {};
      show("game");
      game.start(currentProfile, ch);
      ui.toast("Solo offline · run schema.sql + env for multiplayer save");
      return;
    }

    const user = await ensureAuth();
    userId = user.id;
    const { character, offline, error } = await loadOrCreateCharacter(userId, name, cls.id);
    offlineMode = !!offline;
    if (error) ui.chat(`DB: ${error} (playing, save may fail until schema.sql)`, "sys");

    // Allow rename if empty world char
    character.name = name;
    if (!character.classId) character.classId = cls.id;

    currentProfile = {
      id: user.id,
      name: character.name,
      classId: character.classId,
      color: CLASSES[character.classId].color,
      level: character.level,
      metins: character.metins,
      kills: character.kills,
    };

    await net.join("WORLD", currentProfile);
    show("game");
    game.start(currentProfile, character);
    ui.toast("Entered the open world");
    ui.requestSave(false);
  } catch (e) {
    console.error(e);
    err.hidden = false;
    err.textContent = e.message || String(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enter the Kingdom";
  }
});

$("#btn-save").addEventListener("click", () => ui.requestSave(true));
$("#btn-leave").addEventListener("click", async () => {
  await ui.requestSave(true);
  game.stop();
  await net.leave();
  $("#panel-menu").hidden = true;
  show("lobby");
});

console.info(`[METIN3] supabase=${hasSupabase ? "ready" : "missing"} open-world`);
