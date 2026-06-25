import { describe, expect, test } from 'bun:test';
import { UsageError } from '../src/api/errors.ts';
import { ConfigStore } from '../src/config/store.ts';
import { buildOutputOptions, createContext } from '../src/context.ts';
import { MemoryTokenStore } from './helpers.ts';

function storeWithInstances() {
  return ConfigStore.inMemory({
    default_instance: 'personal',
    instances: {
      personal: { url: 'https://personal.example', auth_method: 'pat' },
      work: { url: 'https://work.example', auth_method: 'pat' },
    },
  });
}

describe('ConfigStore dotted get/set', () => {
  test('reads nested values', () => {
    const c = storeWithInstances();
    expect(c.get('default_instance')).toBe('personal');
    expect(c.get('instances.work.url')).toBe('https://work.example');
    expect(c.get('settings.output')).toBe('table');
    expect(c.get('nope.missing')).toBeUndefined();
  });

  test('writes nested values, creating intermediates', () => {
    const c = ConfigStore.inMemory();
    c.set('instances.new.url', 'https://new.example');
    expect(c.get('instances.new.url')).toBe('https://new.example');
  });

  test('validates settings enums', () => {
    const c = ConfigStore.inMemory();
    expect(() => c.set('settings.output', 'bogus')).toThrow(UsageError);
    c.set('settings.output', 'json');
    expect(c.get('settings.output')).toBe('json');
  });

  test('validates auth_method', () => {
    const c = storeWithInstances();
    expect(() => c.set('instances.work.auth_method', 'sso')).toThrow(UsageError);
  });
});

describe('instance management', () => {
  test('upsert sets default when none', () => {
    const c = ConfigStore.inMemory();
    c.upsertInstance('a', { url: 'https://a', auth_method: 'pat' });
    expect(c.defaultInstance).toBe('a');
  });
  test('removing the default reassigns', () => {
    const c = storeWithInstances();
    c.removeInstance('personal');
    expect(c.defaultInstance).toBe('work');
  });
});

describe('instance resolution precedence (spec/02)', () => {
  const baseDeps = (env: NodeJS.ProcessEnv) => ({
    config: storeWithInstances(),
    tokenStore: (() => {
      const t = new MemoryTokenStore();
      t.set('personal', 'tok-personal');
      t.set('work', 'tok-work');
      return t;
    })(),
    env,
  });

  test('1) FIREFLY_TOKEN + FIREFLY_URL env wins', async () => {
    const ctx = await createContext(
      { instance: 'work' },
      baseDeps({ FIREFLY_TOKEN: 'envtok', FIREFLY_URL: 'https://env.example' }),
    );
    const inst = await ctx.resolveInstance();
    expect(inst.name).toBe('(env)');
    expect(inst.token).toBe('envtok');
    expect(inst.url).toBe('https://env.example');
  });

  test('2) --instance flag beats FIREFLY_INSTANCE and default', async () => {
    const ctx = await createContext(
      { instance: 'work' },
      baseDeps({ FIREFLY_INSTANCE: 'personal' }),
    );
    const inst = await ctx.resolveInstance();
    expect(inst.name).toBe('work');
    expect(inst.token).toBe('tok-work');
  });

  test('3) FIREFLY_INSTANCE beats default', async () => {
    const ctx = await createContext({}, baseDeps({ FIREFLY_INSTANCE: 'work' }));
    const inst = await ctx.resolveInstance();
    expect(inst.name).toBe('work');
  });

  test('4) default instance is the fallback', async () => {
    const ctx = await createContext({}, baseDeps({}));
    const inst = await ctx.resolveInstance();
    expect(inst.name).toBe('personal');
  });

  test('missing token → AuthError (exit 4)', async () => {
    const ctx = await createContext(
      { instance: 'work' },
      { config: storeWithInstances(), tokenStore: new MemoryTokenStore(), env: {} },
    );
    await expect(ctx.resolveInstance()).rejects.toMatchObject({ exitCode: 4 });
  });
});

describe('buildOutputOptions precedence (spec/03)', () => {
  test('--template > --json > settings', () => {
    const c = ConfigStore.inMemory({ settings: { output: 'json' } as any });
    expect(buildOutputOptions({ template: '{{.x}}' }, c, {}).mode).toBe('template');
    expect(buildOutputOptions({ json: true }, c, {}).mode).toBe('json');
    expect(buildOutputOptions({}, c, {}).mode).toBe('json'); // from settings
  });

  test('--json with fields projects', () => {
    const c = ConfigStore.inMemory();
    const o = buildOutputOptions({ json: 'id,name' }, c, {});
    expect(o.jsonFields).toEqual(['id', 'name']);
  });

  test('colour: --no-color > NO_COLOR > settings', () => {
    const c = ConfigStore.inMemory({ settings: { color: 'always' } as any });
    expect(buildOutputOptions({ color: false }, c, {}).color).toBe(false);
    expect(buildOutputOptions({}, c, { NO_COLOR: '1' }).color).toBe(false);
    expect(buildOutputOptions({}, c, {}).color).toBe(true); // settings: always
  });
});
