/* Local background work; the selected CSV never leaves the browser. */
'use strict';
const ASSET_VERSION = '1.7.0';
importScripts(...['rules.generated.js', 'rule-profiles.js', 'analysis.js', 'inputs.js', 'collection.js', 'report.js', 'case-file.js', 'print-report.js'].map(file => file+'?v='+ASSET_VERSION));
self.onmessage = async ({ data }) => {
  const progress = message => self.postMessage({ type: 'progress', message });
  try {
    let result;
    if (data.operation === 'parse-files') {
      result = await self.EventTriageCollection.parseFiles(data.payload.files,progress);
      for (const event of result.events) event._searchText = self.EventTriageReports.searchText(event);
    } else if (data.operation === 'parse') {
      progress('Reading event file…');
      const text = data.payload.file ? await self.EventTriageInputs.readFileText(data.payload.file) : data.payload.text;
      progress('Extracting event fields…');
      result = self.EventTriageInputs.parseInput(text,data.payload.format || 'csv');
      progress('Preparing search index…');
      for (const event of result.events) event._searchText = self.EventTriageReports.searchText(event);
    } else if (data.operation === 'reopen-case') {
      progress('Validating saved case and recalculating findings…');
      const text = data.payload.file ? await self.EventTriageInputs.readFileText(data.payload.file) : data.payload.text;
      result = self.EventTriageCases.reopenCase(text,{browserTimezone:data.payload.browserTimezone});
    } else if (data.operation === 'save-case') {
      progress('Preparing complete saved case…');
      result = self.EventTriageCases.saveCase(data.payload.input);
    } else if (data.operation === 'analyze') {
      progress('Correlating events…');
      const findings = self.EventTriageAnalysis.analyze(data.payload.events, data.payload.settings, data.payload.ruleProfile);
      result = findings.map(({ events, ...finding }) => ({ ...finding, eventUids: events.map(event => event.uid) }));
      if (data.payload.includeCoverage) result = {findings:result,ruleCoverage:self.EventTriageAnalysis.ruleCoverage(data.payload.events,findings,data.payload.ruleProfile,data.payload.settings)};
    } else if (data.operation === 'export') {
      progress('Preparing download…');
      const report = self.EventTriageReports.createReport(data.payload.input);
      result = data.payload.format === 'print' ? self.EventTriagePrintable.renderReport(report) : data.payload.format === 'json' ? JSON.stringify(report, null, 2) :
        data.payload.format === 'findings' ? self.EventTriageReports.findingsCsv(report) : self.EventTriageReports.eventsCsv(report);
    } else throw new Error('Unknown background operation.');
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'This operation could not be completed.' }); }
};
