/**
 * Output rendering (spec/05). Four modes:
 *   - table    : aligned, coloured columns (default on a TTY)
 *   - plain    : TSV, no decoration (default when piped / non-TTY)
 *   - json     : raw JSON, optionally projected with `--json a,b,c`
 *   - template : pragmatic Go-template-style substitution (`--template`)
 *
 * Noun-command agents call this module — NOT process.stdout directly — so all
 * commands share one output contract:
 *
 *   renderList(rows, columns, ctx)   list verbs
 *   renderItem(row, fields, ctx)     view verbs
 *   printResult(data, ctx)           raw passthrough (e.g. `api`)
 *   printMutation(ctx, summary)      one-line create/edit/delete confirmation
 *   printMessage / printError        chatter + errors
 */
import { spawnSync } from 'node:child_process';

export type RenderMode = 'table' | 'json' | 'template';

export interface OutputOptions {
  /** Resolved primary mode. `table` also produces `plain` when not a TTY. */
  mode: RenderMode;
  /** Field projection for `--json a,b`. */
  jsonFields?: string[];
  /** Raw template string for `--template`. */
  template?: string;
  /** Colour enabled (already resolved against TTY / NO_COLOR / --no-color). */
  color: boolean;
  /** Suppress success chatter (`--quiet`). Never suppresses errors. */
  quiet: boolean;
  /** Pager policy (spec/05). */
  pager: 'auto' | 'always' | 'never';
  /** Whether stdout is a TTY (drives table-vs-plain + pager). */
  isTTY: boolean;
}

/** A display column: header + extractor from a row object. */
export interface Column<T = any> {
  header: string;
  get: (row: T) => string;
}

export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

export function colorize(text: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${text}${ansi.reset}` : text;
}

/**
 * Format a Firefly money amount to its currency's precision (spec/05).
 *
 * Firefly returns amounts as strings like `"2686.070000000000"`; we render them
 * at `decimalPlaces` (default 2 when the currency precision is unknown),
 * optionally prefixed with a currency `symbol` and a sign. Pass `sign: '+'|'-'`
 * to force a sign (e.g. signed transaction amounts driven by type); otherwise a
 * `-` is shown only for negative values. Empty/missing input renders as `''`;
 * non-numeric input is passed through unchanged.
 */
export function formatMoney(
  amount: string | number | null | undefined,
  opts: { decimalPlaces?: number; symbol?: string; sign?: '' | '+' | '-' } = {},
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '';
  }
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n)) {
    return String(amount);
  }
  const dp = Number.isFinite(opts.decimalPlaces) ? (opts.decimalPlaces as number) : 2;
  const body = Math.abs(n).toFixed(dp);
  const sign = opts.sign ?? (n < 0 ? '-' : '');
  return `${sign}${opts.symbol ?? ''}${body}`;
}

/**
 * Format a Firefly transaction split's amount using its own currency symbol and
 * precision (spec/05). With `signed: true` the sign is driven by the split type
 * (`-` withdrawal, `+` deposit, none for transfer). Used by every command that
 * lists transactions so amounts render consistently (e.g. `$12.50`, not the raw
 * `12.500000000000`).
 */
export function formatSplitAmount(split: any, opts: { signed?: boolean } = {}): string {
  if (!split || split.amount == null || split.amount === '') {
    return '';
  }
  const sign = !opts.signed
    ? undefined
    : split.type === 'withdrawal'
      ? '-'
      : split.type === 'deposit'
        ? '+'
        : '';
  return formatMoney(split.amount, {
    symbol: split.currency_symbol ?? '',
    decimalPlaces: split.currency_decimal_places,
    sign,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render a list of rows. Honours json/template overrides, else table/plain. */
export function renderList<T>(rows: T[], columns: Column<T>[], opts: OutputOptions): void {
  if (opts.mode === 'json') {
    emitJson(rows, opts);
    return;
  }
  if (opts.mode === 'template') {
    emitTemplate(rows, opts);
    return;
  }
  const headers = columns.map((c) => c.header);
  const matrix = rows.map((row) => columns.map((c) => safeCell(c.get(row))));
  const text = opts.isTTY ? formatTable(headers, matrix, opts.color) : formatPlain(matrix);
  writeOut(text, opts, /*pageable*/ true);
}

/** Render a single object as key/value rows (view verbs). */
export function renderItem<T extends Record<string, any>>(
  row: T,
  fields: Array<{ label: string; get: (row: T) => string }>,
  opts: OutputOptions,
): void {
  if (opts.mode === 'json') {
    emitJson(row, opts);
    return;
  }
  if (opts.mode === 'template') {
    emitTemplate(row, opts);
    return;
  }
  const labelWidth = Math.max(...fields.map((f) => f.label.length));
  const lines = fields.map((f) => {
    const label = f.label.padEnd(labelWidth);
    const styled = opts.isTTY ? colorize(label, ansi.bold, opts.color) : f.label;
    return `${styled}  ${safeCell(f.get(row))}`;
  });
  writeOut(lines.join('\n'), opts, true);
}

/** Emit arbitrary data respecting json/template; default falls back to JSON. */
export function printResult(data: unknown, opts: OutputOptions): void {
  if (opts.mode === 'template') {
    emitTemplate(data, opts);
    return;
  }
  emitJson(data, opts);
}

/** One-line mutation confirmation (spec/05). Suppressed by --quiet. */
export function printMutation(
  opts: OutputOptions,
  summary: { id?: string | number; description: string; verb?: string },
): void {
  if (opts.quiet) {
    return;
  }
  if (opts.mode === 'json') {
    emitJson(summary, opts);
    return;
  }
  const check = colorize('✓', ansi.green, opts.color && opts.isTTY);
  const id =
    summary.id !== undefined ? colorize(`#${summary.id}`, ansi.cyan, opts.color && opts.isTTY) : '';
  const verb = summary.verb ? `${summary.verb} ` : '';
  const line = `${check} ${verb}${id} ${summary.description}`.replace(/\s+/g, ' ').trim();
  process.stdout.write(`${line}\n`);
}

