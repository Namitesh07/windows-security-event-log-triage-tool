/* Local multi-file collections. Original records are retained; only confirmed overlaps are excluded from rules. */
(function exposeCollection(root) {
  'use strict';
  const common = typeof module !== 'undefined' && module.exports;
  const inputs = common ? require('./inputs.js') : root.EventTriageInputs;
  const MAX_FILES = 20, MAX_BYTES = 25 * 1024 * 1024;
  const countKeys = ['rowsRead','rowsParsed','rowsSkipped','invalidTimestamps','ambiguousTimestamps','missingTimestamps'];
  const rowKeys = ['blankEventIdRows','invalidEventIdRows','invalidTimestampRows','ambiguousTimestampRows','missingTimestampRows'];
  const lower = value => String(value || '').trim().toLowerCase();
  async function fingerprintBytes(bytes, subtle = root.crypto?.subtle) {
    if (!subtle || typeof subtle.digest !== 'function') return null;
    try {
      const digest = await subtle.digest('SHA-256',bytes);
      if (digest.byteLength !== 32) return null;
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
    } catch { return null; }
  }

  function validateFiles(files) {
    if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) throw new Error('Choose between 1 and 20 event files.');
    let bytes = 0;
    for (const entry of files) {
      const name = entry.name || entry.file?.name;
      if (typeof name !== 'string' || !name || name.length > 512) throw new Error('An event filename must contain 1–512 characters.');
      inputs.formatForName(name);
      const size = entry.file?.size ?? entry.bytes ?? (typeof entry.text === 'string' ? new TextEncoder().encode(entry.text).length : 0);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid event file size.');
      bytes += size;
    }
    if (bytes > MAX_BYTES) throw new Error('The selected files exceed 25 MB combined. Export a smaller collection window.');
    return bytes;
  }
  function recordIdentity(event) {
    // A Windows record number is meaningful only in its host/channel, and can be reused after clearing.
    // Require a provider and usable timestamp too; never merge by account/message alone.
    if (!event.computer || !event.channel || !event.source || !/^[0-9]{1,80}$/.test(event.eventRecordId || '') || !/[1-9]/.test(event.eventRecordId) ||
        event.timestampStatus !== 'valid' || !event.hasTime) return '';
    return JSON.stringify([lower(event.computer),lower(event.channel),lower(event.source),event.eventRecordId.replace(/^0+/,''),event.id,event.timeText]);
  }
  function evidenceKey(event) {
    const identity = recordIdentity(event);
    if (!identity) return '';
    const fields = event.rawFields.filter(field => field.value !== '')
      .map(field => [field.header,field.value]).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
    return identity + JSON.stringify(fields);
  }
  function markDuplicates(events) {
    const groups = new Map(), ordinals = new Map();
    let duplicateEvents = 0, uncomparableEvents = 0;
    for (const event of [...events].sort((a,b) => a.index - b.index)) {
      delete event.duplicateOf;
      const key = event.sourceId ? evidenceKey(event) : '';
      if (!key) { uncomparableEvents += 1; continue; }
      if (!ordinals.has(event.sourceId)) ordinals.set(event.sourceId,new Map());
      const counts = ordinals.get(event.sourceId), position = counts.get(key) || 0;
      counts.set(key,position + 1);
      if (!groups.has(key)) groups.set(key,[]);
      const slots = groups.get(key);
      if (!slots[position]) slots[position] = event;
      else if (slots[position].sourceId !== event.sourceId) { event.duplicateOf = slots[position].uid; duplicateEvents += 1; }
    }
    return { duplicateEvents, uniqueEvents:events.length - duplicateEvents, uncomparableEvents };
  }
  async function parseFiles(files, progress = () => {}, active = () => true) {
    const bytes = validateFiles(files), events = [], sources = [], perFile = [];
    let decodedBytes = 0, recordsRead = 0;
    for (let index = 0; index < files.length; index += 1) {
      const entry = files[index], name = entry.name || entry.file.name, format = inputs.formatForName(name);
      progress('Reading file '+(index+1)+' of '+files.length+': '+name);
      try {
        let text, fingerprint = null;
        let fingerprintUnavailable = 'original-bytes-unavailable';
        if (entry.file && typeof entry.file.arrayBuffer === 'function') {
          const original = new Uint8Array(await entry.file.arrayBuffer());
          if (!active()) throw Object.assign(new Error('Operation cancelled.'),{name:'AbortError'});
          if (original.byteLength > MAX_BYTES || original.byteLength !== entry.file.size) throw new Error('Source file size changed or exceeds 25 MB.');
          text = inputs.decodeFileBytes(original);
          progress('Calculating source SHA-256: '+name);
          const hex = await fingerprintBytes(original);
          if (hex) { fingerprint = {algorithm:'SHA-256',hex,byteLength:original.byteLength,basis:'original-file-bytes',verification:'computed-at-import'}; fingerprintUnavailable = null; }
          else fingerprintUnavailable = 'web-crypto-unavailable';
        } else text = entry.file ? await inputs.readFileText(entry.file) : entry.text;
        if (!active()) throw Object.assign(new Error('Operation cancelled.'),{name:'AbortError'});
        if (typeof text !== 'string') throw new Error('Event input must be text.');
        decodedBytes += new TextEncoder().encode(text).length;
        if (decodedBytes > MAX_BYTES) throw new Error('Decoded event text exceeds 25 MB combined.');
        const parsed = inputs.parseInput(text,format);
        recordsRead += parsed.diagnostics.rowsRead;
        if (recordsRead > inputs.MAX_RECORDS) throw new Error('The collection exceeds 100,000 source records, including skipped and duplicate records.');
        const id = 'source-'+(index+1);
        const sizeBytes = entry.file?.size ?? entry.bytes ?? new TextEncoder().encode(text).length;
        const modified = entry.lastModified ?? (entry.file?.lastModified ? new Date(entry.file.lastModified).toISOString() : null);
        sources.push({id,name,format,sizeBytes,lastModified:modified,loadedAt:new Date().toISOString(),fingerprint,fingerprintUnavailable});
        perFile.push({sourceId:id,...parsed.diagnostics});
        for (const event of parsed.events) {
          event.index = events.length+1; event.uid = 'event-'+event.index;
          event.sourceId = id; event.sourceName = name; events.push(event);
        }
      } catch (error) { if (error.name === 'AbortError') throw error; throw new Error(name+': '+error.message); }
    }
    progress('Checking overlapping records…');
    const duplicates = markDuplicates(events), diagnostics = {files:perFile,...duplicates};
    for (const key of countKeys) diagnostics[key] = perFile.reduce((sum,file) => sum+(file[key] || 0),0);
    for (const key of rowKeys) diagnostics[key] = perFile.flatMap(file => file[key] || []);
    const format = sources.length === 1 ? sources[0].format : 'mixed'; diagnostics.format = format;
    return { events,diagnostics,format,source:{name:sources.length === 1 ? sources[0].name : sources.length+' event exports',format,
      kind:'event collection',sizeBytes:bytes,lastModified:sources.length === 1 ? sources[0].lastModified : null,loadedAt:new Date().toISOString(),files:sources} };
  }
  const api = Object.freeze({MAX_FILES,MAX_BYTES,validateFiles,recordIdentity,markDuplicates,fingerprintBytes,parseFiles});
  if (common) module.exports = api;
  if (root) root.EventTriageCollection = api;
})(typeof window !== 'undefined' ? window : globalThis);
