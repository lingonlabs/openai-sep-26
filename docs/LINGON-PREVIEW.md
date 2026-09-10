# Lingon Labs design review

Local branch: `julie/lingon-styling-preview`.
Based on Philipp's `prototype/ambient-local` at `ce86272`.

The panel, workspace editor, instructions, activity, findings and floating presence use the LingonLabs.com logo, Inter font, navy/teal gradient, turquoise buttons, white surfaces and original hero decorations. Website measurements and source assets are documented in `apps/extension/src/assets/README.md`.

Philipp's workspace scoping, persistent ambient behavior, inline choices, execution, completion review/recovery, cancellation and findings remain on this branch. The existing Julie branch is separate.

## Review locally

The preview server is running on port 4320:

- Side panel: http://127.0.0.1:4320/preview
- Activity and findings: http://127.0.0.1:4320/preview?view=activity
- Standing instructions: http://127.0.0.1:4320/preview?view=help
- Floating assistant: http://127.0.0.1:4320/preview?view=popup

These are the actual extension components with Philipp's existing synthetic preview state. Workspace execution is disabled in the panel preview. Popup choices, confirmation, queued replies, Stop and continuation exercise only its synthetic preview handlers. No API key or real-account connection is needed. This worktree has not been installed into Julie's Chrome or pushed.

Restart with Node 22.13+ and pnpm 10.30.2: `PORT=4320 pnpm dev`.
The installed extension still uses its original bridge port 4318; port 4320 is for this visual review only.

## Validation

- All 42 existing tests pass in a clean checkout.
- Type checks and production build pass; lockfile and dependencies unchanged.
- Browser review at desktop and 380px side panel width: logo/font load, no horizontal overflow, tab selection enables Start watching, findings expand, instructions render, popup choice enters working state and Stop returns to watching.
- A separate clean clone was installed with the frozen lockfile, with no copied `.env`, `.local`, `node_modules`, or build output. All 42 tests, type checks and the production build passed. Its server started without a key, and ten bundled asset routes matched the built files byte for byte.
- The core browser bridge, Sheet polling, ambient coordinator, recovery, shared contracts and task handoff components match Philipp’s `ce86272` exactly.
- New popup controls were exercised: PDF confirmation, same-task continuation, queued updates, Stop, reopening a stopped task and Continue. The task status bar fits a 320px panel without horizontal overflow.
- No real Gmail/NetSuite workflow was executed in this design review; Philipp’s own machine and accounts were not accessed.

## Handoff to Philipp after review

No push is required for Julie to review these previews. After the styling branch is shared and merged into Philipp's existing checkout:

1. Keep his existing `.env`, `.local/`, and installed extension registration. This update does not change the protocol, port, permission list, or storage keys.
2. Use the repository's Node 22.13+ and pinned pnpm 10.30.2, then run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm test
   pnpm typecheck
   pnpm build
   pnpm dev
   ```

3. Open `http://127.0.0.1:4318/preview` to check the design on his machine.
4. In `chrome://extensions`, reload the existing extension from the same `apps/extension/.output/chrome-mv3` folder, then reopen its panel. Its display name is now **Lingon Labs · Close companion**.
5. Retain his own pairing token and API key. If pairing is requested, use his `.local/pairing-token`. Reselect tabs if Chrome itself has restarted, as required by Philipp's implementation.
6. Verify the selected Gmail, NetSuite and Sheet tabs in his own session. The live Sheet screenshots and accounting workflow still depend on those tabs and his login permissions.

All visual assets are versioned in this branch. No private file path, separate download, or Julie-specific key is required to build it. The lockfile, dependency policy, and versions are unchanged.
