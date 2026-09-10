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
- Suppress repeated suggestions and agent-generated triggers; recheck page state
  before actions. One agent controls a workspace's browser at a time.

## Ownership

Owners are not assigned yet. Proposed paths below are not scaffolded yet.

| Workstream | Owner | Proposed paths | Responsibility |
| --- | --- | --- | --- |
| Extension | Unassigned | `apps/extension/` | Workspace picker, icon, side panel, observers, browser tools, WebSocket client |
| Agent/backend | Unassigned | `apps/server/` | Coordinator, investigation, persistence, WebSocket server, progress and findings |
| Shared contract | Agree together | `packages/shared/` | Zod schemas, tool inputs/results, context and UI events |

Agree on shared-contract changes before implementing them on both sides.
Include workspace IDs, task IDs where applicable, command IDs, and page versions
in the relevant messages. Tool results must distinguish success from failure.

## Integration milestones

- [ ] Assign owners and agree on the first message schemas.
- [ ] Detect the real NetSuite bill screen and send its context to the backend.
- [ ] Return and display a suggestion beside the watched-page icon.
- [ ] Execute one agent-requested browser action and return its observation.
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

| Workstream | Branch / PR | Status | Next step / blocker |
| --- | --- | --- | --- |
| Extension | — | Not started | Assign owner; inspect sandbox bill screen |
| Agent/backend | — | Not started | Assign owner; agree on bridge contract |
| Shared contract | — | Not started | Define first context, suggestion, command, and result messages |

## Handoff log

Append concise entries: date, owner, commit/PR, changes, verification, next step.

- 2026-09-10 — Initial coordination plan created. Repository has no application
  implementation yet; owner assignments and shared schemas remain open.
- 2026-09-10 — Created the separate `openai-sep-26-coord` worktree on the
  `coordination` branch and moved both planning documents there for publication.
