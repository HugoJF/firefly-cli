import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTokenStore } from '../src/config/tokenStore.ts';

describe('FileTokenStore round-trip (spec/02)', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'firefly-tok-'));
    path = join(dir, 'tokens.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('set/get/list/delete', async () => {
    const store = new FileTokenStore(process.env, path);
    expect(await store.get('a')).toBeUndefined();

    await store.set('a', 'token-a');
    await store.set('b', 'token-b');
    expect(await store.get('a')).toBe('token-a');
    expect((await store.list()).sort()).toEqual(['a', 'b']);

    await store.delete('a');
    expect(await store.get('a')).toBeUndefined();
    expect(await store.list()).toEqual(['b']);
  });

  test('persists across instances', async () => {
    await new FileTokenStore(process.env, path).set('x', 'secret');
    const reloaded = new FileTokenStore(process.env, path);
    expect(await reloaded.get('x')).toBe('secret');
  });

  test('writes the file 0600', async () => {
    const store = new FileTokenStore(process.env, path);
    await store.set('x', 'secret');
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
