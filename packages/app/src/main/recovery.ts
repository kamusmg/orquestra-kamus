export interface CrashRecoveryState {
  timestamps: number[];
}

export interface CrashRecoveryDecision {
  shouldReload: boolean;
  reason: 'clean-exit' | 'reload-scheduled' | 'rate-limit-exceeded';
  nextState: CrashRecoveryState;
}

/**
 * Avalia se o processo do renderer que encerrou inesperadamente deve ser recarregado.
 * Permite até `maxReloads` (padrão 3) dentro da janela `windowMs` (padrão 60.000 ms = 1 min).
 * Se reason for 'clean-exit', não recarrega.
 */
export function decideRendererRecovery(
  reason: string,
  state: CrashRecoveryState = { timestamps: [] },
  options: { maxReloads?: number; windowMs?: number; now?: number } = {},
): CrashRecoveryDecision {
  if (reason === 'clean-exit') {
    return { shouldReload: false, reason: 'clean-exit', nextState: state };
  }

  const maxReloads = options.maxReloads ?? 3;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now();

  const recent = state.timestamps.filter((ts) => now - ts < windowMs);

  if (recent.length >= maxReloads) {
    return {
      shouldReload: false,
      reason: 'rate-limit-exceeded',
      nextState: { timestamps: recent },
    };
  }

  return {
    shouldReload: true,
    reason: 'reload-scheduled',
    nextState: { timestamps: [...recent, now] },
  };
}
