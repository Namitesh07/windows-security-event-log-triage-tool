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
          let bytes = payload.bytes || payload.file?.size || 0;
          try { if (operation === 'parse-files') bytes = root.EventTriageCollection.validateFiles(payload.files); }
          catch (error) { finish(error); return; }
          if (bytes > FALLBACK_LIMIT) {
            const limit = operation === 'reopen-case' ? '50 MB for saved cases' : '25 MB for event files';
            finish(new Error('Background processing is unavailable. Open this app through a local web server or GitHub Pages for files over 2 MB (up to '+limit+').'));
            return;
          }
          onProgress('Processing locally (small-file mode)…');
          try {
            const text = ['parse','reopen-case'].includes(operation) ? (payload.file ? await root.EventTriageInputs.readFileText(payload.file) : payload.text) : '';
            // Yield before the bounded fallback so progress and cancellation can be presented.
            await new Promise(done => setTimeout(done, 0));
            if (this.active !== task) return;
            let result;
            if (operation === 'parse-files') {
              result = await root.EventTriageCollection.parseFiles(payload.files,message => { if (this.active === task) onProgress(message); },() => this.active === task);
              for (const event of result.events) event._searchText = root.EventTriageReports.searchText(event);
            } else if (operation === 'parse') {
              result = root.EventTriageInputs.parseInput(text,payload.format || 'csv');
              for (const event of result.events) event._searchText = root.EventTriageReports.searchText(event);
            } else if (operation === 'reopen-case') {
              result = root.EventTriageCases.reopenCase(text,{browserTimezone:payload.browserTimezone});
            } else if (operation === 'save-case') {
              result = root.EventTriageCases.saveCase(payload.input);
            } else if (operation === 'analyze') {
              const findings = root.EventTriageAnalysis.analyze(payload.events, payload.settings, payload.ruleProfile);
              result = findings.map(({ events, ...finding }) => ({ ...finding, eventUids: events.map(event => event.uid) }));
              if (payload.includeCoverage) result = {findings:result,ruleCoverage:root.EventTriageAnalysis.ruleCoverage(payload.events,findings,payload.ruleProfile,payload.settings)};
            } else if (operation === 'export') {
              const report = root.EventTriageReports.createReport(payload.input);
              result = payload.format === 'json' ? JSON.stringify(report, null, 2) : payload.format === 'findings' ?
                root.EventTriageReports.findingsCsv(report) : root.EventTriageReports.eventsCsv(report);
            } else throw new Error('Unknown local operation.');
            finish(null, result);
          } catch (error) { finish(error); }
        };
        if (!root.Worker || !/^https?:$/.test(root.location?.protocol || '')) { fallback(); return; }
        try {
          task.worker = new root.Worker('worker.js?v='+encodeURIComponent(root.EventTriageReports.TOOL_VERSION));
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
