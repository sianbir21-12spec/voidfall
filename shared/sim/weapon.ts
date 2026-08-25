import { Vector3, Quaternion, Ray, Matrix4 } from 'three';
import type { Transform } from './transform.ts';

export type WeaponSlot = 'primary' | 'secondary';

export interface WeaponParent {
  firingPrimary: boolean;
  firingSecondary: boolean;
  transform: Transform;
  aim: Ray | null;
  aimDistance: number;
}

export interface WeaponInit {
  offset?: Vector3;
  delay?: number;
  fireInterval?: number;
  parent?: WeaponParent;
  slot?: WeaponSlot;
  damage?: number;
  miningFactor?: number;
  beamRange?: number;
  projectileSpeed?: number;
  projectileTimer?: number;
}

type SpawnBullet = (
  position: Vector3,
  rotation: Quaternion,
  damage: number,
  miningFactor?: number,
  beamRange?: number,
  projectileSpeed?: number,
  projectileTimer?: number,
) => void;

export class Weapon {
  offset: Vector3;
  delay: number;
  fireInterval: number;
  nextFireTime: number;
  parent: WeaponParent;
  slot: WeaponSlot;
  damage: number;
  miningFactor: number | undefined;
  beamRange: number | undefined;
  projectileSpeed: number | undefined;
  projectileTimer: number | undefined;
  _held: boolean;

  constructor({
    offset,
    delay = 0,
    fireInterval = 100,
    parent,
    slot = 'primary',
    damage = 5,
    miningFactor,
    beamRange,
    projectileSpeed,
    projectileTimer,
  }: WeaponInit = {}) {
    this.offset = offset ? offset.clone() : new Vector3();
    this.delay = delay;
    this.fireInterval = fireInterval;
    this.nextFireTime = 0;
    this.parent = parent!;
    this.slot = slot;
    this.damage = damage;
    this.miningFactor = miningFactor;
    this.beamRange = beamRange;
    this.projectileSpeed = projectileSpeed;
    this.projectileTimer = projectileTimer;
    this._held = false;
  }

  tryFire(time: number, spawnBullet: SpawnBullet): void {
    const held = this.slot === 'secondary' ? this.parent.firingSecondary : this.parent.firingPrimary;
    if (held && !this._held) this.nextFireTime = time + this.delay;
    this._held = held;
    if (!held || time < this.nextFireTime) return;
    this.nextFireTime += this.fireInterval;
    const { position, rotation } = getWeaponTransform(this);
    spawnBullet(
      position,
      rotation,
      this.damage,
      this.miningFactor,
      this.beamRange,
      this.projectileSpeed,
      this.projectileTimer,
    );
  }
}

export function getWeaponTransform(weapon: Weapon): { position: Vector3; rotation: Quaternion } {
  const transform = weapon.parent.transform;
  const position = new Vector3().copy(weapon.offset).applyQuaternion(transform.rotation).add(transform.position);
  let rotation = transform.rotation;
  if (weapon.parent.aim) {
    const aim = weapon.parent.aim;
    const target = new Vector3();
    new Ray(aim.origin, aim.direction).at(weapon.parent.aimDistance, target);
    const direction = new Vector3().subVectors(target, position).normalize();
    const mx = new Matrix4().lookAt(direction, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    rotation = new Quaternion().setFromRotationMatrix(mx);
  }
  return { position, rotation };
}
