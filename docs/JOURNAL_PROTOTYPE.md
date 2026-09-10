# Earlier journal review prototype

The journal-entry lab remains in `src/`, with the original implementation preserved by local tag `journal-prototype-v0.1`. The active product is now the ambient invoice assistant described in the root README.

```sh
pnpm journal:build
pnpm journal:start
```

Open `http://127.0.0.1:4317/fixture` and pair with `.local/relay-token`. `GATE_MODE=demo` runs deterministic synthetic checks; `GATE_MODE=live` calls Astra. Its extension build remains in `dist/extension`, separate from the WXT invoice extension in `apps/extension/.output/chrome-mv3`.

```sh
pnpm typecheck
pnpm test
pnpm test:browser
pnpm eval:gate
```

The 33 logic/HTTP tests and six journal browser tests still pass after the workspace migration. NetSuite journal-entry integration is not implemented. Do not load both prototype extensions into the same demonstration profile.
