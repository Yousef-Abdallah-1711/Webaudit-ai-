/**
 * Enum drift guard — `packages/types/src/domain.ts` vs `apps/api/prisma/schema.prisma`.
 *
 * `domain.ts` hand-declares every enum instead of re-exporting the generated
 * Prisma client, and that is the right call: `apps/web` must not pull in the
 * database layer to render a severity badge, and `sandbox-runner` has no
 * database credentials at all by design (R1). The price of that decision is
 * that the two lists can drift apart silently — add a `ScanState` to the schema
 * and nothing anywhere complains that the frontend cannot name it. The comment
 * at the top of `domain.ts` says "a mismatch is a defect"; until this file
 * existed, nothing enforced it.
 *
 * The schema is read as TEXT, deliberately. Importing `@prisma/client` to
 * enumerate the enums would make this suite need a generated client — and,
 * transitively, the database dependency the hand-declaration exists to avoid.
 * It would also compare the schema against itself: the generated client is
 * derived from the same file, so agreement would prove nothing about the
 * hand-written list. Text parsing keeps the two sources genuinely independent.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AI_OUTCOMES,
  ATTRIBUTIONS,
  CAPABILITY_LAYERS,
  CONTROL_LEVELS,
  VERIFICATION_METHODS,
  CREDIT_KINDS,
  INPUT_TYPES,
  INTENT_SOURCES,
  ISSUE_STATES,
  ISSUE_STATE_TRANSITIONS,
  LOT_SOURCES,
  MODULE_STATES,
  MODULE_STATES_SCORED,
  MODULE_TYPES,
  SCAN_KINDS,
  SCAN_STATES,
  SCAN_STATES_TERMINAL,
  SEVERITIES,
  SEVERITIES_BLOCKING,
  SEVERITY_ORDER,
  SUBSCRIPTION_STATUSES,
  TRUST_LEVELS,
  TX_TYPES,
  VERIFICATION_OUTCOMES,
} from '../../src/domain.js';

// ─── Reading the schema ───────────────────────────────────────────────────────

const SCHEMA_PATH = fileURLToPath(
  new URL('../../../../apps/api/prisma/schema.prisma', import.meta.url),
);

/**
 * Minimal Prisma `enum` block parser.
 *
 * Only three things can appear inside a block: a member, a `///` doc comment,
 * and a `//` line or trailing comment. Enum bodies contain no nested braces, so
 * scanning to the first `}` is sufficient and there is no reason to pull in a
 * schema parser dependency for it.
 */
