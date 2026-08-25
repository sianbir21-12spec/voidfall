import { Vector3 } from 'three';
import Utils from '../utils.ts';

export const ORE_STEP = 50;
const ORE_PER_SCALE = 30;
export const MINING_DAMAGE_FACTOR = 0.3;
export const MINING_LASER_FACTOR = 1.6875;
export const MINING_LASER_RANGE = 200;

// Shop wares / equippable weapons. Cannons are free; the starter lock-on missile
// is also free and mounted in the secondary slot on spawn. The mining laser remains
// purchasable.
export const Items = {
  MINING_LASER: 0,
  CANNONS: 1,
  LOCK_MISSILE: 2,
} as const;

export const Slots = {
  PRIMARY: 0,
  SECONDARY: 1,
} as const;

export const MINING_LASER_PRICE = 200;
export const ORE_PER_CHUNK = 1;
export const CHUNK_COLLECT_RADIUS = 45;
export const CHUNK_ARM_MS = 700;
export const CHUNK_SPREAD = 6;
export const CHUNK_OUT_MARGIN = 5;
export const CHUNK_TTL_MS = 300_000;
export const DEFAULT_CARGO_CAPACITY = 20;
export const ORE_SELL_PRICE = 10;
export const REPAIR_COST = 50;
export const VENDOR_TRADE_RADIUS = 300;
export const ASTEROID_RESPAWN_DELAY = 300_000;
export const ASTEROID_MIN_SCALE = 4;

export const LOCK_MISSILE_DAMAGE = 25;
// The missile remains a projectile, but is substantially faster and lives long
// enough for long-range dogfights. The server still validates the reported hit
// against the common authoritative maximum range.
export const LOCK_MISSILE_SPEED = 2.5;
export const LOCK_MISSILE_TIMER = 4000;
export const LOCK_MISSILE_RANGE = LOCK_MISSILE_SPEED * LOCK_MISSILE_TIMER;
export const LOCK_MISSILE_FIRE_INTERVAL = 900;

export function asteroidMaxOre(scale: number): number {
  return Math.max(ORE_STEP, Math.round(scale * ORE_PER_SCALE));
}

export function asteroidScale(baseScale: number, health: number, maxOre: number): number {
  const floor = Math.min(ASTEROID_MIN_SCALE, baseScale);
  const total = Math.max(1, Math.floor(maxOre / ORE_STEP));
  const droppedRaw = Math.floor((maxOre - health) / ORE_STEP);
  const dropped = droppedRaw < 0 ? 0 : droppedRaw > total ? total : droppedRaw;
  return baseScale - (baseScale - floor) * (dropped / total);
}

export function chunksDropped(maxOre: number, ore: number): number {
  return Math.floor((maxOre - ore) / ORE_STEP);
}

export function chunksForRange(maxOre: number, oreBefore: number, oreAfter: number): number {
  return chunksDropped(maxOre, oreAfter) - chunksDropped(maxOre, oreBefore);
}

export function chunkSpawnPosition(impact: Vector3, center: Vector3, pickupId: number): Vector3 {
  const rng = Utils.randomNumberGenerator((pickupId + 1) >>> 0);
  const out = impact.clone().sub(center);
  const dist = out.length();
  if (dist < 1e-3) out.set(0, 1, 0);
  else out.multiplyScalar(1 / dist);
  const tangent = new Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
  tangent.addScaledVector(out, -tangent.dot(out));
  if (tangent.lengthSq() > 1e-6) tangent.normalize();
  const outward = dist + CHUNK_OUT_MARGIN + rng() * CHUNK_SPREAD;
  return center.clone().addScaledVector(out, outward).addScaledVector(tangent, rng() * CHUNK_SPREAD);
}
