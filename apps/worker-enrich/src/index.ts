import pino from 'pino';

const log = pino({ name: 'worker-enrich' });

// M0 placeholder. From M5 this process consumes deception events from NATS and
// enriches them (GeoIP, reputation, MITRE mapping, transcript -> object storage).
log.info('worker-enrich skeleton started — no consumers wired yet (see M5).');

// Keep the process alive so it behaves like the long-running worker it will become.
setInterval(() => {}, 1 << 30);
