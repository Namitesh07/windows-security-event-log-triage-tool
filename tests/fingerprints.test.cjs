const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const collection=require('../collection'),cases=require('../case-file'),analysis=require('../analysis'),reports=require('../report');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const file=bytes=>({name:'original.csv',file:new Blob([bytes])});
const scope=parsed=>({...parsed,findings:analysis.analyze(parsed.events),settings:analysis.DEFAULT_SETTINGS,case:{},scope:{mode:'all',totalEvents:parsed.events.length}});
test('SHA-256 uses standard known vectors and preserves binary byte values',async()=>{
  assert.equal(await collection.fingerprintBytes(new Uint8Array(),crypto.webcrypto.subtle),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await collection.fingerprintBytes(new TextEncoder().encode('abc'),crypto.webcrypto.subtle),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for(const length of [55,56,63,64,65,128,1024]){const bytes=Uint8Array.from({length},(_,i)=>i%256);assert.equal(await collection.fingerprintBytes(bytes,crypto.webcrypto.subtle),hash(bytes));}
});
test('fingerprints cover original UTF-16 BOM and line endings rather than decoded fields',async()=>{
  const csv='Event ID,Message\r\n1102,Fictional original\r\n',bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(csv,'utf16le')]);
  const parsed=await collection.parseFiles([file(bytes)]),fingerprint=parsed.source.files[0].fingerprint;
  assert.equal(fingerprint.hex,hash(bytes));assert.equal(fingerprint.byteLength,bytes.length);assert.equal(fingerprint.verification,'computed-at-import');
  assert.notEqual(fingerprint.hex,hash(Buffer.from(csv)));assert.equal(parsed.events[0].id,'1102');
  const changed=await collection.parseFiles([file(Buffer.from(csv.replaceAll('\r\n','\n')))]);assert.notEqual(changed.source.files[0].fingerprint.hex,fingerprint.hex);
});
test('hashing reads original bytes once and does not change duplicate decisions',async()=>{
  const fixtures=require('./collection-fixtures.cjs').files();let reads=0;
  const files=fixtures.map(entry=>{const bytes=Buffer.from(entry.text);return {name:entry.name,file:{size:bytes.length,arrayBuffer:async()=>{reads++;return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}};});
  const parsed=await collection.parseFiles(files);assert.equal(reads,2);assert.equal(parsed.diagnostics.duplicateEvents,1);
  assert.ok(parsed.source.files.every(entry=>entry.fingerprint?.hex.length===64));assert.notEqual(parsed.source.files[0].fingerprint.hex,parsed.source.files[1].fingerprint.hex);
});
test('reopening retains hashes as recorded metadata without claiming original-byte verification',async()=>{
  const parsed=await collection.parseFiles([file(Buffer.from('Event ID,Message\n1102,fictional'))]),input=scope(parsed),saved=cases.saveCase(input),restored=cases.reopenCase(saved);
  assert.equal(restored.source.files[0].fingerprint.hex,parsed.source.files[0].fingerprint.hex);assert.equal(restored.source.files[0].fingerprint.verification,'recorded-in-case');
  assert.ok(restored.notices.some(notice=>notice.includes('does not verify')));
  const report=reports.createReport(input);assert.ok(reports.eventsCsv(report).includes(parsed.source.files[0].fingerprint.hex));assert.ok(reports.findingsCsv(report).includes(parsed.source.files[0].fingerprint.hex));
});
for(const [name,mutate] of [['algorithm',fp=>fp.algorithm='MD5'],['hex',fp=>fp.hex='<script>'],['byte length',fp=>fp.byteLength++],['basis',fp=>fp.basis='normalized-text'],['verification',fp=>fp.verification='verified-by-authority']])test('case validation rejects invalid fingerprint '+name,async()=>{
  const parsed=await collection.parseFiles([file(Buffer.from('Event ID\n1102'))]),saved=JSON.parse(cases.saveCase(scope(parsed)));mutate(saved.report.source.files[0].fingerprint);
  assert.throws(()=>cases.reopenCase(JSON.stringify(saved)),/fingerprint/);
});
test('unavailable byte access or crypto is explicit and never fabricates a digest',async()=>{
  assert.equal(await collection.fingerprintBytes(new Uint8Array([1]),null),null);
  assert.equal(await collection.fingerprintBytes(new Uint8Array([1]),{digest:async()=>{throw Error('disabled');}}),null);
  assert.equal(await collection.fingerprintBytes(new Uint8Array([1]),{digest:async()=>new ArrayBuffer(1)}),null);
  const parsed=await collection.parseFiles([{name:'text.csv',text:'Event ID\n1102'}]);assert.equal(parsed.source.files[0].fingerprint,null);assert.equal(parsed.source.files[0].fingerprintUnavailable,'original-bytes-unavailable');
});
