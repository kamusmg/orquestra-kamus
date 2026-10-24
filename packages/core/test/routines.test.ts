import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeNextRun, resolveRoutinePayload, RoutineStore } from '../src/routines.js';

describe('Routines Engine', () => {
  it('RoutineStore cria, lista, consulta e remove rotinas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orq-routine-test-'));
    const file = join(dir, 'routines.json');
    const store = new RoutineStore({ file });

    expect(store.list()).toEqual([]);
    const res = store.write({
      id: 'r1',
      name: 'daily-audit',
      command: 'run audit',
      schedule: 'daily 09:00',
      enabled: true,
    });
    expect(res.created).toBe(true);

    const item = store.get('daily-audit');
    expect(item?.command).toBe('run audit');
    expect(store.list()).toHaveLength(1);

    expect(store.remove('daily-audit')).toBe(true);
    expect(store.list()).toHaveLength(0);

    rmSync(dir, { recursive: true, force: true });
  });

  it('computeNextRun calcula corretamente prazos a cada X minutos e diários', () => {
    const base = new Date('2026-10-24T10:00:00Z');
    const next15m = computeNextRun('every 15m', base);
    expect(next15m.getTime()).toBe(base.getTime() + 15 * 60 * 1000);

    const next2h = computeNextRun('every 2h', base);
    expect(next2h.getTime()).toBe(base.getTime() + 2 * 3600 * 1000);
  });

  it('resolveRoutinePayload substitui placeholder {{output}} com preRun', async () => {
    const routine = {
      id: 'r2',
      name: 'echo-test',
      command: 'Resultado: {{output}}',
      schedule: 'every 1h',
      preRun: 'node -e "console.log(\'OK_ROUTINE\')"',
      enabled: true,
    };
    const payload = await resolveRoutinePayload(routine);
    expect(payload).toBe('Resultado: OK_ROUTINE');
  });
});
