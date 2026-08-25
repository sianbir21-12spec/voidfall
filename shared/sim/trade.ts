import type { Vector3 } from 'three';
import {
  ORE_SELL_PRICE,
  REPAIR_COST,
  VENDOR_TRADE_RADIUS,
  MINING_LASER_PRICE,
  Items,
  Slots,
} from './mining.ts';

export const SHIP_MAX_HEALTH = 100;

interface Trader {
  transform: { position: Vector3 };
  cargo: number;
  credits: number;
  health: number;
  hasMiningLaser: boolean;
  primaryItem: number;
  secondaryItem: number;
}
interface TradePost { transform: { position: Vector3 } }

const TRADE_RADIUS_SQ = VENDOR_TRADE_RADIUS * VENDOR_TRADE_RADIUS;

export function inTradeRange(ship: Trader, vendor: TradePost): boolean {
  return ship.transform.position.distanceToSquared(vendor.transform.position) <= TRADE_RADIUS_SQ;
}

export function sellCargo(ship: Trader, vendor: TradePost): number {
  if (ship.cargo <= 0 || !inTradeRange(ship, vendor)) return 0;
  const earned = ship.cargo * ORE_SELL_PRICE;
  ship.credits += earned;
  ship.cargo = 0;
  return earned;
}

export function repairShip(ship: Trader, vendor: TradePost): boolean {
  if (ship.health >= SHIP_MAX_HEALTH || ship.credits < REPAIR_COST || !inTradeRange(ship, vendor)) return false;
  ship.credits -= REPAIR_COST;
  ship.health = SHIP_MAX_HEALTH;
  return true;
}

export function buyMiningLaser(ship: Trader, vendor: TradePost): boolean {
  if (ship.hasMiningLaser || ship.credits < MINING_LASER_PRICE || !inTradeRange(ship, vendor)) return false;
  ship.credits -= MINING_LASER_PRICE;
  ship.hasMiningLaser = true;
  return true;
}

export function ownsItem(ship: Trader, itemId: number): boolean {
  if (itemId === Items.CANNONS || itemId === Items.LOCK_MISSILE) return true;
  if (itemId === Items.MINING_LASER) return ship.hasMiningLaser;
  return false;
}

export function equipSlot(ship: Trader, slot: number, itemId: number, vendor: TradePost): boolean {
  if (!inTradeRange(ship, vendor) || (slot !== Slots.PRIMARY && slot !== Slots.SECONDARY)) return false;
  if (itemId !== -1 && !ownsItem(ship, itemId)) return false;

  const before = { primary: ship.primaryItem, secondary: ship.secondaryItem };
  if (itemId !== -1) {
    if (slot === Slots.PRIMARY && ship.secondaryItem === itemId) ship.secondaryItem = -1;
    else if (slot === Slots.SECONDARY && ship.primaryItem === itemId) ship.primaryItem = -1;
  }
  if (slot === Slots.PRIMARY) ship.primaryItem = itemId;
  else ship.secondaryItem = itemId;
  return ship.primaryItem !== before.primary || ship.secondaryItem !== before.secondary;
}
