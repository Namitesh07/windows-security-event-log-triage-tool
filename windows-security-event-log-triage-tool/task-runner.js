/* Cancellable worker tasks with a small-file fallback for direct file:// use. */
(function exposeRunner(root) {
  'use strict';
  const FALLBACK_LIMIT = 2 * 1024 * 1024;
  const abortError = () => Object.assign(new Error('Operation cancelled.'), { name: 'AbortError' });
  class TaskRunner {
    constructor() { this.active = null; }
    cancel() {
      const task = this.active;
      if (!task) return;
      this.active = null;
      if (task.worker) task.worker.terminate();
      task.reject(abortError());
    }
    run(operation, payload, onProgress = () => {}) {
      this.cancel();
      return new Promise((resolve, reject) => {
        const task = { reject, worker: null };
        this.active = task;
        const finish = (error, result) => {
          if (this.active !== task) return;
          this.active = null;
          if (task.worker) task.worker.terminate();
          if (error) reject(error); else resolve(result);
        };
        const fallback = async () => {
          if ((payload.bytes || payload.file?.size || 0) > FALLBACK_LIMIT) {
            finish(new Error('Background processing is unavailable. Open this app through a local web server or GitHub Pages for files over 2 MB (up to 25 MB).'));
            return;
          }
          onProgress('Processing locally (small-file mode)…');
          try {
            const text = operation === 'parse' ? (payload.file ? await root.EventTriageInputs.readFileText(payload.file) : payload.text) : '';
            // Yield before the bounded fallback so progress and cancellation can be presented.
            await new Promise(done => setTimeout(done, 0));
            if (this.active !== task) return;
            let result;
            if (operation === 'parse') {
              result = root.EventTriageInputs.parseInput(text,payload.format || 'csv');
              for (const event of result.events) event._searchText = root.EventTriageReports.searchText(event);
            } else if (operation === 'analyze') {
              result = root.EventTriageAnalysis.analyze(payload.events, payload.settings, payload.ruleProfile)
                .map(({ events, ...finding }) => ({ ...finding, eventUids: events.map(event => event.uid) }));
            } else {
              const report = root.EventTriageReports.createReport(payload.input);
              result = payload.format === 'json' ? JSON.stringify(report, null, 2) : payload.format === 'findings' ?
                root.EventTriageReports.findingsCsv(report) : root.EventTriageReports.eventsCsv(report);
            }
            finish(null, result);
          } catch (error) { finish(error); }
        };
        if (!root.Worker || !/^https?:$/.test(root.location?.protocol || '')) { fallback(); return; }
        try {
          task.worker = new root.Worker('worker.js');
          task.worker.onmessage = ({ data }) => {
            if (this.active !== task) return;
            if (data.type === 'progress') onProgress(data.message);
            else if (data.type === 'result') finish(null, data.result);
            else if (data.type === 'error') finish(new Error(data.message));
          };
          task.worker.onerror = event => {
            event.preventDefault(); task.worker.terminate(); task.worker = null;
            if (this.active === task) fallback();
          };
          task.worker.postMessage({ operation, payload });
        } catch { if (task.worker) task.worker.terminate(); task.worker = null; fallback(); }
      });
    }
  }
  root.EventTriageTasks = Object.freeze({ TaskRunner, FALLBACK_LIMIT });
})(typeof window !== 'undefined' ? window : globalThis);
