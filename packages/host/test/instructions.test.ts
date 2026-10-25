import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  CEREBRO_TOKEN_ECONOMY_HEADER,
  getCerebroInstruction,
  injectCerebroDirectives,
  resolveSessionGuide,
} from '../src/instructions.js';
import { loadHostEnv } from '../src/index.js';
import { startHostBridge, type HostBridge } from '../src/bridge.js';
import { FakePtyHost } from '../../core/test/helpers/fake-pty-host.js';
import { createFakeAdapter } from '../../core/test/helpers/fake-adapter.js';
import { silentLogger } from '../../core/src/log.js';
import { type HostToMain } from '@orquestra/shared';

describe('Instruções e Economia de Tokens via Cérebro', () => {
  const originalEnv = process.env.ORQ_CEREBRO_PATH;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cerebro-test-'));
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ORQ_CEREBRO_PATH;
    } else {
      process.env.ORQ_CEREBRO_PATH = originalEnv;
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignora falha de limpeza
    }
  });

  it('retorna null se ORQ_CEREBRO_PATH não estiver definido', () => {
    delete process.env.ORQ_CEREBRO_PATH;
    expect(getCerebroInstruction()).toBeNull();
  });

  it('retorna null se ORQ_CEREBRO_PATH apontar para caminho inexistente no disco', () => {
    process.env.ORQ_CEREBRO_PATH = join(tempDir, 'pasta-fantasma-inexistente');
    expect(getCerebroInstruction()).toBeNull();
  });

  it('injeta diretrizes de economia quando ORQ_CEREBRO_PATH existe no disco', () => {
    process.env.ORQ_CEREBRO_PATH = tempDir;
    const instruction = getCerebroInstruction();
    expect(instruction).not.toBeNull();
    expect(instruction).toContain(CEREBRO_TOKEN_ECONOMY_HEADER);
    expect(instruction).toContain('Grep/Read/Glob');
    expect(instruction).toContain('100% privado');
  });

  it('resolveSessionGuide combina persona e diretrizes do Cérebro dinamicamente', () => {
    process.env.ORQ_CEREBRO_PATH = tempDir;
    const guide = resolveSessionGuide({
      persona: { name: 'executor', text: 'Execute tarefas com TDD.' },
      regente: false,
    });
    expect(guide).toBeDefined();
    expect(guide).toContain('Sua função: executor');
    expect(guide).toContain(CEREBRO_TOKEN_ECONOMY_HEADER);
  });

  it('resolveSessionGuide retorna apenas base quando Cérebro não estiver configurado', () => {
    delete process.env.ORQ_CEREBRO_PATH;
    const guide = resolveSessionGuide({
      persona: { name: 'executor', text: 'Execute tarefas com TDD.' },
      regente: false,
    });
    expect(guide).toBeDefined();
    expect(guide).toContain('Sua função: executor');
    expect(guide).not.toContain(CEREBRO_TOKEN_ECONOMY_HEADER);
  });

  it('injectCerebroDirectives mantém texto intacto se Cérebro ausente', () => {
    delete process.env.ORQ_CEREBRO_PATH;
    expect(injectCerebroDirectives('Guia Original')).toBe('Guia Original');
  });
});

describe('Loader Leve de .env no Startup do Host', () => {
  let envDir: string;

  beforeEach(() => {
    envDir = mkdtempSync(join(tmpdir(), 'env-loader-test-'));
  });

  afterEach(() => {
    delete process.env.ORQ_TEST_DYNAMIC_VAR;
    try {
      rmSync(envDir, { recursive: true, force: true });
    } catch {
      // Ignora falha de limpeza
    }
  });

  it('lê arquivo .env local e popula process.env sem erros', () => {
    writeFileSync(join(envDir, '.env'), 'ORQ_TEST_DYNAMIC_VAR="valor_teste_ok"\n# Comentário ignorado\n');
    loadHostEnv(envDir);
    expect(process.env.ORQ_TEST_DYNAMIC_VAR).toBe('valor_teste_ok');
  });
});

describe('Repasse de ORQ_CEREBRO_PATH para o PTY no HostBridge', () => {
  let bridge: HostBridge | undefined;
  let dataDir: string;
  let projectDir: string;
  let cerebroDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'host-cerebro-data-'));
    projectDir = mkdtempSync(join(tmpdir(), 'host-cerebro-proj-'));
    cerebroDir = mkdtempSync(join(tmpdir(), 'host-cerebro-target-'));
    mkdirSync(join(projectDir, '.orquestra'), { recursive: true });
    writeFileSync(join(projectDir, '.orquestra', 'workspace.json'), JSON.stringify({
      version: 1,
      terminals: [],
      notes: [],
      portals: [],
      edges: [],
    }));
  });

  afterEach(async () => {
    delete process.env.ORQ_CEREBRO_PATH;
    await bridge?.close();
    bridge = undefined;
    try {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(cerebroDir, { recursive: true, force: true });
    } catch {
      // Ignora erro de limpeza
    }
  });

  it('repassa ORQ_CEREBRO_PATH no env de terminais criados no PTY', async () => {
    process.env.ORQ_CEREBRO_PATH = cerebroDir;
    const ptyHost = new FakePtyHost();
    const sent: HostToMain[] = [];

    bridge = await startHostBridge({
      send: (msg: HostToMain) => sent.push(msg),
      adapters: {
        shell: createFakeAdapter(),
        agy: createFakeAdapter(),
        claude: { ...createFakeAdapter(), kind: 'claude' },
      },
      recentFile: join(dataDir, 'recent.json'),
      settingsFile: join(dataDir, 'settings.json'),
      personasFile: join(dataDir, 'personas.json'),
      cliScript: 'C:/orq/bin/orq.mjs',
      pipePath: `\\\\.\\pipe\\orq-test-cer-${randomBytes(4).toString('hex')}`,
      dataDir,
      log: silentLogger(),
      ptyHost,
      readyQuietMs: 20,
    } as any);

    await bridge.handle({
      kind: 'command',
      id: 'open-1',
      method: 'project.open',
      params: { dir: projectDir },
    });

    await bridge.handle({
      kind: 'command',
      id: 'create-1',
      method: 'terminal.create',
      params: { name: 'worker-1', agent: 'claude', cwd: projectDir },
    });

    expect(ptyHost.spawned.length).toBeGreaterThan(0);
    const lastSpawned = ptyHost.spawned.at(-1)!;
    expect(lastSpawned.spec.env.ORQ_CEREBRO_PATH).toBe(cerebroDir);
  });
});
