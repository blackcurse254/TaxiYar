import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDepositSms } from './smsParser';

test('parseDepositSms parses Persian Toman deposit SMS and ignores balance', () => {
  const sms = `بانک ملت
واریز مبلغ: ۵۰٬۰۳۷ تومان
کارت مقصد: 6104****4565
مانده: ۱۲٬۴۵۰٬۰۰۰ تومان`;
  const parsed = parseDepositSms(sms);
  assert.equal(parsed.isDeposit, true);
  assert.equal(parsed.unit, 'toman');
  assert.deepEqual(parsed.amountsTomanCandidates, [50037]);
  assert.equal(parsed.primaryAmountToman, 50037);
});

test('parseDepositSms converts Rial deposit SMS to Toman accurately', () => {
  const sms = `بانک ملی ایران
انتقال به حساب: +500,730 ریال
مانده: 95,000,000 ریال`;
  const parsed = parseDepositSms(sms);
  assert.equal(parsed.isDeposit, true);
  assert.equal(parsed.unit, 'rial');
  assert.deepEqual(parsed.amountsTomanCandidates, [50073]);
});

test('parseDepositSms rejects withdrawal SMS', () => {
  const sms = `برداشت مبلغ: 50,000 تومان\nمانده: 1,200,000 تومان`;
  const parsed = parseDepositSms(sms);
  assert.equal(parsed.isDeposit, false);
});
