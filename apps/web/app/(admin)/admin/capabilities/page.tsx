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
    free: 'Free',
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
  };

  const refresh = useCallback(async () => {
    try {
      const { capabilities: rows } = await getAdminCapabilities();
      setCapabilities(rows);
      setPlanRestrictions(
        Object.fromEntries(rows.map((row) => [row.id, [...row.restrictedToPlans]])),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'The capability catalogue could not be loaded.',
      );
    }
  }, []);

  const onUpload = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (uploadFile === null || uploadName.trim() === '') {
      setError('Choose a bundle and provide its capability name.');
      return;
    }
    setUploading(true);
    setError(null);
    setUploadResult(null);
    try {
      const result = await uploadCapability(uploadFile, uploadName.trim(), uploadVersion.trim());
      setUploadResult(result.passed ? 'Conformance passed.' : 'Conformance failed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The capability upload failed.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggle = useCallback((id: string, isEnabled: boolean): void => {
    setPendingId(id);
    setError(null);
    setCapabilityEnabled(id, !isEnabled)
      .then(({ capability }) => {
        setCapabilities((rows) =>
          rows === null ? rows : rows.map((r) => (r.id === capability.id ? capability : r)),
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'That capability could not be updated.');
      })
      .finally(() => {
        setPendingId(null);
      });
  }, []);

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
      setError(err instanceof ApiError ? err.message : 'The plan restriction could not be saved.');
    } finally {
      setPendingRestrictionId(null);
    }
  };

  return (
    <div>
      <AHead
        eyebrow="Catalogue"
        title="Capabilities"
        meta={
          capabilities === null
            ? 'trust derives from discovery root'
            : `${String(capabilities.length)} discovered · ${String(enabledCount)} enabled · trust derives from discovery root`
        }
      />

      {error !== null && <p className={styles.error}>{error}</p>}
      {uploadResult !== null && <p className={styles.result}>{uploadResult}</p>}

      <form className={styles.uploadForm} onSubmit={(event) => void onUpload(event)}>
        <label className={styles.field}>
          <span>Capability name</span>
          <input
            value={uploadName}
            onChange={(event) => setUploadName(event.target.value)}
            placeholder="Security checks"
          />
        </label>
        <label className={styles.field}>
          <span>Version</span>
          <input
            value={uploadVersion}
            onChange={(event) => setUploadVersion(event.target.value)}
            placeholder="1.0.0"
          />
        </label>
        <label className={styles.field}>
          <span>Bundle</span>
          <input
            type="file"
            accept=".js,.mjs,.cjs,.txt"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="submit" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload capability'}
        </Button>
      </form>

      <Table
        cols={[
          { label: 'Capability', width: '1fr' },
          { label: 'Area', width: 150 },
          { label: 'Trust', width: 110 },
          { label: 'Est. tokens', width: 110 },
          { label: 'State', width: 110 },
          { label: 'Plan access', width: 260 },
          { label: '', width: 110 },
        ]}
        rows={
          capabilities?.map((c) => [
            mono(c.name),
            c.module,
            <Badge key="trust" tone={c.trust === 'trusted' ? 'success' : 'neutral'}>
              {c.trust}
            </Badge>,
            num(String(c.estimatedTokens)),
            <Badge key="state" tone={c.isEnabled ? 'success' : 'neutral'}>
              {c.isEnabled ? 'enabled' : 'disabled'}
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
                Save
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
              {c.isEnabled ? 'Disable' : 'Enable'}
            </Button>,
          ]) ?? []
        }
      />

      <p className={styles.planLegend}>Plan access: Free · Starter · Pro · Business</p>

      <div className={styles.grid}>
        <Card padding={20} title="Disabling is safe" accentRule="var(--sev-resolved)">
          <p className={styles.cardText}>
            Disabling any single capability still lets every audit complete. Its area reports the
            check unavailable and the customer is not charged for it.
          </p>
        </Card>
        <Card padding={20} title="Uploads are sandboxed or refused" accentRule="var(--sev-high)">
          <p className={styles.cardText}>
            Until the sandbox runner is deployed, upload returns{' '}
            <span className={styles.code}>503 SANDBOX_UNAVAILABLE</span>. There is no unsandboxed
            fallback path.
          </p>
        </Card>
      </div>
    </div>
  );
}
