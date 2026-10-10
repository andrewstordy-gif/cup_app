function createLegacySaveQueue(save) {
  let tail = Promise.resolve({ ok: true });
  let revision = 0;

  return {
    enqueue(response, complete) {
      const currentRevision = ++revision;
      tail = tail.catch(() => ({ ok: false })).then(() => save({ response, complete }))
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
