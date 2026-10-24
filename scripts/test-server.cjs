/* Loopback-only static server for browser validation. Never receives event files. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.TRIAGE_TEST_PORT||4173);
const runtime=new Set(['index.html','styles.css','rules.generated.js','rule-profiles.js','analysis.js','inputs.js','report.js','case-file.js','task-runner.js','worker.js','script.js']);
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.jsonl':'application/x-ndjson','.xml':'application/xml','.csv':'text/csv','.ps1':'text/plain'};
const server=http.createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  let relative;
  try{relative=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname).replace(/^\//,'')||'index.html';}catch{response.writeHead(400);response.end();return;}
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!runtime.has(relative)&&!relative.startsWith('samples/')&&!relative.startsWith('tools/')){response.writeHead(404);response.end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});
    response.end(request.method==='HEAD'?undefined:data);
  });
});
server.listen(port,'127.0.0.1',()=>console.log('Browser test server: http://127.0.0.1:'+port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
