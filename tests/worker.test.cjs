const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker } = require('node:worker_threads');
const project = path.resolve(__dirname,'..');
// Exercise the actual browser worker script in a separate thread with structured cloning.
const bootstrap = `
  const {parentPort,workerData}=require('node:worker_threads');
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const scope={TextDecoder,TextEncoder,postMessage:message=>parentPort.postMessage(message)};scope.self=scope;
  const context=vm.createContext(scope);
  scope.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(workerData.project,file.split('?')[0]),'utf8'),context));
  scope.importScripts('worker.js');
  parentPort.on('message',data=>scope.onmessage({data}));
`;
class BrowserWorker {
  constructor() {
    this.worker=new Worker(bootstrap,{eval:true,workerData:{project}});
    this.worker.on('message',data=>this.onmessage?.({data}));
    this.worker.on('error',error=>this.onerror?.({error,preventDefault(){}}));
  }
  postMessage(value){this.worker.postMessage(value);}
  terminate(){this.worker.terminate();}
}
function runner(worker=true) {
  const window={location:{protocol:'https:'},Worker:worker ? BrowserWorker : undefined,
    EventTriageAnalysis:require('../analysis.js'),EventTriageInputs:require('../inputs.js'),EventTriageCollection:require('../collection.js'),EventTriageReports:require('../report.js'),EventTriageCases:require('../case-file.js')};
  vm.runInNewContext(fs.readFileSync(path.join(project,'task-runner.js'),'utf8'),{window,setTimeout});
  return new window.EventTriageTasks.TaskRunner();
}
test('actual worker reads a File-compatible Blob, preserves dates, and analyzes using exact evidence IDs',async()=>{
  const task=runner(), progress=[];
  const text=fs.readFileSync(path.join(project,'samples/correlation-policy-lab.csv'),'utf8');
  const parsed=await task.run('parse',{file:new Blob([text]),bytes:Buffer.byteLength(text)},message=>progress.push(message));
  assert.equal(parsed.events.length,14);assert.ok(parsed.events[0].date instanceof Date);assert.ok(parsed.events[0]._searchText);
  assert.ok(progress.includes('Extracting event fields…'));
  const findings=await task.run('analyze',{events:parsed.events,settings:{},bytes:text.length});
  assert.deepEqual(findings.find(f=>f.ruleId==='AUTH_PASSWORD_SPRAY').eventUids,['event-1','event-2','event-3','event-4','event-5']);
});
test('large-file worker leaves the caller responsive, and cancellation stops an in-flight operation',async()=>{
  const task=runner();let ticks=0;
  const text='Event ID,Message\n'+Array.from({length:2500},()=> '9999,'+'a'.repeat(2000)).join('\n');
  const heartbeat=setInterval(()=>{ticks+=1;},1);
  try {
    const result=await task.run('parse',{file:new Blob([text]),bytes:Buffer.byteLength(text)});
    assert.equal(result.events.length,2500);assert.ok(ticks>1);
    const pending=task.run('parse',{file:new Blob([text]),bytes:Buffer.byteLength(text)},()=>task.cancel());
    await assert.rejects(pending,{name:'AbortError'});
  } finally {clearInterval(heartbeat);task.cancel();}
});
test('worker JSON and CSV exports retain source text, provenance, and safe spreadsheet cells',async()=>{
  const task=runner();const r=require('../report.js');
  const parsed=await task.run('parse',{text:'Event ID,Message\n1102,"=literal, \"\"quoted\"\""',bytes:60});
  const a=require('../analysis.js');const input={...parsed,findings:a.analyze(parsed.events),source:{name:'test.csv'},scope:{mode:'all'},settings:{},case:{notes:'=formula'}};
  const json=JSON.parse(await task.run('export',{input,format:'json',bytes:60}));
  assert.equal(json.events[0].message,'=literal, "quoted"');assert.equal(json.case.notes,'=formula');
  const csv=await task.run('export',{input,format:'events',bytes:60});
  assert.ok(csv.includes('"\'=literal, ""quoted"""'));assert.ok(csv.includes(r.RULES_VERSION));
});
test('small-file fallback works without Worker and refuses files above its 2 MB boundary',async()=>{
  const task=runner(false);
  const result=await task.run('parse',{text:'Event ID,Message\n4624,hello',bytes:30});
  assert.equal(result.events.length,1);
  await assert.rejects(task.run('parse',{text:'irrelevant',bytes:2*1024*1024+1}),/Background processing is unavailable/);
});
test('cancelled fallback reads cannot replace a later result',async()=>{
  const task=runner(false);let resolve;
  const old=task.run('parse',{file:{size:30,text:()=>new Promise(done=>{resolve=done;})}});
  const rejected=assert.rejects(old,{name:'AbortError'});
  const fresh=await task.run('parse',{text:'Event ID,Message\n1102,fresh',bytes:30});
  resolve('Event ID,Message\n4624,old');await rejected;
  assert.equal(fresh.events[0].id,'1102');
});
for(const format of ['xml','json','jsonl'])test('real worker parses '+format+' and applies the selected rule profile',async()=>{
  const task=runner(),text=fs.readFileSync(path.join(project,'samples/authentication-sequence.'+format),'utf8');
  const parsed=await task.run('parse',{file:new Blob([text]),bytes:Buffer.byteLength(text),format});
  const ruleProfile=require('../samples/profiles/lab-tuning.json');
  const findings=await task.run('analyze',{events:parsed.events,ruleProfile,settings:{},bytes:text.length});
  assert.equal(findings[0].score,40);assert.equal(findings[0].events,undefined);assert.equal(findings[0].eventUids.length,6);
});

