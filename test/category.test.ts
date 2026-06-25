import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { register } from '../src/commands/category.ts';
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

describe('category', () => {
  test('list renders rows', async () => {
    const { out, log } = await run(['category', 'list', '--limit', '5'], {
      'GET /v1/categories': { body: { data: [{ id: '7', attributes: { name: 'Groceries' } }] } },
    });
    expect(log[0].url).toContain('/v1/categories');
    expect(log[0].url).toContain('limit=5');
    expect(out).toContain('Groceries');
  });

  test('cat alias works', async () => {
    const { out } = await run(['cat', 'list'], {
      'GET /v1/categories': { body: { data: [{ id: '1', attributes: { name: 'Fuel' } }] } },
    });
    expect(out).toContain('Fuel');
  });

  test('view fetches one category', async () => {
    const { log } = await run(['category', 'view', '3'], {
      'GET /v1/categories/3': { body: { data: { id: '3', attributes: { name: 'Bills' } } } },
    });
    expect(log[0].url).toContain('/v1/categories/3');
  });

  test('create posts the body', async () => {
    const { out, log } = await run(['cat', 'create', '--name', 'Travel'], {
      'POST /v1/categories': { body: { data: { id: '5', attributes: { name: 'Travel' } } } },
    });
    expect(log[0].method).toBe('POST');
    expect(JSON.parse(log[0].body as string)).toEqual({ name: 'Travel' });
    expect(out).toContain('Created category');
  });

  test('create surfaces a 422 as exit code 5', async () => {
    await expect(
      run(['category', 'create', '--name', ''], {
        'POST /v1/categories': {
          status: 422,
          body: { message: 'Validation failed', errors: { name: ['Required.'] } },
        },
      }),
    ).rejects.toMatchObject({ exitCode: 5 });
  });

  test('delete with --yes issues DELETE', async () => {
    const { out, log } = await run(['category', 'delete', '3', '--yes'], {
      'DELETE /v1/categories/3': { status: 204 },
    });
    expect(log[0].method).toBe('DELETE');
    expect(out).toContain('Deleted category');
  });

  test('transactions passes filters', async () => {
    const { log } = await run(
      ['category', 'transactions', '7', '--start', '2026-01-01', '--type', 'withdrawal'],
      { 'GET /v1/categories/7/transactions': { body: { data: [] } } },
    );
    expect(log[0].url).toContain('/v1/categories/7/transactions');
    expect(log[0].url).toContain('start=2026-01-01');
    expect(log[0].url).toContain('type=withdrawal');
  });
});
