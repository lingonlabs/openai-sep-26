# Ambient · Close companion

A local Chrome extension prototype for ambient finance work. A persistent Astra
companion interprets changes in selected tabs using your standing instructions,
offers choices, and remembers visits and task outcomes. When you choose an action,
a separate execution agent investigates evidence or prepares records for review.

This is one of two independent **full-stack prototypes**. After comparing them,
the team will select a foundation and improve focused areas such as NetSuite
interaction, Gmail interaction, detection quality, and latency.

## Run locally

Use Node.js 22.13+ and pnpm 10.30.2. Node 25.6.1 was used for this build.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Add OPENAI_API_KEY to .env, keeping it out of Git.
pnpm build
pnpm dev
```

Open **http://127.0.0.1:4318/** for setup and practice links. The application runs
locally; Astra inference and the real application websites still require the
internet. The key stays on the server. SDK tracing is disabled in this prototype.

### Load into the demo Chrome profile

1. Open `chrome://extensions` in the separate profile.
2. Enable Developer mode and choose **Load unpacked**.
3. Select `apps/extension/.output/chrome-mv3` in this repository.
4. Pin/open Ambient from the extensions toolbar. The side panel opens.
5. Paste the local token from `.local/pairing-token` into **Connect**. This is
   not the OpenAI API key. Each developer gets their own local token and database.
6. Create a workspace. Select the NetSuite sandbox, Gmail, and optional Sheet tabs.
   Chrome asks for access to the selected sites.
7. Open **Help me with…** to review or edit the workspace’s standing instructions.
8. Open **Add New Bill** in NetSuite. Astra evaluates the observed page and can offer
   choices through the floating icon and workspace panel. Choose an option or write
   something else to begin an execution task.

After rebuilding, use **Reload** on the extension card and reopen its panel.
Extension reloads retain selected tabs. After a full browser restart, reselect the workspace tabs; stale tab IDs are
deliberately cleared. The prototype currently uses port **4318** for the bridge.

## Practice with synthetic data

Open these in the same Chrome profile and select them in a new workspace:

- http://127.0.0.1:4318/fixtures/netsuite
- http://127.0.0.1:4318/fixtures/gmail
- http://127.0.0.1:4318/fixtures/vendors

Click **Add New Bill** on the ledger fixture, choose an offered action, and watch
Activity. The seeded examples include a recorded invoice (NS-1041), a candidate
(NS-1042), and a vendor missing from the register (Acorn Consulting). The fixture
banner explicitly identifies synthetic data. Actual investigations use Astra;
there is no silent mock-model fallback.

`/preview` is a **read-only interface preview** for design review. Its sample
workspace does not control browser tabs and its investigation button is disabled.

## What is implemented

- WXT/React side panel with workspace picker, site permissions, tab controls,
  pairing, suggestions, activity, conversation, findings, and source links.
- Programmatic injection only into selected tabs; floating icon, movable vertical
  position, contextual suggestion, pause/remove controls, and a Stop action.
- Persistent ambient agent per workspace: editable standing instructions, compact
  memory, visit counts, recent decisions, and task outcomes in SQLite.
- Bounded page-text observations are debounced and evaluated by Astra. The existing
  bill-form rule provides a hint; it no longer directly triggers suggestions.
- Offers have 2–3 choices plus free text. Dismiss choices do not start browser tasks.
  Duplicate opportunities have a cooldown and response history.
- Node/Fastify WebSocket bridge with token pairing and an extension-origin check.
- Agents SDK with `gpt-6-astra`, browser tools, typed findings, bounded tasks,
  streaming responses, and SQLite persistence.
- Completion review checks each proposed finish against the request and evidence.
  Recovery continues the same history while making progress, within a ten-minute
  turn limit. Monitoring stays suspended throughout, with Stop available.
- Human handoffs have confirmation and free-text continuation controls in both
  chat and the floating popup. Updates sent during work are acknowledged and queued
  for the next safe boundary. Active/idle task status stays separate from monitoring.
- Findings are linked to their producing chat response and collapsed by default.
  Earlier incomplete attempts are retained in collapsed sections.
- Browser tools: inspect visible page text and controls, click, fill, keyboard
  input for search, scroll, scoped navigation, and debugger screenshots.
- Successful task histories can continue; workspace memory contains summaries.
  Stop/disconnect cancel queued work. Interrupted runs require fresh inspection;
  this version does not serialize and resume the exact interrupted SDK run state.
- Accepting a floating suggestion shows progress inline and switches an open side
  panel to Activity. Live progress, elapsed time,
  control names, entered text, and retained error details make browser work visible.
  Assistant responses render Markdown, including tables and source links.

## Boundaries and current limitations

