import { existsSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import { join } from 'node:path';
import type { HostMessage } from '@orquestra/shared';
import type { Logger } from '@orquestra/core';
import type { HostBridge } from './bridge.js';

export type Bridge = {
  handle(message: any): Promise<unknown>;
  close?: () => Promise<void>;
};

export function defaultControlPipePath(username?: string): string {
  const user = username || ((): string => {
    try {
      return os.userInfo().username;
    } catch {
      return process.env.USERNAME || process.env.USER || 'default';
    }
  })();
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\orquestra-ctrl-${user}`;
  }
  return join(os.tmpdir(), `orquestra-ctrl-${user}.sock`);
}

export type ControlPipeServerOptions = {
  bridge: Bridge | HostBridge;
  pipePath?: string;
  log: Logger;
  onShutdown?: () => void;
};

export type ControlPipeServer = {
  pipePath: string;
  broadcast: (msg: HostMessage) => void;
  close: () => Promise<void>;
};

export function startControlPipeServer(opts: ControlPipeServerOptions): ControlPipeServer {
  const pipePath = opts.pipePath ?? defaultControlPipePath();
  const sockets = new Set<net.Socket>();

  if (process.platform !== 'win32' && existsSync(pipePath)) {
    try {
      unlinkSync(pipePath);
    } catch (err) {
      opts.log.warn({ pipePath, err }, 'falha ao remover socket Unix antigo');
    }
  }

  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const reply = await opts.bridge.handle(trimmed);
          if (reply !== undefined && !socket.destroyed) {
            socket.write(JSON.stringify(reply) + '\n');
          }
          let parsed: any;
          try {
            parsed = JSON.parse(trimmed);
          } catch {}
          if (parsed && (parsed.type === 'shutdown' || parsed.kind === 'shutdown')) {
            opts.onShutdown?.();
          }
        } catch (err) {
          opts.log.error({ err, line: trimmed }, 'erro processando comando no control pipe');
          if (!socket.destroyed) {
            socket.write(JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) } }) + '\n');
          }
        }
      }
    });

    socket.on('error', (err) => {
      opts.log.debug({ err }, 'erro no cliente do control pipe');
      sockets.delete(socket);
    });

    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      opts.log.warn({ pipePath, err }, 'control pipe já está em uso, ignorando');
      return;
    }
    opts.log.error({ pipePath, err }, 'erro no servidor control pipe');
  });

  server.listen(pipePath, () => {
    opts.log.info({ pipePath }, 'control pipe escutando');
  });

  return {
    pipePath,
    broadcast: (msg: HostMessage) => {
      const line = JSON.stringify(msg) + '\n';
      for (const socket of sockets) {
        if (!socket.destroyed) {
          try {
            socket.write(line);
          } catch (err) {
            opts.log.debug({ err }, 'erro no broadcast para control pipe');
          }
        }
      }
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        server.close(() => {
          if (process.platform !== 'win32' && existsSync(pipePath)) {
            try {
              unlinkSync(pipePath);
            } catch {}
          }
          resolve();
        });
      }),
  };
}
