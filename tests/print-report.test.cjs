const test=require('node:test'),assert=require('node:assert/strict');
const print=require('../print-report'),reports=require('../report'),inputs=require('../inputs'),analysis=require('../analysis');
function report(count=1){const parsed=inputs.parseInput('Event ID,Timestamp,Message\n'+Array.from({length:count},(_,i)=>'1102,2026-10-28T09:00:00Z,Fictional record '+i).join('\n'));
  return reports.createReport({...parsed,findings:analysis.analyze(parsed.events),source:{name:'lab.csv'},case:{title:'Investigation review',notes:'Retain this note'},settings:analysis.DEFAULT_SETTINGS,browserTimezone:'UTC',scope:{mode:'all',totalEvents:parsed.events.length}});
}
test('printable HTML contains case context, findings, notes, evidence, coverage, and learning references',()=>{
  const document=report(),html=print.renderReport(document);
  for(const value of ['<!doctype html>','Investigation review','Retain this note','AUDIT_LOG_CLEARED','Case and analysis context','Source provenance','Rule coverage','Supporting activity timeline','Event reference appendix','T1685.005','@media print','@page'])assert.ok(html.includes(value),value);
  assert.ok(!/<script\b|<link\b|<img\b|<iframe\b/i.test(html));assert.ok(html.includes('default-src &#39;none&#39;'));
});
test('all current findings and events are included beyond UI pages',()=>{
  const html=print.renderReport(report(125));assert.equal((html.match(/<article class="finding">/g)||[]).length,125);assert.ok(html.includes('event-125'));assert.ok(!html.includes('Print limits applied.'));
});
test('print bounds are explicit rather than silently claiming complete evidence',()=>{
  const data=report(1),event=data.events[0],finding=data.findings[0];
  data.events=Array.from({length:print.LIMITS.events+1},(_,index)=>({...event,index:index+1,uid:'event-'+(index+1)}));
  data.findings=Array.from({length:print.LIMITS.findings+1},()=>finding);
  const html=print.renderReport(data);assert.ok(html.includes('Print limits applied.'));assert.ok(html.includes('500 of 501'));assert.ok(html.includes('2000 of 2001'));assert.equal((html.match(/<article class="finding">/g)||[]).length,500);
});
test('malicious log, note, title, filename, and URL-like values render as inert text',()=>{
  const data=report(),payload='</style><script>alert(1)</script><img src="https://example.invalid/leak">';
  data.case.title=payload;data.case.notes=payload;data.source.name=payload;data.events[0].message=payload;data.findings[0].review.note=payload;
  data.findings[0].attack={techniques:[{id:'FAKE',url:'javascript:alert(1)'}]};
  const html=print.renderReport(data);assert.ok(!/<script\b|<img\b|javascript:/i.test(html));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('T1685.005'));
});
test('hashes distinguish computed bytes from metadata recorded in a case',()=>{
  const data=report();data.source.files=[{id:'source-1',name:'lab.csv',format:'csv',sizeBytes:12,fingerprint:{hex:'a'.repeat(64),verification:'recorded-in-case'}}];
  const html=print.renderReport(data);assert.ok(html.includes('a'.repeat(64)));assert.ok(html.includes('Recorded in case; original bytes not reverified'));
});
test('scoped reports identify filters, coverage scope, and zero complete findings',()=>{
  const data=report();data.scope.mode='view';data.scope.filters={id:'4624'};data.findings=[];data.ruleCoverageScope='entire dataset';
  const html=print.renderReport(data);assert.ok(html.includes('Current evidence and filters'));assert.ok(html.includes('4624'));assert.ok(html.includes('entire dataset'));assert.ok(html.includes('No complete configured finding'));
});
test('full case and finding notes are retained while very long context fields are visibly shortened',()=>{
  const data=report();data.case.notes='C'.repeat(10000);data.findings[0].review.note='N'.repeat(4000);data.events[0].message='M'.repeat(5000);
  const html=print.renderReport(data);assert.ok(html.includes(data.case.notes));assert.ok(html.includes(data.findings[0].review.note));assert.ok(html.includes('[shortened; full value is in JSON]'));assert.ok(!html.includes('M'.repeat(5000)));
});
test('notes from inactive findings are clearly labelled and retained',()=>{
  const data=report();data.annotations=[{findingId:'older-finding',status:'Investigating',note:'Still important',presentInExport:false}];
  const html=print.renderReport(data);assert.ok(html.includes('Retained notes outside current findings'));assert.ok(html.includes('Still important'));
});
