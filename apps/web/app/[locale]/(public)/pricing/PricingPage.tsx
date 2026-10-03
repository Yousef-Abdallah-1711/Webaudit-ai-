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
 * `useLang()` keeps this a Client Component so the existing language-based
 * headline direction updates with the active language.
 */
import { Badge, Button, Eyebrow } from '../../../../components/ui';
import { PublicPage } from '../../../../components/public';
import { useTranslations } from 'next-intl';
import {
  ALL_AREAS,
  AREA_COST,
  FULL_AUDIT_COST,
  PLAN_TIERS,
  READINESS_PASS_COST,
  REVERIFY_COST,
} from '@webaudit/config';
import { useLang } from '../../../theme';
import { localeMetadata } from '../../../../i18n/locales';

type CountedFeatureKey =
  | 'pricing_feature_concurrent_audits'
  | 'pricing_feature_retention_days'
  | 'pricing_feature_retention_months';

type StaticFeatureKey =
  | 'pricing_feature_url_input'
  | 'pricing_feature_readiness_pass'
  | 'pricing_feature_repository_input'
  | 'pricing_feature_load_generation'
  | 'pricing_feature_everything_pro';

type PricingFeature =
  | { readonly key: CountedFeatureKey; readonly count: number }
  | { readonly key: StaticFeatureKey };

interface Tier {
  readonly nameKey:
    | 'pricing_tier_free'
    | 'pricing_tier_starter'
    | 'pricing_tier_pro'
    | 'pricing_tier_business';
  readonly credits: number;
  readonly creditsKey: 'pricing_credits_once' | 'pricing_credits_monthly';
  readonly price: string;
  readonly feat: readonly PricingFeature[];
  readonly ctaKey:
    | 'pricing_cta_start_free'
    | 'pricing_cta_choose_starter'
    | 'pricing_cta_choose_pro'
    | 'pricing_cta_choose_business';
  readonly pop: boolean;
}

type PlanTierId = (typeof PLAN_TIERS)[number]['id'];

const PLAN_CREDITS = Object.fromEntries(
  PLAN_TIERS.map(({ id, monthlyCredits }) => [id, monthlyCredits]),
) as Record<PlanTierId, number>;

const AREA_COST_VALUES = Object.values(AREA_COST);
const MIN_AREA_COST = Math.min(...AREA_COST_VALUES);
const MAX_AREA_COST = Math.max(...AREA_COST_VALUES);

const TIERS: readonly Tier[] = [
  {
    nameKey: 'pricing_tier_free',
    credits: PLAN_CREDITS.free,
    creditsKey: 'pricing_credits_once',
    price: '$0',
    feat: [
      { key: 'pricing_feature_concurrent_audits', count: 1 },
      { key: 'pricing_feature_retention_days', count: 7 },
      { key: 'pricing_feature_url_input' },
    ],
    ctaKey: 'pricing_cta_start_free',
    pop: false,
  },
  {
    nameKey: 'pricing_tier_starter',
    credits: PLAN_CREDITS.starter,
    creditsKey: 'pricing_credits_monthly',
    price: '$29',
    feat: [
      { key: 'pricing_feature_concurrent_audits', count: 1 },
      { key: 'pricing_feature_retention_days', count: 30 },
      { key: 'pricing_feature_readiness_pass' },
    ],
    ctaKey: 'pricing_cta_choose_starter',
    pop: false,
  },
  {
    nameKey: 'pricing_tier_pro',
    credits: PLAN_CREDITS.pro,
    creditsKey: 'pricing_credits_monthly',
    price: '$99',
    feat: [
      { key: 'pricing_feature_concurrent_audits', count: 3 },
      { key: 'pricing_feature_retention_months', count: 12 },
      { key: 'pricing_feature_repository_input' },
      { key: 'pricing_feature_load_generation' },
    ],
    ctaKey: 'pricing_cta_choose_pro',
    pop: true,
  },
  {
    nameKey: 'pricing_tier_business',
    credits: PLAN_CREDITS.business,
    creditsKey: 'pricing_credits_monthly',
    price: '$299',
    feat: [
      { key: 'pricing_feature_concurrent_audits', count: 6 },
      { key: 'pricing_feature_retention_months', count: 24 },
      { key: 'pricing_feature_everything_pro' },
    ],
    ctaKey: 'pricing_cta_choose_business',
    pop: false,
  },
];

