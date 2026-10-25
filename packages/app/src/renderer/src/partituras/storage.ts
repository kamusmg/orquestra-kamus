import type { CommandApi } from '../api';
import type { ScoreDefinition } from './types';

const STORAGE_KEY = 'orquestra:scores:v1';

export function getLocalScores(): ScoreDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalScore(score: ScoreDefinition): void {
  try {
    const current = getLocalScores();
    const index = current.findIndex((s) => s.id === score.id);
    if (index >= 0) {
      current[index] = score;
    } else {
      current.unshift(score);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

export function removeLocalScore(id: string): void {
  try {
    const current = getLocalScores().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

export async function listScores(api?: CommandApi, workspaceId?: string): Promise<ScoreDefinition[]> {
  if (api) {
    try {
      const response = await (api as any).command('score.list', { workspaceId });
      if (response && Array.isArray((response as any).scores)) {
        const remote = (response as any).scores as ScoreDefinition[];
        // Mescla com locais se houver
        const local = getLocalScores();
        const map = new Map<string, ScoreDefinition>();
        for (const item of local) map.set(item.id, item);
        for (const item of remote) map.set(item.id, item);
        return [...map.values()];
      }
    } catch {
      // Fallback gracioso para armazenamento local
    }
  }
  return getLocalScores();
}

export async function saveScore(score: ScoreDefinition, api?: CommandApi): Promise<void> {
  saveLocalScore(score);
  if (api) {
    try {
      await (api as any).command('score.save', { score });
    } catch {}
  }
}

export async function removeScore(id: string, api?: CommandApi): Promise<void> {
  removeLocalScore(id);
  if (api) {
    try {
      await (api as any).command('score.remove', { scoreId: id });
    } catch {}
  }
}
