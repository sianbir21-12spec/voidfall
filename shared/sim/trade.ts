import type { Vector3 } from 'three';
import { Items, Slots, KILL_REWARD, LOCK_MISSILE_MAX_LEVEL, lockMissilePrice } from './combat-economy.ts';
export const SHIP_MAX_HEALTH = 100;
interface Trader { transform:{position:Vector3}; cargo:number; credits:number; health:number; hasMiningLaser:boolean; lockMissileLevel:number; primaryItem:number; secondaryItem:number; }
interface TradePost { transform:{position:Vector3} }
const TRADE_RADIUS_SQ = 300 * 300;
export function inTradeRange(ship:Trader,vendor:TradePost):boolean{return ship.transform.position.distanceToSquared(vendor.transform.position)<=TRADE_RADIUS_SQ;}
export function repairShip(ship:Trader,vendor:TradePost):boolean{if(!inTradeRange(ship,vendor)||ship.health>=SHIP_MAX_HEALTH||ship.credits<50)return false;ship.credits-=50;ship.health=SHIP_MAX_HEALTH;return true;}
export function buyLockMissile(ship:Trader,vendor:TradePost):boolean{if(!inTradeRange(ship,vendor)||ship.lockMissileLevel>=LOCK_MISSILE_MAX_LEVEL)return false;const price=lockMissilePrice(ship.lockMissileLevel);if(ship.credits<price)return false;ship.credits-=price;ship.lockMissileLevel+=1;ship.hasMiningLaser=true;return true;}
export const buyMiningLaser=buyLockMissile;
// Legacy network endpoint: ore selling is disabled with mining removed.
export function sellCargo(_ship:Trader,_vendor:TradePost):number{return 0;}
export function ownsItem(ship:Trader,itemId:number):boolean{return itemId===Items.CANNONS||(itemId===Items.LOCK_MISSILE&&ship.hasMiningLaser);}
export function equipSlot(ship:Trader,slot:number,itemId:number,vendor:TradePost):boolean{if(!inTradeRange(ship,vendor)||(slot!==Slots.PRIMARY&&slot!==Slots.SECONDARY))return false;if(itemId!==-1&&!ownsItem(ship,itemId))return false;const before=[ship.primaryItem,ship.secondaryItem];if(itemId!==-1){if(slot===Slots.PRIMARY&&ship.secondaryItem===itemId)ship.secondaryItem=-1;if(slot===Slots.SECONDARY&&ship.primaryItem===itemId)ship.primaryItem=-1;}if(slot===Slots.PRIMARY)ship.primaryItem=itemId;else ship.secondaryItem=itemId;return before[0]!==ship.primaryItem||before[1]!==ship.secondaryItem;}
export { KILL_REWARD };
