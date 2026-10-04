import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION } from '@webaudit/config';
import { ScanHandoffForm } from './scan-handoff-form';

export async function FinalCta(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="final-cta"
      data-landing-section="final-cta"
      data-approved-section="final-cta"
      className="relative overflow-hidden bg-surface-hero px-6 pb-marketing-closing-bottom pt-marketing-closing-top text-center text-marketing-inverse max-marketing-mobile:px-4 max-marketing-mobile:pb-marketing-closing-bottom-mobile max-marketing-mobile:pt-marketing-closing-top-mobile"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-atmosphere opacity-70"
      />
      <div className="relative mx-auto max-w-marketing-section">
        <h2 className="mb-0 text-marketing-closing-heading leading-marketing-closing-heading font-black tracking-[-0.03em] text-balance text-marketing-inverse max-marketing-mobile:text-marketing-mobile-h2 max-marketing-mobile:leading-marketing-h2">
          {t('cta_h2', { freeCredits: FREE_ALLOCATION })}
        </h2>
        <p className="mx-auto mb-0 mt-3 max-w-marketing-prompt text-marketing-closing-copy leading-marketing-description text-marketing-inverse-muted text-pretty max-marketing-mobile:text-marketing-closing-copy-mobile">
          {t('cta_lead')}
        </p>
        <div className="mx-auto mt-7 max-w-landing-scanner rounded-marketing-card border border-solid border-border-marketing-inverse bg-surface-hero p-4 text-start shadow-marketing-float max-marketing-mobile:p-3">
          <ScanHandoffForm
            id="final-scan-url"
            label={t('hero_url_example_label')}
            placeholder={`https://${t('url_ph')}`}
            note={t('hero_handoff_note')}
            submitLabel={t('hero_cta')}
            tone="dark"
          />
        </div>
      </div>
    </section>
  );
}
