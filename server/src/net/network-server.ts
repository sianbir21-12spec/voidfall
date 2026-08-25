import { performance } from 'perf_hooks';
import logger from '../utils/logger.ts';
import { sanitize } from '../utils/sanitize.ts';
import Types from '../../../shared/types.ts';
import Messages, { WORLD_ENTITY_BITS, WORLD_HEADER_BITS } from '../../../shared/messages.ts';
import { Ship, maxWeaponDamage } from '../../../shared/sim/entities/ship.ts';
import { DEFAULT_BULLET_SPEED, DEFAULT_BULLET_TIMER } from '../../../shared/sim/entities/bullet.ts';
import { applyDamage, type CombatEntity } from '../../../shared/sim/subsystems/combat.ts';
import { InputCommand } from '../../../shared/sim/input.ts';
import { PriorityAccumulator, type PriorityFn } from '../../../shared/sim/net/priority.ts';
import { pickSpawnPosition } from '../../../shared/sim/spawn.ts';
import { sellCargo, repairShip, buyMiningLaser, equipSlot } from '../../../shared/sim/trade.ts';
import { Items, LOCK_MISSILE_RANGE, MINING_LASER_FACTOR } from '../../../shared/sim/mining.ts';
import { xpForNextLevel } from '../../../shared/sim/progression.ts';
import { generateName } from '../../../shared/names/generate-name.ts';
import type { SpawnEvent, CollectEvent } from '../../../shared/sim/subsystems/mining.ts';
import type { GameServer } from '../game-server.ts';
import type Connection from '../connection.ts';
import type { OutgoingMessage } from '../connection.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';

// The server accepts the normal cannon reach or the longer starter missile reach.
const MAX_HIT_RANGE = Math.max(DEFAULT_BULLET_SPEED * DEFAULT_BULLET_TIMER * 1.5, LOCK_MISSILE_RANGE * 1.15);
const LEADERBOARD_SIZE = 10;
const LEADERBOARD_INTERVAL = 20;
const SNAPSHOT_INTERVAL = 3;
const SNAPSHOT_HZ = 60 / SNAPSHOT_INTERVAL;
const SNAPSHOT_BANDWIDTH_BPS = 256 * 1024;
const SNAPSHOT_BUDGET_BITS = SNAPSHOT_BANDWIDTH_BPS / SNAPSHOT_HZ;
const AOI_RADIUS = 3000;
const AOI_RADIUS_SQ = AOI_RADIUS * AOI_RADIUS;
const AOI_NEAR_BOOST = 9;
const AOI_FAR_PRIORITY = 0.5;

export function viewerPriority(self: Entity | null): PriorityFn {
  if (!self) return () => 1;
  const origin = self.transform.position;
  return (entity) => {
    if (entity === self) return 1 + AOI_NEAR_BOOST;
    const d2 = entity.transform.position.distanceToSquared(origin);
    if (d2 > AOI_RADIUS_SQ) return AOI_FAR_PRIORITY;
    return 1 + AOI_NEAR_BOOST * (1 - Math.sqrt(d2) / AOI_RADIUS);
  };
}

