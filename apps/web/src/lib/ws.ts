// Minimal browser WebSocket client for the M2 event spine. Just enough to prove
// events reach the dashboard in real time (no store, no UI framework coupling).

export interface ConnectOptions {
  url?: string;
  onEvent: (event: unknown) => void;
  onStatus?: (status: 'open' | 'closed') => void;
}

function defaultWsUrl(): string {
  return 'ws://localhost:3000/ws';
}

/** Connect and stream events to `onEvent`. Returns a disconnect function. */
export function connectEvents({ url, onEvent, onStatus }: ConnectOptions): () => void {
  const target = url ?? defaultWsUrl();
  let socket: WebSocket | null = null;
  let closedByCaller = false;

  const open = () => {
    socket = new WebSocket(target);
    socket.onopen = () => onStatus?.('open');
    socket.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data));
      } catch {
        // ignore non-JSON frames
      }
    };
    socket.onclose = () => {
      onStatus?.('closed');
      if (!closedByCaller) setTimeout(open, 1000); // simple reconnect
    };
  };
  open();

  return () => {
    closedByCaller = true;
    socket?.close();
  };
}
