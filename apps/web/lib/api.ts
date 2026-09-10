/**
 * A shared typed fetch client for `apps/api` — not a numbered task itself,
 * but required infrastructure T128 (auth pages) and T129 (scan form) both
 * need: nothing under `apps/web` called the real API before this sub-phase
 * (Phase 2L's shell work was purely presentational). One wrapper rather than
 * each component inventing its own `fetch` call, matching every request/
 * response shape already proven real by `apps/web/tests/e2e/
 * first-audit.spec.ts`.
 *
 * `NEXT_PUBLIC_API_URL` is a build-time env var (Next.js inlines
 * `NEXT_PUBLIC_*` into the client bundle) — defaults to the API's own
 * documented dev port (`apps/api/src/index.ts`'s `DEFAULT_PORT`).
 *
 * The access token is held in memory and mirrored to `localStorage` so a
 * reload does not sign the user out — the same trade-off `app/theme.tsx`
 * already makes for theme/lang. The refresh token itself is an httpOnly
 * cookie the browser sends automatically (`credentials: 'include'`); this
 * module never reads or writes it directly.
 */

export const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const TOKEN_KEY = 'wa-access-token';
const isBrowser = typeof window !== 'undefined';

let accessToken: string | undefined = isBrowser
  ? (localStorage.getItem(TOKEN_KEY) ?? undefined)
  : undefined;

export function getAccessToken(): string | undefined {
  return accessToken;
}

export function setAccessToken(token: string | undefined): void {
  accessToken = token;
  if (!isBrowser) return;
  try {
    if (token === undefined) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode, quota) — the in-memory token still works
    // for the rest of this page's lifetime.
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /** Defaults to the stored access token. Pass `null` to omit it entirely. */
  readonly token?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = options.token === null ? undefined : (options.token ?? accessToken);
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await res.text();
  const parsed: unknown = text === '' ? undefined : JSON.parse(text);

  if (!res.ok) {
    const errorBody = (parsed as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      res.status,
      errorBody?.code ?? 'UNKNOWN',
      errorBody?.message ?? 'The request failed.',
      errorBody?.details,
    );
  }

  return parsed as T;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export function register(email: string, password: string): Promise<{ message: string }> {
  return request('/auth/register', { method: 'POST', body: { email, password }, token: null });
}

export async function login(email: string, password: string): Promise<{ accessToken: string }> {
  const result = await request<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    token: null,
  });
  setAccessToken(result.accessToken);
  return result;
}

/**
 * `GET /auth/me` — the authenticated user's own identity, plan, and derived
 * credit balance in one round trip (the balance is derived from live lots,
 * never stored, same as `GET /billing/credits`). No `name` field exists:
 * `User` has no name column at all (T128's own note), so the caller shows
 * the real email rather than inventing one.
 */
export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  readonly isOperator: boolean;
  readonly emailVerified: boolean;
  readonly plan: PlanId | 'free';
  readonly credits: {
    readonly plan: number;
    readonly purchased: number;
    readonly planExpiresAt: string | null;
  };
}

export function getMe(): Promise<CurrentUser> {
  return request('/auth/me');
}

export function resendVerification(email: string): Promise<{ message: string }> {
  return request('/auth/verify/resend', { method: 'POST', body: { email }, token: null });
}

export function verifyEmail(token: string): Promise<{ message: string }> {
  return request(`/auth/verify/${encodeURIComponent(token)}`, { token: null });
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return request('/auth/forgot-password', { method: 'POST', body: { email }, token: null });
}

export function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return request('/auth/reset-password', {
    method: 'POST',
    body: { token, password },
    token: null,
  });
}

// ─── Targets and scans ──────────────────────────────────────────────────────

export interface TargetSummary {
  readonly id: string;
  readonly inputType: string;
  readonly canonicalValue: string;
  readonly displayName: string;
}

export function createTarget(
  value: string,
  inputType: 'URL' | 'REPOSITORY' = 'URL',
): Promise<{ target: TargetSummary }> {
  return request('/targets', { method: 'POST', body: { inputType, value } });
}

// ─── Source intake (US4) ────────────────────────────────────────────────────

export interface ConnectedRepository {
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly updatedAt: string;
}

export function listRepositories(): Promise<{ repositories: readonly ConnectedRepository[] }> {
  return request('/repos');
}

