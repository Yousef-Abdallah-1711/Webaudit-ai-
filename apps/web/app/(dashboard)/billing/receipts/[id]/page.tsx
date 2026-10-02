'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageHead } from '../../../../../components/dashboard';
import { ApiError, getReceiptHtml } from '../../../../../lib/api';
const styles = {
  error: 'm-0 mb-3 type-small text-sev-critical',
  frame: 'min-h-[47.5rem] w-full rounded-card border border-hairline border-border-default border-solid bg-surface-page',
} as const;

export default function BillingReceiptPage(): React.ReactElement {
  const t = useTranslations('billing');
  const params = useParams<{ id: string }>();
  const receiptId = params.id;
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    void getReceiptHtml(receiptId)
      .then((body) => {
        if (!cancelled) setHtml(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : t('billing_receipt_load_error'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [receiptId, t]);

  const srcDoc = useMemo(() => html ?? '<!doctype html><html><body></body></html>', [html]);

  return (
    <div>
      <PageHead
        eyebrow={t('billing_page_eyebrow')}
        title={t('billing_receipt_title')}
        meta={t('billing_receipt_meta', { receiptId: receiptId.slice(0, 8) })}
      />
      {error !== null && <p className={styles.error}>{error}</p>}
      <iframe
        className={styles.frame}
        title={t('billing_receipt_frame_title')}
        sandbox=""
        srcDoc={srcDoc}
      />
    </div>
  );
}
