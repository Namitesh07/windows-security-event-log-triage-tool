const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const a = require('../analysis.js');
const r = require('../report.js');
function fixture() {
  const result = a.normalizeEvents(a.parseCsv(fs.readFileSync(path.join(__dirname,'../samples/password-guessing.csv'),'utf8')));
  const findings = a.analyze(result.events);
  return { ...result, findings, source:{name:'example.csv'}, settings:a.DEFAULT_SETTINGS, priorities:[], case:{title:'Case α',notes:'line 1\nline 2'},
    scope:{mode:'all'}, annotations:{}, analyzedAt:'2026-10-19T08:00:00.000Z', generatedAt:'2026-10-19T08:01:00.000Z' };
}
test('event views combine exact evidence scope, filters, and stable sorting without changing the dataset', () => {
  const input = fixture(), events = input.events, original = events.map(event=>event.uid);
  const selected = r.selectEvents(events,new Map(),{id:'4625',sort:'time-desc'},new Set(['event-1','event-2','event-7']));
  assert.deepEqual(selected.map(event=>event.uid),['event-2','event-1']);
  assert.deepEqual(events.map(event=>event.uid),original);
  assert.equal(r.selectEvents(events,new Map(),{search:'198.51.100.42',ip:'198.51.100.42'}).length,7);
  assert.equal(r.selectEvents(events,new Map(),{ip:'198.51.100.4'}).length,0);
});
test('both time sorts leave unparsed timestamps last and equal times keep CSV order', () => {
  const {events}=a.normalizeEvents(a.parseCsv('Event ID,Timestamp\n9999,unknown\n9999,2026-10-19T10:00:00Z\n9999,2026-10-19T10:00:00Z\n9999,2026-10-19T11:00:00Z'));
  assert.deepEqual(r.selectEvents(events,new Map(),{sort:'time-desc'}).map(e=>e.uid),['event-4','event-2','event-3','event-1']);
  assert.deepEqual(r.selectEvents(events,new Map(),{sort:'time-asc'}).map(e=>e.uid),['event-2','event-3','event-4','event-1']);
});
test('priority and identity sorting use review priority rather than Windows level', () => {
  const {events}=a.normalizeEvents(a.parseCsv('Event ID,Level,TargetUserName,IpAddress\n9999,Critical,zeta,192.0.2.10\n9999,Information,alpha,192.0.2.2'));
  assert.equal(r.selectEvents(events,new Map([['event-2','High']]),{sort:'priority'})[0].uid,'event-2');
  assert.equal(r.selectEvents(events,new Map(),{sort:'account'})[0].uid,'event-2');
  assert.equal(r.selectEvents(events,new Map(),{sort:'source'})[0].uid,'event-2');
});
test('JSON report preserves raw evidence and carries effective settings, rule versions, context, and annotation history', () => {
  const input=fixture(), finding=input.findings[0];
  input.annotations[finding.id]={status:'Investigating',note:'Verify "owner"\nnext step',ruleId:finding.ruleId,eventUids:finding.events.map(e=>e.uid)};
  input.annotations['inactive-finding']={status:'Escalate',note:'Retained after settings change'};
  input.events[0]._searchText='private cache';
  const report=JSON.parse(JSON.stringify(r.createReport(input)));
  assert.equal(report.tool.version,'1.3.0');assert.ok(report.tool.rulesVersion);
  assert.equal(report.settings.failureThreshold,5);assert.ok(report.ruleCatalog.some(rule=>rule.id===finding.ruleId));
  assert.deepEqual(report.events[0].rawFields,input.events[0].rawFields);
  assert.equal('_searchText' in report.events[0],false);
  assert.equal(report.findings[0].review.status,'Investigating');
  assert.equal(report.case.notes,'line 1\nline 2');assert.equal(report.annotations[1].presentInExport,false);
  assert.deepEqual(report.findings[0].eventUids,finding.events.map(e=>e.uid));
  assert.ok(report.events[0].date.endsWith('Z'));
});
for (const dangerous of ['=1+1','+SUM(A1)','-2+3','@SUM(A1)',' \t=cmd','\tplain','\rplain','\nplain']) {
  test('CSV guards formula/control prefix: '+JSON.stringify(dangerous),()=>{
    assert.equal(r.csvCell(dangerous), '"\''+dangerous.replaceAll('"','""')+'"');
  });
}
test('CSV quotes multiline values and double quotes, carries provenance, and JSON keeps formula-like values unchanged', () => {
  const input=fixture();input.case.notes='=HYPERLINK("example.invalid")\nα,β';
  const report=r.createReport(input), csv=r.findingsCsv(report), eventsCsv=r.eventsCsv(report);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=HYPERLINK(""example.invalid"")\nα,β"'));
  assert.ok(csv.includes('Effective settings'));assert.ok(csv.includes(report.tool.rulesVersion));
  assert.ok(eventsCsv.includes('Original CSV fields (JSON)'));assert.ok(eventsCsv.includes('CSV row'));
  assert.equal(report.case.notes,input.case.notes);
});
test('empty finding sets export headers without inventing findings or changing event data', () => {
  const input=fixture();input.findings=[];
  const report=r.createReport(input);
  assert.equal(r.findingsCsv(report).split('\r\n').length,2);
  assert.equal(report.events.length,7);
});
test('case fields and review states are bounded; filenames cannot add path components', () => {
  assert.equal(r.normalizeCase({notes:'a'.repeat(11000)}).notes.length,10000);
  assert.equal(r.normalizeAnnotation({status:'Attacker confirmed',note:'a'.repeat(5000)}).status,'Unreviewed');
  assert.equal(r.normalizeAnnotation({note:'a'.repeat(5000)}).note.length,4000);
  assert.equal(r.filename('../../<>evil:case','report','json'),'evil-case-report.json');
});
test('newest finding order uses its last dated supporting event and oldest uses its first',()=>{
  const {events}=a.normalizeEvents(a.parseCsv('Event ID,Timestamp\n9999,2026-10-19T09:00:00Z\n9999,2026-10-19T09:30:00Z\n9999,2026-10-19T09:10:00Z\n9999,unknown'));
  const findings=[{id:'sequence',events:events.slice(0,2)},{id:'middle',events:[events[2]]},{id:'unparsed',events:[events[3]]}];
  assert.deepEqual(r.sortFindings(findings,'newest').map(f=>f.id),['sequence','middle','unparsed']);
  assert.deepEqual(r.sortFindings(findings,'oldest').map(f=>f.id),['sequence','middle','unparsed']);
});
test('scoped exports omit annotations for findings outside that scope while preserving case context',()=>{
  const input=fixture(),id=input.findings[0].id;
  input.annotations={[id]:{note:'included'},unrelated:{note:'outside this scope'}};
  input.scope={mode:'view'};
  const report=r.createReport(input);
  assert.deepEqual(report.annotations.map(note=>note.findingId),[id]);
  assert.equal(report.case.title,'Case α');
});
