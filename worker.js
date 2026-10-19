/* Local background work; the selected CSV never leaves the browser. */
'use strict';
importScripts('analysis.js', 'report.js');
self.onmessage = async ({ data }) => {
  const progress = message => self.postMessage({ type: 'progress', message });
  try {
    let result;
    if (data.operation === 'parse') {
      progress('Reading CSV…');
      const text = data.payload.file ? await data.payload.file.text() : data.payload.text;
      progress('Parsing CSV…');
      const rows = self.EventTriageAnalysis.parseCsv(text);
      progress('Extracting event fields…');
      result = self.EventTriageAnalysis.normalizeEvents(rows);
      progress('Preparing search index…');
      for (const event of result.events) event._searchText = self.EventTriageReports.searchText(event);
    } else if (data.operation === 'analyze') {
      progress('Correlating events…');
      result = self.EventTriageAnalysis.analyze(data.payload.events, data.payload.settings)
        .map(({ events, ...finding }) => ({ ...finding, eventUids: events.map(event => event.uid) }));
    } else if (data.operation === 'export') {
      progress('Preparing download…');
      const report = self.EventTriageReports.createReport(data.payload.input);
      result = data.payload.format === 'json' ? JSON.stringify(report, null, 2) :
        data.payload.format === 'findings' ? self.EventTriageReports.findingsCsv(report) : self.EventTriageReports.eventsCsv(report);
    } else throw new Error('Unknown background operation.');
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'This operation could not be completed.' }); }
};
