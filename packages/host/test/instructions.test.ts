import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CEREBRO_TOKEN_ECONOMY_HEADER,
  getCerebroInstruction,
  injectCerebroDirectives,
  resolveSessionGuide,
} from '../src/instructions.js';
import { loadHostEnv } from '../src/index.js';

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
