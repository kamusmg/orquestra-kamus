import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/log.js';
import { buildDefaultGlobalPersonas, PersonaStore } from '../src/personas.js';

const file = () => join(mkdtempSync(join(tmpdir(), 'orq-personas-')), 'personas.json');

describe('PersonaStore', () => {
  it('sem arquivo, lista vazia; write cria e substitui; remove apaga', () => {
    const path = file();
    const store = new PersonaStore({ file: path, log: silentLogger() });
    expect(store.list()).toEqual([]);
    expect(store.write({ name: 'revisor', text: 'a' })).toEqual({ created: true });
    expect(store.write({ name: 'revisor', text: 'b' })).toEqual({ created: false });
    expect(new PersonaStore({ file: path, log: silentLogger() }).get('revisor')).toEqual({ name: 'revisor', text: 'b' });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual([{ name: 'revisor', text: 'b' }]);
    expect(store.remove('revisor')).toBe(true);
    expect(store.remove('revisor')).toBe(false);
  });

  it('arquivo inválido vale lista vazia', () => {
    const path = file();
    writeFileSync(path, '[{"name": "com espaço", "text": "x"}]');
    expect(new PersonaStore({ file: path, log: silentLogger() }).list()).toEqual([]);
  });

  it('inicializa personas padrão com persona neutra regra-zero', () => {
    const personas = buildDefaultGlobalPersonas();
    const regraZero = personas.find((p) => p.name === 'regra-zero');
    expect(regraZero).toBeDefined();
    expect(regraZero?.text).toContain('REGRA ZERO');

    const path = file();
    const store = new PersonaStore({ file: path, log: silentLogger(), defaults: true });
    expect(store.get('regra-zero')).toBeDefined();
  });
});
