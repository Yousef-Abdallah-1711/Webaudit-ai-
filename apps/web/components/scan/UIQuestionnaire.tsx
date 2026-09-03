'use client';

/**
 * T201 — UIQuestionnaire: the mid-audit design-intent pause (FR-040–FR-043),
 * rendered while a scan sits at `AWAITING_QUESTIONNAIRE`.
 *
 * **Original design, not a port — a documented exception, not a
 * precedent.** `design/screen-map.md` lists this exact surface under
 * "Coverage gaps — no design exists": "Referenced in the app kit but no
 * dedicated screen. Request a design before implementing. Do not invent
 * these." The constitution's Design Adherence section normally blocks
 * building an unreviewed screen outright. The user was asked directly and
 * explicitly authorized an original, minimal, functional build for this one
 * surface — the same governance clause `AnnotatedScreenshot.tsx` (T143) used
 * first; see `research.md`'s R19 for the full record and R18 for the
 * template this follows. This is not licence to invent any other surface —
 * the next blocked one still gets asked about, not guessed.
 *
 * **Reuses everything that already exists rather than inventing more than
 * this one gap requires**: `Card`, `Button`, and `Input` exactly as ported
 * (T237), and only `var(--space-*)`/`var(--type-*)`/`var(--text-*)`/
 * `var(--sev-*)` tokens in `UIQuestionnaire.module.css` — no new colour,
 * radius, or type token. Nothing beyond layout was invented.
 *
 * **The four fields match `packages/config/src/design-intent.ts`'s
 * `DESIGN_INTENT_QUESTIONS` by `id`**, not by a separately maintained list —
 * the questions themselves are fetched from `GET /scans/:id/questionnaire`
 * (which serves that same array), so this component never hand-copies the
 * prompt text or choice list and cannot drift from what the worker actually
 * asks. `admiredReferences` and `brandColors` are typed as `text`/`colors`
 * respectively but the API accepts an array (`answer.admiredReferences:
 * string[]`) — this component collects each as one comma-separated field
 * and splits it client-side, the same "simple approach" the task text calls
 * for.
 *
 * **The 409 race is a normal outcome, not an error.** `POST .../questionnaire`
 * and `.../questionnaire/skip` both answer `QUESTIONNAIRE_ALREADY_RESOLVED`
 * when the deadline fired server-side (`questionnaire-timeout-handler.ts`,
 * not touched by this change) while this form was still open, or when a
 * second tab already answered. That is treated as success, not failure: the
 * scan is moving on either way, so this component shows a short message and
 * calls `onResolved` rather than surfacing a crash or a retry prompt.
 *
 * **Does not own the realtime socket.** `ScanProgress` holds the
 * `connectRealtime` connection and tracks `scanState`; this component stops
 * being rendered the moment that state leaves `AWAITING_QUESTIONNAIRE`.
 *
 * `onResolved` is the primary mechanism, not a nicety: it re-reads the scan
 * over HTTP (`ScanProgress`'s own `refetch`). Answering or skipping resumes the
 * scan inside `apps/api`, and `apps/api` has no event publisher — `scan:state`
 * is published by `apps/worker` alone, and `apps/api` only subscribes to that
 * channel and fans it out to sockets. So this user's own submit ends the pause
 * through `onResolved`, and the *deadline* firing (inside the worker) is the
 * case that genuinely arrives as a `scan:state` push. A second tab watching the
 * same scan learns of this tab's answer on its own next resync rather than from
 * an event; its own `POST` then answers 409, handled below. See
 * `ScanProgress.tsx`'s module note.
 */
