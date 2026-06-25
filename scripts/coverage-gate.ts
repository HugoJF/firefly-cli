/**
 * Coverage gate (spec/11). Cross-checks the coverage matrix against the vendored
 * OpenAPI spec so the build fails on drift. Run via `bun run coverage-gate`.
 *
 * Fails (exit 1) if:
 *   - a real `/v1/...` path has no row (or covering group) in the matrix;
 *   - any matrix row is still `planned`;
 *   - (best-effort) a matrix row cites an endpoint absent from the YAML.
 *
 * The matrix collapses endpoint families into single rows with a trailing `*`
 * (e.g. `/autocomplete/*`, `/insight/expense/*`, `/data/export/*`); those are
 * matched by prefix so every family member counts as covered.
 */
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const YAML_PATH = resolve(ROOT, 'reference/firefly-iii-v6.6.2-v1.yaml');
const MATRIX_PATH = resolve(ROOT, 'spec/08-coverage-matrix.md');

/** Collapse every `{placeholder}` to a single `{}` so naming differences don't matter. */
function normalize(path: string): string {
  return path.replace(/\{[^}]+\}/g, '{}');
}

type MatrixRow = {
  /** Raw path token from the first cell (may end with `*`). */
  rawPath: string;
  /** Normalized path; for wildcard rows this still ends with `*`. */
  norm: string;
  status: string;
  /** Source line (for error messages). */
  line: number;
};

/** Collect every `^  /v1/...` path key from the OpenAPI YAML, `/v1/` prefix stripped. */
function parseYamlPaths(text: string): string[] {
  const paths: string[] = [];
  for (const raw of text.split('\n')) {
    const match = raw.match(/^ {2}(\/v1\/[^:]+):/);
    if (match) {
      paths.push(match[1].replace(/^\/v1/, ''));
    }
  }
  return paths;
}

/** Collect matrix rows (path + status) from the markdown table. */
function parseMatrixRows(text: string): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) {
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) {
      continue;
    }
    // Skip the header and separator rows.
    if (cells[0] === 'Path' || /^-+$/.test(cells[0].replace(/\s/g, ''))) {
      continue;
    }
    const pathMatch = cells[0].match(/`([^`]+)`/);
    if (!pathMatch) {
      continue;
    }
    const rawPath = pathMatch[1];
    rows.push({
      rawPath,
      norm: normalize(rawPath),
      status: cells[3].toLowerCase(),
      line: i + 1,
    });
  }
  return rows;
}

/** Does a normalized matrix row cover a normalized YAML path (exact or prefix)? */
function rowCovers(rowNorm: string, yamlNorm: string): boolean {
  if (rowNorm.endsWith('*')) {
    return yamlNorm.startsWith(rowNorm.slice(0, -1));
  }
  return rowNorm === yamlNorm;
}

const [yaml, matrix] = await Promise.all([
  Bun.file(YAML_PATH).text(),
  Bun.file(MATRIX_PATH).text(),
]);

const yamlPaths = parseYamlPaths(yaml);
const yamlNorms = yamlPaths.map(normalize);
const rows = parseMatrixRows(matrix);

const failures: string[] = [];

// 1. Every real /v1 path must be covered by some matrix row.
const uncovered = yamlPaths.filter((p) => !rows.some((r) => rowCovers(r.norm, normalize(p))));
if (uncovered.length > 0) {
  failures.push(
    `No matrix row for ${uncovered.length} API path(s):\n${uncovered
      .map((p) => `    /v1${p}`)
      .join('\n')}`,
  );
}

// 2. No row may be left `planned`.
const planned = rows.filter((r) => r.status === 'planned');
if (planned.length > 0) {
  failures.push(
    `${planned.length} matrix row(s) still 'planned':\n${planned
      .map((r) => `    line ${r.line}: ${r.rawPath}`)
      .join('\n')}`,
  );
}

// 3. Best-effort: every cited endpoint must exist in the YAML.
const dangling = rows.filter((r) => {
  if (r.norm.endsWith('*')) {
    const prefix = r.norm.slice(0, -1);
    return !yamlNorms.some((y) => y.startsWith(prefix));
  }
  return !yamlNorms.includes(r.norm);
});
if (dangling.length > 0) {
  failures.push(
    `${dangling.length} matrix row(s) cite an endpoint absent from the YAML:\n${dangling
      .map((r) => `    line ${r.line}: ${r.rawPath}`)
      .join('\n')}`,
  );
}

if (failures.length > 0) {
  console.error('coverage-gate: FAIL\n');
  console.error(failures.join('\n\n'));
  process.exit(1);
}

const modelled = rows.filter((r) => r.status === 'specced').length;
const apiOnly = rows.filter((r) => r.status === 'api-only').length;
console.log(
  `coverage-gate: PASS — ${yamlPaths.length} API paths covered by ${rows.length} matrix rows (${modelled} specced, ${apiOnly} api-only).`,
);
