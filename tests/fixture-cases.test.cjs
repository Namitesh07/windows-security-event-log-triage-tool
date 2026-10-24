const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const input=require('../inputs'),analysis=require('../analysis'),manifest=require('../samples/manifest.json');
for(const example of manifest.cases)test('curated case: '+example.file,()=>{
  const result=input.parseInput(fs.readFileSync(path.join(__dirname,'../samples',example.file),'utf8'),example.format);
  const findings=analysis.analyze(result.events);
  assert.equal(result.events.length,example.events);
  assert.deepEqual([...new Set(findings.map(finding=>finding.ruleId))].sort(),[...example.expectedRules].sort());
  if(example.authenticationExcluded!==undefined)assert.equal(analysis.correlationCoverage(result.events).authenticationExcluded,example.authenticationExcluded);
});
