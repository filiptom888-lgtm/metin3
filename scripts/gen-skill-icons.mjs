/**
 * Download free Game-Icons.net SVGs (CC BY 3.0) and wrap them in Metin3 gold-rim frames.
 * Credit: Lorc / Delapouite / Skoll et al. — https://game-icons.net
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons", "skills");

/** slug → { author, icon, tint } */
const SKILL_ICONS = {
  three_way: { author: "lorc", icon: "crossed-swords", tint: "#e8d48b" },
  sword_spin: { author: "lorc", icon: "vortex", tint: "#c43c2e" },
  berserk: { author: "lorc", icon: "fire-axe", tint: "#ff6a3a" },
  charge: { author: "lorc", icon: "sprint", tint: "#e8d48b" },
  spirit_strike: { author: "lorc", icon: "glowing-hands", tint: "#a8d4ff" },
  bash: { author: "lorc", icon: "hammer-drop", tint: "#c9a227" },
  strong_body: { author: "lorc", icon: "muscle-up", tint: "#d4b44a" },
  stomp: { author: "lorc", icon: "boot-prints", tint: "#a89060" },
  ambush: { author: "lorc", icon: "cloak-dagger", tint: "#7a9a6a" },
  fast_attack: { author: "lorc", icon: "quick-slash", tint: "#c8e080" },
  rolling_dagger: { author: "lorc", icon: "plain-dagger", tint: "#9ab06a" },
  smoke_bomb: { author: "lorc", icon: "explosion-rays", tint: "#8a8a9a" },
  poison_arrow: { author: "lorc", icon: "poison-gas", tint: "#6ad46a" },
  fire_arrow: { author: "lorc", icon: "flaming-arrow", tint: "#ff7a3a" },
  arrow_shower: { author: "lorc", icon: "arrow-flights", tint: "#c9a227" },
  repetitive_shot: { author: "lorc", icon: "target-arrows", tint: "#e8d48b" },
  finger_strike: { author: "lorc", icon: "pointy-sword", tint: "#c9a227" },
  enchanted_blade: { author: "lorc", icon: "magic-swirl", tint: "#a8d4ff" },
  fear: { author: "lorc", icon: "screaming", tint: "#b06ad4" },
  dragon_swirl: { author: "lorc", icon: "dragon-spiral", tint: "#e85a3a" },
  dark_strike: { author: "lorc", icon: "death-zone", tint: "#6a4a8a" },
  flame_strike: { author: "lorc", icon: "fire-ray", tint: "#ff6a3a" },
  curse: { author: "lorc", icon: "cursed-star", tint: "#9a6ad4" },
  life_drain: { author: "lorc", icon: "heart-bottle", tint: "#c43c2e" },
  flying_talisman: { author: "lorc", icon: "scroll-unfurled", tint: "#e8d48b" },
  dragons_roar: { author: "lorc", icon: "dragon-head", tint: "#e85a3a" },
  blessing: { author: "lorc", icon: "angel-outfit", tint: "#ffe28a" },
  lightning_throw: { author: "lorc", icon: "lightning-storm", tint: "#7dff9a" },
  cure: { author: "sbed", icon: "health-increase", tint: "#7dff9a" },
  lightning_claw: { author: "lorc", icon: "claw-slashes", tint: "#6ec8ff" },
  summon_lightning: { author: "lorc", icon: "thunder-struck", tint: "#6ec8ff" },
  swiftness: { author: "lorc", icon: "wingfoot", tint: "#7dff9a" },
};

