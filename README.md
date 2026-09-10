# Close Copilot

A local, workspace-aware invoice assistant for the August close. Select a NetSuite sandbox tab, Gmail inbox, and optional vendor-onboarding sheet. The assistant notices Add New Bill, offers an investigation, compares invoice evidence with recorded bills, and prepares a selected bill for human review. Bills stay unsaved. Missing vendors can be checked, prepared, and created after a separate explicit approval in the panel.

The complete flow runs in two surfaces: a Chrome MV3 extension and a local workbench with clearly labelled synthetic applications. Both use the same page runtime, WebSocket protocol, backend, and agent tools. **Live Astra has completed the synthetic workflow. The real NetSuite/Gmail profile still needs a supervised adapter rehearsal.**

## Run

Use Node.js 22.12+ (or current Node 24 LTS) and pnpm 11.19. The current machine's Node 22.11 passed the tests and builds but prints Vite's minimum-version warning.

```sh
pnpm install --frozen-lockfile
# If .env does not exist, copy .env.example to .env. Preserve an existing key.
pnpm build
pnpm start
```

The app runs at `http://127.0.0.1:4318`. In a second terminal, `pnpm open` opens and pairs the workbench without printing the token. Alternatively, open the URL and paste `.local/relay-token` into the pairing field. The pairing token is separate from the OpenAI API key.

Configure these values in the ignored `.env`:

```dotenv
OPENAI_API_KEY=your-local-key
AGENT_MODE=live
ASTRA_MODEL=gpt-6-astra
APP_PORT=4318
NETSUITE_SANDBOX_ORIGIN=https://11816061-sb1.app.netsuite.com
```

`live` uses the OpenAI Agents SDK and never silently substitutes test results. `AGENT_MODE=demo` explicitly selects the deterministic provider, which supports only the included synthetic applications. Keep port 4318 for the packaged extension; its endpoint and host permissions are pinned to that port.

## Demo

1. Open the workbench and create **August close** with all three demo tabs.
2. Accept **Check invoices** when the assistant notices Add New Bill.
3. Review the results: Northstar is already recorded; Marlow has no match in the checked records; Beacon has pending vendor onboarding.
4. Expand a finding and open its captured source evidence.
5. Select **Prepare bill for review** for Marlow. Confirm vendor, invoice MD-2608, date, and USD 4,250.00. Review the account, tax, period and required custom fields yourself. The bill stays unsaved.

The **Demo guide** button provides the walkthrough inside the application. A live recording and its result JSON are in the local, ignored `recordings/` directory on Julie's machine. See [the rehearsal notes](docs/DEMO.md).

## Vendor setup and creation

Choose **Resolve vendor** on a finding or a vendor-related preparation error, or open **Vendor setup** in the panel. Enter the actual company name and optional email. The assistant checks the visible NetSuite vendor list for existing and similar names before preparing anything. Incomplete list coverage stops the flow with an explanation. A placeholder name is never treated as a real vendor.

After a complete check with no matches, it prepares a new company vendor form and displays the proposed fields. Fill any additional required fields directly in NetSuite and choose **Refresh vendor review**. **Create vendor in NetSuite** is the separate approval that permits one Save of that exact reviewed vendor form. Changing its fields invalidates the approval. **Not now** leaves the form unsaved.

Creation is verified against the resulting saved vendor record. Interrupted saves are resolved with read-only inspection and never automatically repeated; an unresolved outcome stays locked for manual review. Creating a vendor does not mark onboarding approved or save an invoice or bill. The end-to-end flow is tested in both the synthetic workbench and the packaged Chrome extension; actual sandbox vendor creation still needs a rehearsal after reloading extension version **0.3.0**.

## Load the Chrome extension

1. Use the dedicated demo Chrome profile. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select `apps/extension/.output/chrome-mv3` from this repository.
3. Open the exact NetSuite sandbox, the demo Gmail inbox, and optionally the vendor sheet.
4. Open Close Copilot from Chrome's toolbar. Pair using `.local/relay-token`.
5. Create a named workspace and select only the intended tabs. A draggable icon appears on watched pages. Use it to open the side panel.

