import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from '../src/commands/alias.ts';
import { runCommand } from './cmdHelpers.ts';

describe('alias storage roundtrip', () => {
  test('set then list reads it back from config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ff-alias-'));
    const env = { FIREFLY_CONFIG_DIR: dir };

    await runCommand(register, ['alias', 'set', 'co', 'transaction create'], {}, env);
    const list = await runCommand(register, ['alias', 'list', '--json'], {}, env);
    expect(list.stdout).toContain('co');
    expect(list.stdout).toContain('transaction create');
  });

  test('delete removes it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ff-alias-'));
    const env = { FIREFLY_CONFIG_DIR: dir };
    await runCommand(register, ['alias', 'set', 'x', 'account list'], {}, env);
    await runCommand(register, ['alias', 'delete', 'x'], {}, env);
    const list = await runCommand(register, ['alias', 'list', '--json'], {}, env);
    expect(list.stdout).not.toContain('account list');
  });

  test('delete of a missing alias errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ff-alias-'));
    await expect(
      runCommand(register, ['alias', 'delete', 'nope'], {}, { FIREFLY_CONFIG_DIR: dir }),
    ).rejects.toThrow(/No such alias/);
  });
});
