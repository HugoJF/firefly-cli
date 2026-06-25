/**
 * `firefly preference` (alias `pref`) — user preferences (spec/06 meta.md).
 *
 *   preference list                 GET /preferences
 *   preference get <name>           GET /preferences/{name}
 *   preference set <name> <value>   PUT /preferences/{name}
 *
 * `<value>` is parsed as JSON when possible (so booleans/numbers/arrays round-
 * trip), otherwise sent as a string.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';

const PREF_FIELDS = [
  { label: 'Name', get: (p: any) => p.attributes?.name ?? '' },
  { label: 'Value', get: (p: any) => JSON.stringify(p.attributes?.data ?? null) },
];

/** Parse a CLI value as JSON, falling back to the raw string. */
export function parsePrefValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function register(program: Command): void {
  const preference = program
    .command('preference')
    .aliases(['pref'])
    .description('Manage user preferences');

  preference
    .command('list')
    .description('List preferences (GET /preferences)')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/preferences', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'name', get: (p: any) => p.attributes?.name ?? '' },
          { header: 'value', get: (p: any) => JSON.stringify(p.attributes?.data ?? null) },
        ],
        ctx.output,
      );
    });

  preference
    .command('get')
    .description('Show one preference (GET /preferences/{name})')
    .argument('<name>', 'Preference name')
    .action(async (name: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/preferences/${name}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(item, PREF_FIELDS, ctx.output);
    });

  preference
    .command('set')
    .description('Set a preference (PUT /preferences/{name})')
    .argument('<name>', 'Preference name')
    .argument('<value>', 'Value (parsed as JSON when possible)')
    .action(async (name: string, value: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.put(`/preferences/${name}`, { data: parsePrefValue(value) });
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item?.id,
        verb: 'Set preference',
        description: name,
      });
    });
}
