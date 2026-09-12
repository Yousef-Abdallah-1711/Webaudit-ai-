import { Prisma, type PrismaClient } from '../../../prisma/generated/client/index.js';
import type { PaymentEvent } from './payment-provider.js';

export interface BillingReceiptInput {
  readonly id: string;
  readonly userId: string;
  readonly kind: string;
  readonly providerReference: string;
  readonly amountMicros: number;
  readonly metadata: Readonly<Record<string, string>>;
  readonly paidAt: Date;
}

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function dollarsFromMicros(micros: number): string {
  return (micros / 1_000_000).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function renderBillingReceiptHtml(input: BillingReceiptInput): string {
  const metadataRows = Object.entries(input.metadata)
    .map(([key, value]) => `<tr><td>${esc(key)}</td><td>${esc(value)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment receipt ${esc(input.id)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; background: #f9fafb; }
  .card { max-width: 720px; margin: 48px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .head { padding: 28px 32px; background: #eff6ff; border-bottom: 1px solid #e5e7eb; }
  .eyebrow { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #1d4ed8; font-weight: 700; }
  h1 { margin: 8px 0 0; font-size: 28px; color: #111827; }
  .body { padding: 24px 32px 32px; }
  .amount { font-size: 32px; font-weight: 700; color: #111827; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 15px; }
  td:first-child { color: #6b7280; width: 180px; }
  .foot { margin-top: 24px; font-size: 13px; color: #9ca3af; }
</style></head>
<body>
  <div class="card">
    <div class="head">
      <div class="eyebrow">WebAudit AI</div>
      <h1>Payment receipt</h1>
    </div>
    <div class="body">
      <div class="amount">${esc(dollarsFromMicros(input.amountMicros))}</div>
      <table><tbody>
        <tr><td>Receipt id</td><td>${esc(input.id)}</td></tr>
        <tr><td>Payment event</td><td>${esc(input.id)}</td></tr>
        <tr><td>Provider reference</td><td>${esc(input.providerReference)}</td></tr>
        <tr><td>Kind</td><td>${esc(input.kind)}</td></tr>
        <tr><td>Paid at</td><td>${esc(input.paidAt.toISOString())}</td></tr>
        ${metadataRows}
      </tbody></table>
      <div class="foot">Generated at confirmation time. Keep this page with your accounting records.</div>
    </div>
  </div>
</body></html>`;
}

export async function createReceiptForPaymentEvent(
  db: PrismaClient,
  event: PaymentEvent,
): Promise<void> {
  const html = renderBillingReceiptHtml({
    id: event.id,
    userId: event.userId,
    kind: event.metadata.kind ?? event.type,
    providerReference: event.providerReference,
    amountMicros: event.amountMicros,
    metadata: event.metadata,
    paidAt: new Date(),
  });

  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "Receipt" ("id", "userId", "billingEventId", "providerReference", "kind", "amountMicros", "html")
      VALUES (gen_random_uuid()::text, ${event.userId}, ${event.id}, ${event.providerReference}, ${event.metadata.kind ?? event.type}, ${event.amountMicros}, ${html})
      ON CONFLICT ("billingEventId") DO NOTHING
    `,
  );
}
