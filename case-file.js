/* Local saved-case codec. Evidence is normalized and findings are recalculated on reopen. */
(function exposeCases(root) {
  'use strict';
  const common = typeof module !== 'undefined' && module.exports;
  const analysis = common ? require('./analysis.js') : root.EventTriageAnalysis;
  const inputs = common ? require('./inputs.js') : root.EventTriageInputs;
  const profiles = common ? require('./rule-profiles.js') : root.EventTriageProfiles;
  const reports = common ? require('./report.js') : root.EventTriageReports;
  const KIND = 'fieldnotes-case', SCHEMA_VERSION = '1.0', MAX_BYTES = 50 * 1024 * 1024;
  const MAX_FIELDS = 2048, MAX_ANNOTATIONS = 100000;
  const formats = ['csv', 'xml', 'json', 'jsonl'];
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error('Cannot reopen case: ' + message); };
  const text = (value, limit, label) => {
    if (typeof value !== 'string' || value.length > limit) fail(label + ' must be text of at most ' + limit + ' characters.');
    return value;
  };
  const integer = (value, minimum, maximum, label) => {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail('Invalid ' + label + '.');
    return value;
  };
  function iso(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(new Date(value).getTime()) || new Date(value).toISOString() !== value) fail('Invalid ' + label + '.');
    return value;
  }
  function caseContext(value) {
    if (!plain(value)) fail('Case context is missing.');
    const result = {};
    for (const [key, limit] of Object.entries({ title:200, analyst:120, collectionTimezone:120, notes:10000 })) result[key] = text(value[key] ?? '', limit, key);
    return result;
  }
  function settings(value) {
    if (!plain(value)) fail('Analysis settings are missing.');
    const normalized = analysis.normalizeSettings(value), keys = Object.keys(analysis.DEFAULT_SETTINGS);
    if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => value[key] !== normalized[key])) fail('Analysis settings are outside the supported bounds.');
    return normalized;
  }
  function source(value, format) {
    if (!plain(value)) fail('Source metadata is missing.');
    const result = { name:text(value.name,512,'Source filename'), format, kind:text(value.kind || format,120,'Source kind'),
      sizeBytes:integer(value.sizeBytes ?? 0,0,Number.MAX_SAFE_INTEGER,'source byte size'), lastModified:null };
    if (value.lastModified !== null && value.lastModified !== undefined) result.lastModified = iso(value.lastModified,'source modification time');
    if (value.loadedAt) result.loadedAt = iso(value.loadedAt,'source load time');
    return result;
  }
  function normalizeEvidence(saved) {
    if (!Array.isArray(saved) || !saved.length || saved.length > inputs.MAX_RECORDS) fail('Expected 1–100,000 event records.');
    const records = [...saved].sort((a,b) => a?.index - b?.index);
    let headers, format;
    const rows = records.map((event, index) => {
      if (!plain(event) || event.index !== index + 1 || event.uid !== 'event-' + (index + 1)) fail('Event identifiers/order are incomplete, duplicated, or invalid.');
      const currentFormat = event.inputFormat || 'csv';
      if (!formats.includes(currentFormat) || format && format !== currentFormat) fail('The case must contain one supported input format.');
      format = currentFormat;
      if (!Array.isArray(event.rawFields) || !event.rawFields.length || event.rawFields.length > MAX_FIELDS) fail('An event has an invalid source-field list.');
      const names = event.rawFields.map(field => {
        if (!plain(field)) fail('Invalid source field.');
        text(field.value, MAX_BYTES, 'Source field value');
        return text(field.header,4096,'Source field name');
      });
      if (!headers) headers = names;
      else if (names.length !== headers.length || names.some((name, position) => name !== headers[position])) fail('Source-field layouts differ between records.');
      const row = event.rawFields.map(field => field.value);
      const record = integer(event.sourceRecord ?? event.index,1,1000000000,'source record');
      const line = currentFormat === 'json' ? null : integer(event.sourceLine ?? event.lineNumber,1,1000000000,'source line');
      Object.defineProperties(row, { lineNumber:{value:line || record}, sourceRecord:{value:record}, sourceLine:{value:line} });
      return row;
    });
    const normalized = analysis.normalizeEvents([headers, ...rows]);
    if (normalized.events.length !== records.length) fail('Some saved records have invalid Event IDs.');
    for (const event of normalized.events) {
      event.inputFormat = format;
      if (format === 'json') event.sourceLine = null;
      event._searchText = reports.searchText(event);
    }
    return { ...normalized, format };
  }
  function annotations(value, eventUids) {
    if (!Array.isArray(value) || value.length > MAX_ANNOTATIONS) fail('Invalid finding annotations.');
    const result = Object.create(null);
    for (const entry of value) {
      if (!plain(entry)) fail('Invalid finding annotation.');
      const id = text(entry.findingId,200,'Finding identifier');
      const match = id.match(/^([A-Z][A-Z0-9_]+)-event-([1-9]\d{0,5})-event-([1-9]\d{0,5})$/);
      if (!match || !Object.hasOwn(analysis.rules,match[1]) || !eventUids.has('event-'+match[2]) || !eventUids.has('event-'+match[3]) || Object.hasOwn(result,id)) fail('Invalid, duplicated, or foreign finding identifier.');
      if (!reports.statuses.includes(entry.status)) fail('Unknown finding review status.');
      const refs = entry.eventUids ?? [];
      if (!Array.isArray(refs) || refs.length > eventUids.size || refs.some(uid => !eventUids.has(uid)) || new Set(refs).size !== refs.length) fail('An annotation refers to missing or duplicated evidence.');
      if (entry.ruleId && entry.ruleId !== match[1]) fail('Annotation rule ID does not match its finding.');
      result[id] = { status:entry.status, note:text(entry.note ?? '',4000,'Finding note'), ruleId:match[1],
        title:text(entry.title ?? '',300,'Finding title'), eventUids:[...refs] };
    }
    return result;
  }
  function diagnostics(value, parsed) {
    if (!plain(value)) return parsed;
    const result = { ...parsed };
    const counts = ['rowsRead','rowsParsed','rowsSkipped','invalidTimestamps','ambiguousTimestamps','missingTimestamps'];
    const locations = ['blankEventIdRows','invalidEventIdRows','invalidTimestampRows','ambiguousTimestampRows','missingTimestampRows'];
    for (const key of counts) if (value[key] !== undefined) result[key] = integer(value[key],0,1000000000,'diagnostic '+key);
    if (result.rowsParsed !== parsed.rowsParsed || result.rowsRead < result.rowsParsed) fail('Diagnostics do not match the event count.');
    for (const key of locations) if (value[key] !== undefined) {
      if (!Array.isArray(value[key]) || value[key].length > inputs.MAX_RECORDS) fail('Invalid diagnostic locations.');
      result[key] = value[key].map(line => integer(line,1,1000000000,'diagnostic location'));
    }
    return result;
  }
  function reopenCase(content, context = {}) {
    if (typeof content !== 'string' || new TextEncoder().encode(content).length > MAX_BYTES) fail('The saved case exceeds 50 MB.');
    let document;
    try { document = inputs.parseJsonDocument(content.replace(/^\uFEFF/,'')); } catch (error) { fail(error.message); }
    if (!plain(document)) fail('Expected a saved-case JSON object.');
    let report = document, savedAt;
    if (document.kind !== undefined) {
      if (document.kind !== KIND || document.schemaVersion !== SCHEMA_VERSION || !plain(document.report)) fail('Unsupported saved-case format or version.');
      report = document.report; savedAt = iso(document.savedAt,'case save time');
    }
    if (report.schemaVersion !== '1.1' || report.tool?.name !== 'Windows Security Event Log Triage Tool') fail('Use a full JSON report from v1.4.0 or later, or a supported saved case.');
    if (report.scope?.mode !== 'all' || report.scope.totalEvents !== report.events?.length || report.scope.exportedEvents !== report.events?.length) fail('A filtered/scoped report cannot restore a complete case. Export the entire dataset first.');
    const normalized = normalizeEvidence(report.events), effectiveSettings = settings(report.settings);
    const ruleProfile = profiles.normalizeProfile(report.ruleProfile);
    const restoredAnnotations = annotations(report.annotations || [],new Set(normalized.events.map(event => event.uid)));
    const timezone = text(report.timestampContext?.browserTimezone || 'Unknown',120,'Saved browser timezone');
    const origin = { savedAt:savedAt || iso(report.generatedAt,'report generation time'),
      toolVersion:text(report.tool.version,80,'Saved tool version'), rulesVersion:text(report.tool.rulesVersion,80,'Saved rule version'),
      browserTimezone:timezone, reopenedAt:new Date().toISOString() };
    const notices = ['Findings were recalculated from the saved source fields with this version of the analyser.'];
    if (origin.toolVersion !== reports.TOOL_VERSION || origin.rulesVersion !== reports.RULES_VERSION) notices.push('Saved with tool '+origin.toolVersion+' / rules '+origin.rulesVersion+'; current tool '+reports.TOOL_VERSION+' / rules '+reports.RULES_VERSION+'.');
    if (context.browserTimezone && timezone !== context.browserTimezone && normalized.events.some(event => event.timeBasis === 'local')) notices.push('The saved browser timezone was '+timezone+'; this browser uses '+context.browserTimezone+'. Timezone-free timestamps are reinterpreted in this browser.');
    const findings = analysis.analyze(normalized.events,effectiveSettings,ruleProfile).map(({ events,...finding }) => ({ ...finding,eventUids:events.map(event => event.uid) }));
    return { events:normalized.events,findings,source:source(report.source,normalized.format),case:caseContext(report.case),settings:effectiveSettings,ruleProfile,
      annotations:restoredAnnotations,diagnostics:diagnostics(report.diagnostics,normalized.diagnostics),origin,notices,format:normalized.format };
  }
  function saveCase(input) {
    if (input.scope?.mode !== 'all' || input.scope.totalEvents !== input.events?.length) throw new Error('Save case requires the entire dataset.');
    if (!input.events.length || input.events.length > inputs.MAX_RECORDS || input.events.some(event => !Array.isArray(event.rawFields) || event.rawFields.length > MAX_FIELDS || event.rawFields.some(field => typeof field.header !== 'string' || field.header.length > 4096))) throw new Error('The dataset exceeds the supported saved-case record/field limits.');
    const report = reports.createReport(input);
    const content = JSON.stringify({ kind:KIND,schemaVersion:SCHEMA_VERSION,savedAt:new Date().toISOString(),report },null,2);
    if (new TextEncoder().encode(content).length > MAX_BYTES) throw new Error('Saved case exceeds 50 MB. Export a narrower event collection.');
    return content;
  }
  const api = Object.freeze({ KIND,SCHEMA_VERSION,MAX_BYTES,reopenCase,saveCase });
  if (common) module.exports = api;
  if (root) root.EventTriageCases = api;
})(typeof window !== 'undefined' ? window : globalThis);
