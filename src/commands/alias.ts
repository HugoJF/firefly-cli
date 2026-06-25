/**
 * `firefly alias` — user-defined command aliases (spec/06 meta.md, spec/03).
 * Stored in `config.yml` via the foundation ConfigStore (`ctx.config`).
 *
 *   alias set <name> <expansion>   e.g. alias set co "transaction create"
 *   alias list
 *   alias delete <name>
 *
 * Foundation gap (REPORT, not fixed here): this implements storage + listing
 * only. Actual EXPANSION at dispatch time — rewriting `firefly co ...` into
 * `firefly transaction create ...` before commander parses — must be wired in
 * `src/cli.ts` (the entrypoint), which noun modules must not touch. Until then,
 * aliases are persisted and listable but not executable.
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMutation, renderList } from '../output/render.ts';

export function register(program: Command): void {
  const alias = program.command('alias').description('Manage command aliases (stored in config)');

  alias
    .command('set')
    .description('Create or update an alias')
    .argument('<name>', 'Alias name, e.g. co')
    .argument('<expansion>', 'Expansion, e.g. "transaction create"')
    .action(async (name: string, expansion: string, _opts, command: Command) => {
      if (!name.trim()) {
        throw new UsageError('Alias name cannot be empty.');
      }
      const ctx = await getContext(command);
      ctx.config.setAlias(name, expansion);
      await ctx.config.save();
      printMutation(ctx.output, { verb: 'Set alias', description: `${name} → ${expansion}` });
    });

  alias
    .command('list')
    .description('List configured aliases')
    .action(async (_opts, command: Command) => {
      const ctx = await getContext(command);
      const aliases = ctx.config.listAliases();
      const rows = Object.entries(aliases).map(([name, expansion]) => ({ name, expansion }));
      renderList(
        rows,
        [
          { header: 'name', get: (r: any) => r.name },
          { header: 'expansion', get: (r: any) => r.expansion },
        ],
        ctx.output,
      );
    });

  alias
    .command('delete')
    .description('Delete an alias')
    .argument('<name>', 'Alias name')
    .action(async (name: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(name in ctx.config.listAliases())) {
        throw new UsageError(`No such alias: ${name}`);
      }
      ctx.config.deleteAlias(name);
      await ctx.config.save();
      printMutation(ctx.output, { verb: 'Deleted alias', description: name });
    });
}
