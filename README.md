# Windows Security Event Log Triage Tool

### Turn exported event data into evidence you can investigate.

Explore Windows authentication, account, privilege, and persistence activity with an explainable SOC-style workflow — right in your browser.

[**Open the live demo →**](https://namitesh07.github.io/windows-security-event-log-triage-tool/)

![Browser-based](https://img.shields.io/badge/Analysis-Browser--based-168a72?style=for-the-badge)
![No uploads](https://img.shields.io/badge/Event%20data-No%20uploads-5b6472?style=for-the-badge)

A privacy-first, educational triage tool — not a verdict that a system is compromised.

[**Try the demo**](https://namitesh07.github.io/windows-security-event-log-triage-tool/) · [**How it works**](#how-to-use-it) · [**Privacy**](#privacy-by-design) · [**Limitations**](#know-the-limits) · [**Releases**](https://github.com/Namitesh07/windows-security-event-log-triage-tool/releases)

## The idea

Windows event logs contain valuable investigation clues, but a single Event ID rarely tells the whole story. This project helps students and early-career analysts **spot, group, and understand activity worth reviewing** using visible rules and correlations within the loaded export.

Analysis happens entirely in the browser. The tool does not upload selected event files or rule profiles, contact an analysis server, query a threat-intelligence feed, or claim to determine attacker intent.

## What it can inspect

| Area | Checks and evidence |
| --- | --- |
| Authentication activity | Logon-type context (4624 / 4625), time-windowed failure bursts and failure-to-success sequences, and password-spraying cues across distinct accounts |
| Account and group changes | New/deleted accounts (4720 / 4726), group additions (4728 / 4732), bounded account-creation correlations, and lockouts (4740) |
| Process, script, and service activity | Process/parent/command cues (4688), encoded-content and download-plus-evaluation cues (4104 / 4688), services (7045), and scheduled tasks (4698 / 4702 / 4699) |
| Defence and policy changes | Security log clearing (1102), audit-policy changes (4719), firewall rule changes (4946 / 4947 / 4948), and firewall setting changes (4950) |
| Credential context | Explicit-credential logon attempts (4648), including credential account, actor, process, and target server |
| Context | Available affected account and actor, host, source IP, workstation, logon type, process and parent path, process ID, command line, service name/path, PowerShell script-block ID, timestamp, and message details |
| Learning scenarios | Five built-in CSV demos plus seven curated cross-format, benign, incomplete, and separate-host practice cases |

### Built to make the reasoning visible

- **Multiple formats:** CSV, Windows Event XML, JSON, and JSON Lines/NDJSON use the same analysis engine. A local Windows PowerShell helper converts EVTX files to XML.
- **Traceable findings:** stable rule IDs, matched field values, point-by-point score explanations, and links to supporting source records. Inspect original XML/JSON or CSV columns alongside extracted fields, then return to the finding.
- **Versioned rules:** 23 definitions live in a readable JSON catalog. Optional data-only profiles can disable rules or change contribution points; matching conditions stay fixed in the engine. Exports record the exact profile and resolved weights.
- **Configurable windows:** defaults are **5 failures in 10 minutes**, **5 distinct accounts** for spraying, and **30 minutes** for account creation followed by group addition. All four settings are adjustable.
- **Careful correlation:** authentication matches require the same affected identity, reporting host, and source; account/group sequences require a matching target identity and host. Domains and available SIDs are preserved.
- **Transparent scope:** missing or ambiguous timestamps and missing identity/host/source fields are reported as correlation coverage gaps. These records remain visible as evidence.
- **CSV guardrails:** common Event ID header names are accepted; quoted commas, quotes, and multiline messages are supported; malformed quoting and inconsistent row widths report the affected row.
- **Local practice cases:** all demo names and hosts are fictional; example IP addresses use documentation ranges reserved for examples.
- **Report controls:** sort events and findings, select 25/50/100/250 events per page, and navigate paged findings and timelines. Clear filters within one finding or return to the whole dataset.
- **Portable reports:** download JSON, findings CSV, or events CSV for the entire dataset or current evidence/filters. Exports span all matching pages and include analysis provenance. JSON preserves source strings; CSV guards formula-like cells for spreadsheet review.
- **Case context:** add a case title, analyst, collection timezone, case notes, and a review status/note for each finding. Notes stay in the tab until you export them; no browser storage is used.
- **Save and reopen:** download an entire case and continue later with its evidence, notes, settings, and rule profile. Full JSON reports from v1.4.0+ can also be reopened. Findings are recalculated from validated source fields.
- **Responsive processing:** cancellable Web Worker parsing, analysis, and export when served over HTTP(S). Row inspectors load on demand; large reports use bounded pages. A 2 MB fallback remains available when opening the page directly.
- **Repeatable checks:** dependency-free Node tests, actual desktop/mobile browser flows, Windows converter smoke and real-EVTX integration checks, and reproducible source ZIPs with SHA-256 checksums. Playwright is used only for development tests.

## How to use it

1. Open the [live demo](https://namitesh07.github.io/windows-security-event-log-triage-tool/) or run the project locally.
2. Export the event records you are authorised to inspect as CSV, Windows Event XML, JSON, or JSON Lines. See the [input guide](docs/inputs.md) for accepted shapes and EVTX conversion.
3. Choose the file, review parsing feedback, adjust the correlation thresholds/windows if needed, and select **Analyse events**. Optionally inspect or load a tuning profile under **Detection rules and optional tuning profile**.
4. Open **View supporting events** on a finding. Inspect source records, matched fields, and scoring contributions; use **Back to finding** to continue the review.
5. Sort and filter the evidence, add case or finding notes, then choose an export scope and download JSON or CSV. Use **Entire dataset → Download JSON report** to keep all case notes, including notes from findings removed by a settings change.
6. Choose **Save entire case** to continue later. Expand **Reopen a saved case** below the event chooser and select the downloaded JSON. Reopening restores the investigation and recalculates findings; invalid or cancelled files preserve the current case.

**Tip:** CSV needs a recognisable **Event ID** column, such as **Event ID**, **EventID**, or **event_id**. XML needs the Windows Event/System structure; JSON accepts event objects, an array, or an events-array wrapper. Timed rules require a timestamp with a time of day and consistent timezone basis. Raw **.evtx** files require [local conversion to XML](tools/Export-TriageEvents.ps1) first; binary EVTX browser parsing remains outside this release.

## Read the result carefully

The output is an **explainable triage signal**, not a probability that an event is malicious. Priority is derived consistently from each finding's points: **High 60+**, **Medium 30–59**, **Low 1–29**, **Informational 0**. Shared evidence can appear in several findings; points are not summed into a dataset risk score.

See the [detection and logging guide](docs/detections.md) for exact rule conditions, false-positive context, supported Event IDs, and audit requirements.
See the [report and case guide](docs/reports.md) for export fields, scope, note retention, and file-size limits.
See [saving and reopening cases](docs/cases.md) for compatibility, validation, and version/timezone context.
See [rules and profiles](docs/rules.md) for tuning and [practice cases](samples/README.md) for expected findings. Priority points can change with a profile, so compare the applied profile when comparing reports.

| Result | What it means |
| --- | --- |
| High-priority review | An event or sequence deserves prompt investigation, such as cleared audit logs or a suspicious authentication pattern |
| Review cue | An account, group, process, PowerShell, or service event needs context before a conclusion can be made |
| No high-priority finding | The selected records did not trigger a current rule; it does **not** prove the system or account is safe |

Use the results to decide what to inspect next: confirm the account owner, expected host and source IP, change ticket, process path, command line, or related records from your approved security tools.

## Privacy by design

- Event-file and profile reading and analysis take place in the browser with the local File API.
- No backend, database, account, analytics, telemetry, AI service, external API, or tracking is used.
- The page loads its own app assets, including worker scripts, from the same origin. No event-file, profile, case-note, telemetry, or API uploads are made; fonts and styling use local system resources.
- Event data, profiles, and case notes stay in the active browser page. The app does not use localStorage, IndexedDB, cookies, or automatic persistence. Downloaded reports are saved only when you request an export.
- Event values are rendered as text after escaping; the app does not inject event data as executable HTML.
- Treat downloaded reports as sensitive as the original logs; they can include account names, hostnames, commands, original messages, and analyst notes.

Only analyse systems and logs you own or are authorised to investigate.

## Run it locally

No package installation, build step, or API key is required.

~~~bash
git clone https://github.com/Namitesh07/windows-security-event-log-triage-tool.git
cd windows-security-event-log-triage-tool
~~~

Open **index.html** in a modern browser, then load a file from **samples/** or choose your own authorised export. To run developer checks and tests, use Node.js 22 or later. No npm install is required.

Opening `index.html` directly uses small-file mode (up to **2 MB**). For background processing of files up to **25 MB**, use GitHub Pages or serve the folder locally, for example with Python 3. Both modes enforce **100,000 accepted events**:

~~~bash
python3 -m http.server 8000 --bind 127.0.0.1
~~~

Then open `http://127.0.0.1:8000`. Keep all JavaScript files beside `index.html`, including `rules.generated.js`, `rule-profiles.js`, `inputs.js`, `report.js`, `case-file.js`, `task-runner.js`, and `worker.js`. Preserve `samples/` and `tools/` for demos and the converter download. Processing remains local. Large or complex datasets still consume memory; **Cancel operation** stops the active worker. Saved-case reopening supports 50 MB with workers and 2 MB in small-file mode.

## Test the analysis logic

The dependency-free Node suite covers input formats, detections, profiles, fixtures, case round trips/validation, export safety, notes, UI flows, and actual worker-thread processing. A separate Playwright suite exercises file choosers, workers, downloads, case reopening, cancellation, keyboard focus, markup safety, and responsive layout in actual browsers.

~~~bash
npm run check
npm test
npm run package
~~~

Node.js 22 or later is required only for developer tooling. For actual browser tests, run `npm ci --ignore-scripts`, `npx playwright install --with-deps chromium firefox`, then `npm run test:browser`. CI includes desktop Chromium, Firefox, mobile Chromium, and Windows PowerShell checks using a private real EVTX fixture. These development dependencies are never loaded by the analyser. See [test setup](docs/testing.md), [development](docs/development.md), and the [upgrade guide](UPGRADE_GUIDE.md).

## Know the limits

This project is an educational aid for deciding what to inspect next. It does **not**:

- prove that activity is malicious, authorised, or harmless;
- parse raw **.evtx** files, Sysmon data, or every Windows Event ID;
- replace a SIEM, EDR, incident-response process, or professional SOC judgement;
- infer timed correlations from ambiguous, missing, date-only, or unrecognised timestamps; those records remain visible and their limits are reported;
- know your organisation's normal baseline, logging policy, change records, or retention gaps; or
- establish that events with different users, hosts, or contexts are related.

English Event Viewer message sections and common structured event fields are supported. Localised messages may need structured EventData fields; original records remain available. XML support is a bounded Windows Event XML subset, not a general XML or XSD validator. JSON must match the [documented event shape](docs/inputs.md). UTF-8 and BOM-marked UTF-16 are supported. ISO fractional seconds up to seven digits are accepted; calculations use millisecond precision and retain original timestamp strings. Timezone-free timestamps use browser-local wall time. PowerShell fragments are inspected separately rather than reassembled. Raw task XML is retained for review.

Saved cases and full JSON reports can be reopened with validated evidence and recalculated findings. Filtered reports cannot restore a complete case. Files are user-provided snapshots, not cryptographic evidence records. Collection timezone is analyst context and does not reinterpret dates; reopening in a different browser timezone can change timezone-free timestamp interpretation and displays a notice. Save before replacing a dataset. Row inspectors shorten values above 20,000 characters for display; full values remain in exports.

Mistyped passwords, stale service credentials, account management, group changes, services, PowerShell activity, and cleared logs can all be legitimate in the right context. Validate important findings with authorised sources before escalating.

## Built with

**HTML · CSS · Vanilla JavaScript · Browser File API**

No runtime libraries or third-party services are required by the analyser.

Created by **Namitesh Pandey** for learning and portfolio use.

**Investigate the evidence. Keep the human in the loop.**

Repository shared for portfolio and educational viewing. No licence is granted at this time.

