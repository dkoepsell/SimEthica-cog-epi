
// workers/pool.js
export class WorkerPool {
  constructor(url, size = (navigator.hardwareConcurrency || 4)) {
    this.size = Math.max(1, size);
    this.id = 0;
    this.queue = [];
    this.workers = new Array(this.size).fill(0).map(() => ({
      worker: new Worker(url, { type: 'module' }),
      busy: false
    }));
  }

  _dispatch() {
    for (const slot of this.workers) {
      if (!slot.busy && this.queue.length) {
        const job = this.queue.shift();
        slot.busy = true;
        const { payload, resolve, reject } = job;
        const id = ++this.id;
        const onMsg = (e) => {
          const d = e.data || {};
          if (d.id === id) {
            slot.worker.removeEventListener('message', onMsg);
            slot.worker.removeEventListener('error', onErr);
            slot.busy = false;
            resolve(d.result);
            this._dispatch();
          }
        };
        const onErr = (err) => {
          slot.worker.removeEventListener('message', onMsg);
          slot.worker.removeEventListener('error', onErr);
          slot.busy = false;
          reject(err);
          this._dispatch();
        };
        slot.worker.addEventListener('message', onMsg);
        slot.worker.addEventListener('error', onErr);
        slot.worker.postMessage({ id, ...payload });
      }
    }
  }

  run(payload) {
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      this._dispatch();
    });
  }

  async map(chunks, kind) {
    const promises = chunks.map(chunk => this.run({ kind, payload: chunk }));
    const results = await Promise.all(promises);
    return results.flat();
  }

  terminate() {
    for (const slot of this.workers) slot.worker.terminate();
  }
}
