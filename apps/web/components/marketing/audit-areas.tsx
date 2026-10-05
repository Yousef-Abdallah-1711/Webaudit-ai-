'use client';

/** Interactive Fahes audit-area selector, using current localized scope and configured costs. */
import { useRef, useState, type KeyboardEvent } from 'react';
import { ALL_AREAS, AREA_COST, FULL_AUDIT_COST, SUM_OF_AREAS } from '@webaudit/config';
import { useTranslations } from 'next-intl';
import { cn } from '../../lib/cn';
import { gradientSurface } from '../../lib/marketing-cta';
import { MarketingSectionHeader } from './section-header';
import type enPublic from '../../messages/en/public.json';

type PublicKey = keyof typeof enPublic;
const AREA_COPY: Record<(typeof ALL_AREAS)[number], readonly [PublicKey, PublicKey]> = {
  PERFORMANCE: ['a_perf', 'a_perf_d'],
  SECURITY: ['a_sec', 'a_sec_d'],
  UI: ['a_des', 'a_des_d'],
  TESTING: ['a_test', 'a_test_d'],
  SEO: ['a_seo', 'a_seo_d'],
};

export function AuditAreas(): React.ReactElement {
  const t = useTranslations('public');
  const [selected, setSelected] = useState<(typeof ALL_AREAS)[number]>(
    ALL_AREAS[0] ?? 'PERFORMANCE',
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const rtl = document.documentElement.dir === 'rtl';
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ALL_AREAS.length - 1;
    else {
      const forwardKey = rtl ? 'ArrowLeft' : 'ArrowRight';
      const delta = event.key === forwardKey ? 1 : -1;
      next = (index + delta + ALL_AREAS.length) % ALL_AREAS.length;
    }
    const area = ALL_AREAS[next];
    if (!area) return;
    setSelected(area);
    tabRefs.current[next]?.focus();
  }

  const [titleKey, descriptionKey] = AREA_COPY[selected];
  return (
    <section
      id="areas"
      data-landing-section="areas"
      data-approved-section="areas"
      className="bg-surface-ice px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile"
      aria-labelledby="areas-heading"
    >
      <MarketingSectionHeader
        id="areas-heading"
        number="07"
        eyebrow={t('areas_eyebrow', { areaCount: ALL_AREAS.length })}
        title={t('areas_h2')}
        lead={t('areas_intro')}
      />
      <div className="mx-auto max-w-marketing-area-explorer rounded-marketing-explorer border border-solid border-border-marketing bg-surface-marketing-raised p-marketing-area-explorer-padding shadow-marketing-explorer max-marketing-mobile:p-3">
        <div
          className="flex gap-2 overflow-x-auto border-b border-solid border-border-marketing pb-4"
          role="tablist"
          aria-label={t('areas_h2')}
        >
          {ALL_AREAS.map((area, index) => {
            const [nameKey] = AREA_COPY[area];
            const active = selected === area;
            return (
              <button
                key={area}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={`audit-area-tab-${area.toLowerCase()}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="audit-area-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => setSelected(area)}
                onKeyDown={(event) => moveFocus(event, index)}
                className={cn(
                  'min-h-marketing-area-tab flex-none rounded-full border border-solid border-border-marketing bg-transparent px-marketing-area-tab-x text-xs font-bold text-marketing-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-electric focus-visible:outline-offset-2 max-marketing-mobile:min-h-marketing-area-tab-mobile max-marketing-mobile:px-marketing-area-tab-x-mobile max-marketing-mobile:text-marketing-label',
                  active && ['border-transparent', gradientSurface],
                )}
              >
                {t(nameKey)}
              </button>
            );
          })}
        </div>
        <div
          id="audit-area-panel"
          role="tabpanel"
          aria-labelledby={`audit-area-tab-${selected.toLowerCase()}`}
          tabIndex={0}
          className="min-h-marketing-area-panel px-marketing-area-panel-x pb-marketing-area-panel-bottom pt-marketing-area-panel-top focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-electric max-marketing-mobile:min-h-marketing-area-panel-mobile max-marketing-mobile:px-marketing-area-panel-x-mobile max-marketing-mobile:pt-marketing-area-panel-top-mobile"
        >
          <div className="flex items-center justify-between gap-4 max-marketing-narrow:items-start">
            <h3 className="m-0 text-marketing-area-heading font-black text-marketing-primary">
              {t(titleKey)}
            </h3>
            <span
              dir="ltr"
              className="flex-none rounded-full bg-surface-electric-soft px-3 py-1.5 font-mono text-marketing-label font-bold text-brand-electric"
            >
              {t('area_cost', { credits: AREA_COST[selected] })}
            </span>
          </div>
          <p className="mb-0 mt-3 max-w-marketing-wide-copy text-marketing-readiness-copy leading-marketing-body text-marketing-secondary text-pretty">
            {t(descriptionKey)}
          </p>
        </div>
        <p className="mb-1 mt-0 px-3 text-marketing-muted text-marketing-micro">
          {t('areas_note', {
            areaCount: ALL_AREAS.length,
            individualCost: SUM_OF_AREAS,
            fullAuditCost: FULL_AUDIT_COST,
          })}
        </p>
      </div>
    </section>
  );
}
