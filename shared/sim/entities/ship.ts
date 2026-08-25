import { Vector3, Euler, Ray } from 'three';
import { Entity } from '../entity.ts';
import type { EntityWorld } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import { InputCommand } from '../input.ts';
import { Bullet } from './bullet.ts';
import Types from '../../types.ts';
import { Weapon } from '../weapon.ts';
import type { WeaponSlot } from '../weapon.ts';
import { DEFAULT_CARGO_CAPACITY } from '../mining.ts';
import { Items, lockMissileDamage } from '../combat-economy.ts';

export const RESPAWN_DELAY = 3000;
export type Faction = 'hostile' | 'neutral' | 'friendly';

export function createDefaultWeapons(ship: Ship, slot: WeaponSlot = 'primary'): Weapon[] {
  const left = new Weapon({ offset: new Vector3(1.3, 0.9, 5), delay: 160, fireInterval: 320, slot });
  const right = new Weapon({ offset: new Vector3(-1.3, 0.9, 5), fireInterval: 320, slot });
  left.parent = ship; right.parent = ship;
  return [left, right];
}

// Lock-on missile: the existing aim-assist snaps the firing ray onto the selected
// ship/lead point, so the missile follows the same locked solution while retaining
// the server-authoritative hit validation.
export function createLockMissile(ship: Ship, slot: WeaponSlot = 'secondary'): Weapon {
  const missile = new Weapon({
    offset: new Vector3(0, -0.6, 5),
    fireInterval: 1400,
    slot,
    damage: lockMissileDamage(ship.lockMissileLevel),
  });
  missile.parent = ship;
  return missile;
}

export function weaponsForItem(ship: Ship, itemId: number, slot: WeaponSlot): Weapon[] {
  if (itemId === Items.CANNONS) return createDefaultWeapons(ship, slot);
  if (itemId === Items.LOCK_MISSILE) return [createLockMissile(ship, slot)];
  return [];
}

export function maxWeaponDamage(ship: Ship): number {
  let max = 0;
  for (const weapon of [
    ...weaponsForItem(ship, ship.primaryItem, 'primary'),
    ...weaponsForItem(ship, ship.secondaryItem, 'secondary'),
  ]) max = Math.max(max, weapon.damage);
  return max;
}

export interface ShipInit { id?: number; transform?: TransformInit; }
export interface ShipController { lastInput: InputCommand; connection?: unknown; }

export class Ship extends Entity {
  acceleration: number; angularAcceleration: Euler; health: number;
  aim: Ray | null; aimDistance: number; weapons: Weapon[];
  firingPrimary: boolean; firingSecondary: boolean; controller: ShipController | null;
  respawn: boolean; randomSpawn: boolean; respawnTimer: number; inputBits: number;
  renderInput: InputCommand | null; name: string; faction: Faction; invulnerable: boolean;
  cargo: number; cargoCapacity: number; credits: number;
  // Kept as the legacy wire/property name so older snapshots remain compatible;
  // it now means the player owns the starter lock-on missile.
  hasMiningLaser: boolean;
  lockMissileLevel: number;
  primaryItem: number; secondaryItem: number;
  level: number; xp: number; lastHitBy: Ship | null;

  constructor(opts: ShipInit = {}) {
    super({ ...opts, type: Types.Entities.SPACESHIP });
    this.acceleration = 3; this.angularAcceleration = new Euler(6, 12, 2);
    this.velocity = new Vector3(); this.angularVelocity = new Vector3();
    this.damping = 0.5; this.angularDamping = 0.99; this.weight = 1; this.kinematic = false;
    this.health = 100; this.aim = new Ray(); this.aimDistance = 0; this.weapons = [];
    this.firingPrimary = false; this.firingSecondary = false; this.controller = null;
    this.respawn = true; this.randomSpawn = true; this.alive = true; this.respawnTimer = 0;
    this.inputBits = 0; this.renderInput = null; this.name = ''; this.faction = 'hostile';
    this.invulnerable = false; this.cargo = 0; this.cargoCapacity = DEFAULT_CARGO_CAPACITY;
    this.credits = 0; this.hasMiningLaser = true; this.lockMissileLevel = 1;
    this.primaryItem = Items.CANNONS; this.secondaryItem = Items.LOCK_MISSILE;
    this.level = 1; this.xp = 0; this.lastHitBy = null;
  }

  serializeNetworkState(): number[] {
    const state = super.serializeNetworkState();
    state[13] = this.inputBits; state[14] = this.health; state[15] = this.level;
    return state;
  }

  applyInput(input: InputCommand, dt: number): void {
    const { forward, backward, rollLeft, rollRight, strafeLeft, strafeRight,
      strafeUp, strafeDown, boost, weaponPrimary, weaponSecondary, aim } = input;
    const acceleration = boost ? this.acceleration * 2 : this.acceleration;
    const movement = {
      x: strafeLeft ? 1 : strafeRight ? -1 : 0,
      y: strafeDown ? -1 : strafeUp ? 1 : 0,
      z: forward ? 1 : backward ? -1 : 0,
      roll: rollLeft ? 1 : rollRight ? -1 : 0,
      yaw: aim ? aim.mouse.x : 0, pitch: aim ? -aim.mouse.y : 0,
    };
    this.velocity.x = acceleration * dt * movement.x;
    this.velocity.y = acceleration * dt * movement.y;
    this.velocity.z = acceleration * dt * movement.z;
    this.angularVelocity.x = this.angularAcceleration.x * dt * movement.pitch;
    this.angularVelocity.y = this.angularAcceleration.y * dt * -movement.yaw;
    this.angularVelocity.z += this.angularAcceleration.z * dt * -movement.roll;
    this.angularVelocity.z *= this.angularDamping ** dt;
    if (Math.abs(this.angularVelocity.z) < 0.000001) this.angularVelocity.z = 0;
    if (aim) {
      this.aim!.origin.set(aim.origin.x, aim.origin.y, aim.origin.z);
      this.aim!.direction.set(aim.direction.x, aim.direction.y, aim.direction.z);
      this.aimDistance = aim.distance;
    }
    this.firingPrimary = !!weaponPrimary; this.firingSecondary = !!weaponSecondary;
  }

  update(dt: number, world: EntityWorld, time: number): void {
    if (!this.alive || this.kinematic) return;
    this.applyInput(this.controller?.lastInput ?? InputCommand.empty(), dt);
    for (const weapon of this.weapons) {
      weapon.tryFire(time, (position, rotation, damage, miningFactor) => {
        const bullet = new Bullet({ transform: { position, rotation }, damage, miningFactor });
        bullet.owner = this;
        return world.spawn(bullet);
      });
    }
  }
}
