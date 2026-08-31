/**
 * T166 — the readiness congratulations email.
 *
 * Sent once, when a readiness pass returns a *go* verdict (SC-014's funnel
 * endpoint — "30% of users who resolve their first issue go on to reach a
 * readiness verdict" — is the moment worth marking). It carries the score
 * against the baseline and a link to the shareable certificate (FR-072), and
 * nothing else: the product's voice is "plain, specific, never cute"
 * (DESIGN.md §8), and "no exclamation marks outside the readiness verdict" —
 * this is the one place a little warmth is allowed, and still not a lot.
 *
 * A thin composer over the injected `Mailer`, matching how the auth flows call
 * `sendVerification` / `sendPasswordReset`. The route (`readiness.routes.ts`)
 * calls this exactly once per verdict, guarded on `certificateKey` having just
 * been written, so a repeated `GET /scans/:id/readiness` does not re-send.
 */

import type { Mailer, ReadinessAchievedMail } from './mailer.js';

export async function sendReadinessCongratulations(
  mailer: Mailer,
  email: string,
  mail: ReadinessAchievedMail,
): Promise<void> {
  await mailer.sendReadinessAchieved(email, mail);
}

export type { ReadinessAchievedMail };
