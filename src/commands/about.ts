/**
 * `firefly about` — GET /about: server version, OS, PHP/db driver (spec/06).
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printResult, renderItem } from '../output/render.ts';

export function register(program: Command): void {
  program
    .command('about')
    .description('Show Firefly III server version and system information')
    .action(async (_opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get('/about');
      const data = (res.data?.data ?? res.data) as Record<string, any>;

      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(data, ctx.output);
        return;
      }
      renderItem(
        data,
        [
          { label: 'Version', get: (d) => d.version ?? '' },
          { label: 'API version', get: (d) => d.api_version ?? '' },
          { label: 'PHP version', get: (d) => d.php_version ?? '' },
          { label: 'OS', get: (d) => d.os ?? '' },
          { label: 'DB driver', get: (d) => d.driver ?? '' },
        ],
        ctx.output,
      );
    });
}
