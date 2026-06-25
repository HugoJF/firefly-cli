/**
 * `firefly completion <bash|zsh|fish>` — emit a shell completion script
 * (spec/09). Static tokens (noun groups, verbs, flag names) are derived from the
 * live command tree; dynamic value hooks call `firefly api autocomplete/<kind>`
 * for the active instance and degrade silently (no results) when offline or
 * unauthenticated, so the shell never hangs.
 *
 * Script generation is self-contained in this file (no foundation changes).
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';

type Shell = 'bash' | 'zsh' | 'fish';

interface NounSpec {
  name: string;
  subs: string[];
}

interface TreeSpec {
  prog: string;
  nouns: NounSpec[];
  globals: string[];
}

/** Walk to the topmost command (the root program) from any node. */
function rootOf(command: Command): Command {
  let node = command;
  while (node.parent) {
    node = node.parent;
  }
  return node;
}

/** Long flag names declared on a command (e.g. `--json`). */
function longFlags(cmd: Command): string[] {
  return cmd.options.map((o) => o.long).filter((l): l is string => Boolean(l));
}

/** Collect a static description of the command tree for the script. */
export function collectTree(root: Command): TreeSpec {
  const nouns: NounSpec[] = [];
  for (const cmd of root.commands) {
    if ((cmd as any)._hidden) {
      continue;
    }
    nouns.push({
      name: cmd.name(),
      subs: cmd.commands.filter((c) => !(c as any)._hidden).map((c) => c.name()),
    });
  }
  return {
    prog: root.name() || 'firefly',
    nouns: nouns.sort((a, b) => a.name.localeCompare(b.name)),
    globals: longFlags(root),
  };
}

/** Flag → autocomplete kind for dynamic value completion (spec/09). */
const DYNAMIC_KINDS: Record<string, string> = {
  '--source': 'accounts',
  '--destination': 'accounts',
  '--account': 'accounts',
  '--category': 'categories',
  '--budget': 'budgets',
  '--bill': 'bills',
  '--tag': 'tags',
  '--currency': 'currencies',
  '--piggy': 'piggy-banks',
};

function bashScript(tree: TreeSpec): string {
  const nounNames = tree.nouns.map((n) => n.name).join(' ');
  const subCases = tree.nouns.map((n) => `    ${n.name}) opts="${n.subs.join(' ')}" ;;`).join('\n');
  const dynCases = Object.entries(DYNAMIC_KINDS)
    .map(([flag, kind]) => `    ${flag}) __firefly_dynamic ${kind} ;;`)
    .join('\n');
  return `# ${tree.prog} bash completion
__firefly_dynamic() {
  local kind="$1" cur="${'${COMP_WORDS[COMP_CWORD]}'}"
  local out
  out=$(${tree.prog} api "autocomplete/$kind" --json 2>/dev/null) || return 0
  local names
  names=$(printf '%s' "$out" | grep -oE '"name"[^,]*' | sed -E 's/.*: *"([^"]*)".*/\\1/') || return 0
  COMPREPLY=( $(compgen -W "$names" -- "$cur") )
}

_firefly() {
  local cur prev words cword
  cur="${'${COMP_WORDS[COMP_CWORD]}'}"
  prev="${'${COMP_WORDS[COMP_CWORD-1]}'}"
  local globals="${tree.globals.join(' ')}"

  case "$prev" in
${dynCases || '    *) ;;'}
  esac
  if [ -n "$COMPREPLY" ]; then return; fi

  local nouns="${nounNames}"
  local opts=""
  case "${'${COMP_WORDS[1]}'}" in
${subCases}
  esac

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "$nouns $globals" -- "$cur") )
  else
    COMPREPLY=( $(compgen -W "$opts $globals" -- "$cur") )
  fi
}
complete -F _firefly ${tree.prog}
`;
}

function zshScript(tree: TreeSpec): string {
  const nounLines = tree.nouns.map((n) => `      '${n.name}:${n.name} commands'`).join('\n');
  const subCases = tree.nouns
    .map(
      (n) => `        ${n.name}) _values 'subcommand' ${n.subs.map((s) => `'${s}'`).join(' ')} ;;`,
    )
    .join('\n');
  return `#compdef ${tree.prog}
# ${tree.prog} zsh completion
_firefly() {
  local -a nouns
  nouns=(
${nounLines}
  )
  if (( CURRENT == 2 )); then
    _describe 'command' nouns
    _values 'global flags' ${tree.globals.map((f) => `'${f}'`).join(' ')}
    return
  fi
  case "${'${words[2]}'}" in
${subCases}
  esac
}
compdef _firefly ${tree.prog}
`;
}

function fishScript(tree: TreeSpec): string {
  const lines: string[] = [`# ${tree.prog} fish completion`];
  // Top-level nouns (only when no subcommand seen yet).
  lines.push(
    `function __fish_${tree.prog}_no_subcommand`,
    '  set -l cmd (commandline -opc)',
    '  test (count $cmd) -eq 1',
    'end',
  );
  for (const n of tree.nouns) {
    lines.push(
      `complete -c ${tree.prog} -n '__fish_${tree.prog}_no_subcommand' -a '${n.name}' -d '${n.name} commands'`,
    );
    for (const s of n.subs) {
      lines.push(`complete -c ${tree.prog} -n '__fish_seen_subcommand_from ${n.name}' -a '${s}'`);
    }
  }
  for (const g of tree.globals) {
    lines.push(`complete -c ${tree.prog} -l '${g.replace(/^--/, '')}'`);
  }
  return `${lines.join('\n')}\n`;
}

/** Public, side-effect-free generator (used by tests). */
export function generateCompletion(shell: Shell, tree: TreeSpec): string {
  switch (shell) {
    case 'bash':
      return bashScript(tree);
    case 'zsh':
      return zshScript(tree);
    case 'fish':
      return fishScript(tree);
  }
}

export function register(program: Command): void {
  program
    .command('completion')
    .description('Output a shell completion script (bash, zsh, or fish)')
    .argument('<shell>', 'Shell: bash, zsh, or fish')
    .action(async (shell: string, _opts, command: Command) => {
      if (shell !== 'bash' && shell !== 'zsh' && shell !== 'fish') {
        throw new UsageError(`Unsupported shell "${shell}".`, 'Supported: bash, zsh, fish');
      }
      // getContext is cheap and keeps the contract uniform; no network needed.
      await getContext(command);
      const tree = collectTree(rootOf(command));
      process.stdout.write(generateCompletion(shell, tree));
    });
}
