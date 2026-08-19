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
import { MiningSubsystem } from '../../shared/sim/subsystems/mining.ts';
import { awardKill } from '../../shared/sim/progression.ts';
import type { Ship } from '../../shared/sim/entities/ship.ts';
import { Asteroid } from '../../shared/sim/entities/asteroid.ts';
import { Vendor } from '../../shared/sim/entities/vendor.ts';

import type { PhysicsWorld } from '../../shared/sim/physics/physics-world.ts';
import type { Entity } from '../../shared/sim/entity.ts';
import type Server from './server.ts';
import type Connection from './connection.ts';

export class GameServer {
  id: string;
  maxClients: number;
  connectedClients: number;
  server: Server;
  updatesPerSecond: number;
  lastTime: number;
  asteroidFieldSize: number;
  world: World;
  physics: PhysicsWorld;
  network: NetworkServer;
  bots: BotManager;
  mining: MiningSubsystem;
  combat: CombatSubsystem;
  fixedUpdate!: (delta: number) => number;

  constructor(
    id: string,
    maxClients: number,
    server: Server,
    physicsWorld: PhysicsWorld = new RapierPhysicsWorld(new NodeMeshProvider()),
  ) {
    this.id = id;
    this.maxClients = maxClients;
    this.connectedClients = 0;
    this.server = server;
    this.updatesPerSecond = Math.max(
      20,
      Math.min(60, Number(process.env.UPDATES_PER_SECOND) || 60),
    );
    this.lastTime = performance.now();

    this.asteroidFieldSize = 4000;

    this.world = new World();
    this.physics = physicsWorld;
    this.world.physics = this.physics;

    // NetworkServer owns connections and broadcasts snapshots.
    this.network = new NetworkServer(this);

    // BotManager tops the world up to a target headcount with AI ships.
    this.bots = new BotManager(this);

    // RapierPhysicsWorld creates/removes bodies on spawn/despawn; NetworkServer
    // broadcasts the matching Spawn/Despawn to clients.
    this.world.onSpawn = (entity: Entity) => {
      this.physics.add(entity);
      this.network.onEntitySpawned(entity);
    };
    this.world.onDespawn = (entity: Entity) => {
      this.physics.remove(entity);
      this.network.onEntityDespawned(entity);
    };

    this.mining = new MiningSubsystem();
    this.combat = new CombatSubsystem();
    this.world
      .addSubsystem(new RespawnSubsystem())
      .addSubsystem(this.combat)
      .addSubsystem(this.mining);

    logger.info(`${this.id} running`);
  }

  async init(): Promise<void> {
    await this.physics.init();
    const asteroidCount = Math.max(
      50,
      Math.min(1000, Number(process.env.ASTEROID_COUNT) || 500),
    );
    this.spawnAsteroids(asteroidCount);
    this.spawnVendor();
    this.bots.reconcile(0);

    this.fixedUpdate = Utils.createFixedTimestep(
      1000 / this.updatesPerSecond,
      this.handleFixedUpdate.bind(this),
    );
    setInterval(this.update.bind(this), 1000 / this.updatesPerSecond);

    logger.info(
      `${this.id} simulation started (${asteroidCount} asteroids, ${this.updatesPerSecond} Hz)`,
    );
  }

  update(): void {
    const time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.fixedUpdate(delta);
    this.lastTime = time;
  }

  handleFixedUpdate(delta: number, time: number): void {
    this.tick(delta, time);
  }

  tick(dt: number, time: number): void {
    this.network.processIncoming(this.world, time);
    this.bots.reconcile(time);
    this.bots.update(this.world, dt, time);

    for (const e of [...this.world.entities.values()]) {
      e.update(dt, this.world, time);
    }

    this.physics.applyAll?.(this.world, dt);
    this.physics.step(dt);
    this.physics.sweepProjectiles?.(this.world, dt);

    for (const s of this.world.subsystems) {
      s.update(this.world, dt, time);
    }

    this.awardKills();
    this.physics.syncAsteroidScales?.(this.world);
    this.network.broadcastSpawned(this.mining.drainSpawned());
    this.network.broadcastCollected(this.mining.drainCollected());
    this.world.reap();
    this.network.broadcast(this.world, time);
  }

  awardKills(): void {
    for (const kill of this.combat.drainKills()) {
      if (kill.killerId === null || kill.killerId === kill.victimId) {
        continue;
      }
      const killer = this.world.get(kill.killerId) as Ship | undefined;
      if (!killer || killer.alive === false) {
        continue;
      }
      awardKill(killer, kill.victimLevel);
    }
  }

  handlePlayerConnect(connection: Connection): void {
    logger.debug(`Adding player${connection.id} to ${this.id}`);
    this.connectedClients++;
    this.network.addConnection(connection);
  }

  spawnAsteroids(count: number): void {
    const rng = Utils.randomNumberGenerator(1);

    for (let i = 0; i < count; ++i) {
      const position = Utils.getRandomPosition(this.asteroidFieldSize, rng);
      const rotation = Utils.getRandomQuaternion(rng);
      const scaleValue = [10, 20, 40, 60, 120 /*240, /*560*/];
      const scale = scaleValue[Math.floor(rng() * scaleValue.length)];

      this.world.spawn(
        new Asteroid({ transform: { position, rotation }, scale }),
      );
    }
  }

  spawnVendor(): void {
    this.world.spawn(
      new Vendor({ transform: { position: new Vector3(3000, 0, 0) } }),
    );
  }
}
