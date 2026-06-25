import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { register } from '../src/commands/bill.ts';
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

describe('bill', () => {
  test('list renders rows', async () => {
    const { out, log } = await run(['bill', 'list'], {
      'GET /v1/bills': { body: { data: [{ id: '5', attributes: { name: 'Netflix' } }] } },
    });
    expect(log[0].url).toContain('/v1/bills');
    expect(out).toContain('Netflix');
  });

  test('list --currency uses currency-scoped path', async () => {
    const { log } = await run(['bill', 'list', '--currency', 'USD'], {
      'GET /v1/currencies/USD/bills': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/currencies/USD/bills');
  });

  test('subscription alias works', async () => {
    const { out } = await run(['subscription', 'list'], {
      'GET /v1/bills': { body: { data: [{ id: '1', attributes: { name: 'Gym' } }] } },
    });
    expect(out).toContain('Gym');
  });

  test('view fetches one bill', async () => {
    const { log } = await run(['bill', 'view', '5'], {
      'GET /v1/bills/5': { body: { data: { id: '5', attributes: { name: 'Netflix' } } } },
    });
    expect(log[0].url).toContain('/v1/bills/5');
  });

  test('create posts the body', async () => {
    const { out, log } = await run(
      [
        'bill',
        'create',
        '--name',
        'Netflix',
        '--amount-min',
        '15',
        '--amount-max',
        '16',
        '--repeat-freq',
        'monthly',
        '--date',
        '2026-06-01',
      ],
      { 'POST /v1/bills': { body: { data: { id: '8', attributes: { name: 'Netflix' } } } } },
    );
    expect(log[0].method).toBe('POST');
    expect(JSON.parse(log[0].body as string)).toEqual({
      name: 'Netflix',
      amount_min: '15',
      amount_max: '16',
      repeat_freq: 'monthly',
      date: '2026-06-01',
    });
    expect(out).toContain('Created bill');
  });

  test('create surfaces a 422 as exit code 5', async () => {
    await expect(
      run(
        [
          'bill',
          'create',
          '--name',
          'x',
          '--amount-min',
          '1',
          '--amount-max',
          '2',
          '--repeat-freq',
          'monthly',
          '--date',
          'bad',
        ],
        {
          'POST /v1/bills': {
            status: 422,
            body: { message: 'Validation failed', errors: { date: ['Bad date.'] } },
          },
        },
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
  });

  test('delete with --yes issues DELETE', async () => {
    const { out, log } = await run(['bill', 'delete', '5', '--yes'], {
      'DELETE /v1/bills/5': { status: 204 },
    });
    expect(log[0].method).toBe('DELETE');
    expect(out).toContain('Deleted bill');
  });

  test('transactions hits the matched-transactions endpoint', async () => {
    const { log } = await run(['bill', 'transactions', '5'], {
      'GET /v1/bills/5/transactions': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/bills/5/transactions');
  });

  test('rules lists the bill rules', async () => {
    const { out, log } = await run(['bill', 'rules', '5'], {
      'GET /v1/bills/5/rules': {
        body: { data: [{ id: '2', attributes: { title: 'Match Netflix' } }] },
      },
    });
    expect(log[0].url).toContain('/v1/bills/5/rules');
    expect(out).toContain('Match Netflix');
  });
});
