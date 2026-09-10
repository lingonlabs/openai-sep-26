# Prototype validation

Verified on 2026-09-10 with Node 25.6.1 and pnpm 10.30.2.

| Check | Result |
| --- | --- |
| Dependency publication dates | All 699 locked registry versions passed the 14-day minimum-age check, including Markdown, transitive and optional packages. |
| Automated tests | 42 tests passed, including visual-only changes and persisted image baselines, progress-aware recovery, handoff confirmation, queued updates, Stop during review, per-message findings, control freshness, return visits, popup choices, Markdown, and unsafe-content handling. |
| Type checking | Shared contracts, server, and extension passed. |
| Production build | WXT Chrome MV3 build passed. |
| Live Astra connection | Successful API response using the configured model. |
| Live Agents SDK tool loop with synthetic observations | Correctly classified NS-1041 as recorded and NS-1042 as a candidate, with two sources each. |
| Interface preview | Visually checked; 390px viewport checked for horizontal overflow. Preview is labeled and cannot control tabs. |
| Extension pairing and workspace | User loaded the unpacked extension, paired it, and selected the NetSuite sandbox in a workspace. |
| Real NetSuite inspection | Completed one agent-requested inspect action through the paired extension. Astra identified the Home dashboard and its navigation/form controls. No click, fill, navigation, or save was requested or performed. |
| Real ambient suggestion | After the rebuild/reload instructions, the user opened Add New Bill in NetSuite and confirmed that the floating suggestion appeared. |

The real test used the local development control endpoint to start a task in the
same Hub/Agents SDK workflow used by the side panel. The browser observation came
from the extension's selected tab. No direct Chrome automation or application
connector was used. Account content and credentials are excluded from this record.

## Next real-account checks

- Verify dismissal and pause on the real bill page; detection and the floating suggestion are user-confirmed.
- Select demo Gmail and accept an investigation; verify search and invoice reading.
- Compare invoice evidence with NetSuite, including duplicate and uncertain matches.
- Include the vendor Sheet if desired and test its actual representation.
- Prepare an unsaved bill and rehearse stop, stale-page recovery, and human review.

The successful Home inspection establishes the real agent-to-extension round trip.
It does not yet establish reliable bill entry, Gmail search, attachment reading,
Google Sheets interaction, or completion of the full closing scenario.

## Browsing and visibility fixes

The first Gmail investigation inspected both Gmail and NetSuite but failed to fill
search twice. Its result explicitly reported page-change errors and incomplete
comparison. The observer previously rejected actions after any DOM mutation, even
when the target control was unchanged. It now validates the latest inspection,
page URL, original connected/visible DOM node, control attributes, label, and value.
Unrelated mailbox updates can proceed without invalidating a stable search field.

The side panel now opens Activity on task start, shows current work and elapsed
time, retains each browser error, and renders Markdown with tables and links.
The local synthetic activity preview was checked for rendered headings, lists,
tables, and readable failure details. Real account data is not used in that preview.

Suggestion suppression now belongs to one bill visit instead of suppressing every
bill for the same vendor for a day. Automated tests cover new documents and leaving
then reopening a bill within the same document. Live repeat-visit verification is
still pending. Extension reloads now preserve tab selection; only the actual Chrome
startup event clears stale tab IDs. The first live retry filled the search field
successfully and exposed its “Ask Gmail” label. Search recognition now uses the
control’s search role, region, type, or Gmail query-field identity, with a regression
test ensuring ordinary form fields cannot use Enter.

## Persistent ambient agent (2026-09-10)

- Standing instructions, compact summaries, observed visits, offer/response history,
  and task outcomes persist per workspace in SQLite.
- Automated tests cover memory restoration, duplicate observations, reloads,
  workspace isolation, instruction changes, cancellation of in-flight inference,
  suppression during execution, fresh baselines after execution, stale responses,
  and invalid model references. The full suite has 25 passing tests.
- Type checks and production build pass. No dependencies were added in this change;
  the existing 699-package release-age audit remains applicable.
- A real Astra test using synthetic observations produced a question with choices
  on a fifth observed invoice visit. After an explicit decline, the next evaluation
  stayed quiet. Run `node --import tsx --env-file-if-exists=.env apps/server/src/smoke-ambient.ts`.
- The local Help me with… preview was inspected for instructions, toggles, editable
  text fields, remembered context, recent decisions, and status.
- User reloaded the extension and confirmed the new tab is visible. Live workspace
  observations reached Astra. It offered help on the NetSuite bill page and stayed
  quiet on subsequent minor changes while the offer remained pending.
- Astra correctly reported that the onboarding sheet exposed no vendor rows. New
  vendor detection in this real Sheet is not validated and needs a browser-content
  capture improvement. No claim of complete-sheet monitoring is made.

The deterministic bill detector now supplies context only. The previous direct
bill-suggestion trigger has been replaced by model evaluation and remembered
responses. The older validation sections describe the baseline on which this was built.

