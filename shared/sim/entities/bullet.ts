import { Vector3, Euler } from 'three';
import { Entity } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import Types from '../../types.ts';

// Muzzle speed of a bullet along its local +Z, in world units per millisecond
// (integrateBullets/sweepProjectiles multiply by the ms timestep). The lead
// indicator reads this to solve the firing intercept; ×1000 gives units/second.
export const DEFAULT_BULLET_SPEED = 1.5;

// Long-range dogfights need enough projectile lifetime for the lead indicator and
// actual damage range to agree. At 1500 units/s this gives a 6 km maximum reach.
export const DEFAULT_BULLET_TIMER = 4000;

export interface BulletInit {
  id?: number;
  transform?: TransformInit;
  damage?: number;
  speed?: number;
  timer?: number;
  miningFactor?: number;
  // Present ⇒ this is a stationary beam, not a projectile. Its value is the max
  // reach in world units; `beamLength` is the actual drawn length (muzzle → hit),
  // resolved by a raycast at spawn.
  beamRange?: number;
}

export class Bullet extends Entity {
  acceleration: number;
  angularAcceleration: Euler;
  damage: number | undefined;
  timeoutMs: number;
  ageMs: number;
  destroyOnCollision: boolean;
  owner: Entity | null;
  miningFactor: number | undefined;
  beamRange: number | undefined;
  beamLength: number | undefined;
  beamPulse: number;

  constructor({
    id,
    transform,
    damage,
    speed = DEFAULT_BULLET_SPEED,
    timer = DEFAULT_BULLET_TIMER,
    miningFactor,
    beamRange,
  }: BulletInit = {}) {
    super({ id, transform, type: Types.Entities.BULLET });
    this.velocity = new Vector3(0, 0, beamRange != null ? 0 : speed);
    this.angularVelocity = new Vector3();
    this.acceleration = 0;
    this.angularAcceleration = new Euler(0, 0, 0);
    this.damping = 0;
    this.angularDamping = 0;
    this.kinematic = true;
    this.weight = 1;
    this.damage = damage;
    this.timeoutMs = timer;
    this.ageMs = 0;
    this.destroyOnCollision = true;
    this.owner = null;
    this.miningFactor = miningFactor;
    this.beamRange = beamRange;
    this.beamLength = undefined;
    this.beamPulse = 0;
  }

  update(dt: number): void {
    this.ageMs += dt;
    if (this.ageMs > this.timeoutMs) {
      this.markDestroyed();
    }
  }
}
