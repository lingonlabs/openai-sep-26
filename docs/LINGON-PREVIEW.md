# Lingon Labs design review

Local branch: `julie/lingon-styling-preview`.
Based on Philipp's `prototype/ambient-local` at `4c50df2`.

The panel, workspace editor, instructions, activity, findings and floating presence use the LingonLabs.com logo, Inter font, navy/teal gradient, turquoise buttons, white surfaces and original hero decorations. Website measurements and source assets are documented in `apps/extension/src/assets/README.md`.

Philipp's workspace scoping, persistent ambient behavior, inline choices, execution, completion review/recovery, cancellation and findings remain on this branch. The existing Julie branch is separate.

## Review locally

The preview server is running on port 4320:

- Side panel: http://127.0.0.1:4320/preview
- Activity and findings: http://127.0.0.1:4320/preview?view=activity
- Standing instructions: http://127.0.0.1:4320/preview?view=help
- Floating assistant: http://127.0.0.1:4320/preview?view=popup

These are the actual extension components with Philipp's existing synthetic preview state. Workspace execution is disabled in the panel preview. Popup choices and Stop exercise only its synthetic preview handlers. No API key or real-account connection is needed. This worktree has not been installed into Julie's Chrome or pushed.

Restart with Node 22.13+ and pnpm 10.30.2: `PORT=4320 pnpm dev`.
The installed extension still uses its original bridge port 4318; port 4320 is for this visual review only.

## Validation

- All 36 existing tests pass.
- Type checks and production build pass; lockfile and dependencies unchanged.
- Browser review at desktop and 380px side panel width: logo/font load, no horizontal overflow, tab selection enables Start watching, findings expand, instructions render, popup choice enters working state and Stop returns to watching.
- No real Gmail/NetSuite workflow was executed in this design review.
