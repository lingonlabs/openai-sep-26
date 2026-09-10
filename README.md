# Close Copilot — journal review prototype

A local journal-entry review lab, a Chrome extension shell, and a Gate relay.
The lab uses a synthetic company and simulated posting. NetSuite integration
and native computer-use editing are **not implemented or verified**.

## Scope checkpoint

This code implements the journal-entry Gate plan approved in Julie's chat.
The subsequently discovered `coordination` branch describes an ambient
NetSuite/Gmail **vendor-bill** assistant using WXT, React, Fastify, WebSockets,
and the Agents SDK. That is a different first workflow and stack.

The shared planning worktree is `../openai-sep-26-coord/`. Read its current
`COORDINATION.md` and `docs/project-brief.html` before further integration.
This prototype's schemas are local implementation contracts, not an agreed
team browser-bridge contract. Ownership and scope alignment remain open.
Do not merge the planning branch into implementation branches.

## Start locally

Requires Node.js 22 or later.

```sh
npm ci
cp .env.example .env
npm run dev
```

If `.env` already exists, keep it. Open <http://127.0.0.1:4317/fixture>.
The first start creates a machine-local pairing token in `.local/relay-token`.
Paste that token into the lab's Connect field. The token is never served by
the web server. The API key is a separate credential and must never go into
the browser panel.

The default `GATE_MODE=demo` uses deterministic rules against synthetic
evidence. Every result is labelled **Rules demo · no AI call**. Passing demo
evaluations does not measure Astra's accuracy.

Try D1 (allow), D2 (duplicate block), and D3 (bank fee correction). The D3
proposal changes date, period, debit, and offset credit. Applying it stops
before Save; another Save runs a fresh review.

## Live Astra

Set `OPENAI_API_KEY` in the ignored `.env` file, then run:

```sh
npm run smoke:live
```

For live Gate checks, set `GATE_MODE=live` and restart the relay. The model
defaults to `gpt-6-astra`; reasoning starts at `low`. This path uses the
Responses API and Structured Outputs. It does not fall back to demo rules
when access, parsing, evidence validation, or a request fails.

Live mode sends the loaded close pack and submitted entry to OpenAI. The
included pack is entirely synthetic. No NetSuite or Gmail data is loaded by
this prototype. Requests disable response storage and automatic retries.

## Extension lab

```sh
npm run build
```

In a dedicated Chrome test profile, open `chrome://extensions`, enable
Developer mode, and load `dist/extension` as an unpacked extension. Open
<http://127.0.0.1:4317/fixture?extension=1>, click the extension icon, and pair
its side panel with `.local/relay-token`.

The `extension=1` route disables the embedded review controller so it cannot
double-handle Save. The extension uses the same form controller and Gate
contract as the embedded lab. In that mode, an absent extension cannot be
mistaken for a successful integrated check.

`NETSUITE_ORIGIN` can configure an exact sandbox host in the built manifest.
It does **not** enable a NetSuite adapter: no ERP selectors are guessed, no
ERP form is edited, and unsupported pages show an explicit status.
`activeTab` is reserved for the future capture workflow. No screenshots or
debugger input are currently sent to Astra.

## Verify

```sh
npm run check
npx playwright install chromium
npm run test:browser
npm run eval:gate
```

`check` runs type checking, unit/HTTP integration tests, and the build.
Browser tests use an isolated Playwright Chromium, never a personal profile.
They cover clean Save, duplicate blocking, balanced correction, explicit
unchecked continuation, stale review handling, and small-screen layout.

The Gate evaluator sends all 14 cases through the running HTTP relay three
times and writes `logs/gate-eval.json`. A live relay requires:

```sh
npm run eval:gate -- --live
```

Set `EVAL_DELAY_MS` according to actual account rate limits. Live requests
consume API usage. Failures and inconsistent decisions remain visible.

## Source map

| Path | Purpose |
| --- | --- |
| `src/shared/schema.ts` | Validated entries, verdicts, changes, and fingerprints |
| `src/gate/` | Demo rules, live provider, evidence validation |
| `src/relay/` | Paired localhost HTTP server and redacted run logs |
| `src/browser/` | Shared Save controller, field edits, panel rendering |
| `src/fixture/` | Synthetic journal form and embedded review lab |
| `src/extension/` | Manifest V3 service worker, content script, side panel |
| `data/` | Synthetic close pack and UI scenarios |
| `eval/cases/` | 14 independent expected-decision fixtures |
| `tests/` | Logic, transport, and browser verification |

## Boundaries and known gaps

- USD only; a complete, synthetic account list and explicit August policy.
- The fixture records simulated saves only. It does not mutate an ERP or
  append entries to the close pack. Reload/reset scenarios between rehearsals.
- Deterministic arithmetic, period, and account checks cannot be waived by
  the model. Live evidence existence is validated; semantic support still
  needs golden-set evaluation and human review.
- Corrections use constrained field writes, not native computer use. The
  original snapshot and approved result must match; stale or unbalanced
  edits fail. Cancellation can leave partially applied changes for review.
- Original Save intent resumes once for an unchanged allowed entry. Warnings
  and unavailable checks need an explicit continuation. Blocked entries do not.
- Pairing credentials and logs stay local. The server binds to `127.0.0.1`,
  validates Host/Origin, authenticates API requests, and serves only four
  declared fixture assets. `.env` and `.local` cannot be downloaded.
- No WXT/React workspace picker, Gmail investigation, vendor-sheet lookup,
  Agents SDK coordinator, SQLite history, or reconnectable WebSocket bridge
  exists in this branch. Those belong to the coordination brief awaiting
  scope and ownership alignment.

See `docs/PHILIPP_HANDOFF.md` for the current interface and integration notes.
