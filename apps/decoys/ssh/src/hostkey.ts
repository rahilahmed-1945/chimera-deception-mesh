import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ssh2 from 'ssh2';

const here = dirname(fileURLToPath(import.meta.url)); // apps/decoys/ssh/src
const DEFAULT_PATH = resolve(here, '..', '.hostkey', 'ssh_host_ed25519_key');

/**
 * Load the SSH host key, generating and persisting one on first run so the
 * decoy presents a stable identity across restarts. The key is stored locally
 * (gitignored) and never committed. Override the location with SSH_HOST_KEY_PATH.
 */
export function loadHostKey(): string {
  const path = process.env.SSH_HOST_KEY_PATH ?? DEFAULT_PATH;
  if (existsSync(path)) {
    return readFileSync(path, 'utf8');
  }
  const { private: privateKey } = ssh2.utils.generateKeyPairSync('ed25519');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, privateKey, { mode: 0o600 });
  return privateKey;
}
