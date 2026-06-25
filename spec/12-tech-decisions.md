# 12 — Locked Tech Decisions

Authoritative record of implementation choices. Overrides any older wording in `01`/`02`/`05`.

| Area | Decision | Notes |
|---|---|---|
| Runtime | Bun + TypeScript | compiled binary via `bun build --compile` (`10`) |
| CLI framework | **commander** | declarative command defs; one module per noun, auto-registered |
| Arg/command registration | **auto-register** | `src/commands/*.ts` each export a `register(program)`; a loader wires them. Agents never edit a shared dispatcher file → no parallel-edit conflicts |
| `--jq` | **deferred to post-v1** | ship `--json` + `--template` only. `--json` emits clean JSON; users pipe to external `jq` if they have it. No embedded jq engine in v1 |
| Token storage | **file-only, `0600`** | `<config-dir>/tokens.json`, keyed by instance. `tokenStore` interface kept so keychain/OAuth can slot in later (`02`) |
| Config format | **YAML** (`yaml` pkg) | `config.yml` (`03`) |
| OpenAPI types | **openapi-typescript** | generate from `reference/firefly-iii-v6.6.2-v1.yaml` → `src/api/generated/`, committed |
| Lint/format | **Biome** | single tool; enforced in CI |
| Test runner | **bun test** | (`11`) |
| License | **MIT** | independent API client; Firefly III's AGPL does not attach |
| Repo / binary | repo `firefly-cli`, binary `firefly` | short alias decided at release (`10`) |
| HTTP | native `fetch` | no axios |

## Amendments to earlier specs
- **`05-output.md`**: the `--jq` row is **deferred** — not implemented in v1. Keep `--json`
  and `--template`. (External `jq` piping unaffected.)
- **`02-auth.md`**: token storage is **file-only `0600`** for v1; the keychain path is a future
  enhancement behind the same `tokenStore` interface (do not implement native keychain addons —
  they break `--compile`).
- **`01-architecture.md`**: command framework is **commander** with auto-registration; types via
  **openapi-typescript**.