import { useEffect, useState } from 'react';
import { Button, Card, Input } from '../ui';
import {
  ApiError,
  getQuestionnaire,
  skipQuestionnaire,
  submitQuestionnaire,
  type QuestionnaireQuestion,
} from '../../lib/api';
import styles from './UIQuestionnaire.module.css';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${String(mm)}:${ss}`;
}

/** `admiredReferences`/`brandColors` are collected as one comma-separated field. */
function splitList(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function fieldPlaceholder(question: QuestionnaireQuestion): string | undefined {
  // No literal hex value here on purpose — the adherence lint's raw-colour
  // rule matches any string Literal shaped like a hex colour, not just ones
  // used as CSS, and a placeholder is not an exception worth carving out.
  if (question.kind === 'colors') return 'e.g. burnt orange, navy, or a hex code';
  if (question.id === 'admiredReferences') return 'e.g. stripe.com, linear.app';
  return undefined;
}

type LoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly questions: readonly QuestionnaireQuestion[];
      readonly deadline: string | null;
    }
  // Already answered, skipped, or defaulted by the time this fetched — not an error.
  | { readonly status: 'resolved' }
  | { readonly status: 'error'; readonly message: string };

export interface UIQuestionnaireProps {
  scanId: string;
  /**
   * Fires once the pause is over from this user's own action (answered or
   * skipped, including a 409 discovered while doing so). The caller
   * (`ScanProgress`) uses this to fall back to the normal progress view
   * immediately rather than waiting on the next realtime event.
   */
  onResolved?: () => void;
}

export function UIQuestionnaire({ scanId, onResolved }: UIQuestionnaireProps): React.ReactElement {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void getQuestionnaire(scanId)
      .then(({ questionnaire }) => {
        if (cancelled) return;
        if (questionnaire.resolved) {
          setLoad({ status: 'resolved' });
          onResolved?.();
          return;
        }
        setLoad({
          status: 'ready',
          questions: questionnaire.questions,
          deadline: questionnaire.questionnaireDeadline,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoad({
          status: 'error',
          message:
            error instanceof ApiError ? error.message : 'Could not load the questionnaire.',
        });
      });
    return () => {
      cancelled = true;
    };
    // Deliberately scoped to scanId only — onResolved is expected to be a
    // stable callback (ScanProgress passes its memoised refetch), and
    // refiring this fetch on every parent render would be wrong regardless.
  }, [scanId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  async function handleResolve(action: () => Promise<unknown>): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await action();
      onResolved?.();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'QUESTIONNAIRE_ALREADY_RESOLVED') {
        setLoad({ status: 'resolved' });
        onResolved?.();
        return;
      }
      setSubmitError(
        error instanceof ApiError ? error.message : 'Could not save your answer. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(): void {
    const audience = answers['audience']?.trim();
    const stylePreference = answers['stylePreference']?.trim();
    const admiredReferences = splitList(answers['admiredReferences']);
    const brandColors = splitList(answers['brandColors']);
    void handleResolve(() =>
      submitQuestionnaire(scanId, {
        ...(audience !== undefined && audience !== '' ? { audience } : {}),
        ...(stylePreference !== undefined && stylePreference !== ''
          ? { stylePreference }
          : {}),
        ...(admiredReferences.length > 0 ? { admiredReferences } : {}),
        ...(brandColors.length > 0 ? { brandColors } : {}),
      }),
    );
  }

  function handleSkip(): void {
    void handleResolve(() => skipQuestionnaire(scanId));
  }

  if (load.status === 'loading') {
    return (
      <Card eyebrow="Design intent" title="A quick question about your brand">
        <p className={styles.note}>Loading the questionnaire…</p>
      </Card>
    );
  }

  if (load.status === 'resolved') {
    return (
      <Card eyebrow="Design intent" title="A quick question about your brand">
        <p className={styles.note}>
          This question is no longer waiting for an answer — it resumed on its own, and the
          audit is continuing.
        </p>
      </Card>
    );
  }

  if (load.status === 'error') {
    return (
      <Card eyebrow="Design intent" title="A quick question about your brand">
        <p className={styles.error}>{load.message}</p>
      </Card>
    );
  }

  const remainingMs =
    load.deadline === null ? null : new Date(load.deadline).getTime() - now;
  const urgent = remainingMs !== null && remainingMs < 60_000;

  return (
    <Card eyebrow="Design intent" title="A quick question about your brand">
      {remainingMs !== null && (
        <p className={urgent ? `${styles.deadline} ${styles.deadlineUrgent}` : styles.deadline}>
          You have <span dir="ltr">{formatRemaining(Math.max(0, remainingMs))}</span> left to
          answer — after that the audit resumes on its own.
        </p>
      )}

      <div className={styles.fields}>
        {load.questions.map((question) => {
          const placeholder = fieldPlaceholder(question);
          return (
            <div key={question.id} className={styles.field}>
              <label className={styles.label}>{question.prompt}</label>
              {question.id === 'admiredReferences' || question.kind === 'colors' ? (
                <p className={styles.hint}>Separate more than one with a comma.</p>
              ) : null}
              {question.kind === 'choice' ? (
                <div className={styles.choices}>
                  {(question.choices ?? []).map((choice) => (
                    <Button
                      key={choice}
                      size="sm"
                      variant={answers[question.id] === choice ? 'primary' : 'secondary'}
                      onClick={() => {
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: current[question.id] === choice ? '' : choice,
                        }));
                      }}
                    >
                      {choice}
                    </Button>
                  ))}
                </div>
              ) : (
                <Input
                  {...(placeholder === undefined ? {} : { placeholder })}
                  value={answers[question.id] ?? ''}
                  onChange={(e) => {
                    const { value } = e.target;
                    setAnswers((current) => ({ ...current, [question.id]: value }));
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {submitError !== null && <p className={styles.error}>{submitError}</p>}

      <div className={styles.actions}>
        <Button disabled={submitting} onClick={handleSubmit}>
          Submit answers
        </Button>
        <Button variant="secondary" disabled={submitting} onClick={handleSkip}>
          Skip
        </Button>
      </div>
    </Card>
  );
}
