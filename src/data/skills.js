/**
 * Metin2-style skill groups.
 * Characters start with no path (spec = "none").
 * At Lv.5 the Skill Master unlocks one of two paths per class.
 *
 * Timing fields (seconds):
 *   cast    — windup before damage/FX release
 *   recover — recovery after release (blocks next AA/skill)
 *   cd      — cooldown from cast start
 */
export const SKILL_UNLOCK_LEVEL = 5;
/** Max rank for a skill (books raise this) */
export const SKILL_MAX_LEVEL = 20;
/** Normal books work up to this; grand books needed above */
export const SKILL_BOOK_SOFT_CAP = 10;

function slugSkill(classId, spec, index, name) {
  const base = String(name || `skill${index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${classId}_${spec}_${index}_${base}`;
}

/** Fallback cast / recover by type when a skill omits them */
export const CAST_DEFAULTS = {
  cone: { cast: 0.55, recover: 0.4 },
  aoe: { cast: 1.05, recover: 0.5 },
  burst: { cast: 0.9, recover: 0.45 },
  bolt: { cast: 0.7, recover: 0.35 },
  heal: { cast: 0.95, recover: 0.4 },
  buff: { cast: 0.8, recover: 0.35 },
  dash: { cast: 0.4, recover: 0.45 },
  stealth: { cast: 0.65, recover: 0.3 },
  drain: { cast: 0.9, recover: 0.45 },
  dot: { cast: 0.85, recover: 0.4 },
};

/** Four active skills per path — keys 1–4 */
export const SKILLS = {
  warrior: {
    body: [
      {
        name: "Three-Way",
        sp: 16,
        cd: 3.2,
        type: "cone",
        mul: 1.85,
        cast: 0.6,
        recover: 0.45,
        reach: 3.6,
        fx: "threeWay",
        color: "#e8d48b",
      },
      {
        name: "Sword Spin",
        sp: 28,
        cd: 8,
        type: "aoe",
        mul: 1.6,
        cast: 1.15,
        recover: 0.55,
        radius: 4.8,
        fx: "swordSpin",
        color: "#c43c2e",
      },
      {
        name: "Berserk",
        sp: 22,
        cd: 14,
        type: "buff",
        mul: 1,
        cast: 0.85,
        recover: 0.35,
        fx: "berserk",
        color: "#ff6a3a",
      },
      {
        name: "Charge",
        sp: 18,
        cd: 6.5,
        type: "dash",
        mul: 1.4,
        cast: 0.38,
        recover: 0.5,
        radius: 2.8,
        fx: "charge",
        color: "#e8d48b",
      },
    ],
    mental: [
      {
        name: "Spirit Strike",
        sp: 18,
        cd: 3.5,
        type: "bolt",
        mul: 1.9,
        cast: 0.75,
        recover: 0.4,
        fx: "spirit",
        color: "#a8d4ff",
      },
      {
        name: "Bash",
        sp: 20,
        cd: 5.5,
        type: "burst",
        mul: 2.2,
        cast: 0.95,
        recover: 0.5,
        radius: 3.6,
        fx: "bash",
        color: "#c9a227",
      },
      {
        name: "Strong Body",
        sp: 20,
        cd: 13,
        type: "buff",
        mul: 1,
        cast: 0.9,
        recover: 0.35,
        fx: "strongBody",
        color: "#e8d48b",
      },
      {
        name: "Stomp",
        sp: 24,
        cd: 8.5,
        type: "aoe",
        mul: 1.5,
        cast: 1.0,
        recover: 0.5,
        radius: 4.2,
        fx: "stomp",
        color: "#8a6a3a",
      },
    ],
  },
  ninja: {
    blade: [
      {
        name: "Ambush",
        sp: 22,
        cd: 7.5,
        type: "burst",
        mul: 2.45,
        cast: 0.85,
        recover: 0.45,
        radius: 3.4,
        fx: "ambush",
        color: "#3a9fd4",
      },
      {
        name: "Fast Attack",
        sp: 12,
        cd: 2.2,
        type: "cone",
        mul: 1.6,
        cast: 0.42,
        recover: 0.3,
        reach: 3.2,
        fx: "fastAttack",
        color: "#6ec8ff",
      },
      {
        name: "Rolling Dagger",
        sp: 24,
        cd: 8.5,
        type: "aoe",
        mul: 1.55,
        cast: 0.95,
        recover: 0.45,
        radius: 4.2,
        fx: "daggers",
        color: "#3a9fd4",
      },
      {
        name: "Smoke Bomb",
        sp: 18,
        cd: 12,
        type: "stealth",
        mul: 1,
        cast: 0.7,
        recover: 0.3,
        fx: "smoke",
        color: "#6a8aa0",
      },
    ],
    archery: [
      {
        name: "Poison Arrow",
        sp: 14,
        cd: 2.8,
        type: "bolt",
        mul: 1.75,
        cast: 0.65,
        recover: 0.35,
        fx: "poisonArrow",
        color: "#4ecf8a",
      },
      {
        name: "Fire Arrow",
        sp: 18,
        cd: 4.8,
        type: "bolt",
        mul: 2.1,
        cast: 0.8,
        recover: 0.4,
        fx: "fireArrow",
        color: "#ff6a3a",
      },
      {
        name: "Arrow Shower",
        sp: 28,
        cd: 10,
        type: "aoe",
        mul: 1.6,
        cast: 1.2,
        recover: 0.5,
        radius: 5.2,
        fx: "arrowShower",
        color: "#3a9fd4",
      },
      {
        name: "Repetitive Shot",
        sp: 18,
        cd: 4.2,
        type: "burst",
        mul: 2.0,
        cast: 0.85,
        recover: 0.4,
        radius: 3.5,
        fx: "multiShot",
        color: "#6ec8ff",
      },
    ],
  },
  sura: {
    weaponry: [
      {
        name: "Finger Strike",
        sp: 16,
        cd: 3.2,
        type: "cone",
        mul: 1.8,
        cast: 0.55,
        recover: 0.4,
        reach: 3.5,
        fx: "finger",
        color: "#c45cff",
      },
      {
        name: "Enchanted Blade",
        sp: 22,
        cd: 13,
        type: "buff",
        mul: 1,
        cast: 0.85,
        recover: 0.35,
        fx: "enchant",
        color: "#e8b84a",
      },
      {
        name: "Fear",
        sp: 20,
        cd: 9.5,
        type: "aoe",
        mul: 1.4,
        cast: 1.0,
        recover: 0.45,
        radius: 4.5,
        fx: "fear",
        color: "#6b1e8b",
      },
      {
        name: "Dragon Swirl",
        sp: 26,
        cd: 8.5,
        type: "aoe",
        mul: 1.7,
        cast: 1.1,
        recover: 0.5,
        radius: 4.8,
        fx: "dragonSwirl",
        color: "#8b3fd4",
      },
    ],
    blackmagic: [
      {
        name: "Dark Strike",
        sp: 16,
        cd: 3.4,
        type: "bolt",
        mul: 1.85,
        cast: 0.75,
        recover: 0.4,
        isMagic: true,
        fx: "darkBolt",
        color: "#8b3fd4",
      },
      {
        name: "Flame Strike",
        sp: 28,
        cd: 8,
        type: "aoe",
        mul: 1.7,
        cast: 1.15,
        recover: 0.55,
        radius: 5.0,
        isMagic: true,
        fx: "flame",
        color: "#ff4a2a",
      },
      {
        name: "Curse",
        sp: 18,
        cd: 6.5,
        type: "dot",
        mul: 1.5,
        cast: 0.9,
        recover: 0.4,
        radius: 4.6,
        isMagic: true,
        fx: "curse",
        color: "#6b1e8b",
      },
      {
        name: "Life Drain",
        sp: 20,
        cd: 7.5,
        type: "drain",
        mul: 1.5,
        cast: 0.95,
        recover: 0.45,
        radius: 4.5,
        isMagic: true,
        fx: "drain",
        color: "#a81828",
      },
    ],
  },
  shaman: {
    dragon: [
      {
        name: "Flying Talisman",
        sp: 14,
        cd: 2.6,
        type: "bolt",
        mul: 1.85,
        cast: 0.7,
        recover: 0.35,
        isMagic: true,
        fx: "talisman",
        color: "#4ecf8a",
      },
      {
        name: "Dragon's Roar",
        sp: 30,
        cd: 9.5,
        type: "aoe",
        mul: 1.75,
        cast: 1.25,
        recover: 0.55,
        radius: 5.4,
        isMagic: true,
        fx: "dragonRoar",
        color: "#1e8b4a",
      },
      {
        name: "Blessing",
        sp: 18,
        cd: 12,
        type: "buff",
        mul: 1,
        cast: 0.9,
        recover: 0.35,
        fx: "bless",
        color: "#e8d48b",
      },
      {
        name: "Lightning Throw",
        sp: 22,
        cd: 5.5,
        type: "bolt",
        mul: 2.15,
        cast: 0.85,
        recover: 0.4,
        isMagic: true,
        fx: "lightning",
        color: "#6ec8ff",
      },
    ],
    healing: [
      {
        name: "Cure",
        sp: 22,
        cd: 7.5,
        type: "heal",
        mul: 1,
        cast: 1.05,
        recover: 0.4,
        fx: "cure",
        color: "#4ecf8a",
      },
      {
        name: "Lightning Claw",
        sp: 16,
        cd: 3.0,
        type: "cone",
        mul: 1.65,
        cast: 0.55,
        recover: 0.4,
        reach: 3.4,
        isMagic: true,
        fx: "claw",
        color: "#6ec8ff",
      },
      {
        name: "Summon Lightning",
        sp: 32,
        cd: 10,
        type: "aoe",
        mul: 1.8,
        cast: 1.2,
        recover: 0.55,
        radius: 5.2,
        isMagic: true,
        fx: "summonLightning",
        color: "#3a9fd4",
      },
      {
        name: "Swiftness",
        sp: 18,
        cd: 13,
        type: "buff",
        mul: 1,
        cast: 0.85,
        recover: 0.35,
        fx: "swift",
        color: "#7dff9a",
      },
    ],
  },
};

export function skillsFor(classId, spec) {
  if (!spec || spec === "none") return [];
  const list = SKILLS[classId]?.[spec] || [];
  return list.map((sk, i) => ({
    ...sk,
    id: sk.id || slugSkill(classId, spec, i, sk.name),
    index: i,
    classId,
    spec,
  }));
}

/** Resolve cast/recover with type defaults */
export function skillTiming(sk) {
  const def = CAST_DEFAULTS[sk?.type] || { cast: 0.6, recover: 0.4 };
  return {
    cast: sk?.cast ?? def.cast,
    recover: sk?.recover ?? def.recover,
  };
}

/**
 * Scale skill by rank (1–20). Rank 1 = base values.
 * Higher rank → more damage, slightly more SP, slightly lower CD.
 */
export function skillAtLevel(sk, level = 1) {
  if (!sk) return null;
  const lv = Math.max(1, Math.min(SKILL_MAX_LEVEL, level | 0));
  const t = lv - 1;
  const mul = (sk.mul || 1) * (1 + t * 0.045);
  const sp = Math.max(1, Math.round((sk.sp || 10) * (1 + t * 0.025)));
  const cd = Math.max(1.2, +(sk.cd * Math.max(0.72, 1 - t * 0.014)).toFixed(2));
  return { ...sk, level: lv, mul, sp, cd };
}
