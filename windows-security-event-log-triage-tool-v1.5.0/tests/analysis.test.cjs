const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, parseTimestamp, normalizeEvents, analyze } = require('../analysis.js');

function loadSample(name) {
  const text = fs.readFileSync(path.join(__dirname, '..', 'samples', name), 'utf8');
  return normalizeEvents(parseCsv(text));
}

test('CSV parser handles BOM, CRLF, escaped quotes, commas, and quoted newlines', () => {
  const rows = parseCsv('\uFEFFEvent ID,Message\r\n4624,"User said ""hello, analyst""\r\nand continued"\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], '4624');
  assert.equal(rows[1][1], 'User said "hello, analyst"\r\nand continued');
  assert.equal(rows[1].lineNumber, 2);
});

test('CSV parser reports malformed quote placement and unclosed fields with row details', () => {
  assert.throws(() => parseCsv('Event ID,Message\n4624,bad"quote\n'), /Unexpected quote.*row 2, column 2/);
  assert.throws(() => parseCsv('Event ID,Message\n4624,"never closed'), /unclosed quoted field.*row 2, column 2/);
  assert.throws(() => parseCsv('Event ID,Message\n4624,"closed"x\n'), /after a closing quote.*row 2, column 2/);
});

test('CSV normalization accepts common Event ID header variants and rejects mismatched row widths', () => {
  const rows = parseCsv('event_id,Date and Time,Message\n4624,2026-10-11 09:00:00,Account Name: maya\n');
  assert.equal(normalizeEvents(rows).events[0].id, '4624');
  assert.throws(
    () => normalizeEvents(parseCsv('Event ID,Message\n4624,Account Name: maya,extra\n')),
    /row 2.*expected 2 columns, found 3/
  );
  assert.throws(() => normalizeEvents(parseCsv('Date,Message\n2026-10-11,missing ID\n')), /Could not find an Event ID column/);
});

test('timestamp parsing is deterministic for ISO dates and flags ambiguous numeric dates', () => {
  const local = parseTimestamp('2026-10-11 09:15:30');
  assert.equal(local.status, 'valid');
  assert.equal(local.date.getFullYear(), 2026);
  assert.equal(local.date.getMonth(), 9);
  assert.equal(local.date.getDate(), 11);
  assert.equal(parseTimestamp('2026-10-11T09:15:30Z').date.toISOString(), '2026-10-11T09:15:30.000Z');
  assert.equal(parseTimestamp('10/11/2026 9:15:30 AM').status, 'ambiguous');
  assert.equal(parseTimestamp('13/10/2026 9:15:30').status, 'valid');
  assert.equal(parseTimestamp('31/02/2026').status, 'unrecognized');
  assert.equal(parseTimestamp('').status, 'missing');
});

test('event extraction separates the affected account from the actor and parses investigation context', () => {
  const csv = [
    'Level,Date and Time,Source,Event ID,Task Category,User,Computer,Keywords,Message',
    'Information,2026-10-11 09:00:00,Audit,4624,Logon,DOMAIN\\\\maya,WS-01,Success,"Account Name: maya; Logon Type: 10; Workstation Name: LAPTOP-4; Source Network Address: 192.0.2.10"',
    'Information,2026-10-11 09:05:00,Audit,4688,Process,DOMAIN\\\\admin,WS-01,Success,"New Process Name: C:\\\\Windows\\\\cmd.exe; Creator Process Name: C:\\\\Windows\\\\explorer.exe; Process ID: 0x123; Process Command Line: cmd.exe /c whoami"',
    'Information,2026-10-11 09:10:00,SCM,7045,Service,DOMAIN\\\\admin,WS-01,Info,"Service Name: DemoAgent; Service File Name: C:\\\\Program Files\\\\Demo Agent\\\\agent.exe"',
    'Information,2026-10-11 09:15:00,Audit,4720,Account,DOMAIN\\\\admin,DC-01,Success,"Target Account Name: temp-user; Subject Account Name: admin"'
  ].join('\n');
  const result = normalizeEvents(parseCsv(csv));
  const [logon, process, service, account] = result.events;
  assert.equal(logon.account, 'maya');
  assert.equal(logon.actor, 'DOMAIN\\\\maya');
  assert.equal(logon.logonType, '10');
  assert.equal(logon.ip, '192.0.2.10');
  assert.equal(logon.workstation, 'LAPTOP-4');
  assert.equal(process.process, 'C:\\\\Windows\\\\cmd.exe');
  assert.equal(process.parent, 'C:\\\\Windows\\\\explorer.exe');
  assert.equal(process.processId, '0x123');
  assert.equal(process.command, 'cmd.exe /c whoami');
  assert.equal(service.process, '');
  assert.equal(service.serviceName, 'DemoAgent');
  assert.equal(service.servicePath, 'C:\\\\Program Files\\\\Demo Agent\\\\agent.exe');
  assert.equal(account.account, 'temp-user');
  assert.equal(account.actor, 'admin');
});

test('all checked-in learning datasets parse and trigger their expected triage scenarios', () => {
  const normal = loadSample('normal-windows-events.csv');
  const password = loadSample('password-guessing.csv');
  const persistence = loadSample('account-persistence.csv');
  const mixed = loadSample('suspicious-admin-activity.csv');

  assert.equal(normal.events.length, 4);
  assert.equal(analyze(normal.events).some(finding => finding.severity === 'High'), false);
  assert.ok(analyze(password.events).some(finding => finding.title === 'Possible password guessing followed by success'));
  assert.ok(analyze(persistence.events).some(finding => finding.title === 'New account granted group membership'));
  assert.ok(analyze(mixed.events).some(finding => finding.title === 'Security audit log cleared'));
});

test('an actor shared by separate failed logons is not mistaken for one targeted account', () => {
  const header = 'Event ID,Date and Time,User,Computer,Message';
  const attempts = Array.from({ length: 5 }, (_, index) =>
    '4625,2026-10-11 10:0' + index + ':00,DOMAIN\\\\admin,DC-01,"Account Name: user' + index + '; Failure Reason: Bad password"'
  );
  const result = normalizeEvents(parseCsv([header, ...attempts].join('\n')));
  assert.ok(result.events.every(event => event.actor === 'DOMAIN\\\\admin'));
  assert.equal(new Set(result.events.map(event => event.account)).size, 5);
  assert.equal(analyze(result.events, 5).some(finding => finding.title === 'Repeated failed logons'), false);
});

test('normalization reports skipped rows and ambiguous/missing timestamps for the UI', () => {
  const csv = 'Event ID,Date,Message\n4624,10/11/2026,Account Name: maya\n,2026-10-11,ignored row\n4625,,Account Name: maya\n4688,not a date,Process ID: 0x44\n';
  const result = normalizeEvents(parseCsv(csv));
  assert.equal(result.diagnostics.rowsRead, 4);
  assert.equal(result.diagnostics.rowsParsed, 3);
  assert.equal(result.diagnostics.rowsSkipped, 1);
  assert.deepEqual(result.diagnostics.blankEventIdRows, [3]);
  assert.equal(result.diagnostics.ambiguousTimestamps, 1);
  assert.deepEqual(result.diagnostics.ambiguousTimestampRows, [2]);
  assert.equal(result.diagnostics.missingTimestamps, 1);
  assert.deepEqual(result.diagnostics.missingTimestampRows, [4]);
  assert.equal(result.diagnostics.invalidTimestamps, 1);
  assert.deepEqual(result.diagnostics.invalidTimestampRows, [5]);
});
