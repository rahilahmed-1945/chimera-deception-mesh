import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';

// Minimal structural view of a live socket (avoids a direct `ws` type dep).
interface WsClient {
  send(data: string): void;
  on(event: string, listener: () => void): void;
}

const clients = new Set<WsClient>();

/** Register the WebSocket plugin and the /ws endpoint. */
export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);
  app.get('/ws', { websocket: true }, (socket: WsClient) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
}

/** Fan a persisted event out to every connected dashboard. */
export function broadcast(event: unknown): void {
  const data = JSON.stringify(event);
  for (const client of clients) {
    try {
      client.send(data);
    } catch (err) {
      console.error('[ws] send failed; dropping client', err);
      clients.delete(client);
    }
  }
}
