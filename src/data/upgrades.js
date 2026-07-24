export const UPGRADE_TABLE = {
  0: { chance: 0.9, yang: 1000, downgrade: false, destroyOnFail: false },
  1: { chance: 0.8, yang: 2500, downgrade: false, destroyOnFail: false },
  2: { chance: 0.7, yang: 5000, downgrade: false, destroyOnFail: false },
  3: { chance: 0.55, yang: 10000, downgrade: true, destroyOnFail: false },
  4: { chance: 0.45, yang: 20000, downgrade: true, destroyOnFail: false },
  5: { chance: 0.35, yang: 40000, downgrade: true, destroyOnFail: true },
  6: { chance: 0.28, yang: 80000, downgrade: true, destroyOnFail: true },
  7: { chance: 0.2, yang: 150000, downgrade: true, destroyOnFail: true },
  8: { chance: 0.12, yang: 300000, downgrade: true, destroyOnFail: true },
};
