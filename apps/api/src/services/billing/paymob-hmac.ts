import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Paymob's documented transaction-callback HMAC field order. It is deliberately
 * an explicit tuple: signing arbitrary JSON would silently accept a different
 * wire contract and would not verify a genuine Paymob callback.
 */
const TRANSACTION_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function callbackObject(payload: unknown): JsonRecord | undefined {
  if (!isRecord(payload)) return undefined;
  return isRecord(payload['obj']) ? payload['obj'] : payload;
}

function valueAt(payload: JsonRecord, field: (typeof TRANSACTION_FIELDS)[number]): unknown {
  if (field === 'order') {
    const order = payload['order'];
    return isRecord(order) ? order['id'] : order;
  }
  if (!field.includes('.')) return payload[field];

  const [parent, child] = field.split('.') as [string, string];
  const nested = payload[parent];
  return isRecord(nested) ? nested[child] : undefined;
}

/** Returns undefined rather than coercing absent/null callback fields. */
export function paymobTransactionHmacString(payload: unknown): string | undefined {
  const transaction = callbackObject(payload);
  if (transaction === undefined) return undefined;

  const values = TRANSACTION_FIELDS.map((field) => valueAt(transaction, field));
  if (values.some((value) => value === undefined || value === null)) return undefined;
  return values.map((value) => String(value)).join('');
}

function isSha512Hex(value: string): boolean {
  return /^[a-f0-9]{128}$/i.test(value);
}

/**
 * Verifies a Paymob transaction callback HMAC without parsing or trusting any
 * payment semantics. Callers must only map the event after this returns true.
 */
export function verifyPaymobTransactionHmac(
  payload: unknown,
  signature: string | undefined,
  secret: string,
): boolean {
  // Reject shape/format failures before timingSafeEqual, whose equal-length
  // precondition would otherwise turn malformed input into an observable throw.
  if (signature === undefined || !isSha512Hex(signature)) return false;
  const message = paymobTransactionHmacString(payload);
  if (message === undefined) return false;

  const expected = createHmac('sha512', secret).update(message, 'utf8').digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(expected, received);
}
