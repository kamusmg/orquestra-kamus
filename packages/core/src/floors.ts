import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OrqError } from '@orquestra/shared';

export type FloorInfo = {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
};

function runGit(cwd: string, args: string[]): Promise<string> {
  const standard = join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git', 'cmd', 'git.exe');
  const command = existsSync(standard) ? standard : 'git';
  return new Promise((resolveResult, reject) => {
    execFile(
      command,
      ['--literal-pathspecs', '-C', cwd, ...args],
      { encoding: 'utf8', windowsHide: true, timeout: 15000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr.trim() || stdout.trim() || error.message;
          reject(new OrqError('USAGE', `Git: ${message}`));
        } else {
          resolveResult(stdout);
        }
      },
    );
  });
}

export function floorDirectory(projectDir: string, name: string): string {
  return join(resolve(projectDir), '.orquestra', 'floors', name);
}

export async function listFloors(projectDir: string): Promise<FloorInfo[]> {
  const root = resolve(projectDir);
  const floorsDir = join(root, '.orquestra', 'floors');
  let raw: string;
  try {
    raw = await runGit(root, ['worktree', 'list', '--porcelain']);
  } catch (error) {
    if (error instanceof OrqError && error.message.includes('not a git repository')) {
      return [];
    }
    throw error;
  }

  const normRoot = root.replaceAll('\\', '/').toLowerCase();
  const normFloorsDir = floorsDir.replaceAll('\\', '/').toLowerCase();

  const entries: FloorInfo[] = [];
  const blocks = raw.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split(/\r?\n/);
    let path = '';
    let branch = '';
    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.substring(9).trim();
      else if (line.startsWith('branch ')) branch = line.substring(7).trim().replace(/^refs\/heads\//, '');
    }
    if (!path) continue;
    const norm = path.replaceAll('\\', '/').toLowerCase();
    const isMain = norm === normRoot || (entries.length === 0 && !norm.startsWith(normFloorsDir));
    const isFloor = norm.startsWith(normFloorsDir);
    if (isFloor) {
      const name = path.split(/[/\\]/).pop() ?? '';
      entries.push({ name, path, branch, isMain: false });
    } else if (isMain) {
      entries.push({ name: 'main', path, branch, isMain: true });
    }
  }
  return entries;
}

export async function createFloor(
  projectDir: string,
  name: string,
  opts: { branch?: string; copyGround?: boolean } = {},
): Promise<FloorInfo> {
  const root = resolve(projectDir);
  const cleanName = name.trim().replaceAll(/[^a-zA-Z0-9._-]/g, '-');
  if (!cleanName) throw new OrqError('USAGE', 'Nome de piso inválido.');

  const targetPath = floorDirectory(root, cleanName);
  if (existsSync(targetPath)) {
    throw new OrqError('USAGE', `Piso "${cleanName}" já existe em ${targetPath}.`);
  }

  const branch = opts.branch ?? cleanName;
  mkdirSync(join(root, '.orquestra', 'floors'), { recursive: true });

  // Cria branch ou usa existente
  try {
    await runGit(root, ['worktree', 'add', '-b', branch, targetPath]);
  } catch {
    // Se a branch já existir, tenta adicionar a worktree vinculada a ela
    await runGit(root, ['worktree', 'add', targetPath, branch]);
  }

  return { name: cleanName, path: targetPath, branch, isMain: false };
}

export async function removeFloor(
  projectDir: string,
  name: string,
  opts: { force?: boolean; keepBranch?: boolean } = {},
): Promise<void> {
  const root = resolve(projectDir);
  const targetPath = floorDirectory(root, name);
  const floors = await listFloors(root);
  const floor = floors.find((f) => f.name === name);

  const args = ['worktree', 'remove'];
  if (opts.force) args.push('--force');
  args.push(targetPath);

  await runGit(root, args);

  if (!opts.keepBranch && floor?.branch && floor.branch !== 'main' && floor.branch !== 'master') {
    try {
      await runGit(root, ['branch', '-D', floor.branch]);
    } catch {
      // Ignora se não for possível deletar a branch
    }
  }
}
