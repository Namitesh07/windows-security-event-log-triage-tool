# Development, CI, and release checks

The app is static HTML/CSS/JavaScript with no runtime dependencies. Developer scripts require **Node.js 22 or later** and use only built-in Node modules; no npm install or browser build is required.

## Local validation

~~~bash
npm run check
npm test
npm run package -- --check
npm run package
~~~

- check validates JavaScript syntax, catalog generation, engine/catalog IDs, package/tool version consistency, HTML IDs/label references, local asset paths, and local Markdown links. It does not contact external documentation sites.
- test runs parser, detection, profile, fixture, report, UI-flow, worker, and source-packaging tests. The UI harness is not a full browser or screen-reader audit.
- package -- --check validates the source-file list without writing an archive.
- package writes a deterministic source ZIP and SHA-256 file to dist/. Timestamps/order are fixed, entries are uncompressed, and SHA256SUMS.txt covers each bundled source file. The archive excludes Git history, dependencies, prior dist output, and personal input files outside the explicit source list.

To update rules, edit [rules/catalog.json](../rules/catalog.json), run **npm run generate:rules**, and include the regenerated rules.generated.js alongside it. See [rules](rules.md).

## Runtime assets

Load scripts in this order: **rules.generated.js → rule-profiles.js → analysis.js → inputs.js → report.js → task-runner.js → script.js**. The worker imports the first five modules itself. Keep worker.js at the same path/origin as the page. Both browser and worker paths use the same parser/detection/report modules; the rules asset is checked in for file:// compatibility.

Serve locally for worker testing:

~~~bash
python3 -m http.server 8000 --bind 127.0.0.1
~~~

Open http://127.0.0.1:8000. Check all five demos, new file formats, invalid/cancelled loads, rule-profile changes/reset, note retention, evidence navigation, exports, keyboard operation, and responsive layout. Direct-file mode has a 2 MB fallback; HTTP(S) worker mode has a 25 MB limit. Both cap accepted records at 100,000.

The violet theme and wide page are preserved. Field Guide occupies a full-width row above Quick Reference; do not regress these to side-by-side education panels.

## Continuous integration

[ci.yml](../.github/workflows/ci.yml) runs on branch pushes, pull requests, or manual dispatch:

- Ubuntu checks/tests and packaging-input validation on Node 22 and 24.
- Windows PowerShell parsing and mocked-record execution checks for the local EVTX converter. These cover conversion output, literal paths, overwrite refusal, explicit replacement, and failure cleanup; they do not validate real binary EVTX files.

Workflows use read-only contents permissions and pinned action commits. Checkout does not persist credentials. No dependency install, secret, publication token, or deployment credential is needed.

Windows helper checks can also be run from a Windows PowerShell session:

~~~powershell
.\tests\export-tool.test.ps1
~~~

## Release validation

[release-check.yml](../.github/workflows/release-check.yml) runs for v* tags or manual dispatch. On a tag, RELEASE_TAG must exactly equal v plus package.json's version, for example **v1.4.0**. Mismatches fail checks/packaging. A manual branch run validates its current version without requiring a tag.

The workflow runs local checks/tests, validates the Windows helper, packages source, and uploads the ZIP/checksum as a **validated-source** workflow artifact retained for 14 days. It does not create a GitHub Release, modify repository contents, deploy Pages, or commit files.

Before your own release:

1. Update package.json/tool version together and update catalog.version if definitions changed. Document changes in [CHANGELOG.md](../CHANGELOG.md).
2. Run checks/tests and manually review the browser on target devices. Test the converter against authorised real EVTX on Windows if that input path matters to your users.
3. Inspect the generated ZIP and checksum; ensure all new runtime files and workflow folders are included.
4. Commit/push the reviewed source yourself. Use a matching version tag when ready and inspect successful workflow results before publishing your release manually.

An archive checksum detects changed bytes; it does not authenticate event data or prove a source file was collected correctly. Keep real operational logs outside this public source package.
