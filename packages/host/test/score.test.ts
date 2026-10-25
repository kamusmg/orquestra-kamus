import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type WorkspaceScore } from '@orquestra/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../../core/src/log.js';
import { ScoreStore } from '../../core/src/scores.js';
import { createFakeAdapter } from '../../core/test/helpers/fake-adapter.js';
import { FakePtyHost } from '../../core/test/helpers/fake-pty-host.js';
import { startHostBridge, type HostBridge } from '../src/bridge.js';

describe('ScoreStore (Partituras)', () => {
  it('salva, lista e recupera partituras globais e de projeto', () => {
    const globalDir = mkdtempSync(join(tmpdir(), 'orq-score-global-'));
    const projectDir = mkdtempSync(join(tmpdir(), 'orq-score-proj-'));
    const store = new ScoreStore({ globalDir, log: silentLogger() });

    const globalScore: WorkspaceScore = {
      id: 'score-global-1',
      name: 'Squad Global',
      description: 'Partitura Global de Teste',
      icon: 'sparkles',
      color: '#3b82f6',
      scope: 'global',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        includeCommands: true,
        includeNotesContent: true,
        includeChatHistory: false,
      },
      nodes: {
        terminals: [
          {
            name: 'arquiteto',
            agent: 'agy',
            args: ['--model', 'gemini-4-argon-high'],
            position: { x: 100, y: 100 },
          },
        ],
        notes: [
          {
            name: 'quadro',
            content: '# Quadro',
            position: { x: 400, y: 100 },
          },
        ],
        portals: [],
      },
      edges: [{ source: 'arquiteto', target: 'quadro' }],
    };

    const projectScore: WorkspaceScore = {
      id: 'score-project-1',
      name: 'Squad Local',
      description: 'Partitura de Projeto',
      icon: 'code',
      color: '#10b981',
      scope: 'project',
      createdAt: Date.now() + 10,
      updatedAt: Date.now() + 10,
      settings: {
        includeCommands: false,
        includeNotesContent: false,
        includeChatHistory: false,
      },
      nodes: {
        terminals: [
          {
            name: 'executor',
            agent: 'shell',
            args: ['npm', 'test'],
            position: { x: 200, y: 200 },
          },
        ],
        notes: [
          {
            name: 'tarefas',
            content: 'Segredo de projeto',
            position: { x: 500, y: 200 },
          },
        ],
        portals: [],
      },
      edges: [],
    };

    // Salva global
    const res1 = store.save(globalScore);
    expect(res1.ok).toBe(true);
    expect(res1.id).toBe('score-global-1');

    // Salva projeto
    const res2 = store.save(projectScore, projectDir);
    expect(res2.ok).toBe(true);
    expect(res2.id).toBe('score-project-1');

    // Lista sem projeto -> vê apenas global
    const listGlobalOnly = store.list();
    expect(listGlobalOnly.some((s) => s.id === 'score-global-1')).toBe(true);
    expect(listGlobalOnly.some((s) => s.id === 'score-project-1')).toBe(false);

    // Lista com projeto -> vê ambos
    const listAll = store.list(projectDir);
    expect(listAll.some((s) => s.id === 'score-global-1')).toBe(true);
    expect(listAll.some((s) => s.id === 'score-project-1')).toBe(true);

    // Sanitização de privacidade: includeCommands=false remove args, includeNotesContent=false remove content
    const savedProj = store.get('score-project-1', projectDir);
    expect(savedProj).not.toBeNull();
    expect(savedProj?.nodes.terminals[0]?.args).toBeUndefined();
    expect(savedProj?.nodes.notes[0]?.content).toBeUndefined();

    // Sanitização de privacidade: includeCommands=true preserva args
    const savedGlobal = store.get('score-global-1');
    expect(savedGlobal?.nodes.terminals[0]?.args).toEqual(['--model', 'gemini-4-argon-high']);
    expect(savedGlobal?.nodes.notes[0]?.content).toBe('# Quadro');

    // Remove
    expect(store.remove('score-project-1', 'project', projectDir)).toBe(true);
    expect(store.get('score-project-1', projectDir)).toBeNull();

    expect(store.remove('score-global-1', 'global')).toBe(true);
    expect(store.get('score-global-1')).toBeNull();
  });
});

