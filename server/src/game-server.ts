import { performance } from 'perf_hooks';
import { Vector3 } from 'three';
import logger from './utils/logger.ts';
import Utils from '../../shared/utils.ts';
import { World } from '../../shared/sim/world.ts';
import { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';
import { NodeMeshProvider } from './physics/node-mesh-provider.ts';
import { NetworkServer } from './net/network-server.ts';
import { BotManager } from './ai/bot-manager.ts';
import { RespawnSubsystem } from '../../shared/sim/subsystems/respawn.ts';
import { CombatSubsystem } from '../../shared/sim/subsystems/combat.ts';
import { awardKill } from '../../shared/sim/progression.ts';
import { KILL_REWARD } from '../../shared/sim/combat-economy.ts';
import type { Ship } from '../../shared/sim/entities/ship.ts';
import { Vendor } from '../../shared/sim/entities/vendor.ts';
import type { PhysicsWorld } from '../../shared/sim/physics/physics-world.ts';
import type { Entity } from '../../shared/sim/entity.ts';
import type Server from './server.ts';
import type Connection from './connection.ts';

export class GameServer {
  id: string; maxClients: number; connectedClients: number; server: Server;
  updatesPerSecond: number; lastTime: number; world: World; physics: PhysicsWorld;
  network: NetworkServer; bots: BotManager; combat: CombatSubsystem;
  fixedUpdate!: (delta: number) => number;

  constructor(id: string, maxClients: number, server: Server,
    physicsWorld: PhysicsWorld = new RapierPhysicsWorld(new NodeMeshProvider())) {
    this.id = id; this.maxClients = maxClients; this.connectedClients = 0; this.server = server;
    this.updatesPerSecond = Math.max(20, Math.min(60, Number(process.env.UPDATES_PER_SECOND) || 60));
    this.lastTime = performance.now(); this.world = new World();
    this.physics = physicsWorld; this.world.physics = this.physics;
    this.network = new NetworkServer(this); this.bots = new BotManager(this);
    this.world.onSpawn = (entity: Entity) => { this.physics.add(entity); this.network.onEntitySpawned(entity); };
    this.world.onDespawn = (entity: Entity) => { this.physics.remove(entity); this.network.onEntityDespawned(entity); };
    this.combat = new CombatSubsystem();
    this.world.addSubsystem(new RespawnSubsystem()).addSubsystem(this.combat);
    logger.info(`${this.id} running`);
  }

  async init(): Promise<void> {
    await this.physics.init();
    // Mining/asteroid gameplay has been removed. The vendor remains as the armory.
    this.spawnVendor(); this.bots.reconcile(0);
    this.fixedUpdate = Utils.createFixedTimestep(1000 / this.updatesPerSecond, this.handleFixedUpdate.bind(this));
    setInterval(this.update.bind(this), 1000 / this.updatesPerSecond);
    logger.info(`${this.id} simulation started (${this.updatesPerSecond} Hz combat)`);
  }
  update(): void { const time = performance.now(); let delta = time - this.lastTime; if (delta > 250) delta = 250; this.fixedUpdate(delta); this.lastTime = time; }
  handleFixedUpdate(delta: number, time: number): void { this.tick(delta, time); }
  tick(dt: number, time: number): void {
    this.network.processIncoming(this.world, time); this.bots.reconcile(time); this.bots.update(this.world, dt, time);
    for (const e of [...this.world.entities.values()]) e.update(dt, this.world, time);
    this.physics.applyAll?.(this.world, dt); this.physics.step(dt); this.physics.sweepProjectiles?.(this.world, dt);
    for (const s of this.world.subsystems) s.update(this.world, dt, time);
    this.awardKills(); this.world.reap(); this.network.broadcast(this.world, time);
  }
  awardKills(): void {
    for (const kill of this.combat.drainKills()) {
      if (kill.killerId === null || kill.killerId === kill.victimId) continue;
      const killer = this.world.get(kill.killerId) as Ship | undefined;
      if (!killer || killer.alive === false) continue;
      awardKill(killer, kill.victimLevel);
      killer.credits += KILL_REWARD;
    }
  }
  handlePlayerConnect(connection: Connection): void { this.connectedClients++; this.network.addConnection(connection); logger.debug(`Adding player${connection.id} to ${this.id}`); }
  spawnVendor(): void { this.world.spawn(new Vendor({ transform: { position: new Vector3(3000, 0, 0) } })); }
}
