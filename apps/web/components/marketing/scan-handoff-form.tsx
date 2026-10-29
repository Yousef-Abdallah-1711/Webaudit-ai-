'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '../ui';
import { storeHeroScanUrl } from '../../lib/hero-scan-handoff';
import { cn } from '../../lib/cn';
import { focusRingHighlightOffset, marketingPrimaryCta } from '../../lib/marketing-cta';
import { marketingDarkInputControl, marketingInputControl } from '../../lib/marketing-controls';

export interface ScanHandoffFormProps {
  id: string;
  label: string;
  placeholder: string;
  note: string;
  submitLabel: string;
  className?: string;
  tone?: 'light' | 'dark';
}

export function ScanHandoffForm({
  id,
  label,
  placeholder,
  note,
  submitLabel,
  className,
  tone = 'light',
}: ScanHandoffFormProps): React.ReactElement {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState(false);
  const t = useTranslations('public');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setUrlError(true);
      return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      setUrlError(true);
      return;
    }
    setUrlError(false);
    storeHeroScanUrl(trimmed);
    window.location.assign('/signup');
  }

  return (
    <form action="/signup" onSubmit={handleSubmit} className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto] max-marketing-mobile:grid-cols-1',
          tone === 'dark' ? 'gap-marketing-form-gap' : 'gap-0',
        )}
      >
        <input
          id={id}
          type="url"
          inputMode="url"
          name="url"
          autoComplete="url"
          required
          dir="ltr"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (urlError) setUrlError(false);
          }}
          placeholder={placeholder}
          aria-invalid={urlError || undefined}
          aria-describedby={`${id}-note${urlError ? ` ${id}-error` : ''}`}
          className={cn(
            'h-landing-control min-w-0 rounded-control px-4 text-left font-mono text-sm',
            tone === 'dark' ? marketingDarkInputControl : marketingInputControl,
          )}
        />
        <Button
          type="submit"
          variant="primary"
          className={cn(
            'h-landing-control rounded-control px-6',
            marketingPrimaryCta,
            tone === 'dark' && focusRingHighlightOffset,
            'max-marketing-mobile:w-full',
          )}
        >
          {submitLabel}
        </Button>
      </div>
      <p
        id={`${id}-note`}
        className={cn(
          'mb-0 mt-2.5 text-start text-marketing-label',
          tone === 'dark' ? 'text-marketing-inverse-muted' : 'text-marketing-muted',
        )}
      >
        {note}
      </p>
      {urlError && (
        <p
          id={`${id}-error`}
          className="mb-0 mt-2 text-start text-marketing-label text-sev-critical"
          role="alert"
        >
          {t('hero_url_invalid')}
        </p>
      )}
    </form>
  );
}
