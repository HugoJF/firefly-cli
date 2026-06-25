/**
 * `firefly config-value` — SERVER configuration (admin), distinct from the CLI
 * `config` command (spec/06 meta.md). Matrix rows `/configuration`,
 * `/configuration/{name}`.
 *
 *   config-value get [name]          GET /configuration  (all) | /configuration/{name}
 *   config-value set <name> <value>  PUT /configuration/{name}
 *
 * Named `config-value` (not `config`) to avoid colliding with the existing CLI
 * config command.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printMutation, printResult, renderItem, renderList } from '../output/render.ts';

/** Parse a CLI value as JSON when possible (bool/number/string). */
export function parseConfigValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function register(program: Command): void {
  const cfg = program
    .command('config-value')
    .description('Manage Firefly III server configuration (admin)');

  cfg
    .command('get')
    .description('Show a server config value, or all when no name is given')
    .argument('[name]', 'Configuration key (omit for all)')
    .action(async (name: string | undefined, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(name ? `/configuration/${name}` : '/configuration');

      if (name) {
        const item = (res.data?.data ?? res.data) as any;
        renderItem(
          item,
          [
            { label: 'Name', get: (c: any) => c.title ?? c.name ?? name },
            { label: 'Value', get: (c: any) => JSON.stringify(c.value ?? c) },
            { label: 'Editable', get: (c: any) => String(c.editable ?? '') },
          ],
          ctx.output,
        );
        return;
      }

      const list = Array.isArray(res.data?.data) ? res.data.data : (res.data?.data ?? res.data);
      if (Array.isArray(list)) {
        renderList(
          list,
          [
            { header: 'name', get: (c: any) => c.title ?? c.name ?? '' },
            { header: 'value', get: (c: any) => JSON.stringify(c.value ?? '') },
            { header: 'editable', get: (c: any) => String(c.editable ?? '') },
          ],
          ctx.output,
        );
        return;
      }
      printResult(list, ctx.output);
    });

  cfg
    .command('set')
    .description('Set a server config value (PUT /configuration/{name})')
    .argument('<name>', 'Configuration key')
    .argument('<value>', 'Value (parsed as JSON when possible)')
    .action(async (name: string, value: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.put(`/configuration/${name}`, { value: parseConfigValue(value) });
      printMutation(ctx.output, { verb: 'Set config', description: `${name} = ${value}` });
    });
}