function wrapFrame(innerPathD, tint, uid) {
  // Extract all path elements from source and recolor
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="bg_${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2218"/>
      <stop offset="100%" stop-color="#12100c"/>
    </linearGradient>
    <linearGradient id="rim_${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0e0a0"/>
      <stop offset="45%" stop-color="#c9a227"/>
      <stop offset="100%" stop-color="#6a5010"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="4" fill="url(#bg_${uid})" stroke="url(#rim_${uid})" stroke-width="3"/>
  <rect x="6" y="6" width="52" height="52" rx="2" fill="none" stroke="#5a4820" stroke-width="1" opacity="0.7"/>
  <g transform="translate(10,10) scale(0.0859)" opacity="0.95">
${innerPathD}
  </g>
</svg>
`;
}

function extractPaths(svgText, tint) {
  // Prefer filled glyph paths; skip solid black background square if present
  const paths = [...svgText.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*\/?>/g)].map((m) => m[1]);
  const glyphs = paths.filter((d) => !/^M0 0h512v512H0z$/i.test(d.replace(/\s+/g, " ").trim()));
  const use = glyphs.length ? glyphs : paths;
  return use.map((d) => `    <path fill="${tint}" d="${d}"/>`).join("\n");
}

async function fetchIcon(author, icon) {
  const url = `https://game-icons.net/icons/ffffff/transparent/1x1/${author}/${icon}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

fs.mkdirSync(outDir, { recursive: true });

const failed = [];
for (const [slug, meta] of Object.entries(SKILL_ICONS)) {
  try {
    const svg = await fetchIcon(meta.author, meta.icon);
    const paths = extractPaths(svg, meta.tint);
    const out = wrapFrame(paths, meta.tint, slug);
    fs.writeFileSync(path.join(outDir, `${slug}.svg`), out);
    console.log("ok", slug, "←", meta.author + "/" + meta.icon);
  } catch (err) {
    failed.push({ slug, meta, err: String(err.message || err) });
    console.warn("FAIL", slug, err.message || err);
  }
}

if (failed.length) {
  console.log("\nFailed:", failed.length);
  // Fallbacks for common missing names
  const FALLBACKS = {
    boot_kick: ["lorc", "boot-prints"],
    target_arrows: ["lorc", "target-arrows"],
    health_increase: ["lorc", "heart-plus"],
    cloak_dagger: ["lorc", "hood"],
    screaming: ["lorc", "screaming"],
    dragon_spiral: ["lorc", "wyvern"],
    death_zone: ["lorc", "death-juice"],
    cursed_star: ["lorc", "pentacle"],
    heart_bottle: ["lorc", "hearts"],
    scroll_unfurled: ["lorc", "scroll-unfurled"],
    dragon_head: ["lorc", "dragon-head"],
    sparkling_sunrise: ["lorc", "sun"],
    lightning_storm: ["lorc", "lightning-storm"],
    thunder_struck: ["lorc", "power-lightning"],
    wingfoot: ["lorc", "wingfoot"],
    enrage: ["lorc", "enrage"],
    muscle_up: ["lorc", "muscle-up"],
    glowing_hands: ["lorc", "glowing-hands"],
    hammer_drop: ["lorc", "hammer-drop"],
    sprint: ["lorc", "sprint"],
    vortex: ["lorc", "vortex"],
    quick_slash: ["lorc", "quick-slash"],
    plain_dagger: ["lorc", "plain-dagger"],
    smoke_bomb: ["lorc", "smoke-bomb"],
    poison_gas: ["lorc", "poison-gas"],
    flaming_arrow: ["lorc", "flaming-arrow"],
    arrow_flights: ["lorc", "arrow-flights"],
    pointy_sword: ["lorc", "pointy-sword"],
    magic_axe: ["lorc", "magic-axe"],
    fire_ray: ["lorc", "fire-ray"],
    claw: ["lorc", "claw"],
  };
  for (const f of failed) {
    const key = f.meta.icon.replace(/-/g, "_");
    const alts = [
      [f.meta.author, f.meta.icon],
      ...(FALLBACKS[key] ? [FALLBACKS[key]] : []),
      ["lorc", "broadsword"],
      ["delapouite", "skills"],
    ];
    let done = false;
    for (const [author, icon] of alts) {
      try {
        const svg = await fetchIcon(author, icon);
        const paths = extractPaths(svg, f.meta.tint);
        fs.writeFileSync(path.join(outDir, `${f.slug}.svg`), wrapFrame(paths, f.meta.tint, f.slug));
        console.log("retry ok", f.slug, "←", author + "/" + icon);
        done = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!done) console.error("gave up", f.slug);
  }
}

console.log("done →", outDir);
