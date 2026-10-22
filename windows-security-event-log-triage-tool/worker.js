/* Local background work; the selected CSV never leaves the browser. */
'use strict';
importScripts('rules.generated.js', 'rule-profiles.js', 'analysis.js', 'inputs.js', 'report.js');
self.onmessage = async ({ data }) => {
  const progress = message => self.postMessage({ type: 'progress', message });
  try {
    let result;
    if (data.operation === 'parse') {
      progress('Reading event file…');
      const text = data.payload.file ? await self.EventTriageInputs.readFileText(data.payload.file) : data.payload.text;
      progress('Extracting event fields…');
      result = self.EventTriageInputs.parseInput(text,data.payload.format || 'csv');
      progress('Preparing search index…');
      for (const event of result.events) event._searchText = self.EventTriageReports.searchText(event);
    } else if (data.operation === 'analyze') {
      progress('Correlating events…');
      result = self.EventTriageAnalysis.analyze(data.payload.events, data.payload.settings, data.payload.ruleProfile)
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
