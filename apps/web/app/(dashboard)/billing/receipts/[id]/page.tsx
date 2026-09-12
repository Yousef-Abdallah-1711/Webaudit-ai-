'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHead } from '../../../../../components/dashboard';
import { ApiError, getReceiptHtml } from '../../../../../lib/api';
import styles from './page.module.css';

export default function BillingReceiptPage(): React.ReactElement {
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
        setError(err instanceof ApiError ? err.message : 'The receipt could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  const srcDoc = useMemo(() => html ?? '<!doctype html><html><body></body></html>', [html]);

  return (
    <div>
      <PageHead eyebrow="Billing" title="Receipt" meta={`receipt ${receiptId.slice(0, 8)}`} />
      {error !== null && <p className={styles.error}>{error}</p>}
      <iframe className={styles.frame} title="Payment receipt" sandbox="" srcDoc={srcDoc} />
    </div>
  );
}
