import type { ScoreDefinition, ScoreNodeNote } from './types';

export type NoteClassification = 'operational-progress' | 'operational-context' | 'fixed-guideline' | 'general';

/**
 * Normaliza nomes de nós para matching tolerante a acentos, travessões (em-dash), hifens e espaços.
 */
export function normalizeScoreNodeName(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[-_\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Classifica a nota entre operacional (que requer template limpo para novos projetos)
 * e diretrizes fixas (cujo catálogo de regras e invariants deve ser mantido intacto).
 */
export function classifyScoreNote(name: string): NoteClassification {
  const normalized = normalizeScoreNodeName(name);

  // 1. Diretrizes fixas: preservam catálogo integral de regras
  if (
    normalized.includes('regra zero') ||
    normalized.includes('protocolo') ||
    normalized.includes('nanobanana') ||
    normalized.includes('diretriz') ||
    normalized.includes('guideline') ||
    normalized.includes('invariante')
  ) {
    return 'fixed-guideline';
  }

  // 2. Quadro de Progresso operacional: requer template limpo sem commits/bugs do projeto antigo
  if (
    normalized.includes('progresso') ||
    normalized.includes('quadro') ||
    normalized.includes('relatorio ao vivo') ||
    normalized.includes('nota 1') ||
    normalized.includes('nota-1') ||
    normalized.includes('status')
  ) {
    return 'operational-progress';
  }

  // 3. Contexto Vivo operacional: requer template limpo para o novo projeto
  if (
    normalized.includes('contexto') ||
    normalized.includes('memoria') ||
    normalized.includes('live context')
  ) {
    return 'operational-context';
  }

  return 'general';
}

export function isOperationalNote(name: string): boolean {
  const classification = classifyScoreNote(name);
  return classification === 'operational-progress' || classification === 'operational-context';
}

export function getCleanProgressBoardTemplate(projectName?: string): string {
  const projectTitle = projectName ? ` — ${projectName}` : '';
  return `# 📋 Quadro de Progresso${projectTitle}
**Status:** 🚀 Projeto inicializado via Partitura
**Última Atualização:** ${new Date().toISOString().replace('T', ' ').slice(0, 16)}

---

## 🔄 Em Execução Agora (Topo Ao Vivo)
- [ ] **Setup Inicial & Alinhamento**:
  - Validar estrutura do projeto, dependências e ambiente de execução.

---

## 🎯 Metas & Próximas Entregas
- [ ] Definir escopo e arquitetura base
- [ ] Implementar fluxo principal da funcionalidade
- [ ] Executar testes de homologação e validação de segurança

---

## 🐛 Bloqueios & Riscos Conhecidos
- Nenhum bloqueio ativo no momento.

---

## ✅ Concluído (Histórico com Check)
- [x] Partitura aplicada e ambiente inicializado no canvas
`;
}

export function getCleanLiveContextTemplate(projectName?: string): string {
  const projectTitle = projectName || 'Novo Projeto';
  return `# 🧠 Contexto Vivo — ${projectTitle}

## 📌 Visão Geral & Propósito
- **Projeto:** ${projectTitle}
- **Objetivo:** [Descreva o propósito central deste projeto / squad]
- **Tech Stack:** [TS / Node / Go / Rust / Python / etc.]

---

## 🗺️ Mapa de Diretórios & Componentes Chave
- \`src/\` — Código-fonte principal
- \`tests/\` — Testes automatizados e suites de homologação
- \`docs/\` — Documentação e diagramas de arquitetura

---

## ⚡ Decisões Técnicas & Padrões Adotados
- **Type-Safety:** Tipagem estrita de ponta a ponta sem \`any\`
- **Observabilidade:** Logs estruturados e tratamento centralizado de erros
- **Resiliência:** Timeouts explícitos em chamadas externas e tratamento defensivo

---

## 🔗 Dependências Externas & Serviços
- [Documentar APIs externas, bancos de dados ou serviços integrados]
`;
}

export function getCleanNoteContent(name: string, originalContent = '', projectName?: string): string {
  const classification = classifyScoreNote(name);
  if (classification === 'operational-progress') {
    return getCleanProgressBoardTemplate(projectName);
  }
  if (classification === 'operational-context') {
    return getCleanLiveContextTemplate(projectName);
  }
  return originalContent;
}

/**
 * Prepara as notas de uma partitura para aplicação em um novo projeto.
 * - Notas operacionais (Quadro de Progresso, Contexto Vivo) recebem estrutura limpa de template.
 * - Diretrizes fixas (Regra Zero, Protocolo NanoBanana) mantêm o catálogo de regras intacto.
 */
export function prepareScoreNotesForApplication(
  notes: ScoreNodeNote[],
  options: { cleanOperationalNotes?: boolean; projectName?: string } = {},
): ScoreNodeNote[] {
  const shouldClean = options.cleanOperationalNotes ?? true;
  if (!shouldClean) return notes;

  return notes.map((note) => {
    const classification = classifyScoreNote(note.name);
    if (classification === 'operational-progress' || classification === 'operational-context') {
      return {
        ...note,
        content: getCleanNoteContent(note.name, note.content, options.projectName),
      };
    }
    return note;
  });
}

/**
 * Retorna uma versão sanitizada da partitura inteira com notas limpas prontas para novo projeto.
 */
export function sanitizeScoreForNewProject(
  score: ScoreDefinition,
  options: { cleanOperationalNotes?: boolean; projectName?: string } = {},
): ScoreDefinition {
  return {
    ...score,
    nodes: {
      ...score.nodes,
      notes: prepareScoreNotesForApplication(score.nodes.notes, options),
    },
  };
}
