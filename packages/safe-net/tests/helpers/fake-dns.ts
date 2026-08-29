/**
 * A real DNS server, on UDP, answering from a script.
 *
 * The rebinding case (T046) cannot be demonstrated with a stubbed resolver: the
 * whole point is that two *separate* DNS queries — one made by the resolve
 * guard, one made by the kernel-level connect — get different answers. That
 * needs a resolver that changes its mind between queries, which is a server,
 * not a mock.
 *
 * Answers are scripted per hostname. Each query consumes the next address in
 * that hostname's list; the final entry repeats for every later query, so a
 * two-entry script means "public once, then private for ever".
 */

import { createSocket, type Socket } from 'node:dgram';
import { Resolver } from 'node:dns/promises';
import { isIPv4 } from 'node:net';

const TYPE_A = 1;
const CLASS_IN = 1;
/** QR | RD | RA, rcode NOERROR. */
const FLAGS_ANSWER = 0x8180;
/** NXDOMAIN, for a name the script does not cover. */
const FLAGS_NXDOMAIN = 0x8183;

export interface FakeDnsServer {
  readonly port: number;
  /** Every question received, in order, as `name/TYPE`. */
  readonly queries: readonly string[];
  close(): Promise<void>;
}

interface Question {
  readonly name: string;
  readonly type: number;
  /** Byte offset just past the question section. */
  readonly end: number;
}

function readQuestion(msg: Buffer): Question | null {
  const labels: string[] = [];
  let offset = 12;
  for (;;) {
    if (offset >= msg.length) return null;
    const len = msg[offset]!;
    if (len === 0) {
      offset += 1;
      break;
    }
    // Pointers are legal in answers, never in a question we generated.
    if (len > 63 || offset + 1 + len > msg.length) return null;
    labels.push(msg.subarray(offset + 1, offset + 1 + len).toString('ascii'));
    offset += 1 + len;
  }
  if (offset + 4 > msg.length) return null;
  return { name: labels.join('.'), type: msg.readUInt16BE(offset), end: offset + 4 };
}

function buildAnswer(msg: Buffer, question: Question, addresses: readonly string[]): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(msg.readUInt16BE(0), 0);
  header.writeUInt16BE(addresses.length > 0 ? FLAGS_ANSWER : FLAGS_NXDOMAIN, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(addresses.length, 6);

  const records = addresses.map((address) => {
    const record = Buffer.alloc(16);
    // Compression pointer back to the question name at offset 12.
    record.writeUInt16BE(0xc00c, 0);
    record.writeUInt16BE(TYPE_A, 2);
    record.writeUInt16BE(CLASS_IN, 4);
    // TTL 0: nothing downstream may cache an answer this server intends to change.
    record.writeUInt32BE(0, 6);
    record.writeUInt16BE(4, 10);
    const octets = address.split('.').map((o) => Number(o));
    for (let i = 0; i < 4; i += 1) record.writeUInt8(octets[i]!, 12 + i);
    return record;
  });

  return Buffer.concat([header, msg.subarray(12, question.end), ...records]);
}

/**
 * @param script hostname -> the addresses to hand out, one per query, last repeating.
 */
export async function startFakeDns(
  script: Record<string, readonly string[]>,
): Promise<FakeDnsServer> {
  for (const [name, addresses] of Object.entries(script)) {
    if (addresses.length === 0) throw new Error(`fake DNS: empty script for ${name}`);
    for (const address of addresses) {
      if (!isIPv4(address)) throw new Error(`fake DNS: ${address} is not an IPv4 literal`);
    }
  }

  const remaining = new Map<string, string[]>(
    Object.entries(script).map(([name, addresses]) => [name.toLowerCase(), [...addresses]]),
  );
  const queries: string[] = [];
  const socket: Socket = createSocket('udp4');

  socket.on('message', (msg, remote) => {
    const question = readQuestion(msg);
    if (question === null) return;
    queries.push(`${question.name}/${question.type}`);

    let addresses: readonly string[] = [];
    if (question.type === TYPE_A) {
      const queue = remaining.get(question.name.toLowerCase());
      if (queue !== undefined) {
        // Hold the last answer: the script says what changes, not how often it is asked.
        addresses = queue.length > 1 ? [queue.shift()!] : [queue[0]!];
      }
    }
    socket.send(buildAnswer(msg, question, addresses), remote.port, remote.address);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => resolve());
  });

  const { port } = socket.address();
  return {
    port,
    queries,
    close: () => new Promise<void>((resolve) => socket.close(() => resolve())),
  };
}

/** A resolver that asks only the fake server — never the machine's real DNS. */
export function resolverFor(server: FakeDnsServer): Resolver {
  const resolver = new Resolver();
  resolver.setServers([`127.0.0.1:${server.port}`]);
  return resolver;
}
