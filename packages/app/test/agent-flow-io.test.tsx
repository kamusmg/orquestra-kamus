// @vitest-environment jsdom
import { randomUUID } from 'node:crypto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFlowNode } from '@orquestra/shared/flow';

// Antes dos imports: TerminalNode cria a ponte de comandos com window.orquestra ao carregar.
vi.hoisted(() => Object.assign(window, { orquestra: { invoke: async () => ({ ok: true, result: {} }), reportError: () => {} } }));
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class {} }));

import { useContext } from 'react';
import { FlowWorkbench } from '../src/renderer/src/flow/FlowWorkbench';
import { AGENT_FLOW_IO } from '../src/renderer/src/flow/feature-flags';
import { dataEdges, flowEndpoint } from '../src/renderer/src/flow/flow-edges';
import { FlowUIContext } from '../src/renderer/src/flow/ui-context';
import { appStore } from '../src/renderer/src/store';
import { TerminalNode } from '../src/renderer/src/terminal/TerminalNode';

afterEach(cleanup);

function OpenLibrary() {
  const ui = useContext(FlowUIContext);
  return <button data-testid="open-lib" onClick={ui?.library}>Abrir biblioteca</button>;
}

/** Grafo com uma etapa de agente ligada ao terminal 'dev' e uma etapa de código conectada a ela. */
function agentGraph() {
  const agent = defaultFlowNode('agent', randomUUID()), code = defaultFlowNode('code', randomUUID()), input = defaultFlowNode('input', randomUUID());
  agent.config.terminalId = agent.id;
  appStore.getState().addTerminal({ id: agent.id, name: 'dev', agent: 'codex', state: 'idle', queued: 0, cwd: 'C:/p', resume: false, args: [], regente: false, monitor: false });
  const graph = { nodes: [agent, code, input], connections: [
    { id: randomUUID(), from: code.id, output: 'saida', to: agent.id, input: 'entrada' },
    { id: randomUUID(), from: agent.id, output: 'saida', to: code.id, input: 'entrada' },
    { id: randomUUID(), from: input.id, output: 'valor', to: code.id, input: 'entrada' },
  ], autoRun: false };
  return { agent, code, input, graph };
}

describe('E/S de dados dos agentes desligada (AGENT_FLOW_IO)', () => {
  it('a flag está desligada', () => expect(AGENT_FLOW_IO).toBe(false));

  it('dataEdges omite conexões com etapas de agente e mantém as demais', () => {
    const { code, input, graph } = agentGraph();
    const edges = dataEdges(graph, appStore.getState().terminals);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: `flow:${input.id}`, target: `flow:${code.id}` });
  });

  it('flowEndpoint devolve null para terminais e resolve os demais nós', () => {
    const { code, graph } = agentGraph();
    expect(flowEndpoint(graph, appStore.getState().terminals, 'dev')).toBeNull();
    expect(flowEndpoint(graph, appStore.getState().terminals, `flow:${code.id}`)).toBe(code.id);
  });

  it('TerminalNode não mostra "Configurar E/S" mesmo com etapa de agente gravada', () => {
    const { graph } = agentGraph();
    appStore.setState({ flow: { graph, run: null, tests: null } });
    appStore.setState((state) => ({ terminals: { ...state.terminals, dev: { ...state.terminals.dev!, unloaded: true } } }));
    const ui = { library: vi.fn(), edit: vi.fn(), inspect: vi.fn(), history: vi.fn(), tests: vi.fn() };
    const props = { id: 'dev', data: { name: 'dev' }, selected: false } as unknown as Parameters<typeof TerminalNode>[0];
    render(<ReactFlowProvider><FlowUIContext.Provider value={ui}><TerminalNode {...props} /></FlowUIContext.Provider></ReactFlowProvider>);
    expect(screen.getByTestId('terminal-header-dev')).toBeDefined();
    expect(screen.queryByText('Configurar E/S')).toBeNull();
  });

  it('FlowWorkbench oculta o texto sobre terminais de agentes na biblioteca de nós', () => {
    const api = { command: vi.fn() } as any;
    render(
      <FlowWorkbench api={api}>
        <OpenLibrary />
      </FlowWorkbench>
    );
    fireEvent.click(screen.getByTestId('open-lib'));
    expect(screen.queryByText(/Terminais de agentes têm suas próprias portas E\/S/i)).toBeNull();
    expect(screen.getByText(/Conecte uma saída à entrada da etapa seguinte/i)).toBeDefined();
  });

  it('TerminalNode exibe chip com o modelo ativo quando view.args contiver --model', () => {
    appStore.getState().addTerminal({
      name: 'model-term',
      agent: 'agy',
      state: 'idle',
      queued: 0,
      cwd: 'C:/p',
      resume: false,
      args: ['--model', 'gemini-4-argon-high'],
      regente: false,
      monitor: false,
      unloaded: true,
    });
    const props = { id: 'model-term', data: { name: 'model-term' }, selected: false } as unknown as Parameters<typeof TerminalNode>[0];
    render(
      <ReactFlowProvider>
        <TerminalNode {...props} />
      </ReactFlowProvider>
    );
    const chip = screen.getByTestId('terminal-model-model-term');
    expect(chip.textContent).toBe('gemini-4-argon-high');
    expect(chip.getAttribute('title')).toBe('Modelo ativo');
  });

  it('TerminalNode exibe crachá de persona colorida', () => {
    appStore.getState().addTerminal({
      name: 'persona-term',
      agent: 'agy',
      state: 'idle',
      queued: 0,
      cwd: 'C:/p',
      resume: false,
      args: [],
      persona: 'Arquiteto de Oferta',
      regente: false,
      monitor: false,
      unloaded: true,
    });
    const props = { id: 'persona-term', data: { name: 'persona-term' }, selected: false } as unknown as Parameters<typeof TerminalNode>[0];
    render(
      <ReactFlowProvider>
        <TerminalNode {...props} />
      </ReactFlowProvider>
    );
    const badge = screen.getByTestId('terminal-persona-persona-term');
    expect(badge.textContent).toBe('Arquiteto de Oferta');
    expect(badge.className).toContain('persona-amber');
    expect(badge.getAttribute('title')).toContain('Função embutida: Arquiteto de Oferta');
  });
});