for(const worker of [true,false])test((worker?'worker':'fallback')+' saves and reopens a complete case with validated evidence',async()=>{
  const task=runner(worker),a=require('../analysis'),p=require('../rule-profiles');
  const text=fs.readFileSync(path.join(project,'samples/authentication-sequence.xml'),'utf8');
  const parsed=await task.run('parse',{text,format:'xml',bytes:text.length});
  const findings=a.analyze(parsed.events);
  const input={events:parsed.events,findings,source:{name:'lab.xml',sizeBytes:text.length,format:'xml'},case:{title:'Reopen me',notes:'Retain notes'},settings:a.DEFAULT_SETTINGS,
    annotations:{},ruleProfile:p.defaultProfile,diagnostics:parsed.diagnostics,browserTimezone:'UTC',scope:{mode:'all',totalEvents:parsed.events.length}};
  const saved=await task.run('save-case',{input,bytes:text.length});
  const restored=await task.run('reopen-case',{file:new Blob([saved]),bytes:Buffer.byteLength(saved),browserTimezone:'UTC'});
  assert.equal(restored.case.notes,'Retain notes');assert.equal(restored.events.length,6);assert.ok(restored.events[0].date instanceof Date);
  assert.equal(restored.findings[0].score,60);assert.equal(restored.findings[0].eventUids.length,6);
});
for(const worker of [true,false])test((worker?'worker':'fallback')+' imports collections and returns rule coverage with duplicate-safe findings',async()=>{
  const task=runner(worker),files=require('./collection-fixtures.cjs').files();
  const parsed=await task.run('parse-files',{files});assert.equal(parsed.events.length,7);assert.equal(parsed.events[3].duplicateOf,'event-3');
  assert.ok(parsed.events[0]._searchText.includes('first.csv'));
  const assessed=await task.run('analyze',{events:parsed.events,includeCoverage:true,settings:{}});
  assert.equal(assessed.findings[0].eventUids.length,6);assert.equal(assessed.ruleCoverage.find(item=>item.ruleId==='AUTH_SUCCESS_AFTER_FAILURES').findingCount,1);
});
test('fallback collection checks use actual combined file sizes even without a caller byte hint',async()=>{
  const task=runner(false);await assert.rejects(task.run('parse-files',{files:[{name:'large.csv',bytes:2*1024*1024+1,text:'Event ID\n1102'}]}),/Background processing is unavailable/);
});
