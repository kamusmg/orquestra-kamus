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
  classifyScoreNote,
  isOperationalNote,
  getCleanProgressBoardTemplate,
  getCleanLiveContextTemplate,
  prepareScoreNotesForApplication,
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

const mockScoreWithNotes: ScoreDefinition = {
  id: 'score-templates',
  name: 'Squad Engenharia & Qualidade',
  description: 'Com Quadro de Progresso, Contexto Vivo e Regra Zero',
  icon: '📚',
  color: '#8b5cf6',
  scope: 'global',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  nodes: {
    terminals: [
      {
        name: 'tech-lead',
        agent: 'agy',
        command: 'agy --model gemini-4-argon-high',
        args: ['--model', 'gemini-4-argon-high'],
        regente: true,
        position: { x: 50, y: 50 },
      },
    ],
    notes: [
      {
        name: 'Quadro de Progresso',
        content: '# Old project history\n- Commit b7afda9 antigo\n- Bug #123 resolvido',
        position: { x: 100, y: 300 },
      },
      {
        name: 'Contexto Vivo',
        content: '# Old project architecture\nLegacy stack from previous repo',
        position: { x: 400, y: 300 },
      },
      {
        name: 'Regra Zero - Segurança e Git',
        content: '## 🛡️ REGRA ZERO: Segurança Absoluta com Git e Chaves de API\n- NUNCA usar git add .',
        position: { x: 700, y: 300 },
      },
      {
        name: 'Protocolo NanoBanana',
        content: '## 🍌 Protocolo NanoBanana\n- Execução Flash de alto desempenho',
        position: { x: 1000, y: 300 },
      },
    ],
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

  it('aplica templates limpos em notas operacionais por padrão e preserva diretrizes fixas', () => {
    const onApply = vi.fn();
    render(
      <ApplyPartituraDialog
        score={mockScoreWithNotes}
        onClose={vi.fn()}
        onApply={onApply}
      />
    );

    // Abre aba Detalhes
    fireEvent.click(screen.getByTestId('apply-tab-detalhes'));

    // Verifica badges de classificação
    const fixedBadges = screen.getAllByText('Diretriz Fixa');
    expect(fixedBadges).toHaveLength(2); // Regra Zero e Protocolo NanoBanana

    const templateBadges = screen.getAllByText('Template Limpo');
    expect(templateBadges).toHaveLength(2); // Quadro de Progresso e Contexto Vivo

    // Submete com limpeza ativa
    fireEvent.click(screen.getByTestId('apply-partitura-submit'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const appliedScore = (onApply.mock.calls as any)[0][0] as ScoreDefinition;

    const progressoNote = appliedScore.nodes.notes.find((n) => n.name === 'Quadro de Progresso');
    expect(progressoNote).toBeDefined();
    // Não carrega commits nem bugs antigos do projeto anterior
    expect(progressoNote?.content).not.toContain('b7afda9');
    expect(progressoNote?.content).not.toContain('Bug #123');
    expect(progressoNote?.content).toContain('## 🔄 Em Execução Agora (Topo Ao Vivo)');
    expect(progressoNote?.content).toContain('## ✅ Concluído (Histórico com Check)');

    const contextoNote = appliedScore.nodes.notes.find((n) => n.name === 'Contexto Vivo');
    expect(contextoNote).toBeDefined();
    expect(contextoNote?.content).not.toContain('Legacy stack');
    expect(contextoNote?.content).toContain('## 📌 Visão Geral & Propósito');
    expect(contextoNote?.content).toContain('## 🗺️ Mapa de Diretórios & Componentes Chave');

    // Diretrizes fixas mantêm o catálogo de regras 100% intacto
    const regraZeroNote = appliedScore.nodes.notes.find((n) => n.name === 'Regra Zero - Segurança e Git');
    expect(regraZeroNote?.content).toBe(
      '## 🛡️ REGRA ZERO: Segurança Absoluta com Git e Chaves de API\n- NUNCA usar git add .'
    );

    const nanoBananaNote = appliedScore.nodes.notes.find((n) => n.name === 'Protocolo NanoBanana');
    expect(nanoBananaNote?.content).toBe(
      '## 🍌 Protocolo NanoBanana\n- Execução Flash de alto desempenho'
    );
  });

  it('permite desativar a limpeza de notas operacionais via toggle', () => {
    const onApply = vi.fn();
    render(
      <ApplyPartituraDialog
        score={mockScoreWithNotes}
        onClose={vi.fn()}
        onApply={onApply}
      />
    );

    // Abre aba Detalhes
    fireEvent.click(screen.getByTestId('apply-tab-detalhes'));

    // Desmarca o toggle de limpeza
    const toggle = screen.getByTestId('toggle-clean-operational-notes');
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);
    expect((toggle as HTMLInputElement).checked).toBe(false);

    // As badges mudam para 'Original'
    const originalBadges = screen.getAllByText('Original');
    expect(originalBadges).toHaveLength(2);

    // Submete com limpeza desativada
    fireEvent.click(screen.getByTestId('apply-partitura-submit'));

    const appliedScore = (onApply.mock.calls as any)[0][0] as ScoreDefinition;
    const progressoNote = appliedScore.nodes.notes.find((n) => n.name === 'Quadro de Progresso');
    expect(progressoNote?.content).toContain('b7afda9');
    expect(progressoNote?.content).toContain('Bug #123');
  });
});

describe('Partituras Note Templates & Classification', () => {
  it('classifica corretamente notas operacionais e diretrizes fixas', () => {
    expect(classifyScoreNote('Quadro de Progresso')).toBe('operational-progress');
    expect(classifyScoreNote('Quadro Geral')).toBe('operational-progress');
    expect(classifyScoreNote('nota-1')).toBe('operational-progress');
    expect(classifyScoreNote('Status do Projeto')).toBe('operational-progress');
    expect(classifyScoreNote('Relatório ao Vivo')).toBe('operational-progress');

    expect(classifyScoreNote('Contexto Vivo')).toBe('operational-context');
    expect(classifyScoreNote('Contexto do Projeto')).toBe('operational-context');
    expect(classifyScoreNote('Memória Ativa')).toBe('operational-context');

    expect(classifyScoreNote('Regra Zero')).toBe('fixed-guideline');
    expect(classifyScoreNote('Regra Zero - Segurança e Git')).toBe('fixed-guideline');
    expect(classifyScoreNote('Protocolo NanoBanana')).toBe('fixed-guideline');
    expect(classifyScoreNote('Diretrizes de Arquitetura')).toBe('fixed-guideline');

    expect(classifyScoreNote('Anotações Gerais')).toBe('general');
  });

  it('isOperationalNote identifica notas de progresso e contexto', () => {
    expect(isOperationalNote('Quadro de Progresso')).toBe(true);
    expect(isOperationalNote('Contexto Vivo')).toBe(true);
    expect(isOperationalNote('Regra Zero')).toBe(false);
    expect(isOperationalNote('Protocolo NanoBanana')).toBe(false);
    expect(isOperationalNote('Rascunho')).toBe(false);
  });

  it('prepareScoreNotesForApplication sanitiza apenas operacionais quando ativo', () => {
    const prepared = prepareScoreNotesForApplication(mockScoreWithNotes.nodes.notes, {
      cleanOperationalNotes: true,
      projectName: 'Orquestra Demo',
    });

    const progresso = prepared.find((n) => n.name === 'Quadro de Progresso');
    expect(progresso?.content).toContain('Orquestra Demo');
    expect(progresso?.content).not.toContain('b7afda9');

    const contexto = prepared.find((n) => n.name === 'Contexto Vivo');
    expect(contexto?.content).toContain('Orquestra Demo');
    expect(contexto?.content).not.toContain('Legacy stack');

    const regraZero = prepared.find((n) => n.name === 'Regra Zero - Segurança e Git');
    expect(regraZero?.content).toContain('REGRA ZERO');
  });

  it('normalizeScoreNodeName normaliza acentos, travessões unicode e múltiplos espaços', () => {
    const { normalizeScoreNodeName } = require('../src/renderer/src/partituras');
    expect(normalizeScoreNodeName('Quadro de Progresso — Tech Lead')).toBe('quadro de progresso tech lead');
    expect(normalizeScoreNodeName('Quadro de Progresso - Tech Lead')).toBe('quadro de progresso tech lead');
    expect(normalizeScoreNodeName('Regra Zero - Segurança e Git')).toBe('regra zero seguranca e git');
    expect(normalizeScoreNodeName('Regra Zero - Seguranca e Git')).toBe('regra zero seguranca e git');
    expect(normalizeScoreNodeName('Protocolo NanoBanana Zero-Quota')).toBe('protocolo nanobanana zero quota');
    expect(normalizeScoreNodeName('  Tríade   Dev  ')).toBe('triade dev');
  });

  it('ApplyPartituraDialog conecta arestas mesmo com diferenças de acento e travessão unicode', () => {
    const scoreWithSpecialDashes: ScoreDefinition = {
      ...mockScoreWithNotes,
      nodes: {
        ...mockScoreWithNotes.nodes,
        notes: [
          {
            name: 'Quadro de Progresso — Tech Lead', // travessão em-dash
            content: 'conteudo',
            position: { x: 10, y: 10 },
          },
          {
            name: 'Regra Zero - Segurança e Git', // com acentuação
            content: 'conteudo',
            position: { x: 20, y: 20 },
          },
        ],
      },
      edges: [
        // Arestas salvas com hífen ascii e sem acentos
        { source: 'tech-lead', target: 'Quadro de Progresso - Tech Lead' },
        { source: 'tech-lead', target: 'Regra Zero - Seguranca e Git' },
      ],
    };

    const onApply = vi.fn();
    render(
      <ApplyPartituraDialog
        score={scoreWithSpecialDashes}
        onClose={vi.fn()}
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByTestId('apply-partitura-submit'));
    const applied = (onApply.mock.calls as any)[0][0] as ScoreDefinition;

    expect(applied.edges).toHaveLength(2);
    expect(applied.edges[0]?.target).toBe('Quadro de Progresso — Tech Lead');
    expect(applied.edges[1]?.target).toBe('Regra Zero - Segurança e Git');
  });
});
