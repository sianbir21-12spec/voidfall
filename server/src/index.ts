import dotenv from 'dotenv';

import logger from './utils/logger.ts';
import Server, { provideWorlds } from './server.ts';
import { GameServer } from './game-server.ts';

dotenv.config();

async function main() {
  const port = Number(process.env.PORT) || 1337;
  const maxPlayers = Math.max(1, Number(process.env.MAX_PLAYERS) || 100);
  const worldCount = Math.max(1, Number(process.env.WORLDS) || 1);
  const playersPerWorld = Math.max(
    1,
    Number(process.env.PLAYERS_PER_WORLD) || maxPlayers,
  );
  const maxConnections = worldCount * playersPerWorld;

  const server = new Server(port, maxConnections);
  const worlds: GameServer[] = [];

  server.onConnection((connection) => {
    logger.debug('New connection');

    for (const world of worlds) {
      if (world.connectedClients < world.maxClients) {
        world.handlePlayerConnect(connection);
        return;
      }
    }

    // A race can occur if every world fills between the socket accept and this
    // callback. Do not leave an unassigned connection hanging around.
    connection.close('All game worlds are full');
  });

  server.onError((error) => {
    logger.error(error);
  });

  for (let i = 0; i < worldCount; ++i) {
    const world = new GameServer(
      `world${i}`,
      playersPerWorld,
      server,
    );
    world.init().catch((error) => {
      logger.error(`Failed to initialize ${world.id}: ${error}`);
      process.exitCode = 1;
    });
    worlds.push(world);
  }

  // Expose the lobby/player census at GET /api/players.
  provideWorlds(() => worlds);
}

main().catch((error) => {
  logger.error(`Fatal server startup error: ${error}`);
  process.exitCode = 1;
});
