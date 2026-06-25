import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { register } from '../src/commands/budget.ts';
import { applyGlobalOptionsRecursively } from '../src/globals.ts';
import { captureStdout, fetchStub } from './helpers.ts';

type Routes = Parameters<typeof fetchStub>[0];
type Log = Array<{ method: string; url: string; body?: string }>;

const origFetch = globalThis.fetch;
const origEnv = { ...process.env };

beforeEach(() => {
  process.env.FIREFLY_URL = 'https://test.example';
  process.env.FIREFLY_TOKEN = 'tok';
  process.env.FIREFLY_CONFIG_DIR = '/nonexistent-firefly-config';
});

afterEach(() => {
  globalThis.fetch = origFetch;
  process.env = { ...origEnv };
});

async function run(argv: string[], routes: Routes): Promise<{ out: string; log: Log }> {
  const log: Log = [];
  globalThis.fetch = fetchStub(routes, log);
  const program = new Command();
  program.exitOverride();
  register(program);
  applyGlobalOptionsRecursively(program);
  const out = await captureStdout(async () => {
    await program.parseAsync(argv, { from: 'user' });
  });
  return { out, log };
}

describe('budget', () => {
  test('list passes period filters and renders rows', async () => {
    const { out, log } = await run(
      ['budget', 'list', '--start', '2026-06-01', '--end', '2026-06-30'],
      {
        'GET /v1/budgets': {
          body: { data: [{ id: '3', attributes: { name: 'Groceries', active: true } }] },
        },
      },
    );
    expect(log[0].url).toContain('/v1/budgets');
    expect(log[0].url).toContain('start=2026-06-01');
    expect(log[0].url).toContain('end=2026-06-30');
    expect(out).toContain('Groceries');
  });

  test('view fetches a single budget', async () => {
    const { out, log } = await run(['budget', 'view', '7'], {
      'GET /v1/budgets/7': { body: { data: { id: '7', attributes: { name: 'Rent' } } } },
    });
    expect(log[0].method).toBe('GET');
    expect(log[0].url).toContain('/v1/budgets/7');
    expect(out).toContain('Rent');
  });

  test('create posts a budget body', async () => {
    const { out, log } = await run(['budget', 'create', '--name', 'Fun', '--notes', 'hi'], {
      'POST /v1/budgets': { body: { data: { id: '9', attributes: { name: 'Fun' } } } },
    });
    expect(log[0].method).toBe('POST');
    expect(JSON.parse(log[0].body as string)).toEqual({ name: 'Fun', notes: 'hi' });
    expect(out).toContain('Created budget');
    expect(out).toContain('#9');
  });

  test('create surfaces a 422 as exit code 5', async () => {
    await expect(
      run(['budget', 'create', '--name', ''], {
        'POST /v1/budgets': {
          status: 422,
          body: { message: 'Validation failed', errors: { name: ['The name is required.'] } },
        },
      }),
    ).rejects.toMatchObject({ exitCode: 5 });
  });

  test('delete requires --yes and issues DELETE', async () => {
    const { out, log } = await run(['budget', 'delete', '4', '--yes'], {
      'DELETE /v1/budgets/4': { status: 204 },
    });
    expect(log[0].method).toBe('DELETE');
    expect(log[0].url).toContain('/v1/budgets/4');
    expect(out).toContain('Deleted budget');
  });

  test('transactions --none hits the unbudgeted endpoint', async () => {
    const { log } = await run(['budget', 'transactions', '--none', '--start', '2026-06-01'], {
      'GET /v1/budgets/transactions-without-budget': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/budgets/transactions-without-budget');
    expect(log[0].url).toContain('start=2026-06-01');
  });

  test('limit set posts to the budget limits endpoint', async () => {
    const { out, log } = await run(
      [
        'budget',
        'limit',
        'set',
        '3',
        '--amount',
        '400',
        '--start',
        '2026-06-01',
        '--end',
        '2026-06-30',
      ],
      {
        'POST /v1/budgets/3/limits': {
          body: { data: { id: '12', attributes: { amount: '400' } } },
        },
      },
    );
    expect(log[0].method).toBe('POST');
    expect(log[0].url).toContain('/v1/budgets/3/limits');
    expect(JSON.parse(log[0].body as string)).toEqual({
      amount: '400',
      start: '2026-06-01',
      end: '2026-06-30',
    });
    expect(out).toContain('Set budget limit');
  });

  test('limit list --currency uses the currency-scoped path', async () => {
    const { log } = await run(['budget', 'limit', 'list', '--currency', 'EUR'], {
      'GET /v1/currencies/EUR/budget-limits': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/currencies/EUR/budget-limits');
  });

  test('available list reads available-budgets', async () => {
    const { out, log } = await run(['budget', 'available', 'list'], {
      'GET /v1/available-budgets': {
        body: { data: [{ id: '1', attributes: { amount: '1000', currency_code: 'EUR' } }] },
      },
    });
    expect(log[0].url).toContain('/v1/available-budgets');
    expect(out).toContain('1000');
  });
});
