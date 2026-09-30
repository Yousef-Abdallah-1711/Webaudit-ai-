/**
 * The full production pipeline, run in-process.
 *
 * This is the "most faithful to production" path from the audit-engine choice:
 * it boots the real `startApi` + `startWorker` (Express API, BullMQ queue, the
 * five-phase orchestrator, the module runner, realtime fan-out, workspace
 * lifecycle) against Postgres :5442 + Redis :6389, registers a user over HTTP,
 * creates a real `Scan` row, and lets the orchestrator drive it to COMPLETED —
 * exactly like `apps/web/tests/e2e/first-audit.spec.ts`, but against the live
 * URL with all five areas.
 *
 * Known limitation carried from the product (PROGRESS.md): the orchestrator's
 * `makeContext` wires no `pageProvider`, so `ctx.withPage` checks (Core Web
 * Vitals, page weight, layout overflow) are inert here. That is why the
 * standalone `runner.ts` — which does wire a real browser — is the primary
 * engine for the showcase. This script exists to show the real pipeline
 * produces the same measured findings for everything that does not need a page.
 *
 * Output: data/pipeline-report.json
 *
 * Env: DATABASE_URL (showcase DB), REDIS_URL, run with AI_MODE=fixtures.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';
process.env['ALLOW_INSECURE_DEV_SECRETS'] ??= 'true';
process.env['WORKSPACE_BASE_DIR'] ??= join(tmpdir(), 'webaudit-showcase-workspaces');
process.env['REDIS_URL'] ??= 'redis://localhost:6389';
process.env['DATABASE_URL'] ??=
  'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_showcase?schema=public';

const { PrismaClient } = await import('@webaudit/api/prisma-client');
const { startApi } = await import('@webaudit/api');
const { startWorker } = await import('@webaudit/worker');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'data', 'pipeline-report.json');
const TARGET = process.argv[2] ?? 'https://app.esaalnybot.tech/';
const MODULES = ['SECURITY', 'SEO', 'PERFORMANCE', 'UI', 'TESTING'];
const CREDS = { email: `showcase-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = new PrismaClient({ log: ['error'] }) as any;

async function main(): Promise<void> {
  process.stdout.write(`\n  full pipeline — ${TARGET}\n  modules: ${MODULES.join(', ')}\n\n`);

  await db.plan.upsert({
    where: { id: 'free' },
    create: {
      id: 'free',
      name: 'Free',
      monthlyCredits: 100_000, // showcase: enough for a full 5-area audit
      creditsRecur: false,
      allowedInputTypes: ['URL'],
      allowLoadGeneration: false,
      allowReadinessPass: false,
      allowCreditPurchase: false,
      allowCustomCapability: false,
      concurrentScanLimit: 1,
      queuePriority: 40,
      retentionDays: 7,
    },
    update: { monthlyCredits: 100_000 },
  });

  // (The `module-ai:<module>` FK gap this run originally surfaced — review
  // finding C1 — is now fixed in the product: `startApi` -> `reconcile
  // CapabilitiesAtBoot` -> `ensurePlatformCapabilities` creates those rows.
  // No workaround seed needed here any more.)

  const api = await startApi({ db, port: 0, installSignalHandlers: false });
  const worker = startWorker({
    connection: { url: process.env['REDIS_URL']!, maxRetriesPerRequest: null },
    db,
    installSignalHandlers: false,
  });
  const base = `http://127.0.0.1:${String(api.port)}`;

  const started = Date.now();
  try {
    const reg = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CREDS),
    });
    if (reg.status !== 201) throw new Error(`register: ${reg.status} ${await reg.text()}`);
    const user = await db.user.update({
      where: { email: CREDS.email },
      data: { emailVerifiedAt: new Date() },
    });

    // Full 5-area audit costs 80; the free grant is 50. Top up with a
    // never-expiring PURCHASED lot so the pipeline can run all five.
    await db.creditLot.create({
      data: {
        userId: user.id,
        kind: 'PURCHASED',
        source: 'PURCHASE',
        amountGranted: 500,
        amountRemaining: 500,
        expiresAt: null,
      },
    });

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CREDS),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const auth = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };

    const targetRes = await fetch(`${base}/targets`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ inputType: 'URL', value: TARGET }),
    });
    if (targetRes.status !== 201) throw new Error(`target: ${targetRes.status} ${await targetRes.text()}`);
    const { target } = (await targetRes.json()) as { target: { id: string } };

    const quoteRes = await fetch(`${base}/scans/quote`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ targetId: target.id, modules: MODULES }),
    });
    const { quote } = (await quoteRes.json()) as { quote: { credits: number } };
    process.stdout.write(`  quote: ${quote.credits} credits\n`);

    const scanRes = await fetch(`${base}/scans`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ targetId: target.id, modules: MODULES, acceptedQuote: quote.credits }),
    });
    if (scanRes.status !== 201) throw new Error(`scan: ${scanRes.status} ${await scanRes.text()}`);
    const { scan } = (await scanRes.json()) as { scan: { id: string } };
    process.stdout.write(`  scan ${scan.id} created — polling...\n`);

    // Poll the DB directly, NOT the HTTP API: code-layer.ts poisons
    // globalThis.fetch process-wide while a module runs (its own documented
    // caveat), and this script shares the worker's process — an HTTP fetch mid-run
    // throws the poison error. A real deployment has the API in a separate process.
    const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
    let state = 'QUEUED';
    const deadline = Date.now() + 180_000;
    while (!terminal.has(state) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const row = await db.scan.findUnique({ where: { id: scan.id }, select: { state: true } });
      state = row?.state ?? state;
      process.stdout.write(`\r  state: ${state.padEnd(20)}`);
    }
    process.stdout.write(`\n`);

    const scanRow = await db.scan.findUnique({
      where: { id: scan.id },
      include: {
        moduleResults: {
          select: { module: true, state: true, score: true, summary: true, degradedReason: true, skippedReason: true },
        },
        issues: {
          select: {
            severity: true,
            title: true,
            checkId: true,
            attribution: true,
            fingerprint: true,
            location: true,
            fixPrompt: true,
            moduleResult: { select: { module: true } },
          },
          orderBy: [{ severity: 'asc' }],
        },
      },
    });
    const report = {
      score: scanRow?.overallScore ?? null,
      summary: scanRow?.summary ?? null,
      areas: scanRow?.moduleResults ?? [],
      issues: scanRow?.issues ?? [],
    };

    const executions = await db.capabilityExecution.findMany({
      where: { scanId: scan.id },
      select: {
        capabilityId: true,
        module: true,
        succeeded: true,
        findingCount: true,
        durationMs: true,
        skippedReason: true,
        errorMessage: true,
        costMicros: true,
      },
      orderBy: [{ module: 'asc' }, { capabilityId: 'asc' }],
    });

    const doc = {
      meta: {
        target: TARGET,
        modules: MODULES,
        finalState: state,
        durationMs: Date.now() - started,
        engine: 'full pipeline: startApi + startWorker + Postgres + Redis + BullMQ + 5-phase orchestrator (AI_MODE=fixtures)',
        note: 'ctx.withPage is not wired in the product orchestrator, so CWV / page-weight / layout checks are inert here — see data/audit.json (standalone runner) for the browser-backed measurements.',
      },
      report,
      executions,
    };
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    process.stdout.write(`\n  final state: ${state}\n  written: ${OUT}\n`);
  } finally {
    await worker.shutdown('showcase done').catch(() => undefined);
    await api.shutdown('showcase done').catch(() => undefined);
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error('\n', e);
  process.exit(1);
});
