/**
 * `firefly version` — CLI version + pinned API spec version (spec/06 meta).
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printResult, renderItem } from '../output/render.ts';
import { API_SPEC_VERSION, CLI_VERSION } from '../version.ts';

export function register(program: Command): void {
  program
    .command('version')
    .description('Print the CLI version and the pinned Firefly III API spec version')
    .action(async (_opts, command: Command) => {
      const ctx = await getContext(command);
      const info = {
        cli_version: CLI_VERSION,
        api_spec_version: API_SPEC_VERSION,
      };
      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(info, ctx.output);
        return;
      }
      renderItem(
        info,
        [
          { label: 'firefly', get: (i) => i.cli_version },
          { label: 'API spec', get: (i) => i.api_spec_version },
        ],
        ctx.output,
      );
    });
}
