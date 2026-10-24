/* Explicit test paths keep npm test consistent in Windows and Unix shells. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const folder=path.join(__dirname,'../tests');
const files=fs.readdirSync(folder).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join(folder,name));
const child=spawn(process.execPath,['--test',...process.argv.slice(2),...files],{stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('close',code=>{process.exitCode=code??1;});
