import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { personaSchema, type Persona } from '@orquestra/shared';
import type { Logger } from './log.js';

const personasFileSchema = z.array(personaSchema);

export const DEFAULT_GLOBAL_PERSONAS: Persona[] = [
  {
    name: 'kamus-security',
    text: `REGRA ZERO: Segurança Absoluta com Git e Chaves de API.
1. NUNCA usar 'git add .' ou 'git add -A'. Adicionar apenas os arquivos explicitamente modificados um a um.
2. Inspecionar o diff ('git diff') antes de qualquer commit para certificar 100% de que nenhuma chave, token, senha ou arquivo de ambiente (.env) está sendo incluído.
3. Manter mensagens de commit no padrão conventional commits (feat|fix|chore|refactor|docs|test|perf|ci) sem menção a ferramentas de IA.
4. Redução de carga cognitiva: código lê como um jornal, funções puras para regra de negócio, early return, sem erros engolidos e tipos fortes sempre.`
  },
  {
    name: 'revisor',
    text: `Você é um Revisor de Código Sênior focado em SOLID, CUPID, Defensive Programming e Type-Safety.
Analise código buscando:
1. Redução de carga cognitiva e clareza.
2. Tratamento defensivo de erros (sem engolir exceções).
3. Testabilidade e imutabilidade por padrão.
4. Aderência estrita à Regra Zero de Git.`
  },
  {
    name: 'implementador',
    text: `Você é um Engenheiro de Software focado em implementação de alta fidelidade e e2e type-safety.
1. Escreva código com early return e guard clauses.
2. Mantenha funções pequenas e com apenas um nível de abstração.
3. Nunca use 'any' em TypeScript. Valide nas boundaries (Zod/schemas).
4. Adicione testes automatizados para novos fluxos.`
  }
];

export class PersonaStore {
  constructor(private readonly opts: { file: string; log: Logger; defaults?: boolean }) {
    if (this.opts.defaults && !existsSync(this.opts.file)) {
      try {
        mkdirSync(dirname(this.opts.file), { recursive: true });
        writeFileSync(this.opts.file, `${JSON.stringify(DEFAULT_GLOBAL_PERSONAS, null, 2)}\n`);
      } catch (error) {
        this.opts.log.warn({ err: error, file: this.opts.file }, 'falha ao inicializar personas padrão');
      }
    }
  }

  list(): Persona[] {
    if (!existsSync(this.opts.file)) return [];
    try {
      return personasFileSchema.parse(JSON.parse(readFileSync(this.opts.file, 'utf8')));
    } catch (error) {
      this.opts.log.warn({ err: error, file: this.opts.file }, 'funções globais inválidas; usando vazias');
      return [];
    }
  }

  get(name: string): Persona | undefined {
    return this.list().find((persona) => persona.name === name);
  }

  write(persona: Persona): { created: boolean } {
    const valid = personaSchema.parse(persona);
    const personas = this.list();
    const index = personas.findIndex((entry) => entry.name === valid.name);
    const created = index < 0;
    if (created) personas.push(valid);
    else personas[index] = valid;

    mkdirSync(dirname(this.opts.file), { recursive: true });
    const temporary = `${this.opts.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(personas, null, 2)}\n`);
    renameSync(temporary, this.opts.file);
    return { created };
  }

  remove(name: string): boolean {
    const personas = this.list();
    const filtered = personas.filter((entry) => entry.name !== name);
    if (filtered.length === personas.length) return false;

    mkdirSync(dirname(this.opts.file), { recursive: true });
    const temporary = `${this.opts.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(filtered, null, 2)}\n`);
    renameSync(temporary, this.opts.file);
    return true;
  }
}
