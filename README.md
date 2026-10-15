# Windows Security Event Log Triage Tool

### Turn exported event data into evidence you can investigate.

Explore Windows authentication, account, privilege, and persistence activity with an explainable SOC-style workflow — right in your browser.

[**Open the live demo →**](https://namitesh07.github.io/windows-security-event-log-triage-tool/)

![Browser-based](https://img.shields.io/badge/Analysis-Browser--based-168a72?style=for-the-badge)
![No uploads](https://img.shields.io/badge/Event%20data-No%20uploads-5b6472?style=for-the-badge)

A privacy-first, educational triage tool — not a verdict that a system is compromised.

[**Try the demo**](https://namitesh07.github.io/windows-security-event-log-triage-tool/) · [**How it works**](#how-to-use-it) · [**Privacy**](#privacy-by-design) · [**Limitations**](#know-the-limits)

## The idea

Windows event logs contain valuable investigation clues, but a single Event ID rarely tells the whole story. This project helps students and early-career analysts **spot, group, and understand activity worth reviewing** using visible rules and correlations within the loaded export.

Analysis happens entirely in the browser. The tool does not upload the selected CSV, contact a server, query a threat-intelligence feed, or claim to determine attacker intent.

## What it can inspect

| Area | Checks and evidence |
| --- | --- |
| Authentication activity | Logon-type context (4624 / 4625), time-windowed failure bursts and failure-to-success sequences, and password-spraying cues across distinct accounts |
| Account and group changes | New/deleted accounts (4720 / 4726), group additions (4728 / 4732), bounded account-creation correlations, and lockouts (4740) |
| Process, script, and service activity | Process/parent/command cues (4688), encoded-content and download-plus-evaluation cues (4104 / 4688), services (7045), and scheduled tasks (4698 / 4702 / 4699) |
| Defence and policy changes | Security log clearing (1102), audit-policy changes (4719), firewall rule changes (4946 / 4947 / 4948), and firewall setting changes (4950) |
| Credential context | Explicit-credential logon attempts (4648), including credential account, actor, process, and target server |
| Context | Available affected account and actor, host, source IP, workstation, logon type, process and parent path, process ID, command line, service name/path, PowerShell script-block ID, timestamp, and message details |
| Learning scenarios | Five fictional CSV datasets: normal activity, password guessing, account persistence, administrative activity, and a correlation/policy lab |

### Built to make the reasoning visible

- **Traceable findings:** stable rule IDs, matched field values, point-by-point score explanations, and direct links to the exact supporting CSV rows. Inspect extracted fields alongside original messages and columns, then return to the finding.
- **Configurable windows:** defaults are **5 failures in 10 minutes**, **5 distinct accounts** for spraying, and **30 minutes** for account creation followed by group addition. All four settings are adjustable.
- **Careful correlation:** authentication matches require the same affected identity, reporting host, and source; account/group sequences require a matching target identity and host. Domains and available SIDs are preserved.
- **Transparent scope:** missing or ambiguous timestamps and missing identity/host/source fields are reported as correlation coverage gaps. These records remain visible as evidence.
- **CSV guardrails:** common Event ID header names are accepted; quoted commas, quotes, and multiline messages are supported; malformed quoting and inconsistent row widths report the affected row.
- **Local practice cases:** all demo names and hosts are fictional; example IP addresses use documentation ranges reserved for examples.

## How to use it

1. Open the [live demo](https://namitesh07.github.io/windows-security-event-log-triage-tool/) or run the project locally.
2. In Windows Event Viewer, export the event records you are authorised to inspect as a CSV file.
3. Choose the CSV, review parsing feedback, adjust the correlation thresholds/windows if needed, and select **Analyse events**.
4. Open **View supporting events** on a finding. Inspect the original CSV rows, matched fields, and scoring breakdown; use **Back to finding** to continue the review.

**Tip:** The tool needs a recognisable **Event ID** column. CSV headers vary between Windows versions and locales, so common variants such as **Event ID**, **EventID**, and **event_id** are recognised. ISO dates are parsed explicitly. Timed correlations require a timestamp with a time of day and a consistent timezone basis; ambiguous numeric dates are excluded from those rules. Raw **.evtx** files are not supported in version 1.

## Read the result carefully

The output is an **explainable triage signal**, not a probability that an event is malicious. Priority is derived consistently from each finding's points: **High 60+**, **Medium 30–59**, **Low 1–29**, **Informational 0**. Shared evidence can appear in several findings; points are not summed into a dataset risk score.

See the [detection and logging guide](docs/detections.md) for exact rule conditions, false-positive context, supported Event IDs, and audit requirements.

| Result | What it means |
| --- | --- |
| High-priority review | An event or sequence deserves prompt investigation, such as cleared audit logs or a suspicious authentication pattern |
| Review cue | An account, group, process, PowerShell, or service event needs context before a conclusion can be made |
| No high-priority finding | The selected records did not trigger a current rule; it does **not** prove the system or account is safe |

Use the results to decide what to inspect next: confirm the account owner, expected host and source IP, change ticket, process path, command line, or related records from your approved security tools.

## Privacy by design

- CSV reading and analysis take place in the browser with the local File API.
- No backend, database, account, analytics, telemetry, AI service, external API, or tracking is used.
- The page makes no application network requests; fonts and styling use local system resources.
- Selected CSV data stays in the active browser page and is not intentionally persisted by the app.
- Event values are rendered as text after escaping; the app does not inject event data as executable HTML.

Only analyse systems and logs you own or are authorised to investigate.

## Run it locally

No package installation, build step, or API key is required.

~~~bash
git clone https://github.com/Namitesh07/windows-security-event-log-triage-tool.git
cd windows-security-event-log-triage-tool
~~~

Open **index.html** in a modern browser, then load one of the CSV files in **samples/** or choose your own authorised Windows Event Viewer CSV export. To run the parser and detection tests, install Node.js 18 or later and run **npm test** from the repository folder.

## Test the analysis logic

The project includes a dependency-free Node.js test suite for CSV parsing, timestamp handling, event-field extraction, detection rules, and all five checked-in sample datasets.

~~~bash
npm test
~~~

Node.js 18 or later is required to run the tests. The browser-based analyser still runs without installing Node.js.

## Know the limits

This project is an educational aid for deciding what to inspect next. It does **not**:

- prove that activity is malicious, authorised, or harmless;
- parse raw **.evtx** files, Sysmon data, or every Windows Event ID;
- replace a SIEM, EDR, incident-response process, or professional SOC judgement;
- infer timed correlations from ambiguous, missing, date-only, or unrecognised timestamps; those records remain visible and their limits are reported;
- know your organisation's normal baseline, logging policy, change records, or retention gaps; or
- establish that events with different users, hosts, or contexts are related.

English Event Viewer message sections and common structured CSV field names are supported. Localised message labels may not be extracted; raw rows are still available. Timezone-free timestamps are treated as browser-local wall times, so confirm collection context before interpreting them. PowerShell fragments are inspected separately and are not automatically reassembled. Raw task XML is retained for review.

Mistyped passwords, stale service credentials, account management, group changes, services, PowerShell activity, and cleared logs can all be legitimate in the right context. Validate important findings with authorised sources before escalating.

## Built with

**HTML · CSS · Vanilla JavaScript · Browser File API**

No runtime libraries or third-party services are required by the analyser.

Created by **Namitesh Pandey** for learning and portfolio use.

**Investigate the evidence. Keep the human in the loop.**

Repository shared for portfolio and educational viewing. No licence is granted at this time.
