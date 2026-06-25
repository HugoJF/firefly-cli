# 02 — Authentication

Firefly III API accepts two credential types (from the OpenAPI `securitySchemes`):
- **`bearerAuth`** — Personal Access Token (PAT), `Authorization: Bearer <token>`.
- **`firefly_iii_auth`** — OAuth2 authorization-code flow.

**v1 ships PAT only.** The auth layer is designed so OAuth slots in later without reshaping
commands or config.

## `firefly auth` commands

| Command | Behaviour |
|---|---|
| `auth login` | Add/replace credentials for an instance. v1: prompts for base URL + PAT (or `--with-token` reads PAT from stdin, like `gh auth login --with-token`). Verifies via `GET /about` before saving. |
| `auth logout` | Remove stored credentials for an instance (`--instance`). |
| `auth status` | Show each instance: base URL, auth method, token validity (calls `/about/user`), default marker. Never prints the token. |
| `auth token` | Print the active instance's token to stdout (for scripts/piping). Honors `--instance`. |
| `auth switch` | Change the default instance (alias of `instance default`). |

### `auth login` flows
- **Interactive (TTY):** prompt base URL → prompt PAT (masked) → name the profile (default
  derived from host) → verify → save.
- **Non-interactive:** `firefly auth login --instance work --url https://ff.work.example
  --with-token < token.txt`. Errors clearly if `--with-token` given without piped input.

## Token storage

- Tokens are **not** stored in the plaintext config file. Storage precedence:
  1. OS keychain when available (macOS Keychain, libsecret/`secret-tool` on Linux, Windows
     Credential Manager) via a pluggable `tokenStore` interface.
  2. Fallback: a `0600` file at `<config-dir>/tokens.json` (see `03` for dir). A warning is
     printed on first fallback use.
- Config file references credentials by instance name only; it never contains the token.
- `auth token` and the client read through `tokenStore`; `--verbose` redacts tokens always.

## Credential resolution (per request)

Precedence, highest first:
1. `FIREFLY_TOKEN` + `FIREFLY_URL` env (ephemeral, overrides everything; good for CI).
2. `--instance <name>` flag → that profile's stored token + URL.
3. `FIREFLY_INSTANCE` env → that profile.
4. Default instance from config.

Missing/invalid credentials → exit 4 (auth error, see `05`) with a `firefly auth login` hint.

## OAuth (designed, not shipped)

The `tokenStore` interface and profile schema reserve fields for OAuth so v2 adds it without
migration:
- Profile gains optional `oauth { client_id, scopes, token_expires_at, refresh_token_ref }`.
- `auth login --web` (future) runs the authorization-code flow against
  `/oauth/authorize` + `/oauth/token` (URLs derived from the instance base URL), opens a browser,
  listens on a loopback redirect, stores access+refresh tokens in `tokenStore`.
- The client gains a refresh path: on 401 with an OAuth profile, refresh once then retry.
- v1 must not assume PAT-only anywhere the auth method is checked — branch on
  `profile.authMethod` (`pat` | `oauth`) from the start.
