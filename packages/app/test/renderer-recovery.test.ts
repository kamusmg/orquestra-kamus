import { describe, expect, it } from 'vitest';
import { decideRendererRecovery, type CrashRecoveryState } from '../src/main/recovery';

describe('decideRendererRecovery', () => {
  it('não recarrega se o encerramento foi limpo (clean-exit)', () => {
    const decision = decideRendererRecovery('clean-exit');
    expect(decision.shouldReload).toBe(false);
    expect(decision.reason).toBe('clean-exit');
    expect(decision.nextState.timestamps).toHaveLength(0);
  });

  it('permite até 3 recargas por minuto para quedas anormais', () => {
    let state: CrashRecoveryState = { timestamps: [] };
    const baseTime = 100_000;

    // 1ª queda (oom)
    const d1 = decideRendererRecovery('oom', state, { now: baseTime });
    expect(d1.shouldReload).toBe(true);
    expect(d1.reason).toBe('reload-scheduled');
    state = d1.nextState;

    // 2ª queda (crashed) 10s depois
    const d2 = decideRendererRecovery('crashed', state, { now: baseTime + 10_000 });
    expect(d2.shouldReload).toBe(true);
    state = d2.nextState;

    // 3ª queda (killed) 20s depois
    const d3 = decideRendererRecovery('killed', state, { now: baseTime + 20_000 });
    expect(d3.shouldReload).toBe(true);
    state = d3.nextState;

    expect(state.timestamps).toHaveLength(3);

    // 4ª queda ainda dentro de 60s -> bloqueia e excede limite
    const d4 = decideRendererRecovery('oom', state, { now: baseTime + 30_000 });
    expect(d4.shouldReload).toBe(false);
    expect(d4.reason).toBe('rate-limit-exceeded');
  });

  it('reabre a janela de recarga quando os eventos antigos expiram (> 60s)', () => {
    const baseTime = 100_000;
    const fullState: CrashRecoveryState = {
      timestamps: [baseTime, baseTime + 10_000, baseTime + 20_000],
    };

    // Nova queda 65s após a primeira (a primeira expira, restam 2 na janela + 1 nova = 3)
    const decision = decideRendererRecovery('oom', fullState, { now: baseTime + 65_000 });
    expect(decision.shouldReload).toBe(true);
    expect(decision.nextState.timestamps).toHaveLength(3);
    expect(decision.nextState.timestamps).toEqual([baseTime + 10_000, baseTime + 20_000, baseTime + 65_000]);
  });
});
