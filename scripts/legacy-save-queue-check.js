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

  const explicitCalls = [];
  const explicit = createLegacySaveQueue(async operation => {
    explicitCalls.push(operation);
    return { ok: true };
  });
  const edited = { notes: 'new mark' };
  const autoSave = explicit.enqueue(edited, false);
  const confirmedSave = explicit.enqueue(edited, false);
  assert.equal((await autoSave.promise).ok, true, 'background draft save succeeds');
  assert.equal((await confirmedSave.promise).ok, true, 'explicit footer Save confirms the latest draft');
  assert.deepEqual(explicitCalls, [
    { response: edited, complete: false },
    { response: edited, complete: false },
  ], 'explicit Save follows background autosave without completing the assessment');
  assert.equal(confirmedSave.revision, explicit.revision, 'Save may restore Scan Cup only for the latest revision');
  const newerEdit = explicit.enqueue({ notes: 'edited while saving' }, false);
  assert.notEqual(confirmedSave.revision, explicit.revision, 'a newer edit keeps Save visible');
  assert.equal((await newerEdit.promise).ok, true);

  const immutableCalls = [];
  const immutable = createLegacySaveQueue(async command=>{immutableCalls.push(command);return {ok:true};});
  const captured = { notes:'captured' }, metadata = { intent:'recovery',sessionId:'A',sampleId:'sample-A' };
  const a = immutable.enqueue(captured,false,metadata);
  captured.notes='mutated'; metadata.sampleId='sample-B';
  const b = immutable.enqueue({notes:'second'},false,{intent:'save',sessionId:'B',sampleId:'sample-B'});
  await a.promise; await b.promise;
  assert.deepEqual(immutableCalls,[{response:{notes:'captured'},complete:false,intent:'recovery',sessionId:'A',sampleId:'sample-A'},
    {response:{notes:'second'},complete:false,intent:'save',sessionId:'B',sampleId:'sample-B'}], 'queued payload and sample context are immutable');

  console.log('Legacy save queue: Complete → edit → Scan ordering, explicit Save revisions and save-failure blocking passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
