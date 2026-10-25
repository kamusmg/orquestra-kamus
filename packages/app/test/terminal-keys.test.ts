import { describe, expect, it } from 'vitest';
import { terminalKeyAction } from '../src/renderer/src/terminal/keys';

const key = (
  code: string,
  mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; key: string }> = {},
  type = 'keydown',
) => ({
  type,
  code,
  key: mods.key ?? (code === 'Enter' || code === 'NumpadEnter' ? 'Enter' : undefined),
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('terminalKeyAction', () => {
  it('Shift+Enter e Alt+Enter retornam newline (quebra de linha sem submeter no terminal)', () => {
    expect(terminalKeyAction(key('Enter', { shiftKey: true }), false)).toBe('newline');
    expect(
      terminalKeyAction(
        { type: 'keydown', key: 'Enter', code: 'Enter', shiftKey: true, ctrlKey: false, altKey: false },
        false,
      ),
    ).toBe('newline');
    expect(terminalKeyAction(key('Enter', { altKey: true }), false)).toBe('newline');
    expect(terminalKeyAction(key('NumpadEnter', { shiftKey: true }), false)).toBe('newline');
  });

  it('Enter normal ou Ctrl+Enter não acionam newline e passam nativo', () => {
    expect(terminalKeyAction(key('Enter'), false)).toBe('pass');
    expect(terminalKeyAction(key('Enter', { ctrlKey: true }), false)).toBe('pass');
    expect(terminalKeyAction(key('Enter', { ctrlKey: true, shiftKey: true }), false)).toBe('pass');
  });

  it('Ctrl+V e Ctrl+Shift+V colam texto (como no Windows Terminal), em vez de mandar ^V ao agente', () => {
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true }), false)).toBe('paste');
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true, shiftKey: true }), true)).toBe('paste');
  });

  it('Alt+V isolado aciona paste-image (salva imagem da área de transferência e cola o caminho no terminal)', () => {
    expect(terminalKeyAction(key('KeyV', { altKey: true }), false)).toBe('paste-image');
    expect(terminalKeyAction(key('KeyV', { altKey: true }), false, 'agy')).toBe('paste-image');
    expect(terminalKeyAction(key('KeyV', { altKey: true, shiftKey: false, ctrlKey: false }), true)).toBe('paste-image');
  });

  it('Alt+V passa nativo para o agente Claude Code quando agent === claude', () => {
    expect(terminalKeyAction(key('KeyV', { altKey: true }), false, 'claude')).toBe('pass');
  });

  it('Alt+V com outros modificadores (Ctrl ou Shift) segue para o agente sem disparar paste-image', () => {
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true, altKey: true }), false)).toBe('pass');
    expect(terminalKeyAction(key('KeyV', { shiftKey: true, altKey: true }), false)).toBe('pass');
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true, shiftKey: true, altKey: true }), false)).toBe('pass');
  });

  it('Ctrl+C copia só com seleção; sem seleção é a interrupção do agente', () => {
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true }), true)).toBe('copy');
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true }), false)).toBe('pass');
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true, shiftKey: true }), true)).toBe('copy');
  });

  it('só o keydown decide; as outras fases e as demais teclas passam', () => {
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true }, 'keyup'), false)).toBe('pass');
    expect(terminalKeyAction(key('KeyV', { altKey: true }, 'keyup'), false)).toBe('pass');
    expect(terminalKeyAction(key('Enter', { shiftKey: true }, 'keyup'), false)).toBe('pass');
    expect(terminalKeyAction(key('KeyR', { ctrlKey: true }), false)).toBe('pass');
    expect(terminalKeyAction(key('KeyI', { ctrlKey: true, shiftKey: true }), false)).toBe('pass');
  });

  it('Ctrl+Shift+I segue para o terminal em vez de ser interceptado', () => {
    expect(terminalKeyAction(key('KeyI', { ctrlKey: true, shiftKey: true }), false)).toBe('pass');
  });
});
