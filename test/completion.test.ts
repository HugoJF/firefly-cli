import { describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { collectTree, generateCompletion, register } from '../src/commands/completion.ts';
import { register as registerInsight } from '../src/commands/insight.ts';
import { runCommand } from './cmdHelpers.ts';

describe('completion script generation', () => {
  test('collectTree enumerates nouns + subcommands', () => {
    const program = new Command();
    program.name('firefly');
    registerInsight(program);
    register(program);
    const tree = collectTree(program);
    const insight = tree.nouns.find((n) => n.name === 'insight');
    expect(insight?.subs).toContain('summary');
    expect(insight?.subs).toContain('expense');
  });

  test('emits a script per shell with shell-specific markers', async () => {
    const bash = await runCommand(register, ['completion', 'bash']);
    expect(bash.stdout).toContain('complete -F _firefly');

    const zsh = await runCommand(register, ['completion', 'zsh']);
    expect(zsh.stdout).toContain('#compdef');

    const fish = await runCommand(register, ['completion', 'fish']);
    expect(fish.stdout).toContain('complete -c');
  });

  test('rejects an unsupported shell', async () => {
    await expect(runCommand(register, ['completion', 'powershell'])).rejects.toThrow(
      /Unsupported shell/,
    );
  });

  test('generateCompletion is pure and includes dynamic autocomplete hook (bash)', () => {
    const script = generateCompletion('bash', { prog: 'firefly', nouns: [], globals: ['--json'] });
    expect(script).toContain('autocomplete/');
  });
});
