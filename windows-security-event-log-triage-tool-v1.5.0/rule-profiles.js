/* Validated data-only tuning profiles; conditions stay in the analysis engine. */
(function exposeProfiles(root){
  'use strict';
  const catalog=typeof module!=='undefined'&&module.exports?require('./rules.generated.js'):root.EventTriageRuleCatalog;
  const definitions=Object.fromEntries(catalog.rules.map(rule=>[rule.id,rule]));
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const allowed=(value,keys,label)=>{for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(label+' has an unknown field: '+key+'.');};
  const defaultProfile=Object.freeze({schemaVersion:'1.0',id:'default',version:catalog.version,rules:Object.freeze({})});
  function normalizeProfile(input=defaultProfile){
    if(!plain(input))throw new Error('Rule profile must be a JSON object.');
    allowed(input,['schemaVersion','id','version','rules'],'Rule profile');
    if(input.schemaVersion!=='1.0')throw new Error('Unsupported rule-profile schemaVersion. Expected 1.0.');
    for(const key of ['id','version'])if(typeof input[key]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(input[key]))throw new Error('Rule profile '+key+' must be 1–80 letters, digits, dots, hyphens, or underscores.');
    if(!plain(input.rules))throw new Error('Rule profile rules must be an object keyed by known rule IDs.');
    const rules=Object.create(null);
    for(const id of Object.keys(input.rules).sort()){
      if(!Object.prototype.hasOwnProperty.call(definitions,id))throw new Error('Unknown rule ID: '+id+'.');
      const setting=input.rules[id];if(!plain(setting))throw new Error(id+' must contain rule settings.');
      allowed(setting,['enabled','points'],id);
      if('enabled' in setting&&typeof setting.enabled!=='boolean')throw new Error(id+' enabled must be true or false.');
      if('points' in setting&&(!Array.isArray(setting.points)||setting.points.length!==definitions[id].breakdown.length||setting.points.some(point=>!Number.isInteger(point)||point<0||point>100)))throw new Error(id+' points must match its contribution count and contain integers from 0 to 100.');
      rules[id]={enabled:setting.enabled!==false};if(setting.points)rules[id].points=[...setting.points];
      Object.freeze(rules[id].points);Object.freeze(rules[id]);
    }
    return Object.freeze({schemaVersion:'1.0',id:input.id,version:input.version,rules:Object.freeze(rules)});
  }
  function effectiveRules(profile=defaultProfile){
    const normalized=normalizeProfile(profile);
    return Object.freeze(Object.fromEntries(catalog.rules.map(rule=>{const setting=normalized.rules[rule.id];return [rule.id,Object.freeze({...rule,enabled:setting?.enabled!==false,
      breakdown:Object.freeze(rule.breakdown.map((item,index)=>Object.freeze({...item,points:setting?.points?.[index]??item.points})))})];})));
  }
  const api=Object.freeze({catalog,defaultProfile,normalizeProfile,effectiveRules});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EventTriageProfiles=api;
})(typeof window!=='undefined'?window:globalThis);
