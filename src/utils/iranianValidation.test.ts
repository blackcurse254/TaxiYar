import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCardDisplay,
  maskCardDisplay,
  normalizeDigits,
  parseTomanInput,
  validateCardNumber,
} from './iranianValidation';

test('normalizeDigits converts Persian and Arabic digits to ASCII', () => {
  assert.equal(normalizeDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
});

test('parseTomanInput extracts integer amount cleanly', () => {
  assert.equal(parseTomanInput('۵۰٬۰۰۰ تومان'), 50000);
  assert.equal(parseTomanInput(''), 0);
});

test('validateCardNumber, formatCardDisplay, and maskCardDisplay handle 16-digit cards', () => {
  assert.equal(validateCardNumber('6037991100001233'), true);
  assert.equal(validateCardNumber('۶۰۳۷-۹۹۱۱-۰۰۰۰-۱۲۳۳'), true);
  assert.equal(validateCardNumber('6037991100001234'), false);
  assert.equal(formatCardDisplay('6037991100001233'), '6037-9911-0000-1233');
  assert.equal(maskCardDisplay('6037991100001233'), '6037-••••-••••-1233');
});