export interface StagedUpload {
  readonly targetId: string;
  readonly key: string;
  readonly archiveBytes: number;
  readonly fileCount: number;
  readonly totalUncompressedBytes: number;
}

/**
 * Stage an archive. Not routed through `request` because it must not set
 * `Content-Type` at all: the browser has to generate the multipart boundary,
 * and a hand-set header would produce a body the server cannot parse.
 */
export async function uploadArchive(file: File): Promise<{ upload: StagedUpload }> {
  const form = new FormData();
  form.append('archive', file);

  const headers: Record<string, string> = {};
  if (accessToken !== undefined) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/scans/upload`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: form,
  });

  const text = await res.text();
  const parsed: unknown = text === '' ? undefined : JSON.parse(text);
  if (!res.ok) {
    const errorBody = (parsed as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      res.status,
      errorBody?.code ?? 'UNKNOWN',
      errorBody?.message ?? 'The archive could not be accepted.',
      errorBody?.details,
    );
  }
  return parsed as { upload: StagedUpload };
}

export function quoteScan(
  targetId: string,
  modules: readonly string[],
): Promise<{ quote: { credits: number; modules: readonly string[] } }> {
  return request('/scans/quote', { method: 'POST', body: { targetId, modules } });
}

export interface ScanSummary {
  readonly id: string;
  readonly state: string;
  readonly quotedCredits: number;
  readonly chargedCredits: number;
  readonly requestedModules: readonly string[];
  /** ISO 8601, or null before the first phase starts. */
  readonly startedAt: string | null;
  /** Only present on `GET /scans/:id` — what the scan is auditing. */
  readonly target?: { readonly displayName: string };
  /** Only present on `GET /scans/:id` — each requested module's real,
   * current state, for a client whose realtime connection missed the
   * events that would otherwise carry this (see ScanProgress.tsx's own
   * note on why this exists). */
  readonly moduleResults?: readonly { readonly module: string; readonly state: string }[];
}

export function createScan(
  targetId: string,
  modules: readonly string[],
  acceptedQuote: number,
): Promise<{ scan: ScanSummary }> {
  return request('/scans', { method: 'POST', body: { targetId, modules, acceptedQuote } });
}

export function getScan(scanId: string): Promise<{ scan: ScanSummary }> {
  return request(`/scans/${scanId}`);
}

export function cancelScan(scanId: string): Promise<{ scan: ScanSummary }> {
  return request(`/scans/${scanId}/cancel`, { method: 'POST' });
}

export interface ReportArea {
  readonly module: string;
  readonly state: string;
  readonly score: number | null;
  readonly summary: string | null;
  readonly skippedReason: string | null;
  readonly degradedReason: string | null;
}

export interface ReportIssue {
  readonly id: string;
  readonly module: string;
  readonly severity: string;
  readonly title: string;
  readonly explanation: string;
  readonly location: string | null;
  readonly attribution: string;
  readonly fixPrompt: string;
}

export interface Report {
  readonly scanId: string;
  readonly state: string;
  readonly score: number | null;
  readonly summary: string | null;
  readonly areas: readonly ReportArea[];
  readonly issues: readonly ReportIssue[];
}

export function getReport(scanId: string): Promise<{ report: Report }> {
  return request(`/scans/${scanId}/report`);
}

// ─── Fix loop (US2) ─────────────────────────────────────────────────────────

export type IssueState = 'OPEN' | 'ASSERTED_FIXED' | 'RESOLVED' | 'UNVERIFIABLE' | 'REOPENED';

export interface FixesIssue {
  readonly id: string;
  readonly severity: string;
  readonly title: string;
  readonly explanation: string;
  readonly consequence: string;
  readonly location: string | null;
  readonly attribution: string;
  readonly fixPrompt: string;
  readonly state: IssueState;
  readonly checkId: string;
  readonly assertedFixedAt: string | null;
  readonly resolvedAt: string | null;
  readonly reopenedAt: string | null;
  readonly previouslyResolved: boolean;
  readonly createdAt: string;
}

export interface VerificationAttempt {
  readonly id: string;
  readonly outcome: 'PASSED' | 'FAILED' | 'UNVERIFIABLE' | 'ERRORED';
  readonly evidence: unknown;
  readonly creditsCharged: number;
  readonly durationMs: number;
  readonly createdAt: string;
}

export function getIssues(
  scanId: string,
  filters: { readonly severity?: string; readonly state?: string } = {},
): Promise<{ issues: readonly FixesIssue[] }> {
  const params = new URLSearchParams();
  if (filters.severity !== undefined) params.set('severity', filters.severity);
  if (filters.state !== undefined) params.set('state', filters.state);
  const query = params.toString();
  return request(`/scans/${scanId}/issues${query === '' ? '' : `?${query}`}`);
}

export function getIssueAttempts(
  issueId: string,
): Promise<{ attempts: readonly VerificationAttempt[] }> {
  return request(`/issues/${issueId}/attempts`);
}

/**
 * The last FAILED attempt's evidence for every issue in the scan that has
 * one, in a single request — the batched counterpart to `getIssueAttempts`
 * for the Fixes board, which previously issued one `getIssueAttempts` call
 * per issue needing evidence, refired on every realtime `issue:verified`
 * event (2026-09-02 review, Finding 7).
 */
export function getFailingEvidence(scanId: string): Promise<{ evidence: Record<string, unknown> }> {
  return request(`/scans/${scanId}/issues/failing-evidence`);
}

export function assertIssueFixed(issueId: string): Promise<{
  issue: { id: string; state: IssueState; scanId: string };
  reverification: { jobId: string; creditsCharged: number };
}> {
  return request(`/issues/${issueId}/assert-fixed`, { method: 'POST' });
}

// ─── Readiness (US3) ────────────────────────────────────────────────────────

export interface ReadinessModuleOutcome {
  readonly module: string;
  readonly score: number | null;
  readonly threshold: number;
  readonly pass: boolean;
  readonly baselineScore?: number | null;
  readonly delta?: number | null;
  readonly direction?: string;
}

export interface ReadinessVerdictData {
  readonly id: string;
  readonly isReady: boolean;
  readonly overallScore: number;
  readonly baselineScore: number;
  readonly moduleOutcomes: readonly ReadinessModuleOutcome[];
  readonly regressions: readonly { kind: string; name: string }[];
  readonly improvements: readonly { kind: string; name: string }[];
  readonly blockers: readonly string[];
  readonly certificateKey: string | null;
}

export interface ReadinessStatus {
  /** Present when :id is a READINESS scan. */
  readonly scanId?: string;
  readonly baselineScanId?: string | null;
  readonly state?: string;
  readonly verdict?: ReadinessVerdictData | null;
  /** Present when :id is an INITIAL scan. */
  readonly premature?: boolean;
  readonly outstandingBlocking?: number;
  readonly readinessScanId?: string | null;
  readonly readinessScanState?: string | null;
}

export function getReadiness(scanId: string): Promise<{ readiness: ReadinessStatus }> {
  return request(`/scans/${scanId}/readiness`);
}

export function startReadiness(
  baselineScanId: string,
  acceptedQuote: number,
): Promise<{ scan: { id: string; state: string; kind: string; baselineScanId: string } }> {
  return request(`/scans/${baselineScanId}/readiness`, {
    method: 'POST',
    body: { acceptedQuote },
  });
}

// ─── Design intent questionnaire (US6) ─────────────────────────────────────

export interface QuestionnaireQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly kind: 'text' | 'choice' | 'colors';
  readonly choices?: readonly string[];
}

export interface QuestionnaireStatus {
  readonly state: string;
  /** False only while the scan is genuinely paused waiting on this answer. */
  readonly resolved: boolean;
  readonly questionnaireDeadline: string | null;
  readonly questions: readonly QuestionnaireQuestion[];
  readonly waitMs: number;
}

export function getQuestionnaire(scanId: string): Promise<{ questionnaire: QuestionnaireStatus }> {
  return request(`/scans/${scanId}/questionnaire`);
}

/** FR-040: every field optional — a partial answer is still an answer. */
export interface QuestionnaireAnswer {
  readonly audience?: string;
  readonly stylePreference?: string;
  readonly admiredReferences?: readonly string[];
  readonly brandColors?: readonly string[];
}

export function submitQuestionnaire(
  scanId: string,
  answer: QuestionnaireAnswer,
): Promise<{ scan: ScanSummary }> {
  return request(`/scans/${scanId}/questionnaire`, { method: 'POST', body: answer });
}

export function skipQuestionnaire(scanId: string): Promise<{ scan: ScanSummary }> {
  return request(`/scans/${scanId}/questionnaire/skip`, { method: 'POST' });
}

// ─── Billing and plans (US5) ────────────────────────────────────────────────

export type PlanId = 'free' | 'starter' | 'pro' | 'business';
export type SubscribablePlanId = 'starter' | 'pro' | 'business';

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  readonly monthlyCredits: number;
  readonly creditsRecur: boolean;
  readonly allowedInputTypes: readonly string[];
  readonly allowLoadGeneration: boolean;
  readonly allowReadinessPass: boolean;
  readonly allowCreditPurchase: boolean;
  readonly allowCustomCapability: boolean;
  readonly concurrentScanLimit: number;
  readonly queuePriority: number;
  readonly retentionDays: number;
}

export function getPlans(): Promise<{ plans: readonly Plan[] }> {
  return request('/billing/plans');
}

/**
 * FR-078: the two credit lifetimes stay distinct. `plan` credits expire at
 * renewal, `purchased` credits never do, and a debit's `drewFrom` records
 * which balance each movement was taken from (scenario 6).
 */
export interface CreditBalanceView {
  readonly plan: number;
  readonly purchased: number;
  readonly planExpiresAt: string | null;
}

export interface CreditMovement {
  readonly id: string;
  readonly type: 'GRANT' | 'DEBIT' | 'REFUND' | 'EXPIRE';
  readonly amount: number;
  readonly reason: string | null;
  readonly scanId: string | null;
  readonly issueId: string | null;
  readonly createdAt: string;
  readonly drewFrom: Record<string, number>;
}

export interface SubscriptionView {
  readonly planId: PlanId;
  readonly status: string;
  readonly periodStart?: string;
  readonly periodEnd: string;
  readonly cancelAtPeriodEnd: boolean;
}

export function getCredits(): Promise<{
  balance: CreditBalanceView;
  subscription: SubscriptionView | null;
  movements: readonly CreditMovement[];
}> {
  return request('/billing/credits');
}

export function subscribe(planId: SubscribablePlanId): Promise<{ subscription: SubscriptionView }> {
  return request('/billing/subscribe', { method: 'POST', body: { planId } });
}

export function changePlan(planId: SubscribablePlanId): Promise<{ subscription: SubscriptionView }> {
  return request('/billing/change-plan', { method: 'POST', body: { planId } });
}

export function cancelSubscription(): Promise<{
  subscription: SubscriptionView;
  reportsReadableUntil: string;
}> {
  return request('/billing/cancel', { method: 'POST' });
}

export function purchaseCredits(
  credits: number,
): Promise<{ purchase: { creditsAdded: number; kind: 'PURCHASED' } }> {
  return request('/billing/credits/purchase', { method: 'POST', body: { credits } });
}

// ─── Admin: users (US7, T205) ───────────────────────────────────────────────

export interface AdminUserSummary {
  readonly id: string;
  readonly email: string;
  readonly isOperator: boolean;
  readonly createdAt: string;
  readonly planId: string;
  readonly subscriptionStatus: string | null;
  readonly balance: { readonly plan: number; readonly purchased: number };
}

export function getAdminUsers(
  opts: { readonly limit?: number; readonly offset?: number } = {},
): Promise<{ users: readonly AdminUserSummary[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const query = params.toString();
  return request(`/admin/users${query === '' ? '' : `?${query}`}`);
}

export function setUserOperator(
  userId: string,
  isOperator: boolean,
): Promise<{ user: AdminUserSummary }> {
  return request(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isOperator },
  });
}

// ─── Admin: plans (US7, T205) ───────────────────────────────────────────────

/**
 * Deliberately not `Plan` above — that customer-facing type has no `isActive`
 * (a customer never sees a retired tier) and this one has no price (no
 * credit-to-dollar rate exists anywhere in this codebase, PROGRESS.md's Open
 * Decision #3).
 */
export interface AdminPlanRecord {
  readonly id: string;
  readonly name: string;
  readonly monthlyCredits: number;
  readonly creditsRecur: boolean;
  readonly allowedInputTypes: readonly string[];
  readonly allowLoadGeneration: boolean;
  readonly allowReadinessPass: boolean;
  readonly allowCreditPurchase: boolean;
  readonly allowCustomCapability: boolean;
  readonly concurrentScanLimit: number;
  readonly queuePriority: number;
  readonly retentionDays: number;
  readonly isActive: boolean;
}

export function getAdminPlans(
  includeInactive = true,
): Promise<{ plans: readonly AdminPlanRecord[] }> {
  return request(`/admin/plans?includeInactive=${String(includeInactive)}`);
}

export function setPlanActive(
  planId: string,
  isActive: boolean,
): Promise<{ plan: AdminPlanRecord }> {
  return request(`/admin/plans/${encodeURIComponent(planId)}`, {
    method: 'PATCH',
    body: { isActive },
  });
}

// ─── Admin: margin (US7, T206) ──────────────────────────────────────────────

/**
 * No `marginMicros`/`marginUsd` field exists anywhere in this shape, and none
 * should ever be added to it: revenue (`chargedCredits`) is in credits, cost
 * (`costMicros`) is real USD micros, and this codebase has no published
 * conversion rate between them (Open Decision #3). `note` is the backend's
 * own explanation of exactly this, always present, always worth showing.
 */
export interface MarginScanRow {
  readonly scanId: string;
  readonly chargedCredits: number;
  readonly costMicros: number;
}

export interface MarginAreaRow {
  readonly module: string;
  readonly chargedCredits: number;
  readonly costMicros: number;
}

export interface MarginCapabilityRow {
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly module: string;
  readonly costMicros: number;
  readonly executionCount: number;
  readonly succeededCount: number;
  readonly failedCount: number;
}

export interface MarginReport {
  readonly window: { readonly from: string; readonly to: string };
  readonly perScan: readonly MarginScanRow[];
  readonly perArea: readonly MarginAreaRow[];
  readonly perCapability: readonly MarginCapabilityRow[];
  readonly note: string;
}

export function getMarginReport(): Promise<{ report: MarginReport }> {
  return request('/admin/margin');
}

// ─── Admin: capabilities (US7, T207) ────────────────────────────────────────

export interface AdminCapabilitySummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly module: string;
  readonly layer: string;
  readonly trust: string;
  readonly isEnabled: boolean;
  readonly restrictedToPlans: readonly string[];
  readonly estimatedTokens: number;
  readonly executionCount: number;
  readonly updatedAt: string;
}

export function getAdminCapabilities(): Promise<{
  capabilities: readonly AdminCapabilitySummary[];
}> {
  return request('/admin/capabilities');
}

export function setCapabilityEnabled(
  capabilityId: string,
  isEnabled: boolean,
): Promise<{ capability: AdminCapabilitySummary }> {
  return request(`/admin/capabilities/${encodeURIComponent(capabilityId)}`, {
    method: 'PATCH',
    body: { isEnabled },
  });
}

// ─── Admin: scans ────────────────────────────────────────────────────────────

export interface AdminScanSummary {
  readonly id: string;
  readonly userEmail: string;
  readonly targetDisplayName: string;
  readonly state: string;
  readonly requestedModules: readonly string[];
  readonly chargedCredits: number;
  readonly overallScore: number | null;
  readonly createdAt: string;
}

export function getAdminScans(
  opts: { readonly limit?: number; readonly offset?: number } = {},
): Promise<{ scans: readonly AdminScanSummary[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const query = params.toString();
  return request(`/admin/scans${query === '' ? '' : `?${query}`}`);
}

// ─── Admin: audit log ────────────────────────────────────────────────────────

export interface AdminAuditLogEntry {
  readonly id: string;
  readonly actorId: string;
  readonly actorEmail: string | null;
  readonly action: string;
  readonly subjectType: string;
  readonly subjectId: string | null;
  readonly createdAt: string;
}

export function getAdminAuditLog(
  opts: { readonly limit?: number; readonly offset?: number } = {},
): Promise<{
  entries: readonly AdminAuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const query = params.toString();
  return request(`/admin/audit-log${query === '' ? '' : `?${query}`}`);
}

// ─── Admin: queue (US7, T209) ───────────────────────────────────────────────

export type AdminQueueState = 'waiting' | 'active' | 'delayed' | 'failed' | 'completed';

export interface AdminJobSummary {
  readonly queue: string;
  readonly id: string;
  readonly name: string;
  readonly state: AdminQueueState;
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly failedReason: string | null;
  readonly timestamp: number;
}

export function getAdminQueueJobs(): Promise<{ jobs: readonly AdminJobSummary[] }> {
  return request('/admin/queue');
}

export function retryAdminQueueJob(jobId: string): Promise<{ job: AdminJobSummary }> {
  return request(`/admin/queue/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
}

export function cancelAdminQueueJob(jobId: string): Promise<{ cancelled: string }> {
  return request(`/admin/queue/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}
