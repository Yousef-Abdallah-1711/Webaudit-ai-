/**
 * T075 — the two-vendor startup check.
 *
 * quickstart.md: "Two vendors must be configured or the AI executor **refuses to
 * start** — Principle IV's two-vendor minimum is a startup check, not a runtime
 * surprise." The contract says the same: "configuration failing that is rejected
 * at startup, not at call time (FR-034)."
 *
 * Why startup and not call time. A one-vendor deployment is indistinguishable
 * from a healthy one until that vendor has an outage — at which point every
 * AI-layer finding in every running audit disappears at once, which is precisely
 * the event SC-012 exists to rule out. Checked at call time, the discovery
 * happens during the incident. Checked at boot, it happens during the deploy.
 *
 * **Vendors, not entries.** Counting chain length would pass
 * `[opus, sonnet, haiku]` — three entries, one company, one outage. The count is
 * over distinct vendors, case-folded, because a chain split by a capitalisation
 * typo in configuration is a chain of one wearing a disguise.
 */

import { MIN_PROVIDER_VENDORS } from '@webaudit/config';
import type { Provider } from './provider.js';

export class ChainConfigurationError extends Error {
  override readonly name = 'ChainConfigurationError';
  constructor(
    message: string,
    readonly vendorCount: number,
    readonly required: number = MIN_PROVIDER_VENDORS,
  ) {
    super(message);
  }
}

function vendorKey(provider: Provider): string {
  return provider.vendor.trim().toLowerCase();
}

/**
 * Validate a configured chain, returning it unchanged.
 *
 * Returns rather than mutating so the caller keeps the order it configured:
 * order *is* the fallback order, and re-sorting it — by cost, by latency, by
 * anything — would silently override an operational decision.
 *
 * @throws ChainConfigurationError before the process serves a request.
 */
export function buildChain(providers: readonly Provider[]): readonly Provider[] {
  if (providers.length === 0) {
    throw new ChainConfigurationError(
      'No AI providers are configured. The executor requires at least ' +
        `${String(MIN_PROVIDER_VENDORS)} distinct vendors (Principle IV).`,
      0,
    );
  }

  for (const [index, provider] of providers.entries()) {
    if (provider.vendor.trim() === '') {
      throw new ChainConfigurationError(
        `Provider at chain position ${String(index)} declares no vendor. ` +
          'The vendor is what the two-vendor minimum counts, so it cannot be blank.',
        0,
      );
    }
    if (provider.model.trim() === '') {
      throw new ChainConfigurationError(
        `Provider "${provider.vendor}" at chain position ${String(index)} declares no model.`,
        0,
      );
    }
  }

  // A duplicated configuration line reads as a longer chain and is one provider
  // asked twice — no extra resilience, twice the spend on a bad day.
  const seen = new Set<string>();
  for (const provider of providers) {
    const key = `${vendorKey(provider)}/${provider.model.trim().toLowerCase()}`;
    if (seen.has(key)) {
      throw new ChainConfigurationError(
        `Provider ${key} appears twice in the chain. A repeated entry adds spend, not resilience.`,
        new Set(providers.map(vendorKey)).size,
      );
    }
    seen.add(key);
  }

  const vendors = new Set(providers.map(vendorKey));
  if (vendors.size < MIN_PROVIDER_VENDORS) {
    throw new ChainConfigurationError(
      `The AI chain spans ${String(vendors.size)} vendor(s) — ` +
        `[${[...vendors].join(', ')}] — but Principle IV requires at least ` +
        `${String(MIN_PROVIDER_VENDORS)}. A chain of several models from one vendor ` +
        'fails entirely in one outage, which SC-012 forbids. Configure a second vendor.',
      vendors.size,
    );
  }

  return providers;
}

/** For a boot log line, so the configured order is visible in the record. */
export function describeChain(chain: readonly Provider[]): string {
  return chain.map((p) => `${p.vendor}/${p.model}`).join(' → ');
}
