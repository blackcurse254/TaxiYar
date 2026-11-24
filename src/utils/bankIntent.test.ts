import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAndroidIntentUri, detectMobilePlatform, getBankTapPlan } from './bankIntent';

test('detectMobilePlatform classifies Android, iOS, and desktop user agents', () => {
  assert.equal(detectMobilePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'android');
  assert.equal(detectMobilePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(detectMobilePlatform('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0'), 'desktop');
});

test('buildAndroidIntentUri validates package names and rejects empty or unsafe input', () => {
  assert.equal(buildAndroidIntentUri('ir.bmi.bam'), 'intent://#Intent;package=ir.bmi.bam;end');
  assert.equal(buildAndroidIntentUri(''), null);
  assert.equal(buildAndroidIntentUri('   '), null);
  assert.equal(buildAndroidIntentUri('bad;scheme=javascript'), null);
});

test('getBankTapPlan launches intent on Android when pkg exists', () => {
  const plan = getBankTapPlan({
    bank: { name: 'ملی (بام)', pkg: 'ir.bmi.bam' },
    cardNumber: '۶۰۳۷-۹۹۷۵-۱۲۳۴-۴۸۱۲',
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  });

  assert.equal(plan.copyText, '6037997512344812');
  assert.equal(plan.toastMessage, 'شماره کارت کپی شد؛ در اپ بانک Paste کنید');
  assert.equal(plan.intentUri, 'intent://#Intent;package=ir.bmi.bam;end');
  assert.equal(plan.shouldMonitorVisibility, true);
  assert.equal(plan.fallbackDelayMs, 1500);
});

test('getBankTapPlan only copies on iOS and shows iOS instruction', () => {
  const plan = getBankTapPlan({
    bank: { name: 'ملت', pkg: 'com.pmb.mobile' },
    cardNumber: '6104337912348831',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
  });

  assert.equal(plan.copyText, '6104337912348831');
  assert.equal(plan.intentUri, null);
  assert.equal(plan.shouldMonitorVisibility, false);
  assert.equal(plan.secondaryMessage, 'اپ بانک را باز کنید');
});

test('getBankTapPlan only copies when pkg is empty even on Android', () => {
  const plan = getBankTapPlan({
    bank: { name: 'ملل', pkg: '' },
    cardNumber: '6062561012345678',
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  });

  assert.equal(plan.copyText, '6062561012345678');
  assert.equal(plan.intentUri, null);
  assert.equal(plan.shouldMonitorVisibility, false);
  assert.equal(plan.toastMessage, 'شماره کارت کپی شد؛ در اپ بانک Paste کنید');
});
