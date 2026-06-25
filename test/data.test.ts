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
