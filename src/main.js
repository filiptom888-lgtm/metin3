import "./style.css";
import { CLASSES, MAP_SIZE } from "./game/data.js";
import { Game } from "./game/Game.js";
import { WorldNet } from "./net/world.js";
import { hasSupabase, configHint } from "./net/supabase.js";
import { AuthService } from "./services/AuthService.js";
import { CharacterService } from "./services/CharacterService.js";
import { SkillService } from "./services/SkillService.js";
import { QuestService } from "./services/QuestService.js";
import { NpcService } from "./services/NpcService.js";
import { ItemService } from "./services/ItemService.js";
import { PartyService } from "./services/PartyService.js";
import { DungeonService } from "./services/DungeonService.js";
import { KINGDOMS, SPECS } from "./data/meta.js";
import { derivedStats, xpForLevel } from "./game/character.js";
import { EQUIP_SLOTS as SLOTS, RARITY_COLOR, ITEM_TEMPLATES } from "./data/items.js";
import { SHOP_CATALOG } from "./data/npcs.js";
import { UPGRADE_TABLE } from "./data/upgrades.js";
import { floorConfig } from "./data/demonTower.js";
import { audio } from "./audio/Audio.js";

const $ = (s) => document.querySelector(s);

const DOLL_SLOTS = ["helmet", "weapon", "shield", "armor", "bracelet", "necklace", "earring", "shoes"];
const BAG_SIZE = 40;

let selectedClass = "warrior";
let selectedSpec = "body";
let selectedGender = "m";
let selectedKingdom = 1;
let currentProfile = null;
let userId = null;
let offlineMode = false;
let sessionUser = null;

const ui = {
  toastTimer: 0,
  bindLocal(p, cls) {
    $("#hud-name").textContent = p.name;
    const skills = SkillService.listFor(p.classId, game.character?.spec).slice(0, 4);
    const list = skills.length ? skills : cls.skills;
    $("#hud-level").textContent = `Lv.${p.level} ${cls.name}`;
    const bar = $("#skill-bar");
    bar.innerHTML = "";
    list.forEach((sk, i) => {
      const el = document.createElement("div");
      el.className = "skill-slot";
      el.innerHTML = `<span class="k">${i + 1}</span><span class="sk-name">${sk.name}</span><div class="cd" hidden></div>`;
      bar.appendChild(el);
    });
    this.chat(`${p.name} entered the kingdom`, "sys");
  },
  updateHud(p, ch) {
    const cls = CLASSES[p.classId];
    const spec = ch?.spec ? ` · ${ch.spec}` : "";
    $("#hud-level").textContent = `Lv.${p.level} ${cls?.name || ""}${spec}`;
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
  setNpcPrompt(npc) {
    const el = $("#npc-prompt");
    if (!npc) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    $("#npc-prompt-name").textContent = npc.name;
  },
  showDeath(msg) {
    $("#death-msg").textContent = msg || "Choose where to return.";
    $("#panel-death").hidden = false;
  },
  hideDeath() {
    $("#panel-death").hidden = true;
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

function getItem(id) {
  return ITEM_TEMPLATES[id] || null;
}

function renderDoll(container, ch, { unequip = true } = {}) {
  if (!container) return;
  container.innerHTML = "";
  for (const s of DOLL_SLOTS) {
    const ref = ch.equipment[s];
    const id = ref ? ref.itemId || ref : null;
    const def = id ? getItem(id) : null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doll-slot" + (def ? "" : " empty");
    btn.dataset.slot = s;
    btn.style.borderColor = def ? RARITY_COLOR[def.rarity] : "";
    const up = ref?.upgrade ? `+${ref.upgrade}` : "";
    btn.innerHTML = `<span class="lbl">${s}</span>${
      def ? `<span class="ico">${def.icon}</span><span class="up">${up}</span>` : `<span class="ico" style="opacity:.35">·</span>`
    }`;
    btn.title = def ? ItemService.displayName(ref) : s;
    if (def && unequip) {
      btn.addEventListener("click", () => {
        audio.sfx("ui");
        game.unequip(s);
        renderCharacterPanel(game.character);
        renderInventory(game.character);
      });
    }
    container.appendChild(btn);
  }
}

function renderCharacterPanel(ch) {
  if (!ch) return;
  const d = derivedStats(ch);
  const kingdom = KINGDOMS.find((k) => k.id === ch.kingdom)?.name || "";
  $("#char-title").textContent = `${ch.name} · Lv.${ch.level} ${CLASSES[ch.classId]?.name || ""} · ${ch.spec || ""} · ${kingdom}`;
  $("#stat-points").textContent = String(ch.statPoints);
  renderDoll($("#paperdoll"), ch);

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
      audio.sfx("ui");
      game.allocateStat(key);
      renderCharacterPanel(game.character);
      renderInventory(game.character);
    });
    row.appendChild(btn);
    grid.appendChild(row);
  }

  const cards = $("#combat-cards");
  if (cards) {
    cards.innerHTML = [
      ["ATK", d.atk],
      ["MATK", d.matk],
      ["DEF", d.def],
      ["MDEF", d.mdef],
      ["CRIT", `${(d.crit * 100).toFixed(0)}%`],
      ["PIERCE", `${(d.pierce * 100).toFixed(0)}%`],
      ["HP", d.maxHp],
      ["SP", d.maxSp],
    ]
      .map(
        ([k, v]) => `<div class="combat-card"><small>${k}</small><b>${v}</b></div>`
      )
      .join("");
  }
}

