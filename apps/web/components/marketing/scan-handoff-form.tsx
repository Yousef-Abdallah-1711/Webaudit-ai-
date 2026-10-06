'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '../ui';
import { storeHeroScanUrl } from '../../lib/hero-scan-handoff';
import { cn } from '../../lib/cn';
import { marketingPrimaryCta } from '../../lib/marketing-cta';

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

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    storeHeroScanUrl(url);
    window.location.assign('/signup');
  }

  return (
    <form action="/signup" onSubmit={handleSubmit} className={className}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-marketing-form max-marketing-mobile:grid-cols-1">
        <input
          id={id}
          type="text"
          inputMode="url"
          name="url"
          autoComplete="url"
          dir="ltr"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={placeholder}
          className="h-landing-control min-w-0 rounded-control border border-solid border-[color:var(--border-marketing-control)] bg-surface-marketing-raised px-4 text-left font-mono text-sm text-marketing-primary placeholder:text-marketing-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-electric"
        />
      <Button
        type="submit"
        variant="primary"
        className={cn('h-landing-control rounded-control px-6', marketingPrimaryCta, 'max-marketing-mobile:w-full')}
      >
          {submitLabel}
        </Button>
      </div>
      <p className={cn('mb-0 mt-2.5 text-start text-marketing-label', tone === 'dark' ? 'text-marketing-inverse-muted' : 'text-marketing-muted')}>{note}</p>
    </form>
  );
}
