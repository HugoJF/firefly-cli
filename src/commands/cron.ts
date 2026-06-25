/**
 * `firefly cron` — trigger Firefly III scheduled jobs (spec/06 meta.md).
 * Matrix row `/cron/{cliToken}`.
 *
 *   cron run <cliToken>   GET /cron/{cliToken}
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printResult, renderItem } from '../output/render.ts';

export function register(program: Command): void {
  const cron = program.command('cron').description('Trigger Firefly III scheduled jobs');

  cron
    .command('run')
    .description('Run the cron job for a CLI token (GET /cron/{cliToken})')
    .argument('<cliToken>', 'The 32-character CLI token from your Firefly profile')
    .action(async (cliToken: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/cron/${cliToken}`);
      const data = (res.data?.data ?? res.data) as any;

      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(data ?? {}, ctx.output);
        return;
      }
      renderItem(data ?? {}, [{ label: 'Result', get: () => 'cron job triggered' }], ctx.output);
    });
}
