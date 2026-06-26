import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPORT_KINDS, register } from '../src/commands/data.ts';
import { runCommand } from './cmdHelpers.ts';

describe('data export', () => {
  test('lists 9 kinds', () => {
    expect(EXPORT_KINDS).toHaveLength(9);
  });

  test('writes the CSV body to --output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ff-export-'));
    const out = join(dir, 'txns.csv');
    await runCommand(
      register,
      ['data', 'export', 'transactions', '--start', '2026-01-01', '--output', out],
      {
        'GET /data/export/transactions': {
          body: 'date,amount\n2026-01-01,10',
          headers: { 'content-type': 'text/csv' },
        },
      },
    );
    const written = await Bun.file(out).text();
    expect(written).toContain('date,amount');
  });

  test('rejects an invalid kind', async () => {
    await expect(runCommand(register, ['data', 'export', 'bogus'])).rejects.toThrow(
      /Invalid export kind/,
    );
  });
});

describe('data destroy guard', () => {
  test('refuses without --yes in non-interactive mode', async () => {
    await expect(
      runCommand(register, ['data', 'destroy', '--objects', 'budgets'], {
        'DELETE /data/destroy': { status: 204 },
      }),
    ).rejects.toThrow();
  });

  test('proceeds with --yes', async () => {
    const { requests } = await runCommand(
      register,
      ['data', 'destroy', '--objects', 'budgets', '--yes'],
      { 'DELETE /data/destroy': { status: 204 } },
    );
    const del = requests.find((r) => r.method === 'DELETE');
    expect(del?.url).toContain('/data/destroy');
    expect(del?.url).toContain('objects=budgets');
  });
});

describe('data bulk (structured)', () => {
  test('--where/--set assembles a where+update JSON query', async () => {
    const { requests } = await runCommand(
      register,
      ['data', 'bulk', '--where', 'category_id=1', '--set', 'category_id=5'],
      { 'POST /data/bulk/transactions': { status: 204 } },
    );
    expect(requests[0].method).toBe('POST');
    const url = new URL(requests[0].url);
    expect(JSON.parse(url.searchParams.get('query') as string)).toEqual({
      where: { category_id: '1' },
      update: { category_id: '5' },
    });
  });

  test('errors when nothing to set', async () => {
    await expect(
      runCommand(register, ['data', 'bulk', '--where', 'category_id=1']),
    ).rejects.toThrow(/Nothing to update/);
  });

  test('raw --query passes through', async () => {
    const { requests } = await runCommand(
      register,
      ['data', 'bulk', '--query', '{"update":{"category_id":"9"}}'],
      { 'POST /data/bulk/transactions': { status: 204 } },
    );
    const url = new URL(requests[0].url);
    expect(url.searchParams.get('query')).toBe('{"update":{"category_id":"9"}}');
  });
});

describe('data export --format', () => {
  test('json pulls the list endpoint and serializes', async () => {
    const { stdout, requests } = await runCommand(
      register,
      ['data', 'export', 'transactions', '--format', 'json'],
      { 'GET /v1/transactions': { body: { data: [{ id: '1' }, { id: '2' }] } } },
    );
    expect(requests[0].url).toContain('/v1/transactions');
    expect(JSON.parse(stdout)).toHaveLength(2);
  });

  test('ndjson emits one object per line', async () => {
    const { stdout } = await runCommand(
      register,
      ['data', 'export', 'transactions', '--format', 'ndjson'],
      { 'GET /v1/transactions': { body: { data: [{ id: '1' }, { id: '2' }] } } },
    );
    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).id).toBe('1');
  });

  test('rejects an invalid format', async () => {
    await expect(
      runCommand(register, ['data', 'export', 'transactions', '--format', 'xml']),
    ).rejects.toThrow(/Invalid --format/);
  });
});
