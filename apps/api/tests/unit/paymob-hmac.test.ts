import { describe, expect, it } from 'vitest';
import {
  paymobTransactionHmacString,
  verifyPaymobTransactionHmac,
} from '../../src/services/billing/paymob-hmac.js';

const secret = 'paymob-test-secret';

const transaction = {
  obj: {
    amount_cents: 12_500,
    created_at: '2026-09-12T10:11:12.000000+02:00',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 987_654,
    integration_id: 123_456,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 246_810 },
    owner: 42,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success: true,
  },
};

// Fixed independently-generated fixture for the documented 20 transaction fields.
const validSignature =
  'f10e4251df55ac459e9c806119652b84900450783115f6428db35fa5e03d0e09' +
  '123e1ea1f86dc920a450c9aeb65cd6f2c902546c56abd4b35c47e4012d1552f7';

describe('Paymob transaction HMAC', () => {
  it('builds Paymob’s fixed 20-field transaction string and accepts its known-good SHA-512 HMAC', () => {
    expect(paymobTransactionHmacString(transaction)).toBe(
      '125002026-09-12T10:11:12.000000+02:00EGPfalsefalse987654123456truefalsefalsefalsetruefalse24681042false2346MasterCardcardtrue',
    );
    expect(verifyPaymobTransactionHmac(transaction, validSignature, secret)).toBe(true);
  });

  it('rejects a tampered payload and malformed signatures before comparison', () => {
    expect(
      verifyPaymobTransactionHmac(
        { obj: { ...transaction.obj, amount_cents: 12_501 } },
        validSignature,
        secret,
      ),
    ).toBe(false);
    expect(verifyPaymobTransactionHmac(transaction, 'not-hex', secret)).toBe(false);
    expect(verifyPaymobTransactionHmac(transaction, validSignature.slice(0, -2), secret)).toBe(
      false,
    );
  });
});
