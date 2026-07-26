import {
  SKILLS,
  SKILL_UNLOCK_LEVEL,
  SKILL_MAX_LEVEL,
  SKILL_BOOK_SOFT_CAP,
  skillsFor,
  skillTiming,
  skillAtLevel,
} from "../data/skills.js";
import { SPECS, hasSkillPath } from "../data/meta.js";
import { ITEM_TEMPLATES } from "../data/items.js";
import { InventoryService } from "./InventoryService.js";

function ensureLevels(ch) {
  if (!ch) return {};
  if (!ch.skillLevels || typeof ch.skillLevels !== "object") ch.skillLevels = {};
  return ch.skillLevels;
}

export const SkillService = {
  unlockLevel: SKILL_UNLOCK_LEVEL,
  maxLevel: SKILL_MAX_LEVEL,
  bookSoftCap: SKILL_BOOK_SOFT_CAP,

  listFor(classId, spec) {
    return skillsFor(classId, spec);
  },

  get(classId, spec, index) {
    const list = skillsFor(classId, spec);
    return list[index] || null;
  },

  timing(sk) {
    return skillTiming(sk);
  },

  pathsFor(classId) {
    return SPECS[classId] || [];
  },

  hasPath(ch) {
    return hasSkillPath(ch?.spec);
  },

  canChoose(ch) {
    if (!ch) return "No character";
    if (this.hasPath(ch)) return "Skill path already chosen";
    if ((ch.level || 1) < SKILL_UNLOCK_LEVEL) {
      return `Reach Lv.${SKILL_UNLOCK_LEVEL} first`;
    }
    return null;
  },

  /** Permanent choice — Metin2-style skill group */
  choosePath(ch, specId) {
    const err = this.canChoose(ch);
    if (err) return err;
    const paths = this.pathsFor(ch.classId);
    const path = paths.find((p) => p.id === specId);
    if (!path) return "Invalid skill path";
    ch.spec = path.id;
    ensureLevels(ch);
    return null;
  },

  allForClass(classId) {
    return SKILLS[classId] || {};
  },

  getLevel(ch, skillId) {
    const levels = ensureLevels(ch);
    const n = levels[skillId];
    return Math.max(1, Math.min(SKILL_MAX_LEVEL, n || 1));
  },

  /** Skill def scaled by the character's rank */
  scaled(ch, index) {
    const sk = this.get(ch.classId, ch.spec, index);
    if (!sk) return null;
    return skillAtLevel(sk, this.getLevel(ch, sk.id));
  },

  /** List current path skills with levels for UI */
  listWithLevels(ch) {
    if (!this.hasPath(ch)) return [];
    return this.listFor(ch.classId, ch.spec).map((sk) => {
      const level = this.getLevel(ch, sk.id);
      return { ...skillAtLevel(sk, level), level, baseMul: sk.mul, baseSp: sk.sp, baseCd: sk.cd };
    });
  },

  /**
   * Raise a skill with a book from inventory.
   * @returns {string|null} error message
   */
  useBookOnSkill(ch, skillId, bookUid) {
    if (!ch) return "No character";
    if (!this.hasPath(ch)) return "Choose a skill path at the Skill Master first";
    const skills = this.listFor(ch.classId, ch.spec);
    const sk = skills.find((s) => s.id === skillId);
    if (!sk) return "That skill is not on your path";

    const stack = ch.inventory.find((x) => x.uid === bookUid);
    if (!stack) return "Missing skill book";
    const book = ITEM_TEMPLATES[stack.itemId];
    if (!book?.skillBook) return "Not a skill book";

    const levels = ensureLevels(ch);
    const cur = this.getLevel(ch, skillId);
    if (cur >= SKILL_MAX_LEVEL) return "Skill is already max rank (M20)";
    if (cur >= SKILL_BOOK_SOFT_CAP && !book.grandMaster) {
      return `Need a Grand Master Book above rank ${SKILL_BOOK_SOFT_CAP}`;
    }

    levels[skillId] = cur + 1;
    InventoryService.remove(ch, bookUid, 1);
    return null;
  },

  /** Find first usable skill book uid for a skill at its current rank */
  findBookFor(ch, skillId) {
    const cur = this.getLevel(ch, skillId);
    if (cur >= SKILL_MAX_LEVEL) return null;
    const needGrand = cur >= SKILL_BOOK_SOFT_CAP;
    for (const stack of ch.inventory || []) {
      const t = ITEM_TEMPLATES[stack.itemId];
      if (!t?.skillBook) continue;
      if (needGrand && !t.grandMaster) continue;
      if (!needGrand && t.grandMaster) continue; // prefer normal books first; allow grand as fallback below
      return stack.uid;
    }
    // Grand books can also raise low ranks
    if (!needGrand) {
      for (const stack of ch.inventory || []) {
        const t = ITEM_TEMPLATES[stack.itemId];
        if (t?.skillBook && t.grandMaster) return stack.uid;
      }
    }
    return null;
  },

  countBooks(ch) {
    let normal = 0;
    let grand = 0;
    for (const stack of ch.inventory || []) {
      const t = ITEM_TEMPLATES[stack.itemId];
      if (!t?.skillBook) continue;
      if (t.grandMaster) grand += stack.qty || 1;
      else normal += stack.qty || 1;
    }
    return { normal, grand };
  },
};
