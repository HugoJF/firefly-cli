/**
 * `firefly chart` — thin wrapper over the `/chart/*` endpoints (spec/06
 * insight.md). Raw chart series, mainly for `--json` dashboard consumers; the
 * default render is a compact table.
 *
 *   chart account    GET /chart/account/overview
 *   chart balance    GET /chart/balance/balance
 *   chart budget     GET /chart/budget/overview
 *   chart category   GET /chart/category/overview
 */
import type { Command } from 'commander';
import type { Query } from '../api/client.ts';
import { getContext } from '../context.ts';
import { renderList } from '../output/render.ts';

const CHART_ENDPOINTS: Record<string, string> = {
  account: '/chart/account/overview',
  balance: '/chart/balance/balance',
  budget: '/chart/budget/overview',
  category: '/chart/category/overview',
};

function registerChart(parent: Command, name: string): void {
  parent
    .command(name)
    .description(`Chart data for ${name} (GET ${CHART_ENDPOINTS[name]})`)
    .requiredOption('--start <date>', 'Start date (YYYY-MM-DD)')
    .requiredOption('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const query: Query = { start: opts.start, end: opts.end };
      const res = await client.get(CHART_ENDPOINTS[name], query);
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      // Chart series are `{ label, entries: { date: value } }`; show label + a
      // point count. Full series fidelity is available via --json.
      renderList(
        rows as any[],
        [
          { header: 'label', get: (r: any) => r.label ?? r.title ?? '' },
          { header: 'currency', get: (r: any) => r.currency_code ?? '' },
          {
            header: 'points',
            get: (r: any) => (r.entries ? String(Object.keys(r.entries).length) : ''),
          },
        ],
        ctx.output,
      );
    });
}

export function register(program: Command): void {
  const chart = program.command('chart').description('Raw chart data from Firefly III');
  for (const name of Object.keys(CHART_ENDPOINTS)) {
    registerChart(chart, name);
  }
}
