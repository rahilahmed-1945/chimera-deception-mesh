// Minimal browser WebSocket client for the M2 event spine. Just enough to prove
// events reach the dashboard in real time (no store, no UI framework coupling).

export interface ConnectOptions {
  url?: string;
  onEvent: (event: unknown) => void;
  onStatus?: (status: 'open' | 'closed') => void;
}

// Resolve the WebSocket URL from the environment (VITE_API_URL). The dev value
// lives in apps/web/.env.development; set VITE_API_URL at build time for
// production. http(s) -> ws(s), path /ws. Falls back to the current origin so
// no host is hardcoded.
function defaultWsUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) {
    const u = new URL(apiUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws';
    u.search = '';
    return u.toString();
  }
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`;
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
