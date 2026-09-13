export {};

/**
 * T040 — configurable load harness.
 *
 * This runner deliberately does not spoof source addresses. For a genuine
 * multi-source run, pass `--sources` as a comma-separated list of approved
 * egress/proxy endpoints (or run one copy from each source host). The report
 * keeps source identity, status, errors, and latency percentiles separate so
 * a single healthy source cannot hide a failing one.
 *
 * Example:
 *   pnpm load:test -- --url http://localhost:3001/health --concurrency 60 --duration-ms 30000
 *   pnpm load:test -- --url https://staging.example/health --sources https://egress-a,https://egress-b
 */

interface Options {
  readonly url: string;
  readonly concurrency: number;
  readonly durationMs: number;
  readonly timeoutMs: number;
  readonly sources: readonly string[];
}

interface Sample {
  readonly source: string;
  readonly ok: boolean;
  readonly status: number | null;
  readonly latencyMs: number;
  readonly error?: string;
}

function option(args: readonly string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function positive(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}

function parseOptions(args: readonly string[]): Options {
  const url = option(args, '--url', process.env['LOAD_TEST_URL']);
  if (url === undefined || url.trim() === '')
    throw new Error('--url or LOAD_TEST_URL is required.');
  const sourceText = option(args, '--sources', process.env['LOAD_TEST_SOURCES']) ?? 'direct';
  const sources = sourceText
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    url,
    concurrency: positive(
      '--concurrency',
      option(args, '--concurrency', process.env['LOAD_TEST_CONCURRENCY']),
      20,
    ),
    durationMs: positive(
      '--duration-ms',
      option(args, '--duration-ms', process.env['LOAD_TEST_DURATION_MS']),
      30_000,
    ),
    timeoutMs: positive(
      '--timeout-ms',
      option(args, '--timeout-ms', process.env['LOAD_TEST_TIMEOUT_MS']),
      10_000,
    ),
    sources: sources.length === 0 ? ['direct'] : sources,
  };
}

async function one(url: string, source: string, timeoutMs: number): Promise<Sample> {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: { 'x-load-source': source },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      source,
      ok: response.ok,
      status: response.status,
      latencyMs: performance.now() - started,
    };
  } catch (error) {
    return {
      source,
      ok: false,
      status: null,
      latencyMs: performance.now() - started,
      error: error instanceof Error ? error.name : 'UNKNOWN',
    };
  }
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

async function run(options: Options): Promise<readonly Sample[]> {
  const samples: Sample[] = [];
  const deadline = Date.now() + options.durationMs;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (Date.now() < deadline) {
      const source = options.sources[cursor++ % options.sources.length] ?? 'direct';
      samples.push(await one(options.url, source, options.timeoutMs));
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  return samples;
}

function report(options: Options, samples: readonly Sample[]): void {
  const bySource = new Map<string, Sample[]>();
  for (const sample of samples)
    bySource.set(sample.source, [...(bySource.get(sample.source) ?? []), sample]);
  const summary = [...bySource.entries()].map(([source, rows]) => ({
    source,
    requests: rows.length,
    errors: rows.filter((row) => !row.ok).length,
    errorRate: rows.length === 0 ? 0 : rows.filter((row) => !row.ok).length / rows.length,
    p50Ms: percentile(
      rows.map((row) => row.latencyMs),
      50,
    ),
    p95Ms: percentile(
      rows.map((row) => row.latencyMs),
      95,
    ),
    p99Ms: percentile(
      rows.map((row) => row.latencyMs),
      99,
    ),
    statuses: Object.fromEntries(
      [...new Set(rows.map((row) => row.status).filter((s) => s !== null))].map((status) => [
        String(status),
        rows.filter((row) => row.status === status).length,
      ]),
    ),
  }));
  process.stdout.write(
    `${JSON.stringify({ target: options.url, concurrency: options.concurrency, durationMs: options.durationMs, totalRequests: samples.length, sources: summary }, null, 2)}\n`,
  );
}

try {
  const options = parseOptions(process.argv.slice(2));
  report(options, await run(options));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