## Return-visit offer repair (2026-09-10)

The user reported no visible offer while the remembered summary still described
one as pending. Live history confirmed the return visit had been observed. Offers
removed by navigation were not reflected in the model's summary, and coalesced DOM
updates could also overwrite a new-visit signal before evaluation.

The evaluator now receives the authoritative current offer list; navigation and
expiry record removal without implying a decline. Only explicit responses impose
the repeat cooldown, and coalescing preserves the visit and comparison baseline.
Two regression tests cover these paths, including pending-offer deduplication and
explicit dismissal. All 27 tests, type checks, and the production build pass.
A real Astra test with synthetic data offered help on a reopened bill despite a
stale pending-offer summary, and the declined follow-up still stayed quiet. The
local backend was restarted; no extension reload is required for this repair.

## Inline floating choices (2026-09-10)

The floating popup now renders the shared action card with choices, Something else,
Continue, and Not now. It shows progress and Stop during execution and displays
action errors. React preserves drafts/focus across background presence updates.
Opening the assistant uses the global panel's window context in the original click
handler; Chrome failures are surfaced with an explicit assistant-tab fallback.

All 29 tests, type checks, and the production build pass. The actual popup component
was exercised in an isolated shadow root on the synthetic localhost preview:
custom text survived several background updates, Continue submitted that text,
a selected alternative submitted its prompt, working progress replaced the offer,
and a simulated panel failure exposed the working fallback action. No real account
actions were performed for these UI checks. Native Chrome panel opening requires
validation after the user reloads the extension. No dependencies changed.

## Persistent investigation and compact findings (2026-09-10)

User confirmed the inline popup works. The next reported investigation stopped
after five browser actions while citing a historical Gmail failure; it had not
retried Gmail search or opened the message in that turn. Added completion review
with bounded same-task recovery, blocked status with a specific remaining step,
and persistent per-message finding associations. Added Gmail message-row controls
to address one likely cause of unavailable message targets.

All 36 tests, type checks, and build pass. Tests cover continued SDK history,
finding attribution and storage, ambient suspension during review, Stop preventing
late continuation, bounded/repeated recovery plans, retained read-only scope,
genuine blockers, and reviewer failure. Real Astra tests with synthetic data
correctly continued past a historical Gmail failure, stopped for missing sign-in,
and accepted a supported read-only result (`apps/server/src/smoke-review.ts`).

The localhost chat preview was checked visually and interactively: findings start
collapsed under their own response and expand independently; earlier attempt text
also starts collapsed. Legacy unlinked findings remain available once. The backend
was restarted after confirming there was no active task. Native Gmail message
opening and the previously incomplete invoice workflow still need live validation
after reloading the extension. No new dependencies were installed.

## Confirmation, activity state, and continued progress (2026-09-10)

The user reported difficulty confirming a requested PDF step and recognizing idle
state. Local extension state also confirmed a task had hit the three-pass cap while
the reviewer identified another investigation step. Recovery now continues with
fresh evidence within the existing ten-minute limit; repeated plans without evidence
and consecutive stalled passes still pause. This supersedes the earlier pass cap.

Structured handoffs in chat and the floating popup provide confirmation, Continue
task, and free-text updates. Replies during execution queue visibly and take
precedence over stale completion-review conclusions. A persistent status indicator
separates task activity from ambient watching. Historical blocked tasks receive a
handoff on load, so the existing conversation can be continued after reload.

All 40 tests, type checks, and production build pass. Regression tests cover five
investigator passes with new evidence, queued replies during review, persisted
handoff continuation, cross-workspace reply rejection, and active/idle UI labels.
The three live Astra completion-review checks with synthetic data also pass.
The actual popup components were exercised in the isolated localhost preview:
confirmation continued the same task, working-state updates showed a queue
acknowledgment, and a paused task exposed its next step and continuation controls.
These checks did not interact with real accounts. The real PDF and NetSuite
workflow still needs user-driven continuation after extension reload. No dependencies
changed.

## Sheet vision and ambient screenshot polling (2026-09-10)

A real read-only task performed exactly one inspect and one screenshot through the
paired extension's selected onboarding Sheet. Astra read all four column headers,
three populated vendor rows, and the selected cell from the screenshot. DOM text
contained the toolbar/document chrome but no grid headers or vendor cells. The
task completed without edits, scrolling, navigation, or accessing other tabs.

Added periodic visual capture for selected Sheets, independent of DOM mutations,
with persisted before/after baselines and multimodal ambient input. All 42 tests,
type checks, and production build pass. Tests establish that changed pixels with
unchanged text reach inference, identical images are skipped, baseline images
survive restart, coalescing retains the original image, and task changes are
baselined rather than evaluated. No packages or styling files changed.

The backend was restarted while idle. Live automatic capture and a user-added row
still need verification after extension reload. Use `node scripts/local-control.mjs
visual-status` to inspect baseline presence and the current decision without printing
screenshots. `test-sheet-vision` repeats the read-only capture test.
