# 07 — `firefly api` Escape Hatch

A raw API client, modelled on `gh api`. Guarantees total reachability: any endpoint not modelled
as a command (and any future endpoint) is callable. The coverage matrix (`08`) marks several
paths `api-only` by design; this command serves them.

## Synopsis

```
firefly api <endpoint> [flags]
```

`<endpoint>` is a path relative to the instance base, with or without leading `/` and with or
without the `v1/` prefix:
- `firefly api transactions`
- `firefly api /v1/accounts/123`
- `firefly api v2/...` (v2 endpoints reachable too — charts/insights live partly in v2)

## Flags

| Flag | Meaning |
|---|---|
| `-X, --method <M>` | HTTP method (default GET; POST inferred when `-f`/`-F`/`--input` present, like gh) |
| `-f, --raw-field <k=v>` | string field (body for writes, query for GET) |
| `-F, --field <k=v>` | typed field — `true`/`false`/`null`/numbers coerced; `@file` reads a file; `-` reads stdin |
| `--input <file>` | raw request body from file (`-` = stdin); sets `Content-Type: application/json` |
| `-H, --header <k:v>` | extra request header |
| `-q, --jq <expr>` | filter response JSON (as `05`) |
| `-t, --template <tmpl>` | template response (as `05`) |
| `--paginate` | follow `meta.pagination` and concatenate results (arrays merged) |
| `--cache <dur>` | optional GET response cache (off by default) |
| `-i, --include` | include response status + headers in output |
| `--verbose` | dump request/response to stderr (token redacted) |

- GET with `-f/-F` puts fields in the query string; non-GET puts them in a JSON body.
- Auth header, base URL, and instance resolution are identical to modelled commands (`02`).

## Examples

```sh
# raw list, filtered
firefly api transactions --paginate --jq '.data[].attributes.transactions[].description'

# create a withdrawal the raw way
firefly api transactions -X POST \
  -F 'transactions[][type]=withdrawal' \
  -F 'transactions[][amount]=12.50' \
  -F 'transactions[][description]=Coffee' \
  -F 'transactions[][source_id]=1' \
  -F 'transactions[][destination_name]=Coffee Shop' \
  -F 'transactions[][date]=2026-06-25'

# admin-only endpoint not modelled as a command
firefly api user-groups --jq '.data[].attributes.title'

# trigger batch finish
firefly api batch/finish -X POST -F 'job_id=abc123'
```

## Relationship to modelled commands

Modelled commands are thin, ergonomic wrappers; `firefly api` is the floor under them. When a
user hits a gap, the error/help text points them at the equivalent `firefly api` call so they're
never blocked. This is also the mechanism the `08` matrix relies on to claim 100% reachability.
