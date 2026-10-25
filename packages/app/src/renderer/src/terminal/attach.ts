import type { CommandApi } from '../api';
import type { OutputBus } from '../output-bus';
import { outputKey } from '../workspace-context';

export type TermLike = {
  reset(): void;
  write(data: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
  readonly cols: number;
  readonly rows: number;
};

/**
 * Ordem fixa (spec, seção 3): ajustar, redimensionar o PTY, pedir o retrato e escrevê-lo num terminal limpo.
 * O retrato reposiciona o cursor de forma relativa e só vale num xterm limpo do mesmo tamanho.
 * A saída que chega antes do retrato já está nele e é descartada.
 */
export async function attachTerminal(deps: {
  name: string;
  term: TermLike;
  fit: () => void;
  api: CommandApi;
  bus: OutputBus;
  outputName?: string;
}): Promise<() => void> {
  deps.fit();
  await deps.api.command('terminal.resize', { name: deps.name, cols: deps.term.cols, rows: deps.term.rows });
  let live = false;
  const unsubscribe = deps.bus.subscribe(deps.outputName ?? deps.name, (data) => {
    if (live) deps.term.write(data);
  });
  const snapshot = await deps.api.command('terminal.snapshot', { name: deps.name }).catch((error: unknown) => {
    unsubscribe();
    throw error;
  });
  deps.term.reset();
  deps.term.write(snapshot.data);
  live = true;
  const input = deps.term.onData((data) => void deps.api.command('terminal.input', { name: deps.name, data }).catch(() => {}));
  return () => {
    unsubscribe();
    input.dispose();
  };
}

/**
 * Executa attachTerminal protegendo contra falso erro se o nó for desmontado antes do término
 * ou se estiver em processo de remoção/recriação rápida (orq remove / orq new).
 */
export function runAttachTerminal(deps: {
  name: string;
  term: TermLike;
  fit: () => void;
  api: CommandApi;
  bus: OutputBus;
  onError: (message: string) => void;
  outputName?: string;
  isStillActive?: () => boolean;
  retryDelayMs?: number;
}): () => void {
  let detach: (() => void) | undefined;
  let disposed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const isStillActive = deps.isStillActive ?? (() => true);

  const attempt = (retryCount: number) => {
    void attachTerminal({
      name: deps.name,
      term: deps.term,
      fit: deps.fit,
      api: deps.api,
      bus: deps.bus,
      outputName: deps.outputName ?? outputKey(deps.name),
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          detach = cleanup;
        }
      })
      .catch((error: Error) => {
        if (disposed) return;

        // Se o terminal não existe mais no store, a remoção ocorreu: suprime o toast falso
        if (!isStillActive()) return;

        // Se for a primeira falha, pode ser recriação rápida (orq remove; orq new)
        // Aguarda retryDelayMs (padrão 250ms) antes de reportar erro
        if (retryCount === 0) {
          retryTimer = setTimeout(() => {
            if (disposed || !isStillActive()) return;
            attempt(1);
          }, deps.retryDelayMs ?? 250);
          return;
        }

        // Falha persistente após retry em terminal ainda ativo
        if (!disposed && isStillActive()) {
          deps.onError(`Não foi possível mostrar ${deps.name}: ${error.message}`);
        }
      });
  };

  attempt(0);

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    detach?.();
  };
}
