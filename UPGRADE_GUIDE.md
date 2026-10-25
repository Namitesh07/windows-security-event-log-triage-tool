# Apply upgrades 21–22: multiple-file cases and rule coverage

This complete **v1.6.0** source package is based on main commit **d13a0c28e2d1207bb1b4e70513108cf6ea92d244**. No commit, push, tag, release, or deployment was made for this package.

## Replace the files at the repository root

The ZIP is flat. Your extraction program may still create an enclosing folder named after the archive. **Open that folder and upload its contents, not the enclosing folder itself.**

1. Extract into an empty directory. Find index.html, collection.js, README.md, and package.json at the same level.
2. In your existing repository, place those files beside the existing root index.html, replacing matching files after reviewing any local work.
3. Merge the docs, samples, scripts, tests, tools, rules, and .github folder contents into the folders at the repository root.
4. Preserve .github/workflows, .gitattributes, and .gitignore. Keep your Git history and unrelated work. Do not upload node_modules, dist, test-results, or browser binaries.
5. Before committing, confirm that root package.json says **1.6.0**, root collection.js exists, and root index.html loads collection.js. There should be no new windows-security-event-log-triage-tool-v1.6.0 directory inside the repository.
6. Review the diff and commit when ready. The live demo changes only after your repository deployment.

Suggested one-line commit description:

**Add multi-file event analysis with duplicate tracking and per-rule coverage explanations.**

## What changed

- **Upgrade 21:** up to 20 mixed-format event files in one collection; source IDs, filenames, original locations, per-file diagnostics, source/duplicate filters, and conservative overlap detection. All originals are retained; confirmed duplicates are excluded from rules and snapshot counts. Bad/cancelled batches preserve the previous case.
- **Upgrade 22:** coverage for all 23 rules, including those with no findings. States distinguish assessed, partly assessed, insufficient-data, absent-event, and disabled rules. Details include required/missing fields, example evidence UIDs, missing companion events, emitted findings, script/context warnings, and collection hints.
- **Portability:** reports use schema 1.2 and saved-case envelope 1.1; old report 1.1 / envelope 1.0 single-file cases remain readable. Duplicate links, findings, and coverage are recalculated on reopen. All original records, notes, profiles, settings, and source metadata remain portable.

Event imports allow 25 MB combined / 100,000 source records (including skipped IDs and duplicates), with 2 MB combined fallback. Saved-case reopening keeps its 50 MB worker / 2 MB fallback limits. Default rule conditions and points are unchanged; exclusion of confirmed cross-file overlaps can change correlated results. No event uploads, backend, tracking, or automatic storage were added.

## Validate before committing

~~~bash
npm run check
npm test
npm run package -- --check
~~~

For actual browser validation:

~~~bash
npm ci --ignore-scripts
npx playwright install --with-deps chromium firefox
npm run test:browser
~~~

Try both samples in samples/collections together: seven original records, one confirmed duplicate, and one six-event failure-to-success finding. Save/reopen the case, filter by file/duplicates, and inspect rule coverage. See [collections](docs/collections.md), [coverage](docs/coverage.md), [cases](docs/cases.md), and [testing](docs/testing.md).

Release information belongs in [CHANGELOG.md](CHANGELOG.md) and the repository [Releases page](https://github.com/Namitesh07/windows-security-event-log-triage-tool/releases).
