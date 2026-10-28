/* Pure CSV and event-analysis logic shared by the browser app and Node tests. */
(function exposeEventTriageAnalysis(root) {
  'use strict';

  function csvError(message, line, column) {
    return new Error(message + ' (row ' + line + ', column ' + column + ').');
  }

  function parseCsv(text) {
    if (typeof text !== 'string') throw new TypeError('CSV input must be text.');
    const input = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let quoteClosed = false;
    let line = 1;
    let rowLine = 1;
    let column = 1;

    const finishField = () => {
      row.push(field);
      field = '';
      quoteClosed = false;
    };
    const finishRow = () => {
      finishField();
      if (row.some(value => value.trim())) {
        Object.defineProperty(row, 'lineNumber', { value: rowLine, enumerable: false });
        rows.push(row);
      }
      row = [];
      line += 1;
      rowLine = line;
      column = 1;
    };

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') {
          field += '"';
          i += 1;
          column += 2;
        } else if (char === '"') {
          quoted = false;
          quoteClosed = true;
          column += 1;
        } else {
          field += char;
          if (char === '\n') {
            line += 1;
            column = 1;
          } else if (char === '\r') {
            if (input[i + 1] === '\n') {
              field += '\n';
              i += 1;
            }
            line += 1;
            column = 1;
          } else {
            column += 1;
          }
        }
        continue;
      }

      if (quoteClosed) {
        if (char === ',') {
          finishField();
          column += 1;
        } else if (char === '\n' || char === '\r') {
          if (char === '\r' && input[i + 1] === '\n') i += 1;
          finishRow();
        } else if (char === ' ' || char === '\t') {
          column += 1;
        } else {
          throw csvError('Unexpected character after a closing quote', rowLine, row.length + 1);
        }
        continue;
      }

      if (char === '"') {
        if (field.trim()) throw csvError('Unexpected quote inside an unquoted field', rowLine, row.length + 1);
        field = '';
        quoted = true;
        column += 1;
      } else if (char === ',') {
        finishField();
        column += 1;
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && input[i + 1] === '\n') i += 1;
        finishRow();
      } else {
        field += char;
        column += 1;
      }
    }

    if (quoted) throw csvError('The CSV has an unclosed quoted field', rowLine, row.length + 1);
    row.push(field);
    if (row.some(value => value.trim())) {
      Object.defineProperty(row, 'lineNumber', { value: rowLine, enumerable: false });
      rows.push(row);
    }
    if (rows.length < 2) throw new Error('This CSV needs a header row and at least one event record.');
    return rows;
  }

  const normalizeHeader = value => String(value).replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    id: ['eventid', 'eventidentifier', 'id'],
    time: ['dateandtime', 'datetime', 'timecreated', 'timestamp', 'date', 'systemtime'],
    level: ['level', 'severity'],
    source: ['source', 'provider', 'eventsource'],
    task: ['taskcategory', 'task'],
    user: ['user', 'username', 'account', 'accountname'],
    computer: ['computer', 'hostname', 'computername', 'workstation'],
    keywords: ['keywords', 'keyword'],
    message: ['message', 'description', 'eventmessage', 'details']
  };

  function mapHeaders(headers) {
    const map = {};
    headers.forEach((header, index) => {
      const normalized = normalizeHeader(header);
      for (const [key, values] of Object.entries(aliases)) {
        if (values.includes(normalized) && map[key] === undefined) map[key] = index;
      }
    });
    if (map.id === undefined) {
      throw new Error('Could not find an Event ID column. Expected a header such as “Event ID”, “EventID”, or “event_id”.');
    }
    return map;
  }

  function pick(row, index) {
    return index === undefined ? '' : String(row[index] ?? '').trim();
  }

  function firstMatch(text, patterns) {
    for (const pattern of patterns) {
      const match = String(text).match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value && value !== '-') return value;
      }
    }
    return '';
  }

  function validLocalDate(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(hour, minute, second, millisecond);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
        date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) return null;
    return date;
  }

  function parseTimestamp(value) {
    const text = String(value ?? '').trim();
    if (!text) return { date: null, status: 'missing' };

    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i);
    if (iso) {
      if (iso[8]) {
        const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
        const hour = Number(iso[4] || 0), minute = Number(iso[5] || 0), second = Number(iso[6] || 0);
        if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return { date: null, status: 'unrecognized' };
        const date = new Date(text.replace(' ', 'T').replace(/(\.\d{3})\d+(?=Z|[+-]\d)/i,'$1'));
        return Number.isNaN(date.getTime()) ? { date: null, status: 'unrecognized' } : { date, status: 'valid' };
      }
      const fraction = (iso[7] || '').slice(0,3).padEnd(3, '0');
      const date = validLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] || 0),
        Number(iso[5] || 0), Number(iso[6] || 0), Number(fraction || 0));
      return date ? { date, status: 'valid' } : { date: null, status: 'unrecognized' };
    }

    const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
    if (slash) {
      const first = Number(slash[1]);
      const second = Number(slash[2]);
      let month;
      let day;
      if (first > 12 && second <= 12) {
        day = first;
        month = second;
      } else if (second > 12 && first <= 12) {
        month = first;
        day = second;
      } else if (first === second) {
        month = first;
        day = second;
      } else {
        return { date: null, status: 'ambiguous' };
      }
      let hour = Number(slash[4] || 0);
      const minute = Number(slash[5] || 0);
      const secondPart = Number(slash[6] || 0);
      const meridiem = (slash[7] || '').toUpperCase();
      if (meridiem) {
        if (hour < 1 || hour > 12) return { date: null, status: 'unrecognized' };
        hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
      }
      const date = validLocalDate(Number(slash[3]), month, day, hour, minute, secondPart);
      return date ? { date, status: 'valid' } : { date: null, status: 'unrecognized' };
    }

    if (/[A-Za-z]{3,}/.test(text)) {
      const milliseconds = Date.parse(text);
      if (!Number.isNaN(milliseconds)) return { date: new Date(milliseconds), status: 'valid' };
    }
    return { date: null, status: 'unrecognized' };
  }

  const DEFAULT_SETTINGS = Object.freeze({ failureThreshold: 5, authWindowMinutes: 10, sprayAccountThreshold: 5, accountWindowMinutes: 30 });
  const severityOrder = Object.freeze({ High: 0, Medium: 1, Low: 2, Informational: 3 });
  const logonTypes = Object.freeze({
    '2': 'Interactive', '3': 'Network', '4': 'Batch', '5': 'Service', '7': 'Unlock',
    '8': 'NetworkCleartext', '9': 'NewCredentials', '10': 'RemoteInteractive',
    '11': 'CachedInteractive', '12': 'CachedRemoteInteractive', '13': 'CachedUnlock'
  });
  const eventCatalog = Object.freeze({
    '4624': { label: 'Successful logon', audit: 'Audit Logon (Success)', channel: 'Security', fields: 'Target account/domain, reporting host, source IP, logon type, timestamp' },
    '4625': { label: 'Failed logon', audit: 'Audit Logon (Failure)', channel: 'Security', fields: 'Target account/domain, reporting host, source IP, logon type, timestamp' },
    '4648': { label: 'Explicit credentials used for a logon attempt', audit: 'Audit Logon (Success)', channel: 'Security', fields: 'Subject, account whose credentials were used, target server, process' },
    '4740': { label: 'User account locked out', audit: 'Audit User Account Management (Success)', channel: 'Security', fields: 'Locked account, caller computer, subject' },
    '4688': { label: 'Process created', audit: 'Audit Process Creation (Success); enable Include command line in process creation events for command-line cues', channel: 'Security', fields: 'New process path, creator process path, command line' },
    '4720': { label: 'User account created', audit: 'Audit User Account Management (Success)', channel: 'Security', fields: 'New account/domain or SID, subject, reporting host, timestamp' },
    '4726': { label: 'User account deleted', audit: 'Audit User Account Management (Success)', channel: 'Security', fields: 'Deleted account, subject' },
    '4728': { label: 'Added to global security group', audit: 'Audit Security Group Management (Success)', channel: 'Security', fields: 'Member name/domain or SID, group name/SID, subject, reporting host, timestamp' },
    '4732': { label: 'Added to local security group', audit: 'Audit Security Group Management (Success)', channel: 'Security', fields: 'Member name/domain or SID, group name/SID, subject, reporting host, timestamp' },
    '4698': { label: 'Scheduled task created', audit: 'Audit Other Object Access Events (Success)', channel: 'Security', fields: 'Task name/content, subject' },
    '4702': { label: 'Scheduled task updated', audit: 'Audit Other Object Access Events (Success)', channel: 'Security', fields: 'Task name/content, subject' },
    '4699': { label: 'Scheduled task deleted', audit: 'Audit Other Object Access Events (Success)', channel: 'Security', fields: 'Task name, subject' },
    '4719': { label: 'System audit policy changed', audit: 'Audit Audit Policy Change; Windows records this event even when that subcategory is disabled', channel: 'Security', fields: 'Subject, subcategory, audit policy changes' },
    '4946': { label: 'Windows Firewall rule added', audit: 'Audit MPSSVC Rule-Level Policy Change (Success)', channel: 'Security', fields: 'Rule name/ID, profile' },
    '4947': { label: 'Windows Firewall rule modified', audit: 'Audit MPSSVC Rule-Level Policy Change (Success)', channel: 'Security', fields: 'Rule name/ID, profile' },
    '4948': { label: 'Windows Firewall rule deleted', audit: 'Audit MPSSVC Rule-Level Policy Change (Success)', channel: 'Security', fields: 'Rule name/ID, profile' },
    '4950': { label: 'Windows Firewall setting changed', audit: 'Audit MPSSVC Rule-Level Policy Change (Success)', channel: 'Security', fields: 'Setting type/value, profile' },
    '1102': { label: 'Security audit log cleared', audit: 'Event Log service records Security log clearing', channel: 'Security', fields: 'Subject, reporting host, timestamp' },
    '4104': { label: 'PowerShell script block logged', audit: 'Enable PowerShell Script Block Logging', channel: 'Microsoft-Windows-PowerShell/Operational (or PowerShellCore/Operational)', fields: 'Script block text/ID, fragment number/total, reporting host' },
    '7045': { label: 'Windows service installed', audit: 'Service Control Manager service-installation logging', channel: 'System', fields: 'Service name, image path, account, reporting host' }
  });
  const labelById = Object.freeze(Object.fromEntries(Object.entries(eventCatalog).map(([id, value]) => [id, value.label])));
  const clean = value => {
    const text = String(value ?? '').trim();
    return /^(?:-|N\/A|NULL|S-1-0-0)$/i.test(text) ? '' : text;
  };
  const lower = value => clean(value).toLowerCase();
  const isSid = value => /^S-\d-(?:\d+-)+\d+$/i.test(value);
  function splitAccount(value, domain = '') {
    const text = clean(value);
    const slash = text.lastIndexOf('\\');
    if (slash >= 0) return { name: text.slice(slash + 1), domain: text.slice(0, slash) || clean(domain) };
    const at = text.indexOf('@');
    if (at > 0) return { name: text.slice(0, at), domain: text.slice(at + 1) };
    return { name: text, domain: clean(domain) };
  }

  // English Event Viewer messages have repeated labels under Subject, Member, Group, etc.
  // Keep those sections separate so the subject is never mistaken for the logon target.
  function messageFields(text) {
    const fields = new Map();
    let section = '', lastKey = '';
    for (const raw of String(text).replace(/\r\n?/g, '\n').split(/\n|;(?=\s*[A-Za-z][A-Za-z0-9 _\/-]{1,89}:(?!\/\/))/)) {
      const line = raw.trim().replace(/^.*?\.\s+(?=[A-Za-z][A-Za-z ]+:)/, '');
      const heading = line.match(/^([A-Za-z][A-Za-z0-9 ()\/_ -]{0,89}):\s*$/);
      if (heading) { section = normalizeHeader(heading[1]); lastKey = ''; continue; }
      const pair = line.match(/^([A-Za-z][A-Za-z0-9 _\/-]{0,89}):[ \t]*(.*)$/);
      if (!pair) {
        if (lastKey && /:(?:taskcontent|taskcontentnew|scriptblocktext)$/.test(lastKey)) fields.set(lastKey, fields.get(lastKey) + '\n' + raw);
        continue;
      }
      const key = section + ':' + normalizeHeader(pair[1]);
      if (!fields.has(key)) fields.set(key, clean(pair[2]));
      lastKey = key;
    }
    return fields;
  }
  function normalizeEvents(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('This CSV needs a header row and at least one event record.');
    const headers = rows[0].map(value => value.trim());
    const map = mapHeaders(headers);
    const columnMap = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
    const events = [];
    const diagnostics = { rowsRead: rows.length - 1, rowsParsed: 0, rowsSkipped: 0, blankEventIdRows: [], invalidEventIdRows: [],
      invalidTimestamps: 0, invalidTimestampRows: [], ambiguousTimestamps: 0, ambiguousTimestampRows: [], missingTimestamps: 0, missingTimestampRows: [] };
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(value => String(value).trim())) continue;
      const lineNumber = row.lineNumber || index + 1;
      if (row.length !== headers.length) throw new Error('CSV record has ' + (row.length < headers.length ? 'too few' : 'too many') + ' columns (row ' + lineNumber + '): expected ' + headers.length + ' columns, found ' + row.length + '.');
      const rawId = pick(row, map.id);
      const idMatch = rawId.match(/^(?:Event\s*(?:ID)?\s*[:=]?\s*)?(\d{1,6})$/i);
      if (!idMatch) {
        diagnostics.rowsSkipped += 1;
        (rawId ? diagnostics.invalidEventIdRows : diagnostics.blankEventIdRows).push(lineNumber);
        continue;
      }
      const id = idMatch[1], message = pick(row, map.message), user = clean(pick(row, map.user)), timeText = pick(row, map.time);
      const fields = messageFields(message);
      const column = names => {
        for (const name of names) {
          const position = columnMap.get(normalizeHeader(name));
          if (position !== undefined && clean(row[position])) return clean(row[position]);
        }
        return '';
      };
      const field = (names, sections = ['']) => {
        for (const section of sections) for (const name of names) {
          const value = fields.get(normalizeHeader(section) + ':' + normalizeHeader(name));
          if (value) return value;
        }
        return '';
      };
      const read = (names, sections = ['']) => {
        const direct = column(names) || field(names, sections);
        if (direct) return direct;
        for (const name of names) for (const [key,value] of fields) if (key.endsWith(':' + normalizeHeader(name)) && value) return value;
        return '';
      };
      const groupChange = ['4728', '4732'].includes(id);
      const targetSections = id === '4648' ? ['Account Whose Credentials Were Used'] :
        id === '4740' ? ['Account That Was Locked Out'] :
        id === '4720' ? ['New Account'] :
        id === '4726' ? ['Target Account'] :
        groupChange ? ['Member'] : ['New Logon', 'Account For Which Logon Failed', 'Target Account'];
      let accountRaw = groupChange ?
        read(['MemberName', 'Member Account Name']) || field(['Account Name'], targetSections) :
        read(['TargetUserName', 'Target Account Name', 'Target User Name', 'New Account Name']) || field(['Account Name'], targetSections);
      const actorRaw = read(['SubjectUserName', 'Subject Account Name', 'Subject User Name', 'CallerUserName']) || field(['Account Name'], ['Subject']) || user;
      if (!accountRaw && !groupChange) accountRaw = field(['Account Name', 'Account']);
      // CSV User is only a logon fallback when the message does not identify a Subject.
      if (!accountRaw && ['4624', '4625'].includes(id) && !field(['Account Name'], ['Subject']) && !read(['SubjectUserName', 'Subject Account Name'])) accountRaw = user;
      let accountDomain = groupChange ? read(['MemberDomainName', 'Member Account Domain']) :
        read(['TargetDomainName', 'Target Account Domain', 'New Account Domain']);
      accountDomain ||= field(['Account Domain'], targetSections);
      let accountSid = groupChange ? read(['MemberSid', 'Member Security ID']) || field(['Security ID'], ['Member']) :
        read(['TargetUserSid', 'TargetSid', 'Target Security ID']) || field(['Security ID'], targetSections);
      if (isSid(accountRaw)) { accountSid ||= accountRaw; accountRaw = ''; }
      if (accountSid && !isSid(accountSid)) { accountRaw ||= accountSid; accountSid = ''; }
      const identity = splitAccount(accountRaw, accountDomain);
      // Do not use the actor's domain for an unrelated target.
      const userIdentity = splitAccount(user);
      if (!identity.domain && ['4624', '4625'].includes(id) && lower(userIdentity.name) === lower(identity.name)) identity.domain = userIdentity.domain;
      const actor = splitAccount(actorRaw, read(['SubjectDomainName', 'Subject Account Domain']) || field(['Account Domain'], ['Subject']));
      const group = groupChange ? read(['Group Name', 'Target Group Name', 'TargetUserName']) || field(['Group Name', 'Account Name'], ['Group']) : read(['Group Name']);
      const groupSid = groupChange ? read(['GroupSid', 'TargetSid', 'TargetUserSid', 'Group Security ID']) || field(['Security ID'], ['Group']) : '';
      const timestamp = parseTimestamp(timeText);
      const timestampKey = timestamp.status === 'ambiguous' ? 'ambiguous' : timestamp.status === 'unrecognized' ? 'invalid' : timestamp.status === 'missing' ? 'missing' : '';
      if (timestampKey) { diagnostics[timestampKey + 'Timestamps'] += 1; diagnostics[timestampKey + 'TimestampRows'].push(lineNumber); }
      const uid = 'event-' + (events.length + 1);
      events.push({
        uid, id, index: events.length + 1, lineNumber, timeText, date: timestamp.date, timestampStatus: timestamp.status,
        sourceRecord:row.sourceRecord || index, sourceLine:row.sourceLine === undefined ? lineNumber : row.sourceLine,
        eventRecordId: column(['EventRecordID', 'RecordId', 'Record ID']), channel: column(['Channel', 'LogName', 'Log Name']),
        hasTime: /\d{1,2}:\d{2}/.test(timeText), timeBasis: /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timeText) ? 'offset' : 'local',
        level: pick(row, map.level), source: pick(row, map.source), task: pick(row, map.task), keywords: pick(row, map.keywords),
        user, actor: actorRaw, actorDomain: actor.domain, account: identity.name, targetAccount: identity.name,
        accountDomain: identity.domain, accountSid: isSid(accountSid) ? accountSid : '',
        computer: clean(pick(row, map.computer)), ip: read(['IpAddress', 'Source Network Address', 'Source Address', 'Source IP', 'Client Address', 'Network Address']),
        workstation: read(['WorkstationName', 'Workstation Name', 'Caller Computer Name', 'CallerComputerName']),
        process: read(['NewProcessName', 'New Process Name', 'Process Name', 'Image Path']),
        parent: read(['ParentProcessName', 'Creator Process Name', 'Parent Process Name', 'Parent Image']),
        processId: read(['NewProcessId', 'New Process ID', 'Process ID']),
        command: read(['CommandLine', 'Process Command Line', 'Command Line']),
        logonType: read(['LogonType', 'Logon Type']),
        serviceName: read(['ServiceName', 'Service Name']), servicePath: read(['Service File Name', 'Service Image Path', 'ImagePath']),
        scriptBlockId: read(['ScriptBlockId', 'ScriptBlock ID', 'Script Block ID']),
        scriptText: column(['ScriptBlockText', 'Script Block Text']) || message,
        scriptFragment: read(['MessageNumber', 'Message Number']), scriptFragmentTotal: read(['MessageTotal', 'Message Total']),
        group, groupSid, taskName: read(['TaskName', 'Task Name']), taskContent: read(['TaskContent', 'TaskContentNew', 'Task Content']),
        targetServer: read(['TargetServerName', 'Target Server Name']) || field(['Target Server Name'], ['Target Server']),
        policyChanges: read(['AuditPolicyChanges', 'Audit Policy Changes', 'Changes']), subcategory: read(['SubcategoryGuid', 'Subcategory', 'Subcategory GUID']),
        firewallRule: read(['RuleName', 'Rule Name']), firewallRuleId: read(['RuleId', 'Rule ID']),
        firewallProfile: read(['ProfileChanged', 'Profile Changed', 'Profile']),
        firewallSetting: read(['SettingType', 'Setting Type']), firewallValue: read(['SettingValue', 'Setting Value']),
        message, rawFields: headers.map((header, position) => ({ header, value: String(row[position] ?? '') }))
      });
    }
    if (!events.length) throw new Error('No rows with a readable Event ID were found. Check the Event ID column and the CSV records.');
    diagnostics.rowsParsed = events.length;
    return { events, diagnostics };
  }

  const profiles = typeof module !== 'undefined' && module.exports ? require('./rule-profiles.js') : root.EventTriageProfiles;
  const rules = Object.freeze(profiles.effectiveRules());

  function normalizeSettings(input = {}) {
    const values = typeof input === 'number' ? { failureThreshold: input } : input || {};
    const bounds = { failureThreshold: [2, 100], authWindowMinutes: [1, 1440], sprayAccountThreshold: [2, 100], accountWindowMinutes: [1, 1440] };
    return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => {
      const number = Number(values[key]);
      return [key, Number.isFinite(number) && number > 0 ? Math.min(bounds[key][1], Math.max(bounds[key][0], Math.floor(number))) : value];
    }));
  }
  function severityForScore(score) { return score >= 60 ? 'High' : score >= 30 ? 'Medium' : score > 0 ? 'Low' : 'Informational'; }
  function eventSort(a, b) {
    if (a.date && b.date) return a.date - b.date || a.index - b.index;
    if (a.date) return -1;
    if (b.date) return 1;
    return a.index - b.index;
  }
  function accountDisplay(event) { return (event.accountDomain ? event.accountDomain + '\\' : '') + (event.account || event.accountSid || 'Not identified'); }
  function identityKey(event) {
    if (event.account) return lower(event.accountDomain) + '\\' + lower(event.account);
    return event.accountSid ? lower(event.accountSid) : '';
  }
  function sameIdentity(a, b) {
    if (a.accountSid && b.accountSid && lower(a.accountSid) !== lower(b.accountSid)) return false;
    if (a.accountSid && b.accountSid) return true;
    return Boolean(identityKey(a) && identityKey(a) === identityKey(b));
  }
  function timed(event) { return Boolean(event.date && event.timestampStatus === 'valid' && event.hasTime); }
  function authSource(event) { return lower(event.ip) || lower(event.workstation); }
  function authKey(event) {
    if (!timed(event) || !identityKey(event) || !event.computer || !authSource(event)) return '';
    return [identityKey(event), lower(event.computer), authSource(event), event.timeBasis].join('|');
  }
  function privilegedGroup(event) {
    if (/^(?:Administrators|Domain Admins|Enterprise Admins|Schema Admins|Backup Operators|Account Operators|Server Operators|Print Operators)$/i.test(clean(event.group).replace(/^.*\\/, ''))) return true;
    return /^S-1-5-32-(?:544|548|549|550|551)$/i.test(event.groupSid) || /^S-1-5-21-(?:\d+-){3}(?:512|518|519)$/i.test(event.groupSid);
  }
  function makeFinding(ruleId, events, matchedFields = [], activeRules = rules) {
    const rule = activeRules[ruleId];
    const evidence = [...new Map(events.map(event => [event.uid, event])).values()].sort(eventSort);
    const scoreBreakdown = rule.breakdown.map(item => ({ ...item }));
    const score = scoreBreakdown.reduce((sum, item) => sum + item.points, 0);
    return { id: ruleId + '-' + evidence[0].uid + '-' + evidence.at(-1).uid, ruleId, title: rule.title,
      events: evidence, score, scoreBreakdown, severity: severityForScore(score), why: rule.why, benign: rule.benign, next: rule.next, attack:profiles.attackReferences(ruleId,evidence),
      matchedFields: matchedFields.filter(item => clean(item.value)).map(item => ({ label: item.label, value: String(item.value) })) };
  }
  function groupsBy(events, keyFn) {
    const groups = new Map();
    for (const event of events) { const key = keyFn(event); if (!key) continue; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(event); }
    return [...groups.values()].map(group => group.sort(eventSort));
  }
  function windows(events, milliseconds, qualifies) {
    const result = [];
    let start = 0, end = 0;
    while (start < events.length) {
      end = Math.max(end, start);
      while (end + 1 < events.length && events[end + 1].date - events[start].date <= milliseconds) end += 1;
      const batch = events.slice(start, end + 1);
      if (qualifies(batch)) { result.push(batch); start = end + 1; } else start += 1;
    }
    return result;
  }
  const matched = (label, value) => ({ label, value });
  function baseMatch(event) {
    return [matched('Event ID', event.id + ' · ' + (labelById[event.id] || 'Other event')), matched('Target account', event.account || event.accountSid ? accountDisplay(event) : ''),
      matched('Actor', event.actor), matched('Reporting host', event.computer)];
  }
  function authMatch(batch, settings) {
    const first = batch[0];
    return [matched('Target account', accountDisplay(first)), matched('Reporting host', first.computer),
      matched(first.ip ? 'Source IP' : 'Source workstation', first.ip || first.workstation),
      matched('Observed logon types', [...new Set(batch.map(event => event.logonType).filter(Boolean))].join(', ')),
      matched('Failure threshold', settings.failureThreshold), matched('Authentication window', settings.authWindowMinutes + ' minutes'),
      matched('Observed span', ((batch.at(-1).date - first.date) / 60000).toFixed(2) + ' minutes')];
  }
  function analyze(events, input = {}, profile = profiles.defaultProfile) {
    events = events.filter(event => !event.duplicateOf);
    const activeRules = profiles.effectiveRules(profile);
    const findingFor = (id,evidence,fields) => makeFinding(id,evidence,fields,activeRules);
    const settings = normalizeSettings(input), findings = [], authWindow = settings.authWindowMinutes * 60000, linked = new Set();
    for (const group of groupsBy(events.filter(event => ['4624', '4625'].includes(event.id)), authKey)) {
      const failures = group.filter(event => event.id === '4625');
      for (const success of group.filter(event => event.id === '4624')) {
        const candidates = failures.filter(event => !linked.has(event.uid) && eventSort(event, success) < 0 && success.date - event.date <= authWindow &&
          sameIdentity(event, success) && (!event.logonType || !success.logonType || event.logonType === success.logonType));
        if (candidates.length >= settings.failureThreshold && activeRules.AUTH_SUCCESS_AFTER_FAILURES.enabled) {
          candidates.forEach(event => linked.add(event.uid));
          findings.push(findingFor('AUTH_SUCCESS_AFTER_FAILURES', [...candidates, success], authMatch([...candidates, success], settings)));
        }
      }
      for (const identityFailures of groupsBy(failures.filter(event => !linked.has(event.uid)), event => event.accountSid || 'unknown-sid')) {
        for (const batch of windows(identityFailures, authWindow, batch => batch.length >= settings.failureThreshold)) findings.push(findingFor('AUTH_FAILURE_BURST', batch, authMatch(batch, settings)));
      }
    }
    const sprayEvents = events.filter(event => event.id === '4625' && timed(event) && event.computer && event.ip && identityKey(event));
    for (const group of groupsBy(sprayEvents, event => [lower(event.ip), lower(event.computer), event.timeBasis].join('|'))) {
      for (const batch of windows(group, authWindow, batch => new Set(batch.map(identityKey)).size >= settings.sprayAccountThreshold)) {
        findings.push(findingFor('AUTH_PASSWORD_SPRAY', batch, [matched('Source IP', batch[0].ip), matched('Reporting host', batch[0].computer),
          matched('Distinct target accounts', new Set(batch.map(identityKey)).size), matched('Account threshold', settings.sprayAccountThreshold),
          matched('Authentication window', settings.authWindowMinutes + ' minutes')]));
      }
    }

    const linkedAccounts = new Set(), linkedAdditions = new Set();
    const creations = events.filter(event => event.id === '4720' && timed(event) && event.computer && identityKey(event));
    for (const addition of events.filter(event => ['4728', '4732'].includes(event.id) && timed(event) && event.computer)) {
      const created = creations.filter(event => lower(event.computer) === lower(addition.computer) && event.timeBasis === addition.timeBasis &&
        sameIdentity(event, addition) && eventSort(event, addition) < 0 && addition.date - event.date <= settings.accountWindowMinutes * 60000).sort(eventSort).at(-1);
      if (!created) continue;
      const sequenceRule = privilegedGroup(addition) ? 'ACCOUNT_CREATED_PRIVILEGED_GROUP' : 'ACCOUNT_CREATED_GROUP';
      if (!activeRules[sequenceRule].enabled) continue;
      linkedAccounts.add(created.uid); linkedAdditions.add(addition.uid);
      findings.push(findingFor(privilegedGroup(addition) ? 'ACCOUNT_CREATED_PRIVILEGED_GROUP' : 'ACCOUNT_CREATED_GROUP', [created, addition],
        [...baseMatch(addition), matched('Group', addition.group || addition.groupSid), matched('Group SID', addition.groupSid), matched('Identity matched by', created.accountSid && addition.accountSid ? 'SID' : 'Account name and domain (including an absent domain)'),
          matched('Account correlation window', settings.accountWindowMinutes + ' minutes'), matched('Observed span', ((addition.date - created.date) / 60000).toFixed(2) + ' minutes')]));
    }

    const singleRules = { '1102': 'AUDIT_LOG_CLEARED', '7045': 'SERVICE_INSTALLED', '4726': 'ACCOUNT_DELETED', '4740': 'ACCOUNT_LOCKED',
      '4648': 'EXPLICIT_CREDENTIALS', '4698': 'TASK_CREATED', '4702': 'TASK_UPDATED', '4699': 'TASK_DELETED', '4719': 'AUDIT_POLICY_CHANGED',
      '4946': 'FIREWALL_RULE_CHANGED', '4947': 'FIREWALL_RULE_CHANGED', '4948': 'FIREWALL_RULE_CHANGED', '4950': 'FIREWALL_SETTING_CHANGED' };
    for (const event of events) {
      let ruleId = singleRules[event.id];
      if (event.id === '4720' && !linkedAccounts.has(event.uid)) ruleId = 'ACCOUNT_CREATED';
      if (['4728', '4732'].includes(event.id) && !linkedAdditions.has(event.uid)) ruleId = privilegedGroup(event) ? 'PRIVILEGED_GROUP_ADDED' : 'GROUP_ADDED';
      if (ruleId) findings.push(findingFor(ruleId, [event], [...baseMatch(event), matched('Group', event.group || event.groupSid), matched('Group SID', event.groupSid),
        matched('Service', event.serviceName), matched('Service image', event.servicePath), matched('Caller computer', event.workstation),
        matched('Credential target server', event.targetServer), matched('Task name', event.taskName),
        matched('Audit subcategory', event.subcategory), matched('Audit changes', event.policyChanges),
        matched('Firewall rule', event.firewallRule || event.firewallRuleId), matched('Firewall profile', event.firewallProfile),
        matched('Firewall setting', event.firewallSetting), matched('New setting value', event.firewallValue)]));

      const processName = lower(event.process).split(/[\\/]/).at(-1);
      const parentName = lower(event.parent).split(/[\\/]/).at(-1);
      const isPowerShell = event.id === '4104' || (event.id === '4688' && /^(?:powershell|pwsh)(?:\.exe)?$/.test(processName));
      const text = event.id === '4104' ? event.scriptText : event.command;
      if (isPowerShell && text) {
        const encoded = text.match(/(?:^|\s)-(?:encodedcommand|enc|e)(?=\s|:)|\bFromBase64String\s*\(/i);
        const download = text.match(/\b(?:Invoke-WebRequest|Invoke-RestMethod|DownloadString|DownloadFile)\b/i);
        const execute = text.match(/\b(?:Invoke-Expression|IEX)\b/i);
        if (encoded) findings.push(findingFor('PS_ENCODED', [event], [...baseMatch(event), matched('Matched expression', encoded[0].trim()), matched('New process path', event.process), matched('Script block ID', event.scriptBlockId), matched('Command/script field', event.id === '4104' ? 'Script block text' : 'Process command line')]));
        if (download && execute) findings.push(findingFor('PS_DOWNLOAD_EXECUTE', [event], [...baseMatch(event), matched('Download expression', download[0]), matched('Dynamic evaluation expression', execute[0]), matched('New process path', event.process), matched('Script block ID', event.scriptBlockId)]));
      }
      if (event.id === '4688' && /^(?:winword|excel|powerpnt|outlook)\.exe$/.test(parentName) && /^(?:cmd|powershell|pwsh|wscript|cscript|mshta)\.exe$/.test(processName)) {
        findings.push(findingFor('OFFICE_SHELL_CHILD', [event], [...baseMatch(event), matched('Creator process path', event.parent), matched('New process path', event.process)]));
      }
      if (event.id === '4688' && /^(?:mshta|regsvr32)\.exe$/.test(processName)) {
        const remote = event.command.match(processName === 'mshta.exe' ? /https?:\/\/[^\s"']+/i : /\/i:\s*https?:\/\/[^\s"']+/i);
        if (remote) findings.push(findingFor('SCRIPT_HOST_REMOTE', [event], [...baseMatch(event), matched('New process path', event.process), matched('Remote resource argument', remote[0])]));
      }
    }
    return findings.filter(finding => activeRules[finding.ruleId].enabled).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.score - a.score || a.id.localeCompare(b.id));
  }
  function correlationCoverage(events) {
    events = events.filter(event => !event.duplicateOf);
    const authentication = events.filter(event => ['4624', '4625'].includes(event.id));
    const accounts = events.filter(event => ['4720', '4728', '4732'].includes(event.id));
    return {
      authenticationExcluded: authentication.filter(event => !authKey(event)).length,
      accountChangesExcluded: accounts.filter(event => !timed(event) || !event.computer || !identityKey(event)).length,
      incompleteScripts: events.filter(event => event.id === '4104' && Number(event.scriptFragmentTotal) > 1).length
    };
  }
  function ruleCoverage(events, findings = [], profile = profiles.defaultProfile, input = {}) {
    const settings = normalizeSettings(input), activeRules = profiles.effectiveRules(profile);
    const unique = events.filter(event => !event.duplicateOf);
    const byId = new Map();
    for (const event of unique) { if (!byId.has(event.id)) byId.set(event.id,[]); byId.get(event.id).push(event); }
    const definitions = {
      AUTH_FAILURE_BURST:['4625'], AUTH_SUCCESS_AFTER_FAILURES:['4625','4624'], AUTH_PASSWORD_SPRAY:['4625'],
      ACCOUNT_CREATED_GROUP:['4720','4728','4732'], ACCOUNT_CREATED_PRIVILEGED_GROUP:['4720','4728','4732'],
      ACCOUNT_CREATED:['4720'], ACCOUNT_DELETED:['4726'], GROUP_ADDED:['4728','4732'], PRIVILEGED_GROUP_ADDED:['4728','4732'],
      AUDIT_LOG_CLEARED:['1102'], SERVICE_INSTALLED:['7045'], PS_ENCODED:['4104','4688'], PS_DOWNLOAD_EXECUTE:['4104','4688'],
      OFFICE_SHELL_CHILD:['4688'], SCRIPT_HOST_REMOTE:['4688'], ACCOUNT_LOCKED:['4740'], EXPLICIT_CREDENTIALS:['4648'],
      TASK_CREATED:['4698'], TASK_UPDATED:['4702'], TASK_DELETED:['4699'], AUDIT_POLICY_CHANGED:['4719'],
      FIREWALL_RULE_CHANGED:['4946','4947','4948'], FIREWALL_SETTING_CHANGED:['4950']
    };
    const contextFields = {SERVICE_INSTALLED:['serviceName','servicePath'],ACCOUNT_CREATED:['account'],ACCOUNT_DELETED:['account'],
      ACCOUNT_LOCKED:['account','workstation'],EXPLICIT_CREDENTIALS:['account','targetServer'],TASK_CREATED:['taskName','taskContent'],
      TASK_UPDATED:['taskName','taskContent'],TASK_DELETED:['taskName'],AUDIT_POLICY_CHANGED:['subcategory','policyChanges'],
      FIREWALL_RULE_CHANGED:['firewallRule','firewallProfile'],FIREWALL_SETTING_CHANGED:['firewallSetting','firewallValue']};
    return Object.entries(activeRules).map(([ruleId,rule]) => {
      const ids = definitions[ruleId], relevant = ids.flatMap(id => byId.get(id) || []), missing = new Map();
      let eligibleEvents = 0;
      const auth = /^AUTH_/.test(ruleId), accountSequence = /^ACCOUNT_CREATED_/.test(ruleId);
      const requirements = auth ? ['Timestamp with a time of day','Target account or SID','Reporting host',ruleId === 'AUTH_PASSWORD_SPRAY' ? 'Source IP' : 'Source IP or workstation'] :
        accountSequence ? ['Timestamp with a time of day','Target/member account or SID','Reporting host'] :
        ruleId.startsWith('PS_') ? ['Script text for 4104; process path and command line for PowerShell 4688'] :
        ruleId === 'OFFICE_SHELL_CHILD' ? ['New process path','Creator process path'] :
        ruleId === 'SCRIPT_HOST_REMOTE' ? ['New process path','Command line for mshta/regsvr32'] :
        ruleId === 'PRIVILEGED_GROUP_ADDED' ? ['Recognised privileged group name or SID'] : ['Event ID (review cue); other fields provide investigation context'];
      for (const event of relevant) {
        const absent = [];
        if (auth || accountSequence) {
          if (!timed(event)) absent.push('Timestamp with a time of day');
          if (!identityKey(event)) absent.push('Target/member account or SID');
          if (!event.computer) absent.push('Reporting host');
          if (auth && !(ruleId === 'AUTH_PASSWORD_SPRAY' ? event.ip : authSource(event))) absent.push(ruleId === 'AUTH_PASSWORD_SPRAY' ? 'Source IP' : 'Source IP or workstation');
        }
        const process = lower(event.process).split(/[\\/]/).at(-1);
        if (ruleId.startsWith('PS_')) {
          if (event.id === '4104' && !event.scriptText) absent.push('Script block text');
          if (event.id === '4688' && !event.process) absent.push('New process path');
          if (event.id === '4688' && /^(?:powershell|pwsh)(?:\.exe)?$/.test(process) && !event.command) absent.push('PowerShell command line');
        }
        if (ruleId === 'OFFICE_SHELL_CHILD') {
          if (!event.process) absent.push('New process path');
          if (!event.parent) absent.push('Creator process path');
        }
        if (ruleId === 'SCRIPT_HOST_REMOTE') {
          if (!event.process) absent.push('New process path');
          if (/^(?:mshta|regsvr32)\.exe$/.test(process) && !event.command) absent.push('Script-host command line');
        }
        if (['PRIVILEGED_GROUP_ADDED','ACCOUNT_CREATED_PRIVILEGED_GROUP'].includes(ruleId) && ['4728','4732'].includes(event.id) && !event.group && !event.groupSid) absent.push('Group name or SID');
        if (!absent.length) eligibleEvents += 1;
        for (const field of absent) {
          if (!missing.has(field)) missing.set(field,{field,events:0,exampleEventUids:[]});
          const detail = missing.get(field); detail.events += 1; if (detail.exampleEventUids.length < 3) detail.exampleEventUids.push(event.uid);
        }
      }
      const missingEventTypes = [];
      if (ruleId === 'AUTH_SUCCESS_AFTER_FAILURES') for (const id of ['4625','4624']) if (!byId.has(id)) missingEventTypes.push(id);
      if (accountSequence) {
        if (!byId.has('4720')) missingEventTypes.push('4720');
        const privileged = ruleId === 'ACCOUNT_CREATED_PRIVILEGED_GROUP';
        if (!relevant.some(event => ['4728','4732'].includes(event.id) && privilegedGroup(event) === privileged)) missingEventTypes.push(privileged ? '4728/4732 with a recognised privileged group' : '4728/4732 without a recognised privileged group');
      }
      const fragments = relevant.filter(event => event.id === '4104' && Number(event.scriptFragmentTotal) > 1).length;
      const state = !rule.enabled ? 'disabled' : !relevant.length ? 'no-events' : !eligibleEvents || missingEventTypes.length ? 'insufficient-data' : missing.size || fragments ? 'partial' : 'assessed';
      const findingCount = findings.filter(finding => finding.ruleId === ruleId).length;
      let explanation = !rule.enabled ? 'Disabled by the active rule profile; no finding can be emitted.' :
        !relevant.length ? 'No relevant Event IDs were included. This does not establish that the activity did not occur or that auditing is enabled.' :
        state === 'insufficient-data' ? 'Required fields or companion event types are missing. Review the gaps before drawing conclusions.' :
        state === 'partial' ? 'Some relevant records lack required fields or contain script fragments; the engine assessed the available fields and text.' :
        'Required input fields are available. No emitted finding can also mean conditions or thresholds were not met, or a more specific sequence used the evidence.';
      if (auth || accountSequence) explanation += ' Timed matches also require compatible identity, host, source (authentication), timezone basis, order, and configured windows.';
      const warnings = [];
      if (fragments) warnings.push(fragments+' script block record(s) are fragments; cues spanning fragments are not reconstructed.');
      for (const field of contextFields[ruleId] || []) {
        const count = relevant.filter(event => !event[field]).length;
        if (count) warnings.push(count+' record(s) lack '+field+' context; the Event ID review cue still runs.');
      }
      return {ruleId,title:rule.title,enabled:rule.enabled,state,relevantEvents:relevant.length,eligibleEvents,excludedEvents:relevant.length-eligibleEvents,
        findingCount,eventIds:ids,requirements,missingFields:[...missing.values()],missingEventTypes,explanation,warnings,
        collectionHints:ids.map(id => ({eventId:id,...eventCatalog[id]})),attack:profiles.attackReferences(ruleId),
        settings:auth ? {failureThreshold:settings.failureThreshold,sprayAccountThreshold:settings.sprayAccountThreshold,authWindowMinutes:settings.authWindowMinutes} : accountSequence ? {accountWindowMinutes:settings.accountWindowMinutes} : {}};
    });
  }
  const api = Object.freeze({ parseCsv, parseTimestamp, normalizeEvents, normalizeSettings, analyze, eventSort,
    labelById, eventCatalog, logonTypes, rules, DEFAULT_SETTINGS, severityForScore, severityOrder, accountDisplay, correlationCoverage, ruleCoverage });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EventTriageAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);

