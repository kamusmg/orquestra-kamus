// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import type { WebglAddon } from '@xterm/addon-webgl';

vi.hoisted(() => {
  Object.assign(window, {
    orquestra: {
      invoke: vi.fn(async () => ({ ok: true, result: {} })),
      reportError: vi.fn(),
      readClipboard: vi.fn(async () => ''),
      writeClipboard: vi.fn(async () => {}),
      readClipboardImage: vi.fn(async () => null),
      saveDroppedFile: vi.fn(async () => ''),
      getPathForFile: vi.fn(() => ''),
    },
  });
});

import { attachWebglAddon } from '../src/renderer/src/terminal/TerminalNode';

describe('attachWebglAddon', () => {
  it('registra onContextLoss e executa dispose no addon ao perder o contexto WebGL', () => {
    let contextLossCallback: (() => void) | undefined;
    const mockWebgl = {
      onContextLoss: vi.fn((listener: () => void) => {
        contextLossCallback = listener;
      }),
      dispose: vi.fn(),
    } as unknown as WebglAddon;

    const mockTerm = {
      loadAddon: vi.fn(),
    } as unknown as Terminal;

    const result = attachWebglAddon(mockTerm, () => mockWebgl);

    expect(result).toBe(mockWebgl);
    expect(mockTerm.loadAddon).toHaveBeenCalledWith(mockWebgl);
    expect(mockWebgl.onContextLoss).toHaveBeenCalledTimes(1);
    expect(mockWebgl.dispose).not.toHaveBeenCalled();

    // Simula evento de perda de contexto WebGL do navegador
    contextLossCallback?.();

    expect(mockWebgl.dispose).toHaveBeenCalledTimes(1);
  });

  it('faz fallback gracioso (retorna null) caso carregar o WebGL lance erro', () => {
    const mockTerm = {
      loadAddon: vi.fn(() => {
        throw new Error('WebGL not supported');
      }),
    } as unknown as Terminal;

    const mockWebgl = {
      onContextLoss: vi.fn(),
      dispose: vi.fn(),
    } as unknown as WebglAddon;

    const result = attachWebglAddon(mockTerm, () => mockWebgl);
    expect(result).toBeNull();
  });
});
