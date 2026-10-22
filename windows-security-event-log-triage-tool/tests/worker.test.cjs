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
  const scope={TextDecoder,postMessage:message=>parentPort.postMessage(message)};scope.self=scope;
  const context=vm.createContext(scope);
  scope.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(workerData.project,file),'utf8'),context));
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
    EventTriageAnalysis:require('../analysis.js'),EventTriageInputs:require('../inputs.js'),EventTriageReports:require('../report.js')};
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
