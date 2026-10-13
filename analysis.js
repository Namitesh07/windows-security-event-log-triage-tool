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

    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i);
    if (iso) {
      if (iso[8]) {
        const date = new Date(text.replace(' ', 'T'));
        return Number.isNaN(date.getTime()) ? { date: null, status: 'unrecognized' } : { date, status: 'valid' };
      }
      const fraction = (iso[7] || '').padEnd(3, '0');
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

  function isAfter(later, earlier) {
    if (later.date && earlier.date) return later.date.getTime() >= earlier.date.getTime();
    return later.index > earlier.index;
  }

  const targetPatternsById = {
    '4624': [/(?:TargetUserName|Target User Name|Account Name|Account):\s*([^;\r\n]+)/i],
    '4625': [/(?:TargetUserName|Target User Name|Account Name|Account):\s*([^;\r\n]+)/i],
    '4720': [/(?:Target Account Name|TargetUserName|New Account Name|New Account):\s*([^;\r\n]+)/i],
    '4726': [/(?:Target Account Name|TargetUserName|Deleted Account Name|Account Name):\s*([^;\r\n]+)/i],
    '4728': [/(?:Member Account Name|MemberName|Target Account Name|TargetUserName):\s*([^;\r\n]+)/i],
    '4732': [/(?:Member Account Name|MemberName|Target Account Name|TargetUserName):\s*([^;\r\n]+)/i]
  };
  const genericTargetPatterns = [/(?:Target Account Name|TargetUserName|Target User Name|Member Account Name|MemberName|Account Name|Account):\s*([^;\r\n]+)/i];
  const actorPatterns = [/(?:Subject Account Name|SubjectUserName|Subject User Name|CallerUserName|Caller User Name):\s*([^;\r\n]+)/i];

  function normalizeEvents(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('This CSV needs a header row and at least one event record.');
    const headers = rows[0].map(value => value.trim());
    const map = mapHeaders(headers);
    const events = [];
    const diagnostics = {
      rowsRead: rows.length - 1,
      rowsParsed: 0,
      rowsSkipped: 0,
      blankEventIdRows: [],
      invalidEventIdRows: [],
      invalidTimestamps: 0,
      invalidTimestampRows: [],
      ambiguousTimestamps: 0,
      ambiguousTimestampRows: [],
      missingTimestamps: 0,
      missingTimestampRows: []
    };

    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(value => String(value).trim())) continue;
      const lineNumber = row.lineNumber || index + 1;
      if (row.length !== headers.length) {
        const detail = row.length < headers.length ? 'has too few columns' : 'has too many columns';
        throw new Error('CSV record ' + detail + ' (row ' + lineNumber + '): expected ' + headers.length + ' columns, found ' + row.length + '.');
      }

      const rawId = pick(row, map.id);
      const idMatch = rawId.match(/(?:^|\D)(\d{1,6})(?:\D|$)/);
      if (!rawId) {
        diagnostics.rowsSkipped += 1;
        diagnostics.blankEventIdRows.push(lineNumber);
        continue;
      }
      if (!idMatch) {
        diagnostics.rowsSkipped += 1;
        diagnostics.invalidEventIdRows.push(lineNumber);
        continue;
      }

      const id = idMatch[1];
      const message = pick(row, map.message);
      const user = pick(row, map.user);
      const timeText = pick(row, map.time);
      const targetPatterns = targetPatternsById[id] || genericTargetPatterns;
      const targetInMessage = firstMatch(message, targetPatterns);
      const logonFallback = ['4624', '4625'].includes(id) ? user.replace(/^.*\\/, '').replace(/\s+\(.+$/, '') : '';
      const account = targetInMessage || logonFallback;
      const actor = firstMatch(message, actorPatterns) || user;
      const ipCandidate = firstMatch(message, [/(?:Source Network Address|Source Address|IpAddress|IP Address|Client Address|Source IP):\s*([^;\s\r\n]+)/i]);
      const ip = ipCandidate && ipCandidate !== '-' ? ipCandidate : '';
      const workstation = firstMatch(message, [/(?:Workstation Name|Workstation|Caller Computer Name|Computer Name):\s*([^;\r\n]+)/i]);
      const process = firstMatch(message, [/(?:New Process Name|Process Name|Image Path):\s*([^;\r\n]+)/i]);
      const parent = firstMatch(message, [/(?:Creator Process Name|Parent Process Name|Parent Image):\s*([^;\r\n]+)/i]);
      const group = firstMatch(message, [/(?:Group Name|Target Group Name):\s*([^;\r\n]+)/i]);
      const command = firstMatch(message, [/(?:Process Command Line|Command Line):\s*([^;\r\n]+)/i]);
      const processId = firstMatch(message, [/(?:New Process ID|Process ID):\s*([^;\r\n]+)/i]);
      const logonType = firstMatch(message, [/(?:Logon Type):\s*([^;\r\n]+)/i]);
      const serviceName = firstMatch(message, [/(?:Service Name):\s*([^;\r\n]+)/i]);
      const servicePath = firstMatch(message, [/(?:Service File Name|Service Image Path|ImagePath):\s*([^;\r\n]+)/i]);
      const scriptBlockId = firstMatch(message, [/(?:ScriptBlock ID|Script Block ID):\s*([^;\r\n]+)/i]);
      const timestamp = parseTimestamp(timeText);
      if (timestamp.status === 'ambiguous') { diagnostics.ambiguousTimestamps += 1; diagnostics.ambiguousTimestampRows.push(lineNumber); }
      else if (timestamp.status === 'unrecognized') { diagnostics.invalidTimestamps += 1; diagnostics.invalidTimestampRows.push(lineNumber); }
      else if (timestamp.status === 'missing') { diagnostics.missingTimestamps += 1; diagnostics.missingTimestampRows.push(lineNumber); }

      events.push({
        id, level: pick(row, map.level), timeText, date: timestamp.date, timestampStatus: timestamp.status,
        source: pick(row, map.source), task: pick(row, map.task), user, actor, account, targetAccount: account,
        computer: pick(row, map.computer), ip, workstation, process, parent, processId, command, logonType,
        serviceName, servicePath, scriptBlockId, group, message, keywords: pick(row, map.keywords),
        index: events.length + 1, lineNumber
      });
    }

    if (!events.length) throw new Error('No rows with a readable Event ID were found. Check the Event ID column and the CSV records.');
    diagnostics.rowsParsed = events.length;
    return { events, diagnostics };
  }

  const labelById = {
    '4624': 'Successful logon', '4625': 'Failed logon', '4720': 'User account created',
    '4726': 'User account deleted', '4728': 'Added to global security group',
    '4732': 'Added to local security group', '1102': 'Security audit log cleared',
    '4688': 'Process created', '4104': 'PowerShell script block logged',
    '7045': 'Windows service installed'
  };
  const severityOrder = { High: 0, Medium: 1, Low: 2, Informational: 3 };
  const makeFinding = (title, severity, events, why, benign, next, score) => ({ title, severity, events, why, benign, next, score });

  function eventSort(a, b) {
    return a.date && b.date ? a.date - b.date : a.index - b.index;
  }

  function analyze(events, threshold = 5) {
    const safeThreshold = Math.max(2, Math.min(100, Number(threshold) || 5));
    const findings = [];
    const used = new Set();
    const byAccount = new Map();
    for (const event of events) {
      if (!event.account) continue;
      const key = event.account.toLowerCase();
      if (!byAccount.has(key)) byAccount.set(key, []);
      byAccount.get(key).push(event);
    }

    for (const group of byAccount.values()) {
      const failures = group.filter(event => event.id === '4625').sort(eventSort);
      if (failures.length < safeThreshold) continue;
      const lastFailure = failures.at(-1);
      const success = group.filter(event => event.id === '4624' && isAfter(event, lastFailure)).sort(eventSort)[0];
      const involved = success ? [...failures, success] : failures;
      involved.forEach(event => used.add(event));
      findings.push(makeFinding(
        success ? 'Possible password guessing followed by success' : 'Repeated failed logons',
        success ? 'High' : 'Medium', involved,
        success ? 'Repeated failed authentication attempts for this account were followed by a successful logon in this dataset.' : 'This account has repeated failed authentication attempts in this dataset.',
        'A legitimate user may have mistyped a password, or a service may be using stale credentials.',
        ['Verify the source device and IP address.', 'Check whether this activity was expected for the account.', 'Review nearby authentication and endpoint activity.', 'Check whether other accounts were targeted.'],
        success ? 30 : 10
      ));
    }

    for (const [key, group] of byAccount) {
      const createdAccounts = group.filter(event => event.id === '4720').sort(eventSort);
      for (const created of createdAccounts) {
        const addition = events.filter(event => ['4728', '4732'].includes(event.id) && event.account.toLowerCase() === key && isAfter(event, created)).sort(eventSort)[0];
        if (!addition || used.has(created) || used.has(addition)) continue;
        used.add(created);
        used.add(addition);
        findings.push(makeFinding(
          'New account granted group membership',
          /admin|domain controllers|enterprise admins|backup operators/i.test(addition.group) ? 'High' : 'Medium',
          [created, addition],
          'An account creation event was followed by a global or local security group addition involving the same account.',
          'This can be a legitimate onboarding or service-account task if it was approved and documented.',
          ['Confirm the account creation was authorised.', 'Identify the administrator who made the change.', 'Review the group’s privileges and the new account’s activity.', 'Confirm whether the account is still required.'],
          25
        ));
      }
    }

    for (const event of events) {
      if (event.id === '1102') {
        used.add(event);
        findings.push(makeFinding('Security audit log cleared', 'High', [event],
          'The Windows Security audit log was cleared. Clearing can remove useful investigation history and is commonly reviewed as possible defence evasion.',
          'An administrator may have cleared the log during authorised maintenance or troubleshooting.',
          ['Confirm who cleared the log and why.', 'Review change records and other log sources around this time.', 'Check whether log collection continued elsewhere.'], 30));
      } else if (['4728', '4732'].includes(event.id) && !used.has(event)) {
        const privileged = /administrators|domain admins|enterprise admins|backup operators|account operators|server operators/i.test(event.group + ' ' + event.message);
        used.add(event);
        findings.push(makeFinding(
          privileged ? 'Privileged group membership changed' : 'Security group membership changed',
          privileged ? 'High' : 'Medium', [event],
          'An account was added to a security group' + (event.group ? ' (“' + event.group + '”)' : '') + '. Group membership can change what an account is allowed to do.',
          'This may be an authorised access request or routine administration.',
          ['Verify the change against an approved request.', 'Confirm the affected account and group are expected.', 'Review the actor and surrounding account activity.'],
          privileged ? 25 : 15
        ));
      } else if (event.id === '4720' && !used.has(event)) {
        used.add(event);
        findings.push(makeFinding('User account created', 'Medium', [event],
          'A new Windows user account was created. Unexpected accounts can provide access that persists beyond a single login.',
          'Account creation is common during onboarding, testing, or service setup.',
          ['Confirm the account owner and request.', 'Check whether the account has appropriate groups and an expiry plan.'], 15));
      } else if (event.id === '4726') {
        used.add(event);
        findings.push(makeFinding('User account deleted', 'Low', [event],
          'A Windows user account was deleted. This may affect access and audit context.',
          'Routine offboarding or cleanup is a common explanation.',
          ['Confirm the deletion matches an approved offboarding or cleanup task.'], 5));
      } else if (event.id === '7045') {
        used.add(event);
        findings.push(makeFinding('Windows service installed', 'Medium', [event],
          'A new Windows service was installed. Services can run automatically and are sometimes used for persistence.',
          'A software installation or approved system update may create a service.',
          ['Verify the software, service path, publisher, and installation change.'], 15));
      } else if (event.id === '4104') {
        used.add(event);
        const obfuscated = /frombase64string|encodedcommand|-enc\b|\\x[0-9a-f]{2}|\^|char\s*\(/i.test(event.message);
        if (obfuscated) findings.push(makeFinding('PowerShell script block contains encoded or obfuscated text', 'Medium', [event],
          'The logged script block includes patterns often used to hide command content. This is a review cue, not proof of malicious code.',
          'Administrators and software installers may use encoded commands for legitimate automation.',
          ['Review the complete script block and its parent process.', 'Confirm the script source and intended change.'], 10));
      }
    }

    const adminEvents = events.filter(event => ['4720', '4728', '4732', '7045', '1102'].includes(event.id));
    if (adminEvents.length >= 2) findings.push(makeFinding(
      'Administrative / Privilege Activity', 'Medium', adminEvents,
      'The dataset includes multiple account, group, service, or audit-log changes. They are summarized together for review; the tool does not assume they are related.',
      'These changes may reflect normal administration, software installation, or approved access management.',
      ['Review each event against its own change record.', 'Compare actors, systems, and timestamps before deciding whether the events are connected.'], 10
    ));

    return findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.score - a.score);
  }

  const api = Object.freeze({ parseCsv, parseTimestamp, normalizeEvents, analyze, eventSort, labelById });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EventTriageAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);

