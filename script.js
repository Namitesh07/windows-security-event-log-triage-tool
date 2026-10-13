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
  const sampleNames = {normal:'Normal Windows Activity',password:'Password Guessing Scenario',account:'Account Persistence Scenario',mixed:'Mixed SOC Scenario'};
  const els = Object.fromEntries(['csv-file','file-name','analyze-button','parse-status','drop-zone','failure-threshold','reset-settings','report','dataset-tag','summary-banner','metrics','findings','finding-count','top-accounts','top-failures','common-ids','event-search','filter-id','filter-severity','filter-ip','filter-type','event-rows','visible-count','timeline'].map(id=>[id,document.getElementById(id)]));
  let selectedFile = null;
  let currentEvents = [];
  let currentFindings = [];
  let currentDiagnostics = null;

  const csvEscape = value => `"${String(value).replaceAll('"','""')}"`;
  const makeCsv = rows => [csvHeader,...rows.map(row=>row.map(csvEscape).join(','))].join('\r\n');

  const { parseCsv, normalizeEvents, analyze, eventSort, labelById } = window.EventTriageAnalysis;
  const severityOrder={High:0,Medium:1,Low:2,Informational:3};
  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function displayTime(e){return e.timeText||'Time unavailable';}
  function severityForEvent(e){if(e.id==='1102')return'High';if(['4720','4728','4732','7045'].includes(e.id))return'Medium';if(e.id==='4625')return'Low';if(e.id==='4726')return'Low';return'Informational';}
  function setStatus(text,error=false){els['parse-status'].textContent=text;els['parse-status'].classList.toggle('error',error);}
  function render(){
    const events=currentEvents, findings=currentFindings;els.report.hidden=false;
    const high=findings.filter(f=>f.severity==='High').length;els['dataset-tag'].textContent=selectedFile?.name||sampleNames[selectedFile?.sample]||'UPLOADED DATA';
    els['summary-banner'].innerHTML=`<strong>${high?`${high} high-priority ${high===1?'finding':'findings'} need review.`:'Triage complete.'}</strong> ${findings.length?`${findings.length} explainable finding${findings.length===1?'':'s'} generated from ${events.length} parsed events.`:`No rule-based findings were generated from ${events.length} parsed events. Review the event evidence and logging coverage.`}`;
    const counts={total:events.length,success:events.filter(e=>e.id==='4624').length,failed:events.filter(e=>e.id==='4625').length,created:events.filter(e=>e.id==='4720').length,priv:events.filter(e=>['4728','4732'].includes(e.id)).length,cleared:events.filter(e=>e.id==='1102').length,process:events.filter(e=>e.id==='4688').length,findings:findings.length};
    const metrics=[['Total events',counts.total],['Successful logons',counts.success],['Failed logons',counts.failed],['Accounts created',counts.created],['Privilege changes',counts.priv],['Audit-log clearing',counts.cleared],['Process creation',counts.process],['Needs investigation',counts.findings,true]];
    els.metrics.replaceChildren(...metrics.map(([label,value,accent])=>{const div=document.createElement('div');div.className='metric'+(accent?' accent':'');div.innerHTML=`<span>${escapeHtml(label)}</span><strong>${value}</strong>`;return div;}));
    els['finding-count'].textContent=String(findings.length);
    renderFindings(findings);renderSnapshots(events);renderFilters(events,findings);renderTimeline(events,findings);renderTable();
  }
  function renderFindings(findings){
    if(!findings.length){els.findings.innerHTML='<div class="empty-state">No configured rule fired. That does not prove the system is safe; check the available logs and surrounding context.</div>';return;}
    els.findings.replaceChildren(...findings.map(f=>{
      const card=document.createElement('article');card.className=`finding-card sev-${f.severity.toLowerCase()}`;
      const names=[...new Set(f.events.map(e=>e.account).filter(Boolean))];const times=f.events.map(displayTime);const source=[...new Set(f.events.map(e=>e.ip||e.computer).filter(Boolean))].join(', ');
      const ids=[...new Set(f.events.map(e=>e.id))].join(' → ');const evidence=f.events.length>1?`${f.events.length} events`:f.events[0]?.id;
      const scoreReason=f.score===30&&f.title.toLowerCase().includes('followed by success')?'+10 repeated failures · +20 success after failures':f.title==='Repeated failed logons'?'+10 repeated failures':f.title==='Security audit log cleared'?'+30 audit log cleared':f.title.toLowerCase().includes('new account granted')?'+25 new account with group change':f.title.toLowerCase().includes('group membership changed')?`+${f.score} group membership change`:f.title==='User account created'?'+15 account created':f.title==='User account deleted'?'+5 account deleted':f.title==='Windows service installed'?'+15 service installed':f.title.toLowerCase().includes('encoded')?'+10 obfuscation cue':`+${f.score} combined administrative activity`;
      card.innerHTML=`<div class="finding-top"><h4>${escapeHtml(f.title)}</h4><span class="severity ${f.severity.toLowerCase()}">${escapeHtml(f.severity)}</span></div><div class="finding-meta">EVENT ${escapeHtml(ids)} · ${escapeHtml(evidence)} · INVESTIGATION SCORE +${f.score} (${escapeHtml(scoreReason)})</div><p><strong>Account:</strong> ${escapeHtml(names.join(', ')||'Not identified')} &nbsp; <strong>Time:</strong> ${escapeHtml(times.length===1?times[0]:`${times[0]} — ${times.at(-1)}`)}${source?`<br><strong>Source:</strong> ${escapeHtml(source)}`:''}</p><p><strong>Observed activity:</strong> ${escapeHtml(f.why)}</p><details><summary>Why it matters, benign explanations &amp; next steps</summary><p><strong>Why this matters:</strong> ${escapeHtml(f.why)}</p><p><strong>Possible benign explanation:</strong> ${escapeHtml(f.benign)}</p><strong>Suggested investigation:</strong><ol>${f.next.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol></details>`;
      return card;
    }));
  }
  function setSnapshot(id,title,items){const root=els[id];root.replaceChildren();const block=document.createElement('div');block.className='snapshot-block';block.innerHTML=`<h4>${escapeHtml(title)}</h4>`;if(!items.length){block.innerHTML+='<p class="muted small">No data available</p>';}else{const ul=document.createElement('ul');for(const [name,n] of items){const li=document.createElement('li');li.innerHTML=`<span>${escapeHtml(name)}</span><strong>${n}</strong>`;ul.append(li);}block.append(ul);}root.append(block);}
  function topN(counts){return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,5);}
  function renderSnapshots(events){const accounts=new Map(),fails=new Map(),ids=new Map();for(const e of events){if(e.account)accounts.set(e.account,(accounts.get(e.account)||0)+1);if(e.id==='4625'&&e.account)fails.set(e.account,(fails.get(e.account)||0)+1);ids.set(e.id,(ids.get(e.id)||0)+1);}setSnapshot('top-accounts','Top accounts by event count',topN(accounts));setSnapshot('top-failures','Accounts with failed logons',topN(fails));setSnapshot('common-ids','Most common Event IDs',topN(ids).map(([id,n])=>[`${id} · ${labelById[id]||'Other event'}`,n]));}
  function renderFilters(events,findings){const currentId=els['filter-id'].value,currentIp=els['filter-ip'].value,currentType=els['filter-type'].value;const ids=[...new Set(events.map(e=>e.id))].sort((a,b)=>Number(a)-Number(b));const ips=[...new Set(events.map(e=>e.ip).filter(Boolean))].sort();const types=[...new Set(events.map(e=>labelById[e.id]||'Other event'))].sort();els['filter-id'].innerHTML='<option value="">All event IDs</option>'+ids.map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(id)} · ${escapeHtml(labelById[id]||'Other event')}</option>`).join('');els['filter-ip'].innerHTML='<option value="">All source IPs</option>'+ips.map(ip=>`<option>${escapeHtml(ip)}</option>`).join('');els['filter-type'].innerHTML='<option value="">All event types</option>'+types.map(t=>`<option>${escapeHtml(t)}</option>`).join('');if(ids.includes(currentId))els['filter-id'].value=currentId;if(ips.includes(currentIp))els['filter-ip'].value=currentIp;if(types.includes(currentType))els['filter-type'].value=currentType;}
  function renderTimeline(events,findings){const noteworthy=new Set(findings.flatMap(f=>f.events));const sorted=[...noteworthy].sort(eventSort);if(!sorted.length){els.timeline.innerHTML='<li>No noteworthy activity generated by the current rules.</li>';return;}els.timeline.replaceChildren(...sorted.map(e=>{const li=document.createElement('li');li.innerHTML=`<time>${escapeHtml(displayTime(e))}</time><strong>${escapeHtml(labelById[e.id]||`Event ${e.id}`)}</strong> · ${escapeHtml(e.account||e.computer||'Account not identified')}`;return li;}));}
  function eventSeverityFilter(e){const related=currentFindings.filter(f=>f.events.includes(e));if(related.length)return related.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity])[0].severity;return severityForEvent(e);}
  function renderTable(){const search=els['event-search'].value.trim().toLowerCase();const id=els['filter-id'].value,sev=els['filter-severity'].value,ip=els['filter-ip'].value,type=els['filter-type'].value;const filtered=currentEvents.filter(e=>{const label=labelById[e.id]||'Other event';const hay=[e.id,e.account,e.actor,e.user,e.computer,e.ip,e.workstation,e.process,e.parent,e.processId,e.command,e.logonType,e.serviceName,e.servicePath,e.scriptBlockId,e.group,e.source,e.message,label].join(' ').toLowerCase();return(!search||hay.includes(search))&&(!id||e.id===id)&&(!sev||eventSeverityFilter(e)===sev)&&(!ip||e.ip===ip)&&(!type||label===type);});els['visible-count'].textContent=`${filtered.length} of ${currentEvents.length} events`;if(!filtered.length){els['event-rows'].innerHTML='<tr><td colspan="6" class="table-empty">No events match these filters.</td></tr>';return;}els['event-rows'].replaceChildren(...filtered.slice(0,1000).map(e=>{const tr=document.createElement('tr');const severity=eventSeverityFilter(e);const summary=[labelById[e.id]||'Other event',e.actor?'Actor: '+e.actor:'',e.logonType?'Logon type: '+e.logonType:'',e.process?'Process: '+e.process:'',e.parent?'Parent: '+e.parent:'',e.processId?'Process ID: '+e.processId:'',e.group?'Group: '+e.group:'',e.serviceName?'Service: '+e.serviceName:'',e.servicePath?'Service path: '+e.servicePath:'',e.scriptBlockId?'Script block: '+e.scriptBlockId:'',e.command?'Command: '+e.command:'',e.message].filter(Boolean).join(' · ');tr.innerHTML=`<td>${escapeHtml(displayTime(e))}</td><td>${escapeHtml(e.id)}</td><td><span class="severity ${severity.toLowerCase()}">${escapeHtml(severity)}</span></td><td>${escapeHtml(e.account||'—')}</td><td>${escapeHtml(e.ip||e.computer||'—')}</td><td class="event-message">${escapeHtml(summary)}</td>`;return tr;}));}
  function clearLoadedInput(name,message,error=false){
    currentEvents=[];currentFindings=[];currentDiagnostics=null;selectedFile={name};
    els['file-name'].textContent=name;els['analyze-button'].disabled=true;els.report.hidden=true;
    setStatus(message,error);
  }
  function processText(text,name){
    selectedFile={name};
    try{
      const result=normalizeEvents(parseCsv(text));
      currentEvents=result.events;currentDiagnostics=result.diagnostics;currentFindings=[];
      els['file-name'].textContent=name;els['analyze-button'].disabled=false;els.report.hidden=true;
      const d=currentDiagnostics;
      const describeRows=rows=>{const shown=rows.slice(0,8).join(', ');return rows.length>8?shown+' and '+(rows.length-8)+' more':shown;};
      const skippedRows=[...d.blankEventIdRows,...d.invalidEventIdRows].sort((a,b)=>a-b);
      const skipped=d.rowsSkipped?' '+d.rowsSkipped+' row'+(d.rowsSkipped===1?' was':'s were')+' skipped; Event ID is blank or unreadable in CSV row(s) '+describeRows(skippedRows)+'.':'';
      const uncertain=d.ambiguousTimestamps+d.invalidTimestamps+d.missingTimestamps;
      const timestampRows=[...d.ambiguousTimestampRows,...d.invalidTimestampRows,...d.missingTimestampRows].sort((a,b)=>a-b);
      const timestampNote=uncertain?' Timestamp review needed in CSV row(s) '+describeRows(timestampRows)+' ('+d.ambiguousTimestamps+' ambiguous, '+d.invalidTimestamps+' unrecognised, '+d.missingTimestamps+' missing); row order is used when a timestamp cannot be parsed.':' Timestamps were parsed successfully.';
      setStatus(d.rowsParsed+' events parsed from '+d.rowsRead+' rows.'+skipped+timestampNote+' Select Analyse events to build the report.');
    }catch(error){
      clearLoadedInput(name,error.message||'Could not parse this CSV.',true);
    }
  }
  els['csv-file'].addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!file.name.toLowerCase().endsWith('.csv')){clearLoadedInput(file.name,'Please choose a file with a .csv extension.',true);return;}
    if(file.size>25*1024*1024){clearLoadedInput(file.name,'This file is over the 25 MB learning-tool limit. Export a smaller time range and try again.',true);return;}
    try{processText(await file.text(),file.name);}
    catch{clearLoadedInput(file.name,'The selected file could not be read in this browser.',true);}
  });
  els['analyze-button'].addEventListener('click',()=>{if(!currentEvents.length)return;currentFindings=analyze(currentEvents,Math.max(2,Math.min(100,Number(els['failure-threshold'].value)||5)));render();els.report.scrollIntoView({behavior:'smooth',block:'start'});setStatus('Triage report ready.');});
  document.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sample;processText(makeCsv(sampleRows[key]),`${sampleNames[key]} · Demo Data`);document.querySelector('.demo-details').open=true;}));
  for(const id of ['event-search','filter-id','filter-severity','filter-ip','filter-type'])els[id].addEventListener('input',renderTable);
  els['failure-threshold'].addEventListener('change',()=>{if(currentEvents.length&&!els.report.hidden){currentFindings=analyze(currentEvents,Number(els['failure-threshold'].value)||5);render();}});
  els['reset-settings'].addEventListener('click',()=>{els['failure-threshold'].value='5';if(currentEvents.length&&!els.report.hidden){currentFindings=analyze(currentEvents,5);render();}});
  const zone=els['drop-zone'];for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('dragover');});for(const type of ['dragleave','drop'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.remove('dragover');});zone.addEventListener('drop',event=>{const file=event.dataTransfer.files?.[0];if(!file)return;const transfer=new DataTransfer();transfer.items.add(file);els['csv-file'].files=transfer.files;els['csv-file'].dispatchEvent(new Event('change',{bubbles:true}));});
})();
