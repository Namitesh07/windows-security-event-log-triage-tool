const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');

function app() {
  const markup=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const elements=new Map(), buttons=[];
  const downloads=[], urls=new Map(), windowEvents={};
  const document={activeElement:null,body:{appendChild(){}}};
  class Element {
    constructor(id='') { this.id=id; this.value='';this.hidden=false;this.disabled=false;this.listeners={};this.dataset={};this.attributes={};this.files=[];this._html='';this.textContent='';this.classList={toggle(){},add(){},remove(){}}; }
    set innerHTML(value) {
      this._html=String(value);
      for (const match of this._html.matchAll(/\bid="([^"]+)"/g)) if (!elements.has(match[1])) elements.set(match[1],new Element(match[1]));
    }
    get innerHTML(){return this._html;}
    setAttribute(name,value){this.attributes[name]=value;}
    click(){if(this.href)downloads.push({name:this.download,blob:urls.get(this.href)});}
    remove(){}
    addEventListener(type,callback){(this.listeners[type] ||= []).push(callback);}
    async trigger(type,event={}){for(const callback of this.listeners[type]||[]) await callback({target:this,...event});}
    dispatchEvent(event){return this.trigger(event.type);}
    focus(){document.activeElement=this;}
    scrollIntoView(){this.scrolled=true;}
  }
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1],new Element(match[1]));
  for (const match of markup.matchAll(/<input[^>]*\bid="([^"]+)"[^>]*\bvalue="([^"]*)"/g)) elements.get(match[1]).value=match[2];
  for (const match of markup.matchAll(/data-sample="([^"]+)"/g)){const button=new Element();button.dataset.sample=match[1];buttons.push(button);}
  const demo=new Element();
  document.getElementById=id=>elements.get(id)||null;
  document.querySelectorAll=selector=>selector==='[data-sample]'?buttons:[];
  document.querySelector=selector=>selector==='.demo-details'?demo:null;
  document.createElement=()=>new Element();
  const fakeWindow={crypto:require('node:crypto').webcrypto,confirm:()=>true,addEventListener:(type,handler)=>{windowEvents[type]=handler;}};
  const testTimeout=(callback,delay)=>{const timer=setTimeout(callback,delay);if(delay>1000)timer.unref();return timer;};
  const context=vm.createContext({window:fakeWindow,document,console,Blob,TextDecoder,TextEncoder,setTimeout:testTimeout,clearTimeout,
    URL:{createObjectURL:blob=>{const url='blob:'+urls.size;urls.set(url,blob);return url;},revokeObjectURL:url=>urls.delete(url)},
    Event:class{constructor(type){this.type=type;}}});
  for(const file of ['rules.generated.js','rule-profiles.js','analysis.js','inputs.js','collection.js','report.js','case-file.js','print-report.js','task-runner.js','script.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  return {
    el:id=>elements.get(id), document, downloads, window:fakeWindow, windowEvents,
    load:async (text,name='case.csv')=>{elements.get('csv-file').files=[{name,size:Buffer.byteLength(text),text:async()=>text}];await elements.get('csv-file').trigger('change');await elements.get('analyze-button').trigger('click');},
    inspect:async uid=>{const body=new Element(),details={dataset:{inspect:uid},open:true,querySelector:()=>body};await elements.get('event-rows').trigger('toggle',{target:details});return body.innerHTML;},
    sample:async key=>{await buttons.find(button=>button.dataset.sample===key).trigger('click');await elements.get('analyze-button').trigger('click');},
    evidence:async id=>elements.get('findings').trigger('click',{target:{closest:()=>({dataset:{evidence:id}})}})
  };
}

