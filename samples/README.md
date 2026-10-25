# Fictional practice cases

All supplied people, hosts, domains, and activity are fictional. Example IP addresses use documentation ranges. Findings are review cues, not proof of compromise. Load these files through the event-file chooser; the five original CSV cases also have built-in demo buttons.

## Existing demos

| File | Exercise |
| --- | --- |
| [normal-windows-events.csv](normal-windows-events.csv) | Inspect ordinary logons without treating each successful login as suspicious |
| [password-guessing.csv](password-guessing.csv) | Trace matching failures followed by success and review the source/host/account context |
| [account-persistence.csv](account-persistence.csv) | Follow account creation into a privileged group addition |
| [suspicious-admin-activity.csv](suspicious-admin-activity.csv) | Review log clearing, services, and script/process cues with benign alternatives in mind |
| [correlation-policy-lab.csv](correlation-policy-lab.csv) | Investigate spraying, account/credential/task/policy cues and correlation coverage |

## New curated cases

Expected results below use the **default profile and default correlation settings**. [manifest.json](manifest.json) records event counts and rule expectations; regression tests execute every case.

| File | Events | Expected rules | Lesson |
| --- | --- | --- | --- |
| [authentication-sequence.xml](authentication-sequence.xml) | 6 | AUTH_SUCCESS_AFTER_FAILURES — 60/High | Five matching failures then success, with native XML and seven-digit timestamp fractions |
| [authentication-sequence.json](authentication-sequence.json) | 6 | AUTH_SUCCESS_AFTER_FAILURES — 60/High | Equivalent evidence represented as named JSON event fields |
| [authentication-sequence.jsonl](authentication-sequence.jsonl) | 6 | AUTH_SUCCESS_AFTER_FAILURES — 60/High | Equivalent evidence as one object per line |
| [account-lifecycle.xml](account-lifecycle.xml) | 2 | ACCOUNT_CREATED_PRIVILEGED_GROUP — 80/High | Target SID and reporting host link creation to privileged group membership |
| [benign-process-review.csv](benign-process-review.csv) | 2 | None | An editor launch and PowerShell Get-Date do not match the process heuristics |
| [incomplete-authentication.jsonl](incomplete-authentication.jsonl) | 2 | None; one record excluded from authentication correlation | Missing timestamps are coverage gaps, not evidence of a timed sequence |
| [separate-hosts.json](separate-hosts.json) | 6 | None | Failures split across reporting hosts cannot satisfy one same-host threshold |

No findings in a fixture means only that these records do not trigger a current enabled rule. An incomplete collection can still hide important activity.

## Suggested exercises

1. Load each authentication-sequence format. Compare rule ID, six supporting records, score contributions, target/domain, source, and host. Normalized findings should agree; source locations and original representations differ.
2. Load [profiles/lab-tuning.json](profiles/lab-tuning.json) under the rules panel. The same sequence becomes Medium/40 while retaining the same evidence; reset to restore High/60. The profile also disables TASK_DELETED.
3. Export the report and inspect its ruleProfile, resolved ruleCatalog, inputFormat, sourceRecord, and sourceLine. JSON has record numbers with null source lines; JSON Lines and XML retain physical locations.
4. Open the incomplete and separate-host cases. Explain why a missing timestamp or mismatched host prevents a correlation. Inspect the preserved events rather than interpreting a quiet report as a clean bill of health.
5. Review the benign process case alongside suspicious-admin-activity.csv. Compare actual command/process fields with free-text messages and list legitimate administrative explanations.

Read the [input guide](../docs/inputs.md), [detection guide](../docs/detections.md), [rule-profile guide](../docs/rules.md), and [report guide](../docs/reports.md) for exact boundaries. Do not replace these fictional fixtures with sensitive operational logs in a public repository.

## Multiple-file overlap exercise

Select both [overlap-first.csv](collections/overlap-first.csv) and [overlap-second.csv](collections/overlap-second.csv) together. Seven original records yield six records included in analysis after one confirmed overlap is marked; AUTH_SUCCESS_AFTER_FAILURES emits one finding. Neither file alone meets the default failure threshold. See [collection walkthrough](../docs/collections.md) and [rule coverage](../docs/coverage.md). These fixtures are fictional.
