/**
 * Phase 8 (US6), Task 4 — threading the questionnaire's answers into
 * `CapabilityInput.designIntent` (FR-040 through FR-043).
 *
 * The consuming side already exists and is correct: `impeccable`
 * (`packages/capabilities-vendored/impeccable/src/index.ts`) reads
 * `input.designIntent` and its four optional fields. Nothing before this task
 * ever constructed that value from the real `DesignIntent` row, so `impeccable`
 * received `undefined` every time regardless of what the questionnaire
 * captured.
 *
 * `buildDesignIntentInput` is the mapping this task adds. It reads the row
 * once per phase job (never per module — see the module note beside its call
 * site in `orchestrator.ts`'s `handlePhase`) and translates the DB's
 * questionnaire vocabulary into the SDK's leaner, AI-facing one:
 *
 *   - `audience`          -> `audience`   (direct passthrough)
 *   - `stylePreference`   -> `tone`       (renamed; the DB and the SDK do not
 *                                          share a word for this)
 *   - `brandColors`       -> `brandColors` (direct passthrough, both string[])
 *   - `admiredReferences` -> folded into `notes` as
 *                            "Admired references: a, b, c" (there is no
 *                            direct SDK field for a reference list, and this
 *                            is the one field with no home otherwise — see
 *                            the "does not drop admiredReferences" case below)
 *
 * No database here: `buildDesignIntentInput` takes a `db` shaped only by the
 * one query it runs (`designIntent.findUnique`), following the same
 * fake-`db`-object convention `state-machine.ts`'s own unit tests already use
 * in this file's sibling, `orchestrator.test.ts` (see e.g. "reports an
 * illegal edge as illegal, not as a lost race").
 */

import { describe, expect, it } from 'vitest';
import { buildDesignIntentInput } from '../../src/orchestrator/orchestrator.js';

interface FakeRow {
  readonly source: 'SUPPLIED' | 'SKIPPED' | 'DEFAULTED';
  readonly audience: string | null;
  readonly stylePreference: string | null;
  readonly admiredReferences: readonly string[];
  readonly brandColors: readonly string[];
}

function fakeDb(row: FakeRow | null): {
  designIntent: { findUnique: (args: { where: { scanId: string } }) => Promise<FakeRow | null> };
} {
  return {
    designIntent: {
      findUnique: (_args: { where: { scanId: string } }) => Promise.resolve(row),
    },
  };
}

describe('buildDesignIntentInput', () => {
  it('maps a SUPPLIED row into the SDK shape impeccable reads', async () => {
    const db = fakeDb({
      source: 'SUPPLIED',
      audience: 'small business owners',
      stylePreference: 'Minimal',
      admiredReferences: ['stripe.com', 'linear.app'],
      brandColors: ['#0F62FE'],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake db shaped only by the one query this function runs
    const intent = await buildDesignIntentInput(db as any, 'scan-1');

    expect(intent).toEqual({
      audience: 'small business owners',
      tone: 'Minimal',
      brandColors: ['#0F62FE'],
      notes: 'Admired references: stripe.com, linear.app',
    });
  });

  it('does not drop admiredReferences: it folds into notes rather than being silently ignored', async () => {
    const db = fakeDb({
      source: 'SUPPLIED',
      audience: null,
      stylePreference: null,
      admiredReferences: ['dribbble.com/shots/1'],
      brandColors: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intent = await buildDesignIntentInput(db as any, 'scan-2');

    expect(intent).toEqual({ notes: 'Admired references: dribbble.com/shots/1' });
  });

  it('omits the key entirely when no DesignIntent row exists (UI was never requested)', async () => {
    const db = fakeDb(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intent = await buildDesignIntentInput(db as any, 'scan-no-row');

    expect(intent).toBeUndefined();
  });

  it('produces an all-undefined-field object for a DEFAULTED row with no content, and impeccable stays safe on it', async () => {
    const db = fakeDb({
      source: 'DEFAULTED',
      audience: null,
      stylePreference: null,
      admiredReferences: [],
      brandColors: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intent = await buildDesignIntentInput(db as any, 'scan-defaulted');

    expect(intent).toBeDefined();
    expect(intent).toEqual({});
    expect(intent?.audience).toBeUndefined();
    expect(intent?.tone).toBeUndefined();
    expect(intent?.brandColors).toBeUndefined();
    expect(intent?.notes).toBeUndefined();
  });

  it('produces the same all-undefined-field object for a SKIPPED row', async () => {
    const db = fakeDb({
      source: 'SKIPPED',
      audience: null,
      stylePreference: null,
      admiredReferences: [],
      brandColors: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intent = await buildDesignIntentInput(db as any, 'scan-skipped');

    expect(intent).toEqual({});
  });
});
