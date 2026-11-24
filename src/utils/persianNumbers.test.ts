import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDepositAnnouncement, numberToPersianWords } from './persianNumbers';

test('numberToPersianWords converts taxi fare amounts cleanly', () => {
  assert.equal(numberToPersianWords(0), 'صفر');
  assert.equal(numberToPersianWords(50037), 'پنجاه هزار و سی و هفت');
  assert.equal(numberToPersianWords(75012), 'هفتاد و پنج هزار و دوازده');
  assert.equal(numberToPersianWords(1250000), 'یک میلیون و دویست و پنجاه هزار');
  assert.equal(formatDepositAnnouncement(50037), 'مبلغ پنجاه هزار و سی و هفت تومان واریز شد');
});
