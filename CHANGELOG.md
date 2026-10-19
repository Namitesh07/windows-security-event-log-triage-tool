# Changelog

## Unreleased — v1.3.0 / upgrades 11–14

### Added

- Event and finding sorting, selectable event page size, first/last navigation, and paged findings/timelines.
- Separate actions to clear filters within supporting evidence or restore the whole dataset.
- JSON report, findings CSV, and events CSV downloads with dataset/view scopes across all matching pages.
- Exported tool/rule versions, effective settings, source metadata, evidence identifiers, raw fields, and scope details; CSV formula-prefix protection and unchanged strings in JSON.
- Case title, analyst, collection timezone, case notes, and per-finding review status/notes, retained across sorting and re-analysis.
- Cancellable background parsing, analysis, and export, with stage feedback and a bounded 2 MB fallback when workers are unavailable.
- On-demand row inspectors, cached searches, responsive controls, keyboard-visible file selection, named table scrolling, reduced-motion support, and focus management.

### Behaviour and compatibility

- Hosted/background mode accepts CSV files up to 25 MB. Opening index.html directly or running without workers uses a 2 MB limit.
- Failed or cancelled loads preserve the previous case. Replacing unsaved notes requires confirmation; a full JSON download includes inactive finding annotations.
- Scoped exports include only complete findings and their annotations; case context remains included. Overall diagnostics and coverage are labelled as dataset-wide.
- Reports are downloadable snapshots; importing saved cases is not implemented. No automatic storage, detection-rule changes, or GitHub deployment is included in this source package.

## v1.2.0 — 2026-10-15 / upgrades 5–10

- Findings now expose rule IDs, matched values, scoring contributions, and exact CSV evidence with a return path to the finding.
- Authentication analysis uses configurable time windows, account/domain, source, and reporting host; adds distinct-account password-spraying cues.
- New-account/group sequences require matching identity and host within a configurable interval; standalone duplicate account/group cues are suppressed for those sequences.
- Adds documented process-parent, PowerShell encoded-content, download/evaluation, and remote script-host review cues.
- Adds lockouts (4740), explicit credentials (4648), scheduled tasks (4698/4702/4699), audit-policy changes (4719), and firewall changes (4946/4947/4948/4950).
- Adds logon-type context, event-specific logging requirements, an advanced fictional dataset, and regression tests.
- Priority is now derived consistently from visible rule contributions: High 60+, Medium 30–59, Low 1–29, Informational 0.

### Behaviour changes

- Records without a usable timestamp/time of day or required context remain visible but cannot establish timed correlations.
- Mixed local-wall-time and explicit-offset timestamps are kept separate for timed rules.
- Original Windows event Level and the tool's review priority are displayed separately.
- Evidence and filter results can be paged through rather than stopping at the first 1,000 rows.