The first live NetSuite inspection succeeded through the paired extension: Astra
read the Home dashboard and identified navigation and controls. The browser layer
has not yet been tuned against bill entry or Gmail. NetSuite custom fields, asynchronous controls, attachment viewers,
iframes, and Google Sheets canvas behavior are likely areas for iteration.

- One browser task runs at a time. Selected workspace and tab scopes are checked
  before actions; navigation is confined to the selected origin/account/document.
- Save, Submit, Send, Pay, Approve, Delete and similar labeled controls are blocked.
  Filled bill fields are left for human review. Existing non-search values are
  not overwritten. These are prototype controls, not a production security boundary
  against a hostile application that disguises the meaning of its controls.
- The DOM observer currently reads the top frame. Screenshots can expose visible
  frame/canvas contents, but coordinate clicking and a general iframe tool are not
  included yet. Attachments outside the selected scope may need user help.
- Gmail search uses a validated visible search field and Chrome debugger keyboard
  input. Chrome may show its normal debugger attachment indicator.
- A source is recorded only after its page has been inspected in the current run.
  Missing matches are reported with search limitations, not as proof of absence.
- Ambient monitoring uses rendered page text, headings, and the visible vendor
  field. No automatic screenshots or debugger sessions are used for monitoring.
  Canvas-only Sheet rows, unloaded data, and attachments may be unobservable.
- Background DOM observers, polling, and input listeners stop during execution.
  In-flight ambient inference is cancelled; late responses are discarded. The first
  observations after execution establish a baseline and cannot trigger suggestions.
- Visit counts reflect observed page entries and returns to tabs, not every DOM
  mutation. Memory is bounded, local, workspace-specific, and clearable from the UI.
- Workspace switching pauses the previous workspace. Closing selected tabs updates
  membership and stops affected work. Data stays in `.local/`, excluded from Git.

## Dependency policy: at least 14 days old

`pnpm-workspace.yaml` sets `minimumReleaseAge: 20160` (minutes), with no exclusions.
pnpm 10.30.2 uses strict publication checks when this setting is enabled. Explicit
strict/missing-time settings are also recorded for future compatible pnpm versions.
Install scripts are disabled; all installed build tooling works without them.

The committed lockfile pins the actual dependency graph. Verify every locked
registry package's publication date, including optional platform packages:

```sh
pnpm check:ages
```

This command requires npm registry access and fails on missing publication times
or any version younger than 14 days. Run it after dependency changes. Do not bypass
the release-age rule, add exclusions, or use an unpinned `npx`/`pnpm dlx` installer.

## Verification

```sh
pnpm test         # Workspace boundaries, ambient lifecycle, tool routing, cancellation
pnpm typecheck
pnpm build
pnpm smoke        # Small real Astra connection test using .env
```

Optional real-model test with explicitly synthetic browser observations:

```sh
node --import tsx --env-file-if-exists=.env apps/server/src/smoke-workflow.ts
```

See `docs/VALIDATION.md` for the current verification record and remaining checks.
`docs/AMBIENT.md` describes monitoring, memory, pause/resume, and choice handling.

For a local development test through the paired extension, first select NetSuite
in an active workspace, then run:

```sh
node scripts/local-control.mjs status
node scripts/local-control.mjs ambient
node scripts/local-control.mjs inspect-netsuite
node scripts/local-control.mjs test-gmail-search
node scripts/local-control.mjs result TASK_ID
```

The control API requires the local pairing token, which the script reads without
printing. Tasks use the same agent and extension bridge as the side panel. The
inspection test enforces inspect/screenshot-only tools on the server.
The Gmail regression test enters `invoice newer_than:90d` and verifies the search
results through the extension; it does not open or change messages.

## Code map

```text
apps/extension/entrypoints/background.ts       workspace and command bridge
apps/extension/entrypoints/observer.content.ts ambient icon and DOM tools
apps/extension/src/App.tsx                    side-panel product experience
apps/server/src/hub.ts                       coordinator lifecycle and task state
apps/server/src/agent.ts                     execution instructions and tools
apps/server/src/ambient.ts                   ambient lifecycle and persistent memory
apps/server/src/ambient-agent.ts             Astra evaluation and structured choices
apps/server/src/store.ts                     local SQLite persistence
packages/shared/src/index.ts                 contracts and scope rules
tests/                                      workflow and boundary tests
```

## Team workflow

This implementation lives on `prototype/ambient-local`. The teammate is building
their own complete prototype. Compare the same scenario before choosing a base;
then iterate on individual capabilities while keeping the selected app full-stack.

Planning documents live on `coordination`, in the sibling `openai-sep-26-coord`
worktree. Read its `COORDINATION.md` at handoff time. Do not merge the coordination
branch into code branches. Never commit `.env`, pairing tokens, SQLite files, or
real-account observations.
