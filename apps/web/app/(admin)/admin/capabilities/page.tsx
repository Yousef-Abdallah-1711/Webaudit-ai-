'use client';

/**
 * T213 — the capabilities catalogue screen, ported from
 * design-system/ui_kits/admin/AdminScreens.jsx's `Capabilities` (around
 * line 68-94). Route is `/admin/capabilities` per `design/screen-map.md`'s
 * routing table.
 *
 * Unlike the already-ported `Providers`/`Scans` pages (T244, local state
 * only), this is the first admin page backed by a real endpoint:
 * `GET /admin/capabilities` (T207) on mount, and a real mutation —
 * `PATCH /admin/capabilities/:id` — behind the per-row Enable/Disable
 * button, following the fetch/error-banner pattern from
 * `apps/web/app/(dashboard)/billing/page.tsx`.
 *
 * Deliberately does NOT port the mock's "Cost / run" column (`$0.031`
 * placeholders). `AdminCapabilitySummary` has no dollar-cost field — only
 * `estimatedTokens`, a token budget, not a cost — so the column is renamed
 * "Est. tokens" and shows that number instead. This is the same "don't
 * invent a figure the backend doesn't provide" call already made for
 * `AdminBillingPage` (T212)'s dropped margin percentage.
 *
 * The mock's "Run conformance suite" and "Upload capability" header actions
 * stay present but inert: no conformance-suite endpoint exists, and
 * `POST /admin/capabilities/upload` intentionally returns
 * `503 SANDBOX_UNAVAILABLE` until the sandbox runner is deployed. Same
 * designed-but-not-yet-wired precedent as `AdminProvidersPage`'s
 * "Add provider" and `AdminScansPage`'s search box.
 *
 * The two explanatory cards ("Disabling is safe", "Uploads are sandboxed or
 * refused") are ported verbatim — their text is accurate regardless of
 * whether the data behind the table is real or mocked.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Badge, Card } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import {
  ApiError,
  getAdminCapabilities,
  setCapabilityPlanRestrictions,
  setCapabilityEnabled,
  uploadCapability,
  type AdminCapabilitySummary,
} from '../../../../lib/api';
import styles from './page.module.css';

export default function AdminCapabilitiesPage(): React.ReactElement {
  const t = useTranslations('admin');
  const [capabilities, setCapabilities] = useState<readonly AdminCapabilitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadVersion, setUploadVersion] = useState('1.0.0');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [planRestrictions, setPlanRestrictions] = useState<Record<string, string[]>>({});
  const [pendingRestrictionId, setPendingRestrictionId] = useState<string | null>(null);
  const plans = ['free', 'starter', 'pro', 'business'] as const;
  const planLabels: Record<(typeof plans)[number], string> = {
    free: t('plan_free'),
    starter: t('plan_starter'),
    pro: t('plan_pro'),
    business: t('plan_business'),
  };
  const trustLabels: Readonly<Record<string, string>> = {
    VENDORED: t('status_vendored'),
    INSTALLED: t('status_installed'),
  };
  const moduleLabels: Readonly<Record<string, string>> = {
    PERFORMANCE: t('module_performance'),
    SECURITY: t('module_security'),
    UI: t('module_ui'),
    TESTING: t('module_testing'),
    SEO: t('module_seo'),
  };

  const refresh = useCallback(async () => {
    try {
      const { capabilities: rows } = await getAdminCapabilities();
      setCapabilities(rows);
      setPlanRestrictions(
        Object.fromEntries(rows.map((row) => [row.id, [...row.restrictedToPlans]])),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('capability_load_error'));
    }
  }, [t]);

  const onUpload = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (uploadFile === null || uploadName.trim() === '') {
      setError(t('capability_upload_missing_inputs'));
      return;
    }
    setUploading(true);
    setError(null);
    setUploadResult(null);
    try {
      const result = await uploadCapability(uploadFile, uploadName.trim(), uploadVersion.trim());
      setUploadResult(
        t(result.passed ? 'capability_conformance_passed' : 'capability_conformance_failed'),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('capability_upload_error'));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggle = useCallback(
    (id: string, isEnabled: boolean): void => {
      setPendingId(id);
      setError(null);
      setCapabilityEnabled(id, !isEnabled)
        .then(({ capability }) => {
          setCapabilities((rows) =>
            rows === null ? rows : rows.map((r) => (r.id === capability.id ? capability : r)),
          );
        })
        .catch((err: unknown) => {
          setError(err instanceof ApiError ? err.message : t('capability_update_error'));
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    [t],
  );

  const enabledCount = capabilities?.filter((c) => c.isEnabled).length ?? 0;

  const onSaveRestriction = async (id: string): Promise<void> => {
    setPendingRestrictionId(id);
    setError(null);
    try {
      const { capability } = await setCapabilityPlanRestrictions(id, planRestrictions[id] ?? []);
      setCapabilities((rows) =>
        rows === null ? rows : rows.map((row) => (row.id === id ? capability : row)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('capability_restriction_error'));
    } finally {
      setPendingRestrictionId(null);
    }
  };

  return (
    <div>
      <AHead
        eyebrow={t('group_catalogue')}
        title={t('capabilities')}
        meta={
          capabilities === null
            ? t('capabilities_meta_unloaded')
            : t('capabilities_meta', { discovered: capabilities.length, enabled: enabledCount })
        }
      />

      {error !== null && <p className={styles.error}>{error}</p>}
      {uploadResult !== null && <p className={styles.result}>{uploadResult}</p>}

      <form className={styles.uploadForm} onSubmit={(event) => void onUpload(event)}>
        <label className={styles.field}>
          <span>{t('capability_name')}</span>
          <input
            value={uploadName}
            onChange={(event) => setUploadName(event.target.value)}
            placeholder={t('capability_name_placeholder')}
          />
        </label>
        <label className={styles.field}>
          <span>{t('version')}</span>
          <input
            value={uploadVersion}
            onChange={(event) => setUploadVersion(event.target.value)}
            placeholder={t('version_placeholder')}
          />
        </label>
        <label className={styles.field}>
          <span>{t('bundle')}</span>
          <input
            type="file"
            accept=".js,.mjs,.cjs,.txt"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="submit" disabled={uploading}>
          {uploading ? t('uploading') : t('upload_capability')}
        </Button>
      </form>

      <Table
        cols={[
          { label: t('table_capability'), width: '1fr' },
          { label: t('table_area'), width: 150 },
          { label: t('table_trust'), width: 110 },
          { label: t('table_estimated_tokens'), width: 110 },
          { label: t('table_state'), width: 110 },
          { label: t('plan_access'), width: 260 },
          { label: '', width: 110 },
        ]}
        rows={
          capabilities?.map((c) => [
            mono(c.name),
            moduleLabels[c.module] ?? c.module,
            <Badge key="trust" tone={c.trust === 'trusted' ? 'success' : 'neutral'}>
              {trustLabels[c.trust] ?? c.trust}
            </Badge>,
            num(t('number_value', { value: c.estimatedTokens })),
            <Badge key="state" tone={c.isEnabled ? 'success' : 'neutral'}>
              {t(c.isEnabled ? 'status_enabled' : 'status_disabled')}
            </Badge>,
            <div key="plans" className={styles.planAccess}>
              {plans.map((plan) => (
                <label key={plan} className={styles.planOption}>
                  <input
                    type="checkbox"
                    checked={(planRestrictions[c.id] ?? []).includes(plan)}
                    onChange={(event) =>
                      setPlanRestrictions((current) => ({
                        ...current,
                        [c.id]: event.target.checked
                          ? [...(current[c.id] ?? []), plan]
                          : (current[c.id] ?? []).filter((id) => id !== plan),
                      }))
                    }
                  />
                  {planLabels[plan]}
                </label>
              ))}
              <Button
                variant="ghost"
                size="sm"
                disabled={pendingRestrictionId === c.id}
                onClick={() => void onSaveRestriction(c.id)}
              >
                {t('save')}
              </Button>
            </div>,
            <Button
              key="action"
              variant="ghost"
              size="sm"
              disabled={pendingId === c.id}
              onClick={() => {
                onToggle(c.id, c.isEnabled);
              }}
            >
              {t(c.isEnabled ? 'disable' : 'enable')}
            </Button>,
          ]) ?? []
        }
      />

      <p className={styles.planLegend}>
        {t('plan_access_legend', {
          free: planLabels.free,
          starter: planLabels.starter,
          pro: planLabels.pro,
          business: planLabels.business,
        })}
      </p>

      <div className={styles.grid}>
        <Card padding={20} title={t('disabling_safe_title')} accentRule="var(--sev-resolved)">
          <p className={styles.cardText}>{t('disabling_safe_body')}</p>
        </Card>
        <Card padding={20} title={t('uploads_sandboxed_title')} accentRule="var(--sev-high)">
          <p className={styles.cardText}>{t('uploads_sandboxed_body')}</p>
        </Card>
      </div>
    </div>
  );
}
