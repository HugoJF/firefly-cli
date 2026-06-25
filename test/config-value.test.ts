import { describe, expect, test } from 'bun:test';
import { parseConfigValue, register } from '../src/commands/config-value.ts';
import { runCommand } from './cmdHelpers.ts';

describe('config-value', () => {
  test('parseConfigValue parses JSON, falls back to string', () => {
    expect(parseConfigValue('false')).toBe(false);
    expect(parseConfigValue('hello')).toBe('hello');
  });

  test('get [name] → /configuration/{name}', async () => {
    const { requests } = await runCommand(
      register,
      ['config-value', 'get', 'is_demo_site', '--json'],
      {
        'GET /configuration/is_demo_site': { body: { data: { value: false, editable: false } } },
      },
    );
    expect(requests[0].url).toContain('/configuration/is_demo_site');
  });

  test('get (no name) → /configuration', async () => {
    const { requests } = await runCommand(register, ['config-value', 'get', '--json'], {
      'GET /configuration': { body: { data: [] } },
    });
    expect(requests[0].url).toContain('/configuration');
  });

  test('set → PUT /configuration/{name}', async () => {
    const { requests } = await runCommand(
      register,
      ['config-value', 'set', 'single_user_mode', 'true'],
      {
        'PUT /configuration/single_user_mode': { body: { data: { value: true } } },
      },
    );
    const put = requests.find((r) => r.method === 'PUT');
    expect(put?.url).toContain('/configuration/single_user_mode');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ value: true });
  });
});
