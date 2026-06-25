import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { register } from '../src/commands/tag.ts';
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

describe('tag', () => {
  test('list renders rows', async () => {
    const { out, log } = await run(['tag', 'list'], {
      'GET /v1/tags': { body: { data: [{ id: '2', attributes: { tag: 'vacation-2026' } }] } },
    });
    expect(log[0].url).toContain('/v1/tags');
    expect(out).toContain('vacation-2026');
  });

  test('view targets a tag by name', async () => {
    const { log } = await run(['tag', 'view', 'vacation-2026'], {
      'GET /v1/tags/vacation-2026': {
        body: { data: { id: '2', attributes: { tag: 'vacation-2026' } } },
      },
    });
    expect(log[0].url).toContain('/v1/tags/vacation-2026');
  });

  test('create posts the body', async () => {
    const { out, log } = await run(['tag', 'create', '--tag', 'vacation-2026'], {
      'POST /v1/tags': { body: { data: { id: '3', attributes: { tag: 'vacation-2026' } } } },
    });
    expect(log[0].method).toBe('POST');
    expect(JSON.parse(log[0].body as string)).toEqual({ tag: 'vacation-2026' });
    expect(out).toContain('Created tag');
  });

  test('create surfaces a 422 as exit code 5', async () => {
    await expect(
      run(['tag', 'create', '--tag', ''], {
        'POST /v1/tags': {
          status: 422,
          body: { message: 'Validation failed', errors: { tag: ['Required.'] } },
        },
      }),
    ).rejects.toMatchObject({ exitCode: 5 });
  });

  test('delete with --yes issues DELETE (name target)', async () => {
    const { out, log } = await run(['tag', 'delete', 'vacation-2026', '--yes'], {
      'DELETE /v1/tags/vacation-2026': { status: 204 },
    });
    expect(log[0].method).toBe('DELETE');
    expect(log[0].url).toContain('/v1/tags/vacation-2026');
    expect(out).toContain('Deleted tag');
  });

  test('transactions targets the tag and passes filters', async () => {
    const { log } = await run(['tag', 'transactions', 'vacation-2026', '--type', 'withdrawal'], {
      'GET /v1/tags/vacation-2026/transactions': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/tags/vacation-2026/transactions');
    expect(log[0].url).toContain('type=withdrawal');
  });

  test('stats aggregates count + sum per type across splits', async () => {
    const split = (type: string, amount: string) => ({
      type,
      amount,
      currency_code: 'BRL',
      currency_decimal_places: 2,
    });
    const { out } = await run(['tag', 'stats', 'vacation-2026'], {
      'GET /v1/tags/vacation-2026/transactions': {
        body: {
          data: [
            { attributes: { transactions: [split('withdrawal', '10'), split('transfer', '15')] } },
            { attributes: { transactions: [split('withdrawal', '5')] } },
          ],
          meta: { pagination: { current_page: 1, total_pages: 1 } },
        },
      },
    });
    // withdrawal: 2 txns summing 15.00; transfer: 1 txn 15.00
    expect(out).toMatch(/withdrawal\s+2\s+15\.00\s+BRL/);
    expect(out).toMatch(/transfer\s+1\s+15\.00\s+BRL/);
  });

  test('stats emits structured rows under --json', async () => {
    const { out } = await run(['tag', 'stats', 'vacation-2026', '--json'], {
      'GET /v1/tags/vacation-2026/transactions': {
        body: {
          data: [
            {
              attributes: {
                transactions: [
                  {
                    type: 'withdrawal',
                    amount: '7.5',
                    currency_code: 'USD',
                    currency_decimal_places: 2,
                  },
                ],
              },
            },
          ],
          meta: { pagination: { current_page: 1, total_pages: 1 } },
        },
      },
    });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual([{ type: 'withdrawal', count: 1, sum: '7.50', currency: 'USD' }]);
  });
});
