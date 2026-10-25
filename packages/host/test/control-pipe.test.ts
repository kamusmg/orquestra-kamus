import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../../core/src/log.js';
import { createFakeAdapter } from '../../core/test/helpers/fake-adapter.js';
import { FakePtyHost } from '../../core/test/helpers/fake-pty-host.js';
import { waitFor } from '../../core/test/helpers/wait.js';
import { startHostBridge, extractModelVersion, resolveAutoModelArgs } from '../src/bridge.js';
import { startControlPipeServer, type ControlPipeServer, type Bridge } from '../src/control-pipe.js';

describe('Control Pipe Server', () => {
  let server: ControlPipeServer | undefined;
  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  function sendCommand(pipePath: string, cmd: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(pipePath, () => {
        socket.write(JSON.stringify(cmd) + '\n');
      });
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.includes('\n')) {
          const line = buffer.split('\n')[0];
          try {
            if (line) resolve(JSON.parse(line));
            else reject(new Error('Linha vazia'));
          } catch (e) {
            reject(e);
          } finally {
            socket.destroy();
          }
        }
      });
      socket.on('error', reject);
    });
  }

  it('handles ping-control, list and unload-idle-terminals', async () => {
    const pipePath = process.platform === 'win32'
      ? `\\\\.\\pipe\\orquestra-ctrl-test-${randomUUID()}`
      : `/tmp/orquestra-ctrl-test-${randomUUID()}.sock`;

    const fakeBridge: Bridge = {
      async handle(raw: string | object) {
        const cmd = typeof raw === 'string' ? JSON.parse(raw) : raw;
        switch (cmd.type) {
          case 'ping-control':
            return { id: cmd.id, ok: true, result: { pid: process.pid, rssBytes: process.memoryUsage().rss } };
          case 'list':
            return { id: cmd.id, ok: true, result: { workspaces: [], selectedId: null } };
          case 'unload-idle-terminals':
            return { id: cmd.id, ok: true, result: { unloaded: ['idle-1'] } };
          default:
            return { id: cmd.id, ok: false, error: { code: 'USAGE', message: 'Comando desconhecido' } };
        }
      },
    };

    server = startControlPipeServer({
      bridge: fakeBridge,
      pipePath,
      log: silentLogger(),
    });

    await new Promise((r) => setTimeout(r, 50));

    const pingRes = await sendCommand(pipePath, { id: 1, type: 'ping-control' });
    expect(pingRes).toMatchObject({
      id: 1,
      ok: true,
      result: { pid: process.pid, rssBytes: expect.any(Number) },
    });

    const listRes = await sendCommand(pipePath, { id: 2, type: 'list' });
    expect(listRes).toEqual({
      id: 2,
      ok: true,
      result: { workspaces: [], selectedId: null },
    });

    const unloadRes = await sendCommand(pipePath, { id: 3, type: 'unload-idle-terminals' });
    expect(unloadRes).toEqual({
      id: 3,
      ok: true,
      result: { unloaded: ['idle-1'] },
    });
  });

  it('broadcasts messages to connected sockets', async () => {
    const pipePath = process.platform === 'win32'
      ? `\\\\.\\pipe\\orquestra-ctrl-test-${randomUUID()}`
      : `/tmp/orquestra-ctrl-test-${randomUUID()}.sock`;

    const fakeBridge: Bridge = {
      handle: async () => ({ ok: true }),
    };

    server = startControlPipeServer({
      bridge: fakeBridge,
      pipePath,
      log: silentLogger(),
    });

    await new Promise((r) => setTimeout(r, 50));

    const received: string[] = [];
    const socket = net.createConnection(pipePath);
    await new Promise<void>((resolve) => socket.once('connect', resolve));
    await new Promise((r) => setTimeout(r, 50));

    socket.on('data', (chunk) => {
      received.push(chunk.toString('utf8'));
    });

    server.broadcast({ kind: 'ready' } as any);
    await new Promise((r) => setTimeout(r, 100));

    expect(received.join('')).toContain('{"kind":"ready"}');
    socket.destroy();
  });

  it('integrates with real HostBridge for ping-control, list, unload-idle-terminals, and update-terminal', async () => {
    const pipePath = process.platform === 'win32'
      ? `\\\\.\\pipe\\orquestra-ctrl-test-${randomUUID()}`
      : `/tmp/orquestra-ctrl-test-${randomUUID()}.sock`;

    const projectDir = mkdtempSync(join(tmpdir(), 'orq-pipe-proj-'));
    mkdirSync(join(projectDir, '.orquestra'), { recursive: true });
    writeFileSync(join(projectDir, '.orquestra', 'workspace.json'), JSON.stringify({
      schemaVersion: 1,
      terminals: [],
      notes: [],
      connections: [],
      layout: {},
      viewport: { x: 0, y: 0, zoom: 1 },
    }));

    const bridge = await startHostBridge({
      send: () => {},
      adapters: {
        claude: { ...createFakeAdapter(), kind: 'claude' },
        agy: { ...createFakeAdapter(), kind: 'agy' },
        shell: createFakeAdapter(),
      },
      recentFile: join(mkdtempSync(join(tmpdir(), 'orq-recent-')), 'recent.json'),
      settingsFile: join(mkdtempSync(join(tmpdir(), 'orq-settings-')), 'settings.json'),
      personasFile: join(mkdtempSync(join(tmpdir(), 'orq-personas-')), 'personas.json'),
      cliScript: 'C:/orq/bin/orq.mjs',
      pipePath: `\\\\.\\pipe\\orq-unit-${randomUUID()}`,
      dataDir: mkdtempSync(join(tmpdir(), 'orq-bridge-')),
      log: silentLogger(),
      ptyHost: new FakePtyHost(),
      readyQuietMs: 20,
    } as any);

    server = startControlPipeServer({
      bridge,
      pipePath,
      log: silentLogger(),
    });

    await new Promise((r) => setTimeout(r, 50));

    // Open project first
    await bridge.handle({
      kind: 'command',
      id: 'open-1',
      method: 'project.open',
      params: { dir: projectDir },
    });

    // Create terminal
    await bridge.handle({
      kind: 'command',
      id: 'create-1',
      method: 'terminal.create',
      params: { name: 'worker', agent: 'claude', cwd: projectDir },
    });

    // Test ping-control
    const pingRes = await sendCommand(pipePath, { id: 10, type: 'ping-control' });
    expect(pingRes).toMatchObject({
      id: 10,
      ok: true,
      result: { pid: process.pid, rssBytes: expect.any(Number) },
    });

    // Test list
    const listRes = await sendCommand(pipePath, { id: 20, type: 'list' });
    expect(listRes.ok).toBe(true);
    expect(listRes.result.workspaces).toHaveLength(1);

    // Test list-models
    const modelsRes = await sendCommand(pipePath, { id: 35, type: 'list-models' });
    expect(modelsRes).toMatchObject({
      id: 35,
      ok: true,
      result: {
        models: expect.arrayContaining([
          expect.objectContaining({ agent: 'agy' }),
          expect.objectContaining({ agent: 'claude' }),
        ]),
        recommendedFlash: expect.any(String),
        recommendedLead: expect.any(String),
      },
    });

    // Test create-terminal via Control Pipe
    const createRes = await sendCommand(pipePath, {
      id: 36,
      type: 'create-terminal',
      name: 'pipe-created',
      agent: 'claude',
      args: ['--model', 'auto-flash', '--dangerously-skip-permissions'],
      connectTo: 'worker',
    });
    expect(createRes).toMatchObject({
      id: 36,
      ok: true,
      result: {
        name: 'pipe-created',
        agent: 'claude',
        args: expect.arrayContaining([modelsRes.result.recommendedFlash]),
      },
    });

    // Test update-terminal (agent hot-swap from claude to agy)
    const updateRes = await sendCommand(pipePath, {
      id: 30,
      type: 'update-terminal',
      name: 'worker',
      agent: 'agy',
    });
    expect(updateRes).toMatchObject({
      id: 30,
      ok: true,
      result: { name: 'worker', agent: 'agy' },
    });

    // Wait for restart to settle to idle
    await new Promise((r) => setTimeout(r, 100));

    // Test unload-idle-terminals
    const unloadRes = await sendCommand(pipePath, { id: 40, type: 'unload-idle-terminals' });
    expect(unloadRes.ok).toBe(true);
    expect(unloadRes.result.unloaded).toEqual(expect.arrayContaining(['worker', 'pipe-created']));

    await bridge.close();
  });

  it('extractModelVersion and resolveAutoModelArgs handle dynamic versioning and substitutions', () => {
    expect(extractModelVersion('gemini-4-argon-high')).toBe(4);
    expect(extractModelVersion('gemini-3.8-flash-high')).toBe(3.8);
    expect(extractModelVersion('gemini-4.5-flash-high')).toBe(4.5);
    expect(extractModelVersion('gemini-5-flash-high')).toBe(5);
    expect(extractModelVersion('claude-opus-5-5-high')).toBe(5.5);

    const flash = 'gemini-3.8-flash-high';
    const lead = 'gemini-4-argon-high';

    expect(resolveAutoModelArgs(['--model', 'auto-flash', '--other'], flash, lead)).toEqual([
      '--model',
      flash,
      '--other',
    ]);
    expect(resolveAutoModelArgs(['--model', 'latest-lead', '--flag'], flash, lead)).toEqual([
      '--model',
      lead,
      '--flag',
    ]);
    expect(resolveAutoModelArgs(['--model=auto-flash', '-v'], flash, lead)).toEqual([
      `--model=${flash}`,
      '-v',
    ]);
    expect(resolveAutoModelArgs(['--model=latest-lead'], flash, lead)).toEqual([
      `--model=${lead}`,
    ]);
    expect(resolveAutoModelArgs(undefined, flash, lead)).toBeUndefined();
  });
});
