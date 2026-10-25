const test=require('node:test'),assert=require('node:assert/strict');
const analysis=require('../analysis'),inputs=require('../inputs'),reports=require('../report');
const parse=text=>inputs.parseInput(text).events;
const assess=(events,profile,settings)=>analysis.ruleCoverage(events,analysis.analyze(events,settings,profile),profile,settings);
const rule=(coverage,id)=>coverage.find(item=>item.ruleId===id);
test('every catalog rule has coverage and absent IDs are distinguished from disabled rules',()=>{
  const coverage=assess(parse('Event ID,Message\n9999,unrelated'),{schemaVersion:'1.0',id:'test',version:'1',rules:{PS_ENCODED:{enabled:false}}});
  assert.equal(coverage.length,Object.keys(analysis.rules).length);assert.equal(rule(coverage,'PS_ENCODED').state,'disabled');
  assert.equal(rule(coverage,'AUTH_FAILURE_BURST').state,'no-events');assert.match(rule(coverage,'AUTH_FAILURE_BURST').explanation,/does not establish/);
});
test('authentication gaps identify missing time, target, host, source, and companion events',()=>{
  const coverage=assess(parse('Event ID,Timestamp,Computer,TargetUserName,IpAddress\n4625,,,,\n4625,2026-10-25T09:00:00Z,LAB,learner,192.0.2.2'));
  const burst=rule(coverage,'AUTH_FAILURE_BURST');assert.equal(burst.state,'partial');assert.equal(burst.eligibleEvents,1);assert.equal(burst.excludedEvents,1);
  assert.equal(burst.missingFields.length,4);assert.deepEqual(burst.missingFields[0].exampleEventUids,['event-1']);
  const success=rule(coverage,'AUTH_SUCCESS_AFTER_FAILURES');assert.equal(success.state,'insufficient-data');assert.deepEqual(success.missingEventTypes,['4624']);
});
test('date-only timestamps and workstation-only authentication have rule-specific eligibility',()=>{
  const coverage=assess(parse('Event ID,Timestamp,Computer,TargetUserName,WorkstationName\n4625,2026-10-25,LAB,learner,CLIENT\n4625,2026-10-25T09:00:00Z,LAB,learner,CLIENT'));
  assert.equal(rule(coverage,'AUTH_FAILURE_BURST').eligibleEvents,1);assert.equal(rule(coverage,'AUTH_PASSWORD_SPRAY').eligibleEvents,0);
  assert.ok(rule(coverage,'AUTH_PASSWORD_SPRAY').missingFields.some(gap=>gap.field==='Source IP'&&gap.events===2));
});
test('process rules explain missing commands without misclassifying other process contexts',()=>{
  const events=parse('Event ID,NewProcessName,ParentProcessName,CommandLine\n4688,powershell.exe,explorer.exe,\n4688,notepad.exe,explorer.exe,');
  const coverage=assess(events),powershell=rule(coverage,'PS_DOWNLOAD_EXECUTE');
  assert.equal(powershell.state,'partial');assert.equal(powershell.eligibleEvents,1);assert.equal(powershell.missingFields[0].field,'PowerShell command line');
  assert.equal(rule(coverage,'OFFICE_SHELL_CHILD').state,'assessed');assert.equal(rule(coverage,'SCRIPT_HOST_REMOTE').state,'assessed');
});
test('PowerShell fragments produce partial coverage even when the available text fires a rule',()=>{
  const events=parse('Event ID,ScriptBlockText,MessageNumber,MessageTotal\n4104,FromBase64String(abc),1,2'),coverage=assess(events);
  const encoded=rule(coverage,'PS_ENCODED');assert.equal(encoded.state,'partial');assert.equal(encoded.findingCount,1);assert.match(encoded.warnings[0],/not reconstructed/);
});
test('ID-only review cues still run when investigation context is missing',()=>{
  const coverage=assess(parse('Event ID,Message\n7045,\n4698,'));
  assert.equal(rule(coverage,'SERVICE_INSTALLED').state,'assessed');assert.equal(rule(coverage,'SERVICE_INSTALLED').findingCount,1);
  assert.ok(rule(coverage,'SERVICE_INSTALLED').warnings.length);assert.equal(rule(coverage,'TASK_CREATED').findingCount,1);
});
test('coverage counts exclude confirmed duplicates and report emitted findings under active settings',()=>{
  const events=parse('Event ID,Timestamp,Computer,TargetUserName,IpAddress\n4625,2026-10-25T09:00:00Z,LAB,learner,192.0.2.2\n4625,2026-10-25T09:01:00Z,LAB,learner,192.0.2.2');
  let coverage=assess(events,undefined,{failureThreshold:2});assert.equal(rule(coverage,'AUTH_FAILURE_BURST').findingCount,1);
  events[1].duplicateOf='event-1';coverage=assess(events,undefined,{failureThreshold:2});assert.equal(rule(coverage,'AUTH_FAILURE_BURST').relevantEvents,1);assert.equal(rule(coverage,'AUTH_FAILURE_BURST').findingCount,0);
  assert.equal(rule(coverage,'AUTH_FAILURE_BURST').settings.failureThreshold,2);
});
test('full and scoped report coverage clearly declares the dataset used for its counts',()=>{
  const events=parse('Event ID,Message\n7045,service\n9999,other'),findings=analysis.analyze(events);
  const report=reports.createReport({events,findings,source:{name:'test.csv'}});assert.equal(report.ruleCoverageScope,'exported events');
  assert.equal(rule(report.ruleCoverage,'SERVICE_INSTALLED').findingCount,1);
  const scoped=reports.createReport({events:[events[1]],findings:[],source:{name:'test.csv'}});assert.equal(rule(scoped.ruleCoverage,'SERVICE_INSTALLED').state,'no-events');
});
