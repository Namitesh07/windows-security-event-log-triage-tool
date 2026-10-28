/* Report views and portable exports. No DOM, storage, or network access. */
(function exposeReports(root) {
  'use strict';
  const analysis = typeof module !== 'undefined' && module.exports ? require('./analysis.js') : root.EventTriageAnalysis;
  const TOOL_VERSION = '1.7.0';
  const profiles = typeof module !== 'undefined' && module.exports ? require('./rule-profiles.js') : root.EventTriageProfiles;
  const RULES_VERSION = profiles.catalog.version;
  const { severityOrder, eventSort, accountDisplay, labelById, rules, normalizeSettings, correlationCoverage } = analysis;
  const statuses = Object.freeze(['Unreviewed', 'Investigating', 'Expected activity', 'Escalate']);
  const eventSorts = Object.freeze(['csv', 'time-asc', 'time-desc', 'priority', 'id', 'account', 'source']);
  const findingSorts = Object.freeze(['priority', 'newest', 'oldest', 'title']);
  const textCompare = (a, b) => String(a || '').localeCompare(String(b || ''), 'en', { numeric: true, sensitivity: 'base' });
  function searchText(event) {
    return ((labelById[event.id] || '') + ' ' + (event.sourceName || '') + ' ' + (event.sourceId || '') + ' ' + event.rawFields.map(item => item.value).join(' ')).toLowerCase();
  }
  function compareTime(a, b, direction = 1) {
    if (a.date && b.date) return direction * (a.date.getTime() - b.date.getTime()) || a.index - b.index;
    if (a.date || b.date) return a.date ? -1 : 1;
    return a.index - b.index;
  }
  function selectEvents(events, priorities, view = {}, evidenceIds = null) {
    const search = String(view.search || '').trim().toLowerCase();
    const filtered = events.filter(event => (!evidenceIds || evidenceIds.has(event.uid)) &&
      (!search || (event._searchText || searchText(event)).includes(search)) &&
      (!view.id || event.id === view.id) && (!view.priority || (priorities.get(event.uid) || 'Informational') === view.priority) &&
      (!view.ip || event.ip === String(view.ip).trim()) && (!view.type || (labelById[event.id] || 'Other event') === view.type) &&
      (!view.sourceId || event.sourceId === view.sourceId) && (view.duplicates !== 'unique' || !event.duplicateOf) && (view.duplicates !== 'duplicates' || Boolean(event.duplicateOf)));
    const compare = {
      csv: (a, b) => a.index - b.index,
      'time-asc': (a, b) => compareTime(a, b),
      'time-desc': (a, b) => compareTime(a, b, -1),
      priority: (a, b) => severityOrder[priorities.get(a.uid) || 'Informational'] - severityOrder[priorities.get(b.uid) || 'Informational'] || eventSort(a, b),
      id: (a, b) => Number(a.id) - Number(b.id) || a.index - b.index,
      account: (a, b) => textCompare(accountDisplay(a), accountDisplay(b)) || a.index - b.index,
      source: (a, b) => textCompare(a.ip || a.computer, b.ip || b.computer) || a.index - b.index
    }[view.sort] || ((a, b) => a.index - b.index);
    return filtered.sort(compare);
  }
  function sortFindings(findings, sort = 'priority') {
    const times = new Map(findings.map(finding => {
      const dated = finding.events.filter(event => event.date).sort(eventSort);
      return [finding.id,{ first:dated[0] || finding.events[0], last:dated.at(-1) || finding.events[0] }];
    }));
    const compare = {
      priority: (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.score - a.score || a.id.localeCompare(b.id),
      newest: (a, b) => compareTime(times.get(a.id).last, times.get(b.id).last, -1) || a.id.localeCompare(b.id),
      oldest: (a, b) => compareTime(times.get(a.id).first, times.get(b.id).first) || a.id.localeCompare(b.id),
      title: (a, b) => textCompare(a.title, b.title) || a.id.localeCompare(b.id)
    }[sort];
    return [...findings].sort(compare || ((a, b) => a.id.localeCompare(b.id)));
  }
  const cleanText = (value, limit) => String(value ?? '').slice(0, limit);
  function normalizeCase(value = {}) {
    return { title: cleanText(value.title, 200), analyst: cleanText(value.analyst, 120),
      collectionTimezone: cleanText(value.collectionTimezone, 120), notes: cleanText(value.notes, 10000) };
  }
  function normalizeAnnotation(value = {}) {
    return { status: statuses.includes(value.status) ? value.status : statuses[0], note: cleanText(value.note, 4000) };
  }
  function createReport(input) {
    const events = input.events || [], findings = input.findings || [];
    const priorities = new Map(input.priorities || []);
    const annotations = input.annotations || {};
    const ruleProfile = profiles.normalizeProfile(input.ruleProfile || profiles.defaultProfile);
    const activeRules = profiles.effectiveRules(ruleProfile);
    return {
      schemaVersion: '1.2', tool: { name: 'Windows Security Event Log Triage Tool', version: TOOL_VERSION, rulesVersion: RULES_VERSION },
      ruleProfile,
      generatedAt: input.generatedAt || new Date().toISOString(), analyzedAt: input.analyzedAt,
      caseOrigin: input.caseOrigin || null,
      source: input.source, case: normalizeCase(input.case), settings: normalizeSettings(input.settings),
      timestampContext: { browserTimezone: input.browserTimezone || 'Unknown',
        interpretation: 'Offset timestamps use their explicit offset. Timezone-free timestamps use browser-local wall time. The case timezone is an analyst note and does not reinterpret timestamps.' },
      scope: { ...input.scope, exportedEvents: events.length, exportedFindings: findings.length,
        findingsPolicy: 'Complete findings only: every supporting event must belong to the export scope.' },
      coverage: input.coverage || correlationCoverage(events), coverageScope: input.coverage ? 'entire dataset' : 'exported events', diagnostics: input.diagnostics,
      ruleCoverage: input.ruleCoverage || analysis.ruleCoverage(events,findings,ruleProfile,input.settings),
      ruleCoverageScope: input.ruleCoverage ? 'entire dataset' : 'exported events',
      duplicates: {policy:'Conservative overlaps across different source files are excluded from rules; all original records are retained.',
        scope:'exported events',duplicateEvents:events.filter(event => event.duplicateOf).length,analyzedEvents:events.filter(event => !event.duplicateOf).length},
      ruleCatalog: Object.entries(activeRules).map(([id, rule]) => ({ id, title: rule.title, enabled:rule.enabled, contributions: rule.breakdown,attack:profiles.attackReferences(id),
        points: rule.breakdown.reduce((sum, part) => sum + part.points, 0) })),
      findings: findings.map(({ events: evidence, ...finding }) => ({ ...finding,
        eventUids: evidence.map(event => event.uid), review: normalizeAnnotation(annotations[finding.id]),attack:profiles.attackReferences(finding.ruleId,evidence) })),
      annotations: Object.entries(annotations).filter(([id]) => input.scope?.mode !== 'view' || findings.some(finding => finding.id === id)).map(([findingId, value]) => ({ findingId, ...value,
        ...normalizeAnnotation(value), presentInExport: findings.some(finding => finding.id === findingId) })),
      events: events.map(({ _searchText, ...event }) => ({ ...event, reviewPriority: priorities.get(event.uid) || 'Informational' })),
      limitations: ['Educational review cues do not prove malicious activity.',
        'CSV spreadsheet protection changes formula-like cells; JSON preserves the original strings.',
        'Full-dataset JSON can be reopened with validated evidence and recalculated findings; filtered reports cannot restore a complete case.',
        'Duplicate checks require matching host, channel, provider, record number, timestamp, Event ID, and source fields. Incomplete or differently shaped exports may retain overlaps.',
        'Rule coverage describes this collection and the active profile, not proof of complete auditing or absence of activity.',
        'MITRE ATT&CK references are related learning context, not confirmed adversarial techniques or additional priority points.',
        'Source SHA-256 identifies original bytes when computed on import; hashes recorded in reopened cases are not reverified and do not prove authenticity.',
        'Reports and saved cases are user-provided data, not cryptographic evidence records.']
    };
  }
  function csvCell(value) {
    let text = String(value ?? '');
    // Quoting alone does not prevent spreadsheet formulas. Guard control/space prefixes too.
    if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  const csv = rows => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  function findingsCsv(report) {
    const events = new Map(report.events.map(event => [event.uid,event]));
    return csv([['Tool version','Rules version','Generated at','Analysed at','Dataset','Scope','Case title','Analyst','Collection timezone','Case notes','Effective settings','Finding ID','Rule ID','Title','Review priority','Priority points','Review status','Analyst note','Event UIDs','CSV rows','Matched values','Score contributions','Why','Benign context','Next steps','Source locations (JSON)','Rule profile (JSON)','Rule coverage (JSON)','Source fingerprints (JSON)','ATT&CK learning references (JSON)'],
      ...report.findings.map(finding => [report.tool.version,report.tool.rulesVersion,report.generatedAt,report.analyzedAt,report.source.name,
        report.scope.mode,report.case.title,report.case.analyst,report.case.collectionTimezone,report.case.notes,JSON.stringify(report.settings),
        finding.id,finding.ruleId,finding.title,finding.severity,finding.score,finding.review.status,finding.review.note,
        finding.eventUids.join('; '),finding.eventUids.map(uid => {const event=events.get(uid);return !event?.inputFormat||event.inputFormat==='csv'?event?.lineNumber:'';}).join('; '),
        JSON.stringify(finding.matchedFields),JSON.stringify(finding.scoreBreakdown),finding.why,finding.benign,finding.next.join('\n'),
        JSON.stringify(finding.eventUids.map(uid=>sourceLocation(events.get(uid)))),JSON.stringify(report.ruleProfile),JSON.stringify(report.ruleCoverage?.find(item=>item.ruleId===finding.ruleId)),
        JSON.stringify((report.source.files || []).filter(file => finding.eventUids.some(uid => events.get(uid)?.sourceId === file.id)).map(file => ({sourceId:file.id,fingerprint:file.fingerprint || null}))),JSON.stringify(finding.attack)])]);
  }
  function sourceLocation(event = {}) {
    return {uid:event.uid,sourceId:event.sourceId || null,sourceName:event.sourceName || null,format:event.inputFormat || 'csv',
      record:event.sourceRecord || event.index,line:event.inputFormat === 'json' ? null : event.sourceLine ?? event.lineNumber,duplicateOf:event.duplicateOf || null};
  }
  function eventsCsv(report) {
    const files = new Map((report.source.files || []).map(file => [file.id,file]));
    return csv([['Tool version','Rules version','Dataset','Scope','Event UID','CSV row','Event ID','Original timestamp','Parsed timestamp','Timezone basis','Timestamp status','Review priority','Windows level','Target account','Target SID','Actor','Reporting host','Source IP','Event type','Original message','Original CSV fields (JSON)','Case title','Effective settings','Input format','Source record','Source line','Rule profile (JSON)','Source file ID','Source filename','Duplicate of','Included in analysis','Source fingerprint (JSON)'],
      ...report.events.map(event => [report.tool.version,report.tool.rulesVersion,report.source.name,report.scope.mode,event.uid,!event.inputFormat||event.inputFormat==='csv'?event.lineNumber:'',
        event.id,event.timeText,typeof event.date?.toISOString === 'function' ? event.date.toISOString() : event.date,event.timeBasis,event.timestampStatus,
        event.reviewPriority,event.level,accountDisplay(event),event.accountSid,event.actor,event.computer,event.ip,labelById[event.id] || 'Other event',
        event.message,JSON.stringify(event.rawFields),report.case.title,JSON.stringify(report.settings),event.inputFormat||'csv',event.sourceRecord||event.index,event.sourceLine??'',JSON.stringify(report.ruleProfile),event.sourceId||'',event.sourceName||'',event.duplicateOf||'',!event.duplicateOf,JSON.stringify(files.get(event.sourceId)?.fingerprint || null)])]);
  }
  function filename(title, kind, extension) {
    const stem = String(title || 'triage-report').normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'triage-report';
    return stem + '-' + kind + '.' + extension;
  }
  const api = Object.freeze({ TOOL_VERSION, RULES_VERSION, statuses, eventSorts, findingSorts, searchText, selectEvents, sortFindings,
    normalizeCase, normalizeAnnotation, createReport, csvCell, findingsCsv, eventsCsv, filename });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EventTriageReports = api;
})(typeof window !== 'undefined' ? window : globalThis);
