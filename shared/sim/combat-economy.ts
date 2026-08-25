export const Items = {
  CANNONS: 1,
  LOCK_MISSILE: 2,
} as const;

export const Slots = {
  PRIMARY: 0,
  SECONDARY: 1,
} as const;

export const KILL_REWARD = 100;
export const LOCK_MISSILE_BASE_PRICE = 100;
export const LOCK_MISSILE_MAX_LEVEL = 5;

export function lockMissilePrice(level: number): number {
  return LOCK_MISSILE_BASE_PRICE * Math.max(1, level);
}

export function lockMissileDamage(level: number): number {
  return 25 + Math.max(0, level - 1) * 15;
}