describe('HostBridge - RPC de Partituras', () => {
  let bridge: HostBridge | undefined;

  afterEach(async () => {
    await bridge?.close();
    bridge = undefined;
  });

  async function setupBridge() {
    const dataDir = mkdtempSync(join(tmpdir(), 'orq-bridge-score-'));
    const agentPidFile = join(dataDir, 'pids.json');
    const recentFile = join(dataDir, 'recent.json');
    const settingsFile = join(dataDir, 'settings.json');
    const personasFile = join(dataDir, 'personas.json');
    const agyHooksFile = join(dataDir, 'hooks.json');
    writeFileSync(agyHooksFile, JSON.stringify({
      orquestra: { Stop: [{ type: 'command', command: 'node C:/orq/bin/orq.mjs hook agy Stop', timeout: 10 }] },
    }));
    const ptyHost = new FakePtyHost();

    bridge = await startHostBridge({
      send: () => {},
      adapters: { shell: createFakeAdapter(), agy: createFakeAdapter() },
      recentFile,
      settingsFile,
      personasFile,
      saveDelayMs: 20,
      cliScript: 'C:/orq/bin/orq.mjs',
      pipePath: `\\\\.\\pipe\\orq-test-score-${randomBytes(4).toString('hex')}`,
      dataDir,
      log: silentLogger(),
      ptyHost,
      readyQuietMs: 20,
      agyHooksFile,
      outputIntervalMs: 5,
      agentPidFile,
    } as any);

    return { bridge, dataDir };
  }

  it('gerencia partituras e instancia grafo no canvas via score.instantiate', async () => {
    const { bridge } = await setupBridge();

    // Abre um projeto no workspace
    const projectDir = mkdtempSync(join(tmpdir(), 'orq-test-proj-'));
    mkdirSync(join(projectDir, '.orquestra'), { recursive: true });
    writeFileSync(join(projectDir, '.orquestra', 'workspace.json'), JSON.stringify({
      version: 1,
      terminals: [],
      notes: [],
      portals: [],
      edges: [],
    }));

    await bridge.handle({
      kind: 'command',
      id: 'open-1',
      method: 'project.open',
      params: { dir: projectDir },
    });

    const scoreData: WorkspaceScore = {
      id: 'score-instantiate-1',
      name: 'Dupla Produtiva',
      icon: 'sparkles',
      color: '#8b5cf6',
      scope: 'project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        includeCommands: true,
        includeNotesContent: true,
        includeChatHistory: false,
      },
      nodes: {
        terminals: [
          {
            name: 'lead-dev',
            agent: 'agy',
            args: ['auto-lead'],
            position: { x: 50, y: 50 },
          },
        ],
        notes: [
          {
            name: 'nota-backlog',
            content: 'Planejamento da sprint',
            position: { x: 350, y: 50 },
          },
        ],
        portals: [],
      },
      edges: [
        { source: 'lead-dev', target: 'nota-backlog' },
      ],
      embeddedPersonas: [
        {
          name: 'lider-tech',
          text: 'Você lidera o projeto e delega tarefas com precisão.',
          scope: 'project',
        },
      ],
    };

    // Salva via score.save
    const saveRes = (await bridge.dispatchForTest('score.save', scoreData, { session: 'main' })) as { ok: boolean; id: string };
    expect(saveRes.ok).toBe(true);
    expect(saveRes.id).toBe('score-instantiate-1');

    // Lista via score.list
    const listRes = (await bridge.dispatchForTest('score.list', {}, { session: 'main' })) as { scores: WorkspaceScore[] };
    expect(listRes.scores.some((s) => s.id === 'score-instantiate-1')).toBe(true);

    // Consulta via score.get
    const getRes = (await bridge.dispatchForTest('score.get', { id: 'score-instantiate-1' }, { session: 'main' })) as { score: WorkspaceScore | null };
    expect(getRes.score?.name).toBe('Dupla Produtiva');

    // Instancia via score.instantiate
    const instRes = (await bridge.dispatchForTest('score.instantiate', { id: 'score-instantiate-1' }, { session: 'main' })) as {
      ok: boolean;
      createdTerminals: string[];
      createdNotes: string[];
    };
    expect(instRes.ok).toBe(true);
    expect(instRes.createdTerminals).toContain('lead-dev');
    expect(instRes.createdNotes).toContain('nota-backlog');

    // Instanciar novamente gera sufixos numéricos (#2) sem conflito de nome
    const instRes2 = (await bridge.dispatchForTest('score.instantiate', { id: 'score-instantiate-1' }, { session: 'main' })) as {
      ok: boolean;
      createdTerminals: string[];
      createdNotes: string[];
    };
    expect(instRes2.ok).toBe(true);
    expect(instRes2.createdTerminals).toContain('lead-dev #2');
    expect(instRes2.createdNotes).toContain('nota-backlog #2');

    // Remove via score.remove
    const removeRes = (await bridge.dispatchForTest('score.remove', { id: 'score-instantiate-1', scope: 'project' }, { session: 'main' })) as { ok: boolean };
    expect(removeRes.ok).toBe(true);

    const postRemove = (await bridge.dispatchForTest('score.get', { id: 'score-instantiate-1' }, { session: 'main' })) as { score: WorkspaceScore | null };
    expect(postRemove.score).toBeNull();
  });
});
