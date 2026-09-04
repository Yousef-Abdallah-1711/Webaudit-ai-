/**
 * T231 — FR-091: "System MUST ... MUST NOT reveal [credentials] in logs,
 * error messages, or AI prompts."
 *
 * `createLogger` is a thin structured wrapper around `@webaudit/redaction`'s
 * `redactText`, so this suite proves the wrapper actually calls it on every
 * emitted line (not just that `redactText` itself works — that guarantee
 * already has its own adverse suite at `packages/redaction/tests/adverse/
 * redaction.test.ts`) and that the output is a stable, parseable JSON shape.
 * Planted credential values are reused verbatim from that suite for
 * consistency, and the negative-control assertion mirrors its own concern:
 * over-redaction is a real cost here too, not a free safety margin.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { createLogger } from '../src/logger.js';

// Reused from packages/redaction/tests/adverse/redaction.test.ts's PLANTED
// fixtures, for consistency with this repo's one canonical set of
// credential-shaped test values.
const GITHUB_PAT = 'ghp_A1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvWxYz';
const STRIPE_LIVE_KEY = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';

interface CapturedLine {
  readonly stream: 'stdout' | 'stderr';
  readonly raw: string;
}

function captureWrites(): { lines: CapturedLine[]; restore: () => void } {
  const lines: CapturedLine[] = [];
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown): boolean => {
      lines.push({ stream: 'stdout', raw: String(chunk) });
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown): boolean => {
      lines.push({ stream: 'stderr', raw: String(chunk) });
      return true;
    });
  return {
    lines,
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

function parseOnly(lines: CapturedLine[]): unknown {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!.raw) as unknown;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger - FR-091 redacted sink', () => {
  it('never lets a planted credential in the message survive to the output line', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.info(`token issued: ${GITHUB_PAT}`);
    } finally {
      capture.restore();
    }

    const serialised = capture.lines.map((l) => l.raw).join('\n');
    expect(serialised).not.toContain(GITHUB_PAT);
    expect(serialised).toContain('[[REDACTED:GITHUB_TOKEN]]');
  });

  it('never lets a planted credential in a field value survive to the output line', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.error('provider call failed', { apiKey: STRIPE_LIVE_KEY });
    } finally {
      capture.restore();
    }

    const serialised = capture.lines.map((l) => l.raw).join('\n');
    expect(serialised).not.toContain(STRIPE_LIVE_KEY);
    expect(serialised).toContain('[[REDACTED:STRIPE_SECRET_KEY]]');
  });

  it('redacts a planted credential nested inside a field object', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.warn('upstream response', {
        response: { headers: { authorization: `Bearer ${GITHUB_PAT}` } },
      });
    } finally {
      capture.restore();
    }

    const serialised = capture.lines.map((l) => l.raw).join('\n');
    expect(serialised).not.toContain(GITHUB_PAT);
  });

  it('redacts a planted credential nested inside a field array', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.warn('captured secrets', { values: ['fine', STRIPE_LIVE_KEY] });
    } finally {
      capture.restore();
    }

    const serialised = capture.lines.map((l) => l.raw).join('\n');
    expect(serialised).not.toContain(STRIPE_LIVE_KEY);
  });

  it('emits exactly one parseable JSON line with the documented shape', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.info('scan started', { scanId: 'scan_123' });
    } finally {
      capture.restore();
    }

    const parsed = parseOnly(capture.lines) as Record<string, unknown>;
    expect(typeof parsed['timestamp']).toBe('string');
    expect(() => new Date(parsed['timestamp'] as string)).not.toThrow();
    expect(Number.isNaN(new Date(parsed['timestamp'] as string).getTime())).toBe(false);
    expect(parsed['level']).toBe('info');
    expect(parsed['service']).toBe('test-service');
    expect(parsed['message']).toBe('scan started');
    expect(parsed['scanId']).toBe('scan_123');
  });

  it('routes debug and info to stdout, warn and error to stderr', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
    } finally {
      capture.restore();
    }

    expect(capture.lines.map((l) => l.stream)).toEqual(['stdout', 'stdout', 'stderr', 'stderr']);
  });

  it('does not let a field named like a core key overwrite the real value', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.info('hello', { level: 'FORGED', service: 'FORGED', timestamp: 'FORGED' });
    } finally {
      capture.restore();
    }

    const parsed = parseOnly(capture.lines) as Record<string, unknown>;
    expect(parsed['level']).toBe('info');
    expect(parsed['service']).toBe('test-service');
    expect(parsed['timestamp']).not.toBe('FORGED');
  });

  it('leaves a benign message and fields completely unchanged', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.info('scan completed successfully', {
        scanId: 'scan_abc123',
        durationMs: 4213,
        areasRun: ['SECURITY', 'SEO'],
        success: true,
        note: null,
      });
    } finally {
      capture.restore();
    }

    const parsed = parseOnly(capture.lines) as Record<string, unknown>;
    expect(parsed['message']).toBe('scan completed successfully');
    expect(parsed['scanId']).toBe('scan_abc123');
    expect(parsed['durationMs']).toBe(4213);
    expect(parsed['areasRun']).toEqual(['SECURITY', 'SEO']);
    expect(parsed['success']).toBe(true);
    expect(parsed['note']).toBeNull();
  });

  it('leaves an ordinary nested object untouched', () => {
    const capture = captureWrites();
    const logger = createLogger('test-service');
    try {
      logger.info('request handled', {
        request: { method: 'GET', path: '/health', headers: { 'user-agent': 'curl/8.0' } },
      });
    } finally {
      capture.restore();
    }

    const parsed = parseOnly(capture.lines) as Record<string, unknown>;
    expect(parsed['request']).toEqual({
      method: 'GET',
      path: '/health',
      headers: { 'user-agent': 'curl/8.0' },
    });
  });
});
