# Changelog

## Unreleased — v1.5.0 / upgrades 19–20

### Added

- Save entire case and Reopen a saved case controls, preserving source evidence/locations, notes, annotations, settings, and rule profiles without uploads or automatic storage.
- Compatibility with entire-dataset schema 1.1 JSON reports from v1.4.0 onward; scoped reports are refused. Saved-case envelope schema is 1.0.
- Strict validation of record identities, source fields, settings/profiles, note limits, and annotation references; findings are recalculated instead of trusting saved scores.
- Reopen provenance and notices for tool/rule-version and browser-timezone differences. Failed/cancelled loads preserve the current case.
- Playwright projects for desktop Chromium, desktop Firefox, and mobile Chromium, covering uploads, downloads, cases, cancellation, safe rendering, focus, and layout.
- Windows integration checks that create a private fictional log, export genuine EVTX, run the local converter, and verify XML with the shared adapter.
- CI/release browser and Windows gates, a pinned development-only test dependency, test documentation, and case workflow guidance.

### Compatibility and packaging

- Saved-case reopening supports 50 MB with workers and 2 MB in fallback mode; the existing event-input limits remain unchanged. Default detection conditions/points are unchanged.
- JSON report schema remains 1.1 with optional caseOrigin provenance; tool version is 1.5.0 and rules version remains 2026-10-22.
- Source ZIPs now contain project files directly at the archive root, avoiding an extra project folder during upload. Browser binaries, dependencies, screenshots, and test results are excluded.
- Runtime script and worker URLs carry the tool version so a new upload does not reuse an older cached worker.
- Node/core tests require Node 22+ without npm install. Browser tests require npm ci and Playwright browser installation; ordinary browser use still requires no installation or build.

## v1.4.0 / upgrades 15–18

### Fixed

- Corrected the uploaded repository layout so the v1.4.0 app, documentation, tests, and CI workflows are at the repository root. Preserved the bottom-right creator credit and removed the redundant nested source copy.

### Added

- Windows Event XML, JSON, JSON Lines/NDJSON imports alongside CSV, with UTF-8/BOM-marked UTF-16 decoding, explicit errors, and preserved source records/locations.
- Local Windows PowerShell EVTX-to-XML conversion helper; binary EVTX browser parsing remains out of scope.
- Human-readable versioned catalog for all 23 existing rules, generated browser asset, visible rule list, and validated data-only profiles for enabled state and contribution points.
- Exact applied profile, effective rule weights, and input-format/source-location provenance in JSON and CSV reports.
- Seven curated practice cases covering equivalent formats, account lifecycle, benign process activity, incomplete timestamps, and host isolation; fixture manifest, exercises, and collection/rules/development guides.
- Dependency-free generation, syntax/version/link checks, Node 22/24 CI, Windows converter checks, tag/version validation, and reproducible source archives with SHA-256 checksums.

### Behaviour and compatibility

- Default matching conditions and points remain unchanged. Disabled sequence rules do not suppress enabled standalone fallback cues.
- Seven-digit ISO fractions are accepted and calculated at millisecond precision; original timestamps remain evidence.
- Both processing modes enforce 100,000 accepted events; hosted workers keep the 25 MB limit and direct-file fallback keeps 2 MB. XML/JSON adapters cap distinct fields at 512 and nesting at 48.
- Report schema is 1.1; CSV provenance columns are appended. Legacy CSV-row columns remain blank for non-CSV sources.
- Developer tooling now requires Node.js 22+. Browser use still needs no build, install, external service, or upload.
- Release workflows validate/package source without publishing releases or deploying. This source package was prepared without committing or pushing.

## v1.3.1 — Frontend refresh

- Applied the violet/pink/soft-blue theme and refreshed frontend styling.
- Expanded the page to use available width with responsive gutters.
- Kept Field Guide full width above Quick Reference and reduced excess panel whitespace.

## v1.3.0 / upgrades 11–14

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