/** Non-essential chatter to stdout (suppressed by --quiet). */
export function printMessage(message: string, opts: OutputOptions): void {
  if (!opts.quiet) {
    process.stdout.write(`${message}\n`);
  }
}

/** Error line(s) to stderr. Never suppressed. */
export function printError(message: string, opts?: { color?: boolean }): void {
  const colored = colorize('error:', ansi.red, opts?.color ?? false);
  process.stderr.write(`${colored} ${message}\n`);
}

// ---------------------------------------------------------------------------
// JSON / template / table internals
// ---------------------------------------------------------------------------

function emitJson(data: unknown, opts: OutputOptions): void {
  let out = data;
  if (opts.jsonFields && opts.jsonFields.length > 0) {
    out = Array.isArray(data)
      ? data.map((d) => project(d, opts.jsonFields!))
      : project(data, opts.jsonFields);
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

/** Pick a subset of keys (supports dotted paths) from an object. */
function project(obj: unknown, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    out[field] = lookup(obj, field);
  }
  return out;
}

/**
 * Pragmatic Go-template-style renderer (foundation subset, spec/05).
 * Supports `{{.dotted.path}}` substitution and `{{.}}` for the whole value.
 * Arrays are iterated, applying the template per element (newline-joined).
 * Helper pipelines (timeago/truncate/color) are a documented post-foundation
 * extension; see docs/COMMAND_CONVENTION.md.
 */
function emitTemplate(data: unknown, opts: OutputOptions): void {
  const tmpl = opts.template ?? '';
  const apply = (value: unknown): string =>
    tmpl.replace(/\{\{\s*(.+?)\s*\}\}/g, (_m, expr: string) => {
      const path = expr.trim();
      const resolved = path === '.' ? value : lookup(value, path.replace(/^\./, ''));
      return resolved == null
        ? ''
        : typeof resolved === 'object'
          ? JSON.stringify(resolved)
          : String(resolved);
    });

  const text = Array.isArray(data) ? data.map(apply).join('\n') : apply(data);
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

/** Public template render for callers outside the OutputOptions flow (e.g. `api -t`). */
export function emitTemplatePublic(data: unknown, template: string): void {
  emitTemplate(data, { template } as OutputOptions);
}

/** Resolve a dotted path against a value (`a.b.0.c`). */
export function lookup(value: unknown, path: string): unknown {
  if (path === '' || path === '.') {
    return value;
  }
  let node: any = value;
  for (const part of path.split('.')) {
    if (node == null) {
      return undefined;
    }
    node = node[part];
  }
  return node;
}

function safeCell(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value);
}

export function formatTable(headers: string[], rows: string[][], color: boolean): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] ?? '').length)),
  );
  const headerLine = headers
    .map((h, i) => colorize(h.toUpperCase().padEnd(widths[i]), ansi.bold, color))
    .join('  ');
  const body = rows.map((r) => r.map((c, i) => padVisible(c, widths[i])).join('  ')).join('\n');
  return rows.length > 0 ? `${headerLine}\n${body}` : headerLine;
}

export function formatPlain(rows: string[][]): string {
  return rows.map((r) => r.map((c) => stripAnsi(c)).join('\t')).join('\n');
}

function padVisible(text: string, width: number): string {
  const visible = stripAnsi(text).length;
  return text + ' '.repeat(Math.max(0, width - visible));
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

// ---------------------------------------------------------------------------
// Output sink + pager
// ---------------------------------------------------------------------------

function writeOut(text: string, opts: OutputOptions, pageable: boolean): void {
  const body = text.endsWith('\n') ? text : `${text}\n`;
  if (pageable && shouldPage(body, opts)) {
    if (pageThrough(body)) {
      return;
    }
  }
  process.stdout.write(body);
}

function shouldPage(text: string, opts: OutputOptions): boolean {
  if (opts.pager === 'never' || !opts.isTTY) {
    return false;
  }
  if (opts.pager === 'always') {
    return true;
  }
  // auto: page only when taller than ~a screen.
  const rows = (process.stdout.rows || 24) as number;
  return text.split('\n').length > rows;
}

function pageThrough(text: string): boolean {
  const pager = process.env.PAGER || 'less';
  const [cmd, ...args] = pager.split(/\s+/);
  if (cmd === 'less' && args.length === 0) {
    args.push('-FRX');
  }
  try {
    const res = spawnSync(cmd, args, { input: text, stdio: ['pipe', 'inherit', 'inherit'] });
    return res.status === 0 || res.status === null;
  } catch {
    return false;
  }
}
