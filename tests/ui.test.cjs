const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');

function app() {
  const markup=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const elements=new Map(), buttons=[];
  const document={activeElement:null};
  class Element {
    constructor(id='') { this.id=id; this.value='';this.hidden=false;this.disabled=false;this.listeners={};this.dataset={};this.files=[];this._html='';this.textContent='';this.classList={toggle(){},add(){},remove(){}}; }
    set innerHTML(value) {
      this._html=String(value);
      for (const match of this._html.matchAll(/\bid="([^"]+)"/g)) if (!elements.has(match[1])) elements.set(match[1],new Element(match[1]));
    }
    get innerHTML(){return this._html;}
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
  const fakeWindow={};
  const context=vm.createContext({window:fakeWindow,document,console,Event:class{constructor(type){this.type=type;}},DataTransfer:class{}});
  vm.runInContext(fs.readFileSync(path.join(root,'analysis.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'script.js'),'utf8'),context);
  return {
    el:id=>elements.get(id), document,
    sample:async key=>{await buttons.find(button=>button.dataset.sample===key).trigger('click');await elements.get('analyze-button').trigger('click');},
    evidence:async id=>elements.get('findings').trigger('click',{target:{closest:()=>({dataset:{evidence:id}})}})
  };
}
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
  assert.ok(ui.el('event-rows').innerHTML.includes('All original CSV columns'));
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
  assert.ok(ui.el('event-rows').innerHTML.includes('&lt;img src=x'));
  await ui.el('page-next').trigger('click');
  assert.equal([...ui.el('event-rows').innerHTML.matchAll(/data-event-uid=/g)].length,5);
  assert.ok(ui.el('page-label').textContent.includes('101–105'));
  ui.el('csv-file').files=[{name:'invalid.evtx',size:10,text:async()=>''}];
  await ui.el('csv-file').trigger('change');
  assert.equal(ui.el('report').hidden,true);assert.equal(ui.el('analyze-button').disabled,true);
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

