# Detection and logging guide

These rules are educational triage heuristics. Validate findings against account ownership, change records, source devices, and endpoint evidence. The tool does not know the local baseline or establish intent.

The canonical [rule catalog](../rules/catalog.json) is version `2026-10-28`. The conditions and default points below are unchanged from v1.3.1. Optional [data-only profiles](rules.md) change enabled state and contribution points; exports include the exact applied profile and resolved weights. All supported [input formats](inputs.md) use this engine.

## Correlation settings and required context

| Setting | Default | Scope |
| --- | --- | --- |
| Failed-logon threshold | 5 attempts | Same affected account/domain, reporting host, and source IP (or source workstation if IP is absent) |
| Authentication window | 10 minutes | Failure bursts, failures before a matching success, and spraying |
| Spray account threshold | 5 distinct accounts | Same source IP and reporting host; repeated attempts on one account count as one target |
| Account-change window | 30 minutes | Creation followed by group addition on the same reporting host and matching account/domain or SID |

All settings can be changed in the page. These defaults are examples for learning and need environment-specific tuning. Intervals include their endpoints. A success must follow its failures; equal timestamps use input-record order. A later failure does not invalidate an earlier matched success.

Timed correlations require parsed timestamps with a time of day, matching timezone basis (explicit offsets versus local wall time), and the required identity/host/source values. Ambiguous, missing, and date-only times are excluded from timed rules. They remain visible in the event table. The coverage notice reports excluded records. The timeline places unparsed times after parsed times in input-record order; it cannot establish chronology for those records. ISO fractions up to seven digits are accepted; calculations truncate to milliseconds and preserve original timestamp text.

Authentication identities retain domain information. Differing known SIDs prevent a match. Password bursts with differing known SIDs are kept separate. Domain aliases and different hostnames are not resolved. Account/group correlations are limited to one reporting host, which can miss valid sequences split across domain controllers. A member SID can match a new-account SID when its account name is absent.

Overlapping successful-logon findings do not reuse the same failure evidence. Standalone account/group findings are suppressed for events already represented in an account/group correlation. Different rules can legitimately share evidence (for example, a PowerShell command launched by Office).

## Evidence and priority

Each finding has a stable rule ID, supporting source-record references, matched values, and a score breakdown. CSV row numbers, XML start lines, JSON record numbers, and JSON Lines physical lines identify the source appropriately. Select View supporting events to scope the table, compare extracted fields with the source, and return with Back to finding. IDs are stable within the loaded dataset and may change if a new export changes record order.

Priority is a deterministic mapping: High = 60 or more points; Medium = 30–59; Low = 1–29; Informational = 0. Windows event Level is preserved separately in the row inspector. The score is assigned by the rule and is not a probability, calibrated risk estimate, or severity supplied by Windows. There is no total dataset risk score.

| Rule ID | Finding | Contributions | Points / priority |
| --- | --- | --- | --- |
| AUTH_FAILURE_BURST | Repeated failed logons | Repeated failures within the configured window (+30) | 30 / Medium |
| AUTH_SUCCESS_AFTER_FAILURES | Possible password guessing followed by success | Repeated failures within the configured window (+30); Subsequent matching successful logon in that window (+30) | 60 / High |
| AUTH_PASSWORD_SPRAY | Possible password spraying across accounts | Distinct targeted accounts from one source and host within the window (+45) | 45 / Medium |
| ACCOUNT_CREATED_GROUP | New account granted group membership | New account (+15); Group addition (+20); Matching identity and host within the configured window (+20) | 55 / Medium |
| ACCOUNT_CREATED_PRIVILEGED_GROUP | New account granted group membership | New account (+15); Known privileged group name or SID (+45); Matching identity and host within the configured window (+20) | 80 / High |
| ACCOUNT_CREATED | User account created | Account creation event (+15) | 15 / Low |
| ACCOUNT_DELETED | User account deleted | Account deletion event (+10) | 10 / Low |
| GROUP_ADDED | Security group membership changed | Group addition event (+20) | 20 / Low |
| PRIVILEGED_GROUP_ADDED | Privileged group membership changed | Known privileged group name or SID (+45) | 45 / Medium |
| AUDIT_LOG_CLEARED | Security audit log cleared | Security log clearing removes local audit history (+70) | 70 / High |
| SERVICE_INSTALLED | Windows service installed | Service installation event (+25) | 25 / Low |
| PS_ENCODED | PowerShell encoded-content cue | Encoded command switch or Base64 conversion in PowerShell context (+40) | 40 / Medium |
| PS_DOWNLOAD_EXECUTE | PowerShell download-and-execute cue | Download and dynamic evaluation patterns in one PowerShell record (+60) | 60 / High |
| OFFICE_SHELL_CHILD | Office application launched a shell or script host | Office parent and shell/script-host child paths in the same process record (+40) | 40 / Medium |
| SCRIPT_HOST_REMOTE | Script host command references a remote resource | mshta or regsvr32 command with a remote resource argument (+60) | 60 / High |
| ACCOUNT_LOCKED | User account locked out | Account lockout event (+25) | 25 / Low |
| EXPLICIT_CREDENTIALS | Explicit credentials used for a logon attempt | Explicit-credential logon attempt event (+15) | 15 / Low |
| TASK_CREATED | Scheduled task created | Task creation event (+25) | 25 / Low |
| TASK_UPDATED | Scheduled task updated | Task update event (+25) | 25 / Low |
| TASK_DELETED | Scheduled task deleted | Task deletion event (+10) | 10 / Low |
| AUDIT_POLICY_CHANGED | System audit policy changed | Audit policy change can affect evidence collection (+40) | 40 / Medium |
| FIREWALL_RULE_CHANGED | Windows Firewall rule changed | Firewall rule change event (+30) | 30 / Medium |
| FIREWALL_SETTING_CHANGED | Windows Firewall setting changed | Firewall setting change event (+30) | 30 / Medium |

