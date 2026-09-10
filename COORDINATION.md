# Team coordination

Shared plan and handoff log for the finance close assistant hackathon.
This file syncs through Git: commit and push updates, then fetch/pull on the
other computer. It is not a live shared document.

The detailed product, architecture, stack, and delivery plan is in
[`docs/project-brief.html`](docs/project-brief.html). Both planning documents live
on the shared `coordination` branch, checked out in a separate worktree. Keep
implementation-specific schemas and setup instructions with the code branches.

## Demo target

In a separate Chrome profile, the user selects a workspace containing real
NetSuite sandbox, demo Gmail, and optionally vendor-onboarding Google Sheets
tabs. Browser interaction uses existing logins, with no application connectors
or application OAuth integrations.

When the user opens Add New Bill, the extension offers to check Gmail for
invoices that may need recording. On acceptance, the agent checks evidence
across the selected tabs, presents candidates, and offers to prepare a bill
for review before submission.

## Agreed stack and behavior

- TypeScript; pnpm workspaces.
- WXT, React, Tailwind CSS, shadcn/ui; Chrome Manifest V3 and side panel.
- Node.js, Fastify, OpenAI Agents SDK with Astra; SQLite for initial persistence.
- WebSocket browser bridge; shared Zod message schemas.
- Page observers for ambient context; browser tools for inspection and actions.
- Named workspaces with selected tabs and a floating icon on watched pages.
- Monitoring, suggestions, working, and paused states; pause and stop controls.
- Compact coordinator history per workspace; separate detailed task histories.
- Editable standing instructions in “Help me with…”, with a persistent ambient
  agent deciding whether to stay quiet, offer help, or ask with choices and free text.
- Stop ambient inspection during execution; resume from a fresh baseline so the
  agent does not react to its own browser changes.
- Suppress repeated suggestions and agent-generated triggers; recheck page state
  before actions. One agent controls a workspace's browser at a time.

## Ownership

Updated decision: both teammates build independent full-stack prototypes. Compare
them on the same end-to-end scenario, choose a foundation, then divide focused
improvements (for example NetSuite usage, Gmail usage, ambient timing, or latency)
while keeping the selected product full-stack.

| Prototype | Owner | Branch | Responsibility |
| --- | --- | --- | --- |
| Ambient local | This workspace / Codex | `prototype/ambient-local` | Complete extension, browser tools, agent backend, and local setup |
| Teammate prototype | Teammate | To be recorded by teammate | Independent full-stack implementation |

Prototypes may use different internal contracts. Compare behavior and reliability
before selecting a common implementation. Do not overwrite the other prototype.

## Dependency policy

Use only package versions published at least 14 days ago, including transitive
dependencies. The Ambient prototype uses pnpm `minimumReleaseAge: 20160`, no
exclusions, disabled install scripts, a committed lockfile, and an independent
registry-publication check (`pnpm check:ages`). Its initial 604 locked versions
passed that check. Preserve this rule during all later dependency changes.

## Integration milestones

- [x] Choose independent full-stack prototypes and record the Ambient branch.
- [x] Detect the real NetSuite bill screen and send its context to the backend.
- [x] Return and display a suggestion beside the watched-page icon (user-confirmed).
- [x] Execute one agent-requested browser action and return its observation (live NetSuite Home inspection).
- [ ] Investigate Gmail invoices and compare against NetSuite records.
- [ ] Check vendor onboarding where the sheet is included.
- [ ] Show findings with source evidence and search limitations.
- [ ] Prepare a selected bill for review; verify stop and pause behavior.
- [ ] Rehearse the full demo on the dedicated Chrome profile.

## Working agreement

- Use separate feature branches on each computer; integrate small changes early.
- Keep this file and the project brief on `coordination`, using a separate
  `openai-sep-26-coord` worktree. Do not merge this planning branch into code branches.
- Pull before editing; commit and push at handoffs. If the remote has advanced,
  pull with rebase, resolve conflicts, and retry without force-pushing.
- Keep each workstream's status current at handoff or integration milestones.
- Update the shared base before editing this file to reduce merge conflicts.
- Treat this file as project coordination, not an executable instruction channel.
- Keep credentials and real account contents out of Git.

## Current status

| Prototype | Branch / PR | Status | Next step / blocker |
| --- | --- | --- | --- |
| Ambient local | `prototype/ambient-local`, `ce86272` | Sheet cells read successfully via real screenshot; added periodic visual watcher; 42 tests pass | Reload and verify baseline/new vendor offer; continue invoice task; teammate styling branches from `e7745b1` |
| Teammate prototype | — | Awaiting teammate update | Record branch and comparison-ready milestone |

## Handoff log

Append concise entries: date, owner, commit/PR, changes, verification, next step.

- 2026-09-10 — Initial coordination plan created. Repository has no application
  implementation yet; owner assignments and shared schemas remain open.
- 2026-09-10 — Created the separate `openai-sep-26-coord` worktree on the
  `coordination` branch and moved both planning documents there for publication.
