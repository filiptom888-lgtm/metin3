import fs from "fs";

const fixes = {
  berserk: ["lorc", "fire-axe", "#ff6a3a"],
  smoke_bomb: ["lorc", "explosion-rays", "#8a8a9a"],
  enchanted_blade: ["lorc", "magic-swirl", "#a8d4ff"],
  blessing: ["lorc", "angel-outfit", "#ffe28a"],
  lightning_claw: ["lorc", "claw-slashes", "#6ec8ff"],
};

function wrap(paths, uid) {
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
${paths}
  </g>
</svg>
`;
}

for (const [slug, [author, icon, tint]] of Object.entries(fixes)) {
  const url = `https://game-icons.net/icons/ffffff/transparent/1x1/${author}/${icon}.svg`;
  const svg = await (await fetch(url)).text();
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*\/?>/g)]
    .map((m) => m[1])
    .filter((d) => !/^M0 0h512v512H0z$/i.test(d.replace(/\s+/g, " ").trim()))
    .map((d) => `    <path fill="${tint}" d="${d}"/>`)
    .join("\n");
  fs.writeFileSync(`public/icons/skills/${slug}.svg`, wrap(paths, slug));
  console.log("fixed", slug, "←", `${author}/${icon}`);
}
