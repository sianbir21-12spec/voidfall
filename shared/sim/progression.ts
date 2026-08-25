// Kill-driven XP progression plus the server-authoritative combat reward.
export interface Progressable {
  level: number;
  xp: number;
  credits?: number;
}

export function xpForNextLevel(level: number): number {
  return 10 * level * level;
}

export function killXp(victimLevel: number): number {
  return 10 * victimLevel;
}

export const KILL_CREDIT_REWARD = 100;
export const XP_PER_ORE = 1;

export function awardXp(target: Progressable, amount: number): void {
  target.xp += amount;
  while (target.xp >= xpForNextLevel(target.level)) {
    target.xp -= xpForNextLevel(target.level);
    target.level += 1;
  }
}

export function awardKill(killer: Progressable, victimLevel: number): void {
  awardXp(killer, killXp(victimLevel));
  if (typeof killer.credits === 'number') killer.credits += KILL_CREDIT_REWARD;
}
