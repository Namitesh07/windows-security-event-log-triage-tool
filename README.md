# Windows Security Event Log Triage Tool

A browser-based learning project that helps students inspect exported Windows Security events and practice a SOC-style investigation workflow. It uses transparent rules and event correlation to point out activity worth reviewing. It does not claim to detect compromise.

## Run locally

1. Download or copy this project folder to your Windows computer.
2. Open `index.html` in a current version of Edge, Chrome, Firefox, or another modern browser.
3. Load one of the demo scenarios, or choose a Windows Event Viewer CSV file.
4. Select **Analyse events** to create the report.

Nothing needs to be installed. The page works as a static site and can also be hosted on a static web host. The sample buttons use demo records embedded in the page so they work from a local `file://` path; equivalent CSV files are in `samples/`.

## What Windows event logs and SOC triage mean

Windows records system and security activity as events. Security events can describe logons, account changes, process starts, and other actions. A SOC analyst triages events by identifying what happened, checking the affected account and system, looking for related activity, and deciding what needs more evidence or escalation.

One event rarely tells the whole story. The findings in this project are investigation prompts, not verdicts.

## Collect a CSV export

1. Open **Event Viewer** and select **Windows Logs → Security**.
2. Filter or select the event range you want to study.
3. Use **Save All Events As…** and choose CSV if your Windows version provides that option. If it does not, use the available export option that produces a comma-separated file, then confirm the first row has an Event ID column.
4. Upload the CSV in the tool.

CSV exports vary across Windows versions and locales. The parser accepts common header variants (for example, `Event ID`, `EventID`, `event_id`) and supports quoted fields, commas, and newlines inside quoted messages. An Event ID column is required. Date parsing depends on the browser recognizing the exported date format.

Version 1 does not parse raw `.evtx` files.

## Supported Event IDs

| Event ID | Meaning | Default handling |
| --- | --- | --- |
| 4624 | Successful logon | Context; not an alert by itself |
| 4625 | Failed logon | Counted by account; repeated failures can produce a finding |
| 4688 | Process created | Context, including process fields when present |
| 4720 | User account created | Medium-priority review cue |
| 4726 | User account deleted | Low-priority review cue |
| 4728 | Member added to global security group | Medium or higher if a privileged group is identified |
| 4732 | Member added to local security group | Medium or higher if a privileged group is identified |
| 1102 | Security audit log cleared | High-priority review cue |
| 4104 | PowerShell script block logged | Context; obvious encoded/obfuscated patterns are highlighted for review |
| 7045 | Windows service installed | Review cue for a potentially persistent service |

## Detection and correlation rules

- **Repeated failed logons:** by account, with a configurable threshold (default 5). This count spans the uploaded dataset; the tool does not require a time window because export timestamp formats are not consistent enough to promise reliable time-window analysis.
- **Failed logons followed by success:** when repeated failures for the same account are followed by a successful logon in the records, the events form a higher-priority finding.
- **Account created, then added to a group:** Event 4720 followed by 4728 or 4732 involving the same target account creates a combined finding.
- **Security log cleared:** Event 1102 always creates a high-priority finding.
- **Administrative / Privilege Activity:** multiple account, group, service, or audit-log changes appear in one summary. This is a dataset-level grouping only; the tool does not claim unrelated users or events are correlated.
- **Other events:** account deletion, group changes, service installation, and selected PowerShell obfuscation cues receive explainable review notes.

Severity labels mean investigative priority, not certainty. The optional score is a small explainable prioritisation aid, not a probability that an event is malicious.

## Demo datasets

| File | Expected learning outcome |
| --- | --- |
| `samples/normal-windows-events.csv` | Ordinary logons, process creation, and account cleanup without high-priority alerts |
| `samples/password-guessing.csv` | Repeated 4625 failures followed by a 4624 success |
| `samples/account-persistence.csv` | New account followed by addition to local Administrators |
| `samples/suspicious-admin-activity.csv` | Authentication sequence, account/group changes, log clearing, and service installation |

All demo names and hosts are fictional. Example IPv4 addresses use documentation ranges reserved for examples.

## Privacy and security design

- File reading and analysis happen in the browser using the local File API.
- No backend, AI service, external API, analytics, cookies, tracking, or telemetry is used.
- The page makes no network requests; fonts and styling use local system fonts.
- Uploaded data is held in the current page's memory and is not intentionally persisted.
- CSV values are rendered as text after escaping; the app does not insert event values as executable HTML.
- Malformed CSV and missing required columns produce a visible error instead of an analysis crash.

Only analyse logs from systems you own or are authorised to investigate.

## Limitations and false positives

- Windows CSV exports and column names can differ between versions and configurations. The tool requires a recognizable Event ID header.
- Date parsing relies on the browser's built-in date parser. If timestamps cannot be parsed, event order falls back to row order and the report should be treated accordingly.
- Not every event contains an account, source IP, workstation, process, or command line.
- The `User` field can identify the actor rather than the target account. The tool extracts common target-account labels from event messages, but unusual message formats can reduce correlation quality.
- Logging policy and retention affect which events are available. The absence of an event does not prove an activity did not happen.
- Repeated failures may come from a mistyped password or stale service credentials. Account creation, group changes, services, and log clearing can all be legitimate administration.
- Static browser analysis provides limited context and does not replace a SIEM, EDR, or professional SOC process. Windows Event IDs alone cannot determine intent.
- The parser has a 25 MB file-size limit and the table shows at most 1,000 matching rows at a time.

## Future ideas (not included in this version)

Raw `.evtx` parsing, Sysmon support, deeper PowerShell analysis, process-tree visualisation, MITRE ATT&CK mapping, richer timeline analysis, login baselining, scheduled-task and Defender events, incident report export, and SIEM integration.
