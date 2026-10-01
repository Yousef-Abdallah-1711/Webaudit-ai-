'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface CopyPromptButtonProps {
  readonly prompt: string;
  readonly className: string;
}

export function CopyPromptButton({ prompt, className }: CopyPromptButtonProps): React.ReactElement {
  const t = useTranslations('public');
  const [copied, setCopied] = useState(false);

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Keep the prompt selectable when clipboard access is unavailable.
    }
  }

  return (
    <button type="button" className={className} onClick={() => void copyPrompt()}>
      {copied ? t('report_copied') : t('report_copy')}
    </button>
  );
}
