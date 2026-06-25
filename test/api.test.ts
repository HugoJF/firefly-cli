import { describe, expect, test } from 'bun:test';
import {
  coerceFieldValue,
  inferMethod,
  setNestedField,
  splitKeyValue,
} from '../src/commands/api.ts';

describe('method inference (spec/07)', () => {
  test('defaults to GET', () => {
    expect(inferMethod(undefined, false)).toBe('GET');
  });
  test('POST when fields present', () => {
    expect(inferMethod(undefined, true)).toBe('POST');
  });
  test('explicit method wins and uppercases', () => {
    expect(inferMethod('delete', false)).toBe('DELETE');
    expect(inferMethod('put', true)).toBe('PUT');
  });
});

describe('typed field coercion (-F)', () => {
  test('booleans, null, ints, floats', () => {
    expect(coerceFieldValue('true')).toBe(true);
    expect(coerceFieldValue('false')).toBe(false);
    expect(coerceFieldValue('null')).toBeNull();
    expect(coerceFieldValue('42')).toBe(42);
    expect(coerceFieldValue('-3')).toBe(-3);
    expect(coerceFieldValue('12.50')).toBe(12.5);
  });
  test('plain strings pass through', () => {
    expect(coerceFieldValue('withdrawal')).toBe('withdrawal');
    expect(coerceFieldValue('2026-06-25')).toBe('2026-06-25');
  });
});

describe('splitKeyValue', () => {
  test('splits on first =', () => {
    expect(splitKeyValue('a=b=c')).toEqual({ key: 'a', value: 'b=c' });
  });
  test('throws without =', () => {
    expect(() => splitKeyValue('nope')).toThrow();
  });
});

describe('setNestedField — gh-style bracket keys', () => {
  test('flat key', () => {
    const o: any = {};
    setNestedField(o, 'name', 'x');
    expect(o).toEqual({ name: 'x' });
  });

  test('array push', () => {
    const o: any = {};
    setNestedField(o, 'tags[]', 'a');
    setNestedField(o, 'tags[]', 'b');
    expect(o).toEqual({ tags: ['a', 'b'] });
  });

  test('object key', () => {
    const o: any = {};
    setNestedField(o, 'meta[note]', 'hi');
    expect(o).toEqual({ meta: { note: 'hi' } });
  });

  test('array of objects groups until a key repeats (transaction example)', () => {
    const o: any = {};
    setNestedField(o, 'transactions[][type]', 'withdrawal');
    setNestedField(o, 'transactions[][amount]', '12.50');
    setNestedField(o, 'transactions[][description]', 'Coffee');
    // second element starts when `type` repeats
    setNestedField(o, 'transactions[][type]', 'deposit');
    setNestedField(o, 'transactions[][amount]', '5');
    expect(o).toEqual({
      transactions: [
        { type: 'withdrawal', amount: '12.50', description: 'Coffee' },
        { type: 'deposit', amount: '5' },
      ],
    });
  });
});
