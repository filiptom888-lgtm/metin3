/** Skill HUD icons — Metin2-framed Game-Icons (CC BY 3.0). */

export function skillIconSlug(skillOrName) {
  const name = typeof skillOrName === "string" ? skillOrName : skillOrName?.name || "";
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function skillIconUrl(skillOrName) {
  const slug = skillIconSlug(skillOrName);
  if (!slug) return null;
  return `/icons/skills/${slug}.svg`;
}

/**
 * HTML for hotbar / skills panel icons.
 * Prefers framed SVG; falls back to tinted initial letter.
 */
export function skillIconHtml(skill, { cls = "sk-ico skill-ico" } = {}) {
  const name = skill?.name || "Skill";
  const url = skillIconUrl(skill);
  const color = skill?.color || "#c9a227";
  const letter = name.charAt(0).toUpperCase();
  if (url) {
    return `<img class="${cls}" src="${url}" alt="${name}" draggable="false" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.hidden=false)" /><span class="${cls} skill-ico-fallback" style="color:${color}" hidden>${letter}</span>`;
  }
  return `<span class="${cls} skill-ico-fallback" style="color:${color}">${letter}</span>`;
}
