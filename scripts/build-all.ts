/**
 * Cross-target compile (spec/10). Produces a binary per platform under dist/.
 * Run via `bun run build:all`.
 */
import { $ } from 'bun';

const targets: Array<{ target: string; outfile: string }> = [
  { target: 'bun-linux-x64', outfile: 'dist/firefly-linux-x64' },
  { target: 'bun-linux-arm64', outfile: 'dist/firefly-linux-arm64' },
  { target: 'bun-darwin-x64', outfile: 'dist/firefly-darwin-x64' },
  { target: 'bun-darwin-arm64', outfile: 'dist/firefly-darwin-arm64' },
  { target: 'bun-windows-x64', outfile: 'dist/firefly-windows-x64.exe' },
];

for (const { target, outfile } of targets) {
  console.log(`Building ${target} -> ${outfile}`);
  await $`bun build ./src/cli.ts --compile --minify --target=${target} --outfile ${outfile}`;
}

console.log('All targets built into dist/.');
