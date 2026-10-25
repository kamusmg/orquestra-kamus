import { describe, expect, it } from 'vitest';
import {
  hostEventSchema,
  hostToMainSchema,
  isHostMethod,
  mainToHostSchema,
  parseHostParams,
  parseHostResult,
  terminalNameSchema,
  noteNameSchema,
} from '../src/index.js';

describe('terminalNameSchema', () => {
  it('aceita letras com acento, números, ponto, hífen e sublinhado', () => {
    for (const name of ['revisor', 'ação-2', 'a.b_c']) expect(terminalNameSchema.safeParse(name).success).toBe(true);
  });

  it('recusa vazio, espaço e nomes longos', () => {
    for (const name of ['', 'com espaço', 'x'.repeat(41)]) expect(terminalNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('noteNameSchema', () => {
  it('aceita letras com acento, números, ponto, hífen, sublinhado e espaços', () => {
    for (const name of [
      'Quadro de Progresso - Tech Lead',
      'Regra Zero',
      'nota-1',
      'Contexto Vivo - Sessão Argon',
      'a.b_c',
    ]) {
      expect(noteNameSchema.safeParse(name).success).toBe(true);
    }
  });

  it('recusa vazio e nomes maiores que 80 caracteres', () => {
    expect(noteNameSchema.safeParse('').success).toBe(false);
    expect(noteNameSchema.safeParse('x'.repeat(81)).success).toBe(false);
  });
});

describe('métodos do núcleo', () => {
  it('valida os parâmetros de terminal.create e recusa agente desconhecido', () => {
    expect(parseHostParams('terminal.create', { name: 'A', agent: 'shell' })).toEqual({ name: 'A', agent: 'shell' });
    expect(parseHostParams('terminal.create', { name: 'A', agent: 'codex' })).toEqual({ name: 'A', agent: 'codex' });
    expect(() => parseHostParams('terminal.create', { name: 'A', agent: 'unknown' })).toThrow(expect.objectContaining({ code: 'USAGE' }));
  });

  it('valida os parâmetros de note.create e note.rename permitindo espaços no nome', () => {
    expect(
      parseHostParams('note.create', {
        name: 'Quadro de Progresso - Tech Lead',
        content: '# Teste',
      }),
    ).toEqual({
      name: 'Quadro de Progresso - Tech Lead',
      content: '# Teste',
    });

    expect(
      parseHostParams('note.rename', {
        name: 'nota-1',
        newName: 'Regra Zero - Segurança e Git',
      }),
    ).toEqual({
      name: 'nota-1',
      newName: 'Regra Zero - Segurança e Git',
    });
  });

  it('valida o resultado do retrato', () => {
    expect(parseHostResult('terminal.snapshot', { data: 'x', cols: 80, rows: 24 })).toEqual({ data: 'x', cols: 80, rows: 24 });
  });

  it('reconhece só os métodos do contrato', () => {
    expect(isHostMethod('prompt.cancel')).toBe(true);
    expect(isHostMethod('terminal.kill')).toBe(false);
  });
});

describe('mensagens', () => {
  it('valida o evento de resposta de pedido com terminais de origem e destino', () => {
    expect(hostEventSchema.parse({ type: 'ask.answered', askId: 'ask-1', from: 'S', target: 'T' })).toEqual({
      type: 'ask.answered', askId: 'ask-1', from: 'S', target: 'T',
    });
  });

  it('evento de fila com entradas', () => {
    const event = { type: 'terminal.queue', name: 'B', entries: [{ askId: 'a1', from: 'A', preview: 'oi', status: 'running', kind: 'prompt' }] };
    expect(hostEventSchema.parse(event)).toEqual(event);
  });

  it('eventos terminal.added e edge.removed', () => {
    const added = {
      type: 'terminal.added',
      info: { name: 'A', agent: 'claude', state: 'idle', queued: 0, cwd: 'C:/proj', resume: true, args: [], regente: false, monitor: true },
      rect: { x: 0, y: 0, width: 640, height: 400 },
      connectedTo: null,
    };
    expect(hostEventSchema.parse(added)).toEqual(added);

    const edgeRemoved = { type: 'edge.removed', a: 'A', b: 'B' };
    expect(hostEventSchema.parse(edgeRemoved)).toEqual(edgeRemoved);
  });

  it('evento terminal.turn aceita donos válidos e recusa desconhecido', () => {
    const event = { type: 'terminal.turn', name: 'A', owner: 'user', outcome: 'ended' };
    expect(hostEventSchema.parse(event)).toEqual(event);
    expect(hostEventSchema.safeParse({ ...event, owner: 'outro' }).success).toBe(false);
  });

  it('principal → núcleo e núcleo → principal', () => {
    expect(mainToHostSchema.parse({ kind: 'shutdown' })).toEqual({ kind: 'shutdown' });
    expect(hostToMainSchema.parse({ kind: 'response-error', id: '1', error: { code: 'NOT_FOUND', message: 'x' } }).kind).toBe('response-error');
    expect(hostToMainSchema.safeParse({ kind: 'response', id: '1', ok: false }).success).toBe(false);
  });
});
