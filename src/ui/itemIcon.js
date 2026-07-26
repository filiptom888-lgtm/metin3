import { ITEM_TEMPLATES, RARITY_COLOR } from "../data/items.js";

/** Sprite path for an item template / id */
export function itemIconUrl(itemOrId) {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId?.id || itemOrId?.itemId;
  if (!id) return null;
  const def = typeof itemOrId === "object" && itemOrId.sprite ? itemOrId : ITEM_TEMPLATES[id];
  if (def?.sprite) {
    // Cache-bust framed icon SVGs that were replaced
    return def.sprite.includes("?") ? def.sprite : `${def.sprite}?v=3`;
  }
  return `/icons/items/${id}.svg?v=3`;
}

/**
 * HTML for inventory / shop / doll / hotbar icons.
 * Prefers sprite image; falls back to emoji `icon`.
 */
export function itemIconHtml(itemOrId, { cls = "ico", size = null } = {}) {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId?.id || itemOrId?.itemId;
  const def = typeof itemOrId === "object" && itemOrId.name ? itemOrId : ITEM_TEMPLATES[id];
  const url = itemIconUrl(def || id);
  const rarity = def?.rarity || "common";
  const color = RARITY_COLOR[rarity] || "#c8c8c8";
  const style = [
    size ? `width:${size}px;height:${size}px` : "",
    // rarity tint only on fallback emoji — images stay frameless
  ]
    .filter(Boolean)
    .join(";");

  const emoji = def?.icon || "·";
  if (url) {
    return `<img class="${cls} item-ico" src="${url}" alt="${def?.name || id || ""}"${style ? ` style="${style}"` : ""} draggable="false" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.hidden=false)" /><span class="${cls}" style="color:${color}${style ? `;${style}` : ""}" hidden>${emoji}</span>`;
  }
  return `<span class="${cls}" style="${style}">${emoji}</span>`;
}
