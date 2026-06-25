/**
 * `firefly instance` — list/add/remove/default (spec/03). `add` reuses the
 * `auth login` flow; `remove` also deletes the stored token.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { ansi, colorize, printMessage, printMutation, renderList } from '../output/render.ts';
import { loginFlow } from './auth.ts';

export function register(program: Command): void {
  const instance = program.command('instance').description('Manage Firefly III instances/profiles');

  instance
    .command('list')
    .description('List configured instances')
    .action(async (_opts, command: Command) => {
      const ctx = await getContext(command);
      const rows = ctx.config.listInstances();
      renderList(
        rows,
        [
          { header: 'name', get: (r) => (r.isDefault ? `${r.name} *` : r.name) },
          { header: 'url', get: (r) => r.config.url },
          { header: 'auth', get: (r) => r.config.auth_method },
        ],
        ctx.output,
      );
    });

  instance
    .command('add')
    .description('Register a new instance (alias of `auth login`)')
    .option('--url <url>', 'Instance base URL')
    .option('--instance <name>', 'Profile name')
    .option('--with-token', 'Read the Personal Access Token from stdin')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const { name, url } = await loginFlow(ctx, opts);
      printMutation(ctx.output, { verb: 'Added instance', description: `${name} (${url})` });
    });

  instance
    .command('remove')
    .description('Delete an instance from config and its stored token')
    .argument('<name>', 'Instance to remove')
    .action(async (name: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!ctx.config.getInstance(name)) {
        throw new (await import('../api/errors.ts')).UsageError(`No such instance: ${name}`);
      }
      const ok = await ctx.confirm(`Remove instance "${name}" and its token?`);
      if (!ok) {
        printMessage('Aborted.', ctx.output);
        return;
      }
      ctx.config.removeInstance(name);
      await ctx.config.save();
      await ctx.tokenStore.delete(name);
      printMutation(ctx.output, { verb: 'Removed instance', description: name });
    });

  instance
    .command('default')
    .description('Set the default instance')
    .argument('<name>', 'Instance to make default')
    .action(async (name: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      ctx.config.setDefaultInstance(name);
      await ctx.config.save();
      printMessage(
        `Default instance is now ${colorize(name, ansi.cyan, ctx.output.color && ctx.output.isTTY)}.`,
        ctx.output,
      );
    });
}
