# 00 — Vision & Principles

## What

`firefly` is a command-line client for [Firefly III](https://www.firefly-iii.org/), a
self-hosted personal-finance manager. It wraps the Firefly III REST API (v1) and is built with
**Bun**, shipped as a **compiled standalone binary**.

## Why

The Firefly III web UI is the primary interface, but a CLI unlocks:
- Fast capture of transactions from the terminal without context-switching.
- Scriptable reporting and export (`--json` piped to `jq`, cron jobs, dashboards).
- Multi-instance management (personal + self-hosted work instances) from one tool.
- A raw escape hatch (`firefly api`) so power users reach any endpoint the modelled commands
  don't cover yet.

## Model: the GitHub CLI (`gh`)

We copy `gh`'s shape wherever it solved a UX problem. Concretely:

| `gh` pattern | `firefly` equivalent |
|---|---|
| Noun-verb: `gh issue list` | `firefly transaction list` |
| `gh auth login/status/token` | `firefly auth login/status/token` |
| `gh config get/set` | `firefly config get/set` |
| `gh api` raw escape hatch | `firefly api` |
| `--json` + `--jq` + `--template` | identical flags |
| TTY-aware prompts vs flags | identical behaviour |
| `gh alias set` | `firefly alias set` |
| Multi-host (`gh auth login --hostname`) | multi-instance profiles (`--instance`) |

## Design tenets

1. **gh-parity first.** If `gh` already answered a design question, adopt its answer rather
   than inventing a new one. Deviate only with a documented reason.
2. **Never map the API 1:1.** Endpoints are an implementation detail, not the UX. Group by what
   a human wants to do. Canonical divergences:
   - `transaction create` is **one** command taking `--type withdrawal|deposit|transfer`; it
     does not become three commands just because the type field has three values. Multi-split
     transactions are expressed with repeatable `--split` flags or an editor/interactive flow.
   - Nested resources fold under their parent: `budget limit`, `account transactions`,
     `currency rate` (exchange-rates), `webhook messages`.
   - The 17 `/autocomplete/*` endpoints become **shell completion + interactive selectors**,
     never user-facing commands (see `09-completion-interactivity.md`).
   - Destructive `data/destroy` and `data/purge` sit behind a guarded `data` group requiring
     explicit confirmation.
3. **Total reachability.** Every endpoint is either modelled as a command/flag or explicitly
   reachable through `firefly api`. The coverage matrix (`08`) is the proof.
4. **Human default, machine on request.** Default output is readable tables for a TTY; `--json`
   (+ `--jq`/`--template`) gives stable machine output. Exit codes are meaningful.
5. **Safe by default.** Mutations confirm in interactive mode; `--yes` skips. Destructive ops
   always confirm unless `--yes` *and* an explicit scope flag are given.
6. **Multi-instance native.** All state is namespaced per instance/profile; no global mutable
   "current host" surprises beyond an explicit default.

## Non-goals (v1)

- Not a TUI/dashboard (line-oriented CLI only).
- Not an import/ETL pipeline (the `data import` side of Firefly's importer is out of scope; we
  expose `data export` and bulk update, not CSV importing).
- Not a sync engine or offline cache — every command hits the live API.
- OAuth interactive login is **designed for but not shipped** in v1 (PAT only; see `02`).

## Naming

- Canonical binary: **`firefly`**. A short alias (e.g. `ff`) is decided at implementation time
  and documented in `10-distribution.md`; user aliases via `firefly alias set` regardless.
- Reference API pinned at **v6.6.2 / API v1**, vendored at `reference/firefly-iii-v6.6.2-v1.yaml`.
