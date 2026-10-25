const test=require('node:test'),assert=require('node:assert/strict');
const collection=require('../collection'),inputs=require('../inputs'),analysis=require('../analysis'),reports=require('../report'),cases=require('../case-file');
const fixture=require('./collection-fixtures.cjs');
const file=(name,records)=>({name,text:fixture.csv(records)});
async function savedInput() {
  const parsed=await collection.parseFiles(fixture.files()),findings=analysis.analyze(parsed.events);
  return {...parsed,findings,case:{notes:'Review both sources'},annotations:{},settings:analysis.DEFAULT_SETTINGS,browserTimezone:'UTC',scope:{mode:'all',totalEvents:parsed.events.length}};
}
test('overlapping exports correlate across files without counting the shared record twice',async()=>{
  const result=await collection.parseFiles(fixture.files());
  assert.equal(result.events.length,7);assert.equal(result.diagnostics.duplicateEvents,1);assert.equal(result.diagnostics.uniqueEvents,6);
  assert.equal(result.events[3].duplicateOf,'event-3');assert.equal(result.events[3].sourceId,'source-2');assert.equal(result.events[3].sourceRecord,1);
  assert.equal(result.events[0].eventRecordId,'101');assert.equal(result.events[0].channel,'Security');
  const findings=analysis.analyze(result.events);assert.equal(findings.length,1);assert.equal(findings[0].ruleId,'AUTH_SUCCESS_AFTER_FAILURES');
  assert.deepEqual(findings[0].events.map(event=>event.uid),['event-1','event-2','event-3','event-5','event-6','event-7']);
  for(const entry of fixture.files())assert.equal(analysis.analyze(inputs.parseInput(entry.text).events).length,0);
});
test('duplicate authentication records cannot manufacture a failure threshold',async()=>{
  const failures=[fixture.row(101),fixture.row(102),fixture.row(103)];
  const result=await collection.parseFiles([file('one.csv',failures),file('two.csv',[...failures,fixture.row(106,'4624')])]);
  assert.equal(result.diagnostics.duplicateEvents,3);assert.equal(analysis.analyze(result.events).length,0);assert.equal(result.events.length,7);
});
test('mixed CSV, XML, JSON, and JSONL retain per-file field layouts and original locations',async()=>{
  const fs=require('node:fs'),path=require('node:path');
  const files=['csv','xml','json','jsonl'].map(format=>({name:'source.'+format,text:fs.readFileSync(path.join(__dirname,'../samples',format==='csv'?'benign-process-review.csv':'authentication-sequence.'+format),'utf8')}));
  const parsed=await collection.parseFiles(files),restored=cases.reopenCase(cases.saveCase({...parsed,settings:analysis.DEFAULT_SETTINGS,case:{},findings:analysis.analyze(parsed.events),scope:{mode:'all',totalEvents:parsed.events.length}}));
  assert.equal(parsed.format,'mixed');assert.equal(restored.events.length,20);assert.equal(restored.source.files.length,4);
  assert.deepEqual(restored.events.map(event=>[event.uid,event.rawFields,event.sourceId,event.sourceRecord,event.sourceLine]),parsed.events.map(event=>[event.uid,event.rawFields,event.sourceId,event.sourceRecord,event.sourceLine]));
  assert.equal(restored.events.find(event=>event.inputFormat==='json').sourceLine,null);
});
for(const [label,overrides] of Object.entries({host:{Computer:'OTHER'},channel:{Channel:'System'},provider:{Source:'Other provider'},timestamp:{Timestamp:'2026-10-25T10:00:00Z'},eventId:{'Event ID':'4624'},payload:{Message:'Different original detail'},missingRecord:{EventRecordID:''},missingChannel:{Channel:''},missingProvider:{Source:''},missingTime:{Timestamp:''},dateOnly:{Timestamp:'2026-10-25'}})) {
  test('duplicate checks preserve records with different or missing '+label,async()=>{
    const original=fixture.row(101),changed=fixture.row(101,'4625',overrides);
    const result=await collection.parseFiles([file('one.csv',[original]),file('two.csv',[changed])]);assert.equal(result.diagnostics.duplicateEvents,0);assert.equal(result.events.length,2);
  });
}
test('matching ignores column order but preserves occurrence multiplicity within each file',async()=>{
  const original=fixture.row(101),first=fixture.csv([original,original]);
  const headers=[...fixture.headers].reverse(),line=values=>values.map(value=>'"'+value+'"').join(',');
  const second=[line(headers),line(headers.map(header=>original[header])),line(headers.map(header=>original[header]))].join('\n');
  const result=await collection.parseFiles([{name:'same.csv',text:first},{name:'same.csv',text:second}]);
  assert.equal(result.diagnostics.uniqueEvents,2);assert.deepEqual(result.events.map(event=>event.duplicateOf||null),[null,null,'event-1','event-2']);
  assert.notEqual(result.events[0].sourceId,result.events[2].sourceId);assert.deepEqual(result.events[0].rawFields.map(field=>field.header),fixture.headers);
});
test('records without a Windows record identity are retained even when whole files are identical',async()=>{
  const text='Event ID,Message\n4625,repeat\n4625,repeat',result=await collection.parseFiles([{name:'a.csv',text},{name:'b.csv',text}]);
  assert.equal(result.diagnostics.duplicateEvents,0);assert.equal(result.diagnostics.uncomparableEvents,4);
});
test('unsupported, oversized, or too many files are rejected before any file read',async()=>{
  let reads=0;const pending=name=>({name,file:{size:1,text:async()=>{reads++;return ''}}});
  for(const files of [[pending('bad.evtx')],Array.from({length:21},()=>pending('x.csv')),[{name:'huge.csv',file:{size:collection.MAX_BYTES+1,text:async()=>{reads++;return '';}}}]])await assert.rejects(collection.parseFiles(files));
  assert.equal(reads,0);assert.throws(()=>collection.validateFiles([]),/1 and 20/);
});
test('a bad later file fails the collection with its filename and does not return a partial result',async()=>{
  await assert.rejects(collection.parseFiles([fixture.files()[0],{name:'broken.json',text:'{bad'}]),/broken\.json: Invalid JSON/);
});
test('CSV files with different schemas keep their own field layouts when reopened',async()=>{
  const files=[fixture.files()[0],{name:'other.csv',text:'Message,Event ID\nFictional clear,1102'}],parsed=await collection.parseFiles(files);
  const reopened=cases.reopenCase(cases.saveCase({...parsed,settings:analysis.DEFAULT_SETTINGS,case:{},findings:analysis.analyze(parsed.events),scope:{mode:'all',totalEvents:parsed.events.length}}));
  assert.equal(reopened.events.at(-1).rawFields.length,2);assert.equal(reopened.events[0].rawFields.length,11);assert.equal(reopened.events.at(-1).id,'1102');
});
test('cancelling between source reads stops a fallback batch before its next file is read',async()=>{
  let active=true,readSecond=false;
  const files=[{name:'first.csv',file:{size:20,text:async()=>{active=false;return 'Event ID\n1102';}}},{name:'second.csv',file:{size:20,text:async()=>{readSecond=true;return 'Event ID\n1102';}}}];
  await assert.rejects(collection.parseFiles(files,()=>{},()=>active),{name:'AbortError'});assert.equal(readSecond,false);
});
test('combined record budget includes skipped IDs before any deduplication',async()=>{
  const text='Event ID,Message\n1102,valid\n'+'bad,skipped\n'.repeat(50000);
  await assert.rejects(collection.parseFiles([{name:'one.csv',text},{name:'two.csv',text}]),/100,000 source records/);
});
test('case reopen recomputes duplicate links, provenance names, and rule coverage',async()=>{
  const original=await savedInput(),saved=JSON.parse(cases.saveCase(original));
  saved.report.events[0].duplicateOf='event-7';delete saved.report.events[3].duplicateOf;saved.report.events[0].sourceName='<forged>';
  saved.report.ruleCoverage=[{ruleId:'FAKE',state:'assessed'}];
  const reopened=cases.reopenCase(JSON.stringify(saved));
  assert.equal(reopened.events[0].duplicateOf,undefined);assert.equal(reopened.events[3].duplicateOf,'event-3');assert.equal(reopened.events[0].sourceName,'first.csv');
  assert.equal(reopened.ruleCoverage.length,Object.keys(analysis.rules).length);assert.equal(reopened.findings[0].eventUids.length,6);
});
for(const [label,mutate] of [
  ['unknown source',saved=>saved.report.events[0].sourceId='source-99'],
  ['duplicate source',saved=>saved.report.source.files[1].id='source-1'],
  ['foreign format',saved=>saved.report.events[0].inputFormat='xml'],
  ['different layout within a file',saved=>saved.report.events[0].rawFields[0].header='Changed header'],
  ['duplicate source record',saved=>saved.report.events[1].sourceRecord=1],
  ['mismatched source sizes',saved=>saved.report.source.sizeBytes++],
  ['duplicated source diagnostics',saved=>saved.report.diagnostics.files[1]=saved.report.diagnostics.files[0]]
])test('multi-file saved cases reject '+label,async()=>{const saved=JSON.parse(cases.saveCase(await savedInput()));mutate(saved);assert.throws(()=>cases.reopenCase(JSON.stringify(saved)));});
test('source and duplicate filters preserve full exports and coverage uses the stated scope',async()=>{
  const input=await savedInput(),priorities=new Map();
  const duplicates=reports.selectEvents(input.events,priorities,{sourceId:'source-2',duplicates:'duplicates'});assert.equal(duplicates.length,1);
  const report=reports.createReport({...input,events:duplicates,findings:[],scope:{mode:'view'},ruleCoverage:analysis.ruleCoverage(input.events,input.findings)});
  assert.equal(report.ruleCoverageScope,'entire dataset');assert.equal(report.duplicates.duplicateEvents,1);assert.equal(report.events[0].sourceName,'second.csv');
  assert.ok(reports.eventsCsv(report).includes('Duplicate of'));assert.ok(reports.findingsCsv(reports.createReport(input)).includes('first.csv'));
});
