/**
 * Build Metin-style item icons from game-icons (CC BY 3.0) SVGs.
 * Wraps each glyph in a gold-framed dark plate for inventory slots.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "tmp-assets");
const outDir = path.join(root, "public", "icons", "items");
const uiDir = path.join(root, "public", "ui");

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(uiDir, { recursive: true });

/** itemId → source svg basename (without .svg) */
const MAP = {
  rusty_sword: "broadsword",
  iron_blade: "crossed-swords",
  tiger_fang: "fire-axe",
  dragon_edge: "winged-sword",
  spirit_staff: "wizard-staff",
  shadow_daggers: "plain-dagger",
  longbow: "high-shot",
  steel_blade: "broadsword",
  moon_blade: "bowie-knife",

  cloth_vest: "armor-vest",
  leather_armor: "breastplate",
  plate_mail: "breastplate",
  mystic_robe: "armor-vest",
  scale_armor: "breastplate",

  leather_cap: "helmet-head-shot",
  iron_helm: "visored-helm",
  war_crown: "crowned-skull",
  spirit_hood: "helmet-head-shot",

  cloth_boots: "boots",
  hunter_boots: "metal-boot",
  wind_greaves: "wingfoot",

  wood_shield: "checked-shield",
  iron_shield: "checked-shield",

  copper_bracelet: "fire-ring",
  jade_bracelet: "emerald",
  bone_necklace: "gem-necklace",
  soul_amulet: "crystal-ball",
  copper_earring: "earrings",
  gold_earring: "earrings",
  silver_ring: "diamond-ring",

  red_potion: "heart-bottle",
  blue_potion: "standing-potion",
  orange_potion: "round-bottom-flask",
  green_potion: "poison-bottle",
  upgrade_ore: "stone-pile",
  yang_pouch: "coins",
  treasure_box: "locked-chest",
  magic_scroll: "magic-swirl",
  lightning_charm: "lightning-helix",
  fairy_dust: "fairy-wand",
  wolf_pelt: "swap-bag",
  orc_tooth: "crowned-skull",
  meat: "meat",
  crystal_shard: "crystal-growth",
};

function extractInner(svg) {
  // Strip outer <svg>...</svg>, keep paths
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  let inner = m ? m[1] : svg;
  // Remove xml comments
  inner = inner.replace(/<!--[\s\S]*?-->/g, "");
  // Force fill currentColor-ish by setting fill on paths if black
  inner = inner.replace(/\sfill="[^"]*"/gi, ' fill="#e8d48b"');
  inner = inner.replace(/<path(?![^>]*fill=)/gi, '<path fill="#e8d48b"');
  return inner.trim();
}

function plate(inner, accent = "#c9a227") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2218"/>
      <stop offset="100%" stop-color="#12100c"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0e0a0"/>
      <stop offset="45%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="#6a5010"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="4" fill="url(#bg)" stroke="url(#rim)" stroke-width="3"/>
  <rect x="6" y="6" width="52" height="52" rx="2" fill="none" stroke="#5a4820" stroke-width="1" opacity="0.7"/>
  <g transform="translate(10,10) scale(0.0859)" opacity="0.95">
    ${inner}
  </g>
</svg>
`;
}

let built = 0;
for (const [itemId, srcName] of Object.entries(MAP)) {
  const srcPath = path.join(srcDir, `${srcName}.svg`);
  if (!fs.existsSync(srcPath)) {
    console.warn("missing source", srcName, "for", itemId);
    continue;
  }
  const raw = fs.readFileSync(srcPath, "utf8");
  const inner = extractInner(raw);
  const rarityAccent =
    itemId.includes("dragon") || itemId.includes("soul")
      ? "#c45cff"
      : itemId.includes("tiger") || itemId.includes("war_") || itemId.includes("jade")
        ? "#4aa3ff"
        : itemId.includes("iron") || itemId.includes("orange") || itemId.includes("leather")
          ? "#4ecf8a"
          : "#c9a227";
  fs.writeFileSync(path.join(outDir, `${itemId}.svg`), plate(inner, rarityAccent));
  built++;
}

// UI chrome
fs.writeFileSync(
  path.join(uiDir, "panel-bg.svg"),
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2c2418"/>
      <stop offset="100%" stop-color="#100e0a"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="url(#p)"/>
  <rect x="0" y="0" width="64" height="2" fill="#c9a227" opacity="0.55"/>
</svg>
`
);

fs.writeFileSync(
  path.join(uiDir, "slot.svg"),
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1610"/>
      <stop offset="100%" stop-color="#0a0908"/>
    </linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8d48b"/>
      <stop offset="100%" stop-color="#8a7020"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="62" height="62" rx="3" fill="url(#s)" stroke="url(#b)" stroke-width="2"/>
  <rect x="5" y="5" width="54" height="54" rx="2" fill="none" stroke="#3a3020" stroke-width="1"/>
</svg>
`
);

fs.writeFileSync(
  path.join(uiDir, "header-bar.svg"),
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="32" viewBox="0 0 256 32">
  <defs>
    <linearGradient id="h" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a3a18"/>
      <stop offset="100%" stop-color="#1a1408"/>
    </linearGradient>
  </defs>
  <rect width="256" height="32" fill="url(#h)"/>
  <rect y="30" width="256" height="2" fill="#c9a227" opacity="0.7"/>
</svg>
`
);

// CREDITS
fs.writeFileSync(
  path.join(root, "public", "icons", "CREDITS.txt"),
  `Item glyph art derived from Game-icons.net (CC BY 3.0)
https://game-icons.net/
Authors: Lorc, Delapouite, and contributors
https://creativecommons.org/licenses/by/3.0/

Icons are recolored and framed for METIN3.
UI chrome (panel frames / slots) is original METIN3 art.
`
);

console.log(`Built ${built} item icons → public/icons/items/`);
console.log(`UI chrome → public/ui/`);
