# Contributing

Thanks for helping improve `firefly`. The [`spec/`](spec/) tree is the source of truth —
code follows docs. If code and a spec disagree, the spec wins or the spec gets fixed in
the same change.

## Dev setup

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev -- --help    # run the CLI from source
```

Useful scripts (full list in [`package.json`](package.json)):

| Script | Purpose |
|---|---|
| `bun test` | run the test suite |
| `bun run lint` | Biome lint + format check |
| `bun run lint:fix` | apply safe lint/format fixes |
| `bun run typegen` | regenerate API types from the vendored OpenAPI spec |
| `bun run coverage-gate` | verify the coverage matrix matches the API spec |
| `bun run build` | compile `dist/firefly` |

## Adding a command

Command modules are auto-registered — adding one touches only one shared file. Follow
[`docs/COMMAND_CONVENTION.md`](docs/COMMAND_CONVENTION.md):

1. Copy `src/commands/_TEMPLATE.ts` → `src/commands/<noun>.ts`.
2. Wire the real endpoints (from the coverage matrix, [`spec/08-coverage-matrix.md`](spec/08-coverage-matrix.md))
   plus curated table columns.
3. Register it in `src/commands/index.ts` (one alphabetical line in the `registrars` array).
4. Add a test under `test/` using a `fetch` stub (see `test/api.test.ts`).

Do not redeclare global flags (`--instance`, `--json`, `--template`, `--yes`, …) — they
are applied to the whole command tree automatically.

## Before you push

All of these run in CI and must pass:

```sh
bun run lint
bunx tsc --noEmit
bun test
bun run coverage-gate
```

The **coverage gate** enforces total reachability: every `/v1/` API path must have a row
in the coverage matrix, no row may be left `planned`, and every cited endpoint must exist
in the vendored OpenAPI spec. If you model a new endpoint, update
[`spec/08-coverage-matrix.md`](spec/08-coverage-matrix.md) accordingly.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`
— scope required, subject lowercase imperative, no trailing period. Check
`git log --oneline` and match the existing pattern.