test('saved cases restore notes, tuned rules, settings, and all evidence even when the view is filtered',async()=>{
  const ui=app();await ui.load(fs.readFileSync(path.join(root,'samples/authentication-sequence.json'),'utf8'),'auth.json');
  ui.el('case-title').value='Follow-up';await ui.el('case-title').trigger('input');
  ui.el('case-notes').value='Review with owner.';await ui.el('case-notes').trigger('input');
  const id=ui.el('findings').innerHTML.match(/data-evidence="([^"]+)"/)[1];
  await ui.el('findings').trigger('input',{target:{dataset:{reviewNote:id},value:'Validate source.',closest:()=>null}});
  ui.el('auth-window').value='11';await ui.el('auth-window').trigger('change');
  const profile=JSON.stringify({schemaVersion:'1.0',id:'review-profile',version:'1',rules:{AUTH_SUCCESS_AFTER_FAILURES:{points:[20,20]}}});
  ui.el('rule-profile-file').files=[{name:'profile.json',size:profile.length,text:async()=>profile}];await ui.el('rule-profile-file').trigger('change');
  ui.el('event-search').value='no matching event';ui.el('export-scope').value='view';
  await ui.el('save-case').trigger('click');
  const download=ui.downloads.at(-1),saved=await download.blob.text(),data=JSON.parse(saved);
  assert.match(download.name,/-case\.json$/);assert.equal(data.report.scope.mode,'all');assert.equal(data.report.events.length,6);
  const reopened=app();reopened.el('reopen-case-file').files=[{name:download.name,size:Buffer.byteLength(saved),text:async()=>saved}];
  await reopened.el('reopen-case-file').trigger('change');
  assert.equal(reopened.el('report').hidden,false);assert.equal(reopened.el('case-title').value,'Follow-up');
  assert.equal(reopened.el('case-notes').value,'Review with owner.');assert.equal(reopened.el('auth-window').value,'11');
  assert.ok(reopened.el('rule-profile-status').textContent.includes('review-profile'));
  assert.ok(reopened.el('findings').innerHTML.includes('Validate source.'));assert.ok(reopened.el('findings').innerHTML.includes('40 priority points'));
  assert.equal([...reopened.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,6);
  assert.match(reopened.el('reopen-status').textContent,/recalculated/);
});
test('failed or scoped case imports preserve the current dataset and unsaved notes',async()=>{
  const ui=app();await ui.sample('account');ui.el('case-notes').value='Keep this note';await ui.el('case-notes').trigger('input');
  const before=ui.el('event-rows').innerHTML;
  for(const content of ['not JSON','{"schemaVersion":"1.1","tool":{"name":"Windows Security Event Log Triage Tool"},"scope":{"mode":"view"},"events":[]}']){
    ui.el('reopen-case-file').files=[{name:'bad.json',size:content.length,text:async()=>content}];await ui.el('reopen-case-file').trigger('change');
    assert.equal(ui.el('case-notes').value,'Keep this note');assert.equal(ui.el('event-rows').innerHTML,before);
    assert.equal(ui.el('reopen-case-file').attributes['aria-invalid'],'true');assert.equal(ui.el('save-case').disabled,false);
  }
});
test('declining case replacement and oversized saved cases do not read or replace evidence',async()=>{
  const ui=app();await ui.sample('account');ui.el('case-notes').value='Unsaved';await ui.el('case-notes').trigger('input');
  let read=false;ui.window.confirm=()=>false;ui.el('reopen-case-file').files=[{name:'case.json',size:10,text:async()=>{read=true;return '{}';}}];
  await ui.el('reopen-case-file').trigger('change');assert.equal(read,false);assert.equal(ui.el('case-notes').value,'Unsaved');
  ui.window.confirm=()=>true;ui.el('reopen-case-file').files=[{name:'huge.json',size:50*1024*1024+1,text:async()=>{read=true;return '{}';}}];
  await ui.el('reopen-case-file').trigger('change');assert.equal(read,false);assert.match(ui.el('reopen-status').textContent,/50 MB/);
});
test('cancelled saved-case reads cannot overwrite a newer selection',async()=>{
  const ui=app();await ui.sample('account');let resolve;
  ui.el('reopen-case-file').files=[{name:'pending.json',size:10,text:()=>new Promise(done=>{resolve=done;})}];
  const pending=ui.el('reopen-case-file').trigger('change');await ui.el('cancel-task').trigger('click');
  await ui.sample('normal');resolve('{}');await pending;
  assert.ok(ui.el('file-name').textContent.includes('Normal Windows Activity'));assert.equal(ui.el('reopen-status').textContent,'');
});
test('page bootstrap loads and analyzes all five demo buttons', async () => {
  const ui=app();
  for(const key of ['normal','password','account','mixed','advanced']){
    await ui.sample(key);
    assert.equal(ui.el('report').hidden,false);
    assert.equal(ui.el('analyze-button').disabled,false);
    assert.ok(ui.el('event-rows').innerHTML.includes('Inspect CSV row'));
  }
  assert.ok(ui.el('findings').innerHTML.includes('AUTH_PASSWORD_SPRAY'));
  assert.ok(ui.el('findings').innerHTML.includes('PS_DOWNLOAD_EXECUTE'));
  assert.ok(ui.el('event-reference').innerHTML.includes('4948'));
});
test('finding evidence clears conflicting filters, shows exact rows, and returns focus to the finding', async () => {
  const ui=app();await ui.sample('mixed');
  ui.el('event-search').value='does not match';
  const id=ui.el('findings').innerHTML.match(/data-evidence="([^"]+)"/)[1];
  assert.ok(id.startsWith('ACCOUNT_CREATED_PRIVILEGED_GROUP'));
  await ui.evidence(id);
  assert.equal(ui.el('event-search').value,'');
  assert.equal(ui.el('evidence-scope').hidden,false);
  assert.deepEqual([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid="([^"]+)"/g)].map(match=>match[1]),['event-7','event-8']);
  assert.ok((await ui.inspect('event-7')).includes('All original CSV columns'));
  await ui.el('evidence-back').trigger('click');
  assert.equal(ui.document.activeElement.id,'finding-'+id);
  await ui.el('show-all-events').trigger('click');
  assert.equal(ui.el('evidence-scope').hidden,true);
  assert.equal([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,10);
});
test('changing the account window removes an out-of-window finding and its evidence scope', async () => {
  const ui=app();await ui.sample('account');
  const id=ui.el('findings').innerHTML.match(/data-evidence="([^"]+)"/)[1];
  await ui.evidence(id);
  ui.el('account-window').value='1';
  await ui.el('account-window').trigger('change');
  assert.equal(ui.el('evidence-scope').hidden,true);
  assert.equal(ui.el('findings').innerHTML.includes('ACCOUNT_CREATED_PRIVILEGED_GROUP'),false);
  assert.ok(ui.el('findings').innerHTML.includes('PRIVILEGED_GROUP_ADDED'));
});
test('event paging reaches rows beyond the first page and original HTML-like values stay escaped', async () => {
  const ui=app();
  const text=['Event ID,Message',...Array.from({length:105},(_,index)=>'9999,"row '+index+' <img src=x onerror=alert(1)>"')].join('\n');
  ui.el('csv-file').files=[{name:'large.csv',size:text.length,text:async()=>text}];
  await ui.el('csv-file').trigger('change');await ui.el('analyze-button').trigger('click');
  assert.equal([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,100);
  assert.equal(ui.el('event-rows').innerHTML.includes('<img src=x'),false);
  assert.ok((await ui.inspect('event-1')).includes('&lt;img src=x'));
  await ui.el('page-next').trigger('click');
  assert.equal([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,5);
  assert.ok(ui.el('page-label').textContent.includes('101–105'));
  ui.el('csv-file').files=[{name:'invalid.evtx',size:10,text:async()=>''}];
  await ui.el('csv-file').trigger('change');
  assert.equal(ui.el('report').hidden,false);assert.equal(ui.el('analyze-button').disabled,false);
  assert.ok(ui.el('parse-status').textContent.includes('Raw EVTX'));
});
test('a slow file read cannot overwrite a newly chosen demo', async () => {
  const ui=app();let resolve;
  const pending=new Promise(done=>{resolve=done;});
  ui.el('csv-file').files=[{name:'old.csv',size:30,text:()=>pending}];
  const oldRead=ui.el('csv-file').trigger('change');
  await ui.sample('advanced');
  resolve('Event ID,Message\n4624,old event');await oldRead;
  assert.ok(ui.el('file-name').textContent.includes('Correlation and Policy Lab'));
  assert.ok(ui.el('findings').innerHTML.includes('AUTH_PASSWORD_SPRAY'));
});

test('page size, first/last navigation, and time sorting reach all events in the chosen order',async()=>{
  const ui=app();
  await ui.load(['Event ID,Timestamp,Message',...Array.from({length:205},(_,i)=>'9999,'+new Date(Date.UTC(2026,9,19,0,i)).toISOString()+',row '+i)].join('\n'));
  ui.el('page-size').value='25';await ui.el('page-size').trigger('change');
  assert.equal([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,25);
  await ui.el('page-last').trigger('click');assert.ok(ui.el('page-label').textContent.includes('201–205'));
  ui.el('event-sort').value='time-desc';await ui.el('event-sort').trigger('change');
  assert.equal(ui.el('event-rows').innerHTML.match(/data-event-uid="([^"]+)"/)[1],'event-205');
  await ui.el('page-last').trigger('click');await ui.el('page-first').trigger('click');
  assert.ok(ui.el('page-label').textContent.includes('1–25'));
});
test('clearing filters preserves exact evidence scope, while show all removes it',async()=>{
  const ui=app();await ui.sample('account');
  const id=ui.el('findings').innerHTML.match(/data-evidence="([^"]+)"/)[1];await ui.evidence(id);
  ui.el('filter-id').value='1102';await ui.el('filter-id').trigger('input');
  assert.ok(ui.el('event-rows').innerHTML.includes('No events match'));
  await ui.el('clear-filters').trigger('click');
  assert.equal(ui.el('evidence-scope').hidden,false);assert.equal([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,2);
  await ui.el('show-all-events').trigger('click');assert.equal(ui.el('evidence-scope').hidden,true);
});
test('scoped JSON exports all matching evidence and excludes incomplete findings',async()=>{
  const ui=app();await ui.sample('mixed');
  const id=ui.el('findings').innerHTML.match(/data-evidence="([^"]+)"/)[1];await ui.evidence(id);
  ui.el('export-scope').value='view';await ui.el('export-json').trigger('click');
  let report=JSON.parse(await ui.downloads.at(-1).blob.text());
  assert.deepEqual(report.events.map(event=>event.uid),['event-7','event-8']);
  assert.equal(report.findings.length,1);assert.equal(report.scope.evidenceFindingId,id);
  ui.el('filter-id').value='4720';await ui.el('filter-id').trigger('input');
  await ui.el('export-json').trigger('click');report=JSON.parse(await ui.downloads.at(-1).blob.text());
  assert.equal(report.events.length,1);assert.equal(report.findings.length,0);
  assert.equal(report.scope.filters.id,'4720');
});
test('full exports span every event, finding, and timeline page without depending on the visible page',async()=>{
  const ui=app();await ui.load('Event ID,Message\n'+Array.from({length:120},()=> '1102,cleared in fictional lab').join('\n'));
  assert.equal([...ui.el('findings').innerHTML.matchAll(/data-evidence=/g)].length,20);
  assert.equal([...ui.el('timeline').innerHTML.matchAll(/<li>/g)].length,100);
  await ui.el('findings-next').trigger('click');assert.ok(ui.el('findings-page').textContent.includes('21–40'));
  await ui.el('timeline-next').trigger('click');assert.equal([...ui.el('timeline').innerHTML.matchAll(/<li>/g)].length,20);
  await ui.el('export-json').trigger('click');const report=JSON.parse(await ui.downloads.at(-1).blob.text());
  assert.equal(report.events.length,120);assert.equal(report.findings.length,120);
  assert.equal(report.scope.totalEvents,120);assert.ok(ui.downloads.at(-1).name.endsWith('.json'));
});
test('case and finding notes survive sorting and settings changes; inactive annotations remain in JSON',async()=>{
  const ui=app();await ui.sample('account');
  const id=ui.el('findings').innerHTML.match(/data-evidence="([^"]+)"/)[1];
  ui.el('case-title').value='Case <review>';await ui.el('case-title').trigger('input');
  ui.el('case-notes').value='timezone to confirm';await ui.el('case-notes').trigger('input');
  await ui.el('findings').trigger('input',{target:{dataset:{reviewNote:id},value:'<img src=x> analyst evidence',closest:()=>null}});
  await ui.el('findings').trigger('change',{target:{dataset:{reviewStatus:id},value:'Investigating',closest:()=>null}});
  ui.el('finding-sort').value='title';await ui.el('finding-sort').trigger('change');
  assert.ok(ui.el('findings').innerHTML.includes('&lt;img src=x&gt;'));
  ui.el('account-window').value='1';await ui.el('account-window').trigger('change');
  assert.ok(ui.el('case-status').textContent.includes('retained in JSON'));
  await ui.el('export-json').trigger('click');const report=JSON.parse(await ui.downloads.at(-1).blob.text());
  assert.equal(report.case.title,'Case <review>');assert.equal(report.settings.accountWindowMinutes,1);
  assert.equal(report.annotations[0].note,'<img src=x> analyst evidence');assert.equal(report.annotations[0].presentInExport,false);
  assert.equal(report.annotations[0].status,'Investigating');
});
test('replacing a case can be declined and failed/cancelled loads preserve its data and notes',async()=>{
  const ui=app();await ui.sample('advanced');
  ui.el('case-notes').value='keep this';await ui.el('case-notes').trigger('input');
  ui.window.confirm=()=>false;await ui.sample('normal');
  assert.ok(ui.el('file-name').textContent.includes('Correlation and Policy Lab'));assert.equal(ui.el('case-notes').value,'keep this');
  ui.window.confirm=()=>true;
  ui.el('csv-file').files=[{name:'bad.csv',size:30,text:async()=> 'no valid headers\nbad'}];await ui.el('csv-file').trigger('change');
  assert.ok(ui.el('parse-status').textContent.includes('Event ID'));assert.equal(ui.el('case-notes').value,'keep this');
  let resolve;ui.el('csv-file').files=[{name:'slow.csv',size:30,text:()=>new Promise(done=>{resolve=done;})}];
  const pending=ui.el('csv-file').trigger('change');await new Promise(done=>setTimeout(done,5));await ui.el('cancel-task').trigger('click');await pending;
  resolve('Event ID,Message\n9999,stale');
  assert.equal(ui.el('report').hidden,false);assert.equal(ui.el('case-notes').value,'keep this');
  assert.ok(ui.el('file-name').textContent.includes('Correlation and Policy Lab'));assert.equal(ui.el('cancel-task').hidden,true);
});
test('CSV downloads include notes and settings and protect formula-like analyst input',async()=>{
  const ui=app();await ui.sample('mixed');
  ui.el('case-notes').value='=SUM(1,1)';await ui.el('case-notes').trigger('input');
  await ui.el('export-findings').trigger('click');const csv=await ui.downloads.at(-1).blob.text();
  assert.ok(csv.includes('"\'=SUM(1,1)"'));assert.ok(csv.includes('Effective settings'));
  await ui.el('export-events').trigger('click');assert.ok((await ui.downloads.at(-1).blob.text()).includes('Original CSV fields (JSON)'));
});

for(const extension of ['xml','json','jsonl'])test('UI imports '+extension+' and exports its original source locations',async()=>{
  const ui=app();await ui.load(fs.readFileSync(path.join(root,'samples/authentication-sequence.'+extension),'utf8'),'case.'+extension);
  assert.equal(ui.el('report').hidden,false);assert.ok(ui.el('findings').innerHTML.includes('AUTH_SUCCESS_AFTER_FAILURES'));
  assert.ok(ui.el('event-rows').innerHTML.includes(extension==='xml'?'Inspect XML line':extension==='json'?'Inspect JSON record':'Inspect JSON line'));
  assert.ok((await ui.inspect('event-1')).includes('All source and adapter fields'));
  await ui.el('export-json').trigger('click');const report=JSON.parse(await ui.downloads.at(-1).blob.text());
  assert.equal(report.source.format,extension);assert.equal(report.events[0].inputFormat,extension);assert.equal(report.events[0].sourceRecord,1);
});
test('UI applies and resets a validated profile while preserving case notes',async()=>{
  const ui=app();await ui.sample('password');ui.el('case-notes').value='Keep this context';await ui.el('case-notes').trigger('input');
  const text=fs.readFileSync(path.join(root,'samples/profiles/lab-tuning.json'),'utf8');
  ui.el('rule-profile-file').files=[{name:'profile.json',size:text.length,text:async()=>text}];await ui.el('rule-profile-file').trigger('change');
  assert.ok(ui.el('findings').innerHTML.includes('40 priority points'));assert.equal(ui.el('case-notes').value,'Keep this context');
  await ui.el('export-json').trigger('click');const report=JSON.parse(await ui.downloads.at(-1).blob.text());assert.equal(report.ruleProfile.id,'lab-tuning');
  await ui.el('reset-rule-profile').trigger('click');assert.ok(ui.el('findings').innerHTML.includes('60 priority points'));
});
test('invalid or superseded rule profiles cannot replace the active profile',async()=>{
  const ui=app();await ui.sample('password');
  ui.el('rule-profile-file').files=[{name:'bad.json',size:10,text:async()=>'{"schemaVersion":"99"}'}];await ui.el('rule-profile-file').trigger('change');
  assert.ok(ui.el('rule-profile-status').textContent.includes('Profile rejected'));assert.ok(ui.el('findings').innerHTML.includes('60 priority points'));
  let resolve;ui.el('rule-profile-file').files=[{name:'slow.json',size:10,text:()=>new Promise(done=>{resolve=done;})}];const pending=ui.el('rule-profile-file').trigger('change');
  await ui.sample('normal');resolve('{"schemaVersion":"1.0","id":"late","version":"1","rules":{}}');await pending;
  await ui.el('export-json').trigger('click');assert.equal(JSON.parse(await ui.downloads.at(-1).blob.text()).ruleProfile.id,'default');
});
test('multi-file UI filters preserve every original record in saved cases and explain duplicates',async()=>{
  const ui=app(),files=require('./collection-fixtures.cjs').files();
  ui.el('csv-file').files=files.map(file=>({name:file.name,size:Buffer.byteLength(file.text),text:async()=>file.text}));
  await ui.el('csv-file').trigger('change');await ui.el('analyze-button').trigger('click');
  assert.match(ui.el('source-summary').textContent,/1 confirmed duplicates/);assert.ok(ui.el('rule-coverage-list').innerHTML.includes('AUTH_SUCCESS_AFTER_FAILURES'));
  assert.ok(ui.el('event-rows').innerHTML.includes('first.csv'));assert.ok((await ui.inspect('event-3')).includes('event-4'));
  ui.el('filter-source').value='source-2';await ui.el('filter-source').trigger('input');
  ui.el('filter-duplicates').value='duplicates';await ui.el('filter-duplicates').trigger('input');
  assert.deepEqual([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid="([^"]+)"/g)].map(match=>match[1]),['event-4']);
  await ui.el('save-case').trigger('click');const saved=await ui.downloads.at(-1).blob.text(),report=JSON.parse(saved).report;
  assert.equal(report.events.length,7);assert.equal(report.source.files.length,2);assert.equal(report.ruleCoverageScope,'entire dataset');
  const reopened=app();reopened.el('reopen-case-file').files=[{name:'case.json',size:Buffer.byteLength(saved),text:async()=>saved}];
  await reopened.el('reopen-case-file').trigger('change');assert.match(reopened.el('source-summary').textContent,/1 confirmed duplicates/);
  assert.equal([...reopened.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,7);
});
test('a malformed later file cannot replace a current case or its notes with partial input',async()=>{
  const ui=app();await ui.sample('account');ui.el('case-notes').value='Preserve this';await ui.el('case-notes').trigger('input');const before=ui.el('event-rows').innerHTML;
  ui.el('csv-file').files=[{name:'good.csv',size:20,text:async()=> 'Event ID\n1102'},{name:'broken.json',size:5,text:async()=> '{bad'}];
  await ui.el('csv-file').trigger('change');assert.match(ui.el('parse-status').textContent,/broken.json/);assert.equal(ui.el('case-notes').value,'Preserve this');assert.equal(ui.el('event-rows').innerHTML,before);
});
test('rule coverage updates with profile changes while showing data gaps for rules with no findings',async()=>{
  const ui=app();await ui.load('Event ID,NewProcessName\n4688,powershell.exe');
  assert.match(ui.el('rule-coverage-list').innerHTML,/PowerShell command line/);assert.match(ui.el('rule-coverage-list').innerHTML,/Insufficient data/);
  const text=JSON.stringify({schemaVersion:'1.0',id:'disabled',version:'1',rules:{PS_ENCODED:{enabled:false}}});
  ui.el('rule-profile-file').files=[{name:'profile.json',size:text.length,text:async()=>text}];await ui.el('rule-profile-file').trigger('change');
  await ui.el('export-json').trigger('click');const report=JSON.parse(await ui.downloads.at(-1).blob.text());
  assert.equal(report.ruleCoverage.find(item=>item.ruleId==='PS_ENCODED').state,'disabled');
});
test('printable download preserves export scope and unsaved notes until a full case is saved',async()=>{
  const ui=app();assert.equal(ui.el('export-print').disabled,true);await ui.sample('mixed');
  ui.el('case-notes').value='Keep these notes';await ui.el('case-notes').trigger('input');ui.el('export-scope').value='view';
  await ui.el('export-print').trigger('click');const download=ui.downloads.at(-1),html=await download.blob.text();
  assert.match(download.name,/-print\.html$/);assert.match(html,/Current evidence and filters/);assert.ok(html.includes('Keep these notes'));assert.match(ui.el('case-status').textContent,/Notes changed/);
  assert.match(ui.el('export-status').textContent,/Print \/ Save as PDF/);assert.ok(ui.el('findings').innerHTML.includes('MITRE ATT&amp;CK learning references'));
});


