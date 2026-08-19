import dotenv from 'dotenv';

import logger from './utils/logger.ts';
import Server, { provideWorlds } from './server.ts';
import { GameServer } from './game-server.ts';

dotenv.config();

function main() {
  const port = Number(process.env.PORT) || 1337;
  const maxPlayers = Number(process.env.MAX_PLAYERS) || 100;

  const server = new Server(port, maxPlayers);
  const worlds: GameServer[] = [];

  server.onConnection((connection) => {
    logger.debug('New connection');

    for (const world of worlds) {
      if (world.connectedClients < world.maxClients) {
        world.handlePlayerConnect(connection);
        return;
      }
    }
  });

  server.onError((error) => {
    logger.error(error);
  });

  const worldCount = Number(process.env.WORLDS) || 1;
  const playersPerWorld = Number(process.env.PLAYERS_PER_WORLD) || maxPlayers;

  for (let i = 0; i < worldCount; ++i) {
    const world = new GameServer(
      `world${i}`,
      playersPerWorld,
      server,
    );
    world.init();
    worlds.push(world);
  }

  // Expose the lobby/player census at GET /api/players.
  provideWorlds(() => worlds);
}

main();
