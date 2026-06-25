import { describe, expect, test } from 'bun:test';
import type { OutputOptions } from '../src/output/render.ts';
import {
  formatMoney,
  formatSplitAmount,
  renderItem,
  renderList,
  stripAnsi,
} from '../src/output/render.ts';
import { captureStdout } from './helpers.ts';

describe('formatMoney', () => {
  test('formats Firefly raw amount strings to currency precision', () => {
    expect(formatMoney('2686.070000000000', { decimalPlaces: 2 })).toBe('2686.07');
    expect(formatMoney('24.000000000000', { decimalPlaces: 2, symbol: 'R$' })).toBe('R$24.00');
  });
  test('defaults to 2 decimals when precision unknown', () => {
    expect(formatMoney('5')).toBe('5.00');
  });
  test('shows a sign for negatives, honours forced sign', () => {
    expect(formatMoney('-186', { symbol: 'R$' })).toBe('-R$186.00');
    expect(formatMoney('101', { symbol: 'R$', sign: '+' })).toBe('+R$101.00');
  });
  test('empty/missing renders empty; non-numeric passes through', () => {
    expect(formatMoney('')).toBe('');
    expect(formatMoney(null)).toBe('');
    expect(formatMoney('n/a')).toBe('n/a');
  });
});

describe('formatSplitAmount', () => {
  const split = {
    amount: '12.500000000000',
    currency_symbol: '$',
    currency_decimal_places: 2,
    type: 'withdrawal',
  };
  test('uses the split currency + precision', () => {
    expect(formatSplitAmount(split)).toBe('$12.50');
  });
  test('signed: drives sign from transaction type', () => {
    expect(formatSplitAmount(split, { signed: true })).toBe('-$12.50');
    expect(formatSplitAmount({ ...split, type: 'deposit' }, { signed: true })).toBe('+$12.50');
    expect(formatSplitAmount({ ...split, type: 'transfer' }, { signed: true })).toBe('$12.50');
  });
  test('empty split renders empty', () => {
    expect(formatSplitAmount({})).toBe('');
    expect(formatSplitAmount(null)).toBe('');
  });
});

function opts(over: Partial<OutputOptions> = {}): OutputOptions {
  return {
    mode: 'table',
    color: false,
    quiet: false,
    pager: 'never',
    isTTY: false,
    ...over,
  };
}

const rows = [
  { id: 1, name: 'Alice', city: 'NYC' },
  { id: 2, name: 'Bob', city: 'LA' },
];
const columns = [
  { header: 'id', get: (r: any) => String(r.id) },
  { header: 'name', get: (r: any) => r.name },
];

describe('renderList modes (spec/05)', () => {
  test('plain (non-TTY) is TSV with no header', async () => {
    const out = await captureStdout(() => renderList(rows, columns, opts({ isTTY: false })));
    expect(out).toBe('1\tAlice\n2\tBob\n');
  });

  test('table (TTY) has an uppercase header row', async () => {
    const out = await captureStdout(() =>
      renderList(rows, columns, opts({ isTTY: true, pager: 'never' })),
    );
    const clean = stripAnsi(out);
    expect(clean).toContain('ID');
    expect(clean).toContain('NAME');
    expect(clean).toContain('Alice');
  });

  test('json emits the raw rows', async () => {
    const out = await captureStdout(() => renderList(rows, columns, opts({ mode: 'json' })));
    expect(JSON.parse(out)).toEqual(rows);
  });

  test('json with projection picks fields', async () => {
    const out = await captureStdout(() =>
      renderList(rows, columns, opts({ mode: 'json', jsonFields: ['id', 'name'] })),
    );
    expect(JSON.parse(out)).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
  });

  test('template renders per element with dotted paths', async () => {
    const out = await captureStdout(() =>
      renderList(rows, columns, opts({ mode: 'template', template: '{{.id}}:{{.name}}' })),
    );
    expect(out.trim().split('\n')).toEqual(['1:Alice', '2:Bob']);
  });
});

describe('renderItem', () => {
  test('json mode emits the object', async () => {
    const out = await captureStdout(() =>
      renderItem(rows[0], [{ label: 'Name', get: (r: any) => r.name }], opts({ mode: 'json' })),
    );
    expect(JSON.parse(out)).toEqual(rows[0]);
  });

  test('table mode prints label/value lines', async () => {
    const out = await captureStdout(() =>
      renderItem(
        rows[0],
        [
          { label: 'ID', get: (r: any) => String(r.id) },
          { label: 'Name', get: (r: any) => r.name },
        ],
        opts({ isTTY: true }),
      ),
    );
    const clean = stripAnsi(out);
    expect(clean).toContain('ID');
    expect(clean).toContain('Alice');
  });
});
