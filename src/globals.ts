/**
 * Global flags (spec/04) wired ONCE, here, then applied to every command in the
 * tree so they work in the natural `gh` position (e.g. `firefly tx list --json`).
 *
 * Noun-command agents do NOT touch this file. They never re-declare global
 * flags; `getContext()` reads the merged values for them. If a command needs a
 * short flag that collides with a global (e.g. `api` uses `-q` for jq), the
 * colliding global is skipped on that command only — the command keeps control.
 */
import type { Command } from 'commander';

interface GlobalOptDef {
  flags: string;
  description: string;
}

/** Source of truth for global option definitions. */
export const GLOBAL_OPTS: GlobalOptDef[] = [
  { flags: '--instance <name>', description: 'Select instance/profile (env: FIREFLY_INSTANCE)' },
  {
    flags: '--json [fields]',
    description: 'JSON output; optional comma-separated field projection',
  },
  { flags: '--template <tmpl>', description: 'Go-template-style output over the JSON' },
  { flags: '-y, --yes', description: 'Skip confirmation prompts' },
  { flags: '--no-color', description: 'Disable ANSI colour (env: NO_COLOR)' },
  { flags: '--no-pager', description: 'Disable the pager' },
  { flags: '-q, --quiet', description: 'Suppress non-essential output' },
  { flags: '-v, --verbose', description: 'Log HTTP requests to stderr (env: FIREFLY_DEBUG)' },
];

/** All global flag long/short names (used by context merge). */
export const GLOBAL_FLAG_KEYS = [
  'instance',
  'json',
  'template',
  'yes',
  'color',
  'pager',
  'quiet',
  'verbose',
] as const;

function flagTokens(flags: string): string[] {
  return flags.split(/[ ,|]+/).filter((t) => t.startsWith('-'));
}

/** Add global options to a single command, skipping any that would collide. */
export function addGlobalOptions(cmd: Command): void {
  const existing = new Set<string>();
  for (const opt of cmd.options) {
    if (opt.short) {
      existing.add(opt.short);
    }
    if (opt.long) {
      existing.add(opt.long);
    }
  }
  for (const def of GLOBAL_OPTS) {
    const tokens = flagTokens(def.flags);
    if (tokens.some((t) => existing.has(t))) {
      continue;
    }
    cmd.option(def.flags, def.description);
  }
}

/** Apply global options to the root and every (transitive) subcommand. */
export function applyGlobalOptionsRecursively(cmd: Command): void {
  addGlobalOptions(cmd);
  for (const sub of cmd.commands) {
    applyGlobalOptionsRecursively(sub);
  }
}
