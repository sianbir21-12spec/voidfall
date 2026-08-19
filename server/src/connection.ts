import { performance } from 'perf_hooks';
import type WebSocket from 'ws';

import logger from './utils/logger.ts';
import Types from '../../shared/types.ts';
import Messages from '../../shared/messages.ts';
import type Server from './server.ts';

export type ClientSocket = WebSocket & { remoteAddress?: string };

export interface OutgoingMessage {
  serialize(): unknown[] | Uint8Array;
}

interface HelloMessage {
  type: unknown;
  data: { name: string };
}

type StateData = ReturnType<typeof Messages.State.deserialize>;
type FireData = ReturnType<typeof Messages.Fire.deserialize>;
type HitData = ReturnType<typeof Messages.Hit.deserialize>;
type EquipData = ReturnType<typeof Messages.Equip.deserialize>;

const MAX_PENDING_EVENTS = 128;

export default class Connection {
  id: number;
  connection: ClientSocket;
  server: Server;
  incomingMessageQueue: HelloMessage[];
  outgoingMessageQueue: OutgoingMessage[];
  latestState: StateData | null;
  fireQueue: FireData[];
  hitQueue: HitData[];
  sellRequested: boolean;
  repairRequested: boolean;
  pendingBuy: number | null;
  pendingEquip: EquipData | null;
  onCloseCallback?: () => void;

  constructor(id: number, connection: ClientSocket, server: Server) {
    this.id = id;
    this.connection = connection;
    this.server = server;

    this.incomingMessageQueue = [];
    this.outgoingMessageQueue = [];
    this.latestState = null;
    this.fireQueue = [];
    this.hitQueue = [];
    this.sellRequested = false;
    this.repairRequested = false;
    this.pendingBuy = null;
    this.pendingEquip = null;

    this.connection.on('message', (message) => {
      try {
        // High-frequency pose messages (State) arrive as bit-packed binary frames.
        if (typeof message !== 'string') {
          const buf = message as Buffer;
          if (buf.length > 0 && buf[0] !== 0x5b) {
            const bytes = Uint8Array.from(buf);
            if (bytes[0] === Types.Messages.STATE) {
              this.latestState = Messages.State.deserialize(bytes);
            }
            return;
          }
        }

        const data = JSON.parse(message as string) as unknown[];
        const type = data.shift();

        switch (type) {
          case Types.Messages.HELLO:
            if (this.incomingMessageQueue.length < MAX_PENDING_EVENTS) {
              this.incomingMessageQueue.push({
                type,
                data: Messages.Hello.deserialize(data as string[]),
              });
            }
            break;
          case Types.Messages.FIRE:
            if (this.fireQueue.length < MAX_PENDING_EVENTS) {
              this.fireQueue.push(Messages.Fire.deserialize(data as number[]));
            }
            break;
          case Types.Messages.HIT:
            if (this.hitQueue.length < MAX_PENDING_EVENTS) {
              this.hitQueue.push(Messages.Hit.deserialize(data as number[]));
            }
            break;
          case Types.Messages.PING:
            if (this.connection.readyState === 1) {
              this.connection.send(
                JSON.stringify(
                  new Messages.Pong(
                    (data as number[])[0],
                    performance.now(),
                  ).serialize(),
                ),
              );
            }
            break;
          case Types.Messages.SELL:
            this.sellRequested = true;
            break;
          case Types.Messages.REPAIR:
            this.repairRequested = true;
            break;
          case Types.Messages.BUY:
            this.pendingBuy = Messages.Buy.deserialize(data as number[]).itemId;
            break;
          case Types.Messages.EQUIP:
            this.pendingEquip = Messages.Equip.deserialize(data as number[]);
            break;
        }
      } catch (error) {
        logger.warn(
          `Invalid message from ${this.connection.remoteAddress}: ${String(error)}`,
        );
        this.close('Invalid websocket message');
      }
    });

    this.connection.on('close', () => {
      this.onCloseCallback?.();
      this.server.removeConnection(this.id);
    });
  }

  onDisconnect(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  pushMessage(message: OutgoingMessage): void {
    this.outgoingMessageQueue.push(message);
  }

  popMessage(): HelloMessage | undefined {
    return this.incomingMessageQueue.shift();
  }

  drainFire(): FireData[] {
    const fires = this.fireQueue;
    this.fireQueue = [];
    return fires;
  }

  drainHits(): HitData[] {
    const hits = this.hitQueue;
    this.hitQueue = [];
    return hits;
  }

  drainSell(): boolean {
    const requested = this.sellRequested;
    this.sellRequested = false;
    return requested;
  }

  drainRepair(): boolean {
    const requested = this.repairRequested;
    this.repairRequested = false;
    return requested;
  }

  drainBuy(): number | null {
    const itemId = this.pendingBuy;
    this.pendingBuy = null;
    return itemId;
  }

  drainEquip(): EquipData | null {
    const equip = this.pendingEquip;
    this.pendingEquip = null;
    return equip;
  }

  drainState(): StateData | null {
    const state = this.latestState;
    this.latestState = null;
    return state;
  }

  sendOutgoingMessages(): void {
    if (this.connection.readyState !== 1) {
      this.outgoingMessageQueue.length = 0;
      return;
    }

    while (this.hasOutgoingMessage() && this.connection.readyState === 1) {
      const message = this.outgoingMessageQueue.shift();
      const payload = message!.serialize();
      this.connection.send(
        payload instanceof Uint8Array ? payload : JSON.stringify(payload),
      );
    }
  }

  send(message: unknown): void {
    if (this.connection.readyState === 1) {
      this.connection.send(JSON.stringify(message));
    }
  }

  hasIncomingMessage(): boolean {
    return this.incomingMessageQueue.length > 0;
  }

  hasOutgoingMessage(): boolean {
    return this.outgoingMessageQueue.length > 0;
  }

  close(error: unknown): void {
    logger.info(
      `Closing connection to ${this.connection.remoteAddress}. Error: ${error}`,
    );
    if (this.connection.readyState !== 3) {
      this.connection.terminate();
    }
  }
}
