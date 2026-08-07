import pino from 'pino';

const log = pino({ name: 'decoy-http' });

const port = Number(process.env.DECOY_HTTP_PORT ?? 8080);

// M0 placeholder. From M6 this becomes a convincing fake admin panel that
// captures requests/paths/payloads and publishes deception events to NATS.
log.info({ port }, 'decoy-http skeleton started — not yet listening (see M6).');

setInterval(() => {}, 1 << 30);
