/**
 * Minimal interactive prompt helpers (spec/09 TTY rules). No deps; reads lines
 * from stdin via node:readline. Callers MUST gate on `isInteractive()` and fall
 * back to a flag error in non-TTY contexts.
 */
import { createInterface } from 'node:readline';

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Read a single line. `mask` hides input (for tokens). */
export async function readLine(query: string, opts: { mask?: boolean } = {}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Masking: intercept the output writer while the question is active.
  if (opts.mask) {
    const out = (rl as any).output;
    let first = true;
    (rl as any)._writeToOutput = (str: string) => {
      if (first) {
        out.write(str);
        first = false;
      } else if (str.includes('\n') || str.includes('\r')) {
        out.write('\n');
      }
      // swallow echoed characters
    };
  }
  try {
    return await new Promise<string>((resolve) => {
      rl.question(query, (answer) => resolve(answer));
    });
  } finally {
    rl.close();
  }
}

/** Yes/no confirmation. Returns the default when the user just presses enter. */
export async function confirmPrompt(message: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await readLine(`${message} ${suffix} `)).trim().toLowerCase();
  if (answer === '') {
    return defaultYes;
  }
  return answer === 'y' || answer === 'yes';
}

/** Read stdin fully (for `--with-token`, `--input -`, `-F field=-`). */
export async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Uint8Array);
  }
  return Buffer.concat(chunks).toString('utf8');
}
