const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const input=require('../inputs.js'),analysis=require('../analysis.js');
const ns='http://schemas.microsoft.com/win/2004/08/events/event';
const event=(data='',system='')=>'<Event xmlns="'+ns+'"><System><EventID>4625</EventID><TimeCreated SystemTime="2026-10-22T10:00:00.1234567Z"/><Computer>DC-LAB</Computer>'+system+'</System><EventData>'+data+'</EventData></Event>';
const parse=xml=>input.parseInput(xml,'xml');
for(const format of ['xml','json','jsonl'])test(format+' imports the same authentication sequence with exact source evidence',()=>{
  const text=fs.readFileSync(path.join(__dirname,'../samples/authentication-sequence.'+format),'utf8');
  const result=input.parseInput(text,format),finding=analysis.analyze(result.events)[0];
  assert.equal(result.events.length,6);assert.equal(finding.ruleId,'AUTH_SUCCESS_AFTER_FAILURES');assert.equal(finding.score,60);
  assert.equal(result.events[0].account,'learner');assert.equal(result.events[0].accountDomain,'NORTHWIND');
  assert.equal(result.events[0].date.toISOString(),'2026-10-22T09:00:00.123Z');
  assert.equal(result.events[0].timeText,'2026-10-22T09:00:00.1234567Z');
  assert.deepEqual(finding.events.map(e=>e.uid),['event-1','event-2','event-3','event-4','event-5','event-6']);
  assert.ok(result.events[0].rawFields.some(field=>field.header=== (format==='xml'?'Original Event XML':'Original JSON record')));
});
test('XML prefixes, entities, CDATA, and multilingual values are decoded without running markup',()=>{
  const xml='<e:Event xmlns:e="'+ns+'"><e:System><e:EventID>4104</e:EventID><e:Computer>DC-LAB</e:Computer></e:System><e:EventData><e:Data Name="ScriptBlockText"><![CDATA[Write-Output "<img src=x>"; 日本語]]></e:Data><e:Data Name="SubjectUserName">Maya &amp; &#x1F642;</e:Data></e:EventData></e:Event>';
  const result=parse(xml).events[0];assert.equal(result.actor,'Maya & 🙂');assert.ok(result.scriptText.includes('<img src=x>'));
  assert.equal(result.rawFields.find(f=>f.header==='Original Event XML').value,xml);
});
test('compact XML preserves distinct record numbers even when all events share one source line',()=>{
  const result=parse('<Events>'+event()+event()+'</Events>').events;
  assert.deepEqual(result.map(e=>e.sourceRecord),[1,2]);assert.deepEqual(result.map(e=>e.sourceLine),[1,1]);
});
test('XML records retain physical CRLF line positions and source record order',()=>{
  const events=parse('<Events>\r\n'+event()+'\r\n'+event()+'\r\n</Events>').events;
  assert.deepEqual(events.map(e=>e.sourceLine),[2,3]);assert.deepEqual(events.map(e=>e.sourceRecord),[1,2]);
});
test('UserData leaf fields and rendering text are available as evidence',()=>{
  const xml='<Event xmlns="'+ns+'"><System><EventID>1102</EventID><Computer>DC-LAB</Computer></System><UserData><Log xmlns="urn:example"><SubjectUserName>demo-admin</SubjectUserName></Log></UserData><RenderingInfo><Message>Lab &lt;message&gt;</Message></RenderingInfo></Event>';
  const e=parse(xml).events[0];assert.equal(e.actor,'demo-admin');assert.equal(e.message,'Lab <message>');
});
for(const [name,xml] of [
  ['DTD','<!DOCTYPE Events [<!ENTITY x SYSTEM "file:///private">]><Events>'+event()+'</Events>'],
  ['unknown entity',event('<Data Name="TargetUserName">&xxe;</Data>')],
  ['unescaped ampersand',event('<Data Name="TargetUserName">a & b</Data>')],
  ['mismatched closing tags',event().replace('</System>','</Unexpected>')],
  ['duplicate event IDs',event('','<EventID>4624</EventID>')],
  ['duplicate data names',event('<Data Name="TargetUserName">a</Data><Data Name="target_user_name">b</Data>')],
  ['unrelated namespace',event().replace(ns,'urn:unrelated')],
  ['multiple roots',event()+event()],
  ['unclosed input',event().slice(0,-8)],
  ['invalid characters',event('<Data Name="Name">\u0000</Data>')],
  ['unsupported root','<Report>'+event()+'</Report>'],
  ['mixed root text','<Events>not event data'+event()+'</Events>'],
  ['duplicate attributes',event('<Data Name="a" Name="b">value</Data>')]
])test('XML rejects '+name,()=>assert.throws(()=>parse(xml),/XML|event export/));
test('XML nesting has a bounded depth',()=>assert.throws(()=>parse('<Events>'+event('<Data Name="deep">'+'<x>'.repeat(50)+'end'+'</x>'.repeat(50)+'</Data>')+'</Events>'),/48 levels/));
test('JSON supports a single object, an events envelope, native Get-WinEvent names, and .NET epoch dates',()=>{
  for(const wrapper of [value=>value,value=>({events:[value]})]){
    const e=input.parseInput(JSON.stringify(wrapper({Id:4625,TimeCreated:'/Date(0+0530)/',MachineName:'DC-LAB',ProviderName:'Microsoft-Windows-Security-Auditing',EventData:{TargetUserName:'demo'}})),'json').events[0];
    assert.equal(e.account,'demo');assert.equal(e.computer,'DC-LAB');assert.equal(e.timeText,'1970-01-01T00:00:00.000Z');assert.equal(e.sourceLine,null);
  }
});
test('JSON handles differently spelled field names across records and preserves skipped-record locations',()=>{
  const result=input.parseInput(JSON.stringify([{Id:'bad'},{Id:4624,EventData:{TargetUserName:'first'}},{EventID:4625,event_data:{target_user_name:'second'}}]),'json');
  assert.deepEqual(result.events.map(e=>e.account),['first','second']);assert.deepEqual(result.events.map(e=>e.sourceRecord),[2,3]);
  assert.deepEqual(result.diagnostics.invalidEventIdRows,[1]);
});
test('JSON Lines keeps physical blank-line offsets and reports a malformed line',()=>{
  assert.equal(input.parseInput('\n{"Id":4624}\n\n{"Id":4625}','jsonl').events[1].sourceLine,4);
  assert.throws(()=>input.parseInput('{"Id":4624}\nnot json','jsonl'),/line 2/);
});
for(const bad of ['[1]','null','[]','{"Id":4624,"EventID":4625}','{"schemaVersion":"1.1","tool":{},"events":[]}'])test('JSON rejects unsupported/ambiguous shape '+bad,()=>assert.throws(()=>input.parseInput(bad,'json')));
test('JSON event data cannot override trusted event metadata',()=>assert.throws(()=>input.parseInput('{"Id":4624,"EventData":{"Event ID":1102}}','json'),/Ambiguous/));
test('XML timestamps preserve seven fractional digits while comparing at millisecond precision',()=>{
  assert.equal(analysis.parseTimestamp('2026-10-22 10:00:00.7654321').date.getMilliseconds(),765);
  assert.equal(analysis.parseTimestamp('2026-02-30T10:00:00.1234567Z').date,null);
});
test('text decoding accepts UTF-8 and BOM-marked UTF-16 and rejects binary EVTX or invalid UTF-8',async()=>{
  const text=event();assert.equal(await input.readFileText(new Blob([text])),text);
  const le=Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]);assert.equal(await input.readFileText(new Blob([le])),text);
  const be=Buffer.from(le);be.swap16();assert.equal(await input.readFileText(new Blob([be])),text);
  await assert.rejects(input.readFileText(new Blob([Buffer.from('ElfFile\0')])),/binary EVTX/);
  await assert.rejects(input.readFileText(new Blob([new Uint8Array([0xc3,0x28])])),/decode/);
});
test('accepted extensions are explicit and binary EVTX has a conversion instruction',()=>{
  assert.equal(input.formatForName('demo.NDJSON'),'jsonl');assert.equal(input.formatForName('demo.XML'),'xml');
  assert.throws(()=>input.formatForName('raw.evtx'),/Export-TriageEvents/);assert.throws(()=>input.formatForName('log.txt'),/Choose an event file/);
});
for(const text of ['{"Id":4624,"Id":1102}','{"Id":4624,"\\u0049d":1102}','{"Id":4624,"RecordId":9007199254740993}','{"Id":4624,"Value":1e309}'])test('JSON rejects lossy or duplicate input: '+text,()=>assert.throws(()=>input.parseInput(text,'json'),/Duplicate JSON|represented safely/));
test('large JSON identifiers encoded as strings retain their exact characters',()=>{
  const event=input.parseInput('{"Id":4624,"RecordId":"9007199254740993"}','json').events[0];
  assert.equal(event.rawFields.find(f=>f.header==='RecordId').value,'9007199254740993');
});
