import { getTranslations } from 'next-intl/server';
import { REVERIFY_COST } from '@webaudit/config';
import { CopyPromptButton } from './copy-prompt-button';

const promptClass =
  'flex-none rounded-control border border-solid border-border-marketing-inverse bg-transparent px-3 py-2 type-small font-bold text-marketing-inverse hover:bg-surface-hero focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-highlight';

export async function Remediation(): Promise<React.ReactElement> {
  const t = await getTranslations('public');
  const rawPrompt: unknown = t.raw('report_prompt_text');
  const prompt = typeof rawPrompt === 'string' ? rawPrompt : '';

  return (
    <section
      id="remediation"
      data-approved-section="remediation"
      className="relative overflow-hidden bg-surface-dark px-6 py-marketing-remediation-section text-marketing-inverse max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-remediation-section"
      aria-labelledby="remediation-heading"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-atmosphere opacity-50"
      />
      <div className="relative mx-auto grid max-w-marketing-remediation grid-cols-[0.72fr_1.28fr] items-center gap-marketing-remediation-gap max-marketing-demo-compact:gap-marketing-remediation-tablet-gap max-marketing-tablet:grid-cols-[0.9fr_1.1fr] max-marketing-tablet:gap-marketing-remediation-compact-gap max-marketing-mobile:!grid-cols-1 max-marketing-mobile:!gap-marketing-remediation-mobile-gap">
        <div>
          <p className="mb-0 text-marketing-inverse-muted text-marketing-label font-extrabold">
            {t('remediation_eyebrow')}
          </p>
          <h2
            id="remediation-heading"
            className="mb-0 mt-3 text-marketing-remediation-heading leading-marketing-remediation-heading font-black tracking-[-0.03em] text-balance text-marketing-inverse"
          >
            {t('remediation_heading')}
          </h2>
          <p className="mb-0 mt-4 text-marketing-readiness-copy leading-marketing-description text-marketing-inverse-muted text-pretty">
            {t('remediation_intro', { reverifyCost: REVERIFY_COST })}
          </p>
          <div className="mt-6 border-s border-solid border-border-marketing-inverse ps-5">
            <h3 className="mb-0 text-marketing-trust-heading font-extrabold text-marketing-inverse">
              {t('ai_h2')}
            </h3>
            <p className="mb-0 mt-2 text-marketing-readiness-copy leading-marketing-description text-marketing-inverse-muted text-pretty">
              {t('ai_body')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-marketing-label font-bold">
              <span className="rounded-control border border-solid border-border-marketing-inverse px-3 py-2">
                {t('ai_build_label')}
              </span>
              <span aria-hidden="true" className="text-brand-highlight">
                →
              </span>
              <span className="rounded-control bg-brand-marketing px-3 py-2 text-marketing-inverse">
                {t('ai_verify_label')}
              </span>
            </div>
          </div>
        </div>

        <article
          className="rounded-marketing-repair border border-solid border-border-marketing-inverse bg-gradient-to-br from-surface-hero to-surface-dark py-marketing-principle-padding-y px-6 shadow-marketing-float max-marketing-mobile:p-4"
          aria-label={t('report_sample_label')}
        >
          <div className="flex items-center gap-2 text-marketing-trust-heading font-extrabold text-marketing-inverse">
            <span aria-hidden="true" className="size-marketing-dot rounded-full bg-sev-medium" />
            {t('report_finding_title')}
          </div>
          <div className="mt-3 flex gap-2">
            <span className="rounded-full bg-sev-medium-bg px-2.5 py-1 text-marketing-label font-extrabold text-sev-medium">
              {t('report_severity_medium')}
            </span>
            <span className="rounded-full bg-surface-ice px-2.5 py-1 text-marketing-label font-bold text-marketing-secondary">
              {t('a_perf')}
            </span>
          </div>
          <p className="mb-0 mt-3 type-body leading-[1.75] text-marketing-inverse-muted text-pretty">
            {t('report_description')}
          </p>
          <div className="mt-4 rounded-control bg-surface-dark p-3 text-marketing-inverse">
            <span className="mb-2 block text-marketing-inverse-muted text-marketing-micro">
              {t('report_evidence_label')} · <bdi dir="ltr">GET https://shop.example/</bdi>
            </span>
            <code dir="ltr" className="font-mono text-sm text-marketing-inverse-muted">
              {'{"cache-control":null}'}
            </code>
          </div>
          <div className="mt-4 rounded-control border border-solid border-border-marketing-inverse bg-surface-dark p-3 text-marketing-inverse-muted">
            <div className="flex items-center justify-between gap-3 text-marketing-label font-bold">
              <span>{t('report_prompt_label')}</span>
              <CopyPromptButton prompt={prompt} className={promptClass} />
            </div>
            <p className="mb-0 mt-3 font-mono text-marketing-label leading-[1.8]">
              {t('report_prompt_excerpt')}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-3 text-marketing-label font-bold text-marketing-inverse-muted">
            <span className="grid size-8 place-items-center rounded-full bg-brand-marketing font-mono text-marketing-inverse">
              {REVERIFY_COST}
            </span>
            <span>{t('report_recheck_cost', { reverifyCost: REVERIFY_COST })}</span>
          </div>
          <p className="mb-0 mt-4 text-marketing-muted text-marketing-micro">
            {t('report_sample_label')}
          </p>
        </article>
      </div>
    </section>
  );
}