interface CostRow {
  readonly labelKey:
    | 'pricing_cost_one_area'
    | 'pricing_cost_full_audit'
    | 'pricing_cost_targeted_recheck'
    | 'pricing_cost_readiness_pass';
  readonly credits: number | { readonly minimum: number; readonly maximum: number };
}

const COST_ROWS: readonly CostRow[] = [
  { labelKey: 'pricing_cost_one_area', credits: { minimum: MIN_AREA_COST, maximum: MAX_AREA_COST } },
  { labelKey: 'pricing_cost_full_audit', credits: FULL_AUDIT_COST },
  { labelKey: 'pricing_cost_targeted_recheck', credits: REVERIFY_COST },
  { labelKey: 'pricing_cost_readiness_pass', credits: READINESS_PASS_COST },
];

export function TierGrid(): React.ReactElement {
  const t = useTranslations('public');

  return (
    // eslint-disable-next-line no-restricted-syntax -- preserve source CSS breakpoints at 900px and 720px
    <div className="grid grid-cols-4 gap-4 max-[900px]:grid-cols-2 max-[720px]:grid-cols-1">
      {TIERS.map((tier) => (
        <div
          key={tier.nameKey}
          className={`flex flex-col gap-3.5 rounded-card bg-surface-page p-6 border border-hairline border-solid ${tier.pop ? 'border-accent' : 'border-border-default'}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[1.125rem] font-bold">{t(tier.nameKey)}</span>
            {tier.pop && <Badge tone="accent">{t('pricing_badge_most_depth')}</Badge>}
          </div>
          <div>
            <span className="type-h3">{tier.price}</span>
            <span className="type-small text-text-muted">{t('pricing_price_period_month')}</span>
          </div>
          <div className="font-mono text-[0.8125rem] text-text-secondary">
            {t(tier.creditsKey, { count: tier.credits })}
          </div>
          <div className="flex flex-1 flex-col gap-2 border-x-0 border-b-0 border-t-hairline border-solid border-border-default pt-3.5">
            {tier.feat.map((feature) => (
              <div
                key={feature.key + ('count' in feature ? feature.count : '')}
                className="type-small text-text-primary"
              >
                {'count' in feature
                  ? t(feature.key, { count: feature.count })
                  : t(feature.key)}
              </div>
            ))}
          </div>
          <Button variant={tier.pop ? 'primary' : 'secondary'} fullWidth href="/signup">
            {t(tier.ctaKey)}
          </Button>
        </div>
      ))}
    </div>
  );
}

export function CostTable(): React.ReactElement {
  const t = useTranslations('public');

  return (
    <div>
      <Eyebrow tone="accent">{t('pricing_cost_eyebrow')}</Eyebrow>
      <div className="mt-3 border border-hairline border-solid border-border-default">
        {COST_ROWS.map((row, i) => (
          <div
            key={row.labelKey}
            className={`flex px-[1.125rem] py-3.5 ${i > 0 ? 'border-x-0 border-b-0 border-t-hairline border-solid border-border-default' : ''}`}
          >
            <span className="type-body !tracking-normal">
              {row.labelKey === 'pricing_cost_full_audit'
                ? t(row.labelKey, { areaCount: ALL_AREAS.length })
                : t(row.labelKey)}
            </span>
            <span className="ms-auto font-mono text-[0.875rem]">
              {typeof row.credits === 'number'
                ? t('pricing_cost_amount', { credits: row.credits })
                : t('pricing_cost_range', row.credits)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3.5 type-small text-text-muted">{t('pricing_cost_note')}</p>
    </div>
  );
}

export default function PricingPage(): React.ReactElement {
  const t = useTranslations('public');
  const [lang] = useLang();
  const dir = localeMetadata[lang].direction === 'rtl' ? 'ltr' : undefined;

  return (
    <PublicPage active="nav_pricing">
      <section dir={dir} className="px-6 pt-[4.5rem] pb-11 text-center">
        <h1 className="m-0 type-display">{t('pricing_headline')}</h1>
        <p className="mx-auto mt-[1.125rem] mb-0 max-w-[56ch] type-lead text-text-secondary">{t('pricing_lead')}</p>
      </section>
      <section dir={dir} className="px-6 pb-20">
        <div className="mx-auto max-w-public-shell">
          <TierGrid />
        </div>
        <div className="mx-auto mt-14 max-w-marketing">
          <CostTable />
        </div>
      </section>
    </PublicPage>
  );
}
