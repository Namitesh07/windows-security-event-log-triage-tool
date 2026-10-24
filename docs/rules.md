# Versioned rules and optional tuning profiles

The current catalog is **fieldnotes-windows-triage**, schema **1.0**, version **2026-10-22**, with **23 rules**. Default conditions and contribution points are unchanged from v1.3.1. See [detection conditions and logging requirements](detections.md) before interpreting a finding.

## Inspect the catalog

[rules/catalog.json](../rules/catalog.json) is the canonical human-readable definition file. Each rule has a stable ID, title, ordered score contributions, explanation, benign context, and suggested next steps. The page's collapsed **Detection rules and optional tuning profile** section shows IDs, enabled state, and effective points.

Matching/correlation code stays in analysis.js. The JSON layer describes rules and weights; it is not an executable query language. Custom code, regexes, event predicates, additional rule IDs, and network references are not accepted in profiles.

## Load a tuning profile

Create a JSON file or use the [sample lab profile](../samples/profiles/lab-tuning.json):

~~~json
{
  "schemaVersion": "1.0",
  "id": "lab-tuning",
  "version": "1.0.0",
  "rules": {
    "AUTH_SUCCESS_AFTER_FAILURES": { "points": [20, 20] },
    "TASK_DELETED": { "enabled": false }
  }
}
~~~

Choose it under the rules section. A valid selection re-analyses a loaded dataset; the profile also applies to subsequent datasets in the same tab. Invalid profiles leave the successful analysis/profile in place. Reset restores defaults. Download profile saves the current normalized settings for reuse. No browser storage or upload is used.

| Field | Validation |
| --- | --- |
| schemaVersion | Must be the string 1.0 |
| id and version | 1–80 letters/digits/dots/hyphens/underscores; first character is a letter or digit |
| rules | Object keyed by known catalog IDs; omitted IDs inherit defaults |
| enabled | Optional boolean; omitted means enabled |
| points | Optional ordered integer array, one entry per catalog contribution; each value 0–100 |

Unknown keys/IDs, wrong contribution counts, duplicate JSON keys, and invalid numbers are rejected. The UI accepts .json profiles up to 64 KB. A profile version is a descriptive label, not a signature or automatic compatibility promise; known rule IDs and contribution counts are validated against the current catalog.

The example changes a matching authentication sequence from High/60 to Medium/40 without changing its evidence. TASK_DELETED will produce no finding. A rule's zero-point finding is Informational; disabling is separate from assigning zero points.

## Correlation and note behaviour

The existing four threshold/window controls remain separate from profiles and are included in reports. Profiles change enabled state and points only. They do not weaken matching requirements for account/domain/SID, reporting host, source, timestamp, or timezone basis.

When success-after-failures is disabled, an enabled failure-burst rule can still surface its failure evidence. When an account/group sequence rule is disabled, enabled standalone creation/group rules can surface those events. Enabled sequence rules keep the existing duplicate-suppression behaviour.

Case notes remain in the current case across tuning. Finding annotations are associated with the rule plus evidence IDs. Notes for findings removed by tuning remain in the entire-dataset JSON export rather than moving to unrelated findings. Failed/cancelled re-analysis restores the last successful profile and settings.

## Exports and reproducibility

Report schema 1.1 includes the exact normalized ruleProfile, the catalog rulesVersion, enabled state, resolved contribution weights, and effective analysis settings. JSON includes every catalog ID, including disabled rules. CSV appends profile JSON. Compare these values when comparing analyses; a profile name/version alone is insufficient.

Source content, timezone context, engine/tool version, and collection completeness also affect results. Reports are snapshots, not importable saved cases or integrity proofs.

## Maintain the definitions

1. Edit the canonical catalog; keep rule IDs stable. Update catalog.version when changing published definitions or contributions.
2. When adding/removing a detector, update analysis.js, the catalog, detection documentation, fixtures, and meaningful regression coverage together.
3. Run the generator, checks, and tests:

~~~bash
npm run generate:rules
npm run check
npm test
~~~

Commit both the catalog and generated asset yourself. [rules.generated.js](../rules.generated.js) is a checked-in, deeply frozen browser/CommonJS asset generated without external dependencies. It keeps direct-file mode working without a JSON fetch. Do not hand-edit it: CI rejects stale generation and catalog/engine ID mismatches. Contributions are explicit labels/points, never executable text.
