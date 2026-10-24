const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),pkg=require('../package.json'),{packageSource,sourceFiles}=require('../scripts/package.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function entries(bytes){
  const result=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    assert.equal(bytes.readUInt16LE(offset+8),0,'source archive entries use STORE');
    const length=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.toString('utf8',offset+30,offset+30+nameLength),start=offset+30+nameLength+extraLength;
    assert.ok(!result.has(name));result.set(name,bytes.subarray(start,start+length));offset=start+length;
  }
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length-12),result.size);return result;
}
test('source ZIP is repeatable and its manifest covers the exact source bytes',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'triage-package-'));
  try{
    const first=packageSource(path.join(temporary,'first')),second=packageSource(path.join(temporary,'second'));
    const bytes=fs.readFileSync(first.path);assert.deepEqual(bytes,fs.readFileSync(second.path));
    assert.equal(fs.readFileSync(first.path+'.sha256','utf8'),hash(bytes)+'  '+path.basename(first.path)+'\n');
    const bundled=entries(bytes),prefix='windows-security-event-log-triage-tool/',manifest=bundled.get(prefix+'SHA256SUMS.txt').toString('utf8').trim().split('\n');
    assert.equal(manifest.length,sourceFiles().length);assert.equal(bundled.size,manifest.length+1);
    for(const line of manifest){const [checksum,name]=line.split('  '),data=bundled.get(prefix+name);assert.ok(data,name);assert.equal(hash(data),checksum);assert.deepEqual(data,fs.readFileSync(path.join(root,name)));}
    for(const name of ['inputs.js','rules.generated.js','rule-profiles.js','.github/workflows/ci.yml','.github/workflows/release-check.yml','tools/Export-TriageEvents.ps1'])assert.ok(bundled.has(prefix+name));
    assert.ok([...bundled.keys()].every(name=>!/(?:^|\/)(?:\.git|node_modules|dist)(?:\/|$)/.test(name)));
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('source packaging refuses a release tag for a different version',()=>{
  const result=spawnSync(process.execPath,['scripts/package.cjs'],{cwd:root,encoding:'utf8',env:{...process.env,RELEASE_TAG:'v0.0.0'}});
  assert.notEqual(result.status,0);assert.match(result.stderr,/tag does not match/);
});
test('release checks accept the matching version and reject a mismatched tag',()=>{
  for(const [tag,expected] of [['v'+pkg.version,0],['v0.0.0',1]]){
    const result=spawnSync(process.execPath,['scripts/check.cjs'],{cwd:root,encoding:'utf8',env:{...process.env,RELEASE_TAG:tag}});
    assert.equal(result.status,expected,result.stderr);if(expected)assert.match(result.stderr,/must equal/);
  }
});
