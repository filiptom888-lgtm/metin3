import "./style.css";
import { CLASSES, MAP_SIZE, CITY_RADIUS, EDGE_PORTAL, MAP_HALF, TOWER_CORNER } from "./game/data.js";
import { BANDIT_CAMP } from "./data/banditCamp.js";
import { campsOnMap } from "./data/wildCamps.js";
import { fieldRoads } from "./game/terrain.js";
import { NatureKit } from "./game/NatureKit.js";
import { AssetKit } from "./game/AssetKit.js";
import { Game } from "./game/Game.js";
import { WorldNet } from "./net/world.js";
import { hasSupabase, configHint } from "./net/supabase.js";
import { AuthService } from "./services/AuthService.js";
import { CharacterService } from "./services/CharacterService.js";
import { SkillService } from "./services/SkillService.js";
import { QuestService } from "./services/QuestService.js";
import { QuestMail } from "./services/QuestMail.js";
import { NpcService } from "./services/NpcService.js";
import { ItemService } from "./services/ItemService.js";
import { PartyService } from "./services/PartyService.js";
import { TradeService } from "./services/TradeService.js";
import { PvPService } from "./services/PvPService.js";
import { DungeonService } from "./services/DungeonService.js";
import { WORLD_WARPS, SPECS, hasSkillPath } from "./data/meta.js";
import { derivedStats, xpForLevel } from "./game/character.js";
import { EQUIP_SLOTS as SLOTS, RARITY_COLOR, ITEM_TEMPLATES } from "./data/items.js";
import { SHOP_CATALOG, SHOP_TABS } from "./data/npcs.js";
import { QUESTS } from "./data/quests.js";
import {
  MINIBOSS_AREAS,
  QUEST_HUNT,
  questHuntFor,
  zoneRing,
  metinSpawnRing,
  npcsOnMap,
} from "./data/mapMarkers.js";
import { getUpgradeRecipe } from "./data/upgrades.js";
import { DEMON_TOWER, floorConfig } from "./data/demonTower.js";
import { MapService } from "./services/MapService.js";
import { audio } from "./audio/Audio.js";
import { itemIconHtml } from "./ui/itemIcon.js";
import { skillIconHtml } from "./ui/skillIcon.js";

const $ = (s) => document.querySelector(s);

const DOLL_SLOTS = ["helmet", "weapon", "shield", "armor", "bracelet", "necklace", "earring", "shoes"];
const BAG_SIZE = 40;

let _mapViewId = "overworld";
let _mapRefreshAt = 0;

