#!/usr/bin/env node
const assert = require('node:assert/strict');
const { createLegacySaveQueue } = require('../src/features/forms/legacy/legacySaveQueue');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function flush() { await Promise.resolve(); await Promise.resolve(); }

async function main() {
  const gates = [deferred(), deferred(), deferred()];
  const calls = [];
  const queue = createLegacySaveQueue(async operation => {
    calls.push(operation);
    return gates[calls.length - 1].promise;
  });
  const original = { notes: 'original' };
  const changed = { notes: 'edited after Complete' };
  const draft = queue.enqueue(original, false);
  const final = queue.enqueue(original, true);
  const latest = queue.enqueue(changed, false);
  let scanReleased = false;
  const scan = queue.drain().then(result => { scanReleased = true; return result; });
  await flush();
  assert.deepEqual(calls, [{ response: original, complete: false }], 'first draft starts before final write');
  gates[0].resolve({ ok: true });
  await draft.promise;
  await flush();
  assert.deepEqual(calls[1], { response: original, complete: true }, 'completion is ordered after first draft');
  assert.equal(scanReleased, false, 'scan remains blocked during final write');
  gates[1].resolve({ ok: true, result: { display_score: '80.00' } });
  await final.promise;
  await flush();
  assert.deepEqual(calls[2], { response: changed, complete: false }, 'new edit is saved after completion');
  assert.equal(final.revision < queue.revision, true, 'stale final result must not replace the newer edit in UI');
  assert.equal(scanReleased, false, 'scan remains blocked until the newer edit is saved');
  gates[2].resolve({ ok: true });
  await latest.promise;
  assert.deepEqual(await scan, { ok: true });
  assert.equal(scanReleased, true);

  const failed = createLegacySaveQueue(async () => ({ ok: false, errors: ['response:save_failed'] }));
  failed.enqueue({ notes: 'not saved' }, true);
  assert.equal((await failed.drain()).ok, false, 'a failed final save must prevent scan');
  const thrown = createLegacySaveQueue(async () => { throw new Error('disk unavailable'); });
  thrown.enqueue({ notes: 'not saved' }, false);
  const outcome = await thrown.drain();
  assert.equal(outcome.ok, false, 'a rejected draft save must prevent scan');
  assert.match(outcome.error.message, /disk unavailable/);

  console.log('Legacy save queue: Complete → edit → Scan ordering and save-failure blocking passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
