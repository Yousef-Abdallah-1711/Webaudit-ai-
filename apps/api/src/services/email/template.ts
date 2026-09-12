export interface EmailTemplateInput {
  readonly title: string;
  readonly bodyHtml: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
}

export interface RenderedEmail {
  readonly html: string;
  readonly text: string;
}

export function escapeEmailHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
      character,
  );
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderEmail(input: EmailTemplateInput): RenderedEmail {
  const title = escapeEmailHtml(input.title);
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `<p style="margin:24px 0"><a href="${escapeEmailHtml(input.ctaUrl)}" style="background:#fe5a01;color:#fafafa;display:inline-block;padding:12px 18px;text-decoration:none;border-radius:6px">${escapeEmailHtml(input.ctaLabel)}</a></p>`
      : '';
  const html = [
    '<!doctype html><html><body style="margin:0;background:#f9fafb;color:#1f2937;font-family:Arial,sans-serif">',
    '<div style="max-width:600px;margin:0 auto;padding:32px 20px">',
    '<div style="font-size:24px;font-weight:700;margin-bottom:32px">Web<span style="color:#fe5a01">Audit</span> AI</div>',
    `<h1 style="font-size:24px;line-height:32px;margin:0 0 16px">${title}</h1>`,
    `<div style="font-size:16px;line-height:24px">${input.bodyHtml}</div>`,
    cta,
    '<p style="border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px;line-height:20px;margin:32px 0 0;padding-top:16px">WebAudit AI</p>',
    '</div></body></html>',
  ].join('');
  const ctaText = input.ctaLabel && input.ctaUrl ? `\n\n${input.ctaLabel}: ${input.ctaUrl}` : '';
  return {
    html,
    text: `WebAudit AI\n\n${input.title}\n\n${htmlToText(input.bodyHtml)}${ctaText}`.trim(),
  };
}
