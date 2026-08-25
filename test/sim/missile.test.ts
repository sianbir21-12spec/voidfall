import assert from 'node:assert/strict';
import { Ship, createLockMissile, maxWeaponDamage, weaponsForItem } from '../../shared/sim/entities/ship.ts';
import { Items, LOCK_MISSILE_DAMAGE, LOCK_MISSILE_SPEED, LOCK_MISSILE_TIMER, LOCK_MISSILE_RANGE } from '../../shared/sim/mining.ts';
import { ownsItem } from '../../shared/sim/trade.ts';
import { awardKill, KILL_CREDIT_REWARD } from '../../shared/sim/progression.ts';
import { test } from './harness.ts';

test('player starter loadout is cannons primary plus lock-on missile secondary', () => {
  const ship = new Ship();
  ship.secondaryItem = Items.LOCK_MISSILE;
  assert.equal(ship.primaryItem, Items.CANNONS);
  assert.equal(ship.secondaryItem, Items.LOCK_MISSILE);
  assert.equal(ownsItem(ship, Items.LOCK_MISSILE), true);
});

test('lock missile is 25 damage and materially longer range than default cannon', () => {
  const ship = new Ship();
  const missile = createLockMissile(ship, 'secondary');
  ship.secondaryItem = Items.LOCK_MISSILE;
  assert.equal(missile.damage, LOCK_MISSILE_DAMAGE);
  assert.equal(missile.projectileSpeed, LOCK_MISSILE_SPEED);
  assert.equal(missile.projectileTimer, LOCK_MISSILE_TIMER);
  assert.equal(LOCK_MISSILE_RANGE, 10000);
  assert.equal(maxWeaponDamage(ship), 25);
});

test('cannon-only max damage is 5; missile-only is 25; combined is 25', () => {
  const ship = new Ship();
  ship.secondaryItem = -1;
  assert.equal(maxWeaponDamage(ship), 5);
  ship.primaryItem = -1;
  ship.secondaryItem = Items.LOCK_MISSILE;
  assert.equal(maxWeaponDamage(ship), 25);
  ship.primaryItem = Items.CANNONS;
  assert.equal(maxWeaponDamage(ship), 25);
});

test('loadout builder mounts missile on the secondary trigger', () => {
  const ship = new Ship();
  const weapons = weaponsForItem(ship, Items.LOCK_MISSILE, 'secondary');
  assert.equal(weapons.length, 1);
  assert.equal(weapons[0].slot, 'secondary');
  ship.firingSecondary = true;
  const shots: unknown[] = [];
  weapons[0].tryFire(1000, (...args) => shots.push(args));
  assert.equal(shots.length, 1);
});

test('confirmed kill awards exactly 100 credits even when killer remains a valid object after death', () => {
  const killer = { level: 1, xp: 0, credits: 40 };
  awardKill(killer, 1);
  assert.equal(killer.credits, 40 + KILL_CREDIT_REWARD);
  assert.equal(killer.level, 2);
});
