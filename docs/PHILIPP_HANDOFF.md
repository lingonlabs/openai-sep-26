# Implementation handoff — scope alignment pending

Date: 2026-09-10. Implementation branch: `julie-local`.
Planning worktree: `../openai-sep-26-coord`, branch `coordination`.
Planning baseline read: `ebbd16b`.

## What exists

This branch started from the two Close Copilot PDFs and the chat-approved
journal-entry plan, before the coordination branch was available locally.
It provides a runnable synthetic journal fixture, Save controller, Zod
contracts, local paired relay, live Responses API provider, deterministic
demo provider, all 14 Gate cases, and an extension shell.

The shared brief instead targets vendor-bill discovery across selected
NetSuite and Gmail tabs. No team owner is claimed here and no shared
coordination status has been changed. Resolve the target workflow and shared
contract together before implementing either side against this branch.

## Reusable pieces

- `EntrySchema`, decimal money handling, stable form fingerprints, and
  compare-before-write changes illustrate the intended validation approach.
- `GateController` rejects stale approvals, duplicate Save attempts, and
  mismatched response IDs; it separates block, warn, and unavailable states.
- `FixtureAdapter` demonstrates exact field writes and DOM verification.
- The relay demonstrates localhost pairing, runtime validation, cancellation
  signals, explicit demo/live modes, and logging without raw account data.
- The tests establish cancellation, one-use continuation, balanced changes,
  and source-reference checks that can be adapted to a bill workflow.

The HTTP contract and source layout are not the coordination brief's proposed
WebSocket contract or pnpm/WXT layout. Reuse selected pieces deliberately;
do not treat the current relay as the agreed backend architecture.

## Current Gate contract

`POST /api/gate` receives `requestId`, `fingerprint`, `packVersion`, and a
validated journal entry. It returns those identifiers, a structured verdict,
and mode/model/timing/token metadata. All API routes except health require
`X-Close-Copilot-Token`. `GET /api/pack` supplies synthetic source records.

For UI integration, the page adapter supplies:

```ts
interface FormAdapter {
  read(): Entry;
  save(): void;
  apply(changes: Change[], signal: AbortSignal): Promise<void>;
}
```

`save` must invoke the native application's validated Save path exactly once.
This is proven only for the synthetic form. It is not a production adapter.

## NetSuite investigation still required

The sandbox origin is configured locally in `.env`. The real page has not
yet been inspected. Once the workflow is settled, inspect its actual route,
form, field labels, line handling, Save variants, and frames using the demo
Chrome profile. Decide whether the first adapter is for a vendor bill or a
journal entry before writing selectors.

For the ambient bill workflow, jointly define context, suggestion, command,
and tool-result messages with workspace IDs, task IDs, command IDs, page
versions, success/error discriminants, and selected-tab boundaries. Confirm
Gmail demo access and default search scope. Optional Sheets support can wait.

## Inputs needed

- Julie/Philipp: confirm which workflow supersedes the other.
- Julie/Philipp: assign extension and backend owners.
- Julie: configure `OPENAI_API_KEY` locally, then run the access smoke check.
- Browser owner: prepare the dedicated Chrome profile and logged-in tabs.

No credentials or live account contents belong in the shared coordination
document or implementation repository.
