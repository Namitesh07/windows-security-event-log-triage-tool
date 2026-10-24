const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),pkg=require('../package.json');
const skip=new Set(['.git','node_modules','dist','coverage','test-results','playwright-report']);
function files(dir=root){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>skip.has(entry.name)?[]:entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
function check(){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  if(lock.version!==pkg.version||lock.packages[''].version!==pkg.version||JSON.stringify(lock.packages[''].devDependencies)!==JSON.stringify(pkg.devDependencies))throw new Error('Package lock and package metadata differ. Run npm install --package-lock-only.');
  if(require('../report.js').TOOL_VERSION!==pkg.version)throw new Error('Tool and package versions differ.');
  if(fs.readFileSync(path.join(root,'rules.generated.js'),'utf8')!==require('./generate-rules.cjs').generatedRules())throw new Error('Stale generated rules. Run npm run generate:rules.');
  const catalog=require('../rules.generated.js');
  const engine=new Set([...fs.readFileSync(path.join(root,'analysis.js'),'utf8').matchAll(/['"]([A-Z][A-Z0-9_]{4,})['"]/g)].map(match=>match[1]));
  if([...engine].sort().join()!==catalog.rules.map(rule=>rule.id).sort().join())throw new Error('The rule catalog and engine IDs differ.');
  for(const file of files().filter(file=>/\.(?:js|cjs)$/.test(file))){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||'JavaScript syntax check failed.');}
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML IDs.');
  for(const match of html.matchAll(/\b(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g))for(const id of match[1].split(/\s+/))if(!ids.includes(id))throw new Error('Unresolved accessible label: '+id);
  const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match=>match[1]);
  const required=['rules.generated.js','rule-profiles.js','analysis.js','inputs.js','report.js','case-file.js','task-runner.js','script.js'];
  if(required.some((script,index)=>scripts[index]!==script+'?v='+pkg.version))throw new Error('Runtime scripts are missing, out of order, or have a stale cache version.');
  if(!fs.readFileSync(path.join(root,'worker.js'),'utf8').includes("const ASSET_VERSION = '"+pkg.version+"';"))throw new Error('Worker asset cache version is stale.');
  const localTarget=(target,base)=>{if(/^(?:https?:|mailto:|#)/.test(target))return;const file=decodeURIComponent(target.split(/[?#]/)[0]);if(!file)return;const resolved=path.resolve(base,file);if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved))throw new Error('Unresolved local link: '+target);};
  for(const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g))localTarget(match[1],root);
  for(const file of files().filter(file=>file.endsWith('.md')))for(const match of fs.readFileSync(file,'utf8').matchAll(/\]\(([^)\s]+)\)/g))localTarget(match[1],path.dirname(file));
  if(process.env.RELEASE_TAG&&process.env.RELEASE_TAG!=='v'+pkg.version)throw new Error('Release tag '+process.env.RELEASE_TAG+' must equal v'+pkg.version+'.');
  console.log('Checks passed: JavaScript, generated rules, versions, markup, assets, and documentation links.');
}
if(require.main===module){try{check();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={check};
