# Combined prototype

Julie requested Close Copilot's existing visual design with the functionality from both prototypes. This integration adapts Philipp's `prototype/ambient-local` through `a344ba0` into `julie-local`; the branches have independent histories and incompatible internal contracts. It does not merge the coordination branch.

| Philipp capability               | Combined implementation                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selected-tab screenshot reading  | Chrome debugger captures the selected viewport. The agent receives an image and a source ID; the source viewer displays the captured image. Screenshot-only invoice fields require human review.                                                                   |
| Native Gmail search keys         | Chrome dispatches a validated key after rechecking tab scope, task, focus, and target. The debugger detaches afterward. Errors stay visible; unknown outcomes are not replayed.                                                                                    |
| Scoped navigation                | Navigate to an observed safe link within the selected Gmail account, NetSuite origin, or Sheet document. Edited forms block direct navigation.                                                                                                                     |
| Stable target controls           | Unrelated DOM changes do not invalidate a still-identical inspected control. Changed/replaced controls, URLs, values, and semantics require fresh inspection. Whole-form approval checks remain strict.                                                            |
| Floating suggestion and controls | Existing Close Copilot orb gains the offer, live work detail, Stop, pause/resume tab, pause workspace, remove tab, and open assistant. Position persists locally. Accept opens the side panel.                                                                     |
| Repeat visits                    | Offers are suppressed for the current bill visit and return after leaving/reopening. Existing bill records are excluded from new-bill detection.                                                                                                                   |
| Markdown chat                    | Headings, lists, tables, code and source links use existing typography. Raw HTML, unsafe link schemes and remote image loading are disabled.                                                                                                                       |
| Visible activity                 | Command names, target labels, entered search text, elapsed time, completed/failed state, and retained error details. Activity opens when a task starts.                                                                                                            |
| Conversation continuation        | Follow up on a prior task from history. Completed SDK histories can seed the new task; interrupted work uses fresh inspection. Free-text chat streams; structured findings are validated before display.                                                           |
| Workspace restoration/editing    | Reload retains the selected workspace and tabs. A full Chrome restart clears stale tab IDs and asks for reselection. Edit workspace updates name, dates and selected tabs. A single selected app supports chat; invoice investigation requires NetSuite and Gmail. |
| Persistent ambient assistant     | Tool-free Astra evaluation of bounded selected-tab text, with a compact SQLite memory per workspace. Offers refer to enabled standing instructions.                                                                                                                |
| Standing instructions            | **Help me with…** lets you add, edit, enable, remove and save instructions, pause ambient help, inspect remembered context and clear it.                                                                                                                           |
| Action choices and free text     | Offers provide distinct choices plus Something else. Dismiss choices do not start a task. Accepted work uses the existing guarded execution path.                                                                                                                  |
| Return visits and current offers | Counts navigation/return visits separately from DOM changes and extension reloads. Coalescing preserves the initial comparison baseline. Expired offers differ from explicit responses; the evaluator receives the actual current offers.                          |
| Execution handoff                | Ambient inference and observation stop during a task. Resuming records a fresh baseline, and task outcomes are remembered without treating agent changes as user intent.                                                                                           |
| Local test/control workflow      | Existing authenticated WebSocket control API, synthetic workbench and packaged-extension tests remain the shared path.                                                                                                                                             |

Close Copilot retains exact-decimal invoice matching, captured source checks, reviewed bill preparation, vendor duplicate checks, explicit approval for one vendor Save, and uncertain-save locks. The existing colors, typography, layout, bill cards and vendor review are retained. Arbitrary unreviewed form editing is not introduced.

## Run and review

Build and restart the local server, then reload Close Copilot **0.4.0** in `chrome://extensions`. Chrome may request the added debugger permission for screenshot capture and native search keys. Each operation attaches only to its selected tab and detaches when finished. Refresh watched pages after reloading if needed.

Screenshots cover the visible viewport, including visible frame/canvas/viewer content; there is no general iframe action tool, coordinate clicking, PDF download processor or hidden-account access. A source image permits visual review, not an automatic assertion that every page or record was searched. Real-account validation remains separate from synthetic tests.

## Persistent help

Open **Help me with…** in the panel. The initial instructions cover invoice checks, observed vendor changes, and repeated visits. Edited instructions persist per workspace. **What Close Copilot remembers** shows the summary and observed visits; **Recent observations and decisions** shows offers, responses, task outcomes and errors. Clearing remembered context preserves the standing instructions and task history.

The ambient agent has no browser tools. Selected-page changes are coalesced before evaluation, with at most one evaluation per active browser workspace and a minimum 15-second interval between automatic attempts. Each request includes up to four bounded observations and the current visible offers. No prior baseline means no claim that a vendor was newly added. A chosen task follows the established execution, evidence and review rules. Vendor creation still requires the dedicated review approval; bills remain unsaved.

Test mode is explicitly labeled and retains the deterministic invoice practice offer. Live mode uses Astra for general ambient decisions; it does not silently substitute synthetic results. Hidden Sheet rows and canvas content are not part of ambient text observations. During a user-requested task, screenshots can support visual review.

## Validation

- Type checking, production workbench/extension builds, and 37 unit/transport tests passed.
- All 21 ordinary browser regressions passed (20 in the full suite and the corrected standing-instruction UI test on rerun). They cover the packaged extension, trusted search Enter, screenshot evidence, floating accept/pause/resume, reload/reinjection, workspace editing, standing-instruction choices, and bill/vendor review boundaries. The optional live recording test remains opt-in.
- Live Astra read vendor and invoice fields from a screenshot captured by the actual packaged extension using synthetic data, streamed its response, and retained the vendor in a follow-up.
- Live ambient regression offered choices on a fifth observed visit, stayed quiet after a decline, and offered again on return after expiry despite stale pending-offer memory.
- The 390px extension panel was checked for horizontal overflow. No real account transactions were created by these tests.

## Implementation references

- [OpenAI function/tool outputs](https://developers.openai.com/api/docs/guides/function-calling) and the installed Agents SDK's structured image output types.
- [Chrome debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger) for scoped native input and screenshot capture.
- Philipp's original [validation record](https://github.com/lingonlabs/openai-sep-26/blob/a344ba0/docs/VALIDATION.md).
