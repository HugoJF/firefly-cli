/**
 * `firefly config` — get/set/list CLI config (spec/03). Dotted keys address
 * nesting (`settings.output`, `instances.work.url`). Instance-scoped short keys
 * (`url`, `auth_method`) map under the active/--instance profile.
 *
 * This is CLI config; server config lives under `config-value` (a noun agent).
 */
import type { Command } from 'commander';
import { stringify } from 'yaml';
import { UsageError } from '../api/errors.ts';
import type { Ctx } from '../context.ts';
import { getContext } from '../context.ts';
import { printMessage, printResult } from '../output/render.ts';

const INSTANCE_SCOPED = new Set(['url', 'auth_method']);

/** Resolve a possibly-short key to a fully dotted path. */
function resolveKey(key: string, instance: string | undefined, config: Ctx['config']): string {
  if (INSTANCE_SCOPED.has(key)) {
    const name = instance || config.defaultInstance;
    if (!name) {
      throw new UsageError(`Key "${key}" is instance-scoped.`, 'Pass --instance <name>.');
    }
    return `instances.${name}.${key}`;
  }
  return key;
}

export function register(program: Command): void {
  const config = program
    .command('config')
    .description('Manage CLI configuration (settings, aliases)');

  config
    .command('get')
    .description('Read a config value by dotted key')
    .argument('<key>', 'e.g. settings.output, url (with --instance)')
    .option('--instance <name>', 'Instance for instance-scoped keys')
    .action(async (key: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const dotted = resolveKey(key, opts.instance, ctx.config);
      const value = ctx.config.get(dotted);
      if (value === undefined) {
        throw new UsageError(`No such config key: ${key}`);
      }
      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(value, ctx.output);
        return;
      }
      process.stdout.write(`${typeof value === 'object' ? JSON.stringify(value) : value}\n`);
    });

  config
    .command('set')
    .description('Write a config value (validates known enums)')
    .argument('<key>', 'Dotted key')
    .argument('<value>', 'Value')
    .option('--instance <name>', 'Instance for instance-scoped keys')
    .action(async (key: string, value: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const dotted = resolveKey(key, opts.instance, ctx.config);
      ctx.config.set(dotted, value);
      await ctx.config.save();
      printMessage(`Set ${dotted} = ${value}`, ctx.output);
    });

  config
    .command('list')
    .description('Print the effective config (tokens are never stored here)')
    .action(async (_opts, command: Command) => {
      const ctx = await getContext(command);
      const data = ctx.config.redacted();
      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(data, ctx.output);
        return;
      }
      process.stdout.write(stringify(data));
    });
}
