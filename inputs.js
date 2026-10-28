/* Local event-file adapters. XML is a bounded Windows Event XML subset, never a DOM. */
(function exposeInputs(root) {
  'use strict';
  const analysis = typeof module !== 'undefined' && module.exports ? require('./analysis.js') : root.EventTriageAnalysis;
  const EXTENSIONS = Object.freeze(['csv','xml','json','jsonl','ndjson']);
  const EVENT_NS = 'http://schemas.microsoft.com/win/2004/08/events/event';
  const MAX_RECORDS = 100000, MAX_COLUMNS = 512, MAX_DEPTH = 48;
  const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keyName = value => String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  function formatForName(name = '') {
    const extension = String(name).toLowerCase().split('.').at(-1);
    if (extension === 'evtx') throw new Error('Raw EVTX is not supported. Convert it locally with tools/Export-TriageEvents.ps1, then open the resulting XML.');
    if (!EXTENSIONS.includes(extension)) throw new Error('Choose an event file ending in .csv, .xml, .json, .jsonl, or .ndjson.');
    return extension === 'ndjson' ? 'jsonl' : extension;
  }
  async function readFileText(file) {
    if (typeof file.arrayBuffer !== 'function') return file.text();
    return decodeFileBytes(new Uint8Array(await file.arrayBuffer()));
  }
  function decodeFileBytes(bytes) {
    if (bytes[0] === 0x45 && bytes[1] === 0x6c && bytes[2] === 0x66 && bytes[3] === 0x46) throw new Error('This is binary EVTX, not a text export. Convert it locally before importing.');
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    try { return new TextDecoder(encoding,{fatal:true}).decode(bytes); }
    catch { throw new Error('Could not decode this text file. Export as UTF-8, or UTF-16 with a byte-order mark.'); }
  }
  const stringValue = value => value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  function rowsFromRecords(records) {
    if (!records.length) throw new Error('The event export contains no records.');
    if (records.length > MAX_RECORDS) throw new Error('This export exceeds 100,000 records. Select a smaller collection window.');
    const headerMap = new Map();
    for(const record of records)for(const [key] of record.fields)if(!headerMap.has(keyName(key)))headerMap.set(keyName(key),key);
    const headers = [...headerMap.values()];
    if (headers.length > MAX_COLUMNS) throw new Error('The event export has more than 512 distinct fields. Select a more focused export.');
    const rows = [headers];
    for (const record of records) {
      const values = new Map(record.fields.map(([key,value])=>[keyName(key),value]));
      const row = headers.map(header => stringValue(values.get(keyName(header))));
      Object.defineProperty(row,'lineNumber',{value:record.line || record.record,enumerable:false});
      Object.defineProperty(row,'sourceRecord',{value:record.record,enumerable:false});
      Object.defineProperty(row,'sourceLine',{value:record.line,enumerable:false});
      rows.push(row);
    }
    return rows;
  }
  function xmlError(message,line) { return new Error('XML line ' + line + ': ' + message); }
  function xmlText(value,line) {
    const result = value.replace(/&([^;\s<&]+);/g,(all,entity) => {
      const standard = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
      if (own(standard,entity)) return standard[entity];
      if (!/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) throw xmlError('Unsupported entity reference.',line);
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
      if (!(code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff)) throw xmlError('Invalid XML character reference.',line);
      return String.fromCodePoint(code);
    });
    if (/&(?!(?:[^;\s<&]+);)/.test(value)) throw xmlError('Unescaped ampersand.',line);
    return result.replace(/\r\n?/g,'\n');
  }
  function one(node,name) {
    const found = node.children.filter(child => child.local === name && child.uri === node.uri);
    if (found.length > 1) throw xmlError('Duplicate ' + name + ' element.',node.line);
    return found[0];
  }
  const content = node => node ? node.parts.join('') : '';
  function xmlRecord(event,original,record) {
    const system = one(event,'System');
    if (!system) throw xmlError('Each Event needs a System element.',event.line);
    const eventId = one(system,'EventID');
    if (!eventId || !/^\d{1,6}$/.test(content(eventId).trim())) throw xmlError('Missing or invalid System/EventID.',event.line);
    const provider = one(system,'Provider'), time = one(system,'TimeCreated');
    const fields = [['Event ID',content(eventId).trim()],['Date and Time',time?.attrs.SystemTime || ''],
      ['Source',provider?.attrs.Name || ''],['Computer',content(one(system,'Computer'))],
      ['Level',content(one(system,'Level'))],['Task Category',content(one(system,'Task'))],
      ['Keywords',content(one(system,'Keywords'))],['Channel',content(one(system,'Channel'))],
      ['EventRecordID',content(one(system,'EventRecordID'))],['User',one(system,'Security')?.attrs.UserID || '']];
    const used = new Set([...fields.map(([name])=>keyName(name)),'message','originaleventxml']);
    const add = (name,value) => {
      if (used.has(keyName(name))) throw xmlError('Ambiguous or reserved event-data field: ' + name + '.',event.line);
      used.add(keyName(name)); fields.push([name,value]);
    };
    const data = one(event,'EventData'), user = one(event,'UserData');
    if (data && user) throw xmlError('EventData and UserData cannot both describe one Event.',event.line);
    if (data) {
      let unnamed = 0;
      for (const child of data.children) if (child.local === 'Data' && child.uri === data.uri) add(child.attrs.Name || 'UnnamedData' + (++unnamed),content(child));
    }
    const leaves = node => { for (const child of node.children) { if (child.children.length) leaves(child); else add(child.local,content(child)); } };
    if (user) leaves(user);
    const rendering = one(event,'RenderingInfo');
    fields.push(['Message',content(rendering && one(rendering,'Message'))],['Original Event XML',original]);
    return {fields,line:event.line,record};
  }
  function parseWindowsXml(text) {
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/u.test(text))throw xmlError('Invalid XML character.',1);
    const records = [], stack = []; let i = 0, line = 1, roots = 0, rootName = '';
    const advance = end => { line += (text.slice(i,end).match(/\r\n|\r|\n/g) || []).length; i = end; };
    const append = (value,decode = true) => {
      if (!stack.length) { if (value.trim()) throw xmlError('Text outside the root element.',line); return; }
      if(stack.length===1&&stack[0].local==='Events'&&value.trim())throw xmlError('Unexpected text inside Events.',line);
      stack.at(-1).parts.push(decode ? xmlText(value,line) : value.replace(/\r\n?/g,'\n'));
    };
    while (i < text.length) {
      if (text[i] !== '<') { const end = text.indexOf('<',i); const stop = end < 0 ? text.length : end; const value=text.slice(i,stop);if(value.includes(']]>'))throw xmlError('Unexpected CDATA terminator.',line);append(value);advance(stop);continue; }
      if (text.startsWith('<!--',i)) { const end=text.indexOf('-->',i+4);if(end<0||text.slice(i+4,end).includes('--'))throw xmlError('Malformed comment.',line);advance(end+3);continue; }
      if (text.startsWith('<![CDATA[',i)) { const end=text.indexOf(']]>',i+9);if(end<0||!stack.length)throw xmlError('Malformed CDATA section.',line);append(text.slice(i+9,end),false);advance(end+3);continue; }
      if (text.startsWith('<?',i)) { const end=text.indexOf('?>',i+2);if(end<0||!/^<\?xml\s/.test(text.slice(i))||text.slice(0,i).trim())throw xmlError('Only an initial XML declaration is supported.',line);advance(end+2);continue; }
      if (text.startsWith('<!',i)) throw xmlError('DTD, entity declarations, and other declarations are not supported.',line);
      let end=i+1, quote='';
      for (;end<text.length;end++) { const c=text[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break; }
      if (end===text.length) throw xmlError('Unclosed tag.',line);
      const tag=text.slice(i+1,end), closing=tag.startsWith('/');
      if (closing) {
        const name=tag.slice(1).trim();if(!/^[A-Za-z_][\w.:-]*$/.test(name)||!stack.length||stack.at(-1).name!==name)throw xmlError('Mismatched closing tag.',line);
        const node=stack.pop();
        if (node.local==='Event' && (stack.length===0 || stack.length===1&&stack[0].local==='Events')) {
          records.push(xmlRecord(node,text.slice(node.start,end+1),records.length+1));
          if(records.length>MAX_RECORDS)throw xmlError('More than 100,000 events; reduce the collection window.',node.line);
        } else if (stack.length) stack.at(-1).children.push(node);
        advance(end+1);continue;
      }
      const match=tag.match(/^([A-Za-z_][\w.:-]*)([\s\S]*?)\s*(\/)?$/);if(!match)throw xmlError('Invalid element name.',line);
      const name=match[1], attrs=Object.create(null);let rest=match[2];
      while(rest.trim()){
        const attr=rest.match(/^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/);
        if(!attr)throw xmlError('Malformed attribute.',line);if(own(attrs,attr[1]))throw xmlError('Duplicate attribute.',line);
        attrs[attr[1]]=xmlText(attr[2]===undefined?attr[3]:attr[2],line);rest=rest.slice(attr[0].length);
      }
      const ns=Object.assign(Object.create(null),stack.at(-1)?.ns || {});
      for(const [key,value] of Object.entries(attrs)){if(key==='xmlns')ns['']=value;else if(key.startsWith('xmlns:'))ns[key.slice(6)]=value;}
      ns.xml='http://www.w3.org/XML/1998/namespace';
      const pieces=name.split(':');if(pieces.length>2||pieces.length===2&&!ns[pieces[0]])throw xmlError('Undeclared namespace prefix.',line);
      const local=pieces.at(-1), uri=ns[pieces.length===2?pieces[0]:''] || '';
      if(!stack.length){roots++;rootName=local;if(roots>1||!['Event','Events'].includes(local))throw xmlError('Expected one Event or Events root.',line);}
      if(stack.length===1&&rootName==='Events'&&local!=='Event')throw xmlError('Events may contain only Event elements.',line);
      if((local==='Event'&&(stack.length===0||stack.length===1))&&uri&&uri!==EVENT_NS)throw xmlError('Unsupported Event namespace.',line);
      const node={name,local,uri,attrs,ns,children:[],parts:[],start:i,line};
      if(match[3]){if(!stack.length)throw xmlError('An empty event export has no events.',line);stack.at(-1).children.push(node);}
      else {stack.push(node);if(stack.length>MAX_DEPTH)throw xmlError('XML nesting exceeds 48 levels.',line);}
      advance(end+1);
    }
    if(stack.length)throw xmlError('Unclosed element.',line);
    return records;
  }
  function parseJsonRecords(text,lines) {
    let values;
    if(lines) {
      values=[];let line=0;
      for(const source of text.split(/\r\n|\r|\n/)){line++;if(!source.trim())continue;try{values.push({value:parseJsonDocument(source),line});}catch(error){throw new Error('Invalid JSON on line '+line+': '+error.message);}}
    } else {
      let value;try{value=parseJsonDocument(text);}catch(error){throw new Error('Invalid JSON: '+error.message);}
      if(plain(value)&&(value.kind==='fieldnotes-case'||value.schemaVersion&&value.tool))throw new Error('This is a saved case or triage report. Use Reopen a saved case below the event chooser.');
      if(plain(value)&&Array.isArray(value.events))value=value.events;
      values=(Array.isArray(value)?value:[value]).map(value=>({value,line:null}));
    }
    if(values.length>MAX_RECORDS)throw new Error('This export exceeds 100,000 records. Select a smaller collection window.');
    return values.map(({value,line},index)=>{
      if(!plain(value))throw new Error('JSON event record '+(index+1)+' must be an object.');
      const lookup=new Map(Object.keys(value).map(key=>[keyName(key),key]));
      if(lookup.size!==Object.keys(value).length)throw new Error('JSON event record '+(index+1)+' has ambiguous field names.');
      const get=(...names)=>{const keys=[...new Set(names.map(name=>lookup.get(keyName(name))).filter(key=>key!==undefined))];
        const available=keys.map(key=>value[key]).filter(item=>item!==null&&item!==undefined&&item!=='');
        if(new Set(available.map(stringValue)).size>1)throw new Error('Ambiguous metadata in JSON event record '+(index+1)+'.');
        return available[0]??'';};
      let time=get('Date and Time','TimeCreated','Timestamp','SystemTime','Date');
      const dotnet=typeof time==='string'&&time.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/);
      if(dotnet){const date=new Date(Number(dotnet[1]));if(Number.isNaN(date.getTime()))throw new Error('Invalid .NET date in JSON event record '+(index+1)+'.');time=date.toISOString();}
      const fields=[['Event ID',get('Event ID','EventId','Id')],['Date and Time',time],['Source',get('Source','ProviderName','Provider')],
        ['Computer',get('Computer','MachineName','ComputerName','HostName')],['Level',get('LevelDisplayName','Level','Severity')],
        ['Task Category',get('TaskDisplayName','TaskCategory','Task')],['User',get('User','UserId')],['Message',get('Message','Description')]];
      const used=new Set([...fields.map(([key])=>keyName(key)),'originaljsonrecord']);
      const reserved=new Set(['eventid','id','dateandtime','timecreated','timestamp','systemtime','date','source','providername','provider','computer','machinename','computername','hostname','leveldisplayname','level','severity','taskdisplayname','taskcategory','task','user','userid','message','description']);
      for(const [key,entry] of Object.entries(value)){
        if(['eventdata','userdata'].includes(keyName(key))&&plain(entry)) {
          for(const [name,item] of Object.entries(entry)){if(used.has(keyName(name)))throw new Error('Ambiguous JSON event-data field: '+name+'.');used.add(keyName(name));fields.push([name,item]);}
        } else if(!reserved.has(keyName(key))&&!['eventdata','userdata'].includes(keyName(key))) {if(used.has(keyName(key)))throw new Error('Ambiguous JSON event field.');used.add(keyName(key));fields.push([key,entry]);}
      }
      fields.push(['Original JSON record',JSON.stringify(value)]);
      return {fields,line,record:index+1};
    });
  }
  function parseJsonDocument(text){
    const value=JSON.parse(text),stack=[];
    for(let i=0;i<text.length;i++){
      const char=text[i];
      if(char==='"'){
        const start=i;for(i++;i<text.length;i++){if(text[i]==='\\')i++;else if(text[i]==='"')break;}
        let next=i+1;while(/\s/.test(text[next]||'')&&next<text.length)next++;
        if(text[next]===':'){const key=JSON.parse(text.slice(start,i+1)),keys=stack.at(-1);if(keys?.has(key))throw new Error('Duplicate JSON field: '+key+'.');keys?.add(key);}
      }else if(char==='{'||char==='['){stack.push(char==='{'?new Set():null);if(stack.length>MAX_DEPTH)throw new Error('JSON nesting exceeds 48 levels.');}
      else if(char==='}'||char===']')stack.pop();
      else if(char==='-'||/[0-9]/.test(char)){
        const token=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)[0],number=Number(token);
        if(!Number.isFinite(number)||Number.isInteger(number)&&!Number.isSafeInteger(number))throw new Error('Store large integer identifiers as JSON strings; this number cannot be represented safely.');
        i+=token.length-1;
      }
    }
    return value;
  }
  function parseInput(text,format='csv') {
    if(typeof text!=='string')throw new TypeError('Event input must be text.');
    text=text.replace(/^\uFEFF/,'');
    if(format==='ndjson')format='jsonl';
    let result,records;
    if(format==='csv') {
      const rows=analysis.parseCsv(text);
      if(rows.length-1>MAX_RECORDS)throw new Error('This export exceeds 100,000 source records, including skipped Event IDs.');
      result=analysis.normalizeEvents(rows);
    }
    else {
      records=format==='xml'?parseWindowsXml(text):['json','jsonl'].includes(format)?parseJsonRecords(text,format==='jsonl'):null;
      if(!records)throw new Error('Unsupported event input format.');
      result=analysis.normalizeEvents(rowsFromRecords(records));
    }
    if(result.events.length>MAX_RECORDS)throw new Error('This export exceeds 100,000 records. Select a smaller collection window.');
    for(const event of result.events){
      event.inputFormat=format;
      event.sourceLine=format==='json'?null:event.sourceLine;
    }
    result.format=format;result.diagnostics.format=format;
    return result;
  }
  const api=Object.freeze({EXTENSIONS,MAX_RECORDS,formatForName,readFileText,decodeFileBytes,parseJsonDocument,parseInput});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EventTriageInputs=api;
})(typeof window!=='undefined'?window:globalThis);
