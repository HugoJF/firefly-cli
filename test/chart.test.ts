import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/chart.ts';
import { runCommand } from './cmdHelpers.ts';

describe('chart', () => {
  test('account → /chart/account/overview with dates', async () => {
    const { requests } = await runCommand(
      register,
      ['chart', 'account', '--start', '2026-01-01', '--end', '2026-06-30', '--json'],
      {
        'GET /chart/account/overview': {
          body: [{ label: 'Checking', currency_code: 'EUR', entries: { '2026-01-01': 1 } }],
        },
      },
    );
    const url = requests[0].url;
    expect(url).toContain('/chart/account/overview');
    expect(url).toContain('start=2026-01-01');
  });

  test('budget → /chart/budget/overview', async () => {
    const { requests } = await runCommand(
      register,
      ['chart', 'budget', '--start', 'a', '--end', 'b', '--json'],
      { 'GET /chart/budget/overview': { body: [] } },
    );
    expect(requests[0].url).toContain('/chart/budget/overview');
  });
});
