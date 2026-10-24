import { Socket } from 'node:net';
import { OrqError } from '@orquestra/shared';

export interface CyberdeckConfig {
  tailscaleIp: string;
  sshPort: number;
  deviceModel: string;
  userName: string;
}

export const DEFAULT_CYBERDECK_CONFIG: CyberdeckConfig = {
  tailscaleIp: '100.109.72.118',
  sshPort: 8022,
  deviceModel: 'Redmi Note 7 (lavender)',
  userName: 'kamus',
};

/**
 * Checks if the Cyberdeck phone is reachable via TCP port (e.g. Termux SSH port 8022).
 */
export function checkCyberdeckOnline(
  ip: string = DEFAULT_CYBERDECK_CONFIG.tailscaleIp,
  port: number = DEFAULT_CYBERDECK_CONFIG.sshPort,
  timeoutMs: number = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const cleanup = (result: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => cleanup(true));
    socket.once('timeout', () => cleanup(false));
    socket.once('error', () => cleanup(false));

    try {
      socket.connect(port, ip);
    } catch {
      cleanup(false);
    }
  });
}

/**
 * Generates the button definitions for the Streamdeck UI on the Cyberdeck.
 */
export function buildOrquestraStreamdeckButtons() {
  return [
    {
      id: 'orq_status',
      label: 'Orquestra Status',
      icon: '🎼',
      action: 'orq status --json',
      color: '#4f46e5',
      description: 'Consulta estado dos agentes ativos (Regente, Executor, Revisor)',
    },
    {
      id: 'orq_approve',
      label: 'Aprovar Turno',
      icon: '✅',
      action: 'orq prompt --approve',
      color: '#10b981',
      description: 'Envia aprovação rápida para o agente aguardando confirmação',
    },
    {
      id: 'orq_floor_new',
      label: 'Novo Floor',
      icon: '🌿',
      action: 'orq floor create feature-deck',
      color: '#06b6d4',
      description: 'Cria worktree isolada para nova funcionalidade',
    },
    {
      id: 'orq_pause',
      label: 'Pausar Agentes',
      icon: '⏸️',
      action: 'orq stop --all',
      color: '#f59e0b',
      description: 'Pausa execução com segurança',
    },
  ];
}

/**
 * Generates the Hermes Skill definition so Corvo (the Telegram agent on the phone)
 * can operate and query Orquestra directly.
 */
export function buildCorvoOrquestraSkill(): string {
  return `---
name: orquestra
description: "Controlar e monitorar agentes do Orquestra Kamus Edition no PC pelo ssh: status, floors, prompts e aprovações."
version: 1.0.0
platforms: [linux, android]
metadata:
  hermes:
    tags: [orquestra, agentes, claude, agy, dev]
---

# Orquestra Kamus Edition — Integração Corvo

Acesso: \`ssh pc "<comando>"\` (Tailscale; Windows 11).

## Comandos Orquestra
| Pedido | Comando |
|---|---|
| Status dos agentes | \`ssh pc "orq status"\` |
| Ver floors / worktrees | \`ssh pc "orq floor list"\` |
| Criar novo floor | \`ssh pc "orq floor create <nome>"\` |
| Mandar pedido pro Claude | \`ssh pc "orq prompt executor \\"<tarefa>\\""\` |
| Aprovar último passo | \`ssh pc "orq prompt --approve"\` |
| Pausar tudo | \`ssh pc "orq stop --all"\` |

## Regras
- Nunca crie floors com nomes genéricos; use o padrão \`feat/<ticket>\` ou \`fix/<nome>\`.
- Sempre reporte para o Kamus no Telegram o resumo do status retornado pelos agentes.
`;
}
