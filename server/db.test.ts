import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryTaxiStore } from './db';

test('MemoryTaxiStore enforces unique active amounts (0..89), claim, SMS webhook anti-replay, and single announcement', async () => {
  const store = new MemoryTaxiStore();
  await store.ensureSchema();

  const driver = await store.upsertDriver({
    slug: 'ali',
    name: 'علی رضایی',
    cardNumber: '6037991100001233',
    cardHolder: 'علی رضایی',
  });

  // Allocate 90 unique amounts for baseAmount = 50000
  const allocated = new Set<number>();
  for (let i = 0; i < 90; i++) {
    const p = await store.createUniquePayment({ driverId: driver.id, baseAmount: 50000 });
    assert.ok(p);
    assert.ok(p.amount >= 50000 && p.amount <= 50089);
    assert.equal(allocated.has(p.amount), false);
    allocated.add(p.amount);
  }
  assert.equal(allocated.size, 90);

  // 91st concurrent active payment at 50000 should return null
  const overflow = await store.createUniquePayment({ driverId: driver.id, baseAmount: 50000 });
  assert.equal(overflow, null);

  // Create payment at 75000, claim it, match SMS webhook, verify replay blocked & announced once
  const p2 = await store.createUniquePayment({ driverId: driver.id, baseAmount: 75000 });
  assert.ok(p2);

  const claimed = await store.claimPayment(p2.id, driver.id);
  assert.equal(claimed?.status, 'claimed');

  const hook1 = await store.processSmsWebhook({
    driverId: driver.id,
    replayKey: 'msg-001',
    rawBody: `واریز ${p2.amount} تومان`,
    amountCandidates: [p2.amount],
  });
  assert.equal(hook1.duplicate, false);
  assert.equal(hook1.matchedPayment?.id, p2.id);
  assert.equal(hook1.matchedPayment?.status, 'confirmed');

  // Replay with same key must be rejected
  const hookReplay = await store.processSmsWebhook({
    driverId: driver.id,
    replayKey: 'msg-001',
    rawBody: `واریز ${p2.amount} تومان`,
    amountCandidates: [p2.amount],
  });
  assert.equal(hookReplay.duplicate, true);

  // Driver sync returns newlyConfirmed once, then empty on second sync
  const sync1 = await store.syncDriver(driver.id);
  assert.equal(sync1.newlyConfirmed.length, 1);
  assert.equal(sync1.newlyConfirmed[0].id, p2.id);

  const sync2 = await store.syncDriver(driver.id);
  assert.equal(sync2.newlyConfirmed.length, 0);
});
