import { existsSync } from 'node:fs';
import { personaBrief, regentGuide, type Persona } from '@orquestra/shared';

export const CEREBRO_TOKEN_ECONOMY_HEADER = '🧠 [Economia de Tokens via Cérebro]';

/**
 * Retorna as diretrizes de economia de tokens do Cérebro caso ORQ_CEREBRO_PATH
 * esteja configurado e o diretório exista no disco. Se ausente, retorna null.
 */
export function getCerebroInstruction(customPath?: string): string | null {
  const cerebroPath = customPath ?? process.env.ORQ_CEREBRO_PATH;
  if (!cerebroPath || !existsSync(cerebroPath)) {
    return null;
  }

  return [
    CEREBRO_TOKEN_ECONOMY_HEADER,
    `Diretriz de Economia Brutal de Tokens (Cérebro ativo em: ${cerebroPath}):`,
    '1. Consulte PRIMEIRO o índice, sinais vitais (`node check-brain.mjs`) e memórias destiladas (`memory/*.md`) antes de realizar varreduras amplas com Grep/Read/Glob em múltiplos arquivos.',
    '2. Redução comprovada de 6x a 34x de consumo de tokens reutilizando decisões arquiteturais e mapeamentos prévios.',
    '3. REGRA CRÍTICA DE PRIVACIDADE: O Cérebro é 100% privado. NUNCA exponha caminhos locais, arquivos ou dados do Cérebro em commits ou repositórios públicos.',
  ].join('\n');
}

/**
 * Concatena as diretrizes do Cérebro a um guia ou texto existente.
 * Se o Cérebro não estiver configurado, retorna o texto base inalterado.
 */
export function injectCerebroDirectives(baseGuide?: string, customPath?: string): string {
  const cerebro = getCerebroInstruction(customPath);
  if (!cerebro) {
    return baseGuide ?? '';
  }
  return baseGuide ? `${baseGuide}\n\n${cerebro}` : cerebro;
}

/**
 * Constrói o guia de sessão entregue ao terminal (persona, regente e/ou Cérebro).
 * Se nenhum guia ou instrução estiver ativo, retorna undefined.
 */
export function resolveSessionGuide(opts: {
  persona?: Persona;
  regente?: boolean;
  cerebroPath?: string;
}): string | undefined {
  let base: string | undefined;
  if (opts.persona) {
    base = personaBrief(opts.persona, { regent: Boolean(opts.regente) });
  } else if (opts.regente) {
    base = regentGuide();
  }

  const cerebro = getCerebroInstruction(opts.cerebroPath);
  if (!cerebro) {
    return base;
  }

  return base ? `${base}\n\n${cerebro}` : cerebro;
}