## Process and PowerShell cues

4688 needs usable new-process and creator-process paths for the Office-child rule. Encoded-command and download/evaluation cues in 4688 require a PowerShell executable and its command line; arbitrary words elsewhere in the message are not matched as process commands. 4104 cues inspect the script text in each record. Script content is displayed as text and is never executed, fetched, or decoded. Fragment metadata is shown when available; separate fragments are not reassembled, so a pattern split across records may be missed.

The current patterns review PowerShell encoded-command switches or FromBase64String, download expressions together with Invoke-Expression/IEX, Office parents launching shells/script hosts, and mshta/regsvr32 commands referencing remote HTTP resources. Approved macros, installers, and administrative automation can trigger these cues. They do not establish malicious execution. Service image paths are shown separately from process-creation paths.

## Event coverage and logging prerequisites

These entries describe the expected Windows provider/channel. The application reads exported event fields and does not verify authenticity. Structured fields (such as TargetUserName, MemberSid, NewProcessName, and CommandLine) take precedence over English message extraction. Source User metadata is retained separately; it is not used as the target of administrative changes.

| Event ID | Meaning | Channel | Logging / required context |
| --- | --- | --- | --- |
| 1102 | Security audit log cleared | Security | Event Log service records Security log clearing. Fields: Subject, reporting host, timestamp |
| 4104 | PowerShell script block logged | Microsoft-Windows-PowerShell/Operational (or PowerShellCore/Operational) | Enable PowerShell Script Block Logging. Fields: Script block text/ID, fragment number/total, reporting host |
| 4624 | Successful logon | Security | Audit Logon (Success). Fields: Target account/domain, reporting host, source IP, logon type, timestamp |
| 4625 | Failed logon | Security | Audit Logon (Failure). Fields: Target account/domain, reporting host, source IP, logon type, timestamp |
| 4648 | Explicit credentials used for a logon attempt | Security | Audit Logon (Success). Fields: Subject, account whose credentials were used, target server, process |
| 4688 | Process created | Security | Audit Process Creation (Success); enable Include command line in process creation events for command-line cues. Fields: New process path, creator process path, command line |
| 4698 | Scheduled task created | Security | Audit Other Object Access Events (Success). Fields: Task name/content, subject |
| 4699 | Scheduled task deleted | Security | Audit Other Object Access Events (Success). Fields: Task name, subject |
| 4702 | Scheduled task updated | Security | Audit Other Object Access Events (Success). Fields: Task name/content, subject |
| 4719 | System audit policy changed | Security | Audit Audit Policy Change; Windows records this event even when that subcategory is disabled. Fields: Subject, subcategory, audit policy changes |
| 4720 | User account created | Security | Audit User Account Management (Success). Fields: New account/domain or SID, subject, reporting host, timestamp |
| 4726 | User account deleted | Security | Audit User Account Management (Success). Fields: Deleted account, subject |
| 4728 | Added to global security group | Security | Audit Security Group Management (Success). Fields: Member name/domain or SID, group name/SID, subject, reporting host, timestamp |
| 4732 | Added to local security group | Security | Audit Security Group Management (Success). Fields: Member name/domain or SID, group name/SID, subject, reporting host, timestamp |
| 4740 | User account locked out | Security | Audit User Account Management (Success). Fields: Locked account, caller computer, subject |
| 4946 | Windows Firewall rule added | Security | Audit MPSSVC Rule-Level Policy Change (Success). Fields: Rule name/ID, profile |
| 4947 | Windows Firewall rule modified | Security | Audit MPSSVC Rule-Level Policy Change (Success). Fields: Rule name/ID, profile |
| 4948 | Windows Firewall rule deleted | Security | Audit MPSSVC Rule-Level Policy Change (Success). Fields: Rule name/ID, profile |
| 4950 | Windows Firewall setting changed | Security | Audit MPSSVC Rule-Level Policy Change (Success). Fields: Setting type/value, profile |
| 7045 | Windows service installed | System | Service Control Manager service-installation logging. Fields: Service name, image path, account, reporting host |

4624 logon-type labels are context only. For example, type 3 is a network logon and type 10 is a remote interactive logon; neither is suspicious by itself. 4648 records an explicit-credential attempt and does not independently prove successful access. 4946–4948 describe local firewall-rule changes and do not cover every Group Policy change. Task and policy events are review cues even when their detailed fields are absent; the original row and Event ID remain the evidence.

## Microsoft references

- [Windows auditing event reference](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/advanced-security-auditing)
- [4624 logon fields and types](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4624)
- [4648 explicit credentials](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4648)
- [4740 lockouts](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4740)
- [4688 and process command-line logging](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4688)
- [4698 task creation](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4698)
- [4719 audit-policy changes](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4719)
- [4946 local firewall-rule changes](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4946)
- [PowerShell logging on Windows](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_logging_windows)

## Per-rule coverage

Open **Per-rule coverage and data gaps** after analysis to inspect required fields, relevant/eligible counts, missing companion records, profile-disabled rules, and logging context for every catalog rule. This includes rules that emitted no findings. Confirmed cross-file duplicates are excluded from detections and coverage counts; their original evidence remains visible. See [coverage](coverage.md) and [collections](collections.md).

The v1.7.0 catalog adds reviewed ATT&CK learning metadata, including explicit reasons for context-only rules with no assigned technique. This does not alter detection conditions or scores. See [ATT&CK references](attack.md).
