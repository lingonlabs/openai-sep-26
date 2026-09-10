# Prototype working agreements

- This is an independent full-stack prototype on `prototype/ambient-local`.
  The teammate builds a separate full-stack prototype; avoid a frontend/backend split.
- Read the shared coordination file in the sibling `openai-sep-26-coord` worktree
  for current handoffs. Keep its branch separate from implementation history.
- Use only registry package versions published at least 14 days ago. Preserve
  `minimumReleaseAge: 20160`, no exclusions, the lockfile, and disabled install scripts.
  Run `pnpm check:ages` after changing dependencies. Do not use `npx` or `pnpm dlx`.
- No Gmail/NetSuite connectors or application OAuth. Use selected browser tabs.
- Keep the API key in ignored `.env`, and local state/tokens in ignored `.local/`.
  Never print, commit, or include credentials or real account data in test fixtures.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` for behavior changes.
- Preserve workspace scoping, explicit errors, command deduplication, cancellation,
  and review before saving/posting/sending. Do not silently simulate successful work.