function renderInventory(ch) {
  if (!ch) return;
  renderDoll($("#equip-doll"), ch);
  const grid = $("#inv-grid");
  grid.innerHTML = "";
  const tip = $("#item-tooltip");
  if (tip) tip.hidden = true;

  const filled = ch.inventory.length;
  const countEl = $("#inv-count");
  if (countEl) countEl.textContent = `${filled}/${BAG_SIZE}`;

  for (let i = 0; i < BAG_SIZE; i++) {
    const stack = ch.inventory[i];
    const cell = document.createElement("button");
    cell.type = "button";
    if (!stack) {
      cell.className = "inv-cell empty-slot";
      cell.disabled = true;
      grid.appendChild(cell);
      continue;
    }
    const def = getItem(stack.itemId);
    if (!def) continue;
    cell.className = "inv-cell";
    cell.style.borderColor = RARITY_COLOR[def.rarity] || "#666";
    const up = stack.upgrade ? `+${stack.upgrade}` : "";
    cell.innerHTML = `${up ? `<span class="up-tag">${up}</span>` : ""}<span class="ico">${def.icon}</span><span class="qty">×${stack.qty}</span>`;
    cell.title = ItemService.displayName(stack);
    cell.addEventListener("mouseenter", () => {
      if (!tip) return;
      const bons = (stack.bonuses || []).map((b) => `${b.stat}+${b.value}`).join(", ");
      tip.hidden = false;
      tip.innerHTML = `<b style="color:${RARITY_COLOR[def.rarity]}">${ItemService.displayName(stack)}</b><br>${def.slot}${
        def.atk ? ` · ATK ${def.atk}` : ""
      }${def.def ? ` · DEF ${def.def}` : ""}${bons ? `<br>${bons}` : ""}`;
    });
    cell.addEventListener("click", () => {
      audio.sfx("ui");
      if (def.slot === "consumable") game.useItem(stack.uid);
      else game.equipItem(stack.uid);
      renderInventory(game.character);
      renderCharacterPanel(game.character);
    });
    cell.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      audio.sfx("ui");
      game.dropItem(stack.uid);
      renderInventory(game.character);
    });
    grid.appendChild(cell);
  }
}

