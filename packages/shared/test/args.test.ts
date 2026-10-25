import { describe, expect, it } from 'vitest';
import {
  emptySettings,
  extractModelArg,
  formatArgs,
  normalizeUserArgs,
  parseArgs,
  replaceModelArg,
  reservedArgError,
} from '../src/args.js';

describe('parseArgs', () => {
  it('quebra por espaços e ignora espaços repetidos', () => {
    expect(parseArgs('  --dangerously-skip-permissions   --model opus ')).toEqual(['--dangerously-skip-permissions', '--model', 'opus']);
    expect(parseArgs('')).toEqual([]);
  });

  it('aspas duplas agrupam e \\" vira aspas literais', () => {
    expect(parseArgs('--append-system-prompt "fale em português" -x')).toEqual(['--append-system-prompt', 'fale em português', '-x']);
    expect(parseArgs('"diga \\"oi\\""')).toEqual(['diga "oi"']);
    expect(parseArgs('--flag="a b"')).toEqual(['--flag=a b']);
  });

  it('aspas sem fechamento são erro', () => {
    expect(() => parseArgs('--x "aberta')).toThrow('Aspas sem fechamento nos argumentos. Feche as aspas ou remova-as.');
  });
});

describe('formatArgs', () => {
  it('ida e volta preserva argumentos com espaço e aspas', () => {
    const args = ['--append-system-prompt', 'fale em português', 'diga "oi"', '--model', 'opus'];
    expect(formatArgs(args)).toBe('--append-system-prompt "fale em português" "diga \\"oi\\"" --model opus');
    expect(parseArgs(formatArgs(args))).toEqual(args);
    expect(formatArgs([])).toBe('');
  });
});

describe('reservedArgError', () => {
  it('recusa reservados do claude, sozinhos ou com =valor', () => {
    expect(reservedArgError('claude', ['--resume'])).toMatch(/O argumento --resume é controlado pelo Orquestra \(retomada de sessão\)/);
    expect(reservedArgError('claude', ['--settings=x.json'])).toMatch(/--settings é controlado pelo Orquestra \(hooks\)/);
    expect(reservedArgError('claude', ['-c'])).toMatch(/-c é controlado/);
    expect(reservedArgError('claude', ['--dangerously-skip-permissions'])).toBeNull();
  });

  it('agy reserva --conversation; shell e tipos desconhecidos não reservam nada', () => {
    expect(reservedArgError('agy', ['--conversation', 'x'])).toMatch(/--conversation/);
    expect(reservedArgError('shell', ['--resume'])).toBeNull();
    expect(reservedArgError('fake', ['--resume'])).toBeNull();
  });
});

describe('emptySettings', () => {
  it('padrões começam vazios', () => {
    expect(emptySettings()).toEqual({ defaultArgs: { claude: [], agy: [], codex: [] }, canvas: { snapToGrid: true, motion: 'contained' } });
  });
});

describe('settingsSchema', () => {
  it('configura o grid magnético e o movimento contido por padrão em configurações antigas', async () => {
    const { settingsSchema } = await import('../src/args.js');
    expect(settingsSchema.parse({ defaultArgs: { claude: [], agy: [] } })).toEqual({
      defaultArgs: { claude: [], agy: [], codex: [] },
      canvas: { snapToGrid: true, motion: 'contained' },
    });
  });

  it('completa o movimento em um canvas salvo antes do campo existir', async () => {
    const { settingsSchema } = await import('../src/args.js');
    expect(settingsSchema.parse({ defaultArgs: { claude: [], agy: [] }, canvas: { snapToGrid: false } }).canvas).toEqual({ snapToGrid: false, motion: 'contained' });
  });

  it('recusa um movimento desconhecido', async () => {
    const { settingsSchema } = await import('../src/args.js');
    expect(() => settingsSchema.parse({ defaultArgs: { claude: [], agy: [] }, canvas: { snapToGrid: true, motion: 'turbo' } })).toThrow();
  });
});

describe('normalizeUserArgs', () => {
  it('remove o nome do programa quando colado no início', () => {
    expect(normalizeUserArgs('claude', ['claude', '--dangerously-skip-permissions'])).toEqual({
      args: ['--dangerously-skip-permissions'],
      impliedResume: false,
    });
    expect(normalizeUserArgs('agy', ['AGY.EXE', '--model', 'gemini-4-argon-high'])).toEqual({
      args: ['--model', 'gemini-4-argon-high'],
      impliedResume: false,
    });
    expect(normalizeUserArgs('codex', ['codex', '--flag'])).toEqual({
      args: ['--flag'],
      impliedResume: false,
    });
  });

  it('detecta --resume, -r, --continue, -c sem id no claude e ativa impliedResume', () => {
    expect(normalizeUserArgs('claude', ['claude', '--dangerously-skip-permissions', '--resume'])).toEqual({
      args: ['--dangerously-skip-permissions'],
      impliedResume: true,
    });
    expect(normalizeUserArgs('claude', ['--resume', '--model', 'opus'])).toEqual({
      args: ['--model', 'opus'],
      impliedResume: true,
    });
    expect(normalizeUserArgs('claude', ['claude', '-c'])).toEqual({
      args: [],
      impliedResume: true,
    });
    expect(normalizeUserArgs('claude', ['-r', '--dangerously-skip-permissions'])).toEqual({
      args: ['--dangerously-skip-permissions'],
      impliedResume: true,
    });
  });

  it('preserva --resume quando seguido de um id/uuid para validação de reservado', () => {
    expect(normalizeUserArgs('claude', ['--resume', 'session-uuid-1234'])).toEqual({
      args: ['--resume', 'session-uuid-1234'],
      impliedResume: false,
    });
  });
});

describe('extractModelArg', () => {
  it('extrai modelo com --model <valor> e --model=<valor>', () => {
    expect(extractModelArg(['--dangerously-skip-permissions', '--model', 'opus'])).toBe('opus');
    expect(extractModelArg(['--model=gemini-4-argon-high'])).toBe('gemini-4-argon-high');
    expect(extractModelArg(['--other', 'arg'])).toBe('');
    expect(extractModelArg([])).toBe('');
  });
});

describe('replaceModelArg', () => {
  it('substitui ou insere --model no início', () => {
    expect(replaceModelArg(['--dangerously-skip-permissions'], 'opus')).toEqual([
      '--model',
      'opus',
      '--dangerously-skip-permissions',
    ]);
    expect(replaceModelArg(['--model', 'sonnet', '--dangerously-skip-permissions'], 'gemini-4-argon-high')).toEqual([
      '--model',
      'gemini-4-argon-high',
      '--dangerously-skip-permissions',
    ]);
    expect(replaceModelArg(['--model=opus'], 'sonnet')).toEqual(['--model', 'sonnet']);
  });

  it('remove --model se valor for vazio', () => {
    expect(replaceModelArg(['--model', 'opus', '--dangerously-skip-permissions'], '')).toEqual([
      '--dangerously-skip-permissions',
    ]);
    expect(replaceModelArg(['--model=opus'], '   ')).toEqual([]);
  });
});
