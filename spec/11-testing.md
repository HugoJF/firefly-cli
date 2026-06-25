# 11 — Testing Strategy

Run with `bun test`. Three layers.

## 1. Unit (no network)
- Arg parsing / dispatch: noun→verb routing, alias resolution, global-flag handling.
- Config & precedence: flag > env > file > default (`03`); instance resolution (`02`).
- Output renderers: table vs plain vs json vs jq vs template (`05`) over fixture payloads.
- Input assembly: transaction split flags / `--split` / editor YAML → correct `transactions[]`
  body; rule trigger/action assembly.
- Error mapping: Firefly error envelope → exit codes (`05`).

## 2. Mocked HTTP (contract)
- A fixture server (or `fetch` mock) returns recorded Firefly responses keyed by path+method.
- One test per modelled subcommand asserting it calls the **path from the coverage matrix**
  (`08`) with the right method/body, and renders expected output.
- Fixtures derived from the vendored OpenAPI examples where possible, keeping tests pinned to the
  spec version.

## 3. End-to-end (optional, gated)
- Against the public demo instance (`https://demo.firefly-iii.org`) or a disposable
  self-hosted/Docker Firefly, behind `FIREFLY_E2E=1` + a throwaway token.
- Covers the three plan walkthroughs: `auth login`, create a split withdrawal, `insight expense
  category --json | jq`.
- Read-only by default; write/destroy e2e only against an explicitly disposable instance.

## Coverage gate (CI)
- A script cross-checks `08-coverage-matrix.md` against `reference/*.yaml`:
  - every `^  /v1/` path has a matrix row;
  - no row is left `planned`;
  - every modelled row's cited endpoint exists in the YAML.
- Fails the build on drift — this is the automated form of the plan's verification step.

## Lint/format
`bun` + Biome (or Prettier+ESLint) — decided at impl time; enforced in CI.
