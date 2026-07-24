import { SKILLS } from "../data/skills.js";

export const SkillService = {
  listFor(classId, spec) {
    return (SKILLS[classId] || []).filter((s) => !s.spec || s.spec === spec);
  },
  get(classId, index) {
    const list = SKILLS[classId] || [];
    return list[index] || null;
  },
};
