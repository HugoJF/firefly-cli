# 01 — Architecture

Implementation-shaping decisions. Not code, but the contract code must satisfy.

## Runtime & language

- **Bun** (TypeScript). Target: Bun's built-in APIs (`Bun.file`, `fetch`, `Bun.spawn`) over
  Node polyfills where they exist.
- Shipped as a **compiled binary** via `bun build --compile` (see `10-distribution.md`).

## Project layout

```
src/
  cli.ts                 entrypoint; wires the command tree, global flags, dispatch
  commands/              one module per noun group, mirroring spec/06-commands/
    transaction.ts
    account.ts
    ...
    meta/                auth, config, instance, api, completion, alias
  api/
    client.ts            thin HTTP client (auth header, base URL, retries, paging)
    generated/           types generated from the OpenAPI YAML (see below)
    errors.ts            maps API error envelope -> typed errors
  config/
    store.ts             read/write config file, profile resolution, precedence
    paths.ts             XDG / platform config + token locations
  output/
    render.ts            table / json / jq / template renderers
    selectors.ts         interactive pickers backed by /autocomplete (09)
  util/
spec/                    these documents (source of truth; code follows docs)
reference/               vendored OpenAPI YAML (pinned)
test/
```

## Command framework

- A small dispatcher (noun → verb → handler), not a heavy framework, to keep the binary lean and
  startup fast. Evaluate a minimal arg parser; if a dependency is used it must compile cleanly
  with `bun build --compile`. Decision recorded here at implementation time.
- Each command module exports: metadata (name, aliases, flags, help) + a handler. The dispatcher
  builds help, completion, and the alias system from this metadata uniformly.

## API client (`api/client.ts`)

- Single `fetch`-based client. Reads base URL + token from the resolved profile (`02`, `03`).
- Sets `Authorization: Bearer <token>`, `Accept: application/json`, `Content-Type` on writes.
- **Pagination:** Firefly returns `meta.pagination` (`current_page`, `total_pages`). The client
  exposes `getPaged()` that auto-follows pages when `--all` is set; otherwise honours
  `--page`/`--limit`. Renderers receive a stream/array uniformly (`05`).
- **Errors:** Firefly error envelope (`message`, `errors{field:[msg]}`) → `errors.ts` typed
  error → human message on stderr + non-zero exit (`05`). 401 → auth hint. 422 → field errors.
- **Retries:** idempotent GETs retried on 5xx/network with backoff; writes never auto-retried.
- `--verbose` logs method, URL, status, timing to stderr (never the token).

## Types from OpenAPI

- Generate request/response types from `reference/firefly-iii-v6.6.2-v1.yaml` into
  `api/generated/` (build-time step, committed). The YAML is the typing source of truth; the CLI
  never hand-maintains response shapes.
- Generation is pinned to the vendored version; bumping Firefly = re-vendor YAML + regenerate +
  review diff (procedure in `10`/`11`).

## Statelessness

No local cache of resources. Every command is a live API call. The only persisted state is
config + tokens (`02`, `03`) and user aliases.

## Exit & signal handling

- Clean exit codes per `05-output.md`.
- SIGINT during an interactive prompt aborts without mutating; mid-write it surfaces whatever the
  server returned (writes are not transactional client-side).
