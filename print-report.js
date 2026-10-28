/* Self-contained review HTML. No scripts, remote assets, or automatic printing. */
(function exposePrintReport(root) {
  'use strict';
  const common = typeof module !== 'undefined' && module.exports;
  const profiles = common ? require('./rule-profiles.js') : root.EventTriageProfiles;
  const LIMITS = Object.freeze({findings:500,events:2000,annotations:500,fieldCharacters:4000,bytes:20*1024*1024});
  const escape = value => String(value ?? '').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const shorten = value => {
    const text = String(value ?? '');
    return escape(text.length > LIMITS.fieldCharacters ? text.slice(0,LIMITS.fieldCharacters)+' … [shortened; full value is in JSON]' : text);
  };
  const note = value => '<div class="note">'+escape(value || 'Not supplied')+'</div>';
  const table = (caption,headers,rows,className='') => '<table class="'+className+'"><caption>'+escape(caption)+'</caption><thead><tr>'+headers.map(header => '<th scope="col">'+escape(header)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row => '<tr>'+row.map(cell => '<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const pairs = values => '<dl>'+values.map(([label,value]) => '<dt>'+escape(label)+'</dt><dd>'+shorten(value ?? 'Not supplied')+'</dd>').join('')+'</dl>';
  const coverageDetails = item => [...(item.missingFields || []).map(gap => gap.field+': '+gap.events+' (examples '+gap.exampleEventUids.join(', ')+')'),...(item.missingEventTypes || []).map(id => 'Missing companion: '+id),...(item.warnings || [])].join('\n') || (item.state === 'no-events' ? 'No relevant Event IDs in this collection.' : item.state === 'disabled' ? 'Disabled by the active profile.' : 'Required input fields available; review emitted findings and matching conditions.');
  const location = event => [event.sourceName || 'Source',event.sourceId || '',event.inputFormat || 'csv','record '+(event.sourceRecord || event.index),event.sourceLine != null ? 'line '+event.sourceLine : ''].filter(Boolean).join(' · ');
  function renderReport(report) {
    const events = report.events || [], findings = report.findings || [], sources = report.source?.files || [{name:report.source?.name || 'Unknown source',format:report.source?.format || 'csv',sizeBytes:report.source?.sizeBytes}];
    const eventMap = new Map(events.map(event => [event.uid,event]));
    const selectedFindings = findings.slice(0,LIMITS.findings), selectedEvents = events.slice(0,LIMITS.events);
    const inactive = (report.annotations || []).filter(annotation => !annotation.presentInExport), selectedAnnotations = inactive.slice(0,LIMITS.annotations);
    const evidenceIds = new Set(findings.flatMap(finding => finding.eventUids));
    const chronology = events.filter(event => evidenceIds.has(event.uid)).sort((a,b) => {
      const first = Date.parse(a.date), second = Date.parse(b.date);
      return Number.isFinite(first) && Number.isFinite(second) ? first-second || a.index-b.index : Number.isFinite(first) ? -1 : Number.isFinite(second) ? 1 : a.index-b.index;
    });
    const references = new Map();
    const omitted = [];
    if (findings.length > LIMITS.findings) omitted.push('Findings: showing '+LIMITS.findings+' of '+findings.length+'.');
    if (events.length > LIMITS.events) omitted.push('Event appendix: showing '+LIMITS.events+' of '+events.length+'.');
    if (chronology.length > LIMITS.events) omitted.push('Timeline: showing '+LIMITS.events+' of '+chronology.length+' supporting records.');
    if (inactive.length > LIMITS.annotations) omitted.push('Inactive annotations: showing '+LIMITS.annotations+' of '+inactive.length+'.');
    const scope = report.scope?.mode === 'view' ? 'Current evidence and filters' : 'Entire dataset';
    const title = report.case?.title || 'Investigation review report';
    const findingHtml = selectedFindings.map((finding,index) => {
      const evidence = (finding.eventUids || []).map(uid => eventMap.get(uid)).filter(Boolean);
      const attack = profiles.attackReferences(finding.ruleId,evidence);
      attack.techniques.forEach(reference => references.set(reference.id,reference));
      return '<article class="finding"><h3>'+(index+1)+'. '+escape(finding.title)+'</h3><p class="meta">'+escape(finding.ruleId)+' · '+escape(finding.severity)+' review priority · '+escape(finding.score)+' points · '+evidence.length+' supporting record(s)</p>'+
        '<p>'+escape(finding.why)+'</p><h4>Analyst review · '+escape(finding.review?.status || 'Unreviewed')+'</h4>'+note(finding.review?.note)+
        '<h4>Matched fields</h4>'+pairs((finding.matchedFields || []).map(item => [item.label,item.value]))+
        '<p><strong>Score contributions:</strong> '+(finding.scoreBreakdown || []).map(item => escape(item.label)+' (+'+escape(item.points)+')').join('; ')+'. Points are per finding and are not added into a dataset score.</p>'+
        '<p><strong>Benign context:</strong> '+escape(finding.benign)+'</p><ol>'+(finding.next || []).map(step => '<li>'+escape(step)+'</li>').join('')+'</ol>'+
        '<p><strong>Supporting evidence:</strong> '+evidence.map(event => escape(event.uid+' — '+location(event))).join('; ')+'.</p>'+
        '<p><strong>ATT&amp;CK learning references:</strong> '+(attack.techniques.length ? attack.techniques.map(reference => '<a href="'+escape(reference.url)+'" rel="noreferrer">'+escape(reference.id+' · '+reference.name)+'</a>').join('; ') : 'No specific technique assigned.')+'</p><p class="muted">'+escape(attack.note)+'</p></article>';
    }).join('');
    const css = 'html{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef0f4;color:#20212b;font:14px/1.5 Arial,sans-serif}main{max-width:980px;margin:24px auto;padding:36px;background:white}h1{font-size:28px;line-height:1.2;margin:8px 0 16px;overflow-wrap:anywhere}h2{font-size:20px;border-bottom:2px solid #80629a;padding-bottom:6px;margin-top:28px;break-after:avoid}h3{font-size:17px;margin:0 0 8px;break-after:avoid}h4{font-size:14px;margin-bottom:6px;break-after:avoid}.eyebrow{color:#655077;letter-spacing:2px;font-size:12px}.meta,.muted,caption{color:#55576a}.notice{border:1px solid #8e6f43;border-left:5px solid #8e6f43;padding:12px;margin:16px 0;background:#fff9ee}.note{white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #bda9cb;padding:8px 12px;margin:8px 0}dl{display:grid;grid-template-columns:190px minmax(0,1fr);margin:12px 0}dt,dd{margin:0;padding:5px 8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere;white-space:pre-wrap}dt{font-weight:bold}.finding{padding:16px 0;border-bottom:1px solid #bab6c1}p,li,td{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:11px;margin:14px 0}caption{text-align:left;font-weight:bold;margin-bottom:6px}th,td{padding:7px;border:1px solid #bfc0c8;vertical-align:top;white-space:pre-wrap}th{background:#f0edf5;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}a{color:#49356d;text-decoration:underline}code{font-family:Consolas,monospace;overflow-wrap:anywhere}footer{margin-top:28px;border-top:1px solid #aaa;padding-top:12px;font-size:11px}@media(max-width:600px){main{margin:0;padding:18px}dl{grid-template-columns:1fr}dt{border-bottom:0}table{font-size:10px}th,td{padding:4px}}.source-table th:nth-child(1){width:12%}.source-table th:nth-child(2){width:24%}.source-table th:nth-child(3){width:10%}.source-table th:nth-child(4){width:8%}.source-table th:nth-child(5){width:46%}.coverage-table th:nth-child(1){width:25%}.coverage-table th:nth-child(2){width:15%}.coverage-table th:nth-child(3){width:12%}.coverage-table th:nth-child(4){width:8%}.coverage-table th:nth-child(5){width:40%}caption,thead{break-after:avoid}@page{size:A4;margin:14mm}@media print{body{background:white;font-size:9.5pt;line-height:1.35}main{max-width:none;margin:0;padding:0}h1{font-size:22pt}h2{font-size:14pt;margin-top:18px}h3{font-size:11.5pt}h4{margin:10px 0 4px}dt,dd{padding:3px 6px}.screen-help{display:none}a{color:inherit}p,li{orphans:2;widows:2}.notice{background:white}table{font-size:8pt}.note{background:none}p{margin:6px 0}ol,ul{margin:8px 0;padding-left:22px}dl{margin:8px 0}.finding{break-inside:avoid-page;padding:12px 0}footer{margin-top:12px;padding-top:6px;font-size:9px;break-before:avoid}.source-table{break-inside:avoid-page}}';
    const sourceRows = sources.map(source => [escape(source.id || 'source-1'),escape(source.name),escape(source.format),escape(source.sizeBytes ?? 'Unknown'),
      source.fingerprint ? '<code>'+escape(source.fingerprint.hex)+'</code><br>'+escape(source.fingerprint.verification === 'computed-at-import' ? 'Computed from original bytes at import' : 'Recorded in case; original bytes not reverified') : 'Unavailable; original bytes or browser cryptography unavailable']);
    const coverage = report.ruleCoverage || [];
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>'+escape(title)+'</title><style>'+css+'</style></head><body><main>'+
      '<header><p class="eyebrow">FIELDNOTES / INVESTIGATION REVIEW</p><h1>'+escape(title)+'</h1><p class="screen-help">Use your browser’s Print command (Ctrl+P / Cmd+P) to print or save as PDF. This file contains no scripts or remote assets.</p><p><strong>Scope:</strong> '+scope+' · '+events.length+' original records · '+findings.length+' complete finding(s) · '+events.filter(event => event.duplicateOf).length+' duplicate record(s) excluded from rules.</p></header>'+
      (omitted.length ? '<aside class="notice"><strong>Print limits applied.</strong> '+omitted.map(escape).join(' ')+' Narrow the evidence filters for a smaller report, or use JSON for the complete evidence.</aside>' : '')+
      '<p class="muted">Educational triage cues and related ATT&amp;CK references do not prove compromise, intent, or authorisation. Fingerprints identify bytes, not authenticity.</p>'+
      '<h2>Case and analysis context</h2>'+pairs([['Analyst',report.case?.analyst],['Collection timezone note',report.case?.collectionTimezone],['Generated',report.generatedAt],['Analysed',report.analyzedAt],['Tool',report.tool?.name+' '+report.tool?.version],['Rule catalog',report.tool?.rulesVersion],['Browser timezone',report.timestampContext?.browserTimezone],['Profile',report.ruleProfile?.id+' / '+report.ruleProfile?.version],['Export scope',scope],['Filters',JSON.stringify(report.scope?.filters || {})],['Settings',JSON.stringify(report.settings || {})]])+
      '<h3>Case notes</h3>'+note(report.case?.notes)+'<p>'+escape(report.timestampContext?.interpretation)+'</p>'+
      (report.caseOrigin ? '<h3>Reopened-case provenance</h3>'+pairs([['Case filename',report.caseOrigin.fileName],['Saved tool/rules',report.caseOrigin.toolVersion+' / '+report.caseOrigin.rulesVersion],['Saved',report.caseOrigin.savedAt],['Reopened',report.caseOrigin.reopenedAt]]) : '')+
      '<h2>Source provenance</h2>'+table('Source-file metadata covers the entire loaded collection, including files outside a filtered evidence export.',['File ID','Filename','Format','Bytes','SHA-256 / status'],sourceRows,'source-table')+
      '<p class="muted">Hash values in a reopened case are recorded metadata, not a new verification of the original file. Duplicate links use conservative record matching; all originals remain in JSON.</p>'+
      '<h2>Findings and analyst review</h2>'+(findingHtml || '<p>No complete configured finding is present in this export scope. Review coverage and surrounding evidence before drawing a conclusion.</p>')+
      (selectedAnnotations.length ? '<h3>Retained notes outside current findings</h3>'+selectedAnnotations.map(annotation => '<article class="finding"><h4>'+escape(annotation.findingId)+' · '+escape(annotation.status)+'</h4>'+note(annotation.note)+'</article>').join('') : '')+
      '<h2>Rule coverage and collection gaps</h2><p>Coverage scope: <strong>'+escape(report.ruleCoverageScope || 'exported events')+'</strong>. Assessed means required inputs are available, not proof of complete auditing. A record may have multiple field gaps.</p>'+
      table('Per-rule coverage',['Rule','State','Relevant / eligible','Findings','Gaps and warnings'],coverage.map(item => [escape(item.ruleId),escape(item.state),escape(item.relevantEvents+' / '+item.eligibleEvents),escape(item.findingCount),
        shorten(coverageDetails(item))]),'coverage-table')+
      '<h2>Supporting activity timeline</h2>'+table('Supporting records in time order; unparsed timestamps follow in source order. Showing '+Math.min(chronology.length,LIMITS.events)+' of '+chronology.length+'.',['Event','Original timestamp','Event ID','Source location'],chronology.slice(0,LIMITS.events).map(event => [escape(event.uid),escape(event.timeText || 'Time unavailable'),escape(event.id),escape(location(event))]))+
      '<h2>Event reference appendix</h2><p>This appendix shows selected context and source references, not every raw field. JSON and events CSV retain the original evidence strings. Long context fields above '+LIMITS.fieldCharacters+' characters are explicitly shortened.</p>'+
      table('Showing '+selectedEvents.length+' of '+events.length+' original records in export order.',['Event / ID','Timestamp','Account / host','Source / duplicate reference','Observed context'],selectedEvents.map(event => [escape(event.uid+' / '+event.id),escape(event.timeText || 'Time unavailable'),escape([event.account,event.computer,event.ip].filter(Boolean).join(' · ')),escape(location(event)+(event.duplicateOf ? '\nDuplicate of '+event.duplicateOf+'; excluded from rules' : '')),shorten(event.command || event.taskName || event.serviceName || event.message || 'No context text')]))+
      '<h2>ATT&amp;CK reference index</h2><p>Learning context only; references were reviewed '+escape(profiles.catalog.version)+'. The project does not claim these techniques were confirmed.</p><ul>'+[...references.values()].map(reference => '<li><a href="'+escape(reference.url)+'" rel="noreferrer">'+escape(reference.id+' · '+reference.name)+'</a><br>'+escape(reference.url)+'</li>').join('')+'</ul>'+
      '<h2>Applied profile and limitations</h2>'+note(JSON.stringify(report.ruleProfile || {},null,2))+'<ul>'+(report.limitations || []).map(limitation => '<li>'+escape(limitation)+'</li>').join('')+'</ul>'+
      '<footer>Windows Security Event Log Triage Tool · CREATED BY NAMITESH PANDEY<br>Generated locally. This report is a user-provided review snapshot, not a signed evidence record.</footer></main></body></html>';
    if (new TextEncoder().encode(html).length > LIMITS.bytes) throw new Error('Printable report exceeds 20 MB. Narrow the evidence scope or use JSON.');
    return html;
  }
  const api = Object.freeze({LIMITS,renderReport});
  if (common) module.exports = api;
  if (root) root.EventTriagePrintable = api;
})(typeof window !== 'undefined' ? window : globalThis);
