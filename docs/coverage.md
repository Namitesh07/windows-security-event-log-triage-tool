# Understand per-rule coverage

After analysis, expand **Per-rule coverage and data gaps**. Every catalog rule appears, including rules that emitted no findings. Coverage uses the entire loaded collection and the profile/settings that produced the report, excluding confirmed duplicates. Evidence filters do not silently narrow these counts.

| State | Meaning |
| --- | --- |
| Assessed | Required input fields are available for relevant records. Matching conditions and thresholds may still fail, or a more specific sequence may use the evidence. |
| Partly assessed | Some records lack required fields or contain separate script fragments. Available fields/text were assessed. |
| Insufficient data | No relevant record has all required fields, or a correlation lacks a required companion event type. |
| No relevant events | None of the rule's Event IDs are in the collection. This says nothing about whether the activity occurred or auditing was enabled. |
| Disabled | The active rule profile prevents this rule from emitting findings. |

Open a rule to see relevant/eligible/excluded counts, emitted findings, required fields, missing fields with example event UIDs, missing companion events, and collection/logging context. A field-gap count can overlap another gap: one event can lack several fields. The collected Event IDs describe prerequisites, not findings by themselves.

## Examples

- Authentication correlations need a usable timestamp with a time of day, target identity, reporting host, and source. Failure bursts can use a workstation when no IP is present; password spraying requires an IP. Failure-to-success also needs both failed and successful logon types. Identity, host, source, timestamp basis, order, thresholds, and windows still have to agree.
- Account-creation/group correlations need both event roles, target/member identity, reporting host, and usable time. Privileged sequences also need a recognised group name/SID. Standalone account/group review cues may be replaced by a more specific sequence.
- PowerShell process rules need a process path to establish PowerShell context, then a command line to inspect. Event 4104 needs script text. A notepad process does not require a PowerShell command, because it is outside that context.
- Process-parent rules need both paths. Remote script-host rules need a command line only once the recorded process is mshta/regsvr32.
- Some rules intentionally emit a review cue from the Event ID alone, such as service installation or task creation. Missing detail fields are shown as investigation-context warnings rather than blocking a cue that the engine can actually emit.
- Script fragments are assessed separately. Coverage warns that text spanning fragments is not reconstructed, even when an available fragment already fires a cue.

## What coverage cannot establish

An assessed rule is not a clean bill of health, evidence that auditing was enabled throughout the collection window, or proof that enough events were collected. The app cannot infer missing retention, disabled logging, unexported channels, attacker intent, or the organisation's baseline. A rule can have zero emitted findings because conditions were not met, thresholds changed, or another correlated finding consumed the same evidence.

Missing-field examples use case-local UIDs; inspect those records in Parsed events for original values and filenames. Logging hints describe the existing supported Event IDs and collection requirements. They do not inspect or alter Windows audit policy.

JSON reports carry structured **ruleCoverage** and a **ruleCoverageScope** label. UI exports retain entire-collection coverage even for scoped evidence. Findings CSV adds the related rule's coverage data. Reopening a case recalculates coverage using the current engine and restored profile/settings. See [reports](reports.md), [rules](rules.md), and [collections](collections.md).
