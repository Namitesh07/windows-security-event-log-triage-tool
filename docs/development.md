# Development and source packaging

The analyser remains static HTML/CSS/JavaScript with no runtime dependencies or build step. Node.js 22+ runs the core checks, Node tests, and source packager. Playwright Test is a pinned development-only dependency for actual browser validation; see [testing](testing.md).

~~~bash
npm run check
npm test
npm run package
~~~

Checks validate syntax, generated rules, catalog/engine IDs, tool/package/lock versions, HTML label references, local assets, and documentation links. Edit rules/catalog.json, run npm run generate:rules, and include the generated asset with the catalog.

## Runtime files

Script order is **rules.generated.js → rule-profiles.js → analysis.js → inputs.js → report.js → case-file.js → task-runner.js → script.js**. The worker imports the first six modules itself. Keep worker.js with the page at the same origin. Direct-file mode supports small files without a JSON fetch.

Serve locally with **python3 -m http.server 8000 --bind 127.0.0.1**. Event imports support 25 MB with workers or 2 MB in fallback mode; saved-case reopening supports 50 MB with workers or 2 MB in fallback mode. Both cap accepted records at 100,000.

Preserve the violet theme, wide layout, full-width Field Guide followed by Quick Reference, and uppercase creator credit. Review case save/reopen flows, unsaved notes, profile changes, invalid/cancelled inputs, exports, keyboard use, and target devices.

## Packaging and uploading

The deterministic ZIP now places source files **directly at its root**, including index.html, scripts, docs, samples, tests, tools, and .github/workflows. This avoids an extra project folder when uploading. Copy the archive's extracted contents into the repository root, following [UPGRADE_GUIDE.md](../UPGRADE_GUIDE.md).

Packaging uses fixed ZIP timestamps and sorted, uncompressed entries. SHA256SUMS.txt covers bundled source bytes. Git history, dependencies, browser binaries, test results, screenshots, and previous dist output are excluded. A checksum checks bytes, not event authenticity.

## CI and releases

[CI](../.github/workflows/ci.yml) runs core checks/tests on Node 22/24, actual Chromium/Firefox/mobile browser flows, and Windows converter smoke/real-EVTX checks. [Release validation](../.github/workflows/release-check.yml) gates source packaging on Windows and browser validation.

Workflow permissions are read-only for repository contents and action references are pinned. Checkouts do not persist credentials. Release tags must equal v plus package.json's version, such as **v1.5.0**. Manual dispatch validates the current branch without requiring a tag. Successful runs retain a source ZIP and checksum artifact for 14 days, without publishing a GitHub Release or deploying Pages.

For exact test setup and Windows requirements, read [testing.md](testing.md).
