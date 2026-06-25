import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { register } from '../src/commands/recurrence.ts';
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

describe('recurrence', () => {
  test('list renders rows', async () => {
    const { out, log } = await run(['recurrence', 'list'], {
      'GET /v1/recurrences': { body: { data: [{ id: '3', attributes: { title: 'Rent' } }] } },
    });
    expect(log[0].url).toContain('/v1/recurrences');
    expect(out).toContain('Rent');
  });

  test('recurring alias + --currency scope', async () => {
    const { log } = await run(['recurring', 'list', '--currency', 'EUR'], {
      'GET /v1/currencies/EUR/recurrences': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/currencies/EUR/recurrences');
  });

  test('view fetches one recurrence', async () => {
    const { log } = await run(['recurrence', 'view', '3'], {
      'GET /v1/recurrences/3': { body: { data: { id: '3', attributes: { title: 'Rent' } } } },
    });
    expect(log[0].url).toContain('/v1/recurrences/3');
  });

  test('create posts a nested recurrence body (flags resolve references)', async () => {
    const { out, log } = await run(
      [
        'recurrence',
        'create',
        '--type',
        'withdrawal',
        '--title',
        'Rent',
        '--amount',
        '1200',
        '--source',
        '10',
        '--destination',
        '20',
        '--first-date',
        '2026-07-01',
        '--repeat-freq',
        'monthly',
        '--moment',
        '1',
      ],
      { 'POST /v1/recurrences': { body: { data: { id: '7', attributes: { title: 'Rent' } } } } },
    );
    expect(log[0].method).toBe('POST');
    const body = JSON.parse(log[0].body as string);
    expect(body.type).toBe('withdrawal');
    expect(body.title).toBe('Rent');
    expect(body.first_date).toBe('2026-07-01');
    expect(body.repetitions).toEqual([{ type: 'monthly', moment: '1' }]);
    expect(body.transactions[0]).toMatchObject({
      amount: '1200',
      source_id: '10',
      destination_id: '20',
      description: 'Rent',
    });
    expect(out).toContain('Created recurrence');
  });

  test('create surfaces a 422 as exit code 5', async () => {
    await expect(
      run(
        [
          'recurrence',
          'create',
          '--type',
          'withdrawal',
          '--title',
          'x',
          '--amount',
          '1',
          '--source',
          '1',
          '--destination',
          '2',
          '--first-date',
          'bad',
          '--repeat-freq',
          'monthly',
        ],
        {
          'POST /v1/recurrences': {
            status: 422,
            body: { message: 'Validation failed', errors: { first_date: ['Bad date.'] } },
          },
        },
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
  });

  test('delete with --yes issues DELETE', async () => {
    const { out, log } = await run(['recurrence', 'delete', '3', '--yes'], {
      'DELETE /v1/recurrences/3': { status: 204 },
    });
    expect(log[0].method).toBe('DELETE');
    expect(out).toContain('Deleted recurrence');
  });

  test('trigger posts to the trigger endpoint', async () => {
    const { out, log } = await run(['recurrence', 'trigger', '3'], {
      'POST /v1/recurrences/3/trigger': { body: { data: [] } },
    });
    expect(log[0].method).toBe('POST');
    expect(log[0].url).toContain('/v1/recurrences/3/trigger');
    expect(out).toContain('Triggered recurrence');
  });

  test('transactions reads created transactions', async () => {
    const { log } = await run(['recurrence', 'transactions', '3'], {
      'GET /v1/recurrences/3/transactions': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/recurrences/3/transactions');
  });
});
