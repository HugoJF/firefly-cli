import { describe, expect, test } from 'bun:test';
import { parsePrefValue, register } from '../src/commands/preference.ts';
import { runCommand } from './cmdHelpers.ts';

describe('preference value parsing', () => {
  test('parses JSON, falls back to string', () => {
    expect(parsePrefValue('true')).toBe(true);
    expect(parsePrefValue('42')).toBe(42);
    expect(parsePrefValue('["a","b"]')).toEqual(['a', 'b']);
    expect(parsePrefValue('plain')).toBe('plain');
  });
});

describe('preference set', () => {
  test('PUTs /preferences/{name} with a data body', async () => {
    const { requests } = await runCommand(
      register,
      ['preference', 'set', 'frontpageAccounts', '[1,2]'],
      { 'PUT /preferences/frontpageAccounts': { body: { data: { id: '9' } } } },
    );
    const put = requests.find((r) => r.method === 'PUT');
    expect(put?.url).toContain('/preferences/frontpageAccounts');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ data: [1, 2] });
  });

  test('list hits /preferences', async () => {
    const { requests } = await runCommand(register, ['pref', 'list', '--json'], {
      'GET /preferences': { body: { data: [{ attributes: { name: 'x', data: true } }] } },
    });
    expect(requests[0].url).toContain('/preferences');
  });
});
