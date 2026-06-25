# 03 — Configuration & Multi-Instance

## Locations

Platform config dir, XDG-respecting:
- Linux: `${XDG_CONFIG_HOME:-~/.config}/firefly/`
- macOS: `~/Library/Application Support/firefly/` (or XDG override if set)
- Windows: `%AppData%\firefly\`

Files:
- `config.yml` — instances, default, settings, aliases. **No tokens** (`02`).
- `tokens.json` — `0600` fallback token store when no keychain (`02`).
- `hosts`-style data is folded into `config.yml` (simpler than `gh`'s split; one file).

`FIREFLY_CONFIG_DIR` overrides the directory (tests, sandboxes).

## `config.yml` schema

```yml
default_instance: personal
instances:
  personal:
    url: https://firefly.home.example
    auth_method: pat            # pat | oauth (oauth reserved, 02)
    # token lives in tokenStore, keyed by instance name
  work:
    url: https://ff.work.example
    auth_method: pat
settings:
  output: table                 # table | json  (default render)
  pager: auto                   # auto | always | never
  color: auto                   # auto | always | never
  date_format: "2006-01-02"     # display format
aliases:
  co: transaction create        # see alias command
```

## Multi-instance model

- An **instance** = one Firefly III server + its credentials, identified by a short name.
- `default_instance` is used when no `--instance`/`FIREFLY_INSTANCE`/env URL is given.
- Every stateful operation resolves an instance first (see `02` resolution precedence).

### `firefly instance` commands
| Command | Behaviour |
|---|---|
| `instance list` | Table of name, URL, auth method, default marker. |
| `instance add` | Same as `auth login` (alias) — register a new instance. |
| `instance remove <name>` | Delete the instance from config + its token from tokenStore. |
| `instance default <name>` | Set `default_instance`. |

## `firefly config` commands

| Command | Behaviour |
|---|---|
| `config get <key> [--instance]` | Read a setting. Instance-scoped keys (url, auth_method) need `--instance`; global keys (`settings.*`) don't. |
| `config set <key> <value> [--instance]` | Write a setting; validates enum values. |
| `config list` | Print effective config (tokens redacted). |

Dotted keys address nesting: `config set settings.output json`,
`config set instances.work.url https://...`.

## Precedence (effective value of any setting)

Highest wins:
1. Command-line flag (`--json`, `--no-color`, `--instance`, …).
2. Environment variable (`FIREFLY_*`, `NO_COLOR`).
3. `config.yml` (`settings.*`, then instance-scoped).
4. Built-in default.

Documented per-setting where it matters in `05-output.md`.
