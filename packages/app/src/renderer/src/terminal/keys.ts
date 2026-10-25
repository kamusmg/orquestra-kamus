export type TerminalKeyAction = 'copy' | 'paste' | 'paste-image' | 'newline' | 'pass';

/**
 * Teclas de área de transferência e edição no terminal, no padrão do Windows Terminal:
 * Ctrl+V e Ctrl+Shift+V colam texto; Ctrl+C copia se houver seleção (sem seleção, interrompe o agente);
 * Ctrl+Shift+C copia. Alt+V cola imagem da área de transferência (ou passa nativo se for Claude Code).
 * Shift+Enter e Alt+Enter inserem quebra de linha sem submeter a mensagem (enviando '\x1b\r').
 */
export function terminalKeyAction(
  event: { type: string; code?: string; key?: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  hasSelection: boolean,
  agent?: string,
): TerminalKeyAction {
  if (event.type !== 'keydown') return 'pass';

  const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
  if (
    (event.shiftKey && !event.ctrlKey && !event.altKey && isEnter) ||
    (event.altKey && !event.ctrlKey && !event.shiftKey && isEnter)
  ) {
    return 'newline';
  }

  if (event.altKey && !event.ctrlKey && !event.shiftKey && event.code === 'KeyV') {
    if (agent === 'claude') return 'pass';
    return 'paste-image';
  }
  if (!event.ctrlKey || event.altKey) return 'pass';
  if (event.code === 'KeyV') return 'paste';
  if (event.code === 'KeyC' && (hasSelection || event.shiftKey)) return 'copy';
  return 'pass';
}
