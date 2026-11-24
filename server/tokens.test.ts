import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constantTimeStringEqual,
  signSmsWebhook,
  signTypedToken,
  verifySmsWebhookHmac,
  verifyTypedToken,
} from './tokens';

const SECRET = 'unit-test-secret-0123456789abcdef';

test('signTypedToken enforces typ and expiration', () => {
  const now = 1760000000;
  const payTok = signTypedToken({ typ: 'pay', pid: 12, did: 3, slug: 'ali', exp: now + 900 }, SECRET);
  const drvTok = signTypedToken({ typ: 'drv', did: 3, slug: 'ali', iat: now }, SECRET);
  const smsTok = signTypedToken({ typ: 'sms', did: 3, slug: 'ali', iat: now }, SECRET);

  const pRes = verifyTypedToken(payTok, 'pay', SECRET, now + 10);
  assert.equal(pRes.valid, true);
  if (pRes.valid) assert.equal(pRes.payload.pid, 12);

  // Wrong typ rejected
  assert.equal(verifyTypedToken(payTok, 'drv', SECRET, now + 10).valid, false);
  assert.equal(verifyTypedToken(drvTok, 'sms', SECRET, now + 10).valid, false);
  assert.equal(verifyTypedToken(smsTok, 'sms', SECRET, now + 10).valid, true);

  // Expired pay token rejected
  assert.equal(verifyTypedToken(payTok, 'pay', SECRET, now + 901).valid, false);
});

test('verifySmsWebhookHmac validates signature and timestamp window', () => {
  const rawBody = JSON.stringify({ text: 'واریز: ۵۰٬۰۳۷ تومان' });
  const now = 1760000500;
  const sig = signSmsWebhook(rawBody, now, SECRET);

  assert.equal(
    verifySmsWebhookHmac({
      rawBody,
      timestampHeader: String(now),
      signatureHeader: sig,
      secret: SECRET,
      nowSec: now + 15,
    }).valid,
    true
  );

  assert.equal(
    verifySmsWebhookHmac({
      rawBody: rawBody.replace('۵۰٬۰۳۷', '۵۰٬۰۰۰'),
      timestampHeader: String(now),
      signatureHeader: sig,
      secret: SECRET,
      nowSec: now + 15,
    }).valid,
    false
  );

  assert.equal(constantTimeStringEqual('abc123', 'abc123'), true);
  assert.equal(constantTimeStringEqual('abc123', 'abc124'), false);
});
