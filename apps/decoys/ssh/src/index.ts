import pino from 'pino';

const log = pino({ name: 'decoy-ssh' });

const port = Number(process.env.DECOY_SSH_PORT ?? 2222);

// M0 placeholder. From M3 this becomes a real ssh2 honeypot server that captures
// credentials and typed commands, then publishes deception events to NATS.
log.info({ port }, 'decoy-ssh skeleton started — not yet listening (see M3).');

setInterval(() => {}, 1 << 30);
