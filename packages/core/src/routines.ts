import { exec } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { OrqError } from '@orquestra/shared';

export const routineSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  command: z.string().min(1),
  schedule: z.string().min(1),
  target: z.string().optional(),
  preRun: z.string().optional(),
  enabled: z.boolean().default(true),
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
});
export type Routine = z.infer<typeof routineSchema>;

const routinesFileSchema = z.array(routineSchema);

export class RoutineStore {
  constructor(private readonly opts: { file: string }) {}

  list(): Routine[] {
    if (!existsSync(this.opts.file)) return [];
    try {
      return routinesFileSchema.parse(JSON.parse(readFileSync(this.opts.file, 'utf8')));
    } catch {
      return [];
    }
  }

  get(name: string): Routine | undefined {
    return this.list().find((r) => r.name === name || r.id === name);
  }

  write(routine: Routine): { created: boolean } {
    const valid = routineSchema.parse(routine);
    const list = this.list();
    const index = list.findIndex((r) => r.name === valid.name || r.id === valid.id);
    const created = index < 0;
    if (created) list.push(valid);
    else list[index] = valid;

    mkdirSync(dirname(this.opts.file), { recursive: true });
    const tmp = `${this.opts.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.opts.file);
    return { created };
  }

  remove(name: string): boolean {
    const list = this.list();
    const filtered = list.filter((r) => r.name !== name && r.id !== name);
    if (filtered.length === list.length) return false;

    mkdirSync(dirname(this.opts.file), { recursive: true });
    const tmp = `${this.opts.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(filtered, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.opts.file);
    return true;
  }
}

export function computeNextRun(schedule: string, fromDate = new Date()): Date {
  const norm = schedule.trim().toLowerCase();
  const everyMatch = norm.match(/^every\s+(\d+)\s*(s|m|h)?$/);
  if (everyMatch) {
    const val = parseInt(everyMatch[1]!, 10);
    const unit = everyMatch[2] ?? 'm';
    const ms = unit === 's' ? val * 1000 : unit === 'h' ? val * 3600 * 1000 : val * 60 * 1000;
    return new Date(fromDate.getTime() + ms);
  }

  const dailyMatch = norm.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (dailyMatch) {
    const hour = parseInt(dailyMatch[1]!, 10);
    const min = parseInt(dailyMatch[2]!, 10);
    const next = new Date(fromDate);
    next.setHours(hour, min, 0, 0);
    if (next.getTime() <= fromDate.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // Fallback: 1 hora
  return new Date(fromDate.getTime() + 3600 * 1000);
}

export async function resolveRoutinePayload(routine: Routine): Promise<string> {
  let command = routine.command;
  if (routine.preRun && command.includes('{{output}}')) {
    const out = await new Promise<string>((resolveResult, reject) => {
      exec(routine.preRun!, { encoding: 'utf8', windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
        if (err) reject(new OrqError('USAGE', `Erro no pre-run da rotina: ${stderr || err.message}`));
        else resolveResult(stdout.trim());
      });
    });
    command = command.replaceAll('{{output}}', out);
  }
  return command;
}
