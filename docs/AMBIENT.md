# Persistent ambient assistance

Each workspace has one logical ambient agent. It is invoked for meaningful
observation changes, using a compact persistent summary and structured history.
It does not keep an unbounded SDK transcript or run continuously when nothing changes.

## User experience

The **Help me with…** tab stores up to 12 plain-language standing instructions,
with individual enable controls and a workspace-wide ambient toggle. The initial
instructions cover invoices, new onboarding vendors, and repeated visits.

An ambient decision is either quiet, an offer, or a question. Offers/questions
include 2–3 choices and a free-text alternative. They show why they appeared.
Selecting a task choice starts the existing execution workflow; selecting a dismiss
choice or Not now records that response without starting work. No choice is
submitted automatically. The floating presence leads to the panel's choices.

The UI exposes the last evaluation, current state, remembered summary, visit
counts, and recent decisions. Clearing remembered context preserves instructions.

## Observation and inference

The selected tabs' content scripts collect rendered body text, headings, and the
visible vendor field. Input/DOM changes settle for 1.2 seconds; a 5-second poll
also catches changes without useful mutation events. Identical snapshots are not
resent. The current bill-form rule is a context hint, not the suggestion policy.

The backend coalesces changed observations and starts at most one ambient
evaluation per 15 seconds. Up to four changed tabs are evaluated in a batch;
remaining tabs stay queued. Each tab has at most one pending observation. The
model receives before/current text, observed visit count, enabled instructions,
the last summary, and recent activity. It has no browser tools.

Monitoring does not request screenshots or attach Chrome's debugger. It cannot
guarantee observation of canvas-only content, offscreen/unloaded Sheet rows,
attachments, or sleeping/discarded pages. A first sighting is explicitly marked
as lacking a prior baseline. The model is instructed not to confuse newly visible
content with a newly added record.

## Execution boundary

Starting an execution task cancels queued and in-flight ambient evaluations.
The content scripts disconnect their background DOM observers, input listeners,
and polling timers. Execution's own inspect/screenshot tools continue to work.
Both the extension and backend reject ambient observations while execution runs.

An epoch identifies the current monitoring lifecycle. Results from cancelled or
superseded evaluations cannot publish suggestions. Workspace switching, tab scope
changes, pausing, disconnection, and edited instructions invalidate pending work.

After a task, the first snapshot of each selected tab becomes the new baseline.
Those changes cannot produce ambient offers or increment user-visit counts.
The task's outcome is instead recorded explicitly in the originating workspace's
memory, including when the user has switched workspaces meanwhile.

## Persistence and limits

SQLite keys are scoped by workspace. Memory contains:

- A model-maintained summary, at most 5,000 characters.
- The 100 most recently observed page URLs, each with bounded text and visit count.
- Up to 60 recent visit, evaluation, offer, response, settings, and task events.
- Up to 100 recent opportunity identifiers, with a 15-minute repeat cooldown.

Page text is limited to 16,000 characters in the extension and 12,000 in stored
observations. Old page text is not supplied as a comparison baseline after a day.
The UI receives the summary, recent events, and visit metadata, not all stored text.

Counts represent observed entries/returns, not proof of difficulty. Chrome document
identity helps avoid counting an extension reload as another visit. URL/form-state
changes and returning to a selected tab can establish a new observed visit.

An offer must refer to an enabled instruction and an observed tab. Before publishing,
the backend rechecks that its source URL, visit, and content hash still match the
latest observation. Accepted tasks recheck selected workspace scope and inspect
fresh page state through the extension before acting.

## Validation

`pnpm test` exercises persistence, pause/resume, cancellation, stale decisions,
duplicate observations, response history, and workspace isolation. The live-model
synthetic check is `apps/server/src/smoke-ambient.ts`. See `VALIDATION.md` for the
separate record of real-account observations and remaining application limitations.
