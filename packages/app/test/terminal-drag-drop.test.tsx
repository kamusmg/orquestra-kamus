// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appStore } from '../src/renderer/src/store';

const mockPaste = vi.fn();
let customKeyHandler: ((event: any) => boolean) | null = null;

vi.hoisted(() => {
  Object.assign(window, {
    orquestra: {
      invoke: vi.fn(async () => ({ ok: true, result: {} })),
      reportError: vi.fn(),
      readClipboard: vi.fn(async () => 'texto normal'),
      writeClipboard: vi.fn(async () => {}),
      readClipboardImage: vi.fn(async () => 'C:/data/clipboard/clip-123.png'),
      saveDroppedFile: vi.fn(async (name: string) => `C:/data/clipboard/123-${name}`),
      getPathForFile: vi.fn((file: File) => (file as any).path ?? `C:/files/${file.name}`),
    },
  });
});

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    element = document.createElement('div');
    options = {};
    rows = 24;
    cols = 80;
    textarea = document.createElement('textarea');
    parser = {
      registerCsiHandler: vi.fn(),
      registerDcsHandler: vi.fn(),
    };
    loadAddon() {}
    open() {}
    getSelection() { return ''; }
    hasSelection() { return false; }
    clearSelection() {}
    paste = mockPaste;
    attachCustomKeyEventHandler(handler: (event: any) => boolean) {
      customKeyHandler = handler;
    }
    focus() {}
    dispose() {}
  },
}));

vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class {} }));

import { TerminalNode } from '../src/renderer/src/terminal/TerminalNode';

describe('TerminalNode — Alt+V e Drag & Drop de arquivos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customKeyHandler = null;
    appStore.setState({ terminals: {}, focusedTerminal: null });
    appStore.getState().addTerminal({
      name: 'qa-term',
      agent: 'agy',
      state: 'idle',
      queued: 0,
      cwd: 'C:/project',
      resume: false,
      args: [],
      regente: false,
      monitor: false,
      unloaded: false,
    });
  });

  afterEach(cleanup);

  it('exibe classe is-drag-over ao arrastar arquivos sobre o terminal e remove ao sair', () => {
    const props = { id: 'qa-term', data: { name: 'qa-term' }, selected: false } as any;
    const { container } = render(
      <ReactFlowProvider>
        <TerminalNode {...props} />
      </ReactFlowProvider>
    );

    const termNode = container.querySelector('.term-node')!;
    expect(termNode).toBeDefined();
    expect(termNode.classList.contains('is-drag-over')).toBe(false);

    // Dispara dragenter com Files
    fireEvent.dragEnter(termNode, {
      dataTransfer: { types: ['Files'] },
    });
    expect(termNode.classList.contains('is-drag-over')).toBe(true);

    // Dispara dragleave
    fireEvent.dragLeave(termNode);
    expect(termNode.classList.contains('is-drag-over')).toBe(false);
  });

  it('ao soltar (drop) arquivo de imagem, resolve o caminho e cola no terminal', async () => {
    const props = { id: 'qa-term', data: { name: 'qa-term' }, selected: false } as any;
    const { container } = render(
      <ReactFlowProvider>
        <TerminalNode {...props} />
      </ReactFlowProvider>
    );

    const termNode = container.querySelector('.term-node')!;
    const file = new File(['dummy-bytes'], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(file, 'path', { value: 'C:/Users/User/Pictures/screenshot.png' });

    fireEvent.drop(termNode, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(mockPaste).toHaveBeenCalledWith('C:/Users/User/Pictures/screenshot.png ');
    });
  });

  it('Alt+V chama readClipboardImage e cola o caminho formatado com espaço', async () => {
    const props = { id: 'qa-term', data: { name: 'qa-term' }, selected: false } as any;
    render(
      <ReactFlowProvider>
        <TerminalNode {...props} />
      </ReactFlowProvider>
    );

    expect(customKeyHandler).toBeDefined();

    // Simula evento Alt+V no customKeyHandler do xterm
    const preventDefault = vi.fn();
    const event = {
      type: 'keydown',
      code: 'KeyV',
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
      preventDefault,
    };

    const handled = customKeyHandler!(event);
    expect(handled).toBe(false);
    expect(preventDefault).toHaveBeenCalled();

    await waitFor(() => {
      expect(window.orquestra.readClipboardImage).toHaveBeenCalled();
      expect(mockPaste).toHaveBeenCalledWith('C:/data/clipboard/clip-123.png ');
    });
  });
});
