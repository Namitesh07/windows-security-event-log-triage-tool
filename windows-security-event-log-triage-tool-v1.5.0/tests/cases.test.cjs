const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const cases=require('../case-file'),inputs=require('../inputs'),analysis=require('../analysis'),profiles=require('../rule-profiles'),reports=require('../report');
function input(format='json') {
  const filename=format==='csv'?'password-guessing.csv':'authentication-sequence.'+format;
  const content=fs.readFileSync(path.join(__dirname,'../samples',filename),'utf8'),parsed=inputs.parseInput(content,format);
  const findings=analysis.analyze(parsed.events),finding=findings[0];
  return {events:parsed.events,findings,source:{name:filename,sizeBytes:Buffer.byteLength(content),format,kind:'fictional demo',loadedAt:'2026-10-24T04:00:00.000Z',lastModified:null},
    diagnostics:parsed.diagnostics,settings:analysis.DEFAULT_SETTINGS,ruleProfile:profiles.defaultProfile,browserTimezone:'UTC',analyzedAt:'2026-10-24T04:01:00.000Z',
    case:{title:'Lab review',analyst:'Namitesh',collectionTimezone:'UTC',notes:'Preserve 日本語 and <script>literal text</script>.'},
    annotations:{[finding.id]:{status:'Investigating',note:'Confirm owner.',ruleId:finding.ruleId,title:finding.title,eventUids:finding.events.map(event=>event.uid)}},
    scope:{mode:'all',totalEvents:parsed.events.length,totalFindings:findings.length}};
}
function document(){return JSON.parse(cases.saveCase(input()));}
for(const format of ['csv','xml','json','jsonl'])test('saved '+format+' case restores evidence, notes, settings, profiles, and exact source locations',()=>{
  const original=input(format),restored=cases.reopenCase(cases.saveCase(original),{browserTimezone:'UTC'});
  assert.deepEqual(restored.events.map(event=>event.rawFields),original.events.map(event=>event.rawFields));
  assert.deepEqual(restored.events.map(event=>[event.uid,event.sourceRecord,event.sourceLine]),original.events.map(event=>[event.uid,event.sourceRecord,event.sourceLine]));
  assert.deepEqual(restored.case,original.case);assert.deepEqual(restored.settings,original.settings);
  assert.deepEqual(restored.ruleProfile,profiles.normalizeProfile(original.ruleProfile));
  assert.equal(restored.annotations[original.findings[0].id].note,'Confirm owner.');
  assert.deepEqual(restored.findings.map(f=>[f.id,f.score,f.eventUids]),original.findings.map(f=>[f.id,f.score,f.events.map(e=>e.uid)]));
  assert.ok(restored.events[0].date instanceof Date);assert.equal(restored.source.name,original.source.name);
});
test('full v1.4 JSON reports reopen in original record order, regardless of export sorting',()=>{
  const original=input();original.events.reverse();const report=reports.createReport(original);report.tool.version='1.4.0';
  const restored=cases.reopenCase(JSON.stringify(report));
  assert.deepEqual(restored.events.map(e=>e.index),[1,2,3,4,5,6]);assert.equal(restored.origin.toolVersion,'1.4.0');
  assert.ok(restored.notices.some(note=>note.includes('Saved with tool 1.4.0')));
});
test('reopen recalculates findings and normalized fields instead of trusting saved scores or summaries',()=>{
  const saved=document();saved.report.findings[0].score=999;saved.report.findings[0].title='<img src=x>';
  saved.report.events[0].id='1102';saved.report.events[0].account='forged account';
  const restored=cases.reopenCase(JSON.stringify(saved));
  assert.equal(restored.events[0].id,'4625');assert.equal(restored.events[0].account,'learner');
  assert.equal(restored.findings[0].score,60);assert.notEqual(restored.findings[0].title,'<img src=x>');
});
test('inactive finding annotations survive tuning, save, reopen, and a later full report',()=>{
  const original=input(),old=original.findings[0].id;
  original.ruleProfile={schemaVersion:'1.0',id:'review',version:'1',rules:{AUTH_SUCCESS_AFTER_FAILURES:{enabled:false}}};
  original.findings=analysis.analyze(original.events,original.settings,original.ruleProfile);
  const restored=cases.reopenCase(cases.saveCase(original));
  assert.equal(restored.findings[0].ruleId,'AUTH_FAILURE_BURST');assert.equal(restored.annotations[old].note,'Confirm owner.');
  assert.equal(restored.ruleProfile.rules.AUTH_SUCCESS_AFTER_FAILURES.enabled,false);
});
test('timezone changes are disclosed for timezone-free source timestamps',()=>{
  const restored=cases.reopenCase(cases.saveCase(input('csv')),{browserTimezone:'Asia/Kolkata'});
  assert.ok(restored.notices.some(note=>note.includes('Timezone-free timestamps')));
  assert.equal(restored.origin.browserTimezone,'UTC');
});
test('source diagnostics retain skipped source records across reopening',()=>{
  const original=input();original.diagnostics.rowsRead+=1;original.diagnostics.rowsSkipped=1;original.diagnostics.invalidEventIdRows=[9];
  const restored=cases.reopenCase(cases.saveCase(original));assert.equal(restored.diagnostics.rowsSkipped,1);assert.deepEqual(restored.diagnostics.invalidEventIdRows,[9]);
});
for(const [name,mutate] of [
  ['filtered scope',saved=>{saved.report.scope.mode='view';}],['incomplete scope',saved=>{saved.report.scope.totalEvents++;}],
  ['unknown case schema',saved=>{saved.schemaVersion='99';}],['unknown case kind',saved=>{saved.kind='other';}],
  ['unknown report schema',saved=>{saved.report.schemaVersion='99';}],['missing evidence',saved=>{saved.report.events=[];}],
  ['duplicate event identity',saved=>{saved.report.events[1].uid='event-1';}],['invalid index',saved=>{saved.report.events[0].index=1.5;}],
  ['non-text source value',saved=>{saved.report.events[0].rawFields[0].value={anything:true};}],
  ['different field layout',saved=>{saved.report.events[1].rawFields[0].header='another field';}],
  ['invalid source Event ID',saved=>{saved.report.events[0].rawFields.find(field=>field.header==='Event ID').value='bad';}],
  ['oversized note',saved=>{saved.report.case.notes='a'.repeat(10001);}],
  ['unknown review status',saved=>{saved.report.annotations[0].status='Approved by system';}],
  ['foreign annotation reference',saved=>{saved.report.annotations[0].eventUids=['event-9999'];}],
  ['duplicate annotation',saved=>{saved.report.annotations.push(saved.report.annotations[0]);}],
  ['unsafe annotation ID',saved=>{saved.report.annotations[0].findingId='__proto__';}],
  ['invalid profile',saved=>{saved.report.ruleProfile.rules={UNKNOWN_RULE:{enabled:true}};}],
  ['invalid threshold',saved=>{saved.report.settings.failureThreshold=0;}],
  ['invalid source date',saved=>{saved.report.source.lastModified='2026-02-30T00:00:00.000Z';}],
  ['mismatched diagnostic count',saved=>{saved.report.diagnostics.rowsParsed++;}]
])test('case validation rejects '+name,()=>{const saved=document();mutate(saved);assert.throws(()=>cases.reopenCase(JSON.stringify(saved)));});
test('duplicate JSON keys are rejected before case fields can be overwritten',()=>assert.throws(()=>cases.reopenCase('{"kind":"fieldnotes-case","kind":"other"}'),/Duplicate JSON field/));
test('saving a filtered collection is refused',()=>{const original=input();original.scope.mode='view';assert.throws(()=>cases.saveCase(original),/entire dataset/);});
test('saved-case schema and report origin are exported without browser storage',()=>{
  const original=input();original.caseOrigin={fileName:'earlier-case.json',toolVersion:'1.4.0'};
  const saved=JSON.parse(cases.saveCase(original));assert.equal(saved.kind,'fieldnotes-case');assert.equal(saved.schemaVersion,'1.0');
  assert.equal(saved.report.caseOrigin.fileName,'earlier-case.json');assert.equal(saved.report.events[0]._searchText,undefined);
});
