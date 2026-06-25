#!/usr/bin/env bun
/**
 * Entrypoint: build the commander program, register every command module via
 * the registry barrel, apply global flags to the whole tree, parse, and route
 * uncaught errors through a single handler that maps them to exit codes (spec/05).
 */
import { Command, CommanderError } from 'commander';
import { CliError, ExitCode } from './api/errors.ts';
import { registrars } from './commands/index.ts';
import { ConfigStore } from './config/store.ts';
import { applyGlobalOptionsRecursively } from './globals.ts';
import { ansi, colorize } from './output/render.ts';
import { CLI_VERSION } from './version.ts';

function stderrColor(): boolean {
  return Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;
}

/** Map any thrown value to a stderr message + process exit code (spec/05). */
function handleError(err: unknown): never {
  const color = stderrColor();

  if (err instanceof CommanderError) {
    // Help/version output already written by commander.
    if (
      err.code === 'commander.helpDisplayed' ||
      err.code === 'commander.version' ||
      err.code === 'commander.help'
    ) {
      process.exit(ExitCode.Success);
    }
    // Unknown option / missing argument / excess args. Commander already wrote
    // the message (+ help) to stderr via showHelpAfterError; just set the code.
    process.exit(ExitCode.Usage);
  }

  if (err instanceof CliError) {
    process.stderr.write(`${colorize('error:', ansi.red, color)} ${err.message}\n`);
    if (err.hint) {
      process.stderr.write(`${colorize('hint:', ansi.yellow, color)} ${err.hint}\n`);
    }
    process.exit(err.exitCode);
  }

  // Unexpected.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${colorize('error:', ansi.red, color)} ${message}\n`);
  process.exit(ExitCode.Generic);
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('firefly')
    .description('A gh-style command-line client for Firefly III')
    .version(CLI_VERSION, '-V, --version', 'Print the firefly CLI version')
    .showHelpAfterError()
    .configureHelp({ showGlobalOptions: true });

  // Throw instead of process.exit so we control exit codes.
  program.exitOverride();
  for (const sub of program.commands) {
    sub.exitOverride();
  }

  for (const register of registrars) {
    register(program);
  }

  // Make commander throw (not exit) for every (sub)command too.
  const propagateExitOverride = (cmd: Command): void => {
    cmd.exitOverride();
    for (const sub of cmd.commands) {
      propagateExitOverride(sub);
    }
  };
  propagateExitOverride(program);

  applyGlobalOptionsRecursively(program);
  return program;
}

/** Names + aliases of real top-level commands (these always win over user aliases). */
function topLevelNames(program: Command): Set<string> {
  const names = new Set<string>();
  for (const cmd of program.commands) {
    names.add(cmd.name());
    for (const a of cmd.aliases()) {
      names.add(a);
    }
  }
  return names;
}

/**
 * Expand a user-defined alias (spec/06 meta.md) in argv before commander parses.
 * Rewrites the first positional token (the command) when it matches a stored
 * alias and is NOT a real command. One level only; real commands take priority.
 */
function expandAlias(
  argv: string[],
  aliases: Record<string, string>,
  reserved: Set<string>,
): string[] {
  const head = argv.slice(0, 2);
  const rest = argv.slice(2);
  const idx = rest.findIndex((a) => !a.startsWith('-'));
  if (idx === -1) {
    return argv;
  }
  const token = rest[idx];
  if (reserved.has(token) || !(token in aliases)) {
    return argv;
  }
  const expansion = aliases[token].trim().split(/\s+/);
  return [...head, ...rest.slice(0, idx), ...expansion, ...rest.slice(idx + 1)];
}

async function main(): Promise<void> {
  const program = buildProgram();
  let argv = process.argv;
  try {
    const config = await ConfigStore.load();
    const aliases = config.listAliases();
    if (Object.keys(aliases).length > 0) {
      argv = expandAlias(argv, aliases, topLevelNames(program));
    }
  } catch {
    // Config unreadable/absent: proceed without alias expansion.
  }
  try {
    await program.parseAsync(argv);
  } catch (err) {
    handleError(err);
  }
}

main();
