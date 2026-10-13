# Windows Security Event Log Triage Tool

### Turn exported event data into evidence you can investigate.

Explore Windows authentication, account, privilege, and persistence activity with an explainable SOC-style workflow — right in your browser.

[**Open the live demo →**](https://namitesh07.github.io/windows-security-event-log-triage-tool/)

![Browser-based](https://img.shields.io/badge/Analysis-Browser--based-168a72?style=for-the-badge)
![No uploads](https://img.shields.io/badge/Event%20data-No%20uploads-5b6472?style=for-the-badge)

A privacy-first, educational triage tool — not a verdict that a system is compromised.

[**Try the demo**](https://namitesh07.github.io/windows-security-event-log-triage-tool/) · [**How it works**](#how-to-use-it) · [**Privacy**](#privacy-by-design) · [**Limitations**](#know-the-limits)

## The idea

Windows event logs contain valuable investigation clues, but a single Event ID rarely tells the whole story. This project helps students and early-career analysts **spot, group, and understand activity worth reviewing** using visible rules and dataset-level correlation.

Analysis happens entirely in the browser. The tool does not upload the selected CSV, contact a server, query a threat-intelligence feed, or claim to determine attacker intent.

## What it can inspect

| Area | Checks and evidence |
| --- | --- |
| Authentication activity | Successful logons (4624), repeated failed logons (4625), and failure-to-success patterns for the same account |
| Account and group changes | New accounts (4720), deleted accounts (4726), and additions to global or local security groups (4728 / 4732) |
| Process, script, and service activity | Process creation (4688), PowerShell script-block records (4104), and service installation (7045) when those fields are present |
| Defence impairment | Security audit log clearance (1102), which always creates a high-priority review cue |
| Context | Available affected account and actor, host, source IP, workstation, logon type, process and parent path, process ID, command line, service name/path, PowerShell script-block ID, timestamp, and message details |
| Learning scenarios | Four fictional CSV datasets: normal activity, password guessing, account persistence, and suspicious administrative activity |

### Built to make the reasoning visible

- **Explainable findings:** every alert is tied to an Event ID, rule, count, or event sequence that can be reviewed.
- **Configurable authentication threshold:** the repeated-failed-logon threshold starts at **5** and can be adjusted for the current analysis.
- **Careful correlation:** the tool can connect failed logons followed by success, and new-account creation followed by group addition, when the uploaded records provide matching evidence.
- **Transparent scope:** correlations use the affected account parsed from event details, not the CSV User actor field; they are limited to the uploaded dataset.
- **CSV guardrails:** common Event ID header names are accepted; quoted commas, quotes, and multiline messages are supported; malformed quoting and inconsistent row widths report the affected row.
- **Local practice cases:** all demo names and hosts are fictional; example IP addresses use documentation ranges reserved for examples.

## How to use it

1. Open the [live demo](https://namitesh07.github.io/windows-security-event-log-triage-tool/) or run the project locally.
2. In Windows Event Viewer, export the event records you are authorised to inspect as a CSV file.
3. Choose the CSV, optionally adjust the repeated-failed-logon threshold, and select **Analyse events**.
4. Review the prioritised findings, the supporting events, and any event sequence that needs more evidence.

**Tip:** The tool needs a recognisable **Event ID** column. CSV headers vary between Windows versions and locales, so common variants such as **Event ID**, **EventID**, and **event_id** are recognised. ISO dates are parsed explicitly. Ambiguous numeric dates are flagged, and the affected records use CSV row order for sequence checks. Raw **.evtx** files are not supported in version 1.

## Read the result carefully

The output is an **explainable triage signal**, not a probability that an event is malicious. It reflects only the records and fields available in the selected CSV.

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

The project includes a dependency-free Node.js test suite for CSV parsing, timestamp handling, event-field extraction, detection rules, and all four checked-in sample datasets.

~~~bash
npm test
~~~

Node.js 18 or later is required to run the tests. The browser-based analyser still runs without installing Node.js.

## Know the limits

This project is an educational aid for deciding what to inspect next. It does **not**:

- prove that activity is malicious, authorised, or harmless;
- parse raw **.evtx** files, Sysmon data, or every Windows Event ID;
- replace a SIEM, EDR, incident-response process, or professional SOC judgement;
- guarantee event order for ambiguous or unrecognised timestamps — the tool reports those rows and uses CSV row order as a fallback;
- know your organisation's normal baseline, logging policy, change records, or retention gaps; or
- establish that events with different users, hosts, or contexts are related.

Mistyped passwords, stale service credentials, account management, group changes, services, PowerShell activity, and cleared logs can all be legitimate in the right context. Validate important findings with authorised sources before escalating.

## Built with

**HTML · CSS · Vanilla JavaScript · Browser File API**

No runtime libraries or third-party services are required by the analyser.

Created by **Namitesh Pandey** for learning and portfolio use.

**Investigate the evidence. Keep the human in the loop.**

Repository shared for portfolio and educational viewing. No licence is granted at this time.
