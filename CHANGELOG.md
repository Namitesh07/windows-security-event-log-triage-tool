# Changelog

## Unreleased — upgrades 5–10

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
