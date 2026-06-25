# 09 — Completion & Interactivity

## Autocomplete endpoints are not commands

The 17 `/v1/autocomplete/*` endpoints (accounts, bills, budgets, categories, currencies,
object-groups, piggy-banks, recurring, rule-groups, rules, subscriptions, tags,
transaction-types, transactions, …) are **input helpers**, not user-facing commands. They power
two features:

### 1. Interactive selectors (TTY)
When a required reference is missing on a TTY, the CLI prompts with a fuzzy picker backed by the
matching autocomplete endpoint. Examples:
- `transaction create` with no `--source` → fuzzy account picker via `/autocomplete/accounts`.
- `--category` prompt → `/autocomplete/categories`.
- `--budget` prompt → `/autocomplete/budgets`.

The picker queries the endpoint with the user's typed prefix (`query` param) and shows
id + label; selection fills the corresponding flag. Every picker has a flag equivalent so
non-TTY use is fully scriptable (`04`, "Interactive vs flag mode").

### 2. Dynamic shell completion
`firefly completion <bash|zsh|fish>` emits a completion script. The script calls the CLI in a
completion mode that:
- completes **static** tokens (noun groups, verbs, flag names) from command metadata (`01`);
- completes **dynamic** values (account names, category names, currency codes, tags) by calling
  the relevant `/autocomplete/*` endpoint for the current instance.

Dynamic completion respects `--instance` already on the line; it degrades gracefully (silent, no
results) when offline or unauthenticated so the shell never hangs or errors.

## TTY detection rules

| Condition | Behaviour |
|---|---|
| stdin is a TTY, required input missing | prompt (selector/confirm/editor) |
| stdin not a TTY (pipe/CI), required input missing | error naming the exact flag; exit 2 |
| `--yes` | never prompt; accept defaults + confirmations |
| destructive op, TTY, no `--yes` | typed confirmation required (`05`, safe-by-default) |

## Editor flow (complex bodies)

For multi-split transactions or long notes, `transaction create --editor` / `... edit --editor`
opens `$EDITOR` (or `$VISUAL`) with a pre-filled YAML/JSON template; on save the body is parsed
and submitted. Mirrors `gh pr create`'s editor affordance. Aborting the editor with an empty
buffer cancels (exit 8).

## Prompt inventory (must each have a flag twin)
- Reference pickers (account/category/budget/bill/tag/currency/piggy/rule…): `--source`,
  `--destination`, `--category`, `--budget`, `--bill`, `--tag`, `--currency`, etc.
- Free-text prompts: `--description`, `--amount`, `--date`, `--notes`.
- Confirmations: `--yes`.
- Choice prompts (transaction `--type`, account `--type`): enumerated flags.
