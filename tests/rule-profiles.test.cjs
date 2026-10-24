const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const p=require('../rule-profiles'),a=require('../analysis'),input=require('../inputs'),r=require('../report');
const events=()=>input.parseInput(fs.readFileSync(path.join(__dirname,'../samples/authentication-sequence.json'),'utf8'),'json').events;
const profile=rules=>({schemaVersion:'1.0',id:'test-profile',version:'1.0.0',rules});
test('default catalog retains all built-in rules, points, and deeply immutable definitions',()=>{
  assert.equal(Object.keys(a.rules).length,23);assert.equal(a.analyze(events())[0].score,60);
  assert.ok(Object.isFrozen(p.catalog.rules[0]));assert.ok(Object.isFrozen(p.effectiveRules().AUTH_FAILURE_BURST.breakdown[0]));
});
test('profile scores control contributions and severity without altering evidence or built-in defaults',()=>{
  const tuned=a.analyze(events(),{},profile({AUTH_SUCCESS_AFTER_FAILURES:{points:[20,20]}}))[0];
  assert.equal(tuned.score,40);assert.equal(tuned.severity,'Medium');assert.equal(tuned.events.length,6);
  assert.deepEqual(tuned.scoreBreakdown.map(part=>part.points),[20,20]);assert.equal(a.analyze(events())[0].score,60);
});
test('disabled success correlation does not hide an enabled failure-burst finding',()=>{
  const findings=a.analyze(events(),{},profile({AUTH_SUCCESS_AFTER_FAILURES:{enabled:false}}));
  assert.deepEqual(findings.map(f=>f.ruleId),['AUTH_FAILURE_BURST']);assert.equal(findings[0].events.length,5);
});
test('disabled account sequence allows standalone account and group cues',()=>{
  const rows=a.normalizeEvents(a.parseCsv(fs.readFileSync(path.join(__dirname,'../samples/account-persistence.csv'),'utf8'))).events;
  const findings=a.analyze(rows,{},profile({ACCOUNT_CREATED_PRIVILEGED_GROUP:{enabled:false}}));
  assert.deepEqual(new Set(findings.map(f=>f.ruleId)),new Set(['ACCOUNT_CREATED','PRIVILEGED_GROUP_ADDED']));
});
for(const [label,value] of [
  ['schema',{...profile({}),schemaVersion:'99'}],['unknown rule',profile({NOT_A_RULE:{enabled:false}})],
  ['string enabled',profile({AUDIT_LOG_CLEARED:{enabled:'false'}})],['wrong point count',profile({AUTH_SUCCESS_AFTER_FAILURES:{points:[10]}})],
  ['negative points',profile({AUDIT_LOG_CLEARED:{points:[-1]}})],['fraction points',profile({AUDIT_LOG_CLEARED:{points:[1.5]}})],
  ['excess points',profile({AUDIT_LOG_CLEARED:{points:[101]}})],['code field',profile({AUDIT_LOG_CLEARED:{condition:'eval(anything)'}})],
  ['prototype key',JSON.parse('{"schemaVersion":"1.0","id":"x","version":"1","rules":{"__proto__":{}}}')]
])test('profile validation rejects '+label,()=>assert.throws(()=>p.normalizeProfile(value)));
test('exports include the exact profile and resolved rule points, including disabled rules',()=>{
  const chosen=profile({AUTH_SUCCESS_AFTER_FAILURES:{points:[20,20]},TASK_DELETED:{enabled:false}}),ev=events();
  const report=r.createReport({events:ev,findings:a.analyze(ev,{},chosen),ruleProfile:chosen,source:{name:'lab.json',format:'json'},scope:{mode:'all'}});
  assert.equal(report.schemaVersion,'1.1');assert.equal(report.ruleProfile.id,'test-profile');
  assert.equal(report.ruleCatalog.find(rule=>rule.id==='AUTH_SUCCESS_AFTER_FAILURES').points,40);
  assert.equal(report.ruleCatalog.find(rule=>rule.id==='TASK_DELETED').enabled,false);
  assert.ok(r.findingsCsv(report).includes('Rule profile (JSON)'));assert.ok(r.eventsCsv(report).includes('Source record'));
  const csv=a.parseCsv(r.findingsCsv(report)),locations=JSON.parse(csv[1][csv[0].indexOf('Source locations (JSON)')]);
  assert.ok(locations.every(location=>location.format==='json'&&location.line===null));
});
