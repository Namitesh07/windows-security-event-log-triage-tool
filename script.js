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

  const csvEscape = value => `"${String(value).replaceAll('"','""')}"`;
  const makeCsv = rows => [csvHeader,...rows.map(row=>row.map(csvEscape).join(','))].join('\r\n');

  function parseCsv(text) {
    const rows=[]; let row=[]; let field=''; let quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){
        if(c==='"' && text[i+1]==='"'){field+='"';i++;}
        else if(c==='"') quoted=false;
        else field+=c;
      } else if(c==='"' && field.length===0) quoted=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\n'){row.push(field);field='';if(row.some(v=>v.trim()))rows.push(row);row=[];}
      else if(c==='\r') { if(text[i+1]==='\n') continue; row.push(field);field='';if(row.some(v=>v.trim()))rows.push(row);row=[]; }
      else field+=c;
    }
    if(quoted) throw new Error('The CSV has an unclosed quoted field. Check the export or save it again as CSV.');
    row.push(field);if(row.some(v=>v.trim()))rows.push(row);
    if(rows.length<2) throw new Error('This CSV does not contain a header row and any event records.');
    return rows;
  }
  const normalizeHeader = s => s.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  function mapHeaders(headers){
    const aliases={id:['eventid','eventidentifier','id'],time:['dateandtime','datetime','timecreated','timestamp','date'],level:['level','severity'],source:['source','provider','eventsource'],task:['taskcategory','task'],user:['user','username','account','accountname'],computer:['computer','hostname','workstation'],keywords:['keywords','keyword'],message:['message','description','eventmessage']};
    const map={}; headers.forEach((h,i)=>{const n=normalizeHeader(h);for(const [key,values] of Object.entries(aliases))if(values.includes(n)&&map[key]===undefined)map[key]=i;});
    if(map.id===undefined) throw new Error('Could not find an Event ID column. Expected a header such as “Event ID”, “EventID”, or “event_id”.');
    return map;
  }
  function pick(row,index){return index===undefined?'':String(row[index]??'').trim();}
  function firstMatch(text,patterns){for(const p of patterns){const m=text.match(p);if(m&&m[1])return m[1].trim();}return '';}
  function parseTimestamp(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
  function isAfter(later,earlier){return later.date&&earlier.date?later.date.getTime()>=earlier.date.getTime():later.index>earlier.index;}
  function normalizeEvents(rows){
    const headers=rows[0].map(v=>v.trim());const map=mapHeaders(headers);const events=[];
    for(let i=1;i<rows.length;i++){
      const row=rows[i];if(!row.some(v=>String(v).trim()))continue;
      const id=pick(row,map.id).replace(/\D/g,'');if(!id)continue;
      const message=pick(row,map.message);const user=pick(row,map.user);const timeText=pick(row,map.time);
      const target=firstMatch(message,[/(?:Target Account Name|TargetUserName|Member Account Name|Account Name|Account):\s*([^;\r\n]+)/i,/(?:New Account Name):\s*([^;\r\n]+)/i])||user.replace(/^.*\\/,'').replace(/\s+\(.+$/,'');
      const ip=firstMatch(message,[/(?:Source Network Address|Source Address|IpAddress|IP Address|Client Address):\s*([^;\s\r\n]+)/i])||(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(user)?user:'');
      const workstation=firstMatch(message,[/(?:Workstation Name|Workstation|Caller Computer Name|Computer Name):\s*([^;\r\n]+)/i]);
      const proc=firstMatch(message,[/(?:New Process Name|Process Name|Service File Name):\s*([^;\r\n]+)/i]);
      const parent=firstMatch(message,[/(?:Creator Process Name|Parent Process Name):\s*([^;\r\n]+)/i]);
      const group=firstMatch(message,[/(?:Group Name|Target Group Name):\s*([^;\r\n]+)/i]);
      const command=firstMatch(message,[/(?:Process Command Line|Command Line):\s*([^;\r\n]+)/i]);
      const d=parseTimestamp(timeText);
      events.push({id,level:pick(row,map.level),timeText,date:d,source:pick(row,map.source),task:pick(row,map.task),user,account:target,computer:pick(row,map.computer)||workstation,ip,workstation,process:proc,parent,group,command,message,keywords:pick(row,map.keywords),index:events.length+1});
    }
    if(!events.length)throw new Error('No rows with a readable Event ID were found. Check the CSV contents.');
    return events;
  }
  const labelById={'4624':'Successful logon','4625':'Failed logon','4720':'User account created','4726':'User account deleted','4728':'Added to global security group','4732':'Added to local security group','1102':'Security audit log cleared','4688':'Process created','4104':'PowerShell script block logged','7045':'Windows service installed'};
  const severityOrder={High:0,Medium:1,Low:2,Informational:3};
  function makeFinding(title,severity,events,why,benign,next,score){return {title,severity,events,why,benign,next,score};}
  function analyze(events,threshold){
    const findings=[];const used=new Set();const byAccount=new Map();
    for(const e of events){if(e.account){const key=e.account.toLowerCase();if(!byAccount.has(key))byAccount.set(key,[]);byAccount.get(key).push(e);}}
    for(const [,group] of byAccount){const fails=group.filter(e=>e.id==='4625').sort(eventSort);if(fails.length>=threshold){const lastFail=fails.at(-1);const success=group.filter(e=>e.id==='4624'&&(lastFail.date&&e.date?e.date>=lastFail.date:e.index>lastFail.index)).sort(eventSort)[0];const involved=success?[...fails,success]:fails;involved.forEach(e=>used.add(e));findings.push(makeFinding(success?'Possible password guessing followed by success':'Repeated failed logons',success?'High':'Medium',involved,success?'Repeated failed authentication attempts for this account were followed by a successful logon in this dataset.':'This account has repeated failed authentication attempts in this dataset.', 'A legitimate user may have mistyped a password, or a service may be using stale credentials.', ['Verify the source device and IP address.','Check whether this activity was expected for the account.','Review nearby authentication and endpoint activity.','Check whether other accounts were targeted.'],success?30:10));}}
    for(const [key,group] of byAccount){const created=group.filter(e=>e.id==='4720').sort(eventSort);for(const c of created){const add=events.filter(e=>['4728','4732'].includes(e.id)&&e.account.toLowerCase()===key&&isAfter(e,c)).sort(eventSort)[0];if(add&&!used.has(c)&&!used.has(add)){used.add(c);used.add(add);findings.push(makeFinding('New account granted group membership',/admin|domain controllers|enterprise admins|backup operators/i.test(add.group)?'High':'Medium',[c,add],'An account creation event was followed by a global or local security group addition involving the same account.','This can be a legitimate onboarding or service-account task if it was approved and documented.',['Confirm the account creation was authorised.','Identify the administrator who made the change.','Review the group’s privileges and the new account’s activity.','Confirm whether the account is still required.'],25));}}}
    for(const e of events){
      if(e.id==='1102'){used.add(e);findings.push(makeFinding('Security audit log cleared','High',[e],'The Windows Security audit log was cleared. Clearing can remove useful investigation history and is commonly reviewed as possible defence evasion.','An administrator may have cleared the log during authorised maintenance or troubleshooting.',['Confirm who cleared the log and why.','Review change records and other log sources around this time.','Check whether log collection continued elsewhere.'],30));}
      else if(['4728','4732'].includes(e.id)&&!used.has(e)){const privileged=/administrators|domain admins|enterprise admins|backup operators|account operators|server operators/i.test(e.group+' '+e.message);used.add(e);findings.push(makeFinding(privileged?'Privileged group membership changed':'Security group membership changed',privileged?'High':'Medium',[e],`An account was added to a security group${e.group?` (“${e.group}”)`:''}. Group membership can change what an account is allowed to do.`,'This may be an authorised access request or routine administration.',['Verify the change against an approved request.','Confirm the affected account and group are expected.','Review the actor and surrounding account activity.'],privileged?25:15));}
      else if(e.id==='4720'&&!used.has(e)){used.add(e);findings.push(makeFinding('User account created','Medium',[e],'A new Windows user account was created. Unexpected accounts can provide access that persists beyond a single login.','Account creation is common during onboarding, testing, or service setup.',['Confirm the account owner and request.','Check whether the account has appropriate groups and an expiry plan.'],15));}
      else if(e.id==='4726'){used.add(e);findings.push(makeFinding('User account deleted','Low',[e],'A Windows user account was deleted. This may affect access and audit context.','Routine offboarding or cleanup is a common explanation.',['Confirm the deletion matches an approved offboarding or cleanup task.'],5));}
      else if(e.id==='7045'){used.add(e);findings.push(makeFinding('Windows service installed','Medium',[e],'A new Windows service was installed. Services can run automatically and are sometimes used for persistence.','A software installation or approved system update may create a service.',['Verify the software, service path, publisher, and installation change.'],15));}
      else if(e.id==='4104'){used.add(e);const obfuscated=/frombase64string|encodedcommand|-enc\b|\\x[0-9a-f]{2}|\^|char\s*\(/i.test(e.message);if(obfuscated)findings.push(makeFinding('PowerShell script block contains encoded or obfuscated text','Medium',[e],'The logged script block includes patterns often used to hide command content. This is a review cue, not proof of malicious code.','Administrators and software installers may use encoded commands for legitimate automation.',['Review the complete script block and its parent process.','Confirm the script source and intended change.'],10));}
    }
    // Administrative activity summary is deliberately dataset-level; it does not claim the events share an actor.
    const adminEvents=events.filter(e=>['4720','4728','4732','7045','1102'].includes(e.id));
    if(adminEvents.length>=2) findings.push(makeFinding('Administrative / Privilege Activity','Medium',adminEvents,'The dataset includes multiple account, group, service, or audit-log changes. They are summarized together for review; the tool does not assume they are related.','These changes may reflect normal administration, software installation, or approved access management.',['Review each event against its own change record.','Compare actors, systems, and timestamps before deciding whether the events are connected.'],10));
    // Context events are shown in the event table but do not create individual alerts.
    return findings.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]||b.score-a.score);
  }
  function eventSort(a,b){return a.date&&b.date?a.date-b.date:a.index-b.index;}
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
  function renderTable(){const search=els['event-search'].value.trim().toLowerCase();const id=els['filter-id'].value,sev=els['filter-severity'].value,ip=els['filter-ip'].value,type=els['filter-type'].value;const filtered=currentEvents.filter(e=>{const label=labelById[e.id]||'Other event';const hay=[e.id,e.account,e.user,e.computer,e.ip,e.source,e.message,label].join(' ').toLowerCase();return(!search||hay.includes(search))&&(!id||e.id===id)&&(!sev||eventSeverityFilter(e)===sev)&&(!ip||e.ip===ip)&&(!type||label===type);});els['visible-count'].textContent=`${filtered.length} of ${currentEvents.length} events`;if(!filtered.length){els['event-rows'].innerHTML='<tr><td colspan="6" class="table-empty">No events match these filters.</td></tr>';return;}els['event-rows'].replaceChildren(...filtered.slice(0,1000).map(e=>{const tr=document.createElement('tr');const severity=eventSeverityFilter(e);const summary=[labelById[e.id]||'Other event',e.process?`Process: ${e.process}`:'',e.parent?`Parent: ${e.parent}`:'',e.group?`Group: ${e.group}`:'',e.command?`Command: ${e.command}`:'',e.message].filter(Boolean).join(' · ');tr.innerHTML=`<td>${escapeHtml(displayTime(e))}</td><td>${escapeHtml(e.id)}</td><td><span class="severity ${severity.toLowerCase()}">${escapeHtml(severity)}</span></td><td>${escapeHtml(e.account||e.user||'—')}</td><td>${escapeHtml(e.ip||e.computer||'—')}</td><td class="event-message">${escapeHtml(summary)}</td>`;return tr;}));}
  function processText(text,name){selectedFile={name,sample:name};try{const rows=parseCsv(text);currentEvents=normalizeEvents(rows);currentFindings=analyze(currentEvents,Math.max(2,Math.min(100,Number(els['failure-threshold'].value)||5)));els['file-name'].textContent=name;els['analyze-button'].disabled=true;els.report.hidden=true;setStatus(`${currentEvents.length} events parsed successfully. Select Analyse events to build the report.`);els['analyze-button'].disabled=false;}
    catch(error){currentEvents=[];currentFindings=[];els['file-name'].textContent=name;els['analyze-button'].disabled=true;els.report.hidden=true;setStatus(error.message||'Could not parse this CSV.',true);}}
  els['csv-file'].addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;selectedFile={name:file.name};if(!file.name.toLowerCase().endsWith('.csv')&&file.type!=='text/csv'){setStatus('Please choose a CSV file.',true);return;}if(file.size>25*1024*1024){setStatus('This file is over the 25 MB learning-tool limit. Export a smaller time range and try again.',true);return;}try{processText(await file.text(),file.name);}catch{setStatus('The selected file could not be read in this browser.',true);}});
  els['analyze-button'].addEventListener('click',()=>{if(!currentEvents.length)return;currentFindings=analyze(currentEvents,Math.max(2,Math.min(100,Number(els['failure-threshold'].value)||5)));render();els.report.scrollIntoView({behavior:'smooth',block:'start'});setStatus('Triage report ready.');});
  document.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sample;processText(makeCsv(sampleRows[key]),`${sampleNames[key]} · Demo Data`);document.querySelector('.demo-details').open=true;}));
  for(const id of ['event-search','filter-id','filter-severity','filter-ip','filter-type'])els[id].addEventListener('input',renderTable);
  els['failure-threshold'].addEventListener('change',()=>{if(currentEvents.length){currentFindings=analyze(currentEvents,Math.max(2,Math.min(100,Number(els['failure-threshold'].value)||5)));if(!els.report.hidden)render();}});
  els['reset-settings'].addEventListener('click',()=>{els['failure-threshold'].value='5';if(currentEvents.length){currentFindings=analyze(currentEvents,5);if(!els.report.hidden)render();}});
  const zone=els['drop-zone'];for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('dragover');});for(const type of ['dragleave','drop'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.remove('dragover');});zone.addEventListener('drop',event=>{const file=event.dataTransfer.files?.[0];if(!file)return;const transfer=new DataTransfer();transfer.items.add(file);els['csv-file'].files=transfer.files;els['csv-file'].dispatchEvent(new Event('change',{bubbles:true}));});
})();