function parsePrismaEnums(source: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const header = /^enum\s+([A-Za-z_]\w*)\s*\{/gm;

  let match: RegExpExecArray | null;
  while ((match = header.exec(source)) !== null) {
    const name = match[1];
    const close = source.indexOf('}', match.index);
    if (name === undefined || close === -1) {
      throw new Error(`Unterminated enum block near offset ${String(match.index)}`);
    }

    const members = source
      .slice(match.index + match[0].length, close)
      .split('\n')
      .map((line) => line.replace(/\/\/[^\n]*/g, '').trim())
      .filter((line) => line !== '');

    if (members.length === 0) throw new Error(`Enum ${name} parsed as empty — parser is wrong`);
    if (found.has(name)) throw new Error(`Enum ${name} declared twice in the schema`);
    found.set(name, members);
  }

  return found;
}

// Line endings are normalised because `.gitattributes` lets the checkout decide
// them, and a lone carriage return left at the end of a line survives the
// trailing-comment strip above, turning every member name into a near-miss that
// fails only on Windows.
const schema = readFileSync(SCHEMA_PATH, 'utf8').replace(/\r\n?/g, '\n');

const prismaEnums = parsePrismaEnums(schema);

// ─── The join table ───────────────────────────────────────────────────────────

interface Mirror {
  /** Enum name in schema.prisma. */
  readonly prisma: string;
  /** Exported const name in domain.ts, for the failure message. */
  readonly exported: string;
  readonly members: readonly string[];
}

const MIRRORED: readonly Mirror[] = [
  { prisma: 'ModuleType', exported: 'MODULE_TYPES', members: MODULE_TYPES },
  { prisma: 'CapabilityLayer', exported: 'CAPABILITY_LAYERS', members: CAPABILITY_LAYERS },
  { prisma: 'TrustLevel', exported: 'TRUST_LEVELS', members: TRUST_LEVELS },
  { prisma: 'InputType', exported: 'INPUT_TYPES', members: INPUT_TYPES },
  { prisma: 'ControlLevel', exported: 'CONTROL_LEVELS', members: CONTROL_LEVELS },
  {
    prisma: 'VerificationMethod',
    exported: 'VERIFICATION_METHODS',
    members: VERIFICATION_METHODS,
  },
  { prisma: 'ScanKind', exported: 'SCAN_KINDS', members: SCAN_KINDS },
  { prisma: 'ScanState', exported: 'SCAN_STATES', members: SCAN_STATES },
  { prisma: 'ModuleState', exported: 'MODULE_STATES', members: MODULE_STATES },
  { prisma: 'Severity', exported: 'SEVERITIES', members: SEVERITIES },
  { prisma: 'Attribution', exported: 'ATTRIBUTIONS', members: ATTRIBUTIONS },
  { prisma: 'IssueState', exported: 'ISSUE_STATES', members: ISSUE_STATES },
  {
    prisma: 'VerificationOutcome',
    exported: 'VERIFICATION_OUTCOMES',
    members: VERIFICATION_OUTCOMES,
  },
  { prisma: 'CreditKind', exported: 'CREDIT_KINDS', members: CREDIT_KINDS },
  { prisma: 'LotSource', exported: 'LOT_SOURCES', members: LOT_SOURCES },
  { prisma: 'TxType', exported: 'TX_TYPES', members: TX_TYPES },
  {
    prisma: 'SubscriptionStatus',
    exported: 'SUBSCRIPTION_STATUSES',
    members: SUBSCRIPTION_STATUSES,
  },
  { prisma: 'AiOutcome', exported: 'AI_OUTCOMES', members: AI_OUTCOMES },
  { prisma: 'IntentSource', exported: 'INTENT_SOURCES', members: INTENT_SOURCES },
];

/**
 * Prisma enums with no counterpart in `domain.ts`, and why. An entry here is a
 * recorded decision, not an exemption from the check: the exhaustiveness test
 * below fails on any schema enum that is neither mirrored nor listed here, so a
 * newly added enum cannot slip through unnoticed.
 */
const NOT_MIRRORED: Readonly<Record<string, string>> = {
  // Server-side only: which challenge a target-ownership check used (FR-017).
  // No client renders it and no shared contract carries it, so there is nothing
  // for apps/web or sandbox-runner to name. Mirror it the day one of them does.
  VerificationMethod: 'API-internal; never crosses a package boundary',
};

// ─── The tests ────────────────────────────────────────────────────────────────

describe('schema.prisma enums are mirrored by packages/types', () => {
  it('reads the schema and finds enum blocks', () => {
    // If the parser silently matched nothing, every assertion below would pass
    // vacuously. That is the failure mode this guard exists to prevent.
    expect(schema.length).toBeGreaterThan(0);
    expect(prismaEnums.size).toBeGreaterThanOrEqual(MIRRORED.length);
  });

  it('accounts for every enum in the schema', () => {
    const accounted = new Set([...MIRRORED.map((m) => m.prisma), ...Object.keys(NOT_MIRRORED)]);
    const unaccounted = [...prismaEnums.keys()].filter((name) => !accounted.has(name));

    expect(
      unaccounted,
      `New enum(s) in schema.prisma with no entry in this test: ${unaccounted.join(', ')}. ` +
        'Either add the matching const array to packages/types/src/domain.ts and register it ' +
        'in MIRRORED, or record in NOT_MIRRORED why it stays API-internal.',
    ).toEqual([]);
  });

  it('has no stale mapping — every mapped name still exists in the schema', () => {
    const missing = [...MIRRORED.map((m) => m.prisma), ...Object.keys(NOT_MIRRORED)].filter(
      (name) => !prismaEnums.has(name),
    );

    expect(
      missing,
      `Mapped enum(s) no longer in schema.prisma: ${missing.join(', ')}. ` +
        'A renamed or deleted enum must be renamed or deleted in domain.ts too.',
    ).toEqual([]);
  });

  // The core assertion. A gained, lost, or renamed member on either side lands
  // here, and the message names both sides so the fix is obvious from CI output.
  describe.each(MIRRORED)('$prisma <-> $exported', ({ prisma, exported, members }) => {
    it('has exactly the same members', () => {
      const fromSchema = prismaEnums.get(prisma);
      expect(fromSchema, `enum ${prisma} not found in schema.prisma`).toBeDefined();

      const schemaSet = [...new Set(fromSchema)].sort();
      const typesSet = [...new Set(members)].sort();

      const onlyInSchema = schemaSet.filter((v) => !typesSet.includes(v));
      const onlyInTypes = typesSet.filter((v) => !schemaSet.includes(v));

      expect(
        { onlyInSchema, onlyInTypes },
        `${prisma} and ${exported} disagree. ` +
          `Only in schema.prisma: [${onlyInSchema.join(', ')}]. ` +
          `Only in domain.ts ${exported}: [${onlyInTypes.join(', ')}].`,
      ).toEqual({ onlyInSchema: [], onlyInTypes: [] });

      // Set equality is the requirement; equal cardinality additionally catches
      // a duplicated member, which a set comparison would hide.
      expect(members.length, `${exported} contains a duplicate member`).toBe(typesSet.length);
      expect(fromSchema?.length, `enum ${prisma} contains a duplicate member`).toBe(
        schemaSet.length,
      );
    });

    it('declares them in the same order', () => {
      // Not merely tidiness: report ordering and the severity scale are read off
      // these arrays, so a reordered schema that nobody mirrored produces a
      // report sorted differently from the database's own notion of order.
      expect([...members]).toEqual(prismaEnums.get(prisma));
    });
  });
});

// ─── Derived subsets ──────────────────────────────────────────────────────────

/**
 * `domain.ts` also exports subsets and lookup tables built from the enums above.
 * A renamed member that gets mirrored in the main array but not in these is the
 * same drift bug wearing a different hat, so they are checked here rather than
 * left to be discovered at runtime.
 */
describe('derived constants stay inside their enum', () => {
  it('SCAN_STATES_TERMINAL is a subset of SCAN_STATES', () => {
    for (const state of SCAN_STATES_TERMINAL) {
      expect(SCAN_STATES as readonly string[]).toContain(state);
    }
  });

  it('MODULE_STATES_SCORED is a subset of MODULE_STATES', () => {
    for (const state of MODULE_STATES_SCORED) {
      expect(MODULE_STATES as readonly string[]).toContain(state);
    }
  });

  it('SEVERITIES_BLOCKING is a subset of SEVERITIES', () => {
    for (const severity of SEVERITIES_BLOCKING) {
      expect(SEVERITIES as readonly string[]).toContain(severity);
    }
  });

  it('SEVERITY_ORDER covers every severity exactly once', () => {
    expect(Object.keys(SEVERITY_ORDER).sort()).toEqual([...SEVERITIES].sort());
    expect(new Set(Object.values(SEVERITY_ORDER)).size).toBe(SEVERITIES.length);
  });

  it('ISSUE_STATE_TRANSITIONS names only real issue states', () => {
    const known = new Set<string>(ISSUE_STATES);
    expect(Object.keys(ISSUE_STATE_TRANSITIONS).sort()).toEqual([...ISSUE_STATES].sort());
    for (const [from, tos] of Object.entries(ISSUE_STATE_TRANSITIONS)) {
      for (const to of tos) {
        expect(known, `${from} -> ${to} names a state that does not exist`).toContain(to);
      }
    }
  });
});
