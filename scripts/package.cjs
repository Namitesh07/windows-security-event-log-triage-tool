/* Reproducible dependency-free ZIP (STORE). Source only; no credentials or user logs. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),pkg=require('../package.json');
const rootFiles=['index.html','styles.css','analysis.js','inputs.js','rules.generated.js','rule-profiles.js','report.js','case-file.js','task-runner.js','worker.js','script.js','package.json','package-lock.json','playwright.config.cjs','README.md','CHANGELOG.md','UPGRADE_GUIDE.md','.gitattributes','.gitignore'];
const dirs=['.github','docs','rules','samples','scripts','tests','tools'];
function sourceFiles(){
  const result=[...rootFiles];
  function visit(relative){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const name=relative+'/'+entry.name;if(entry.isSymbolicLink())throw new Error('Packaging symlinks is not supported: '+name);if(entry.isDirectory())visit(name);else result.push(name);}}
  dirs.forEach(visit);
  for(const file of result){const stat=fs.lstatSync(path.join(root,file));if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Expected a regular source file: '+file);}
  return result.sort();
}
const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function zip(entries){
  const locals=[],central=[];let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name),data=entry.data,crc=crc32(data);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(33,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
    locals.push(h,name,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
function packageSource(output=path.join(root,'dist')){
  if(process.env.RELEASE_TAG&&process.env.RELEASE_TAG!=='v'+pkg.version)throw new Error('Release tag does not match package version.');
  const entries=sourceFiles().map(name=>({name,data:fs.readFileSync(path.join(root,name))}));
  const manifest=entries.map(entry=>crypto.createHash('sha256').update(entry.data).digest('hex')+'  '+entry.name).join('\n')+'\n';
  entries.push({name:'SHA256SUMS.txt',data:Buffer.from(manifest)});
  const bytes=zip(entries),filename='windows-security-event-log-triage-tool-v'+pkg.version+'.zip';
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,filename),bytes);fs.writeFileSync(path.join(output,filename+'.sha256'),crypto.createHash('sha256').update(bytes).digest('hex')+'  '+filename+'\n');
  return {path:path.join(output,filename),files:entries.length,bytes:bytes.length};
}
if(require.main===module){try{if(process.argv.includes('--check'))console.log('Packaging inputs valid: '+sourceFiles().length+' source files.');else console.log(JSON.stringify(packageSource()));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={sourceFiles,packageSource};
