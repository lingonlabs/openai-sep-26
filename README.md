# Ambient · Close companion

A local Chrome extension prototype for ambient finance work. It recognizes a new
NetSuite vendor bill, offers to investigate Gmail, and lets Astra inspect the
selected browser tabs, compare invoice evidence, and prepare a bill for review.

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
7. Open **Add New Bill** in NetSuite. The floating icon offers an investigation.

After rebuilding, use **Reload** on the extension card and reopen its panel.
Extension reloads retain selected tabs. After a full browser restart, reselect the workspace tabs; stale tab IDs are
deliberately cleared. The prototype currently uses port **4318** for the bridge.

## Practice with synthetic data

Open these in the same Chrome profile and select them in a new workspace:

- http://127.0.0.1:4318/fixtures/netsuite
- http://127.0.0.1:4318/fixtures/gmail
- http://127.0.0.1:4318/fixtures/vendors

Click **Add New Bill** on the ledger fixture, accept **Check invoices**, and watch
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
- A local rule recognizes new vendor-bill forms. Context changes are debounced.
  Accepted/dismissed suggestions stay quiet during the current bill visit; reopening
  the bill starts a fresh visit and can offer the suggestion again.
- Node/Fastify WebSocket bridge with token pairing and an extension-origin check.
- Agents SDK with `gpt-6-astra`, browser tools, typed findings, bounded tasks,
  streaming responses, and SQLite persistence.
- Browser tools: inspect visible page text and controls, click, fill, keyboard
  input for search, scroll, scoped navigation, and debugger screenshots.
- Successful task histories can continue; workspace memory contains summaries.
  Stop/disconnect cancel queued work. Interrupted runs require fresh inspection;
  this version does not serialize and resume the exact interrupted SDK run state.
- Accepting a floating suggestion opens Activity. Live progress, elapsed time,
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
- Ambient detection is event-driven and currently specific to new-bill forms.
  Astra does the accepted investigation; generalized model-driven ambient evaluation
  is a later experiment. Discarded or sleeping tabs are not continuously observed.
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

For a local development test through the paired extension, first select NetSuite
in an active workspace, then run:

```sh
node scripts/local-control.mjs status
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
apps/server/src/agent.ts                     Astra instructions and tools
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
