import { z } from 'zod';
import { OrqError } from './errors.js';

/** Programa de cada tipo de agente: fixo no campo de comando; você edita só os argumentos extras. */
export const AGENT_PROGRAM = { claude: 'claude', agy: 'agy', codex: 'codex', shell: 'powershell' } as const;

/** Argumentos que o Orquestra controla, com o motivo mostrado ao usuário. */
const RESERVED: Record<string, Array<{ flags: string[]; reason: string }>> = {
  claude: [
    { flags: ['--settings'], reason: 'hooks' },
    { flags: ['--session-id', '--resume', '-r', '--continue', '-c'], reason: 'retomada de sessão' },
  ],
  codex: [{ flags: ['resume', '--last', '--all'], reason: 'retomada de sessão' }],
  agy: [{ flags: ['--conversation'], reason: 'retomada de sessão' }],
};

export function reservedArgError(agent: string, args: string[]): string | null {
  for (const arg of args) {
    const flag = arg.split('=')[0]!;
    const rule = RESERVED[agent]?.find((entry) => entry.flags.includes(flag));
    if (rule) return `O argumento ${flag} é controlado pelo Orquestra (${rule.reason}). Remova-o; use a opção "Retomar a sessão".`;
  }
  return null;
}

export function parseArgs(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let hasToken = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (inQuotes && char === '\\' && text[index + 1] === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
      hasToken = true;
    } else if (!inQuotes && /\s/.test(char)) {
      if (hasToken) args.push(current);
      current = '';
      hasToken = false;
    } else {
      current += char;
      hasToken = true;
    }
  }
  if (inQuotes) throw new OrqError('USAGE', 'Aspas sem fechamento nos argumentos. Feche as aspas ou remova-as.');
  if (hasToken) args.push(current);
  return args;
}

export function formatArgs(args: string[]): string {
  return args.map((arg) => (arg === '' || /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg)).join(' ');
}

export function normalizeUserArgs(agent: string, rawArgs: string[]): { args: string[]; impliedResume: boolean } {
  let args = [...rawArgs];
  let hadProgram = false;
  if (args.length > 0) {
    const first = args[0]!.toLowerCase().replace(/\.exe$/i, '');
    const knownPrograms = ['claude', 'agy', 'codex', agent.toLowerCase()];
    if (knownPrograms.includes(first)) {
      args.shift();
      hadProgram = true;
    }
  }

  let impliedResume = false;
  if (agent === 'claude') {
    const shouldNormalizeResume = hadProgram || rawArgs.length > 1;
    if (shouldNormalizeResume) {
      const resumeFlags = ['--resume', '-r', '--continue', '-c'];
      const filtered: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const item = args[i]!;
        if (resumeFlags.includes(item)) {
          const next = args[i + 1];
          if (next === undefined || next.startsWith('-')) {
            impliedResume = true;
            continue;
          }
        }
        filtered.push(item);
      }
      args = filtered;
    }
  }

  return { args, impliedResume };
}

export function extractModelArg(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--model=')) {
      return arg.slice('--model='.length).trim();
    }
    if (arg === '--model' && i + 1 < args.length) {
      return args[i + 1]!.trim();
    }
  }
  return '';
}

export function replaceModelArg(args: string[], model: string): string[] {
  const cleaned: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--model=')) {
      continue;
    }
    if (arg === '--model') {
      if (i + 1 < args.length && !args[i + 1]!.startsWith('--')) {
        i++;
      }
      continue;
    }
    cleaned.push(arg);
  }
  const trimmed = model.trim();
  if (trimmed) {
    return ['--model', trimmed, ...cleaned];
  }
  return cleaned;
}

export const canvasMotionSchema = z.enum(['contained', 'minimal']);
export type CanvasMotion = z.infer<typeof canvasMotionSchema>;

export const settingsSchema = z.object({
  defaultArgs: z.object({ claude: z.array(z.string()), agy: z.array(z.string()), codex: z.array(z.string()).default([]) }),
  canvas: z.object({ snapToGrid: z.boolean().default(true), motion: canvasMotionSchema.default('contained') }).default({ snapToGrid: true, motion: 'contained' }),
});
export type Settings = z.infer<typeof settingsSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;

export function emptySettings(): Settings {
  return { defaultArgs: { claude: [], agy: [], codex: [] }, canvas: { snapToGrid: true, motion: 'contained' } };
}
