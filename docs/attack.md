# MITRE ATT&CK learning references

Findings and per-rule coverage include **MITRE ATT&CK learning references** from the bundled rule catalog. They provide vocabulary and reading links for investigation, not confirmed technique classifications. They add no priority points and do not establish attacker intent, compromise, or authorisation.

References were reviewed against MITRE's official technique pages on **28 October 2026**. The app does not query MITRE or any external service during analysis. Links open the official page only when selected, without sending event values in the URL or a referrer.

| Rule context | Related references |
| --- | --- |
| Same-account failure bursts / failure-to-success | [T1110.001 — Password Guessing](https://attack.mitre.org/techniques/T1110/001/) |
| Multi-account spraying cue | [T1110.003 — Password Spraying](https://attack.mitre.org/techniques/T1110/003/) |
| Account creation / group membership | [T1136 — Create Account](https://attack.mitre.org/techniques/T1136/) and [T1098.007 — Additional Local or Domain Groups](https://attack.mitre.org/techniques/T1098/007/) |
| Windows Security log clearing | [T1685.005 — Clear Windows Event Logs](https://attack.mitre.org/techniques/T1685/005/) |
| Service installation | [T1543.003 — Windows Service](https://attack.mitre.org/techniques/T1543/003/) |
| PowerShell cues | [T1059.001 — PowerShell](https://attack.mitre.org/techniques/T1059/001/); download/evaluation also references [T1105 — Ingress Tool Transfer](https://attack.mitre.org/techniques/T1105/) |
| Office shell/script-host child | Broad [T1059 — Command and Scripting Interpreter](https://attack.mitre.org/techniques/T1059/) context only |
| Remote mshta / regsvr32 | [T1218.005 — Mshta](https://attack.mitre.org/techniques/T1218/005/) or [T1218.010 — Regsvr32](https://attack.mitre.org/techniques/T1218/010/), selected for the observed executable |
| Scheduled task creation/update | [T1053.005 — Scheduled Task](https://attack.mitre.org/techniques/T1053/005/) |
| Audit policy change | [T1685.001 — Disable or Modify Windows Event Log](https://attack.mitre.org/techniques/T1685/001/) |
| Windows Firewall rule/setting change | [T1686.003 — Windows Host Firewall](https://attack.mitre.org/techniques/T1686/003/) |

Use current canonical IDs. Some older references used T1070.001 for Windows log clearing, T1562.002 for Windows event logging, and T1562.004 for firewall changes; the reviewed catalog uses the current pages above.

Lockouts, account deletion, explicit-credential attempts, and task deletion do not receive a speculative technique assignment from their Event ID alone. Their context note explains why. Even mapped cues can describe approved administration: a policy change might enable logging, a firewall change might strengthen security, and encoded PowerShell may be legitimate automation. Read the original fields, benign explanations, and change context.

The catalog stores IDs/names, review date, applicability, and caveats. The app constructs canonical MITRE links from validated IDs. Reopening cases recalculates references using the current catalog, rather than trusting saved URLs or labels. See [rules and profiles](rules.md), [coverage](coverage.md), and [reports](reports.md).
