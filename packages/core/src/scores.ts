import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceScoreSchema, type WorkspaceScore } from '@orquestra/shared';
import type { Logger } from './log.js';

export interface ScoreStoreOptions {
  globalDir: string;
  log: Logger;
}

export class ScoreStore {
  private readonly globalDir: string;
  private readonly log: Logger;

  constructor(opts: ScoreStoreOptions) {
    this.globalDir = opts.globalDir;
    this.log = opts.log;
    try {
      mkdirSync(this.globalDir, { recursive: true });
    } catch (err) {
      this.log.warn({ err, dir: this.globalDir }, 'falha ao criar pasta global de partituras');
    }
  }

  private resolveCerebroDir(): string | null {
    // Carrega o caminho exclusivamente pela variável de ambiente do .env local
    const envPath = process.env.ORQ_CEREBRO_PATH;
    if (envPath && existsSync(envPath)) {
      const partiturasPath = join(envPath, 'partituras');
      return existsSync(partiturasPath) ? partiturasPath : envPath;
    }
    return null;
  }

  private getProjectDir(projectDir?: string): string | null {
    if (!projectDir) return null;
    return join(projectDir, '.orquestra', 'scores');
  }

  list(projectDir?: string): WorkspaceScore[] {
    const scores: WorkspaceScore[] = [];
    const seenIds = new Set<string>();

    const readFromDir = (dir: string, defaultScope: 'global' | 'project') => {
      if (!existsSync(dir)) return;
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const fullPath = join(dir, file);
          try {
            const raw = JSON.parse(readFileSync(fullPath, 'utf8'));
            const parsed = workspaceScoreSchema.parse(raw);
            if (!seenIds.has(parsed.id)) {
              seenIds.add(parsed.id);
              scores.push({ ...parsed, scope: parsed.scope || defaultScope });
            }
          } catch (err) {
            this.log.warn({ err, file: fullPath }, 'partitura inválida ou corrompida ignorada');
          }
        }
      } catch (err) {
        this.log.warn({ err, dir }, 'falha ao listar pasta de partituras');
      }
    };

    // 1. Partituras do projeto ativo
    const projScoresDir = this.getProjectDir(projectDir);
    if (projScoresDir) {
      readFromDir(projScoresDir, 'project');
    }

    // 2. Partituras globais da máquina
    readFromDir(this.globalDir, 'global');

    // 3. Partituras do Cérebro (se configurado no ambiente local)
    const cerebroDir = this.resolveCerebroDir();
    if (cerebroDir) {
      readFromDir(cerebroDir, 'global');
    }

    return scores.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  get(id: string, projectDir?: string): WorkspaceScore | null {
    const all = this.list(projectDir);
    return all.find((s) => s.id === id) ?? null;
  }

  save(score: WorkspaceScore, projectDir?: string): { ok: boolean; id: string } {
    const valid = workspaceScoreSchema.parse(score);
    const targetDir = valid.scope === 'project' && projectDir
      ? this.getProjectDir(projectDir)!
      : this.globalDir;

    mkdirSync(targetDir, { recursive: true });
    const targetFile = join(targetDir, `${valid.id}.json`);
    const temporary = `${targetFile}.tmp`;

    // Sanitização de privacidade conforme settings declaradas
    const sanitized: WorkspaceScore = {
      ...valid,
      updatedAt: Date.now(),
      nodes: {
        ...valid.nodes,
        terminals: valid.settings.includeCommands
          ? valid.nodes.terminals
          : valid.nodes.terminals.map((t) => ({ ...t, command: undefined, args: undefined })),
        notes: valid.settings.includeNotesContent
          ? valid.nodes.notes
          : valid.nodes.notes.map((n) => ({ ...n, content: undefined })),
      },
    };

    writeFileSync(temporary, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
    renameSync(temporary, targetFile);
    return { ok: true, id: valid.id };
  }

  remove(id: string, scope: 'global' | 'project', projectDir?: string): boolean {
    const targetDir = scope === 'project' && projectDir
      ? this.getProjectDir(projectDir)!
      : this.globalDir;

    const targetFile = join(targetDir, `${id}.json`);
    if (existsSync(targetFile)) {
      try {
        unlinkSync(targetFile);
        return true;
      } catch (err) {
        this.log.warn({ err, targetFile }, 'falha ao remover arquivo de partitura');
      }
    }
    return false;
  }
}
