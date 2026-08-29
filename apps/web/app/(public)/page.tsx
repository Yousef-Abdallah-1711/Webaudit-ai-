'use client';

/**
 * Ported from design-system/ui_kits/marketing/Landing.jsx (T240).
 *
 * One file, same as the source: `Wrap`, `Hero`, `Difference`, `Areas`,
 * `Proof`, `Loop`, `FinalCta`, composed by the default export. `Proof`
 * renders `<ScoreArc>`/`<ModuleStatus>` directly — this folds in T131/T132
 * ahead of Phase 3, by explicit user decision (see tasks.md).
 *
 * `Wrap`'s source signature is `({tint, children, pad='88px 24px'})`; `pad`
 * is dropped here. No call site in this file (or anywhere else yet) passes
 * a non-default value, and the default itself is a raw px string this
 * repo's adherence lint forbids in a .tsx file (T245) — the default lives
 * in page.module.css's `.wrap` instead. Re-add the prop if a future page
 * genuinely needs a different padding.
 *
 * Every hook here (`useT`, `useState`) requires this to be a Client
 * Component — same reason as `Public.tsx`.
 */
import { useState } from 'react';
import {
  Button,
  Card,
  Eyebrow,
  Input,
  PromoBar,
  StatRow,
  TwoToneHeading,
} from '../../components/ui';
import { ModuleStatus, ScoreArc } from '../../components/report';
import { PublicPage } from '../../components/public';
import { useT } from '../theme';
import type { StringKey } from '../../lib/strings';
import styles from './page.module.css';

interface WrapProps {
  tint?: string;
  children?: React.ReactNode;
}

function Wrap({ tint, children }: WrapProps): React.ReactElement {
  return (
    <section className={styles.wrap} style={tint !== undefined ? { background: tint } : undefined}>
      <div className={styles.wrapInner}>{children}</div>
    </section>
  );
}

function Hero(): React.ReactElement {
  const [t] = useT();
  const [url, setUrl] = useState('');

  return (
    <section className={styles.hero}>
      <div className={styles.heroWash} />
      <div className={styles.heroInner}>
        <TwoToneHeading lead={t('hero_lead')} accent={t('hero_accent')} />
        <p className={styles.heroSub}>{t('hero_sub')}</p>
        <div className={styles.heroForm}>
          <div className={styles.heroInputWrap}>
            <Input
              prefix="https://"
              placeholder={t('url_ph')}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
              }}
            />
          </div>
          <Button href="/register">{t('hero_cta')}</Button>
        </div>
        <div className={styles.heroStats}>
          <StatRow
            align="center"
            items={[
              { value: '50', label: t('stat_credits') },
              { value: '5', label: t('stat_areas') },
              { value: '3', label: t('stat_recheck') },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

const DIFFERENCE_CARDS: readonly (readonly [StringKey, StringKey])[] = [
  ['diff_1t', 'diff_1d'],
  ['diff_2t', 'diff_2d'],
  ['diff_3t', 'diff_3d'],
];

function Difference(): React.ReactElement {
  const [t] = useT();

  return (
    <Wrap tint="var(--surface-raised)">
      <Eyebrow tone="accent">{t('diff_eyebrow')}</Eyebrow>
      <h2 className={styles.diffH2}>{t('diff_h2')}</h2>
      <p className={styles.diffLead}>{t('diff_lead')}</p>
      <div className={styles.diffGrid}>
        {DIFFERENCE_CARDS.map(([title, body]) => (
          <Card key={title} title={t(title)} padding={20}>
            <p className={styles.diffCardText}>{t(body)}</p>
          </Card>
        ))}
      </div>
    </Wrap>
  );
}

const AREA_ROWS: readonly (readonly [StringKey, StringKey, number])[] = [
  ['a_perf', 'a_perf_d', 20],
  ['a_sec', 'a_sec_d', 25],
  ['a_des', 'a_des_d', 20],
  ['a_test', 'a_test_d', 20],
  ['a_seo', 'a_seo_d', 10],
];

function Areas(): React.ReactElement {
  const [t] = useT();

  return (
    <Wrap>
      <Eyebrow tone="accent">{t('areas_eyebrow')}</Eyebrow>
      <h2 className={styles.areasH2}>{t('areas_h2')}</h2>
      <div className={styles.areasList}>
        {AREA_ROWS.map(([name, desc, credits], i) => (
          <div
            key={name}
            className={i > 0 ? `${styles.areaRow} ${styles.areaRowBordered}` : styles.areaRow}
          >
            <div className={styles.areaName}>{t(name)}</div>
            <div className={styles.areaDesc}>{t(desc)}</div>
            <div dir="ltr" className={styles.areaCredits}>
              {credits} cr
            </div>
          </div>
        ))}
      </div>
      <p className={styles.areasNote}>{t('areas_note')}</p>
    </Wrap>
  );
}

function Proof(): React.ReactElement {
  const [t] = useT();

  return (
    <Wrap tint="var(--surface-sunken)">
      <div className={styles.proofRow}>
        <ScoreArc score={84} delta={23} />
        <div className={styles.proofModules}>
          <ModuleStatus area={t('a_sec')} state="complete" issues={7} />
          <ModuleStatus area={t('a_perf')} state="complete" issues={4} />
          <ModuleStatus area={t('a_test')} state="degraded" detail="2 / 5" />
        </div>
      </div>
      <p className={styles.proofNote}>{t('proof_note')}</p>
    </Wrap>
  );
}

const LOOP_STEPS: readonly (readonly [string, StringKey, StringKey])[] = [
  ['01', 'loop_1t', 'loop_1d'],
  ['02', 'loop_2t', 'loop_2d'],
  ['03', 'loop_3t', 'loop_3d'],
  ['04', 'loop_4t', 'loop_4d'],
];

function Loop(): React.ReactElement {
  const [t] = useT();

  return (
    <Wrap>
      <Eyebrow tone="accent">{t('loop_eyebrow')}</Eyebrow>
      <h2 className={styles.loopH2}>{t('loop_h2')}</h2>
      <div className={styles.loopGrid}>
        {LOOP_STEPS.map(([n, title, body]) => (
          <div key={n} className={styles.loopStep}>
            <div dir="ltr" className={styles.loopNum}>
              {n}
            </div>
            <div className={styles.loopTitle}>{t(title)}</div>
            <div className={styles.loopDesc}>{t(body)}</div>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function FinalCta(): React.ReactElement {
  const [t] = useT();

  return (
    <section className={styles.cta}>
      <div className={styles.ctaWash} />
      <div className={styles.ctaInner}>
        <h2 className={styles.ctaH2}>{t('cta_h2')}</h2>
        <p className={styles.ctaLead}>{t('cta_lead')}</p>
        <Button href="/register">{t('hero_cta')}</Button>
      </div>
    </section>
  );
}

export default function LandingPage(): React.ReactElement {
  const [t] = useT();

  return (
    <div>
      <PromoBar message={t('promo')} code="START50" />
      <PublicPage active="nav_product">
        <Hero />
        <Difference />
        <Proof />
        <Areas />
        <Loop />
        <FinalCta />
      </PublicPage>
    </div>
  );
}
