# Browser and Windows validation

## Core checks

Node.js 22+ is required. Core checks and Node tests use built-in modules and can run without installing browser dependencies:

~~~bash
npm run check
npm test
npm run package -- --check
~~~

The Node suite covers parsing, detections, report safety, worker/fallback behaviour, profiles, mixed-file collections, duplicate thresholds/provenance, per-rule coverage, current and legacy case round trips, malformed cases, annotation retention, cancellation, and reproducible source packaging.

## Actual browser tests

Install the pinned development dependency and browser binaries:

~~~bash
npm ci --ignore-scripts
npx playwright install --with-deps chromium firefox
npm run test:browser
~~~

The development dependency is Playwright Test; it is never loaded by the public analyser. Browser use still requires no npm install or build.

The suite uses a loopback-only static server at http://127.0.0.1:4173 and fictional fixtures. It runs desktop Chromium, desktop Firefox, and a mobile Chromium viewport. It checks:

- CSV/XML/JSON/JSONL uploads through actual file choosers and worker processing;
- complete-case downloads and reopening, including notes, tuned scores, and thresholds;
- multi-file chooser/drop flows, mixed formats, duplicate filters, failed-batch preservation, and combined fallback limits;
- visible per-rule field gaps and coverage updates after profile changes;
- full report compatibility, malformed/scoped-file rejection, and preservation of the current case;
- cancellation of a pending worker and subsequent uploads;
- spreadsheet-safe CSV downloads and escaped source markup;
- visible keyboard focus, page width, stacked Field Guide/Quick Reference, and creator typography;
- unexpected page errors and requests outside the loopback origin.

To run one project:

~~~bash
npm run test:browser -- --project=chromium-desktop
~~~

Failure screenshots/traces go to test-results/ and are excluded from source ZIPs. The test server serves only runtime assets, supplied samples, and the converter; event files are read with the browser File API rather than uploaded.

For environments with an already installed Chromium executable, TRIAGE_CHROMIUM_EXECUTABLE can select its path. TRIAGE_CHROMIUM_ARGS can supply a JSON array of launch arguments. These overrides are only for testing; the normal CI configuration uses Playwright-managed browsers. Record the actual browser version when reporting such a run.

Automated layout/focus tests are not a full screen-reader or device audit.

## Windows converter tests

Run from Windows PowerShell 5.1 or later:

~~~powershell
.\tests\export-tool.test.ps1
.\tests\export-real-evtx.test.ps1
~~~

The first uses mocked records to test output, literal paths, bounds, overwrite refusal, replacement, and failure cleanup.

The second requires an elevated Windows PowerShell session and Node.js 22+. It creates a uniquely named private event log containing fictional events, exports it to a real binary EVTX file with wevtutil, converts it with the bundled helper, and checks the result using the shared JavaScript XML adapter. It verifies oldest-first selection, MaxEvents, a filename containing square brackets, explicit replacement, and unchanged EVTX source bytes. It removes only its own private log/source and temporary files afterward.

The integration test never reads or clears existing Security/Application/System logs. Generated fixtures are temporary and are not committed or uploaded as artifacts.

These tests are included in Windows CI. A Linux environment cannot execute the Windows event-log API; adding the workflow does not by itself mean its latest source package has completed a Windows run.

## CI and release checks

[Continuous integration](../.github/workflows/ci.yml) runs Node 22/24 checks, a separate browser job, and Windows smoke/integration jobs. Browser dependencies are installed only in the browser job.

[Release validation](../.github/workflows/release-check.yml) requires successful Windows checks and browser tests before packaging. A v* tag must match package.json. The workflow uploads source ZIP/checksum artifacts; it does not publish a release or deploy the website.

Primary references: [Playwright browser setup](https://playwright.dev/docs/browsers), [Playwright projects](https://playwright.dev/docs/test-projects), [Playwright test server](https://playwright.dev/docs/test-webserver), and [Microsoft wevtutil](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wevtutil).

## Validation of the delivered v1.6.0 package — 25 October 2026

- Core source checks and **249 Node tests passed** on Node 24.19.0.
- **28 actual browser tests passed** across desktop and mobile Chromium, using Chromium 153.0.8010.0 through the documented executable override. Browser-managed binaries were not available in this preparation environment.
- The configured suite contains **42 tests** across Chromium desktop, Firefox desktop, and Chromium mobile. Firefox was not run locally for this ZIP.
- The Windows converter and its integration test are unchanged from the main baseline that passed GitHub Windows validation. This uncommitted ZIP has not run CI; Windows and Firefox checks should run after you upload and commit it.

## Remaining-upgrade validation (v1.7.0)

The Node suite adds standard SHA-256 vectors, exact UTF-16/BOM/line-ending hashing, unavailable-hash behavior, saved-hash validation, current ATT&CK link/applicability tests, and printable HTML safety/scope/limit tests. Browser checks add original-byte fingerprint round trips, explicit recorded status, safe official reference links, and printable downloads across scopes/pages.

The full browser configuration now has 54 cases across Chromium desktop, Firefox desktop, and Chromium mobile. Local validation used Chromium 153.0.8010.0 for 36 desktop/mobile cases; final GitHub CI verifies the standard browser projects and Windows fixture checks after the commits. Printable output is also rendered to A4 PDF and visually inspected during preparation.
