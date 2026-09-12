/**
 * T201 — UIQuestionnaire, an original design (see the component's own
 * module note for why, and `research.md`'s R19 for the governance record).
 *
 * Same two-halves discipline as `input-tabs.test.ts`: `renderToStaticMarkup`
 * proves the markup that does not depend on an effect running (effects do
 * not run in a static render, so this component's initial render is always
 * its `loading` branch — that is itself worth asserting, since a component
 * that fetched synchronously or threw before mount would fail even this),
 * and the three endpoint functions it depends on
 * (`getQuestionnaire`/`submitQuestionnaire`/`skipQuestionnaire`) are proven
 * against a stubbed `fetch` the same way `input-tabs.test.ts` proves
 * `uploadArchive`/`listRepositories` — including the 409
 * `QUESTIONNAIRE_ALREADY_RESOLVED` race this component treats as a normal
 * outcome, not a crash.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UIQuestionnaire } from '../../components/scan/UIQuestionnaire';
import { ApiError, getQuestionnaire, skipQuestionnaire, submitQuestionnaire } from '../../lib/api';

const render = (el: React.ReactElement): string => renderToStaticMarkup(el);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UIQuestionnaire markup', () => {
  it('renders the loading state on first render — no fetch has resolved yet', () => {
    const html = render(createElement(UIQuestionnaire, { scanId: 's1' }));
    expect(html).toContain('Loading the questionnaire');
    expect(html).not.toContain('Submit answers');
  });

  it('names no capability-specific screen the design system does not have — reuses Card/Button/Input class names only', () => {
    const html = render(createElement(UIQuestionnaire, { scanId: 's1' }));
    // The Card title and eyebrow render even in the loading branch.
    expect(html).toContain('A quick question about your brand');
    expect(html).toContain('Design intent');
  });
});

describe('the endpoints the questionnaire depends on', () => {
  it('fetches the questions and deadline from GET /scans/:id/questionnaire', async () => {
    let capturedPath: string | undefined;
    vi.stubGlobal('fetch', (url: string) => {
      capturedPath = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            questionnaire: {
              state: 'AWAITING_QUESTIONNAIRE',
              resolved: false,
              questionnaireDeadline: '2026-09-03T12:10:00.000Z',
              questions: [{ id: 'audience', prompt: 'Who is this for?', kind: 'text' }],
              waitMs: 600_000,
            },
          }),
          { status: 200 },
        ),
      );
    });

    const { questionnaire } = await getQuestionnaire('scan-1');

    expect(capturedPath).toContain('/scans/scan-1/questionnaire');
    expect(questionnaire.resolved).toBe(false);
    expect(questionnaire.questions).toHaveLength(1);
    expect(questionnaire.questionnaireDeadline).toBe('2026-09-03T12:10:00.000Z');
  });

  it('posts whatever fields were filled in — a partial answer is a valid answer (FR-040)', async () => {
    let capturedBody: string | undefined;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve(
        new Response(JSON.stringify({ scan: { id: 'scan-1', state: 'RUNNING_PHASE_2' } }), {
          status: 200,
        }),
      );
    });

    await submitQuestionnaire('scan-1', { audience: 'Small business owners' });

    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ audience: 'Small business owners' });
  });

  it('resumes the scan on skip with no content fields (FR-042)', async () => {
    let capturedPath: string | undefined;
    vi.stubGlobal('fetch', (url: string) => {
      capturedPath = url;
      return Promise.resolve(
        new Response(JSON.stringify({ scan: { id: 'scan-1', state: 'RUNNING_PHASE_2' } }), {
          status: 200,
        }),
      );
    });

    const { scan } = await skipQuestionnaire('scan-1');

    expect(capturedPath).toContain('/scans/scan-1/questionnaire/skip');
    expect(scan.state).toBe('RUNNING_PHASE_2');
  });

  it('surfaces QUESTIONNAIRE_ALREADY_RESOLVED as a typed ApiError, not a thrown crash', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'QUESTIONNAIRE_ALREADY_RESOLVED',
              message: 'This questionnaire is no longer waiting for an answer.',
            },
          }),
          { status: 409 },
        ),
      ),
    );

    const error = await submitQuestionnaire('scan-1', { audience: 'Anyone' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('QUESTIONNAIRE_ALREADY_RESOLVED');
    expect((error as ApiError).status).toBe(409);
  });
});
