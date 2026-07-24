/** Basic skill bars per class (spec-flavored) */
export const SKILLS = {
  warrior: [
    { name: "Slash", sp: 12, cd: 2.2, type: "cone", mul: 1.7, spec: null },
    { name: "Whirl", sp: 22, cd: 6, type: "aoe", mul: 1.5, spec: "body" },
    { name: "Roar", sp: 18, cd: 8, type: "buff", mul: 1, spec: "mental" },
    { name: "Charge", sp: 16, cd: 5, type: "dash", mul: 1.25, spec: null },
  ],
  ninja: [
    { name: "Fan", sp: 10, cd: 1.8, type: "cone", mul: 1.6, spec: "blade" },
    { name: "Dart", sp: 14, cd: 3.5, type: "bolt", mul: 1.6, spec: "archery" },
    { name: "Smoke", sp: 20, cd: 9, type: "stealth", mul: 1, spec: null },
    { name: "Ambush", sp: 24, cd: 7, type: "burst", mul: 2.3, spec: "blade" },
  ],
  sura: [
    { name: "Curse", sp: 14, cd: 3, type: "dot", mul: 1.35, spec: "blackmagic" },
    { name: "Drain", sp: 16, cd: 5, type: "drain", mul: 1.35, spec: "blackmagic" },
    { name: "Flame", sp: 22, cd: 6.5, type: "aoe", mul: 1.55, spec: null },
    { name: "Enchant", sp: 18, cd: 10, type: "buff", mul: 1, spec: "weaponry" },
  ],
  shaman: [
    { name: "Bolt", sp: 12, cd: 2, type: "bolt", mul: 1.7, isMagic: true, spec: "dragon" },
    { name: "Heal", sp: 20, cd: 7, type: "heal", mul: 1, spec: "healing" },
    { name: "Storm", sp: 28, cd: 8, type: "aoe", mul: 1.6, isMagic: true, spec: "dragon" },
    { name: "Bless", sp: 16, cd: 9, type: "buff", mul: 1, spec: "healing" },
  ],
};
