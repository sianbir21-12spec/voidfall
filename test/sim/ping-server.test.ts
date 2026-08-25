import assert from 'node:assert/strict';
import Types from '../../shared/types.ts';
import Messages from '../../shared/messages.ts';
import Connection from '../../server/src/connection.ts';
import { test } from './harness.ts';

// A minimal fake ws socket: captures registered handlers and sent payloads.
function fakeSocket() {
  const handlers: Record<string, (arg: unknown) => void> = {};
  const sent: unknown[][] = [];
  return {
    readyState: 1,
    on(event: string, cb: (arg: unknown) => void) {
      handlers[event] = cb;
    },
    send(data: string) {
      sent.push(JSON.parse(data));
    },
    emit(event: string, arg: unknown) {
      handlers[event]?.(arg);
    },
    sent,
  };
}

test('server answers a PING immediately with a PONG echoing sentTime + a server clock', () => {
  const socket = fakeSocket();
  // biome-ignore lint/suspicious/noExplicitAny: fake socket/server stubs
  new Connection(1, socket as any, {} as any);

  socket.emit('message', JSON.stringify(new Messages.Ping(555).serialize()));

  assert.equal(socket.sent.length, 1);
  const [type, sentTime, serverTime] = socket.sent[0] as number[];
  assert.equal(type, Types.Messages.PONG);
  assert.equal(sentTime, 555);
  assert.equal(typeof serverTime, 'number');
  assert.ok(serverTime > 0);
});