let selectedClass = "warrior";
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
    $("#hud-level").textContent = `Lv.${p.level} ${cls.name}`;
    this.renderHotbar(p, game.character);
    this.chat(`${p.name} entered the kingdom`, "sys");
  },
  pushQuestMailFromKills(updates) {
    QuestMail.fromKillUpdates(updates);
    notifyQuestMail();
    refreshQuestUi();
  },
  scanQuestHints(ch) {
    QuestMail.scanHints(ch);
    notifyQuestMail();
  },
  resetQuestMail(ch) {
    QuestMail.clear();
    hideQuestLetter();
    QuestMail.scanHints(ch);
    notifyQuestMail();
  },
  renderHotbar(p, ch) {
    const skills = SkillService.listWithLevels(ch).slice(0, 4);
    const bar = $("#skill-bar");
    if (!bar) return;
    bar.innerHTML = "";
    if (!skills.length) {
      for (let i = 0; i < 4; i++) {
        const el = document.createElement("div");
        el.className = "skill-slot locked";
        el.dataset.slot = String(i);
        el.title = `Visit the Skill Master at Lv.${SkillService.unlockLevel}`;
        el.innerHTML = `<span class="k">${i + 1}</span><span class="sk-ico skill-ico-fallback">—</span><div class="cd" hidden></div>`;
        bar.appendChild(el);
      }
    } else {
      skills.forEach((sk, i) => {
        const el = document.createElement("div");
        el.className = "skill-slot";
        el.dataset.slot = String(i);
        const timing = SkillService.timing(sk);
        const rank = sk.level || 1;
        el.title = `${sk.name} M${rank} · ${sk.sp} SP · cast ${timing.cast.toFixed(1)}s · CD ${sk.cd}s`;
        el.innerHTML = `<span class="k">${i + 1}</span>${skillIconHtml(sk)}<span class="sk-rank">M${rank}</span><div class="cd" hidden></div>`;
        bar.appendChild(el);
      });
    }
    const sep = document.createElement("div");
    sep.className = "hotbar-sep";
    sep.setAttribute("aria-hidden", "true");
    bar.appendChild(sep);

    const potions = ensureHotbar(ch);
    for (let i = 0; i < 2; i++) {
      const itemId = potions[i];
      const def = itemId ? getItem(itemId) : null;
      const qty = itemId
        ? (ch?.inventory || []).filter((s) => s.itemId === itemId).reduce((n, s) => n + (s.qty || 0), 0)
        : 0;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "skill-slot potion-slot" + (def ? "" : " empty");
      el.dataset.potionSlot = String(i);
      el.title = def ? `${def.name} (key ${i + 5}) — click use · right-click clear` : `Empty potion slot ${i + 5}`;
      el.innerHTML = `
        <span class="k">${i + 5}</span>
        ${def ? itemIconHtml(def, { cls: "sk-ico item-ico" }) : `<img class="sk-ico item-ico pot-empty" src="/icons/items/red_potion.svg?v=2" alt="Empty potion" draggable="false" />`}
        ${def ? `<span class="sk-qty">×${qty}</span>` : ""}
        <div class="cd" hidden></div>
      `;
      el.addEventListener("click", () => {
        game.useHotbarPotion(i);
        this.renderHotbar(game.local, game.character);
        if (!$("#panel-inv").hidden) renderInventory(game.character);
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        game.clearHotbarPotion(i);
        audio.sfx("ui");
        this.renderHotbar(game.local, game.character);
        ui.toast(`Cleared hotbar ${i + 5}`);
      });
      bar.appendChild(el);
    }
  },
  updateHud(p, ch) {
    const cls = CLASSES[p.classId];
    const path = SPECS[ch?.classId || p.classId]?.find((s) => s.id === ch?.spec);
    const spec = path ? ` · ${path.name}` : !hasSkillPath(ch?.spec) ? " · No path" : "";
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
    const elMetins = $("#stat-metins");
    const elKills = $("#stat-kills");
    const elGold = $("#stat-gold");
    if (elMetins) elMetins.textContent = String(p.metins);
    if (elKills) elKills.textContent = String(p.kills);
    if (elGold) elGold.textContent = String(p.gold || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    this.updateCastBar(game?.casts);
    // Refresh world map markers (quests / live metins) while open
    if (!$("#panel-map")?.hidden) {
      const now = performance.now();
      if (!_mapRefreshAt || now - _mapRefreshAt > 700) {
        _mapRefreshAt = now;
        drawWorldMap(_mapViewId);
      }
    }
    if (ch) {
      const xpNext = ch.xpNext || xpForLevel(ch.level);
      const xpR = Math.max(0, Math.min(1, ch.xp / xpNext));
      $("#bar-xp").style.transform = `scaleX(${xpR})`;
    }
    // Refresh potion qty icons cheaply
    const bar = $("#skill-bar");
    if (bar && ch) {
      const potionBtns = bar.querySelectorAll("[data-potion-slot]");
      const potions = ensureHotbar(ch);
      potionBtns.forEach((el) => {
        const i = Number(el.dataset.potionSlot);
        const itemId = potions[i];
        const def = itemId ? getItem(itemId) : null;
        const qty = itemId
          ? (ch.inventory || []).filter((s) => s.itemId === itemId).reduce((n, s) => n + (s.qty || 0), 0)
          : 0;
        const ico = el.querySelector(".sk-ico, .item-ico");
        const qEl = el.querySelector(".sk-qty");
        if (ico) {
          if (def) {
            const wrap = document.createElement("div");
            wrap.innerHTML = itemIconHtml(def, { cls: "sk-ico item-ico" });
            const next = wrap.querySelector("img,span");
            if (next) ico.replaceWith(next);
          } else {
            const img = document.createElement("img");
            img.className = "sk-ico item-ico pot-empty";
            img.src = "/icons/items/red_potion.svg?v=2";
            img.alt = "Empty potion";
            img.draggable = false;
            ico.replaceWith(img);
          }
        }
        if (qEl) qEl.textContent = def ? `×${qty}` : "";
        el.classList.toggle("empty", !def);
        const cd = p.skillCd?.[4 + i] || 0;
        const cdEl = el.querySelector(".cd");
        if (cdEl) {
          if (cd > 0.05) {
            cdEl.hidden = false;
            cdEl.textContent = cd.toFixed(1);
          } else cdEl.hidden = true;
        }
      });
      const skillSlots = bar.querySelectorAll(".skill-slot:not(.potion-slot)");
      skillSlots.forEach((el, i) => {
        const cd = p.skillCd?.[i] || 0;
        const cdEl = el.querySelector(".cd");
        if (!cdEl) return;
        if (cd > 0.05) {
          cdEl.hidden = false;
          cdEl.textContent = cd.toFixed(1);
        } else cdEl.hidden = true;
      });
    }
  },
  updateCastBar(casts) {
    const bar = $("#cast-bar");
    const fill = $("#cast-bar-fill");
    const nameEl = $("#cast-bar-name");
    const timeEl = $("#cast-bar-time");
    if (!bar || !fill) return;

    // Prefer skill casts; skip tiny auto-attack windups
    const list = Array.isArray(casts) ? casts : [];
    const skill = list.find((c) => c.kind === "skill" && (c.duration || 0) > 0.05);
    const basic = list.find((c) => c.kind === "basic" && (c.duration || 0) >= 0.28);
    const c = skill || basic;

    const slots = document.querySelectorAll("#skill-bar .skill-slot:not(.potion-slot)");
    slots.forEach((el) => {
      el.classList.remove("casting");
      const cf = el.querySelector(".cast-fill");
      if (cf) cf.style.height = "0%";
    });

    if (!c) {
      bar.hidden = true;
      fill.style.transform = "scaleX(0)";
      return;
    }

    const total = Math.max(0.05, c.duration || c.time || 0.05);
    const left = Math.max(0, c.time);
    const progress = Math.max(0, Math.min(1, 1 - left / total));
    bar.hidden = false;
    bar.classList.toggle("basic", c.kind === "basic");
    if (nameEl) nameEl.textContent = c.skName || (c.kind === "basic" ? "Attack" : "Casting");
    if (timeEl) timeEl.textContent = `${left.toFixed(1)}s`;
    fill.style.transform = `scaleX(${progress})`;

    if (c.kind === "skill" && c.skillIndex != null) {
      const slot = slots[c.skillIndex];
      if (slot) {
        slot.classList.add("casting");
        let cf = slot.querySelector(".cast-fill");
        if (!cf) {
          cf = document.createElement("div");
          cf.className = "cast-fill";
          slot.appendChild(cf);
        }
        cf.style.height = `${Math.round(progress * 100)}%`;
      }
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
    const el = $("#room-chip");
    if (el) el.textContent = code;
  },
  setMap(name, mapId) {
    const el = $("#map-chip");
    const menuMap = $("#menu-map-name");
    if (menuMap) menuMap.textContent = name || "Shinsoo";
    if (!el) return;
    el.textContent = name || "Shinsoo";
    el.classList.toggle("dungeon", mapId === "demon_tower");
    el.classList.toggle("valley", mapId === "valley");
    el.classList.toggle("orc", mapId === "orc_valley");
  },
  setHost(isHost) {
    const el = $("#host-chip");
    if (!el) return;
    el.textContent = isHost ? "HOST" : "CLIENT";
    el.classList.toggle("host", isHost);
  },
  setPlayers(n) {
    const el = $("#players-chip");
    if (el) el.textContent = `${n} online`;
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
    const dungeon = MapService.is("demon_tower");
    const valley = MapService.is("valley");
    const orc = MapService.is("orc_valley");
    ctx.fillStyle = dungeon ? "#1a0a0e" : orc ? "#142018" : valley ? "#2a1e12" : "#1a2e18";
    ctx.fillRect(0, 0, w, h);
    const mapSize = dungeon ? 40 : orc ? 160 : MAP_SIZE;
    const to = (x, z) => [((x + mapSize / 2) / mapSize) * w, ((z + mapSize / 2) / mapSize) * h];
    if (!dungeon) {
      if (orc) {
        // Main island + portal islet
        ctx.strokeStyle = "rgba(90,140,70,0.55)";
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (32 / mapSize) * w, 0, Math.PI * 2);
        ctx.stroke();
        const [opx, opy] = to(-68.5, 0);
        ctx.fillStyle = "#c47a3a";
        ctx.beginPath();
        ctx.arc(opx, opy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // War tower mark
        ctx.fillStyle = "#c43c2e";
        ctx.fillRect(w / 2 - 2, h / 2 - 5, 4, 8);
        // Teleporter south of tower
        const [tpx, tpy] = to(0, 14);
        ctx.fillStyle = "#7dff9a";
        ctx.beginPath();
        ctx.arc(tpx, tpy, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Beaten roads (city → portals + trails)
        const roads = valley
          ? [
              [[-CITY_RADIUS, 0], [-EDGE_PORTAL, 0]],
              [[CITY_RADIUS, 0], [EDGE_PORTAL, 0]],
              [[0, -CITY_RADIUS], [0, -MAP_HALF * 0.72]],
              [[0, CITY_RADIUS], [BANDIT_CAMP.x * 0.55, BANDIT_CAMP.z * 0.55], [BANDIT_CAMP.x, BANDIT_CAMP.z]],
            ]
          : [
              [[CITY_RADIUS, 0], [EDGE_PORTAL, 0]],
              [[-CITY_RADIUS, 0], [-MAP_HALF * 0.78, 0]],
              [[0, -CITY_RADIUS], [0, -MAP_HALF * 0.75]],
              [[0, CITY_RADIUS], [DEMON_TOWER.entrance.x * 0.4, DEMON_TOWER.entrance.z * 0.55], [DEMON_TOWER.entrance.x, DEMON_TOWER.entrance.z]],
            ];
        ctx.strokeStyle = "rgba(120, 90, 45, 0.55)";
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        for (const path of roads) {
          ctx.beginPath();
          path.forEach(([rx, rz], i) => {
            const [mx, my] = to(rx, rz);
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
          });
          ctx.stroke();
        }
        ctx.strokeStyle = valley ? "rgba(180,140,70,0.5)" : "rgba(201,162,39,0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const cr = (CITY_RADIUS / MAP_SIZE) * w;
        ctx.arc(w / 2, h / 2, cr, 0, Math.PI * 2);
        ctx.stroke();
        // Edge portal markers
        const [px, py] = valley ? to(-EDGE_PORTAL, 0) : to(EDGE_PORTAL, 0);
        ctx.fillStyle = valley ? "#e8b84a" : "#6ec8ff";
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (valley) {
          const [ex, ey] = to(EDGE_PORTAL, 0);
          ctx.fillStyle = "#5a8a3a";
          ctx.beginPath();
          ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
          ctx.fill();
          // Rogue camp NW
          const [cx, cy] = to(BANDIT_CAMP.x, BANDIT_CAMP.z);
          ctx.fillStyle = "#c43c2e";
          ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
        } else {
          const [tx, ty] = to(DEMON_TOWER.entrance.x, DEMON_TOWER.entrance.z);
          ctx.fillStyle = "#ff6a4a";
          ctx.beginPath();
          ctx.moveTo(tx, ty - 4);
          ctx.lineTo(tx + 3.5, ty + 3);
          ctx.lineTo(tx - 3.5, ty + 3);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else {
      ctx.strokeStyle = "rgba(196,60,46,0.7)";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!dungeon) {
      ctx.fillStyle = "#c43c2e";
      for (const [, m] of metins) {
        if ((m.mapId || "overworld") !== MapService.currentId) continue;
        const [mx, my] = to(m.x, m.z);
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = dungeon ? "#e23a2e" : orc ? "#3a5a28" : valley ? "#c47a3a" : "#6b8f3a";
    for (const [, m] of mobs) {
      if (dungeon && !m.dungeon) continue;
      if (!dungeon && (m.mapId || "overworld") !== MapService.currentId) continue;
      const [mx, my] = to(m.x, m.z);
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    ctx.fillStyle = "#4db0ff";
    for (const [, r] of remotes) {
      const mid = r.target?.mapId || r.state?.mapId || "overworld";
      if (mid !== MapService.currentId) continue;
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
      def ? `${itemIconHtml(def)}<span class="up">${up}</span>` : `<span class="ico empty-ico">·</span>`
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
  const pathName = SPECS[ch.classId]?.find((s) => s.id === ch.spec)?.name || "No skill path";
  $("#char-title").textContent = `${ch.name} · Lv.${ch.level} ${CLASSES[ch.classId]?.name || ""} · ${pathName}`;
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

function ensureHotbar(ch) {
  if (!ch) return [null, null];
  if (!Array.isArray(ch.hotbarPotions) || ch.hotbarPotions.length < 2) {
    ch.hotbarPotions = ["red_potion", "blue_potion"];
  }
  return ch.hotbarPotions;
}

function isPotionItem(def) {
  return !!(def && def.slot === "consumable" && (def.heal || def.mana) && def.id !== "upgrade_ore");
}

function renderInventory(ch) {
  if (!ch) return;
  ensureHotbar(ch);
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
    if (!def) {
      cell.className = "inv-cell empty-slot";
      cell.disabled = true;
      cell.title = `Unknown item (${stack.itemId || "?"})`;
      grid.appendChild(cell);
      continue;
    }
    // Repair legacy / bad rows so bag never shows ×undefined / ×null
    if (stack.qty == null || !Number.isFinite(Number(stack.qty)) || Number(stack.qty) < 1) {
      stack.qty = 1;
    } else {
      stack.qty = Math.floor(Number(stack.qty));
    }
    cell.className = "inv-cell";
    cell.style.borderColor = RARITY_COLOR[def.rarity] || "#666";
    const up = stack.upgrade ? `+${stack.upgrade}` : "";
    const qtyHtml = def.stackable || stack.qty > 1 ? `<span class="qty">×${stack.qty}</span>` : "";
    cell.innerHTML = `${up ? `<span class="up-tag">${up}</span>` : ""}${itemIconHtml(def)}${qtyHtml}`;
    cell.title = def.skillBook
      ? `${ItemService.displayName(stack)} — click to open Skills`
      : isPotionItem(def)
        ? `${ItemService.displayName(stack)} — click use · right-click hotbar`
        : ItemService.displayName(stack);
    cell.addEventListener("mouseenter", () => {
      if (!tip) return;
      const bons = (stack.bonuses || []).map((b) => `${b.stat}+${b.value}`).join(", ");
      tip.hidden = false;
      const setLine = def.setName ? `<br><i style="color:#e8d48b">${def.setName}</i>` : "";
      const req = [
        def.levelReq ? `Lv.${def.levelReq}` : "",
        def.classReq?.length ? def.classReq.join("/") : "",
      ]
        .filter(Boolean)
        .join(" · ");
      tip.innerHTML = `<b style="color:${RARITY_COLOR[def.rarity]}">${ItemService.displayName(stack)}</b><br>${def.slot}${
        def.atk ? ` · ATK ${def.atk}` : ""
      }${def.matk ? ` · MATK ${def.matk}` : ""}${def.def ? ` · DEF ${def.def}` : ""}${
        def.mdef ? ` · MDEF ${def.mdef}` : ""
      }${bons ? `<br>${bons}` : ""}${setLine}${req ? `<br>${req}` : ""}${
        def.skillBook
          ? "<br><i>Click → Skills panel · raise path skills</i>"
          : isPotionItem(def)
            ? "<br><i>Right-click → hotbar 5/6</i>"
            : ""
      }`;
    });
    cell.addEventListener("click", () => {
      audio.sfx("ui");
      // During trade: click adds item to your offer
      if (TradeService.session && !$("#panel-trade")?.hidden) {
        game.tradeOfferItem(stack.uid);
        renderInventory(game.character);
        renderTradePanel();
        return;
      }
      if (def.slot === "consumable") game.useItem(stack.uid);
      else game.equipItem(stack.uid);
      renderInventory(game.character);
      renderCharacterPanel(game.character);
      ui.renderHotbar(game.local, game.character);
    });
    cell.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      audio.sfx("ui");
      if (e.shiftKey || !isPotionItem(def)) {
        game.dropItem(stack.uid);
        renderInventory(game.character);
        ui.renderHotbar(game.local, game.character);
        return;
      }
      const slot = game.assignPotionToHotbar(stack.itemId);
      ui.toast(slot >= 0 ? `${def.name} → hotbar ${slot + 5}` : "Hotbar full");
      ui.renderHotbar(game.local, game.character);
      renderInventory(game.character);
    });
    grid.appendChild(cell);
  }
}

/** Remember NPC filter so refreshes (accept / kill / HUD) keep the same view */
let questPanelGiver = null;

function renderQuests(ch = game.character, giver = questPanelGiver) {
  const body = $("#quest-body");
  if (!body || !ch) return;
  questPanelGiver = giver ?? null;
  QuestService.ensure(ch);
  body.innerHTML = "";

  const title = $("#panel-quests header h3");
  if (title) {
    title.textContent =
      questPanelGiver === "biologist"
        ? "Biologist — Research"
        : questPanelGiver === "quest_elder"
          ? "Village Elder — Quests"
          : "Quest Log";
  }

  if (questPanelGiver === "biologist") {
    const intro = document.createElement("p");
    intro.className = "npc-flavor";
    intro.textContent =
      "Ah, a willing field assistant. Finish each study in order — my research builds on the last sample.";
    body.appendChild(intro);
  } else if (questPanelGiver === "quest_elder") {
    const intro = document.createElement("p");
    intro.className = "npc-flavor";
    intro.textContent = "The kingdom needs brave hands. Accept a task, complete it in the field, then return for your reward.";
    body.appendChild(intro);
  }

  const list = document.createElement("div");
  list.className = "quest-list";
  const quests = QuestService.forGiver(questPanelGiver);

  // Sort: turn-in → in progress → available → locked → finished
  const rank = (q) => {
    const st = ch.quests[q.id];
    if (st?.state === "completed") return 0;
    if (st?.state === "accepted") return 1;
    if (!QuestService.canAccept(ch, q)) {
      if (st?.state === "claimed") return 4;
      return 3;
    }
    return 2;
  };
  const sorted = [...quests].sort((a, b) => rank(a) - rank(b));

  for (const q of sorted) {
    const st = ch.quests[q.id];
    const lockErr = !st ? QuestService.canAccept(ch, q) : null;
    const state = st?.state || (lockErr ? "locked" : "available");
    const prog = `${st?.progress || 0}/${q.count}`;
    const row = document.createElement("div");
    row.className = `quest-line quest-${state}`;
    const badge = QuestService.label(state);
    const giverTag =
      !questPanelGiver && q.giver === "biologist"
        ? " · Biologist"
        : !questPanelGiver && q.giver === "quest_elder"
          ? " · Elder"
          : "";
    const rewardLine = QuestService.formatReward(q.reward);
    row.innerHTML = `
      <div class="quest-info">
        <b>${q.name}</b>
        <small>${q.desc}</small>
        <small class="quest-meta">Lv.${q.levelReq} · ${prog} · ${badge}${giverTag}</small>
        <small class="quest-reward">Reward: ${rewardLine}</small>
      </div>`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-mini";

    if (state === "available") {
      btn.textContent = "Accept";
      btn.onclick = () => {
        const err = QuestService.accept(ch, q.id);
        if (err) {
          ui.toast(err);
          return;
        }
        audio.sfx("level");
        QuestMail.onAccepted(q);
        QuestMail.scanHints(ch);
        notifyQuestMail();
        refreshQuestUi();
        ui.requestSave?.(false);
      };
    } else if (state === "completed") {
      btn.textContent = "Claim";
      btn.classList.add("btn-claim");
      btn.onclick = () => {
        const target = game.character;
        const err = QuestService.claim(target, q.id);
        if (err) {
          ui.toast(err);
          return;
        }
        game.syncDerived();
        game.local.gold = target.gold;
        game.local.level = target.level;
        audio.sfx("level");
        const g = target._lastQuestGrants;
        let grantLine = "";
        if (g?.items?.length) {
          grantLine = g.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ");
          if (g.yang) grantLine = `${g.yang} Yang · ${grantLine}`;
        } else if (g?.yang) {
          grantLine = `${g.yang} Yang`;
        }
        QuestMail.onClaimed(q, grantLine || QuestService.formatReward(q.reward));
        QuestMail.scanHints(target);
        notifyQuestMail();
        refreshQuestUi();
        if (!$("#panel-inv").hidden) renderInventory(target);
        if (!$("#panel-char").hidden) renderCharacterPanel(target);
        ui.requestSave?.(false);
      };
    } else if (state === "accepted") {
      btn.textContent = `${prog}`;
      btn.disabled = true;
      btn.title = "In progress — hunt, then return";
    } else if (state === "claimed") {
      btn.textContent = "Done";
      btn.disabled = true;
    } else {
      btn.textContent = "Locked";
      btn.disabled = true;
      btn.title = lockErr || "Locked";
    }

    row.appendChild(btn);
    list.appendChild(row);
  }

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "sub";
    empty.textContent = "No quests here.";
    body.appendChild(empty);
  } else {
    body.appendChild(list);
  }

  renderQuestTracker(ch);
}

function refreshQuestUi() {
  const ch = game.character;
  if (!ch) return;
  if (!$("#panel-quests").hidden) renderQuests(ch, questPanelGiver);
  renderQuestTracker(ch);
  game.refreshQuestMarkers?.();
  game.refreshHuntMarkers?.();
  refreshQuestMailUi();
}

/** @type {import("./services/QuestMail.js").QuestMailMsg | null} */
let _openLetter = null;

function refreshQuestMailUi() {
  const btn = $("#quest-mail-btn");
  const countEl = $("#quest-mail-count");
  const unread = QuestMail.count();
  const total = unread + (_openLetter ? 1 : 0);
  if (btn) {
    btn.hidden = total === 0;
    if (countEl) countEl.textContent = String(Math.max(1, total));
  }
  if (_openLetter) renderOpenLetter(_openLetter);
  else {
    const el = $("#quest-letter");
    if (el) el.hidden = true;
  }
}

/** Push happened — refresh icon and auto-open if nothing is open. */
function notifyQuestMail() {
  refreshQuestMailUi();
  if (!_openLetter && QuestMail.count() > 0) openQuestLetter();
}

function renderOpenLetter(msg) {
  const el = $("#quest-letter");
  if (!el || !msg) return;
  $("#quest-letter-ribbon").textContent = msg.ribbon || "Quest";
  $("#quest-letter-title").textContent = msg.title;
  $("#quest-letter-body").textContent = msg.body;
  el.hidden = false;
}

function hideQuestLetter() {
  const el = $("#quest-letter");
  if (el) el.hidden = true;
  _openLetter = null;
}

/** Open next unread letter (from queue). */
function openQuestLetter() {
  if (_openLetter) return; // finish current first
  const msg = QuestMail.shift();
  if (!msg) {
    hideQuestLetter();
    refreshQuestMailUi();
    return;
  }
  _openLetter = msg;
  audio.sfx("ui");
  refreshQuestMailUi();
}

function continueQuestLetter() {
  audio.sfx("ui");
  _openLetter = null;
  hideQuestLetter();
  // Auto-open next if any remain
  if (QuestMail.count() > 0) {
    openQuestLetter();
  } else {
    refreshQuestMailUi();
  }
}

function onQuestMailBtnClick() {
  audio.sfx("ui");
  if (_openLetter) {
    continueQuestLetter();
    return;
  }
  if (QuestMail.count() > 0) {
    openQuestLetter();
    return;
  }
  // No mail — open quest log like Metin2 scroll → quests
  togglePanel("quests");
}

function renderQuestTracker(ch = game.character) {
  const box = $("#quest-tracker");
  const list = $("#quest-tracker-list");
  if (!box || !list || !ch) return;
  QuestService.ensure(ch);
  const active = QuestService.activeList(ch);
  if (!active.length) {
    box.hidden = true;
    list.innerHTML = "";
    return;
  }
  box.hidden = false;
  list.innerHTML = active
    .slice(0, 5)
    .map((q) => {
      const ready = q.state === "completed";
      const hunt = QUEST_HUNT[q.target];
      const where = hunt
        ? hunt.mapId === "valley"
          ? "Seungryong"
          : hunt.mapId === "orc_valley"
            ? "Orc Isles"
            : hunt.allField
              ? "Field"
              : "Shinsoo"
        : "";
      return `<div class="quest-track-row${ready ? " ready" : ""}">
        <b>${ready ? "✓ " : ""}${q.name}${where && !ready ? ` · ${where}` : ""}</b>
        <span>${ready ? "Turn in" : `${q.progress}/${q.count}`}</span>
      </div>`;
    })
    .join("");
}

let shopTab = "potions";
let smithSelectedUid = null;

function sellPrice(stack) {
  const t = getItem(stack.itemId);
  if (!t) return 0;
  return Math.floor((t.sell || 10) * (1 + (stack.upgrade || 0) * 0.15));
}

function listEquippedStacks(ch) {
  const out = [];
  for (const slot of DOLL_SLOTS) {
    const ref = ch.equipment?.[slot];
    if (!ref) continue;
    const def = getItem(ref.itemId || ref);
    if (!def) continue;
    out.push({
      ...(typeof ref === "object" ? ref : { itemId: ref }),
      _equippedSlot: slot,
    });
  }
  return out;
}

/** Compact paperdoll for shop / blacksmith */
function appendNpcEquipDoll(parent, ch, npc, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "npc-equip";
  const label = document.createElement("div");
  label.className = "field-label";
  label.textContent = opts.label || "Equipped";
  wrap.appendChild(label);

  const doll = document.createElement("div");
  doll.className = "paperdoll paperdoll-npc";
  for (const s of DOLL_SLOTS) {
    const ref = ch.equipment?.[s];
    const id = ref ? ref.itemId || ref : null;
    const def = id ? getItem(id) : null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doll-slot" + (def ? "" : " empty");
    if (def && opts.selectedUid && ref?.uid === opts.selectedUid) btn.classList.add("selected");
    btn.dataset.slot = s;
    btn.style.borderColor = def ? RARITY_COLOR[def.rarity] : "";
    const up = ref?.upgrade ? `+${ref.upgrade}` : "";
    btn.innerHTML = `<span class="lbl">${s}</span>${
      def ? `${itemIconHtml(def)}<span class="up">${up}</span>` : `<span class="ico empty-ico">·</span>`
    }`;
    btn.title = def
      ? `${ItemService.displayName(ref)}${opts.hint ? ` — ${opts.hint}` : ""}`
      : s;
    if (def && typeof opts.onSlot === "function") {
      btn.addEventListener("click", () => {
        audio.sfx("ui");
        opts.onSlot(s, ref, def);
      });
    }
    doll.appendChild(btn);
  }
  wrap.appendChild(doll);
  parent.appendChild(wrap);
}

function renderNpcPanel(npc) {
  $("#npc-title").textContent = npc.name;
  const body = $("#npc-body");
  body.innerHTML = "";
  const ch = game.character;
  if (npc.role === "shop") {
    renderShopUi(body, npc, ch);
  } else if (npc.role === "blacksmith") {
    renderSmithUi(body, npc, ch);
  } else if (npc.role === "teleport") {
    const wrap = document.createElement("div");
    wrap.className = "tele-grid";
    const intro = document.createElement("p");
    intro.className = "npc-flavor";
    intro.textContent =
      npc.id === "orc_tele"
        ? "The war tower's gate opens every road. Choose your destination."
        : "Choose a destination across Shinsoo, Seungryong, and the Orc Isles.";
    body.appendChild(intro);
    const here = MapService.currentId;
    for (const w of WORLD_WARPS) {
      // Skip the pad you're already standing on
      if (w.mapId === here && Math.hypot((game.local?.x || 0) - w.x, (game.local?.z || 0) - w.z) < 4) {
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tele-card";
      const region = w.mapId === "orc_valley" ? "Orc" : w.mapId === "valley" ? "Valley" : "City";
      btn.innerHTML = `<b>${w.name}</b><span>${region}</span>`;
      btn.onclick = () => {
        game.teleportTo(w.mapId, w.x, w.z, w.name);
        $("#panel-npc").hidden = true;
      };
      wrap.appendChild(btn);
    }
    body.appendChild(wrap);
  } else if (npc.role === "quest") {
    $("#panel-npc").hidden = true;
    $("#panel-quests").hidden = false;
    questPanelGiver = "quest_elder";
    renderQuests(ch, "quest_elder");
  } else if (npc.role === "biologist") {
    $("#panel-npc").hidden = true;
    $("#panel-quests").hidden = false;
    questPanelGiver = "biologist";
    renderQuests(ch, "biologist");
  } else if (npc.role === "skillmaster") {
    renderSkillMasterUi(body, ch);
  }
}

function renderSkillMasterUi(body, ch) {
  const intro = document.createElement("p");
  intro.className = "npc-flavor";
  const clsName = CLASSES[ch.classId]?.name || "Warrior";
  const paths = SkillService.pathsFor(ch.classId);

  if (SkillService.hasPath(ch)) {
    const path = paths.find((p) => p.id === ch.spec);
    intro.textContent = `You walk the ${path?.name || ch.spec} path, ${clsName}. Your skills are set — train them in battle.`;
    body.appendChild(intro);
    const skills = SkillService.listFor(ch.classId, ch.spec);
    const list = document.createElement("div");
    list.className = "skill-path-skills";
    list.innerHTML = skills
      .map(
        (s, i) =>
          `<div class="skill-chip">${skillIconHtml(s)}<div class="skill-chip-txt"><b>${i + 1}. ${s.name}</b><span>${s.sp} SP · ${s.cd}s</span></div></div>`
      )
      .join("");
    body.appendChild(list);
    return;
  }

  const lockErr = SkillService.canChoose(ch);
  if (lockErr) {
    intro.textContent = `Return at Lv.${SkillService.unlockLevel}, young ${clsName}. Only then may you choose your skill path.`;
    body.appendChild(intro);
    const note = document.createElement("p");
    note.className = "sub";
    note.textContent = lockErr;
    body.appendChild(note);
    return;
  }

  intro.textContent = `You are ready, ${clsName}. Choose wisely — your skill path cannot be changed.`;
  body.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = "skill-path-grid";
  for (const path of paths) {
    const skills = SkillService.listFor(ch.classId, path.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "skill-path-card";
    card.innerHTML = `
      <b>${path.name}</b>
      <span class="blurb">${path.blurb}</span>
      <ul>${skills.map((s) => `<li>${skillIconHtml(s, { cls: "skill-ico skill-ico-sm" })}<span>${s.name}</span></li>`).join("")}</ul>
      <em>Choose ${path.name}</em>
    `;
    card.onclick = () => {
      const err = SkillService.choosePath(ch, path.id);
      if (err) {
        ui.toast(err);
        return;
      }
      audio.sfx("level");
      game.syncDerived();
      ui.renderHotbar(game.local, ch);
      ui.toast(`${path.name} path unlocked!`);
      ui.requestSave?.(false);
      renderNpcPanel({ id: "skill_master", name: "Skill Master", role: "skillmaster" });
    };
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

function renderShopUi(body, npc, ch) {
  const head = document.createElement("div");
  head.className = "npc-yang";
  head.innerHTML = `<span>Your Yang</span><b>${ch.gold ?? 0}</b>`;
  body.appendChild(head);

  appendNpcEquipDoll(body, ch, npc, {
    label: "Equipped",
    hint: shopTab === "sell" ? "click to sell" : "click to unequip",
    onSlot: (slot, ref) => {
      if (shopTab === "sell") {
        const price = sellPrice(ref);
        const err = NpcService.sell(ch, ref.uid);
        if (err) ui.toast(err);
        else {
          game.local.gold = ch.gold;
          game.syncDerived();
          ui.toast(`Sold for ${price} Yang`);
          renderNpcPanel(npc);
          renderInventory(ch);
          renderCharacterPanel(ch);
        }
        return;
      }
      game.unequip(slot);
      renderNpcPanel(npc);
      renderInventory(ch);
      renderCharacterPanel(ch);
    },
  });

  const tabs = document.createElement("div");
  tabs.className = "npc-tabs";
  for (const t of SHOP_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "npc-tab" + (shopTab === t.id ? " active" : "");
    btn.textContent = t.label;
    btn.onclick = () => {
      shopTab = t.id;
      renderNpcPanel(npc);
    };
    tabs.appendChild(btn);
  }
  body.appendChild(tabs);

  const grid = document.createElement("div");
  grid.className = "shop-grid";

  if (shopTab === "sell") {
    const equipped = listEquippedStacks(ch);
    const bag = (ch.inventory || []).filter((s) => getItem(s.itemId));
    const sellable = [...equipped, ...bag];
    if (!sellable.length) {
      const empty = document.createElement("p");
      empty.className = "sub shop-empty";
      empty.textContent = "Nothing to sell.";
      body.appendChild(empty);
      return;
    }
    for (const stack of sellable) {
      const def = getItem(stack.itemId);
      const price = sellPrice(stack);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "shop-card sell" + (stack._equippedSlot ? " equipped" : "");
      card.style.borderColor = RARITY_COLOR[def.rarity] || "";
      card.innerHTML = `
        ${itemIconHtml(def)}
        <span class="nm">${def.name}${stack.upgrade ? ` +${stack.upgrade}` : ""}</span>
        <span class="pr">+${price}</span>
        ${stack._equippedSlot ? `<span class="eq-tag">EQ</span>` : ""}
        ${stack.qty > 1 ? `<span class="qty">${stack.qty}</span>` : ""}
      `;
      card.title = stack._equippedSlot
        ? `Equipped (${stack._equippedSlot}) — sell for ${price} Yang`
        : `Sell for ${price} Yang`;
      card.onclick = () => {
        const err = NpcService.sell(ch, stack.uid);
        if (err) ui.toast(err);
        else {
          game.local.gold = ch.gold;
          game.syncDerived();
          audio.sfx("ui");
          ui.toast(`Sold for ${price} Yang`);
          renderNpcPanel(npc);
          renderInventory(ch);
          renderCharacterPanel(ch);
        }
      };
      grid.appendChild(card);
    }
  } else {
    const offers = SHOP_CATALOG.filter((o) => o.tab === shopTab);
    for (const offer of offers) {
      const def = getItem(offer.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "shop-card";
      card.style.borderColor = RARITY_COLOR[def?.rarity] || "";
      const can = (ch.gold ?? 0) >= offer.price;
      if (!can) card.classList.add("cant");
      card.innerHTML = `
        ${def ? itemIconHtml(def) : `<span class="ico">·</span>`}
        <span class="nm">${def?.name || offer.id}</span>
        <span class="pr">${offer.price}</span>
      `;
      card.title = `Buy ${def?.name || offer.id} — ${offer.price} Yang`;
      card.onclick = () => {
        const err = NpcService.buy(ch, offer.id);
        if (err) ui.toast(err);
        else {
          game.local.gold = ch.gold;
          audio.sfx("ui");
          ui.toast(`Bought ${def?.name}`);
          renderNpcPanel(npc);
          renderInventory(ch);
        }
      };
      grid.appendChild(card);
    }
  }
  body.appendChild(grid);
}

function renderSmithUi(body, npc, ch) {
  const blessed = !!npc?.towerSmith;
  const usesLeft = blessed ? DungeonService.smithUsesLeft(game.local?.id) : null;
  const isUpgradable = (stack) => {
    const def = getItem(stack.itemId);
    if (!def) return false;
    if (def.slot === "consumable" || def.slot === "material") return false;
    return (stack.upgrade || 0) < 9;
  };
  const equipped = listEquippedStacks(ch).filter(isUpgradable);
  const bag = (ch.inventory || []).filter(isUpgradable);
  const gear = [...equipped, ...bag];

  if (smithSelectedUid && !gear.some((g) => g.uid === smithSelectedUid)) {
    smithSelectedUid = null;
  }
  if (!smithSelectedUid && gear[0]) smithSelectedUid = gear[0].uid;

  if (blessed) {
    const banner = document.createElement("p");
    banner.className = "sub";
    banner.style.color = "#e8b84a";
    banner.textContent =
      usesLeft > 0
        ? `Infernal forge — ${usesLeft} blessed upgrade${usesLeft === 1 ? "" : "s"} left (safer & cheaper).`
        : "No Infernal forge uses left — exit the portal to Shinsoo.";
    body.appendChild(banner);
  }

  const head = document.createElement("div");
  head.className = "npc-yang";
  head.innerHTML = `<span>Your Yang</span><b>${ch.gold ?? 0}</b>`;
  body.appendChild(head);

  appendNpcEquipDoll(body, ch, npc, {
    label: "Equipped — click to forge",
    hint: "select for upgrade",
    selectedUid: smithSelectedUid,
    onSlot: (slot, ref) => {
      if (!isUpgradable(ref)) {
        ui.toast("Cannot upgrade this");
        return;
      }
      smithSelectedUid = ref.uid;
      renderNpcPanel(npc);
    },
  });

  const layout = document.createElement("div");
  layout.className = "smith-layout";

  const pick = document.createElement("div");
  pick.className = "smith-pick";
  const pickLabel = document.createElement("div");
  pickLabel.className = "field-label";
  pickLabel.textContent = "Bag / upgradable";
  pick.appendChild(pickLabel);

  if (!gear.length) {
    const empty = document.createElement("p");
    empty.className = "sub shop-empty";
    empty.textContent = "No upgradable gear equipped or in your bag.";
    pick.appendChild(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "smith-grid";
    for (const stack of gear) {
      const def = getItem(stack.itemId);
      const level = stack.upgrade || 0;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className =
        "smith-cell" +
        (stack.uid === smithSelectedUid ? " selected" : "") +
        (stack._equippedSlot ? " equipped" : "");
      cell.style.borderColor = RARITY_COLOR[def.rarity] || "";
      cell.innerHTML = `
        ${itemIconHtml(def)}
        <span class="up-tag">+${level}</span>
        ${stack._equippedSlot ? `<span class="eq-tag">EQ</span>` : ""}
      `;
      cell.title = `${def.name} +${level}${stack._equippedSlot ? " (equipped)" : ""}`;
      cell.onclick = () => {
        smithSelectedUid = stack.uid;
        renderNpcPanel(npc);
      };
      grid.appendChild(cell);
    }
    pick.appendChild(grid);
  }
  layout.appendChild(pick);

  const forge = document.createElement("div");
  forge.className = "smith-forge";
  const selected = gear.find((g) => g.uid === smithSelectedUid);
  if (!selected) {
    forge.innerHTML = `<p class="sub">Select equipped or bag gear to raise +0…+9.</p>`;
  } else if (blessed && usesLeft <= 0) {
    forge.innerHTML = `<p class="sub">No forge uses left. Use the exit portal to return to Shinsoo.</p>`;
  } else {
    const def = getItem(selected.itemId);
    const level = selected.upgrade || 0;
    const recipe = getUpgradeRecipe(level, { blessed });
    const chance = Math.floor((recipe?.chance || 0) * 100);
    const risk = [];
    if (recipe?.downgrade) risk.push("can drop");
    if (recipe?.destroyOnFail) risk.push("can break");
    forge.innerHTML = `
      <div class="forge-item" style="border-color:${RARITY_COLOR[def.rarity] || ""}">
        ${itemIconHtml(def)}
        <div>
          <b>${def.name}</b>
          <span>+${level} → +${level + 1}${selected._equippedSlot ? " · worn" : ""}${blessed ? " · blessed" : ""}</span>
        </div>
      </div>
      <div class="forge-stats">
        <div><em>Success</em><b>${chance}%</b></div>
        <div><em>Cost</em><b>${recipe?.yang ?? 0}</b></div>
      </div>
      ${
        blessed
          ? `<p class="forge-safe">Infernal forge — no break / no drop</p>`
          : risk.length
            ? `<p class="forge-risk">${risk.join(" · ")}</p>`
            : `<p class="forge-safe">Safe fail</p>`
      }
    `;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary forge-btn";
    btn.textContent = blessed ? `Blessed upgrade (+${level + 1})` : `Upgrade (+${level + 1})`;
    btn.disabled = (ch.gold ?? 0) < (recipe?.yang ?? 0) || (blessed && usesLeft <= 0);
    btn.onclick = () => {
      if (blessed && DungeonService.smithUsesLeft(game.local?.id) <= 0) {
        ui.toast("No Infernal forge uses left");
        return;
      }
      const goldBefore = ch.gold ?? 0;
      const res = NpcService.upgrade(ch, selected.uid, { blessed });
      // Count a use only when the forge actually spent Yang
      if (blessed && (ch.gold ?? 0) < goldBefore) {
        DungeonService.consumeSmithUse(game.local?.id);
      }
      game.local.gold = ch.gold;
      audio.sfx(res.ok ? "buff" : "ui");
      ui.toast(res.msg + (blessed ? ` · ${DungeonService.smithUsesLeft(game.local?.id)} left` : ""));
      game.syncDerived();
      const still =
        ch.inventory.some((s) => s.uid === selected.uid) ||
        Object.values(ch.equipment || {}).some((s) => s?.uid === selected.uid);
      if (!still) smithSelectedUid = null;
      renderNpcPanel(npc);
      renderInventory(ch);
      renderCharacterPanel(ch);
    };
    forge.appendChild(btn);
  }
  layout.appendChild(forge);
  body.appendChild(layout);
}

function showLobbyView(name) {
  $("#auth-view").hidden = name !== "auth";
  $("#chars-view").hidden = name !== "chars";
  $("#create-view").hidden = name !== "create";
  $("#lobby").dataset.view = name;
}

function show(screen) {
  $("#lobby").classList.toggle("active", screen === "lobby");
  $("#game-screen").classList.toggle("active", screen === "game");
}

const PANEL_MAP = {
  char: "#panel-char",
  inv: "#panel-inv",
  skills: "#panel-skills",
  menu: "#panel-menu",
  map: "#panel-map",
  npc: "#panel-npc",
  quests: "#panel-quests",
  party: "#panel-party",
  tower: "#panel-tower",
  dungeon: "#panel-dungeon",
  trade: "#panel-trade",
};

/** Optional bookUid to highlight / prefer when opening from inventory */
let skillsFocusBookUid = null;

function renderSkillsPanel(ch = game.character) {
  const list = $("#skills-list");
  const title = $("#skills-path-title");
  const booksEl = $("#skills-books");
  if (!list || !ch) return;

  const path = SPECS[ch.classId]?.find((s) => s.id === ch.spec);
  if (!SkillService.hasPath(ch)) {
    title.textContent = "No skill path";
    booksEl.textContent = "";
    list.innerHTML = `<p class="sub">Visit the Skill Master at Lv.${SkillService.unlockLevel} to choose a path. Metin stones drop books to raise your skills.</p>`;
    return;
  }

  title.textContent = `${path?.name || ch.spec} path`;
  const counts = SkillService.countBooks(ch);
  booksEl.textContent = `Books: ${counts.normal} Skill · ${counts.grand} Grand Master`;

  const skills = SkillService.listWithLevels(ch);
  list.innerHTML = "";
  if (!skills.length) {
    list.innerHTML = `<p class="sub">No skills on this path.</p>`;
    return;
  }

  for (const sk of skills) {
    const row = document.createElement("div");
    row.className = "skill-row";
    const maxed = sk.level >= SkillService.maxLevel;
    const needGrand = sk.level >= SkillService.bookSoftCap;
    let bookUid = skillsFocusBookUid;
    if (bookUid) {
      const stack = ch.inventory.find((x) => x.uid === bookUid);
      const def = stack ? ITEM_TEMPLATES[stack.itemId] : null;
      if (!def?.skillBook) bookUid = null;
      else if (needGrand && !def.grandMaster) bookUid = null;
      else if (maxed) bookUid = null;
    }
    if (!bookUid) bookUid = SkillService.findBookFor(ch, sk.id);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-mini";
    if (maxed) {
      btn.textContent = "Max";
      btn.disabled = true;
    } else if (!bookUid) {
      btn.textContent = needGrand ? "Need Grand" : "Need book";
      btn.disabled = true;
    } else {
      btn.textContent = "Read book";
      btn.onclick = () => {
        audio.sfx("ui");
        const err = game.upgradeSkillWithBook(sk.id, bookUid);
        if (err) ui.toast(err);
        else {
          ui.toast(`${sk.name} → M${SkillService.getLevel(game.character, sk.id)}`);
          skillsFocusBookUid = null;
          renderSkillsPanel(game.character);
          ui.renderHotbar(game.local, game.character);
          if (!$("#panel-inv").hidden) renderInventory(game.character);
        }
      };
    }

    const timing = SkillService.timing(sk);
    row.innerHTML = `
      ${skillIconHtml(sk, { cls: "skill-ico skill-ico-lg" })}
      <div class="skill-row-main">
        <span class="skill-row-name">${sk.name}</span>
        <span class="skill-row-rank">Rank M${sk.level}${maxed ? " (max)" : needGrand ? " · grand books" : ""}</span>
        <span class="skill-row-meta">×${sk.mul.toFixed(2)} dmg · ${sk.sp} SP · CD ${sk.cd}s · cast ${timing.cast.toFixed(1)}s</span>
      </div>
    `;
    row.appendChild(btn);
    list.appendChild(row);
  }
}

ui.openSkillsPanel = (bookInfo) => {
  skillsFocusBookUid = bookInfo?.uid || null;
  showPanel("skills");
  if (bookInfo?.grand) ui.toast("Choose a skill to read the Grand Master Book");
  else ui.toast("Choose a skill to read the Skill Book");
};

let _socialInviteKind = null;
let _ctxPlayerId = null;

ui.showPlayerContext = (info) => {
  const el = $("#player-context");
  if (!el || !info) return;
  _ctxPlayerId = info.id;
  $("#player-context-name").textContent = `${info.name || "Player"} · Lv.${info.level || 1}`;
  el.hidden = false;
  const x = Math.min(window.innerWidth - 180, Math.max(8, (info.x || 0) + 12));
  const y = Math.min(window.innerHeight - 160, Math.max(8, (info.y || 0) + 12));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
};
ui.hidePlayerContext = () => {
  const el = $("#player-context");
  if (el) el.hidden = true;
  _ctxPlayerId = null;
};
ui.showSocialInvite = ({ kind, text }) => {
  _socialInviteKind = kind;
  const banner = $("#social-invite-banner");
  if (!banner) return;
  banner.hidden = false;
  $("#social-invite-text").textContent = text || "Request";
};
ui.hideSocialInvite = () => {
  const banner = $("#social-invite-banner");
  if (banner) banner.hidden = true;
  _socialInviteKind = null;
};
ui.showDuelCountdown = (n, fight) => {
  const el = $("#duel-countdown");
  if (!el) return;
  el.hidden = false;
  const num = $("#duel-countdown-num");
  const label = $("#duel-countdown-label");
  if (fight || n <= 0) {
    num.textContent = "FIGHT!";
    label.textContent = "Duel started";
    setTimeout(() => {
      el.hidden = true;
    }, 900);
  } else {
    num.textContent = String(n);
    label.textContent = "Duel starts";
  }
};
ui.hideDuelCountdown = () => {
  const el = $("#duel-countdown");
  if (el) el.hidden = true;
};
/** Clear stuck duel / invite / context overlays (login, leave, alone). */
ui.clearSocialCombat = () => {
  ui.hideSocialInvite();
  ui.hideDuelCountdown();
  ui.hidePlayerContext();
};

function renderTradeSlots(el, items, mine) {
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const inst = items[i];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "trade-slot" + (inst ? "" : " empty");
    if (!inst) {
      cell.disabled = true;
      el.appendChild(cell);
      continue;
    }
    const def = ITEM_TEMPLATES[inst.itemId];
    cell.style.borderColor = def ? RARITY_COLOR[def.rarity] : "";
    cell.innerHTML = def
      ? `${itemIconHtml(def)}<span class="qty">×${inst.qty || 1}</span>`
      : "?";
    cell.title = def ? ItemService.displayName(inst) : inst.itemId;
    if (mine && !TradeService.session?.myLock) {
      cell.onclick = () => {
        game.tradeWithdrawItem(inst.uid);
        renderTradePanel();
        renderInventory(game.character);
      };
    }
    el.appendChild(cell);
  }
}

function renderTradePanel() {
  const s = TradeService.session;
  const panel = $("#panel-trade");
  if (!panel) return;
  if (!s) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("#trade-my-title").textContent = "Your offer";
  $("#trade-their-title").textContent = s.withName || "Their offer";
  renderTradeSlots($("#trade-my-slots"), s.myItems, true);
  renderTradeSlots($("#trade-their-slots"), s.theirItems, false);
  const yangInp = $("#trade-my-yang");
  if (yangInp && document.activeElement !== yangInp) yangInp.value = String(s.myYang || 0);
  $("#trade-their-yang").textContent = String(s.theirYang || 0);
  $("#trade-my-flags").textContent = [
    s.myLock ? "Locked" : "Unlocked",
    s.myConfirm ? "· Confirmed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  $("#trade-their-flags").textContent = [
    s.theirLock ? "Locked" : "Unlocked",
    s.theirConfirm ? "· Confirmed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lockBtn = $("#btn-trade-lock");
  if (lockBtn) lockBtn.textContent = s.myLock ? "Unlock" : "Lock";
  const confBtn = $("#btn-trade-confirm");
  if (confBtn) {
    confBtn.disabled = !(s.myLock && s.theirLock) || s.myConfirm;
    confBtn.textContent = s.myConfirm ? "Waiting…" : "Confirm";
  }
}

function closeAllPanels() {
  Object.values(PANEL_MAP).forEach((sel) => {
    const node = $(sel);
    if (node) node.hidden = true;
  });
}

/** Always open a panel (closes others first). */
function showPanel(name) {
  const el = $(PANEL_MAP[name]);
  if (!el) return;
  closeAllPanels();
  el.hidden = false;
  if (name === "char") renderCharacterPanel(game.character);
  if (name === "inv") renderInventory(game.character);
  if (name === "skills") renderSkillsPanel(game.character);
  if (name === "quests") {
    // Q / menu log shows all quests
    questPanelGiver = null;
    renderQuests(game.character, null);
  }
  if (name === "party") renderPartyPanel();
  if (name === "tower") renderTowerPanel();
  if (name === "dungeon") renderDungeonPanel();
  if (name === "trade") renderTradePanel();
  if (name === "map") drawWorldMap(MapService.currentId || "overworld");
}

function togglePanel(name) {
  const el = $(PANEL_MAP[name]);
  if (!el) return;
  if (!el.hidden) {
    el.hidden = true;
    return;
  }
  showPanel(name);
}

async function leaveWorld({ logout = false } = {}) {
  try {
    await ui.requestSave(false);
  } catch {
    /* still leave */
  }
  game.stop();
  await net.leave();
  closeAllPanels();
  show("lobby");
  if (logout) {
    await AuthService.signOut();
    sessionUser = null;
    userId = null;
    showLobbyView("auth");
    ui.toast("Logged out");
  } else {
    showLobbyView(userId ? "chars" : "auth");
    if (userId) refreshCharList();
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
    if (party) {
      const names = party.members.map((m) => m.name || "Player").join(", ");
      info.textContent = PartyService.isLeader(game.local?.id)
        ? `Party enter pulls everyone: ${names}`
        : `In party — wait for leader to Enter with party (${party.members.length})`;
    } else {
      info.textContent = "Solo run — or form a party (P), then Enter with party";
    }
  }
  const partyBtn = $("#btn-dt-party");
  if (partyBtn) {
    const ok = !!party && PartyService.isLeader(game.local?.id) && party.members.length >= 1;
    partyBtn.disabled = !ok;
    partyBtn.textContent =
      party && party.members.length > 1
        ? `Enter with party (${party.members.length})`
        : "Enter with party";
  }
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
        ? "Crucible cleared! Forge at the Infernal Smith (3 uses), then exit to Shinsoo."
        : "Floor cleared — use the blue portal (E) or Next floor."
      : run.floor >= 7
        ? "Shatter all 6 Tower Metins with your party."
        : "Defeat all demons on this floor.";
  }
  if (next) {
    next.textContent = run.floor >= 7 && run.cleared ? "Exit to Shinsoo" : "Next floor";
    next.disabled = !run.cleared;
  }
  syncDungeonHudButtons(run);
}

function syncDungeonHudButtons(run) {
  const next = $("#btn-dt-hud-next");
  if (!next || !run) return;
  next.textContent = run.floor >= 7 && run.cleared ? "Exit city" : "Next floor";
  next.disabled = !run.cleared;
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
  $("#dungeon-hud-hint").textContent = run.cleared
    ? run.floor >= 7
      ? "Forge (E) then exit portal → Shinsoo"
      : "Walk onto the blue portal"
    : run.floor >= 7
      ? "Destroy 6 Tower Metins"
      : "Slay all demons";
  syncDungeonHudButtons(run);
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
  });
  classRow.appendChild(btn);
});

$("#gender-row").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-gender]");
  if (!btn) return;
  selectedGender = btn.dataset.gender;
  $("#gender-row").querySelectorAll(".opt-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
});

$("#inp-name").value = `Hero${Math.floor(Math.random() * 90 + 10)}`;
$("#config-hint").textContent = configHint();

const net = new WorldNet();
// Kenney Nature Kit (CC0) — trees / tents / rocks for field maps
await Promise.all([NatureKit.preload(), AssetKit.preload()]).catch((err) =>
  console.warn("[assets]", err)
);
const game = new Game($("#c"), ui, net);

function drawMapRing(ctx, toX, toY, minR, maxR, color, { fill = true, dash = null } = {}) {
  const cx = toX(0);
  const cy = toY(0);
  const scale = toX(1) - toX(0);
  const r0 = Math.max(0, minR) * scale;
  const r1 = Math.max(r0 + 1, maxR * scale);
  ctx.save();
  if (dash) ctx.setLineDash(dash);
  if (fill) {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
    ctx.fillStyle = color;
    ctx.fill("evenodd");
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.strokeStyle = color.replace(/[\d.]+\)$/, "0.95)").replace(/^rgba/, "rgba");
  if (!color.startsWith("rgba")) ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (r0 > 2) {
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorldMap(viewId = _mapViewId) {
  const canvas = $("#world-map-canvas");
  if (!canvas) return;
  _mapViewId = viewId || MapService.currentId || "overworld";
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const pad = 20;
  const mid = _mapViewId;
  const half = mid === "orc_valley" ? 80 : mid === "demon_tower" ? 18 : MAP_HALF;
  const size = half * 2;
  const toX = (x) => pad + ((x + half) / size) * (w - pad * 2);
  const toY = (z) => pad + ((z + half) / size) * (h - pad * 2);

  // Ground
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (mid === "valley") {
    g.addColorStop(0, "#5a4830");
    g.addColorStop(1, "#3a2a18");
  } else if (mid === "orc_valley") {
    g.addColorStop(0, "#2a3a28");
    g.addColorStop(1, "#1a2418");
  } else {
    g.addColorStop(0, "#3a5a32");
    g.addColorStop(1, "#243820");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  // Metin possible spawn (mid→edge wilderness)
  const metRing = metinSpawnRing(mid);
  if (metRing) {
    drawMapRing(ctx, toX, toY, metRing.minR, metRing.maxR, "rgba(196, 60, 46, 0.14)", { dash: [4, 3] });
  }

  // Miniboss / elite areas
  for (const area of MINIBOSS_AREAS) {
    if (area.mapId !== mid) continue;
    if (area.point) {
      const r = (area.r || 12) * ((toX(1) - toX(0)));
      ctx.beginPath();
      ctx.arc(toX(area.x), toY(area.z), r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 90, 58, 0.18)";
      ctx.fill();
      ctx.strokeStyle = area.color || "#ff5a3a";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = area.color || "#ff5a3a";
      ctx.beginPath();
      ctx.moveTo(toX(area.x), toY(area.z) - 7);
      ctx.lineTo(toX(area.x) + 6, toY(area.z) + 5);
      ctx.lineTo(toX(area.x) - 6, toY(area.z) + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffe9a8";
      ctx.font = "bold 10px Cinzel, serif";
      ctx.textAlign = "center";
      ctx.fillText(area.name, toX(area.x), toY(area.z) - 12);
    } else {
      const ring = zoneRing(mid, area.zone);
      if (!ring) continue;
      const col = area.color || "#ff5a3a";
      drawMapRing(ctx, toX, toY, ring.minR, ring.maxR, hexToRgba(col, 0.12), { dash: [6, 4] });
      // Label on ring
      const midR = (ring.minR + ring.maxR) / 2;
      ctx.fillStyle = col;
      ctx.font = "bold 10px Cinzel, serif";
      ctx.textAlign = "center";
      ctx.fillText(area.name, toX(midR * 0.7), toY(-midR * 0.7));
    }
  }

  // Beaten roads
  ctx.strokeStyle = "rgba(180, 150, 90, 0.75)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  for (const r of fieldRoads(mid)) {
    ctx.beginPath();
    ctx.moveTo(toX(r.x0), toY(r.z0));
    ctx.lineTo(toX(r.x1), toY(r.z1));
    ctx.stroke();
  }

  // City ring
  if (mid === "overworld" || mid === "valley") {
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), (CITY_RADIUS / size) * (w - pad * 2), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200, 170, 90, 0.35)";
    ctx.fill();
    ctx.strokeStyle = "#e8d48b";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffe9a8";
    ctx.font = "bold 12px Cinzel, serif";
    ctx.textAlign = "center";
    ctx.fillText(mid === "valley" ? "Seungryong" : "Shinsoo", toX(0), toY(0) - 6);
  }

  // Tent camps
  for (const c of campsOnMap(mid)) {
    ctx.fillStyle = "#c45a2a";
    ctx.beginPath();
    ctx.arc(toX(c.x), toY(c.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (mid === "overworld") {
    ctx.fillStyle = "#8b1e1e";
    ctx.beginPath();
    ctx.moveTo(toX(TOWER_CORNER.x), toY(TOWER_CORNER.z) - 7);
    ctx.lineTo(toX(TOWER_CORNER.x) + 6, toY(TOWER_CORNER.z) + 5);
    ctx.lineTo(toX(TOWER_CORNER.x) - 6, toY(TOWER_CORNER.z) + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffb0a0";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Demon Tower", toX(TOWER_CORNER.x), toY(TOWER_CORNER.z) + 16);
  }

  // Active quest hunt zones (+ biologist)
  const ch = game.character;
  const active = ch ? QuestService.activeList(ch) : [];
  const questLines = [];
  let labelN = 0;
  for (const aq of active) {
    const full = QUESTS.find((q) => q.id === aq.id) || aq;
    const hunt = questHuntFor(full);
    if (!hunt) continue;
    const onThis =
      hunt.allField || hunt.mapId === mid || (hunt.mapId == null && ["overworld", "valley", "orc_valley"].includes(mid));
    const isBio = (aq.giver || full.giver) === "biologist";
    const color = isBio ? "#7dff9a" : hunt.color || "#4db0ff";
    const ring = zoneRing(hunt.mapId || mid, hunt.zone || "mid");
    if (onThis && ring && (hunt.mapId === mid || hunt.allField)) {
      drawMapRing(ctx, toX, toY, ring.minR, ring.maxR, hexToRgba(color, 0.2), { dash: isBio ? [2, 2] : [5, 3] });
      const midR = (ring.minR + ring.maxR) / 2;
      const ang = (labelN * 0.9) % (Math.PI * 2);
      labelN++;
      const lx = Math.cos(ang) * midR;
      const lz = Math.sin(ang) * midR;
      ctx.fillStyle = color;
      ctx.font = "bold 10px Cinzel, serif";
      ctx.textAlign = "center";
      const tag = isBio ? "Bio" : "Quest";
      ctx.fillText(`${tag}: ${hunt.label}`, toX(lx), toY(lz));
    }
    const mapName =
      hunt.mapId === "valley" ? "Seungryong" : hunt.mapId === "orc_valley" ? "Orc Isles" : hunt.allField ? "any field" : "Shinsoo";
    const done = aq.state === "completed" ? " — turn in!" : ` ${aq.progress}/${aq.count}`;
    questLines.push(
      `<span style="color:${isBio ? "#7dff9a" : "#4db0ff"}">${isBio ? "Biologist" : "Elder"}:</span> ${aq.name} · ${hunt.label} (${mapName})${done}`
    );
  }

  // Quest NPCs on this map
  for (const npc of npcsOnMap(mid)) {
    if (npc.role !== "quest" && npc.role !== "biologist") continue;
    const bio = npc.role === "biologist";
    ctx.fillStyle = bio ? "#7dff9a" : "#4db0ff";
    ctx.strokeStyle = "#1a1408";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(npc.x), toY(npc.z), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Pulse if ready to turn in
    const ready = active.some(
      (a) => a.state === "completed" && (a.giver || "") === (bio ? "biologist" : "quest_elder")
    );
    if (ready) {
      ctx.strokeStyle = bio ? "#7dff9a" : "#4db0ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(npc.x), toY(npc.z), 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffe9a8";
    ctx.font = "bold 10px Cinzel, serif";
    ctx.textAlign = "center";
    ctx.fillText(bio ? "Biologist" : "Elder", toX(npc.x), toY(npc.z) - 11);
  }

  // Live metins / minibosses on this map
  if (game.metins) {
    for (const [, m] of game.metins) {
      if ((m.mapId || "overworld") !== mid) continue;
      ctx.fillStyle = "#c43c2e";
      ctx.beginPath();
      ctx.arc(toX(m.x), toY(m.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffe0a0";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  if (game.mobs) {
    for (const [, m] of game.mobs) {
      if ((m.mapId || "overworld") !== mid) continue;
      if (!m.boss && m.templateId !== "rogue_chief" && m.templateId !== "orc_chief" && m.templateId !== "elite_ork") continue;
      ctx.fillStyle = "#ff5a3a";
      ctx.fillRect(toX(m.x) - 4, toY(m.z) - 4, 8, 8);
    }
  }

  // Portals
  const portalDots =
    mid === "overworld"
      ? [{ x: EDGE_PORTAL, z: 0, label: "E" }]
      : mid === "valley"
        ? [
            { x: -EDGE_PORTAL, z: 0, label: "W" },
            { x: EDGE_PORTAL, z: 0, label: "E" },
          ]
        : mid === "orc_valley"
          ? [{ x: -68.5, z: 0, label: "W" }]
          : [];
  for (const p of portalDots) {
    ctx.fillStyle = "#6ec8ff";
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.z), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.label, toX(p.x), toY(p.z) + 3);
  }

  // You are here
  if (game.local && MapService.currentId === mid) {
    const px = toX(game.local.x);
    const pz = toY(game.local.z);
    ctx.fillStyle = "#ffe14a";
    ctx.strokeStyle = "#1a1408";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, pz - 9);
    ctx.lineTo(px + 7, pz + 6);
    ctx.lineTo(px - 7, pz + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe9a8";
    ctx.font = "bold 11px Cinzel, serif";
    ctx.textAlign = "center";
    ctx.fillText("You", px, pz - 12);
  } else if (MapService.currentId !== mid) {
    ctx.fillStyle = "rgba(255,233,168,0.7)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("(not on this map)", w / 2, h - 12);
  }

  const qList = $("#map-quest-list");
  if (qList) {
    qList.innerHTML = questLines.length
      ? questLines.join("<br>")
      : `<span style="color:#a09070">No active quests — talk to the Elder or Biologist.</span>`;
  }
  document.querySelectorAll(".map-tab").forEach((b) => {
    b.classList.toggle("selected", b.getAttribute("data-map-view") === mid);
  });
}

function hexToRgba(hex, a = 0.2) {
  const h = String(hex || "#ffffff").replace("#", "");
  if (h.length < 6) return `rgba(255,255,255,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

document.getElementById("map-tabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-map-view]");
  if (!btn) return;
  audio.sfx("ui");
  drawWorldMap(btn.getAttribute("data-map-view"));
});

game.onCharacterChange = (ch) => {
  if (!$("#panel-char").hidden) renderCharacterPanel(ch);
  if (!$("#panel-inv").hidden) renderInventory(ch);
  if (!$("#panel-skills").hidden) renderSkillsPanel(ch);
  if (!$("#panel-quests").hidden) renderQuests(ch, questPanelGiver);
  if (!$("#panel-map")?.hidden) drawWorldMap(_mapViewId);
  renderQuestTracker(ch);
};

game.onOpenNpc = (npc) => {
  $("#panel-char").hidden = true;
  $("#panel-inv").hidden = true;
  $("#panel-skills").hidden = true;
  $("#panel-quests").hidden = true;
  $("#panel-tower").hidden = true;
  $("#panel-npc").hidden = false;
  $("#panel-npc").classList.toggle("panel-npc-wide", npc.role === "skillmaster");
  renderNpcPanel(npc);
};

game.onOpenTower = () => {
  // Inside the tower: red HUD only (no yellow panel)
  if (DungeonService.isInside()) return;
  ["#panel-char", "#panel-inv", "#panel-quests", "#panel-npc", "#panel-party", "#panel-dungeon"].forEach((s) => {
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

game.onTradeChange = () => {
  renderTradePanel();
  if (TradeService.session) {
    // Keep inventory open so you can click items into the trade
    if ($("#panel-inv").hidden) {
      $("#panel-inv").hidden = false;
      renderInventory(game.character);
    }
  }
};

game.onDuelChange = () => {
  /* countdown HUD is driven by ui.showDuelCountdown */
};

game.onDungeonChange = (run) => {
  updateDungeonHud(run);
  // Never show the yellow dungeon panel — status lives on the red HUD
  $("#panel-dungeon").hidden = true;
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
    if (PANEL_MAP[key]) $(PANEL_MAP[key]).hidden = true;
  });
});

window.addEventListener("keydown", (e) => {
  if (!$("#game-screen").classList.contains("active")) return;
  if (!$("#panel-death").hidden) return;
  const k = e.key.toLowerCase();
  if (k === "c") togglePanel("char");
  if (k === "i") togglePanel("inv");
  if (k === "k") togglePanel("skills");
  if (k === "q") togglePanel("quests");
  if (k === "p") togglePanel("party");
  if (k === "m") togglePanel("map");
  if (k === "escape") {
    e.preventDefault();
    if ($("#quest-letter") && !$("#quest-letter").hidden) {
      continueQuestLetter();
      return;
    }
    // Dismiss overlays first so Esc always recovers a stuck invite / context menu
    const invite = $("#social-invite-banner");
    if (invite && !invite.hidden) {
      if (_socialInviteKind === "duel") game.declineDuel();
      else if (_socialInviteKind === "trade") game.declineTrade();
      else ui.hideSocialInvite();
      return;
    }
    if ($("#player-context") && !$("#player-context").hidden) {
      ui.hidePlayerContext();
      return;
    }
    if (PvPService.duel?.state === "countdown") {
      game.endDuel("Duel cancelled");
      return;
    }
    $("#panel-dungeon").hidden = true;
    togglePanel("menu");
  }
  if (e.key === "Tab") {
    e.preventDefault();
    ui.setScoreboard(true);
  }
});

$("#btn-sys-square")?.addEventListener("click", () => {
  audio.sfx("ui");
  togglePanel("menu");
});

$("#quest-mail-btn")?.addEventListener("click", () => onQuestMailBtnClick());
$("#quest-letter-continue")?.addEventListener("click", (e) => {
  e.stopPropagation();
  continueQuestLetter();
});
document.querySelector(".quest-letter-inner")?.addEventListener("click", (e) => {
  if (e.target?.closest?.("#quest-letter-continue")) return;
  continueQuestLetter();
});

document.querySelectorAll("[data-menu-panel]").forEach((btn) => {
  btn.addEventListener("click", () => {
    audio.sfx("ui");
    const panel = btn.getAttribute("data-menu-panel");
    showPanel(panel);
  });
});

$("#btn-dt-solo")?.addEventListener("click", () => {
  $("#panel-tower").hidden = true;
  game.enterDemonTower({ withParty: false });
});
$("#btn-dt-party")?.addEventListener("click", () => {
  $("#panel-tower").hidden = true;
  game.enterDemonTower({ withParty: true });
});
function onNextFloorClick() {
  game.advanceDemonFloor();
  updateDungeonHud(DungeonService.run);
}
$("#btn-dt-hud-next")?.addEventListener("click", onNextFloorClick);
function onExitTowerClick() {
  game.exitDemonTower();
  updateDungeonHud(null);
}
$("#btn-dt-hud-exit")?.addEventListener("click", onExitTowerClick);
$("#btn-party-accept")?.addEventListener("click", () => {
  game.acceptPartyInvite();
  renderPartyPanel();
});
$("#btn-party-decline")?.addEventListener("click", () => {
  game.declinePartyInvite();
  renderPartyPanel();
});

$("#btn-ctx-challenge")?.addEventListener("click", () => {
  if (_ctxPlayerId) game.challengePlayer(_ctxPlayerId);
  ui.hidePlayerContext();
});
$("#btn-ctx-trade")?.addEventListener("click", () => {
  if (_ctxPlayerId) game.inviteTrade(_ctxPlayerId);
  ui.hidePlayerContext();
});
$("#btn-ctx-party")?.addEventListener("click", () => {
  if (_ctxPlayerId) game.inviteToParty(_ctxPlayerId);
  ui.hidePlayerContext();
});
$("#btn-ctx-close")?.addEventListener("click", () => ui.hidePlayerContext());

$("#btn-social-accept")?.addEventListener("click", () => {
  if (_socialInviteKind === "duel") game.acceptDuel();
  else if (_socialInviteKind === "trade") game.acceptTrade();
  ui.hideSocialInvite();
});
$("#btn-social-decline")?.addEventListener("click", () => {
  if (_socialInviteKind === "duel") game.declineDuel();
  else if (_socialInviteKind === "trade") game.declineTrade();
  ui.hideSocialInvite();
});

$("#btn-trade-lock")?.addEventListener("click", () => {
  game.tradeToggleLock();
  renderTradePanel();
});
$("#btn-trade-confirm")?.addEventListener("click", () => {
  game.tradeConfirm();
  renderTradePanel();
});
$("#btn-trade-cancel")?.addEventListener("click", () => {
  game.tradeCancel();
  renderTradePanel();
  renderInventory(game.character);
});
$("#trade-my-yang")?.addEventListener("change", (e) => {
  game.tradeSetYang(e.target.value);
  renderTradePanel();
});
document.querySelector('[data-close="trade"]')?.addEventListener("click", () => {
  if (TradeService.session) game.tradeCancel();
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
      const pathLabel = SPECS[ch.classId]?.find((s) => s.id === ch.spec)?.name || "No path";
      card.innerHTML = `<div><b>${ch.name}</b><small>Lv.${ch.level} ${CLASSES[ch.classId]?.name || ""} · ${pathLabel}</small></div>`;
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
  questPanelGiver = null;
  renderQuestTracker(character);
  ui.resetQuestMail(character);
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
    const nameErr = CharacterService.validateName(name);
    if (nameErr) throw new Error(nameErr);
    if (!userId) throw new Error("Not signed in");
    const ch = await CharacterService.create(userId, {
      name,
      classId: selectedClass,
      spec: "none",
      gender: selectedGender,
      kingdom: selectedKingdom,
      deletePin: "0000",
    });
    await enterWorld(ch);
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message || String(e);
  }
});

$("#btn-chars")?.addEventListener("click", async () => {
  audio.sfx("ui");
  await leaveWorld({ logout: false });
});

$("#btn-logout-game")?.addEventListener("click", async () => {
  audio.sfx("ui");
  await leaveWorld({ logout: true });
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
