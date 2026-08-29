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
  readonly method?: 'GET' | 'POST' | 'DELETE';
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

export function createTarget(value: string): Promise<{ target: TargetSummary }> {
  return request('/targets', { method: 'POST', body: { inputType: 'URL', value } });
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
