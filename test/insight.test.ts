import { describe, expect, test } from 'bun:test';
import { INSIGHT_BY, register, validateBy } from '../src/commands/insight.ts';
import { runCommand } from './cmdHelpers.ts';

describe('insight <by> validation', () => {
  test('accepts valid by-values per flow', () => {
    expect(validateBy('expense', 'category')).toBe('category');
    expect(validateBy('income', 'revenue')).toBe('revenue');
    expect(validateBy('transfer', 'no-tag')).toBe('no-tag');
  });

  test('rejects an out-of-flow value', () => {
    // `bill` is valid for expense but not for income/transfer.
    expect(() => validateBy('income', 'bill')).toThrow(/Invalid <by>/);
    expect(() => validateBy('transfer', 'budget')).toThrow();
  });

  test('flow value sets match the spec counts (11/7/6 = 24)', () => {
    expect(INSIGHT_BY.expense).toHaveLength(11);
    expect(INSIGHT_BY.income).toHaveLength(7);
    expect(INSIGHT_BY.transfer).toHaveLength(6);
  });
});

describe('insight commands', () => {
  test('expense category hits the endpoint with start/end + filters', async () => {
    const { requests } = await runCommand(
      register,
      [
        'insight',
        'expense',
        'category',
        '--start',
        '2026-01-01',
        '--end',
        '2026-06-30',
        '--categories',
        '7',
        '--json',
      ],
      {
        'GET /insight/expense/category': {
          body: [{ id: '7', name: 'Food', difference: '-50', currency_code: 'EUR' }],
        },
      },
    );
    const url = requests[0].url;
    expect(url).toContain('/insight/expense/category');
    expect(url).toContain('start=2026-01-01');
    expect(url).toContain('end=2026-06-30');
    expect(url).toContain('categories%5B%5D=7');
  });

  test('invalid <by> errors before any request', async () => {
    await expect(
      runCommand(register, ['insight', 'income', 'bill', '--start', 'a', '--end', 'b']),
    ).rejects.toThrow(/Invalid <by>/);
  });

  test('summary flattens the BasicSummary object', async () => {
    const { stdout } = await runCommand(
      register,
      ['insight', 'summary', '--start', '2026-01-01', '--end', '2026-06-30', '--json'],
      {
        'GET /summary/basic': {
          body: {
            'balance-in-EUR': {
              key: 'balance-in-EUR',
              title: 'Balance',
              value_parsed: '10',
              currency_code: 'EUR',
            },
          },
        },
      },
    );
    expect(stdout).toContain('balance-in-EUR');
  });
});
