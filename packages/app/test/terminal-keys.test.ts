import { describe, expect, it } from 'vitest';
import { terminalKeyAction } from '../src/renderer/src/terminal/keys';

const key = (code: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}, type = 'keydown') => ({
  type,
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('terminalKeyAction', () => {
  it('Ctrl+V e Ctrl+Shift+V colam texto (como no Windows Terminal), em vez de mandar ^V ao agente', () => {
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true }), false)).toBe('paste');
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true, shiftKey: true }), true)).toBe('paste');
  });

  it('Alt+V isolado aciona paste-image (salva imagem da área de transferência e cola o caminho no terminal)', () => {
    expect(terminalKeyAction(key('KeyV', { altKey: true }), false)).toBe('paste-image');
    expect(terminalKeyAction(key('KeyV', { altKey: true, shiftKey: false, ctrlKey: false }), true)).toBe('paste-image');
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
    expect(terminalKeyAction(key('KeyR', { ctrlKey: true }), false)).toBe('pass');
    expect(terminalKeyAction(key('KeyI', { ctrlKey: true, shiftKey: true }), false)).toBe('pass');
  });

  it('Ctrl+Shift+I segue para o terminal em vez de ser interceptado', () => {
    expect(terminalKeyAction(key('KeyI', { ctrlKey: true, shiftKey: true }), false)).toBe('pass');
  });
});
