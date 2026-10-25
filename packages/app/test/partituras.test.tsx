// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PartiturasDrawer,
  NewPartituraDialog,
  ApplyPartituraDialog,
  MiniCanvasPreview,
  getLocalScores,
  saveLocalScore,
  removeLocalScore,
  type ScoreDefinition,
} from '../src/renderer/src/partituras';

afterEach(cleanup);

const mockScore1: ScoreDefinition = {
  id: 'score-1',
  name: 'Squad Tríade Dev',
  description: 'Setup com Claude líder e Agys executores',
  icon: '⚡',
  color: '#3b82f6',
  scope: 'global',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  nodes: {
    terminals: [
      {
        name: 'maestro',
        agent: 'claude',
        command: 'claude --dangerously-skip-permissions',
        args: ['--dangerously-skip-permissions'],
        regente: true,
        position: { x: 50, y: 100 },
      },
      {
        name: 'revisor',
        agent: 'agy',
        command: 'agy --model gemini-3.8-flash-high',
        args: ['--model', 'gemini-3.8-flash-high'],
        position: { x: 450, y: 100 },
      },
    ],
    notes: [
      {
        name: 'Quadro Geral',
        content: '# Roadmap do Squad',
        position: { x: 250, y: 350 },
      },
    ],
    portals: [],
  },
  edges: [
    { source: 'maestro', target: 'revisor' },
    { source: 'maestro', target: 'Quadro Geral' },
  ],
};

const mockScore2: ScoreDefinition = {
  id: 'score-2',
  name: 'Squad QA & Sec',
  description: 'Auditoria de segurança e testes automatizados',
  icon: '🛡️',
  color: '#10b981',
  scope: 'workspace',
  workspaceId: 'ws-123',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  nodes: {
    terminals: [
      {
        name: 'qa-tester',
        agent: 'shell',
        command: 'pnpm test',
        position: { x: 100, y: 100 },
      },
    ],
    notes: [],
    portals: [],
  },
  edges: [],
};

describe('Partituras Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('salva, lista e remove partituras no localStorage', () => {
    expect(getLocalScores()).toHaveLength(0);

    saveLocalScore(mockScore1);
    const scores = getLocalScores();
    expect(scores).toHaveLength(1);
    expect(scores[0]?.name).toBe('Squad Tríade Dev');

    removeLocalScore('score-1');
    expect(getLocalScores()).toHaveLength(0);
  });
});

describe('MiniCanvasPreview', () => {
  it('renderiza o SVG com terminais, notas e arestas', () => {
    const { container } = render(<MiniCanvasPreview score={mockScore1} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();

    // Terminais Maestro e Revisor
    expect(screen.getByText('maestro')).toBeDefined();
    expect(screen.getByText('revisor')).toBeDefined();

    // Nota Quadro Geral
    expect(screen.getByText('Quadro Geral')).toBeDefined();
  });
});

describe('PartiturasDrawer', () => {
  it('renderiza título, contador e cards de partituras', () => {
    const onSelect = vi.fn();
    const onNew = vi.fn();
    const onDelete = vi.fn();

    render(
      <PartiturasDrawer
        isOpen={true}
        onClose={vi.fn()}
        scores={[mockScore1, mockScore2]}
        currentWorkspaceId="ws-123"
        workspaceName="Projeto Orquestra"
        onSelectScore={onSelect}
        onNewScore={onNew}
        onDeleteScore={onDelete}
      />
    );

    expect(screen.getByTestId('drawer-scores-count').textContent).toBe('2');
    expect(screen.getByText('Squad Tríade Dev')).toBeDefined();
    expect(screen.getByText('Squad QA & Sec')).toBeDefined();

    // Clicar no card aciona seleção
    fireEvent.click(screen.getByTestId('score-card-score-1'));
    expect(onSelect).toHaveBeenCalledWith(mockScore1);

    // Clicar em + Salvar Canvas
    fireEvent.click(screen.getByTestId('drawer-new-score-btn'));
    expect(onNew).toHaveBeenCalled();
  });

  it('filtra partituras por busca textual e escopo', () => {
    render(
      <PartiturasDrawer
        isOpen={true}
        onClose={vi.fn()}
        scores={[mockScore1, mockScore2]}
        currentWorkspaceId="ws-123"
        onSelectScore={vi.fn()}
        onNewScore={vi.fn()}
        onDeleteScore={vi.fn()}
      />
    );

    // Filtro por busca
    const searchInput = screen.getByTestId('drawer-search-input');
    fireEvent.change(searchInput, { target: { value: 'QA' } });
    expect(screen.queryByText('Squad Tríade Dev')).toBeNull();
    expect(screen.getByText('Squad QA & Sec')).toBeDefined();

    // Limpar busca
    fireEvent.change(searchInput, { target: { value: '' } });

    // Filtro por escopo Global
    fireEvent.click(screen.getByTestId('filter-chip-global'));
    expect(screen.getByText('Squad Tríade Dev')).toBeDefined();
    expect(screen.queryByText('Squad QA & Sec')).toBeNull();
  });
});

describe('NewPartituraDialog', () => {
  it('valida campo obrigatório de nome antes de salvar', () => {
    const onSave = vi.fn();
    render(
      <NewPartituraDialog
        terminals={{
          t1: { name: 'alpha', agent: 'claude', position: { x: 0, y: 0 } },
        }}
        notes={{}}
        connections={[]}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByTestId('new-partitura-submit'));
    expect(screen.getByText('Por favor, informe o nome da Partitura.')).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();

    // Preenche nome e submete com sucesso
    fireEvent.change(screen.getByTestId('new-partitura-name-input'), {
      target: { value: 'Partitura Especial' },
    });
    fireEvent.click(screen.getByTestId('new-partitura-submit'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Partitura Especial',
        nodes: expect.objectContaining({
          terminals: expect.arrayContaining([expect.objectContaining({ name: 'alpha' })]),
        }),
      })
    );
  });
});

describe('ApplyPartituraDialog', () => {
  it('exibe alerta de comandos e suporta hot-swap de claude para agy', () => {
    const onApply = vi.fn();
    render(
      <ApplyPartituraDialog
        score={mockScore1}
        onClose={vi.fn()}
        onApply={onApply}
      />
    );

    // Alerta de comandos na aba Partitura
    expect(screen.getByTestId('apply-partitura-commands-warning')).toBeDefined();
    expect(screen.getByText('claude --dangerously-skip-permissions')).toBeDefined();

    // Alternar para aba Detalhes
    fireEvent.click(screen.getByTestId('apply-tab-detalhes'));
    expect(screen.getByTestId('apply-partitura-details-list')).toBeDefined();

    // Hot-swap do motor do maestro para agy
    const agentSelect = screen.getByTestId('term-agent-select-0');
    fireEvent.change(agentSelect, { target: { value: 'agy' } });

    // Modificar flags
    const argsInput = screen.getByTestId('term-args-input-0');
    fireEvent.change(argsInput, { target: { value: '--model gemini-4-argon-high' } });

    // Submeter customização
    fireEvent.click(screen.getByTestId('apply-partitura-submit'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: expect.objectContaining({
          terminals: expect.arrayContaining([
            expect.objectContaining({
              name: 'maestro',
              agent: 'agy',
              args: ['--model', 'gemini-4-argon-high'],
            }),
          ]),
        }),
      })
    );
  });
});