export class NetworkServer {
  gameServer: GameServer; world: World; connections: Set<Connection>; ships: Map<number, Ship>; priorities: Map<number, PriorityAccumulator>; lastAlive: Map<number, boolean>;
  lastStats: Map<number, { cargo: number; credits: number }>;
  lastLoadout: Map<number, { hasMiningLaser: boolean; primaryItem: number; secondaryItem: number }>;
  lastProgress: Map<number, { level: number; xp: number }>;
  private leaderboardTick: number; private snapshotTick: number;
  constructor(gameServer: GameServer) {
    this.gameServer = gameServer; this.world = gameServer.world; this.connections = new Set(); this.ships = new Map(); this.priorities = new Map(); this.lastAlive = new Map(); this.lastStats = new Map(); this.lastLoadout = new Map(); this.lastProgress = new Map(); this.leaderboardTick = 0; this.snapshotTick = 0;
  }
  addConnection(connection: Connection): void {
    this.connections.add(connection); this.priorities.set(connection.id, new PriorityAccumulator()); connection.onDisconnect(() => this.handleDisconnect(connection)); connection.pushMessage(new Messages.Go());
    for (const entity of this.world.entities.values()) {
      if (entity.alive === false) continue;
      const { position, rotation, scale } = entity.transform; const name = (entity as { name?: string }).name ?? '';
      connection.pushMessage(new Messages.Spawn(entity.id!, entity.type, position, rotation, scale, name));
    }
    connection.sendOutgoingMessages();
  }
  handleDisconnect(connection: Connection): void {
    const ship = this.ships.get(connection.id);
    if (ship) { this.world.despawn(ship.id!); this.ships.delete(connection.id); this.lastAlive.delete(ship.id!); }
    this.lastStats.delete(connection.id); this.lastLoadout.delete(connection.id); this.lastProgress.delete(connection.id); this.priorities.delete(connection.id); this.connections.delete(connection); this.gameServer.connectedClients--;
  }
  processIncoming(world: World, _time: number): void {
    for (const connection of this.connections) {
      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();
        if (message!.type === Types.Messages.HELLO) {
          const cleaned = sanitize(message!.data.name); const name = cleaned ? cleaned.substr(0, 15) : generateName();
          const ship = this.spawnShip(world, connection, name); connection.pushMessage(new Messages.Welcome(ship.id!, name));
        }
      }
      const ship = this.ships.get(connection.id);
      if (!ship) continue;
      const state = connection.drainState();
      if (state && ship.alive !== false) {
        ship.inputBits = state.input;
        this.gameServer.physics.correctBody?.(ship, state.position, state.rotation, state.velocity, state.angularVelocity);
      }
      for (const fire of connection.drainFire()) {
        if (ship.alive === false) break;
        this.broadcastMessage(new Messages.Shot(ship.id!, fire.position, fire.rotation, fire.speed), connection.id);
      }
      for (const hit of connection.drainHits()) {
        if (ship.alive === false) break;
        this.applyHit(ship, hit);
      }
      const wantsSell = connection.drainSell(); const wantsRepair = connection.drainRepair(); const wantsBuy = connection.drainBuy(); const wantsEquip = connection.drainEquip();
      if (ship.alive !== false && (wantsSell || wantsRepair || wantsBuy !== null || wantsEquip !== null)) {
        const vendor = this.findVendor();
        if (vendor) {
          if (wantsSell) sellCargo(ship, vendor);
          if (wantsRepair) repairShip(ship, vendor);
          if (wantsBuy === Items.MINING_LASER) buyMiningLaser(ship, vendor);
          if (wantsEquip !== null) equipSlot(ship, wantsEquip.slot, wantsEquip.itemId, vendor);
        }
      }
    }
  }
  private findVendor(): Entity | undefined { for (const entity of this.world.entities.values()) if (entity.type === Types.Entities.VENDOR) return entity; return undefined; }
  broadcastSpawned(events: SpawnEvent[]): void { for (const { id, position } of events) this.broadcastMessage(new Messages.OreDrop(id, position)); }
  broadcastCollected(events: CollectEvent[]): void { for (const { id } of events) this.broadcastMessage(new Messages.Collect(id)); }
  private sendStatChanges(): void {
    for (const connection of this.connections) {
      const ship = this.ships.get(connection.id); if (!ship) continue; const last = this.lastStats.get(connection.id);
      if (last && last.cargo === ship.cargo && last.credits === ship.credits) continue;
      connection.pushMessage(new Messages.Stats(ship.cargo, ship.cargoCapacity, ship.credits)); this.lastStats.set(connection.id, { cargo: ship.cargo, credits: ship.credits });
    }
  }
  private sendLoadoutChanges(): void {
    for (const connection of this.connections) {
      const ship = this.ships.get(connection.id); if (!ship) continue; const last = this.lastLoadout.get(connection.id);
      if (last && last.hasMiningLaser === ship.hasMiningLaser && last.primaryItem === ship.primaryItem && last.secondaryItem === ship.secondaryItem) continue;
      connection.pushMessage(new Messages.Loadout(ship.hasMiningLaser, ship.primaryItem, ship.secondaryItem));
      this.lastLoadout.set(connection.id, { hasMiningLaser: ship.hasMiningLaser, primaryItem: ship.primaryItem, secondaryItem: ship.secondaryItem });
    }
  }
  private sendProgressChanges(): void {
    for (const connection of this.connections) {
      const ship = this.ships.get(connection.id); if (!ship) continue; const last = this.lastProgress.get(connection.id);
      if (last && last.level === ship.level && last.xp === ship.xp) continue;
      connection.pushMessage(new Messages.Progress(ship.level, ship.xp, xpForNextLevel(ship.level))); this.lastProgress.set(connection.id, { level: ship.level, xp: ship.xp });
    }
  }
  private sendLeaderboard(): void {
    if (this.connections.size === 0) return;
    const ranked: Ship[] = [];
    for (const entity of this.world.entities.values()) if (entity.type === Types.Entities.SPACESHIP && entity.alive !== false) ranked.push(entity as Ship);
    ranked.sort((a, b) => b.level - a.level || b.xp - a.xp);
    const top = ranked.slice(0, LEADERBOARD_SIZE).map((s) => ({ name: s.name, level: s.level }));
    for (const connection of this.connections) { const ship = this.ships.get(connection.id); if (!ship) continue; connection.pushMessage(new Messages.Leaderboard(top, ranked.indexOf(ship) + 1, ship.level)); }
  }
  spawnShip(world: World, connection: Connection, name = ''): Ship {
    const ship = new Ship(); ship.name = name; ship.controller = { connection, lastInput: InputCommand.empty() }; ship.transform.position = pickSpawnPosition(world); ship.randomSpawn = false;
    world.spawn(ship); this.ships.set(connection.id, ship); return ship;
  }
  applyHit(ship: Ship, hit: ReturnType<typeof Messages.Hit.deserialize>): void {
    const target = this.world.get(hit.targetId) as CombatEntity | undefined;
    if (!target || target.alive === false || target.invulnerable) return;
    if (ship.transform.position.distanceTo(hit.position) > MAX_HIT_RANGE) return;
    const laserEquipped = ship.hasMiningLaser && (ship.primaryItem === Items.MINING_LASER || ship.secondaryItem === Items.MINING_LASER);
    const miningFactor = laserEquipped && hit.miningFactor ? MINING_LASER_FACTOR : undefined;
    const damage = Math.min(hit.damage, maxWeaponDamage(ship));
    applyDamage(target, damage, miningFactor, hit.position, ship);
  }
  onEntitySpawned(entity: Entity): void {
    if (entity.alive === false) return;
    const { position, rotation, scale } = entity.transform; const name = (entity as { name?: string }).name ?? '';
    this.broadcastMessage(new Messages.Spawn(entity.id!, entity.type, position, rotation, scale, name));
  }
  onEntityDespawned(entity: Entity): void { this.broadcastMessage(new Messages.Despawn(entity.id!)); }
  broadcast(world: World, _time: number): void {
    this.sendStatChanges(); this.sendLoadoutChanges(); this.sendProgressChanges();
    if (++this.leaderboardTick >= LEADERBOARD_INTERVAL) { this.leaderboardTick = 0; this.sendLeaderboard(); }
    const now = performance.now();
    for (const entity of world.entities.values()) {
      if (typeof entity.alive !== 'boolean') continue;
      const was = this.lastAlive.get(entity.id!);
      if (was === undefined) { this.lastAlive.set(entity.id!, entity.alive); continue; }
      if (was && !entity.alive) this.broadcastMessage(new Messages.Despawn(entity.id!));
      else if (!was && entity.alive) {
        const { position, rotation, scale } = entity.transform;
        this.broadcastMessage(new Messages.Spawn(entity.id!, entity.type, position, rotation, scale, (entity as { name?: string }).name ?? ''));
        const owner = (entity as Ship).controller?.connection as Connection | undefined;
        if (owner) { this.lastStats.delete(owner.id); this.lastLoadout.delete(owner.id); }
      }
      this.lastAlive.set(entity.id!, entity.alive);
    }
    for (const id of this.lastAlive.keys()) if (!world.entities.has(id)) this.lastAlive.delete(id);
    if (++this.snapshotTick >= SNAPSHOT_INTERVAL) {
      this.snapshotTick = 0;
      const budget = { budgetBits: SNAPSHOT_BUDGET_BITS, headerBits: WORLD_HEADER_BITS, entityBits: WORLD_ENTITY_BITS };
      for (const connection of this.connections) {
        const accumulator = this.priorities.get(connection.id); if (!accumulator) continue;
        const viewer = this.ships.get(connection.id) ?? null; const changed = accumulator.select(world, budget, viewerPriority(viewer));
        if (changed.length) connection.pushMessage(new Messages.World(changed, now));
      }
    }
    for (const connection of this.connections) connection.sendOutgoingMessages();
  }
  broadcastMessage(message: OutgoingMessage, excludeId?: number): void {
    for (const connection of this.connections) if (connection.id !== excludeId) connection.pushMessage(message);
  }
}
