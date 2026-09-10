# Philipp handoff — complete local invoice demo

Date: 2026-09-10. Code branch: `julie-local`. Planning worktree: `../openai-sep-26-coord`, branch `coordination`.

Julie asked for the entire build, so both extension and backend workstreams have been implemented locally against the newer ambient vendor-bill brief. This is implementation coverage, not an assignment of ongoing human ownership. The old journal prototype is preserved under `journal-prototype-v0.1`.

## Ready

- pnpm TypeScript packages; WXT + React extension, shared panel and demo workbench.
- Named workspaces, selected tabs, draggable icon, contextual offers, dismiss cooldown, task progress, chat, pause/stop/remove controls.
- Fastify WebSocket bridge; one controlling task per workspace, explicit command results, page/document versions, cancellation and no command replay.
- Live Astra through the Agents SDK; coordinator, investigator and bill preparer; separate task sessions and compact workspace summaries in local SQLite.
- Source-linked invoice findings; deterministic exact-match comparison and evidence validation; vendor onboarding outcomes.
- User-selected bill preparation with fixed candidate values, currency/field checks, compare-before-write, verification and no Save.
- A complete live-Astra recording on synthetic browser applications. The packaged extension also passed an isolated Chrome integration test.

Run and extension loading instructions are in the root README. `.env`, `.local`, logs and recordings are excluded from Git. Use your own local API key and pairing token on your computer.

## First shared interface

`packages/shared/src/index.ts` is the executable contract. Browser and UI sockets authenticate with `hello`; the API key never enters this protocol. A browser sends its supported-tab inventory and context only for its selected workspace. The server sends `browser.watch`, `browser.command`, `browser.cancel`, and state updates.

Every command contains workspace/task/command IDs, a tab/frame target, phase, and expected document/page versions. Responses explicitly report success with a fresh observation or failure with `not_executed`/`unknown`. Unknown outcomes fail the task. Reconnection does not replay commands.

Generic investigation writes are limited to search/filter fields. Preparation goes through `prepare_selected_bill`: arguments contain only the selected tab; approved invoice values are fixed in the backend closure. Save/Submit and other sensitive controls are blocked in the page runtime independently of model instructions.

For contract changes, edit the shared schema and both endpoints together; run `pnpm check:ambient` and `pnpm test:ambient-browser`.

## Remaining integration work

The real NetSuite/Gmail/Sheets profile has not been inspected by this task. The generic adapter intentionally stops when controls cannot be identified uniquely. Real NetSuite vendor widgets, amount/line handling, required custom fields and frames need observed-page adapters if they differ from semantic HTML controls. Gmail attachments and canvas-only Sheets content are not yet extracted.

Prepare the dedicated logged-in profile and actual sample invoice. Confirm the expected expense account, tax and posting period. Validate a read-only investigation before attempting unsaved preparation. Review unsupported fields manually; this version never submits a bill.

No merge or push has been made by this handoff. Local code and planning commits are separate; the planning branch should not be merged into application code.