The extension’s workspace picker shows only tabs and workspaces belonging to that Chrome profile. The local workbench keeps its synthetic workspace separate.

Pause individual tabs, pause the workspace, remove a tab, or stop the current task from the panel. Switching workspaces stops the previous controlling task. Reconnects restore observation, never replay actions. Reload the extension and watched pages after rebuilding it.

## Architecture

| Package            | Responsibility                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `apps/extension`   | WXT, React, MV3 service worker, side panel, floating icon, selected-tab bridge                            |
| `apps/server`      | Fastify, authenticated WebSocket relay, Agents SDK coordinator/investigator/preparer/chat, SQLite         |
| `apps/workbench`   | React demo workspace with synthetic NetSuite, Gmail and vendor-sheet pages                                |
| `packages/shared`  | Zod contracts, explicit command outcomes, findings and exact-decimal comparison                           |
| `packages/browser` | DOM observations, stable element handles, stale-page checks, constrained actions and verified form writes |
| `packages/ui`      | Shared React panel, Tailwind styling, shadcn-style Radix/CVA button primitives                            |

The coordinator receives small context events; each investigation, preparation, and chat task has its own SQLite-backed SDK session. The workspace retains a compact summary. Tasks and commands carry workspace/task/command IDs; preparation points to its parent investigation. Selected observations leave the machine for OpenAI inference. API keys remain server-side; response storage and SDK tracing are disabled. History and captured source text stay in `.local/close-copilot.sqlite`, excluded from Git.

## Verification

```sh
pnpm check:ambient
pnpm test:ambient-browser
# With a live server running and a configured key; incurs real API usage:
LIVE_DEMO=1 pnpm demo:record
```

Browser tests run in isolated Chromium profiles, including one that loads the actual packaged extension. They never use a personal Chrome profile. Stop the app on port 4318 before the ordinary browser suite; it starts a deterministic server with an in-memory database. The live recording test explicitly opts into the already-running live server.

Unit and transport tests cover evidence validation, exact matching, workspace boundaries, single-task ownership, cancellation, no replay, local request authentication, vendor approval, duplicate checks, and uncertain vendor saves. Browser tests cover the full bill and vendor workflows, source viewing, pause/dismiss behavior, blocked bill Save, stale pages, duplicate actions, unknown vendors, existing user input, currency checks, and human interruption.

## Current limits

- Real NetSuite custom fields, vendor widgets, line sublists, frames, Gmail attachments, and Sheets canvas rendering require the dedicated-profile rehearsal. This version reads visible DOM text and labels. It does not OCR PDFs, capture screenshots for the model, or inject trusted native keyboard events. Unsupported forms stop with a visible error.
- USD bill preparation requires an observable USD currency field and uniquely identified vendor, invoice number, date, and amount controls. The vendor must already exist. Account/line coding, tax and period remain human review steps. Conflicting existing bill details are never overwritten automatically.
- Exact matches compare vendor, invoice number, currency and amount. Cited fields must be present in captured text. This is an evidence check, not a guarantee that an entire account or every attachment was searched. Semantic interpretation still requires human review.
- Stop or disconnect can leave partial edits. Unknown outcomes stop the task instead of retrying. Inspect the form before starting again.
- Local SQLite is a single-process prototype store, not an encrypted multi-user service. No application OAuth, account connectors, deployment, unattended submission, or scheduled background runs are included. Vendor saving requires explicit approval of the current review.

The former journal-entry prototype remains under `src/` and the local tag `journal-prototype-v0.1`. Its separate run commands are documented in [JOURNAL_PROTOTYPE.md](docs/JOURNAL_PROTOTYPE.md). Team planning lives in the separate `coordination` worktree; implementation notes are in [PHILIPP_HANDOFF.md](docs/PHILIPP_HANDOFF.md).
