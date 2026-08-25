import { Vector3, Euler } from 'three';
import { Entity } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import Types from '../../types.ts';

export const DEFAULT_BULLET_SPEED = 1.5;
export const DEFAULT_BULLET_TIMER = 4000;

export interface BulletInit {
  id?: number;
  transform?: TransformInit;
  damage?: number;
  speed?: number;
  timer?: number;
  miningFactor?: number;
  beamRange?: number;
  homingTargetId?: number | null;
  homingTurnRate?: number;
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
  homingTargetId: number | null;
  homingTurnRate: number;

  constructor({ id, transform, damage, speed = DEFAULT_BULLET_SPEED, timer = DEFAULT_BULLET_TIMER, miningFactor, beamRange, homingTargetId = null, homingTurnRate = 0 }: BulletInit = {}) {
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
    this.homingTargetId = homingTargetId;
    this.homingTurnRate = homingTurnRate;
  }

  update(dt: number): void {
    this.ageMs += dt;
    if (this.ageMs > this.timeoutMs) this.markDestroyed();
  }
}
