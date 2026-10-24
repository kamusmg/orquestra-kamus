import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFloor, floorDirectory, listFloors, removeFloor } from '../src/floors.js';

describe('Git Worktrees / Floors', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'orq-floor-test-'));
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd: repoDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'ignore' });
    execSync('git commit --allow-empty -m "init"', { cwd: repoDir, stdio: 'ignore' });
  });

  afterEach(() => {
    try {
      rmSync(repoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on windows locks
    }
  });

  it('lista piso principal e cria novo piso isolado em worktree', async () => {
    const initial = await listFloors(repoDir);
    expect(initial.some((f) => f.isMain)).toBe(true);

    const floor = await createFloor(repoDir, 'experimento-1', { branch: 'feat/exp-1' });
    expect(floor.name).toBe('experimento-1');
    expect(floor.branch).toBe('feat/exp-1');
    expect(floor.path).toBe(floorDirectory(repoDir, 'experimento-1'));

    const list = await listFloors(repoDir);
    expect(list.some((f) => f.name === 'experimento-1')).toBe(true);

    await removeFloor(repoDir, 'experimento-1', { force: true });
    const after = await listFloors(repoDir);
    expect(after.some((f) => f.name === 'experimento-1')).toBe(false);
  });
});
