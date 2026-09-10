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
submitted automatically. The floating popup shows the choices and free-text field
directly, using the same action card as the side panel. Continue starts the selected
work without requiring the side panel to open; progress, Stop, and errors appear
in the popup. Background presence updates preserve the current draft and focus.

Open assistant targets the global side panel in the clicked page's Chrome window.
If Chrome rejects that request, the popup displays the error and an explicit
Open assistant in a tab fallback. The synthetic popup preview is available at
`http://127.0.0.1:4318/preview?view=popup`.

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
the last summary, recent activity, and the authoritative list of currently
available offers. Navigation/expiry removes an offer without implying a decline;
an old summary cannot establish that it is still pending. Coalesced updates retain
the new-visit signal and the earliest comparison baseline. It has no browser tools.

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

## Completion and continued investigation

After the investigator proposes a final answer, a tool-free Astra completion
reviewer compares it with the user's request, conversation, actions, findings,
and bounded current observations. It can accept completion, request a concrete
untried recovery step, or identify a blocker requiring user help. A truthful
partial answer alone does not establish completion of the requested work.

Recovery continues the same task using persisted SDK history. There is a 10-minute
limit for the whole requested turn, 32 SDK turns per investigator pass, and a
45-second limit for each review. Fresh observation evidence resets the stalled
attempt count; a repeated plan without new evidence, or two consecutive recovery
passes without new evidence, pauses work. Observation hashes omit snapshot versions;
the time limit still bounds recovery if unrelated page changes resemble progress.
The UI distinguishes working, checking completion, waiting for the user, and paused
work, with an explicit active/idle indicator. Incomplete work retains a structured
handoff and remaining step; review failure cannot silently mark work complete.
Stop, scope changes, and disconnect cancel review and continuation too. Ambient
inspection remains suspended across the entire sequence. Review never grants new
browser capabilities or expands the user's authorization.

Both the floating popup and chat offer “I've done that — continue” for human
handoffs and “Continue task” for other pauses, plus a free-text update. Confirmation
continues the original task/history and requests fresh inspection. Replies during
execution are acknowledged and queued (up to five), then consumed after the current
investigator pass or completion review. A queued update takes precedence over the
review's older conclusion. Stop clears queued updates. The composer follows the
current task across views; starting another conversation requires New task.

Each assistant response stores its finding IDs. Its Findings section is collapsed
by default, and earlier attempts that led to recovery are also collapsed. Existing
unlinked findings remain available once, labelled as including earlier task evidence.
User follow-ups continue the same saved conversation and preserve read-only scope.
Gmail conversation rows are now included in inspected controls so message opening
can be attempted through ordinary inspected refs rather than fabricated links.

## Persistence and limits

SQLite keys are scoped by workspace. Memory contains:

- A model-maintained summary, at most 5,000 characters.
- The 100 most recently observed page URLs, each with bounded text and visit count.
- Up to 60 recent visit, evaluation, offer, response, settings, and task events.
- Up to 100 recent opportunity identifiers and response timestamps. Explicit
  acceptance/dismissal imposes a 15-minute repeat cooldown; an unhandled offer
  removed by navigation can be offered again on return. Currently available
  offers are also deduplicated.

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
