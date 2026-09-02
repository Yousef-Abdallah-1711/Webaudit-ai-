'use client';

/**
 * T193 — the pricing page, ported from
 * design-system/ui_kits/marketing/Pricing.jsx (`PricingPage`, `TierGrid`,
 * `CostTable`).
 *
 * The tier prices ($0 / $29 / $99 / $299) are the vendored source's own
 * placeholder figures — monetary price points are an unresolved open item
 * (see research.md / CLAUDE.md "Known open items" #3), so this port keeps
 * the source's numbers rather than inventing a wiring to `GET /billing/plans`
 * that the marketing page has no session for. The credit and retention
 * figures do match `packages/config`'s `PLAN_TIERS`.
 *
 * `useT()` (a hook) makes this a Client Component, same as
 * `app/(public)/page.tsx` — the source reads `lang` only to hold the
 * headline sections LTR under an Arabic layout.
 */
import { Badge, Button, Eyebrow } from '../../../components/ui';
import { PublicPage } from '../../../components/public';
import { useT } from '../../theme';
import styles from './page.module.css';

interface Tier {
  readonly name: string;
  readonly credits: string;
  readonly price: string;
  readonly feat: readonly string[];
  readonly cta: string;
  readonly pop: boolean;
}

const TIERS: readonly Tier[] = [
  {
    name: 'Free',
    credits: '50, once',
    price: '$0',
    feat: ['1 concurrent audit', '7-day retention', 'URL input'],
    cta: 'Start free',
    pop: false,
  },
  {
    name: 'Starter',
    credits: '300 / mo',
    price: '$29',
    feat: ['1 concurrent audit', '30-day retention', 'Readiness pass'],
    cta: 'Choose Starter',
    pop: false,
  },
  {
    name: 'Pro',
    credits: '1,200 / mo',
    price: '$99',
    feat: ['3 concurrent audits', '12-month retention', 'Repository input', 'Load generation'],
    cta: 'Choose Pro',
    pop: true,
  },
  {
    name: 'Business',
    credits: '4,000 / mo',
    price: '$299',
    feat: ['6 concurrent audits', '24-month retention', 'Everything in Pro'],
    cta: 'Choose Business',
    pop: false,
  },
];

const COST_ROWS: readonly (readonly [string, string])[] = [
  ['One audit area', '10–25'],
  ['Full audit, all five, bundled', '80'],
  ['Targeted re-check of one issue', '3'],
  ['Production-readiness pass', '60'],
];

export function TierGrid(): React.ReactElement {
  return (
    <div className={styles.tierGrid}>
      {TIERS.map((t) => (
        <div
          key={t.name}
          className={t.pop ? `${styles.tier} ${styles.tierPop}` : styles.tier}
        >
          <div className={styles.tierHead}>
            <span className={styles.tierName}>{t.name}</span>
            {t.pop && <Badge tone="accent">Most depth</Badge>}
          </div>
          <div>
            <span className={styles.tierPrice}>{t.price}</span>
            <span className={styles.tierPer}> / mo</span>
          </div>
          <div className={styles.tierCredits}>{t.credits}</div>
          <div className={styles.tierFeat}>
            {t.feat.map((x) => (
              <div key={x} className={styles.tierFeatItem}>
                {x}
              </div>
            ))}
          </div>
          <Button variant={t.pop ? 'primary' : 'secondary'} fullWidth href="/signup">
            {t.cta}
          </Button>
        </div>
      ))}
    </div>
  );
}

export function CostTable(): React.ReactElement {
  return (
    <div>
      <Eyebrow tone="accent">What things cost</Eyebrow>
      <div className={styles.costTable}>
        {COST_ROWS.map(([label, credits], i) => (
          <div
            key={label}
            className={i > 0 ? `${styles.costRow} ${styles.costRowBordered}` : styles.costRow}
          >
            <span className={styles.costLabel}>{label}</span>
            <span className={styles.costValue}>{credits} cr</span>
          </div>
        ))}
      </div>
      <p className={styles.costNote}>
        Top-ups are paid-plan only. Platform faults, provider outages and internal errors refund
        or never debit.
      </p>
    </div>
  );
}

export default function PricingPage(): React.ReactElement {
  const [, lang] = useT();
  const dir = lang === 'ar' ? 'ltr' : undefined;

  return (
    <PublicPage active="nav_pricing">
      <section dir={dir} className={styles.headSection}>
        <h1 className={styles.h1}>Credits, not seats.</h1>
        <p className={styles.lead}>
          Plan credits expire at renewal. Purchased top-ups never expire, and expiring credits
          are always spent first.
        </p>
      </section>
      <section dir={dir} className={styles.bodySection}>
        <div className={styles.tierWrap}>
          <TierGrid />
        </div>
        <div className={styles.costWrap}>
          <CostTable />
        </div>
      </section>
    </PublicPage>
  );
}
