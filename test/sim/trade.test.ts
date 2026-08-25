import assert from 'node:assert/strict';
import { Ship } from '../../shared/sim/entities/ship.ts';
import { Vendor } from '../../shared/sim/entities/vendor.ts';
import {
  repairShip,
  buyLockMissile,
  equipSlot,
  inTradeRange,
  SHIP_MAX_HEALTH,
} from '../../shared/sim/trade.ts';
import {
  Items,
  Slots,
  LOCK_MISSILE_BASE_PRICE,
  LOCK_MISSILE_MAX_LEVEL,
  lockMissilePrice,
} from '../../shared/sim/combat-economy.ts';
import { test } from './harness.ts';

function shipAt(x: number): Ship {
  const s = new Ship();
  s.transform.position.set(x, 0, 0);
  return s;
}

function vendorAtOrigin(): Vendor {
  const v = new Vendor();
  v.transform.position.set(0, 0, 0);
  return v;
}

test('ships spawn with cannons primary and lock-on missile secondary', () => {
  const ship = shipAt(10);
  assert.equal(ship.primaryItem, Items.CANNONS);
  assert.equal(ship.secondaryItem, Items.LOCK_MISSILE);
  assert.equal(ship.hasMiningLaser, true); // legacy wire name for starter missile ownership
  assert.equal(ship.lockMissileLevel, 1);
});

test('lock-on missile is owned and usable immediately at spawn', () => {
  const ship = shipAt(10);
  assert.equal(ship.weapons.length, 0); // loadout is materialized by ClientSim ownership
  assert.equal(ship.secondaryItem, Items.LOCK_MISSILE);
});

test('repair in range with funds restores full health', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.health = 40;
  ship.credits = 55;

  assert.equal(repairShip(ship, vendor), true);
  assert.equal(ship.health, SHIP_MAX_HEALTH);
  assert.equal(ship.credits, 5);
});

test('repair rejects insufficient funds, full health, and out of range', () => {
  const vendor = vendorAtOrigin();
  const poor = shipAt(10);
  poor.health = 40;
  poor.credits = 49;
  assert.equal(repairShip(poor, vendor), false);
  assert.equal(poor.health, 40);
  assert.equal(poor.credits, 49);

  const full = shipAt(10);
  full.health = SHIP_MAX_HEALTH;
  full.credits = 999;
  assert.equal(repairShip(full, vendor), false);
  assert.equal(full.credits, 999);

  const far = shipAt(401);
  far.health = 40;
  far.credits = 999;
  assert.equal(repairShip(far, vendor), false);
});

test('upgrading the starter lock-on missile spends credits and increases its level', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.credits = LOCK_MISSILE_BASE_PRICE + 30;

  assert.equal(buyLockMissile(ship, vendor), true);
  assert.equal(ship.lockMissileLevel, 2);
  assert.equal(ship.secondaryItem, Items.LOCK_MISSILE);
  assert.equal(ship.credits, 30);
});

test('lock-on missile upgrade price scales with current level', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.lockMissileLevel = 2;
  ship.credits = lockMissilePrice(2) + 1;

  assert.equal(buyLockMissile(ship, vendor), true);
  assert.equal(ship.lockMissileLevel, 3);
  assert.equal(ship.credits, 1);
});

test('lock-on missile cannot upgrade past max level or without enough credits', () => {
  const vendor = vendorAtOrigin();
  const poor = shipAt(10);
  poor.credits = lockMissilePrice(1) - 1;
  assert.equal(buyLockMissile(poor, vendor), false);
  assert.equal(poor.lockMissileLevel, 1);

  const maxed = shipAt(10);
  maxed.lockMissileLevel = LOCK_MISSILE_MAX_LEVEL;
  maxed.credits = 9999;
  assert.equal(buyLockMissile(maxed, vendor), false);
  assert.equal(maxed.lockMissileLevel, LOCK_MISSILE_MAX_LEVEL);
  assert.equal(maxed.credits, 9999);
});

test('trade actions require the vendor range', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(401);
  assert.equal(inTradeRange(ship, vendor), false);
  ship.credits = 9999;
  assert.equal(buyLockMissile(ship, vendor), false);
  assert.equal(ship.lockMissileLevel, 1);
});

test('an owned weapon can move between slots, including the starter missile', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);

  assert.equal(equipSlot(ship, Slots.PRIMARY, Items.LOCK_MISSILE, vendor), true);
  assert.equal(ship.primaryItem, Items.LOCK_MISSILE);
  assert.equal(ship.secondaryItem, -1);

  assert.equal(equipSlot(ship, Slots.SECONDARY, Items.CANNONS, vendor), true);
  assert.equal(ship.secondaryItem, Items.CANNONS);

  assert.equal(equipSlot(ship, Slots.SECONDARY, Items.LOCK_MISSILE, vendor), true);
  assert.equal(ship.secondaryItem, Items.LOCK_MISSILE);
  assert.equal(ship.primaryItem, -1);
});

test('an unowned lock-on missile cannot be equipped', () => {
  const vendor = vendorAtOrigin();
  const ship = shipAt(10);
  ship.hasMiningLaser = false;

  assert.equal(equipSlot(ship, Slots.SECONDARY, Items.LOCK_MISSILE, vendor), false);
  assert.equal(ship.secondaryItem, Items.LOCK_MISSILE);
});
