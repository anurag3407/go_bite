import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizePhone, 
  toE164India, 
  generateDeliveryPin, 
  generateOtp, 
  timingSafeEqualStr, 
  idempotencyFingerprint, 
  generateOrderNumber 
} from './security';

describe('Security Utilities', () => {
  it('normalizes valid Indian mobile numbers and rejects invalid ones', () => {
    assert.equal(normalizePhone('+919876543210'), '9876543210');
    assert.equal(normalizePhone('09876543210'), '9876543210');
    assert.equal(normalizePhone('98765-43210'), '9876543210');
    assert.equal(normalizePhone('9876543210'), '9876543210');
    assert.equal(toE164India('9876543210'), '+919876543210');

    // Invalid numbers: starts with 5, too short, non-numeric
    assert.equal(normalizePhone('5123456789'), null);
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone('abcdefghij'), null);
  });

  it('generates cryptographically random 4-digit PINs and 6-digit OTPs', () => {
    for (let i = 0; i < 50; i++) {
      const pin = generateDeliveryPin();
      assert.match(pin, /^\d{4}$/, 'PIN must be exactly 4 digits');

      const otp = generateOtp();
      assert.match(otp, /^\d{6}$/, 'OTP must be exactly 6 digits');
    }
  });

  it('performs timing-safe string comparison correctly', () => {
    assert.equal(timingSafeEqualStr('1234', '1234'), true);
    assert.equal(timingSafeEqualStr('1234', '1235'), false);
    assert.equal(timingSafeEqualStr('1234', '123'), false);
    assert.equal(timingSafeEqualStr('abcd', 'abcd'), true);
  });

  it('generates consistent idempotency fingerprints and distinct order numbers', () => {
    const payload1 = { shopId: 'shop-1', items: [{ id: 'item-1', qty: 2 }] };
    const payload2 = { shopId: 'shop-1', items: [{ id: 'item-1', qty: 2 }] };
    const payload3 = { shopId: 'shop-1', items: [{ id: 'item-1', qty: 3 }] };

    assert.equal(idempotencyFingerprint(payload1), idempotencyFingerprint(payload2));
    assert.notEqual(idempotencyFingerprint(payload1), idempotencyFingerprint(payload3));

    const orderNum = generateOrderNumber('IITP-BIHTA');
    assert.match(orderNum, /^GB-IIT-[A-Z0-9]{6}$/);
  });

  it('enforces daily SMS limit circuit breaker and trips when exceeded', async () => {
    const { assertDailySmsLimit } = await import('./kv');
    // First 2 calls under limit of 2 should pass
    const res1 = await assertDailySmsLimit(2);
    assert.ok(res1.count >= 1);
    
    // Once quota is exceeded, assertDailySmsLimit must throw RATE_LIMITED
    await assert.rejects(
      async () => {
        await assertDailySmsLimit(1);
      },
      (err: unknown) => {
        const error = err as { code?: string; details?: { bucket?: string } };
        return error.code === 'RATE_LIMITED' && error.details?.bucket === 'dailySms';
      }
    );
  });
});

