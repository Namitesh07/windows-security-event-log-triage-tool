const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..');
test.beforeEach(async({page})=>{
  const errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!/^(?:http:\/\/127\.0\.0\.1:4173\/|blob:)/.test(request.url()))external.push(request.url());});
  page._triageErrors=errors;page._triageExternal=external;await page.goto('/');
});
test.afterEach(async({page})=>{expect(page._triageErrors).toEqual([]);expect(page._triageExternal).toEqual([]);});
async function load(page,name){
  await page.locator('#csv-file').setInputFiles(path.join(root,'samples',name));
  await expect(page.locator('#parse-status')).toContainText('events parsed');
  await page.locator('#analyze-button').click();await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#save-case')).toBeEnabled();
}
async function download(page,button){const pending=page.waitForEvent('download');await page.locator(button).click();return pending;}
async function reopenPayload(download){return {name:download.suggestedFilename(),mimeType:'application/json',buffer:fs.readFileSync(await download.path())};}
async function notes(page){
  await page.locator('#case-panel > summary').click();
  await page.locator('#case-title').fill('Browser investigation');await page.locator('#case-notes').fill('Continue this review later.');
  const review=page.locator('.review-notes').first();await review.locator('summary').click();
  await review.locator('select').selectOption('Investigating');await review.locator('textarea').fill('Verify the account owner.');
}
for(const format of ['csv','xml','json','jsonl'])test(format+' case saves and reopens notes, settings, profile, and every event',async({page})=>{
  await load(page,format==='csv'?'password-guessing.csv':'authentication-sequence.'+format);await notes(page);
  await page.locator('#auth-window').fill('12');await page.locator('#auth-window').dispatchEvent('change');
  await expect(page.locator('#save-case')).toBeEnabled();
  await page.getByText('Detection rules and optional tuning profile',{exact:true}).click();
  await page.locator('#rule-profile-file').setInputFiles(path.join(root,'samples/profiles/lab-tuning.json'));
  await expect(page.locator('#findings')).toContainText('40 priority points');
  await page.locator('#event-search').fill('a filter with no matching records');await page.locator('#export-scope').selectOption('view');
  const saved=await download(page,'#save-case'),file=await saved.path();
  const document=JSON.parse(fs.readFileSync(file,'utf8'));expect(document.kind).toBe('fieldnotes-case');expect(document.report.scope.mode).toBe('all');
  const count=document.report.events.length;expect(count).toBe(format==='csv'?7:6);
  await page.reload();await page.getByText('Reopen a saved case',{exact:true}).click();
  await page.locator('#reopen-case-file').setInputFiles(await reopenPayload(saved));await expect(page.locator('#reopen-status')).toContainText('Reopened');
  await expect(page.locator('#case-title')).toHaveValue('Browser investigation');await expect(page.locator('#case-notes')).toHaveValue('Continue this review later.');
  await expect(page.locator('#auth-window')).toHaveValue('12');await expect(page.locator('#rule-profile-status')).toContainText('lab-tuning');
  await expect(page.locator('#findings')).toContainText('40 priority points');await expect(page.locator('textarea[data-review-note]').first()).toHaveValue('Verify the account owner.');
  await expect(page.locator('#event-rows > tr[data-event-uid]')).toHaveCount(count);
});
test('full report reopens, scoped reports and malformed files preserve the current case',async({page})=>{
  await load(page,'authentication-sequence.json');await notes(page);
  const complete=await download(page,'#export-json'),file=await complete.path();
  await page.getByText('Reopen a saved case',{exact:true}).click();await page.locator('#reopen-case-file').setInputFiles(await reopenPayload(complete));
  await expect(page.locator('#reopen-status')).toContainText('Reopened');
  await page.locator('#export-scope').selectOption('view');const scoped=await download(page,'#export-json');
  await page.locator('#reopen-case-file').setInputFiles(await reopenPayload(scoped));await expect(page.locator('#reopen-status')).toContainText('filtered/scoped');
  await expect(page.locator('#case-notes')).toHaveValue('Continue this review later.');
  await page.locator('#reopen-case-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  await expect(page.locator('#reopen-case-file')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#event-rows > tr[data-event-uid]')).toHaveCount(6);
});
test('worker cancellation preserves the case and permits a newer upload',async({page})=>{
  await load(page,'account-persistence.csv');let release;
  const gate=new Promise(done=>{release=done;});
  await page.route('**/worker.js*',async route=>{await gate;await route.continue().catch(()=>{});});
  await page.locator('#csv-file').setInputFiles(path.join(root,'samples/authentication-sequence.xml'));
  await expect(page.locator('#cancel-task')).toBeVisible();await page.locator('#cancel-task').click();
  await expect(page.locator('#parse-status')).toContainText('cancelled');release();await page.unroute('**/worker.js*');
  await expect(page.locator('#dataset-tag')).toContainText('account-persistence.csv');
  await load(page,'benign-process-review.csv');await expect(page.locator('#event-rows > tr[data-event-uid]')).toHaveCount(2);
});
test('small-file fallback saves and reopens a case without Worker support',async({page})=>{
  await page.addInitScript(()=>{window.Worker=undefined;});await page.reload();
  await load(page,'authentication-sequence.json');await notes(page);
  const saved=await download(page,'#save-case');await page.getByText('Reopen a saved case',{exact:true}).click();
  await page.locator('#reopen-case-file').setInputFiles(await reopenPayload(saved));
  await expect(page.locator('#reopen-status')).toContainText('Reopened');await expect(page.locator('#case-notes')).toHaveValue('Continue this review later.');
});
test('dismissing replacement confirmation preserves unsaved notes',async({page})=>{
  await load(page,'account-persistence.csv');await notes(page);
  await page.getByText('Reopen a saved case',{exact:true}).click();let message='';
  page.once('dialog',async dialog=>{message=dialog.message();await dialog.dismiss();});
  await page.locator('#reopen-case-file').setInputFiles({name:'another.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await expect(page.locator('#case-notes')).toHaveValue('Continue this review later.');
  expect(message).toContain('starts a new case');await expect(page.locator('#dataset-tag')).toContainText('account-persistence.csv');
});
test('downloaded CSV protects spreadsheet cells and source markup remains text',async({page})=>{
  await page.locator('#csv-file').setInputFiles({name:'literal.csv',mimeType:'text/csv',buffer:Buffer.from('Event ID,Message\n1102,"=literal <img src=https://example.invalid onerror=alert(1)>"')});
  await expect(page.locator('#parse-status')).toContainText('events parsed');await page.locator('#analyze-button').click();
  await page.locator('.event-details summary').first().click();await expect(page.locator('.event-detail-body')).toContainText('<img');
  await expect(page.locator('.event-detail-body img')).toHaveCount(0);
  const exported=await download(page,'#export-events');expect(fs.readFileSync(await exported.path(),'utf8')).toContain("'=literal");
});
test('keyboard focus, mobile width, stacked guides, and creator typography remain usable',async({page})=>{
  const input=page.locator('#csv-file');await input.focus();await expect(input).toBeFocused();
  const outline=await page.locator('#drop-zone').evaluate(element=>getComputedStyle(element).outlineStyle);expect(outline).not.toBe('none');
  await page.keyboard.press('Tab');await expect(page.locator('.case-reopen > summary')).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('#reopen-case-file')).toBeVisible();
  const [first,second]=await page.locator('.education-card').evaluateAll(cards=>cards.map(element=>{const rect=element.getBoundingClientRect();return {y:rect.top+scrollY,width:rect.width,height:rect.height};}));
  expect(second.y).toBeGreaterThanOrEqual(first.y+first.height);expect(Math.abs(first.width-second.width)).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const fonts=await page.evaluate(()=>[getComputedStyle(document.querySelector('footer')).fontFamily,getComputedStyle(document.querySelector('.creator-credit p')).fontFamily]);
  expect(fonts[0]).toBe(fonts[1]);await expect(page.locator('.creator-credit p')).toHaveText('NAMITESH PANDEY');
});
const collectionFiles=()=>require('../collection-fixtures.cjs').files().map(file=>({name:file.name,mimeType:'text/csv',buffer:Buffer.from(file.text)}));
test('multi-file chooser correlates evidence, filters duplicates, and saves/reopens every source',async({page})=>{
  await page.locator('#csv-file').setInputFiles(collectionFiles());await expect(page.locator('#parse-status')).toContainText('7 events parsed');
  await page.locator('#analyze-button').click();await expect(page.locator('#findings')).toContainText('6 supporting event(s)');
  await page.getByText('Source files and duplicate handling',{exact:true}).click();await expect(page.locator('#source-summary')).toContainText('1 confirmed duplicates');
  await page.locator('#filter-source').selectOption('source-2');await page.locator('#filter-duplicates').selectOption('duplicates');
  await expect(page.locator('#event-rows > tr[data-event-uid]')).toHaveCount(1);await expect(page.locator('#event-rows')).toContainText('Duplicate of event-3');
  await page.locator('.event-details summary').click();await expect(page.locator('.event-detail-body')).toContainText('second.csv');
  const saved=await download(page,'#save-case'),document=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
  expect(document.report.events).toHaveLength(7);expect(document.report.source.files).toHaveLength(2);
  await page.reload();await page.getByText('Reopen a saved case',{exact:true}).click();await page.locator('#reopen-case-file').setInputFiles(await reopenPayload(saved));
  await expect(page.locator('#reopen-status')).toContainText('Reopened');await expect(page.locator('#event-rows > tr[data-event-uid]')).toHaveCount(7);
  await expect(page.locator('#findings')).toContainText('6 supporting event(s)');
});
test('mixed-format drag and drop preserves the current case if a later file fails',async({page})=>{
  await load(page,'account-persistence.csv');await notes(page);page.on('dialog',dialog=>dialog.accept());
  const transfer=await page.evaluateHandle(()=>{const data=new DataTransfer();data.items.add(new File(['Event ID\n1102'],'valid.csv',{type:'text/csv'}));data.items.add(new File(['{bad'],'broken.json',{type:'application/json'}));return data;});
  await page.locator('#drop-zone').dispatchEvent('drop',{dataTransfer:transfer});await expect(page.locator('#parse-status')).toContainText('broken.json');
  await expect(page.locator('#case-notes')).toHaveValue('Continue this review later.');await expect(page.locator('#event-rows > tr[data-event-uid]')).toHaveCount(2);
  await page.locator('#csv-file').setInputFiles([path.join(root,'samples/benign-process-review.csv'),path.join(root,'samples/authentication-sequence.xml')]);
  await expect(page.locator('#parse-status')).toContainText('8 events parsed');await page.locator('#analyze-button').click();
  const saved=await download(page,'#export-json'),report=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
  expect(report.events.map(event=>event.inputFormat)).toEqual(['csv','csv',...Array(6).fill('xml')]);expect(report.source.files).toHaveLength(2);
});
test('coverage explains command-line gaps, disabled rules, and remains within the viewport',async({page})=>{
  await page.locator('#csv-file').setInputFiles({name:'missing.csv',mimeType:'text/csv',buffer:Buffer.from('Event ID,NewProcessName\n4688,powershell.exe')});
  await expect(page.locator('#parse-status')).toContainText('events parsed');await page.locator('#analyze-button').click();
  await page.getByText('Per-rule coverage and data gaps',{exact:true}).click();
  const row=page.locator('.rule-coverage-item').filter({has:page.locator('small',{hasText:'PS_ENCODED'})});await row.locator('summary').first().click();
  await expect(row).toContainText('PowerShell command line');await expect(row).toContainText('Insufficient data');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByText('Detection rules and optional tuning profile',{exact:true}).click();
  await page.locator('#rule-profile-file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schemaVersion:'1.0',id:'test',version:'1',rules:{PS_ENCODED:{enabled:false}}}))});
  await expect(page.locator('#rule-profile-status')).toContainText('1 disabled');await expect(row.locator('.coverage-state')).toHaveText('Disabled');
});
test('multi-file small-file fallback enforces combined limits and keeps all data on failure',async({page})=>{
  await page.addInitScript(()=>{window.Worker=undefined;});await page.reload();await page.locator('#csv-file').setInputFiles(collectionFiles());
  await expect(page.locator('#parse-status')).toContainText('7 events parsed');await page.locator('#analyze-button').click();
  await page.locator('#csv-file').setInputFiles([{name:'one.csv',mimeType:'text/csv',buffer:Buffer.alloc(1100000,32)},{name:'two.csv',mimeType:'text/csv',buffer:Buffer.alloc(1100000,32)}]);
  await expect(page.locator('#parse-status')).toContainText('Background processing is unavailable');await expect(page.locator('#event-rows > tr[data-event-uid]')).toHaveCount(7);
});
