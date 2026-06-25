/**
 * Error taxonomy + exit-code mapping (spec/05 "Exit codes").
 *
 * Every error thrown by the CLI should be (or extend) `CliError` so the
 * top-level handler in `cli.ts` can print a clean stderr message and exit with
 * the right code. Network/API failures go through `FireflyApiError.fromResponse`.
 */

export const ExitCode = {
  Success: 0,
  Generic: 1,
  Usage: 2,
  NotFound: 3,
  Auth: 4,
  Validation: 5,
  Conflict: 6,
  Server: 7,
  Cancelled: 8,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** Firefly III error envelope (spec/01, spec/05). */
export interface FireflyErrorEnvelope {
  message?: string;
  errors?: Record<string, string[]>;
  exception?: string;
}

/** Base error: carries a process exit code + optional remediation hint. */
export class CliError extends Error {
  readonly exitCode: ExitCodeValue;
  /** Optional second-line hint printed under the message (e.g. an auth tip). */
  readonly hint?: string;

  constructor(message: string, exitCode: ExitCodeValue = ExitCode.Generic, hint?: string) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

/** Bad flags/args → exit 2. */
export class UsageError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.Usage, hint);
    this.name = 'UsageError';
  }
}

/** Missing/invalid credentials → exit 4. */
export class AuthError extends CliError {
  constructor(
    message: string,
    hint = 'Run `firefly auth login` (or set FIREFLY_TOKEN + FIREFLY_URL).',
  ) {
    super(message, ExitCode.Auth, hint);
    this.name = 'AuthError';
  }
}

/** User aborted a prompt / SIGINT → exit 8. */
export class CancelledError extends CliError {
  constructor(message = 'Cancelled.') {
    super(message, ExitCode.Cancelled);
    this.name = 'CancelledError';
  }
}

/** An HTTP error response from Firefly, mapped to a typed CLI error. */
export class FireflyApiError extends CliError {
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;
  readonly method: string;
  readonly url: string;

  constructor(args: {
    message: string;
    exitCode: ExitCodeValue;
    status: number;
    method: string;
    url: string;
    fieldErrors?: Record<string, string[]>;
    hint?: string;
  }) {
    super(args.message, args.exitCode, args.hint);
    this.name = 'FireflyApiError';
    this.status = args.status;
    this.method = args.method;
    this.url = args.url;
    this.fieldErrors = args.fieldErrors;
  }

  /**
   * Map an HTTP status + parsed envelope to the right exit code + message.
   * 401/403 → 4, 404 → 3, 409/412 → 6, 422 → 5, 5xx → 7, else → 1.
   */
  static fromResponse(status: number, method: string, url: string, body: unknown): FireflyApiError {
    const envelope = (body && typeof body === 'object' ? body : {}) as FireflyErrorEnvelope;
    const baseMessage = envelope.message || `HTTP ${status}`;

    let exitCode: ExitCodeValue = ExitCode.Generic;
    let hint: string | undefined;
    let message = baseMessage;

    if (status === 401 || status === 403) {
      exitCode = ExitCode.Auth;
      hint = 'Token may be missing, expired, or lacking scope. Try `firefly auth login`.';
    } else if (status === 404) {
      exitCode = ExitCode.NotFound;
    } else if (status === 409 || status === 412) {
      exitCode = ExitCode.Conflict;
    } else if (status === 422) {
      exitCode = ExitCode.Validation;
      message = expandValidation(baseMessage, envelope.errors);
    } else if (status >= 500) {
      exitCode = ExitCode.Server;
    }

    return new FireflyApiError({
      message,
      exitCode,
      status,
      method,
      url,
      hint,
      fieldErrors: envelope.errors,
    });
  }
}

/** Expand `errors{field:[msgs]}` into a readable multi-line list (spec/05). */
export function expandValidation(message: string, errors?: Record<string, string[]>): string {
  if (!errors || Object.keys(errors).length === 0) {
    return message;
  }
  const lines = Object.entries(errors).flatMap(([field, msgs]) =>
    msgs.map((m) => `  - ${field}: ${m}`),
  );
  return `${message}\n${lines.join('\n')}`;
}
