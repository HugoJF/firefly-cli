import { describe, expect, test } from 'bun:test';
import {
  AuthError,
  ExitCode,
  FireflyApiError,
  UsageError,
  expandValidation,
} from '../src/api/errors.ts';

describe('FireflyApiError.fromResponse → exit codes (spec/05)', () => {
  const cases: Array<[number, number]> = [
    [401, ExitCode.Auth],
    [403, ExitCode.Auth],
    [404, ExitCode.NotFound],
    [409, ExitCode.Conflict],
    [412, ExitCode.Conflict],
    [422, ExitCode.Validation],
    [500, ExitCode.Server],
    [503, ExitCode.Server],
    [418, ExitCode.Generic],
  ];

  for (const [status, exit] of cases) {
    test(`${status} → exit ${exit}`, () => {
      const err = FireflyApiError.fromResponse(status, 'GET', 'http://x/api/v1/y', {
        message: 'boom',
      });
      expect(err.exitCode).toBe(exit as any);
      expect(err.status).toBe(status);
    });
  }

  test('422 expands field errors into the message', () => {
    const err = FireflyApiError.fromResponse(422, 'POST', 'http://x', {
      message: 'The given data was invalid.',
      errors: { amount: ['amount is required'], 'transactions.0.type': ['bad type'] },
    });
    expect(err.exitCode).toBe(ExitCode.Validation as any);
    expect(err.message).toContain('amount: amount is required');
    expect(err.message).toContain('transactions.0.type: bad type');
    expect(err.fieldErrors?.amount?.[0]).toBe('amount is required');
  });

  test('falls back to HTTP status when no message', () => {
    const err = FireflyApiError.fromResponse(500, 'GET', 'http://x', {});
    expect(err.message).toBe('HTTP 500');
  });
});

describe('typed CLI errors', () => {
  test('UsageError is exit 2', () => {
    expect(new UsageError('bad').exitCode).toBe(ExitCode.Usage as any);
  });
  test('AuthError is exit 4 with a default hint', () => {
    const e = new AuthError('no creds');
    expect(e.exitCode).toBe(ExitCode.Auth as any);
    expect(e.hint).toContain('auth login');
  });
});

describe('expandValidation', () => {
  test('returns the message unchanged with no errors', () => {
    expect(expandValidation('msg')).toBe('msg');
  });
  test('lists each field message', () => {
    const out = expandValidation('msg', { a: ['x', 'y'] });
    expect(out).toContain('- a: x');
    expect(out).toContain('- a: y');
  });
});