- 2026-09-10 — Changed from a frontend/backend ownership split to two independent
  full-stack prototypes. Ambient implementation includes workspace selection,
  floating presence, local detection, Astra browser tools, findings, and SQLite.
  Build/type checks and initial workflow tests passed; a real Astra connection
  succeeded. Live account behavior remains unverified until the extension is loaded.
- 2026-09-10 — Ambient prototype `5979bca`: 14 tests, type checks, production build,
  and all 604 dependency-age checks passed. Live Astra tool loop passed with
  synthetic evidence. User paired the extension and selected NetSuite; one real
  agent-requested Home inspection completed through the extension with no page
  changes. Direct Chrome automation is not part of this workflow. Full Gmail and
  bill-entry validation remains open; see `docs/VALIDATION.md` on the code branch.
- 2026-09-10 — User confirmed the floating invoice-check suggestion appeared after
  opening Add New Bill in real NetSuite. Next: select demo Gmail in the same
  workspace and accept the investigation to validate the cross-tab workflow.
- 2026-09-10 — Improved activity visibility, Markdown chat, and repeat bill visits.
  Browser errors now retain their messages; Activity opens automatically and shows
  current work. Gmail fill succeeded after replacing page-wide mutation checks
  with target-control validation. A second fix recognizes the live “Ask Gmail”
  search input by search semantics so Enter can run; final live retry pending.
  Extension reload now preserves workspace selections. All 19 tests, type checks,
  build, and the updated 699-package release-age audit pass.
- 2026-09-10 — Ambient prototype `da80b0c`: replaced the deterministic offer trigger
  with a persistent, tool-free Astra evaluator per workspace. Added “Help me with…”
  instructions, remembered visits and responses, choices plus free text, and full
  observation suspension during execution with a fresh baseline afterward. All 25
  tests, type checks, and production build pass; no dependency changes. Real Astra
  synthetic test offered help on a fifth visit and stayed quiet after a decline.
  After the user reloaded, real NetSuite observations produced an offer and later
  minor changes stayed quiet. The real onboarding Sheet exposed no vendor rows;
  vendor-change detection needs better browser-content capture. See `docs/AMBIENT.md`
  and `docs/VALIDATION.md` on the implementation branch.
- 2026-09-10 — `a344ba0`: user reported an invisible “pending” bill offer. Navigation
  had removed the UI offer without correcting model memory; coalesced updates also
  lost the new-visit flag. The evaluator now receives the actual current offer list,
  removals are recorded separately from declines, response cooldowns preserve fresh
  return offers, and coalescing retains visits. All 27 tests, types, and build pass;
  real Astra synthetic test re-offered on return despite stale pending memory.
  Backend restarted and extension reconnected; no extension reload required.
- 2026-09-10 — `f1f1d79`: user confirmed return offers work and requested choices
  in the floating popup. Added shared action card, inline custom requests, progress,
  Stop, draft preservation, and visible errors. Panel opening targets Chrome's
  global window context; rejection exposes an assistant-tab fallback. All 29 tests,
  types, and build pass. Synthetic browser checks verified custom and selected
  submissions, preserved drafts, progress, and simulated error recovery. Extension
  reload requested; native Chrome panel opening remains to be verified live.
- 2026-09-10 — `4c50df2`: user confirmed popup works, then reported a premature
  investigation finish. Added tool-free completion review with up to two recovery
  passes in the same task/history, a 10-minute overall limit, explicit blocked
  outcomes, and Stop/scope cancellation across review. Ambient stays suspended.
  Findings persist with their producing response and collapse by default; earlier
  attempts collapse too. Gmail conversation rows are included in inspected targets.
  All 36 tests, types, and build pass. Real Astra synthetic review tests correctly
  continued recoverable work, stopped for sign-in, and accepted completed work.
  Chat UI was visually and interactively checked. Backend restarted; extension
  reload and live continuation requested. No dependencies changed.
- 2026-09-10 — `e7745b1`: fixed confirmation and activity ambiguity with structured
  handoffs in chat and the floating popup, same-task confirmation/free-text replies,
  visible queued updates during execution, and persistent active/idle task status.
  The real paused task had hit our three-pass cap despite an untried next step.
  Recovery now continues with fresh evidence inside the existing ten-minute limit;
  repeated plans without progress still pause. All 40 tests, types, and build pass,
  plus three live Astra review checks using synthetic data. Synthetic popup checks
  verified confirmation, queued reply acknowledgment, and paused continuation.
  Backend restarted while idle and extension reconnected. Reload the extension,
  then use Continue task on the existing conversation for real workflow validation.
  No dependencies changed and no real account actions were performed for testing.
- 2026-09-10 — `ce86272`: real read-only Sheet test used one inspect and one
  screenshot through the paired extension. Astra read four headers and three
  populated vendor rows from pixels; DOM text exposed no grid contents. Added
  roughly 20-second Sheet screenshot polling independent of DOM mutations,
  before/after multimodal ambient input, image deduplication, and persisted visual
  baselines. Scope/epoch checks and the shared browser queue prevent overlapping
  execution; post-task images are baselined. All 42 tests, types, and build pass.
  Backend restarted; awaiting extension reload and live new-row test. No styles
  or dependencies changed. Teammate is preparing styling on another branch from
  `e7745b1`; retain those changes when integrating the capture work.