function renderQuests(ch) {
  const body = $("#quest-body");
  body.innerHTML = "";
  const list = document.createElement("div");
  list.className = "quest-list";
  for (const q of QuestService.all) {
    QuestService.ensure(ch);
    const st = ch.quests[q.id];
    const row = document.createElement("div");
    row.className = "quest-line";
    const state = st?.state || "available";
    const prog = st ? `${st.progress || 0}/${q.count}` : `0/${q.count}`;
    row.innerHTML = `<div><b>${q.name}</b><small style="display:block;color:var(--mist)">${q.desc} · ${prog} · ${state}</small></div>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-mini";
    if (!st) {
      btn.textContent = "Accept";
      btn.onclick = () => {
        const err = QuestService.accept(ch, q.id);
        ui.toast(err || "Quest accepted");
        renderQuests(ch);
        game.refreshQuestMarkers?.();
      };
    } else if (st.state === "completed") {
      btn.textContent = "Claim";
      btn.onclick = () => {
        const err = QuestService.claim(ch, q.id);
        if (!err) {
          game.syncDerived();
          ui.toast("Reward claimed");
        } else ui.toast(err);
        renderQuests(ch);
        renderInventory(ch);
        game.refreshQuestMarkers?.();
      };
    } else {
      btn.textContent = state;
      btn.disabled = true;
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
  body.appendChild(list);
}

function renderNpcPanel(npc) {
  $("#npc-title").textContent = npc.name;
  const body = $("#npc-body");
  body.innerHTML = "";
  const ch = game.character;
  if (npc.role === "shop") {
    const list = document.createElement("div");
    list.className = "shop-list";
    for (const offer of SHOP_CATALOG) {
      const def = getItem(offer.id);
      const row = document.createElement("div");
      row.className = "npc-line";
      row.innerHTML = `<span>${def?.icon || ""} ${def?.name || offer.id}</span><span>${offer.price} Yang</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-mini";
      btn.textContent = "Buy";
      btn.onclick = () => {
        const err = NpcService.buy(ch, offer.id);
        if (err) ui.toast(err);
        else {
          game.local.gold = ch.gold;
          ui.toast(`Bought ${def?.name}`);
          renderInventory(ch);
        }
      };
      row.appendChild(btn);
      list.appendChild(row);
    }
    body.appendChild(list);
    const sellHint = document.createElement("p");
    sellHint.className = "inv-hint";
    sellHint.textContent = "Open Inventory (I) and use Sell near this NPC, or click items below.";
    body.appendChild(sellHint);
    for (const stack of ch.inventory.slice(0, 12)) {
      const def = getItem(stack.itemId);
      if (!def) continue;
      const row = document.createElement("div");
      row.className = "npc-line";
      row.innerHTML = `<span>Sell ${def.name}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-mini";
      btn.textContent = "Sell";
      btn.onclick = () => {
        const err = NpcService.sell(ch, stack.uid);
        if (err) ui.toast(err);
        else {
          game.local.gold = ch.gold;
          ui.toast("Sold");
          renderNpcPanel(npc);
          renderInventory(ch);
        }
      };
      row.appendChild(btn);
      body.appendChild(row);
    }
  } else if (npc.role === "blacksmith") {
    const intro = document.createElement("p");
    intro.className = "sub";
    intro.textContent = "Upgrade gear +0…+9. Higher levels can downgrade or destroy.";
    body.appendChild(intro);
    for (const stack of ch.inventory) {
      const def = getItem(stack.itemId);
      if (!def || def.slot === "consumable") continue;
      const level = stack.upgrade || 0;
      if (level >= 9) continue;
      const recipe = UPGRADE_TABLE[level];
      const row = document.createElement("div");
      row.className = "npc-line";
      row.innerHTML = `<span>${def.icon} ${def.name} +${level} → +${level + 1}<br><small>${Math.floor(recipe.chance * 100)}% · ${recipe.yang} Yang</small></span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-mini";
      btn.textContent = "Upgrade";
      btn.onclick = () => {
        const res = NpcService.upgrade(ch, stack.uid);
        game.local.gold = ch.gold;
        ui.toast(res.msg);
        game.syncDerived();
        renderNpcPanel(npc);
        renderInventory(ch);
      };
      row.appendChild(btn);
      body.appendChild(row);
    }
  } else if (npc.role === "teleport") {
    for (const k of KINGDOMS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost-full";
      btn.textContent = `Gate to ${k.name}`;
      btn.onclick = () => {
        game.local.x = k.village.x;
        game.local.z = k.village.z;
        ui.toast(`Teleported to ${k.name}`);
        $("#panel-npc").hidden = true;
      };
      body.appendChild(btn);
    }
  } else if (npc.role === "quest") {
    renderQuests(ch);
    body.appendChild($("#quest-body").cloneNode(true));
    // simpler: just open quests
    $("#panel-npc").hidden = true;
    $("#panel-quests").hidden = false;
    renderQuests(ch);
  }
}

function showLobbyView(name) {
  $("#auth-view").hidden = name !== "auth";
  $("#chars-view").hidden = name !== "chars";
  $("#create-view").hidden = name !== "create";
}

function show(screen) {
  $("#lobby").classList.toggle("active", screen === "lobby");
  $("#game-screen").classList.toggle("active", screen === "game");
}

