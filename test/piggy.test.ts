import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { buildFundBody, register } from '../src/commands/piggy.ts';
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

describe('buildFundBody', () => {
  test('falls back to top-level current_amount with no accounts', () => {
    expect(buildFundBody({ current_amount: '100' }, 50)).toEqual({ current_amount: '150' });
    expect(buildFundBody({ current_amount: '100' }, -30)).toEqual({ current_amount: '70' });
  });

  test('adjusts a single account when present', () => {
    expect(buildFundBody({ accounts: [{ id: '3', current_amount: '200' }] }, 50)).toEqual({
      accounts: [{ id: '3', current_amount: '250' }],
    });
  });
});

describe('piggy', () => {
  test('list renders rows', async () => {
    const { out, log } = await run(['piggy', 'list'], {
      'GET /v1/piggy-banks': { body: { data: [{ id: '4', attributes: { name: 'Laptop' } }] } },
    });
    expect(log[0].url).toContain('/v1/piggy-banks');
    expect(out).toContain('Laptop');
  });

  test('list --account scopes to the account endpoint', async () => {
    const { log } = await run(['piggy', 'list', '--account', '12'], {
      'GET /v1/accounts/12/piggy-banks': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/accounts/12/piggy-banks');
  });

  test('piggy-bank alias works', async () => {
    const { out } = await run(['piggy-bank', 'view', '4'], {
      'GET /v1/piggy-banks/4': { body: { data: { id: '4', attributes: { name: 'Car' } } } },
    });
    expect(out).toContain('Car');
  });

  test('create posts with the account flag', async () => {
    const { out, log } = await run(
      ['piggy', 'create', '--name', 'Laptop', '--account', '6', '--target-amount', '2000'],
      { 'POST /v1/piggy-banks': { body: { data: { id: '9', attributes: { name: 'Laptop' } } } } },
    );
    expect(log[0].method).toBe('POST');
    const body = JSON.parse(log[0].body as string);
    expect(body.name).toBe('Laptop');
    expect(body.target_amount).toBe('2000');
    expect(body.accounts).toEqual([{ id: '6' }]);
    expect(out).toContain('Created piggy bank');
  });

  test('create surfaces a 422 as exit code 5', async () => {
    await expect(
      run(['piggy', 'create', '--name', 'x', '--account', '6'], {
        'POST /v1/piggy-banks': {
          status: 422,
          body: { message: 'Validation failed', errors: { target_amount: ['Required.'] } },
        },
      }),
    ).rejects.toMatchObject({ exitCode: 5 });
  });

  test('delete with --yes issues DELETE', async () => {
    const { out, log } = await run(['piggy', 'delete', '4', '--yes'], {
      'DELETE /v1/piggy-banks/4': { status: 204 },
    });
    expect(log[0].method).toBe('DELETE');
    expect(out).toContain('Deleted piggy bank');
  });

  test('events lists piggy events', async () => {
    const { log } = await run(['piggy', 'events', '4'], {
      'GET /v1/piggy-banks/4/events': { body: { data: [] } },
    });
    expect(log[0].url).toContain('/v1/piggy-banks/4/events');
  });

  test('fund add reads then PUTs an increased amount', async () => {
    const log: Log = [];
    globalThis.fetch = fetchStub(
      {
        'GET /v1/piggy-banks/4': {
          body: { data: { id: '4', attributes: { current_amount: '100' } } },
        },
        'PUT /v1/piggy-banks/4': { body: { data: { id: '4', attributes: {} } } },
      },
      log,
    );
    const program = new Command();
    program.exitOverride();
    register(program);
    applyGlobalOptionsRecursively(program);
    const out = await captureStdout(async () => {
      await program.parseAsync(['piggy', 'fund', 'add', '4', '--amount', '150'], { from: 'user' });
    });
    expect(log[0].method).toBe('GET');
    expect(log[1].method).toBe('PUT');
    expect(JSON.parse(log[1].body as string)).toEqual({ current_amount: '250' });
    expect(out).toContain('Added to piggy bank');
  });

  test('fund remove PUTs a decreased amount', async () => {
    const log: Log = [];
    globalThis.fetch = fetchStub(
      {
        'GET /v1/piggy-banks/4': {
          body: { data: { id: '4', attributes: { current_amount: '100' } } },
        },
        'PUT /v1/piggy-banks/4': { body: { data: { id: '4', attributes: {} } } },
      },
      log,
    );
    const program = new Command();
    program.exitOverride();
    register(program);
    applyGlobalOptionsRecursively(program);
    await captureStdout(async () => {
      await program.parseAsync(['piggy', 'fund', 'remove', '4', '--amount', '40'], {
        from: 'user',
      });
    });
    expect(JSON.parse(log[1].body as string)).toEqual({ current_amount: '60' });
  });
});
