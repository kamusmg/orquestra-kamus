export type TerminalKeyAction = 'copy' | 'paste' | 'paste-image' | 'pass';

/**
 * Teclas de área de transferência no terminal, no padrão do Windows Terminal:
 * Ctrl+V e Ctrl+Shift+V colam texto; Ctrl+C copia se houver seleção (sem seleção, interrompe o agente);
 * Ctrl+Shift+C copia. Alt+V cola imagem da área de transferência (salva em disco e cola o caminho).
 */
export function terminalKeyAction(
  event: { type: string; code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  hasSelection: boolean,
): TerminalKeyAction {
  if (event.type !== 'keydown') return 'pass';
  if (event.altKey && !event.ctrlKey && !event.shiftKey && event.code === 'KeyV') return 'paste-image';
  if (!event.ctrlKey || event.altKey) return 'pass';
  if (event.code === 'KeyV') return 'paste';
  if (event.code === 'KeyC' && (hasSelection || event.shiftKey)) return 'copy';
  return 'pass';
}