function togglePanel(name) {
  const map = {
    char: "#panel-char",
    inv: "#panel-inv",
    menu: "#panel-menu",
    npc: "#panel-npc",
    quests: "#panel-quests",
    party: "#panel-party",
    tower: "#panel-tower",
    dungeon: "#panel-dungeon",
  };
  const el = $(map[name]);
  if (!el) return;
  const open = el.hidden;
  Object.values(map).forEach((sel) => {
    const node = $(sel);
    if (node) node.hidden = true;
  });
  if (open) {
    el.hidden = false;
    if (name === "char") renderCharacterPanel(game.character);
    if (name === "inv") renderInventory(game.character);
    if (name === "quests") renderQuests(game.character);
    if (name === "party") renderPartyPanel();
    if (name === "tower") renderTowerPanel();
    if (name === "dungeon") renderDungeonPanel();
  }
}

function renderPartyPanel() {
  const body = $("#party-body");
  if (!body) return;
  body.innerHTML = "";
  const party = PartyService.party;
  const banner = $("#party-invite-banner");
  if (PartyService.pendingInvite) {
    banner.hidden = false;
    $("#party-invite-text").textContent = `${PartyService.pendingInvite.fromName} invited you`;
  } else {
    banner.hidden = true;
  }

  if (!party) {
    body.innerHTML = `<p class="sub">No party. Invite nearby players below.</p>`;
  } else {
    for (const m of party.members) {
      const row = document.createElement("div");
      row.className = "party-member";
      const lead = m.id === party.leaderId ? ' <span class="leader">★</span>' : "";
      row.innerHTML = `<span>${m.name}${lead}</span><small>Lv.${m.level || 1}</small>`;
      body.appendChild(row);
    }
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "btn btn-ghost-full";
    leave.textContent = "Leave party";
    leave.onclick = () => {
      game.leaveParty();
      renderPartyPanel();
    };
    body.appendChild(leave);
  }

  const nearby = [...(game.remotes?.values() || [])]
    .map((r) => r.target || r.state)
    .filter(Boolean);
  // Also use net peers
  const peers = [];
  if (net.peers) {
    for (const p of net.peers.values()) {
      if (p.id !== game.local?.id) peers.push(p);
    }
  }
  const list = peers.length ? peers : nearby;
  if (list.length) {
    const h = document.createElement("p");
    h.className = "field-label";
    h.textContent = "Nearby players";
    body.appendChild(h);
    for (const p of list) {
      if (party?.members.some((m) => m.id === p.id)) continue;
      const row = document.createElement("div");
      row.className = "party-member";
      row.innerHTML = `<span>${p.name || "Player"}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-mini";
      btn.textContent = "Invite";
      btn.onclick = () => {
        game.inviteToParty(p.id);
        renderPartyPanel();
      };
      row.appendChild(btn);
      body.appendChild(row);
    }
  }
}

function renderTowerPanel() {
  const info = $("#tower-party-info");
  const party = PartyService.party;
  if (info) {
    info.textContent = party
      ? `Party ready · ${party.members.length} members · leader starts the run`
      : "Solo run — or form a party (P) first";
  }
  const partyBtn = $("#btn-dt-party");
  if (partyBtn) partyBtn.disabled = !party || !PartyService.isLeader(game.local?.id);
}

function renderDungeonPanel() {
  const run = DungeonService.run;
  const title = $("#dungeon-title");
  const status = $("#dungeon-status");
  const next = $("#btn-dt-next");
  if (!run) return;
  const cfg = floorConfig(run.floor);
  if (title) title.textContent = cfg?.name || `Floor ${run.floor}`;
  if (status) {
    status.textContent = run.cleared
      ? run.floor >= 7
        ? "Tower cleared! Claim glory and leave."
        : "Floor cleared — ascend when ready."
      : "Defeat all demons on this floor.";
  }
  if (next) {
    next.textContent = run.floor >= 7 && run.cleared ? "Finish tower" : "Next floor";
    next.disabled = !run.cleared;
  }
}

function updateDungeonHud(run) {
  const hud = $("#dungeon-hud");
  if (!hud) return;
  if (!run) {
    hud.hidden = true;
    return;
  }
  hud.hidden = false;
  const cfg = floorConfig(run.floor);
  $("#dungeon-hud-floor").textContent = cfg?.name || `Floor ${run.floor}`;
  $("#dungeon-hud-hint").textContent = run.cleared ? "Floor clear — open panel / Next floor" : "Slay all demons";
}

function renderSpecRow() {
  const row = $("#spec-row");
  row.innerHTML = "";
  const specs = SPECS[selectedClass] || [];
  if (!specs.find((s) => s.id === selectedSpec)) selectedSpec = specs[0]?.id || "body";
  for (const s of specs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-btn" + (s.id === selectedSpec ? " selected" : "");
    btn.textContent = s.name;
    btn.addEventListener("click", () => {
      selectedSpec = s.id;
      renderSpecRow();
    });
    row.appendChild(btn);
  }
}

// Build create UI controls
const classRow = $("#class-row");
Object.values(CLASSES).forEach((cls) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "class-btn" + (cls.id === selectedClass ? " selected" : "");
  btn.style.setProperty("--accent", cls.color);
  btn.innerHTML = `<div class="g">${cls.glyph}</div><small>${cls.name}</small>`;
  btn.addEventListener("click", () => {
    selectedClass = cls.id;
    classRow.querySelectorAll(".class-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    renderSpecRow();
  });
  classRow.appendChild(btn);
});

const kingdomRow = $("#kingdom-row");
for (const k of KINGDOMS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "opt-btn" + (k.id === selectedKingdom ? " selected" : "");
  btn.style.borderColor = k.color;
  btn.textContent = k.name;
  btn.addEventListener("click", () => {
    selectedKingdom = k.id;
    kingdomRow.querySelectorAll(".opt-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
  kingdomRow.appendChild(btn);
}

$("#gender-row").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-gender]");
  if (!btn) return;
  selectedGender = btn.dataset.gender;
  $("#gender-row").querySelectorAll(".opt-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
});

renderSpecRow();
$("#inp-name").value = `Hero${Math.floor(Math.random() * 90 + 10)}`;
$("#config-hint").textContent = configHint();

const net = new WorldNet();
const game = new Game($("#c"), ui, net);

game.onCharacterChange = (ch) => {
  if (!$("#panel-char").hidden) renderCharacterPanel(ch);
  if (!$("#panel-inv").hidden) renderInventory(ch);
  if (!$("#panel-quests").hidden) renderQuests(ch);
};

game.onOpenNpc = (npc) => {
  $("#panel-char").hidden = true;
  $("#panel-inv").hidden = true;
  $("#panel-quests").hidden = true;
  $("#panel-tower").hidden = true;
  $("#panel-npc").hidden = false;
  renderNpcPanel(npc);
};

game.onOpenTower = () => {
  if (DungeonService.isInside()) {
    $("#panel-dungeon").hidden = false;
    renderDungeonPanel();
    return;
  }
  ["#panel-char", "#panel-inv", "#panel-quests", "#panel-npc", "#panel-party"].forEach((s) => {
    const el = $(s);
    if (el) el.hidden = true;
  });
  $("#panel-tower").hidden = false;
  renderTowerPanel();
};

game.onPartyChange = () => {
  if (!$("#panel-party").hidden) renderPartyPanel();
  const banner = $("#party-invite-banner");
  if (PartyService.pendingInvite) {
    banner.hidden = false;
    $("#party-invite-text").textContent = `${PartyService.pendingInvite.fromName} invited you`;
    // auto-show party panel on invite
    if ($("#panel-party").hidden) togglePanel("party");
  }
};

game.onDungeonChange = (run) => {
  updateDungeonHud(run);
  if (!$("#panel-dungeon").hidden) renderDungeonPanel();
};

ui.requestSave = async (toast = true) => {
  if (!game.character || !userId) return;
  game.persistToCharacter();
  if (offlineMode && !hasSupabase) {
    const list = JSON.parse(localStorage.getItem("metin3_chars") || "[]");
    const i = list.findIndex((c) => c.id === game.character.id);
    if (i >= 0) list[i] = game.character;
    else list.push(game.character);
    localStorage.setItem("metin3_chars", JSON.stringify(list));
    if (toast) ui.toast("Saved locally");
    return;
  }
  const res = await CharacterService.save(userId, game.character);
  if (toast) ui.toast(res.ok ? "Progress saved" : `Save failed: ${res.reason}`);
};

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-close");
    const map = {
      char: "#panel-char",
      inv: "#panel-inv",
      npc: "#panel-npc",
      quests: "#panel-quests",
      party: "#panel-party",
      tower: "#panel-tower",
      dungeon: "#panel-dungeon",
    };
    if (map[key]) $(map[key]).hidden = true;
  });
});

window.addEventListener("keydown", (e) => {
  if (!$("#game-screen").classList.contains("active")) return;
  if (!$("#panel-death").hidden) return;
  const k = e.key.toLowerCase();
  if (k === "c") togglePanel("char");
  if (k === "i") togglePanel("inv");
  if (k === "q") togglePanel("quests");
  if (k === "p") togglePanel("party");
  if (k === "escape") {
    if (DungeonService.isInside()) togglePanel("dungeon");
    else togglePanel("menu");
  }
  if (e.key === "Tab") {
    e.preventDefault();
    ui.setScoreboard(true);
  }
});

$("#btn-dt-solo")?.addEventListener("click", () => {
  $("#panel-tower").hidden = true;
  game.enterDemonTower({ withParty: false });
});
$("#btn-dt-party")?.addEventListener("click", () => {
  $("#panel-tower").hidden = true;
  game.enterDemonTower({ withParty: true });
});
$("#btn-dt-next")?.addEventListener("click", () => {
  game.advanceDemonFloor();
  renderDungeonPanel();
});
$("#btn-dt-exit")?.addEventListener("click", () => {
  $("#panel-dungeon").hidden = true;
  game.exitDemonTower();
});
$("#btn-party-accept")?.addEventListener("click", () => {
  game.acceptPartyInvite();
  renderPartyPanel();
});
$("#btn-party-decline")?.addEventListener("click", () => {
  game.declinePartyInvite();
  renderPartyPanel();
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Tab") ui.setScoreboard(false);
});

net.onPeers = (peers) => {
  if (game.running) game.onPeers(peers);
  ui.setPlayers(peers.length);
  ui.updateScoreboard(peers);
};

async function afterAuth(user) {
  sessionUser = user;
  userId = user?.id || "local";
  offlineMode = !hasSupabase;
  showLobbyView("chars");
  await refreshCharList();
}

async function refreshCharList() {
  const err = $("#chars-error");
  err.hidden = true;
  const listEl = $("#char-list");
  listEl.innerHTML = "";
  try {
    const list = await CharacterService.list(userId);
    if (!list.length) {
      listEl.innerHTML = `<p class="sub">No characters yet. Create one.</p>`;
      return;
    }
    for (const ch of list) {
      const card = document.createElement("div");
      card.className = "char-card";
      const k = KINGDOMS.find((x) => x.id === ch.kingdom)?.name || "";
      card.innerHTML = `<div><b>${ch.name}</b><small>Lv.${ch.level} ${CLASSES[ch.classId]?.name || ""} · ${ch.spec || ""} · ${k}</small></div>`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-mini del";
      del.textContent = "Delete";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pin = prompt("Enter delete PIN");
        if (pin == null) return;
        try {
          await CharacterService.remove(userId, ch.id, pin);
          await refreshCharList();
        } catch (ex) {
          err.hidden = false;
          err.textContent = ex.message || String(ex);
        }
      });
      card.appendChild(del);
      card.addEventListener("click", () => enterWorld(ch));
      listEl.appendChild(card);
    }
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message || String(e);
  }
}

async function enterWorld(character) {
  await audio.unlock();
  const cls = CLASSES[character.classId] || CLASSES.warrior;
  currentProfile = {
    id: hasSupabase && sessionUser ? sessionUser.id : `local_${character.id}`,
    name: character.name,
    classId: character.classId,
    color: cls.color,
    level: character.level,
    metins: character.metins,
    kills: character.kills,
  };

  if (!hasSupabase) {
    offlineMode = true;
    net.playerId = currentProfile.id;
    net.isHost = true;
    net.started = true;
    net.sendPlayer = () => {};
    net.sendWorld = () => {};
    net.sendEvent = () => {};
    net.updatePresence = async () => {};
    net.leave = async () => {};
  } else {
    await net.join("WORLD", currentProfile);
  }

  show("game");
  game.start(currentProfile, character);
  ui.toast(hasSupabase ? "Entered the open world" : "Solo offline");
  ui.requestSave(false);
}

function setAuthError(msg) {
  const err = $("#lobby-error");
  err.hidden = !msg;
  err.textContent = msg || "";
}

$("#btn-login").addEventListener("click", async () => {
  setAuthError("");
  try {
    if (!hasSupabase) {
      await afterAuth({ id: "local" });
      return;
    }
    const email = $("#inp-email").value.trim();
    const password = $("#inp-password").value;
    const user = await AuthService.signInEmail(email, password);
    await afterAuth(user);
  } catch (e) {
    setAuthError(e.message || String(e));
  }
});

$("#btn-signup").addEventListener("click", async () => {
  setAuthError("");
  try {
    if (!hasSupabase) throw new Error("Supabase not configured");
    const email = $("#inp-email").value.trim();
    const password = $("#inp-password").value;
    const user = await AuthService.signUpEmail(email, password);
    await afterAuth(user || (await AuthService.getUser()));
    ui.toast("Account created — check email if confirmation is required");
  } catch (e) {
    setAuthError(e.message || String(e));
  }
});

$("#btn-guest").addEventListener("click", async () => {
  setAuthError("");
  try {
    if (!hasSupabase) {
      await afterAuth({ id: "local" });
      return;
    }
    const user = await AuthService.signInAnonymous();
    await afterAuth(user);
  } catch (e) {
    setAuthError(e.message || String(e));
  }
});

$("#btn-reset").addEventListener("click", async () => {
  setAuthError("");
  try {
    const email = $("#inp-email").value.trim();
    if (!email) throw new Error("Enter your email first");
    await AuthService.resetPassword(email);
    setAuthError("Password reset email sent (if the account exists).");
  } catch (e) {
    setAuthError(e.message || String(e));
  }
});

$("#btn-logout").addEventListener("click", async () => {
  await AuthService.signOut();
  sessionUser = null;
  userId = null;
  showLobbyView("auth");
});

$("#btn-new-char").addEventListener("click", () => showLobbyView("create"));
$("#btn-create-back").addEventListener("click", () => showLobbyView("chars"));

$("#btn-create").addEventListener("click", async () => {
  const err = $("#create-error");
  err.hidden = true;
  try {
    const name = ($("#inp-name").value || "").trim();
    const pin = ($("#inp-pin").value || "0000").trim() || "0000";
    const nameErr = CharacterService.validateName(name);
    if (nameErr) throw new Error(nameErr);
    if (!userId) throw new Error("Not signed in");
    const ch = await CharacterService.create(userId, {
      name,
      classId: selectedClass,
      spec: selectedSpec,
      gender: selectedGender,
      kingdom: selectedKingdom,
      deletePin: pin,
    });
    await enterWorld(ch);
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message || String(e);
  }
});

$("#btn-save").addEventListener("click", () => ui.requestSave(true));
$("#btn-leave").addEventListener("click", async () => {
  await ui.requestSave(true);
  game.stop();
  await net.leave();
  $("#panel-menu").hidden = true;
  show("lobby");
  showLobbyView(userId ? "chars" : "auth");
  if (userId) refreshCharList();
});

$("#btn-respawn-town").addEventListener("click", () => game.respawn("town"));
$("#btn-respawn-here").addEventListener("click", () => game.respawn("here"));

// Audio dock
const volMusic = $("#vol-music");
const volSfx = $("#vol-sfx");
const btnMute = $("#btn-mute");
if (volMusic) {
  volMusic.value = String(Math.round(audio.musicVol * 100));
  volSfx.value = String(Math.round(audio.sfxVol * 100));
  btnMute.textContent = audio.muted ? "🔇" : "🔊";
  volMusic.addEventListener("input", () => {
    audio.unlock();
    audio.setMusicVolume(Number(volMusic.value) / 100);
  });
  volSfx.addEventListener("input", () => {
    audio.unlock();
    audio.setSfxVolume(Number(volSfx.value) / 100);
  });
  btnMute.addEventListener("click", () => {
    audio.unlock();
    const m = audio.toggleMute();
    btnMute.textContent = m ? "🔇" : "🔊";
  });
}

// Unlock audio on first interaction
const unlockAudio = () => {
  audio.unlock();
  window.removeEventListener("pointerdown", unlockAudio);
};
window.addEventListener("pointerdown", unlockAudio);

// Resume session if already logged in
(async () => {
  if (!hasSupabase) return;
  try {
    const user = await AuthService.getUser();
    if (user) await afterAuth(user);
  } catch {
    /* stay on auth */
  }
})();

console.info(`[METIN3] supabase=${hasSupabase ? "ready" : "missing"} phase1`);
