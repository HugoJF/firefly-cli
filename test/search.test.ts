import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/search.ts';
import { runCommand } from './cmdHelpers.ts';

describe('search', () => {
  test('transactions forwards the query', async () => {
    const { requests } = await runCommand(
      register,
      ['search', 'transactions', 'amount_more:100', '--limit', '5', '--json'],
      {
        'GET /search/transactions': {
          body: {
            data: [
              {
                id: '1',
                attributes: {
                  transactions: [{ description: 'X', amount: '100', date: '2026-01-01' }],
                },
              },
            ],
          },
        },
      },
    );
    const url = requests[0].url;
    expect(url).toContain('/search/transactions');
    expect(url).toContain('query=amount_more');
    expect(url).toContain('limit=5');
  });

  test('accounts sends field + type defaults', async () => {
    const { requests } = await runCommand(
      register,
      ['search', 'accounts', 'Savings', '--type', 'asset', '--json'],
      {
        'GET /search/accounts': {
          body: { data: [{ id: '2', attributes: { name: 'Savings', type: 'asset' } }] },
        },
      },
    );
    const url = requests[0].url;
    expect(url).toContain('/search/accounts');
    expect(url).toContain('query=Savings');
    expect(url).toContain('field=all');
    expect(url).toContain('type=asset');
  });
});
