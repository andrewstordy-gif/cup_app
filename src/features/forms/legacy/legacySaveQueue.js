function createLegacySaveQueue(save) {
  let tail = Promise.resolve({ ok: true });
  let revision = 0;

  return {
    enqueue(response, complete, metadata = {}) {
      const currentRevision = ++revision;
      // Capture the command at enqueue time; delayed execution must not retarget
      // mutable input or another screen's session/sample.
      const command = { response: JSON.parse(JSON.stringify(response)), complete, ...metadata };
      tail = tail.catch(() => ({ ok: false })).then(() => save(command))
        .catch(error => ({ ok: false, errors: ['response:save_failed'], error }));
      return { promise: tail, revision: currentRevision };
    },
    async drain() {
      while (true) {
        const current = tail;
        const result = await current;
        if (current === tail) return result;
      }
    },
    get revision() { return revision; },
  };
}

module.exports = { createLegacySaveQueue };
