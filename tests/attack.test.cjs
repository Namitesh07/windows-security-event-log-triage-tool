const test=require('node:test'),assert=require('node:assert/strict');
const inputs=require('../inputs'),analysis=require('../analysis'),profiles=require('../rule-profiles'),reports=require('../report'),cases=require('../case-file');
const events=text=>inputs.parseInput(text).events;
test('all rules carry reviewed learning context and official canonical links',()=>{
  for(const definition of profiles.catalog.rules){const attack=profiles.attackReferences(definition.id);assert.equal(attack.reviewedAt,'2026-10-28');assert.ok(attack.note);
    for(const reference of attack.techniques){assert.match(reference.url,/^https:\/\/attack\.mitre\.org\/techniques\/T\d{4}(?:\/\d{3})?\/$/);assert.ok(reference.name);}
  }
  assert.equal(profiles.attackReferences('AUDIT_LOG_CLEARED').techniques[0].id,'T1685.005');
  assert.equal(profiles.attackReferences('AUDIT_POLICY_CHANGED').techniques[0].id,'T1685.001');
  assert.equal(profiles.attackReferences('FIREWALL_RULE_CHANGED').techniques[0].id,'T1686.003');
});
test('remote script-host references select the observed executable instead of assigning both techniques',()=>{
  for(const [process,expected] of [['mshta.exe','T1218.005'],['regsvr32.exe','T1218.010']]){
    const command=process==='mshta.exe'?'mshta.exe https://example.invalid/a':'regsvr32.exe /i:https://example.invalid/a';
    const findings=analysis.analyze(events('Event ID,NewProcessName,CommandLine\n4688,C:\\Windows\\System32\\'+process+','+command));
    const finding=findings.find(item=>item.ruleId==='SCRIPT_HOST_REMOTE');assert.deepEqual(finding.attack.techniques.map(item=>item.id),[expected]);assert.equal(finding.score,60);
  }
  assert.equal(profiles.attackReferences('SCRIPT_HOST_REMOTE').techniques.length,2);
});
test('context-only event cues do not receive speculative attack classifications',()=>{
  for(const id of ['ACCOUNT_LOCKED','ACCOUNT_DELETED','EXPLICIT_CREDENTIALS','TASK_DELETED'])assert.equal(profiles.attackReferences(id).techniques.length,0);
  assert.equal(profiles.attackReferences('not-a-rule').techniques.length,0);
});
test('ATT&CK references add context without changing enabled state or point tuning',()=>{
  const original=events('Event ID,Message\n1102,Fictional log clear'),profile={schemaVersion:'1.0',id:'tuned',version:'1',rules:{AUDIT_LOG_CLEARED:{points:[12]}}};
  const finding=analysis.analyze(original,{},profile)[0];assert.equal(finding.score,12);assert.equal(finding.attack.techniques[0].id,'T1685.005');
  assert.equal(analysis.analyze(original,{}, {...profile,rules:{AUDIT_LOG_CLEARED:{enabled:false}}}).length,0);
});
test('JSON and findings CSV include current references and overwrite supplied finding metadata',()=>{
  const original=events('Event ID,Message\n1102,Fictional log clear'),findings=analysis.analyze(original);findings[0].attack={techniques:[{url:'javascript:alert(1)'}]};
  const report=reports.createReport({events:original,findings,source:{name:'lab.csv'},scope:{mode:'all'}});
  assert.equal(report.findings[0].attack.techniques[0].id,'T1685.005');assert.ok(reports.findingsCsv(report).includes('T1685.005'));assert.ok(!JSON.stringify(report).includes('javascript:'));
  assert.equal(report.ruleCatalog.length,23);assert.ok(report.ruleCatalog.every(rule=>rule.attack.note));
});
test('case reopen recalculates ATT&CK context instead of accepting saved mappings',()=>{
  const original=events('Event ID,Message\n1102,Fictional log clear'),input={events:original,findings:analysis.analyze(original),settings:analysis.DEFAULT_SETTINGS,source:{name:'lab.csv',format:'csv'},case:{},scope:{mode:'all',totalEvents:1}};
  const saved=JSON.parse(cases.saveCase(input));saved.report.findings[0].attack={techniques:[{id:'T9999',url:'javascript:alert(1)'}]};
  assert.equal(cases.reopenCase(JSON.stringify(saved)).findings[0].attack.techniques[0].id,'T1685.005');
});
