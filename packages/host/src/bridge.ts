import { randomUUID } from 'node:crypto';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  isHostMethod,
  OrqError,
  parseHostParams,
  personaBrief,
  regentGuide,
  GROUP_HEADER,
  GROUP_PADDING,
  flowCanvasId,
  type HostAgent,
  type GroupElement,
  type GroupLayout,
  type HostMethod,
  type HostParams,
  type HostResult,
  type HostToMain,
  type MainToHost,
  type MethodName,
  type NoteInfo,
  type Params,
  type Persona,
  type PersonaScope,
  type ProjectSnapshot,
  type Result,
  type TerminalInfo,
  type Workspace,
  type HostCommand,
  type ModelEntry,
  type ModelListResult,
} from '@orquestra/shared';
import { getCerebroInstruction, resolveSessionGuide } from './instructions.js';
import {
  createOrquestra,
  readCodexUsage,
  readClaudeUsage,
  type SubscriptionUsage,
  ProjectFiles,
  agyStopHookCommand,
  ensureAgyGlobalHook,
  loadWorkspace,
  PersonaStore,
  ScoreStore,
  RecentProjects,
  floorDirectory,
  saveWorkspace,
  SettingsStore,
  WorkspaceSaver,
  resolveExecutable,
  type AgentAdapter,
  type Logger,
  type Note,
  type Orquestra,
  type PtyHost,
  type RegentHandler,
  type RegentMethod,
  type Session,
} from '@orquestra/core';
import { OutputBatcher } from './output-batcher.js';
import { NOTE_SIZE, placeBeside, TERMINAL_SIZE } from './placement.js';
import { WorkspaceState } from './workspace-state.js';
import { readAgyUsageIsolated } from './usage-worker.js';
import { FlowEngine } from './flow-engine.js';
import { FlowWorkerPool } from './flow-workers.js';
import { browserMethodSchemas, type BrowserHandler, type BrowserMethod } from '@orquestra/shared';

export type HostBridgeOptions = {
  send: (message: HostToMain) => void;
  adapters: Record<string, AgentAdapter>;
  cliScript: string;
  pipePath: string;
  dataDir: string;
  log: Logger;
  ptyHost?: PtyHost;
  readyQuietMs?: number;
  agyHooksFile?: string;
  outputIntervalMs?: number;
  /** Onde gravar os PIDs dos agentes vivos (AGENT_PID_FILE na pasta de dados). */
  agentPidFile?: string;
  onPids?: (pids: number[]) => void;
  usageState?: UsageState;
  eventSequence?: () => number;
  flowWorkers?: FlowWorkerPool;
  /** Lista de projetos recentes (recent.json na pasta de dados). */
  recentFile: string;
  /** Padrões dos agentes (settings.json na pasta de dados). */
  settingsFile: string;
  /** Funções globais dos agentes (personas.json na pasta de dados). */
  personasFile: string;
  /** Inicializa personas padrão de segurança e revisão se o arquivo não existir. */
  defaultPersonas?: boolean;
  /** Espera depois da última mudança antes de gravar o workspace (padrão 1 s). */
  saveDelayMs?: number;
  /** Pasta de configuração do Claude Code, onde ficam os jobs em segundo plano (padrão: CLAUDE_CONFIG_DIR ou ~/.claude). */
  claudeDir?: string;
  /** Lista os named pipes do sistema; o daemon abre um por conversa viva. Injetável nos testes. */
  listPipes?: () => string[];
  /** Intervalo da verificação dos jobs em segundo plano (padrão 5 s). */
  backgroundJobPollMs?: number;
};

export type HostBridge = {
  handle(message: Exclude<MainToHost, { kind: 'shutdown' }> | HostCommand | string): Promise<unknown>;
  dispatchForTest(method: MethodName, params: unknown, caller: { session: string }): Promise<unknown>;
  close(): Promise<void>;
  cancelWork?(): Promise<void>;
  unloadIdleTerminals?(): Promise<string[]>;
};

type OpenProject = { dir: string; name: string; state: WorkspaceState; saver: WorkspaceSaver; flow?: FlowEngine };

type BridgeMethod = Exclude<HostMethod, 'workspace.list' | 'workspace.activate'>;
type Handlers = { [M in BridgeMethod]: (params: HostParams<M>) => Promise<HostResult<M>> };

export type UsageState = {
  cache: Map<string, { expiresAt: number; value: SubscriptionUsage }>;
  pending: Map<string, Promise<SubscriptionUsage>>;
  failures: Map<string, { retryAt: number; message: string }>;
};

const execFileAsync = promisify(execFile);

const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedModels: ModelListResult | null = null;
let lastModelFetch = 0;

export const FALLBACK_AGY_MODELS: ModelEntry[] = [
  { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)', agent: 'agy' },
  { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)', agent: 'agy' },
  { id: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)', agent: 'agy' },
  { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)', agent: 'agy' },
  { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)', agent: 'agy' },
  { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)', agent: 'agy' },
  { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)', agent: 'agy' },
  { id: 'claude-opus-5-5-medium', label: 'Claude Opus 5.5 (Medium)', agent: 'agy' },
  { id: 'claude-opus-5-5-low', label: 'Claude Opus 5.5 (Low)', agent: 'agy' },
  { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)', agent: 'agy' },
  { id: 'claude-sonnet-5-5-medium', label: 'Claude Sonnet 5.5 (Medium)', agent: 'agy' },
  { id: 'claude-sonnet-5-5-low', label: 'Claude Sonnet 5.5 (Low)', agent: 'agy' },
  { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)', agent: 'agy' },
];

export const CLAUDE_NATIVE_MODELS: ModelEntry[] = [
  { id: 'opus', label: 'Claude Opus ( Sempre o mais recente )', agent: 'claude' },
  { id: 'sonnet', label: 'Claude Sonnet ( Sempre o mais recente )', agent: 'claude' },
];

export function extractModelVersion(id: string): number {
  const dotMatch = id.match(/(\d+(?:\.\d+)?)/);
  if (dotMatch && dotMatch[1]) {
    const dashMatch = id.match(/(\d+)-(\d+)/);
    if (dashMatch && dashMatch[1] && dashMatch[2] && !id.includes('.')) {
      return parseFloat(`${dashMatch[1]}.${dashMatch[2]}`);
    }
    return parseFloat(dotMatch[1]);
  }
  return 0;
}

export async function discoverModels(refresh = false): Promise<ModelListResult> {
  if (!refresh && cachedModels && Date.now() - lastModelFetch < MODEL_CACHE_TTL_MS) {
    return cachedModels;
  }

  let agyModels: ModelEntry[] = [];
  // Assim como em SubscriptionUsage, invocar `agy` fora do ConPTY aciona o auto-updater interno dele,
  // que pisca uma janela de console de 1s no Windows (roubando foco de jogos em tela cheia).
  // Só executamos `agy models` se refresh=true e ORQ_ALLOW_LIVE_AGY_MODELS=1 estiverem ativos.
  if (refresh && process.env.ORQ_ALLOW_LIVE_AGY_MODELS === '1') {
    try {
      const resolved = resolveExecutable('agy');
      const { stdout } = await execFileAsync(resolved.file, [...resolved.argsPrefix, 'models'], {
        timeout: 8000,
        windowsHide: true,
        encoding: 'utf8',
      });
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('Fetching')) continue;
        const tabIndex = trimmed.indexOf('\t');
        if (tabIndex !== -1) {
          const id = trimmed.slice(0, tabIndex).trim();
          const label = trimmed.slice(tabIndex + 1).trim();
          if (id && label) {
            agyModels.push({ id, label, agent: 'agy' });
          }
        }
      }
    } catch {
      agyModels = [];
    }
  }

  if (agyModels.length === 0) {
    agyModels = [...FALLBACK_AGY_MODELS];
  }

  const allModels: ModelEntry[] = [...agyModels, ...CLAUDE_NATIVE_MODELS];

  const flashWithHigh = agyModels.filter((m) => {
    const lower = m.id.toLowerCase();
    return lower.includes('flash') && lower.includes('high');
  });
  const flashCandidates = flashWithHigh.length > 0
    ? flashWithHigh
    : agyModels.filter((m) => m.id.toLowerCase().includes('flash'));

  flashCandidates.sort((a, b) => extractModelVersion(b.id) - extractModelVersion(a.id));
  const recommendedFlash = flashCandidates[0]?.id ?? null;

  const leadGoogleHigh = agyModels.filter((m) => {
    const lower = m.id.toLowerCase();
    return (
      lower.includes('argon-high') ||
      lower.includes('pro-high') ||
      (lower.startsWith('gemini') && lower.includes('high') && !lower.includes('flash'))
    );
  });
  const leadCandidates = leadGoogleHigh.length > 0
    ? leadGoogleHigh
    : agyModels.filter((m) => {
        const lower = m.id.toLowerCase();
        return lower.includes('argon') || lower.includes('pro') || (lower.includes('high') && !lower.includes('flash'));
      });

  leadCandidates.sort((a, b) => extractModelVersion(b.id) - extractModelVersion(a.id));
  const recommendedLead = leadCandidates[0]?.id ?? null;

  cachedModels = {
    models: allModels,
    recommendedFlash,
    recommendedLead,
  };
  lastModelFetch = Date.now();
  return cachedModels;
}

export function resolveAutoModelArgs(
  args: string[] | undefined,
  flashModel: string,
  leadModel: string,
): string[] | undefined {
  if (!args) return undefined;
  const result = [...args];
  for (let i = 0; i < result.length; i++) {
    const current = result[i];
    if (current === '--model' && i + 1 < result.length) {
      const next = result[i + 1]?.toLowerCase();
      if (next === 'auto-flash' || next === 'latest-flash') {
        result[i + 1] = flashModel;
      } else if (next === 'auto-lead' || next === 'latest-lead') {
        result[i + 1] = leadModel;
      }
    } else if (current && current.startsWith('--model=')) {
      const val = current.slice('--model='.length).toLowerCase();
      if (val === 'auto-flash' || val === 'latest-flash') {
        result[i] = `--model=${flashModel}`;
      } else if (val === 'auto-lead' || val === 'latest-lead') {
        result[i] = `--model=${leadModel}`;
      }
    }
  }
  return result;
}

export async function startHostBridge(opts: HostBridgeOptions): Promise<HostBridge> {
  let orquestra: Orquestra;
  const orq = (): Orquestra => {
    if (!orquestra) throw new OrqError('APP_UNAVAILABLE', 'Núcleo não inicializado.');
    return orquestra;
  };
  let project: OpenProject | null = null;
  let fileExplorer: { dir: string; files: ProjectFiles } | null = null;
  const batcher = new OutputBatcher(
    (name, data) => opts.send({ kind: 'event', event: { type: 'terminal.output', name, data } }),
    opts.outputIntervalMs,
  );
  const recent = new RecentProjects({ file: opts.recentFile, log: opts.log });
  const settings = new SettingsStore({ file: opts.settingsFile, log: opts.log });
  const personaStore = new PersonaStore({ file: opts.personasFile, log: opts.log, defaults: opts.defaultPersonas });
  const scoreStore = new ScoreStore({ globalDir: join(opts.dataDir, 'scores'), log: opts.log });
  const usageCache = opts.usageState?.cache ?? new Map<string, { expiresAt: number; value: SubscriptionUsage }>();
  const usageAbort = new AbortController();
  const usagePids = new Set<number>();
  let flowPids: number[] = [];
  const flowWorkers = opts.flowWorkers ?? new FlowWorkerPool({ onPids: (pids) => { flowPids = pids; if (orquestra) recordPids(); } });
  const usagePending = opts.usageState?.pending ?? new Map<string, Promise<SubscriptionUsage>>();
  const usageFailures = opts.usageState?.failures ?? new Map<string, { retryAt: number; message: string }>();
  async function consultUsage(provider: string, read: () => Promise<SubscriptionUsage>): Promise<SubscriptionUsage> {
    const cached = usageCache.get(provider);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const failure = usageFailures.get(provider);
    if (failure && failure.retryAt > Date.now()) throw new OrqError('APP_UNAVAILABLE', failure.message);
    const pending = usagePending.get(provider);
    if (pending) return pending;
    const reading = (async () => {
      try {
        const value = await read();
        usageCache.set(provider, { expiresAt: Date.now() + (provider === 'claude' ? 300000 : 60000), value });
        usageFailures.delete(provider);
        return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Consulta de uso indisponível.';
        usageFailures.set(provider, { retryAt: Date.now() + 60000, message });
        throw new OrqError('APP_UNAVAILABLE', message);
      } finally { usagePending.delete(provider); }
    })();
    usagePending.set(provider, reading);
    return reading;
  }

  const capture = (current: OpenProject) =>
    current.state.capture({ terminals: orquestra.describeTerminals(), notes: orquestra.notes.list(), connections: orquestra.topology.edges() });
  const changed = () => project?.saver.schedule();

  const noteInfo = (note: Note): NoteInfo => ({ id: note.id, name: note.name, content: note.content, revision: note.revision, updatedBy: note.updatedBy });

  /** Nota do orq: quando nasce, fica à direita do autor, no primeiro espaço livre, já conectada a ele. */
  function onAgentNote(note: Note, createdBy: string | null, renamedFrom?: string): void {
    if (renamedFrom) {
      opts.send({ kind: 'event', event: { type: 'note.changed', note: noteInfo(note), connectedTo: null, rect: null, renamedFrom } });
      return;
    }
    let rect = null;
    if (createdBy && project) {
      const author = project.state.rectOf(createdBy) ?? { x: 80, y: 80, ...TERMINAL_SIZE };
      rect = { ...placeBeside(author, Object.values(project.state.layout()), NOTE_SIZE), ...NOTE_SIZE };
      project.state.place(note.name, rect);
    }
    changed();
    opts.send({ kind: 'event', event: { type: 'note.changed', note: noteInfo(note), connectedTo: createdBy, rect } });
  }

  function recordPids(): void {
    const pids = [...orquestra.sessions().filter((session) => session.pid > 0 && session.state !== 'exited').map((session) => session.pid), ...usagePids, ...flowPids];
    opts.onPids?.(pids);
    if (!opts.agentPidFile) return;
    try {
      writeFileSync(opts.agentPidFile, JSON.stringify(pids));
    } catch (error) {
      opts.log.warn({ err: error, file: opts.agentPidFile }, 'não foi possível gravar os PIDs dos agentes');
    }
  }
  const confirms = new Map<string, (approved: boolean) => void>();
  const portalCalls = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  const browser: BrowserHandler = (method, params, signal) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new OrqError('APP_UNAVAILABLE', 'Operação cancelada.'));
    const id = randomUUID();
    const finish = () => { portalCalls.delete(id); clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { opts.send({ kind: 'portal-cancel', id }); finish(); reject(new OrqError('APP_UNAVAILABLE', 'Operação cancelada.')); };
    const timer = setTimeout(() => { opts.send({ kind: 'portal-cancel', id }); finish(); reject(new OrqError('APP_UNAVAILABLE', 'O navegador não respondeu em 20 segundos.')); }, 20000);
    portalCalls.set(id, { resolve: (value) => { finish(); try { resolve(browserMethodSchemas[method].result.parse(value) as never); } catch { reject(new OrqError('INTERNAL', 'Resposta inválida do navegador.')); } }, reject: (error) => { finish(); reject(error); } });
    signal.addEventListener('abort', abort, { once: true });
    opts.send({ kind: 'portal-call', id, method, params });
  });

  const requestConfirm = (message: string) =>
    new Promise<boolean>((resolve) => {
      const id = randomUUID();
      confirms.set(id, resolve);
      opts.send({ kind: 'confirm', id, message });
    });

  const info = (session: Session): TerminalInfo => {
    const descriptor = orquestra.describeTerminals().find((terminal) => terminal.name === session.name);
    return {
      id: session.id,
      name: session.name,
      agent: session.adapter.kind,
      state: session.state,
      queued: orquestra.broker.queued(session.name),
      cwd: session.cwd,
      resume: descriptor?.resume ?? true,
      args: descriptor?.args ?? [],
      regente: descriptor?.regente ?? false,
      persona: descriptor?.persona ?? null,
      monitor: descriptor?.monitor ?? false,
      ...(descriptor?.unloaded ? { unloaded: true } : {}),
      ...project?.state.presentation(session.name),
    };
  };

  const requireProject = (): OpenProject => {
    if (!project) throw new OrqError('USAGE', 'Nenhum projeto aberto. Abra uma pasta de projeto primeiro.');
    return project;
  };

  const requireSession = (name: string) => {
    const session = orquestra.session(name);
    if (!session) throw new OrqError('NOT_FOUND', `Terminal ${name} não existe.`);
    return session;
  };

  function resolvePersona(name: string): Persona {
    const fromProject = project?.state.personas().find((p) => p.name === name);
    if (fromProject) return fromProject;
    const fromGlobal = personaStore.get(name);
    if (fromGlobal) return fromGlobal;
    throw new OrqError('NOT_FOUND', `A função ${name} não existe. Veja as disponíveis com orq persona list.`);
  }

  async function createTerminalFor(input: {
    id?: string;
    name: string;
    agent: HostAgent;
    cwd?: string;
    resume?: boolean;
    args?: string[];
    regente?: boolean;
    persona?: string;
    monitor?: boolean;
  }): Promise<Session> {
    const current = requireProject();
    if (input.agent === 'agy') {
      const result = await ensureAgyGlobalHook({
        command: agyStopHookCommand(opts.cliScript),
        confirm: requestConfirm,
        ...(opts.agyHooksFile ? { hooksFile: opts.agyHooksFile } : {}),
      });
      if (result === 'declined') {
        throw new OrqError('USAGE', 'Sem o hook global, o Orquestra não sabe quando o agy termina. O terminal não foi criado.');
      }
    }
    const session = orquestra.createTerminal({
      id: input.id,
      name: input.name,
      agent: input.agent,
      cwd: input.cwd ?? current.dir,
      resume: input.resume,
      args: input.args,
      regente: input.regente,
      persona: input.persona,
      monitor: input.monitor,
    });
    recordPids();
    changed();
    syncFlowAgents();
    return session;
  }

  type RegentHandlers = { [M in RegentMethod]: (params: Params<M>, caller: string) => Promise<Result<M>> };

  const regentHandlers: RegentHandlers = {
    'regent.new': async (params, caller) => {
      const current = requireProject();
      if (params.agent === 'shell' && params.persona) {
        throw new OrqError('USAGE', 'O shell não recebe funções.');
      }
      const resolvedPersona = params.persona ? resolvePersona(params.persona) : undefined;
      const authorRect = current.state.rectOf(caller) ?? { x: 80, y: 80, ...TERMINAL_SIZE };
      const rect = { ...placeBeside(authorRect, Object.values(current.state.layout()), TERMINAL_SIZE), ...TERMINAL_SIZE };
      const effectiveCwd = params.floor ? floorDirectory(current.dir, params.floor) : params.cwd;
      const { recommendedFlash, recommendedLead } = await discoverModels();
      const effectiveFlash = recommendedFlash ?? 'gemini-3.8-flash-high';
      const effectiveLead = recommendedLead ?? 'gemini-4-argon-high';
      const resolvedArgs = resolveAutoModelArgs(params.args, effectiveFlash, effectiveLead);
      const session = await createTerminalFor({
        name: params.name,
        agent: params.agent,
        cwd: effectiveCwd,
        resume: params.resume,
        args: resolvedArgs,
        regente: false,
        persona: params.persona,
      });
      current.state.place(params.name, rect);
      orquestra.connect(caller, params.name);
      if (session.adapter.acceptsPrompts) {
        if (resolvedPersona) {
          orquestra.brief(session.name, caller, resolveSessionGuide({ persona: resolvedPersona, regente: false })!);
        } else if (['agy', 'claude', 'codex'].includes(params.agent)) {
          const cerebroGuide = getCerebroInstruction();
          if (cerebroGuide) orquestra.brief(session.name, caller, cerebroGuide);
        }
      }
      opts.send({
        kind: 'event',
        event: {
          type: 'terminal.added',
          info: info(session),
          rect,
          connectedTo: caller,
        },
      });
      opts.send({ kind: 'event', event: { type: 'notice', level: 'info', message: `${caller} criou ${params.name}.` } });
      return { name: session.name };
    },
    'regent.remove': async (params, caller) => {
      if (caller === params.name) {
        throw new OrqError('USAGE', 'Um regente não pode remover a si mesmo. Peça ao usuário ou use a interface.');
      }
      const kind = orquestra.topology.kindOf(params.name);
      if (!kind) throw new OrqError('NOT_FOUND', `Terminal ou nota ${params.name} não existe.`);
      if (kind === 'terminal') {
        await orquestra.removeTerminal(params.name, { reason: `removido por ${caller}` });
      } else {
        orquestra.removeNote(params.name);
        project?.state.forget(params.name);
        changed();
        opts.send({ kind: 'event', event: { type: 'note.removed', name: params.name } });
      }
      opts.send({ kind: 'event', event: { type: 'notice', level: 'info', message: `${caller} removeu ${params.name}.` } });
      return {};
    },
    'regent.link': async (params) => {
      orquestra.connect(params.a, params.b);
      changed();
      opts.send({ kind: 'event', event: { type: 'edge.added', a: params.a, b: params.b } });
      return {};
    },
    'regent.unlink': async (params) => {
      orquestra.disconnect(params.a, params.b);
      changed();
      opts.send({ kind: 'event', event: { type: 'edge.removed', a: params.a, b: params.b } });
      return {};
    },
    'regent.brief': async (params, caller) => {
      const targetDesc = orquestra.describeTerminals().find((t) => t.name === params.target);
      if (!targetDesc) throw new OrqError('NOT_FOUND', `Terminal ${params.target} não existe.`);
      const persona = resolvePersona(params.persona);
      const session = await orquestra.updateTerminal(params.target, { persona: params.persona });
      const guide = resolveSessionGuide({ persona, regente: targetDesc.regente });
      if (guide) orquestra.brief(params.target, caller, guide);
      changed();
      const rect = project?.state.rectOf(params.target) ?? { x: 80, y: 80, ...TERMINAL_SIZE };
      opts.send({ kind: 'event', event: { type: 'terminal.added', info: info(session), rect, connectedTo: null } });
      return {};
    },
    'persona.list': async () => {
      const projectPersonas = project?.state.personas() ?? [];
      const globalPersonas = personaStore.list();
      const seen = new Set<string>();
      const personas: Array<{ name: string; scope: PersonaScope }> = [];
      for (const p of projectPersonas) {
        seen.add(p.name);
        personas.push({ name: p.name, scope: 'project' });
      }
      for (const p of globalPersonas) {
        if (!seen.has(p.name)) {
          seen.add(p.name);
          personas.push({ name: p.name, scope: 'global' });
        }
      }
      return { personas };
    },
    'persona.show': async (params) => {
      const projectPersona = project?.state.personas().find((p) => p.name === params.name);
      if (projectPersona) return { name: projectPersona.name, scope: 'project', text: projectPersona.text };
      const globalPersona = personaStore.get(params.name);
      if (globalPersona) return { name: globalPersona.name, scope: 'global', text: globalPersona.text };
      throw new OrqError('NOT_FOUND', `A função ${params.name} não existe. Veja as disponíveis com orq persona list.`);
    },
    'persona.write': async (params) => {
      if (params.global) {
        const { created } = personaStore.write({ name: params.name, text: params.text });
        return { name: params.name, scope: 'global', created };
      }
      const current = requireProject();
      const { created } = current.state.writePersona({ name: params.name, text: params.text });
      changed();
      return { name: params.name, scope: 'project', created };
    },
    'persona.remove': async (params) => {
      if (params.global) {
        const removed = personaStore.remove(params.name);
        if (!removed) throw new OrqError('NOT_FOUND', `A função global ${params.name} não existe.`);
        return {};
      }
      const current = requireProject();
      const removed = current.state.removePersona(params.name);
      if (!removed) throw new OrqError('NOT_FOUND', `A função ${params.name} do projeto não existe.`);
      changed();
      return {};
    },
  };

  const regent: RegentHandler = async (method, params, caller) => {
    opts.log.info({ regente: caller, method, params }, 'comando de regente');
    return (regentHandlers[method] as (p: unknown, c: string) => Promise<never>)(params, caller);
  };

  const adaptersWithCerebro: Record<string, AgentAdapter> = Object.fromEntries(
    Object.entries(opts.adapters).map(([kind, adapter]) => [
      kind,
      {
        ...adapter,
        launch: (ctx) => {
          const spec = adapter.launch(ctx);
          if (process.env.ORQ_CEREBRO_PATH) {
            spec.env = { ...spec.env, ORQ_CEREBRO_PATH: process.env.ORQ_CEREBRO_PATH };
          }
          return spec;
        },
      },
    ]),
  );

  orquestra = await createOrquestra({
    pipePath: opts.pipePath,
    dataDir: opts.dataDir,
    cliScript: opts.cliScript,
    adapters: adaptersWithCerebro,
    log: opts.log,
    ptyHost: opts.ptyHost,
    readyQuietMs: opts.readyQuietMs,
    claudeDir: opts.claudeDir,
    listPipes: opts.listPipes,
    backgroundJobPollMs: opts.backgroundJobPollMs,
    regent,
    browser,
    browserNodes: () => project?.state.browserNodes() ?? [],
    onEvent: (event) => {
      if (event.type === 'output') return batcher.push(event.name, event.data);
      if (event.type === 'state') {
        if (orquestra && event.state === 'exited') recordPids();
        return opts.send({ kind: 'event', event: { type: 'terminal.state', name: event.name, state: event.state, queued: event.queued } });
      }
      if (event.type === 'queue') return opts.send({ kind: 'event', event: { type: 'terminal.queue', name: event.name, entries: event.entries } });
      if (event.type === 'answered') return opts.send({ kind: 'event', event: { type: 'ask.answered', askId: event.askId, from: event.asker, target: event.target } });
      if (event.type === 'notice') return opts.send({ kind: 'event', event: { type: 'terminal.notice', name: event.name, message: event.message } });
      if (event.type === 'agent-session') return changed();
      if (event.type === 'note') return onAgentNote(event.note, event.createdBy, event.renamedFrom);
      if (event.type === 'removed') {
        batcher.drop(event.name);
        recordPids();
        project?.state.forget(event.name);
        changed();
        syncFlowAgents();
        return opts.send({ kind: 'event', event: { type: 'terminal.removed', name: event.name } });
      }
      if (event.type === 'turn') {
        return opts.send({ kind: 'event', event: { type: 'terminal.turn', name: event.name, owner: event.owner, outcome: event.outcome } });
      }
      const unexpected: never = event;
      opts.log.warn({ event: unexpected }, 'evento do núcleo desconhecido; ignorado');
    },
  });

  const snapshot = (current: OpenProject): ProjectSnapshot => ({
    ...(opts.eventSequence ? { eventSequence: opts.eventSequence() } : {}),
    dir: current.dir,
    name: current.name,
    terminals: orquestra.sessions().map(info),
    notes: orquestra.notes.list().map(noteInfo),
    edges: orquestra.topology.edges(),
    layout: current.state.layout(),
    viewport: current.state.viewport(),
    queues: Object.fromEntries(orquestra.sessions().map((session) => [session.name, orquestra.broker.list(session.name)])),
    groups: current.state.grouping.list(),
    flow: requireFlow().snapshot(),
  });

  /**
   * Grava e solta o projeto antes de encerrar: depois da remoção os descritores dos terminais somem, e
   * cada 'removed' agendaria uma gravação nova que poria o projeto vazio por cima do arquivo.
   */
  function detachProject(): void {
    if (!project) return;
    project.saver.flush();
    project.saver.dispose();
    project = null;
    fileExplorer = null;
  }

  async function closeProject(): Promise<void> {
    const portalIds = project?.state.browserNodes().map((portal) => portal.id) ?? [];
    if (!project) return;
    await project.flow?.close();
    detachProject();
    for (const session of orquestra.sessions()) await orquestra.removeTerminal(session.name);
    for (const note of orquestra.notes.list()) orquestra.removeNote(note.name);
    for (const portal of portalIds) orquestra.topology.remove(portal);
  }

  function syncFlowAgents(): void {
    if (!project?.flow) return;
    project.flow.syncAgents(orquestra.sessions().filter((session) => session.acceptsPrompts).map((session) => ({ id: session.id, name: session.name, position: project!.state.rectOf(session.name) ?? { x: 80, y: 80 } })));
  }
  function requireFlow(): FlowEngine {
    const current = requireProject();
    if (!current.flow) {
      current.flow = new FlowEngine({
        dir: current.dir, graph: current.state.flowGraph(), workers: flowWorkers,
        changed: (graph) => { current.state.setFlowGraph(graph); current.saver.schedule(); },
        emit: (event) => opts.send({ kind: 'event', event }),
        agent: async (terminalId, text, timeoutMs, signal) => {
          const session = orquestra.sessions().find((session) => session.id === terminalId);
          if (!session?.acceptsPrompts) throw new Error('Terminal de agente indisponível. Recarregue-o antes de executar esta etapa.');
          const outcome = await orquestra.broker.submit({ asker: `Fluxo ${randomUUID()}`, target: session.name, text, timeoutMs, signal });
          if (signal.aborted || outcome.status !== 'answered') { orquestra.broker.cancel(outcome.askId); throw new Error(signal.aborted ? 'Execução cancelada; o agente pode concluir o pedido em andamento.' : 'O agente não respondeu no prazo da etapa.'); }
          return outcome.answer;
        },
      });
      syncFlowAgents();
    }
    return current.flow;
  }
  async function flowCommand<T>(work: (flow: FlowEngine) => T | Promise<T>): Promise<T> {
    try { return await work(requireFlow()); } catch (error) { if (error instanceof OrqError) throw error; throw new OrqError('USAGE', (error as Error).message); }
  }

  function restore(current: OpenProject, workspace: Workspace): void {
    current.state.setBrowserNodes(workspace.portals ?? []);
    for (const portal of workspace.portals ?? []) orquestra.topology.add(portal.id, 'portal');
    for (const note of workspace.notes) {
      orquestra.restoreNote({ id: note.id, name: note.name, content: note.content, revision: note.revision, updatedBy: note.updatedBy });
    }
    for (const terminal of workspace.terminals) {
      try {
        orquestra.createTerminal({
          name: terminal.name,
          agent: terminal.agent,
          cwd: terminal.cwd,
          id: terminal.id,
          args: terminal.args,
          resume: terminal.resume,
          agentSessionId: terminal.agentSessionId,
          regente: terminal.regente,
          persona: terminal.persona,
          monitor: terminal.monitor,
          unloaded: terminal.unloaded,
          sessionDirs: terminal.sessionDirs,
        });
      } catch (error) {
        current.state.forget(terminal.name);
        opts.log.warn({ err: error, terminal: terminal.name }, 'não foi possível reabrir o terminal');
        opts.send({
          kind: 'event',
          event: { type: 'notice', level: 'warn', message: `Não foi possível reabrir o terminal ${terminal.name}: ${(error as Error).message}` },
        });
      }
    }
    for (const { a, b } of workspace.connections) {
      if (orquestra.topology.kindOf(a) && orquestra.topology.kindOf(b)) orquestra.connect(a, b);
    }
    recordPids();
  }

  function groupElements(): GroupElement[] {
    const current = requireProject();
    capture(current); // Populate default geometry and remove references to missing elements.
    return [
      ...orquestra.describeTerminals().map((terminal) => ({ kind: 'terminal' as const, id: terminal.id, name: terminal.name, rect: current.state.rectOf(terminal.name)!, locked: Boolean(current.state.presentation(terminal.name).locked) })),
      ...orquestra.notes.list().map((note) => ({ kind: 'note' as const, id: note.id, name: note.name, rect: current.state.rectOf(note.name)!, locked: false })),
      ...requireFlow().snapshot().graph.nodes.filter((node) => node.kind !== 'agent').map((node) => ({ kind: 'flow' as const, id: node.id, name: flowCanvasId(node.id), rect: { ...node.position, ...node.size, height: Math.max(node.size.height, 130 + Math.max(node.inputs.length, node.outputs.length) * 26) }, locked: false })),
    ];
  }
  function groupLayout(): GroupLayout {
    const current = requireProject();
    return { groups: current.state.grouping.list(), layout: { ...current.state.layout(), ...Object.fromEntries(requireFlow().snapshot().graph.nodes.filter((node) => node.kind !== 'agent').map((node) => [flowCanvasId(node.id), { ...node.position, ...node.size, height: Math.max(node.size.height, 130 + Math.max(node.inputs.length, node.outputs.length) * 26) }])) } };
  }
  function emitGroupLayout(): GroupLayout {
    const result = groupLayout();
    changed();
    opts.send({ kind: 'event', event: { type: 'group.layout', ...result } });
    return result;
  }
  function prepareGroupedNode(groupId: string, kind: 'terminal' | 'note', name: string) {
    const current = requireProject();
    const elements = groupElements();
    const group = current.state.grouping.list().find((group) => group.id === groupId);
    if (!group) throw new OrqError('NOT_FOUND', 'O grupo não existe neste workspace.');
    const members = elements.filter((element) => group.members.some((member) => member.id === element.id));
    const rect = { x: group.position.x + GROUP_PADDING, y: members.length ? Math.max(...members.map((element) => element.rect.y + element.rect.height)) + GROUP_PADDING : group.position.y + GROUP_HEADER + GROUP_PADDING, ...(kind === 'terminal' ? TERMINAL_SIZE : NOTE_SIZE) };
    const id = randomUUID();
    current.state.grouping.validateAssignment(groupId, { id, kind }, [...elements, { id, kind, name, rect, locked: false }]);
    return { id, rect };
  }

  const handlers: Handlers = {
    'portal.registry': async () => ({ portals: requireProject().state.browserNodes() }),
    'portal.register': async (portal) => {
      const current = requireProject(), existing = current.state.browserNodes();
      const kind = orquestra.topology.kindOf(portal.id);
      if (kind && kind !== 'portal') throw new OrqError('USAGE', 'O identificador do navegador já pertence a outro elemento.');
      if (!kind) { if (existing.length >= 2) throw new OrqError('USAGE', 'Limite de dois navegadores por workspace.'); orquestra.topology.add(portal.id, 'portal'); }
      current.state.setBrowserNodes([...existing.filter((node) => node.id !== portal.id), portal]); changed(); return {};
    },
    'portal.unregister': async ({ id }) => {
      const current = requireProject();
      for (const other of orquestra.topology.neighbors(id)) opts.send({ kind: 'event', event: { type: 'edge.removed', a: id, b: other } });
      if (orquestra.topology.kindOf(id) === 'portal') orquestra.topology.remove(id);
      current.state.setBrowserNodes(current.state.browserNodes().filter((node) => node.id !== id)); changed(); return {};
    },
    'flow.get': async () => requireFlow().snapshot(),
    'flow.save': async ({ node }) => flowCommand((flow) => {
      const grouping = requireProject().state.grouping, before = grouping.list();
      try { const snapshot = flow.save(node, () => grouping.expand(groupElements())); if (grouping.list().length) emitGroupLayout(); return snapshot; }
      catch (error) { grouping.replace(before); throw error; }
    }),
    'flow.remove': async ({ id }) => flowCommand((flow) => { const node = flow.snapshot().graph.nodes.find((node) => node.id === id); flow.remove(id); syncFlowAgents(); const snapshot = flow.snapshot(); if (node?.kind !== 'agent') { requireProject().state.grouping.forget(id); if (requireProject().state.grouping.list().length) emitGroupLayout(); } return snapshot; }),
    'flow.connect': async (input) => flowCommand((flow) => flow.connect(input)),
    'flow.disconnect': async ({ id }) => flowCommand((flow) => flow.disconnect(id)),
    'flow.move': async ({ nodes, groupAssignments }) => flowCommand((flow) => {
      const current = requireProject(), before = { graph: flow.snapshot().graph, groups: current.state.grouping.list() };
      try {
        flow.moveQuiet(nodes);
        for (const assignment of groupAssignments ?? []) current.state.grouping.assign(assignment.groupId, [assignment.member], groupElements());
        current.state.grouping.expand(groupElements());
      } catch (error) { flow.restoreGraph(before.graph); current.state.grouping.replace(before.groups); throw error; }
      flow.commitLayout(); if (current.state.grouping.list().length) emitGroupLayout(); return {};
    }),
    'flow.run': async (input) => flowCommand((flow) => flow.start(input)),
    'flow.cancel': async () => flowCommand((flow) => flow.cancel()),
    'flow.auto': async ({ enabled }) => flowCommand((flow) => flow.setAuto(enabled)),
    'flow.test': async ({ id }) => flowCommand((flow) => flow.test(id)),
    'flow.example': async ({ position }) => flowCommand((flow) => flow.example(position)),
    'flow.inspect': async ({ nodeId, port, runId, direction }) => flowCommand((flow) => flow.inspect(nodeId, port, runId, direction)),
    'flow.history': async () => flowCommand((flow) => flow.history()),
    'flow.compare': async ({ before, after }) => flowCommand((flow) => flow.compare(before, after)),
    'flow.exportPreview': async (input) => flowCommand((flow) => flow.exportPreview(input)),
    'flow.exportApply': async (input) => flowCommand((flow) => flow.exportApply(input)),
    'group.layout': async () => { groupElements(); return groupLayout(); },
    'group.create': async (input) => { requireProject().state.grouping.create(input, groupElements()); return emitGroupLayout(); },
    'group.update': async (input) => { requireProject().state.grouping.update(input); return emitGroupLayout(); },
    'group.assign': async ({ id, members }) => { requireProject().state.grouping.assign(id, members, groupElements()); return emitGroupLayout(); },
    'group.members': async ({ id, members }) => { requireProject().state.grouping.setMembers(id, members, groupElements()); return emitGroupLayout(); },
    'group.move': async ({ id, position }) => {
      const current = requireProject();
      const moved = current.state.grouping.move(id, position, groupElements());
      for (const { name, ...rect } of moved.filter((element) => !element.name.startsWith('flow:'))) current.state.place(name, rect);
      const dataNodes = moved.filter((element) => element.name.startsWith('flow:')).map((element) => ({ id: element.name.slice(5), position: { x: element.x, y: element.y } }));
      if (dataNodes.length) requireFlow().move(dataNodes);
      return emitGroupLayout();
    },
    'group.resize': async ({ id, rect }) => { requireProject().state.grouping.resize(id, rect, groupElements()); return emitGroupLayout(); },
    'group.fit': async ({ id }) => { requireProject().state.grouping.fit(id, groupElements()); return emitGroupLayout(); },
    'group.remove': async ({ id }) => { requireProject().state.grouping.remove(id); return emitGroupLayout(); },
    'files.list': async ({ path }) => {
      const current = requireProject();
      if (fileExplorer?.dir !== current.dir) fileExplorer = { dir: current.dir, files: new ProjectFiles(current.dir) };
      return fileExplorer.files.list(path);
    },
    'files.read': async ({ path }) => {
      const current = requireProject();
      if (fileExplorer?.dir !== current.dir) fileExplorer = { dir: current.dir, files: new ProjectFiles(current.dir) };
      return fileExplorer.files.read(path);
    },
    'usage.codex': async () => consultUsage('codex', readCodexUsage),
    'usage.claude': async () => consultUsage('claude', readClaudeUsage),
    'usage.agy': async () => {
      const cwd = orquestra.sessions().find((session) => session.adapter.kind === 'agy')?.cwd ?? project?.dir ?? homedir();
      return consultUsage(`agy:${cwd}`, () => readAgyUsageIsolated({
        script: process.argv[1]!, cwd, signal: usageAbort.signal,
        onStart: (pid) => { usagePids.add(pid); recordPids(); },
        onExit: (pid) => { usagePids.delete(pid); recordPids(); },
      }));
    },
    'project.open': async ({ dir }) => {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        throw new OrqError('USAGE', `A pasta ${dir} não existe. Escolha outra pasta de projeto.`);
      }
      if (project?.dir === dir) return snapshot(project);
      await closeProject();
      const loaded = loadWorkspace(dir);
      const layout = Object.fromEntries(
        [...loaded.workspace.terminals, ...loaded.workspace.notes].map((node) => [node.name, { ...node.position, ...node.size }]),
      );
      const current: OpenProject = {
        dir,
        name: basename(dir),
          state: new WorkspaceState({ layout, flow: loaded.workspace.flow, groups: loaded.workspace.groups, elementIds: Object.fromEntries([...loaded.workspace.terminals, ...loaded.workspace.notes].map((element) => [element.name, element.id])), viewport: loaded.workspace.viewport, personas: loaded.workspace.personas, presentations: Object.fromEntries(loaded.workspace.terminals.filter((terminal) => terminal.blurred !== undefined || terminal.locked !== undefined).map((terminal) => [terminal.name, { blurred: terminal.blurred, locked: terminal.locked }])) }),
        saver: new WorkspaceSaver({ save: () => saveWorkspace(dir, capture(current)), delayMs: opts.saveDelayMs, log: opts.log }),
      };
      project = current;
      if (loaded.backup) {
        opts.log.warn({ dir, backup: loaded.backup, problem: loaded.problem }, 'workspace inválido; projeto aberto vazio');
        opts.send({
          kind: 'event',
          event: {
            type: 'notice',
            level: 'warn',
            message: `O workspace de ${current.name} estava inválido e foi guardado em ${loaded.backup}. O projeto abriu vazio. Detalhe: ${loaded.problem}`,
          },
        });
      }
      restore(current, loaded.workspace);
      recent.touch(dir);
      opts.log.info({ dir, terminals: loaded.workspace.terminals.length, notes: loaded.workspace.notes.length }, 'projeto aberto');
      return snapshot(current);
    },
    'project.close': async () => {
      await closeProject();
      return {};
    },
    'terminal.create': async ({ name, agent, cwd, resume, args, regente, persona, monitor, groupId }) => {
      if (agent === 'shell' && persona) {
        throw new OrqError('USAGE', 'O shell não recebe funções.');
      }
      const { recommendedFlash, recommendedLead } = await discoverModels();
      const effectiveFlash = recommendedFlash ?? 'gemini-3.8-flash-high';
      const effectiveLead = recommendedLead ?? 'gemini-4-argon-high';
      const resolvedArgs = resolveAutoModelArgs(args, effectiveFlash, effectiveLead);
      const resolvedPersona = persona ? resolvePersona(persona) : undefined;
      const placement = groupId ? prepareGroupedNode(groupId, 'terminal', name) : undefined;
      const session = await createTerminalFor({ id: placement?.id, name, agent, cwd, resume, args: resolvedArgs, regente, persona, monitor });
      if (placement && groupId) {
        requireProject().state.place(name, placement.rect);
        requireProject().state.grouping.assign(groupId, [{ kind: 'terminal', id: session.id }], groupElements());
        emitGroupLayout();
      }
      if (session.adapter.acceptsPrompts) {
        if (resolvedPersona) {
          orquestra.brief(session.name, 'Orquestra', resolveSessionGuide({ persona: resolvedPersona, regente: Boolean(regente) })!);
        } else if (regente) {
          orquestra.brief(session.name, 'Orquestra', resolveSessionGuide({ regente: true })!);
        } else if (['agy', 'claude', 'codex'].includes(agent)) {
          const cerebroGuide = getCerebroInstruction();
          if (cerebroGuide) orquestra.brief(session.name, 'Orquestra', cerebroGuide);
        }
      }
      return info(session);
    },
    'terminal.update': async ({ name, ...changes }) => {
      opts.log.info({ terminal: name, method: 'terminal.update', keys: Object.keys(changes) }, 'comando da interface');
      const before = orquestra.describeTerminals().find((terminal) => terminal.name === name);
      let resolvedPersona: Persona | undefined;
      if (changes.persona !== undefined) {
        const effectiveAgent = changes.agent ?? before?.agent;
        if (effectiveAgent === 'shell' && changes.persona) {
          throw new OrqError('USAGE', 'O shell não recebe funções.');
        }
        if (changes.persona && changes.persona !== before?.persona) {
          resolvedPersona = resolvePersona(changes.persona);
        }
      }
      if (changes.args !== undefined) {
        const { recommendedFlash, recommendedLead } = await discoverModels();
        const effectiveFlash = recommendedFlash ?? 'gemini-3.8-flash-high';
        const effectiveLead = recommendedLead ?? 'gemini-4-argon-high';
        changes.args = resolveAutoModelArgs(changes.args, effectiveFlash, effectiveLead);
      }
      if (changes.agent === 'agy' && before?.agent !== 'agy') {
        const result = await ensureAgyGlobalHook({
          command: agyStopHookCommand(opts.cliScript),
          confirm: requestConfirm,
          ...(opts.agyHooksFile ? { hooksFile: opts.agyHooksFile } : {}),
        });
        if (result === 'declined') {
          throw new OrqError('USAGE', 'Sem o hook global, o Orquestra não sabe quando o agy termina. O agente não foi trocado.');
        }
      }
      const session = await orquestra.updateTerminal(name, changes);
      if (changes.newName && changes.newName !== name) project?.state.rename(name, changes.newName);
      syncFlowAgents();
      const descriptor = orquestra.describeTerminals().find((terminal) => terminal.name === (changes.newName ?? name));
      if (session.adapter.acceptsPrompts && !descriptor?.unloaded) {
        const guide = resolveSessionGuide({
          persona: resolvedPersona,
          regente: Boolean(changes.regente ?? descriptor?.regente),
        });
        if (guide) {
          orquestra.brief(session.name, 'Orquestra', guide);
        }
      }
      recordPids();
      changed();
      return info(session);
    },
    'terminal.remove': async ({ name }) => {
      opts.log.info({ terminal: name, method: 'terminal.remove' }, 'comando da interface');
      requireSession(name);
      await orquestra.removeTerminal(name);
      changed();
      return {};
    },
    'terminal.restart': async ({ name }) => {
      opts.log.info({ terminal: name, method: 'terminal.restart' }, 'comando da interface');
      const before = orquestra.describeTerminals().find((terminal) => terminal.name === name);
      const session = await orquestra.restartTerminal(name);
      if (before?.unloaded && !before?.agentSessionId && session.adapter.acceptsPrompts) {
        if (before.persona) {
          try {
            const persona = resolvePersona(before.persona);
            orquestra.brief(session.name, 'Orquestra', resolveSessionGuide({ persona, regente: before.regente })!);
          } catch (error) {
            opts.log.warn({ err: error, terminal: name, persona: before.persona }, 'não foi possível resolver a função ao reiniciar');
          }
        } else if (before.regente) {
          orquestra.brief(session.name, 'Orquestra', resolveSessionGuide({ regente: true })!);
        } else if (['agy', 'claude', 'codex'].includes(before.agent)) {
          const cerebroGuide = getCerebroInstruction();
          if (cerebroGuide) orquestra.brief(session.name, 'Orquestra', cerebroGuide);
        }
      }
      recordPids();
      changed();
      return info(session);
    },
    'terminal.unload': async ({ name }) => {
      opts.log.info({ terminal: name, method: 'terminal.unload' }, 'comando da interface');
      const session = await orquestra.unloadTerminal(name);
      recordPids(); changed();
      return info(session);
    },
    'terminal.unloadIdle': async () => {
      opts.log.info({ method: 'terminal.unloadIdle' }, 'comando da interface');
      const unloaded = await orq().unloadIdleTerminals();
      recordPids(); changed();
      return { unloaded };
    },
    'terminal.presentation': async ({ name, ...changes }) => {
      const current = requireProject();
      const session = requireSession(name);
      current.state.setPresentation(name, changes); changed();
      return info(session);
    },
    'terminal.duplicate': async ({ name }) => {
      const current = requireProject();
      const source = orquestra.describeTerminals().find((terminal) => terminal.name === name);
      if (!source) throw new OrqError('NOT_FOUND', `Terminal ${name} não existe.`);
      const persona = source.persona ? resolvePersona(source.persona) : undefined;
      let newName = '';
      for (let index = 1; ; index++) {
        const suffix = index === 1 ? '-copia' : `-copia-${index}`;
        newName = name.slice(0, 40 - suffix.length) + suffix;
        if (!orquestra.topology.kindOf(newName)) break;
      }
      const session = await createTerminalFor({ name: newName, agent: source.agent as HostAgent, cwd: source.cwd, args: [...source.args], resume: source.resume, regente: source.regente, persona: source.persona ?? undefined, monitor: source.monitor });
      const origin = current.state.rectOf(name) ?? { x: 80, y: 80, ...TERMINAL_SIZE };
      const size = { width: origin.width, height: origin.height };
      const rect = { ...placeBeside(origin, Object.values(current.state.layout()), size), ...size };
      current.state.place(newName, rect);
      if (current.state.presentation(name).blurred) current.state.setPresentation(newName, { blurred: true });
      if (session.adapter.acceptsPrompts) {
        if (persona) {
          orquestra.brief(newName, 'Orquestra', resolveSessionGuide({ persona, regente: source.regente })!);
        } else if (source.regente) {
          orquestra.brief(newName, 'Orquestra', resolveSessionGuide({ regente: true })!);
        } else if (['agy', 'claude', 'codex'].includes(source.agent)) {
          const cerebroGuide = getCerebroInstruction();
          if (cerebroGuide) orquestra.brief(newName, 'Orquestra', cerebroGuide);
        }
      }
      changed();
      return { info: info(session), rect };
    },
    'terminal.rename': async ({ name, newName }) => {
      const session = orquestra.renameTerminal(name, newName);
      project?.state.rename(name, newName);
      changed();
      return info(session);
    },
    'terminal.input': async ({ name, data }) => {
      const session = requireSession(name);
      if (session.state === 'exited') throw new OrqError('APP_UNAVAILABLE', `Recarregue o terminal ${name} para interagir.`);
      session.userInput(data);
      return {};
    },
    'terminal.resize': async ({ name, cols, rows }) => {
      requireSession(name).resize(cols, rows);
      return {};
    },
    'terminal.snapshot': async ({ name }) => {
      const session = requireSession(name);
      await session.settle();
      // No mesmo tique: a saída enviada antes da resposta já está no retrato, e a interface a descarta
      // (ainda não está ao vivo). Sem isto, o lote pendente chegaria depois e repetiria linhas.
      batcher.flush();
      return session.snapshot();
    },
    'edge.connect': async ({ a, b }) => {
      orquestra.connect(a, b);
      changed();
      return {};
    },
    'edge.disconnect': async ({ a, b }) => {
      orquestra.disconnect(a, b);
      changed();
      return {};
    },
    'prompt.cancel': async ({ askId }) => orquestra.broker.cancelWithStatus(askId),
    'layout.update': async ({ nodes, viewport, groupAssignments }) => {
      const current = requireProject();
      for (const { name } of nodes) if (!orquestra.topology.kindOf(name)) throw new OrqError('NOT_FOUND', `Elemento ${name} não existe.`);
      const before = { layout: current.state.layout(), groups: current.state.grouping.list() };
      try {
        for (const { name, ...rect } of nodes) if (!current.state.presentation(name).locked) current.state.place(name, rect);
        for (const assignment of groupAssignments ?? []) current.state.grouping.assign(assignment.groupId, [assignment.member], groupElements());
        if (current.state.grouping.list().length && nodes.length) current.state.grouping.expand(groupElements());
      } catch (error) {
        current.state.restoreLayout(before.layout); current.state.grouping.replace(before.groups);
        throw error;
      }
      if (viewport) current.state.setViewport(viewport);
      changed();
      if (current.state.grouping.list().length && (nodes.length || groupAssignments?.length)) emitGroupLayout();
      return {};
    },
    'note.create': async ({ name, content, rect, groupId }) => {
      const current = requireProject();
      const placement = groupId ? prepareGroupedNode(groupId, 'note', name) : undefined;
      const note = orquestra.createNote(name, content);
      if (placement) current.state.place(name, placement.rect);
      else if (rect) current.state.place(name, rect);
      if (groupId) { current.state.grouping.assign(groupId, [{ kind: 'note', id: note.id }], groupElements()); emitGroupLayout(); }
      changed();
      return noteInfo(note);
    },
    'note.save': async ({ name, content, baseRevision }) => {
      requireProject();
      const note = orquestra.saveNote(name, content, baseRevision);
      changed();
      return noteInfo(note);
    },
    'note.rename': async ({ name, newName }) => {
      const current = requireProject();
      const note = orquestra.renameNote(name, newName);
      current.state.rename(name, newName);
      changed();
      opts.log.info({ note: name, method: 'note.rename', newName }, 'comando da interface');
      return noteInfo(note);
    },
    'note.remove': async ({ name }) => {
      const current = requireProject();
      orquestra.removeNote(name);
      current.state.forget(name);
      changed();
      return {};
    },
    'recent.list': async () => ({ projects: recent.list() }),
    'settings.get': async () => settings.get(),
    'settings.update': async (next) => settings.update(next),
    'persona.list': async () => {
      const projectPersonas = project?.state.personas() ?? [];
      const globalPersonas = personaStore.list();
      const seen = new Set<string>();
      const personas: Array<{ name: string; scope: PersonaScope; text: string }> = [];
      for (const p of projectPersonas) {
        seen.add(p.name);
        personas.push({ name: p.name, scope: 'project', text: p.text });
      }
      for (const p of globalPersonas) {
        if (!seen.has(p.name)) {
          seen.add(p.name);
          personas.push({ name: p.name, scope: 'global', text: p.text });
        }
      }
      return { personas };
    },
    'persona.save': async ({ name, text, scope }) => {
      if (scope === 'project') {
        const current = requireProject();
        current.state.writePersona({ name, text });
        changed();
      } else {
        personaStore.write({ name, text });
      }
      return {};
    },
    'persona.remove': async ({ name, scope }) => {
      if (scope === 'project') {
        const current = requireProject();
        const removed = current.state.removePersona(name);
        if (!removed) throw new OrqError('NOT_FOUND', `A função ${name} do projeto não existe.`);
        changed();
      } else {
        const removed = personaStore.remove(name);
        if (!removed) throw new OrqError('NOT_FOUND', `A função global ${name} não existe.`);
      }
      return {};
    },
    'models.list': async ({ refresh }) => discoverModels(Boolean(refresh)),
    'score.list': async () => {
      const scores = scoreStore.list(project?.dir);
      return { scores };
    },
    'score.get': async (params) => {
      const score = scoreStore.get(params.id, project?.dir);
      return { score };
    },
    'score.save': async (params) => {
      const { id } = scoreStore.save(params, project?.dir);
      return { ok: true, id };
    },
    'score.remove': async (params) => {
      const ok = scoreStore.remove(params.id, params.scope, project?.dir);
      return { ok };
    },
    'score.instantiate': async (params) => {
      const current = requireProject();
      const score = scoreStore.get(params.id, current.dir);
      if (!score) throw new OrqError('NOT_FOUND', `Partitura com id '${params.id}' não foi encontrada.`);

      const createdTerminals: string[] = [];
      const createdNotes: string[] = [];
      const idMap = new Map<string, string>();

      if (score.embeddedPersonas && score.embeddedPersonas.length > 0) {
        for (const p of score.embeddedPersonas) {
          if (p.scope === 'global') {
            personaStore.write({ name: p.name, text: p.text });
          } else {
            current.state.writePersona({ name: p.name, text: p.text });
          }
        }
      }

      for (const t of score.nodes.terminals) {
        let name = t.name;
        let counter = 2;
        while (Boolean(orquestra.topology.kindOf(name))) {
          name = `${t.name} #${counter++}`;
        }
        idMap.set(t.name, name);

        const termCwd = t.cwd || current.dir;
        const adapter = opts.adapters[t.agent] ?? opts.adapters.claude;
        const args = (score.settings.includeCommands && t.args) ? t.args : [];
        const persona = t.persona ?? undefined;

        const session = await createTerminalFor({
          name,
          agent: t.agent,
          cwd: termCwd,
          args,
          persona,
        });

        const rect = {
          x: t.position.x,
          y: t.position.y,
          width: t.size?.width ?? TERMINAL_SIZE.width,
          height: t.size?.height ?? TERMINAL_SIZE.height,
        };
        current.state.place(name, rect);
        createdTerminals.push(name);
        opts.send({
          kind: 'event',
          event: {
            type: 'terminal.added',
            info: info(session),
            rect,
            connectedTo: null,
          },
        });
      }

      for (const n of score.nodes.notes) {
        let name = n.name;
        let counter = 2;
        while (Boolean(orquestra.topology.kindOf(name))) {
          name = `${n.name} #${counter++}`;
        }
        idMap.set(n.name, name);

        const content = (score.settings.includeNotesContent && n.content) ? n.content : '';
        const note = orquestra.createNote(name, content);
        const rect = {
          x: n.position.x,
          y: n.position.y,
          width: n.size?.width ?? NOTE_SIZE.width,
          height: n.size?.height ?? NOTE_SIZE.height,
        };
        current.state.place(name, rect);
        createdNotes.push(name);
        opts.send({
          kind: 'event',
          event: {
            type: 'note.changed',
            note: noteInfo(note),
            connectedTo: null,
            rect,
          },
        });
      }

      for (const edge of score.edges) {
        const from = idMap.get(edge.source) ?? edge.source;
        const to = idMap.get(edge.target) ?? edge.target;
        try {
          if (orquestra.topology.kindOf(from) && orquestra.topology.kindOf(to)) {
            orquestra.connect(from, to);
          }
        } catch {
          // Ignora arestas inválidas
        }
      }

      changed();
      return { ok: true, createdTerminals, createdNotes };
    },
  };

  async function handle(message: Exclude<MainToHost, { kind: 'shutdown' }> | HostCommand | string): Promise<unknown> {
    if (typeof message === 'string') {
      let parsed: unknown;
      try { parsed = JSON.parse(message); } catch { throw new OrqError('USAGE', 'JSON inválido.'); }
      return handle(parsed as Exclude<MainToHost, { kind: 'shutdown' }> | HostCommand);
    }
    if ('type' in (message as object)) {
      const cmd = message as HostCommand;
      try {
        const result = await (async () => {
          switch (cmd.type) {
            case 'list-models':
              return discoverModels(Boolean(cmd.refresh));
            case 'create-terminal': {
              const current = requireProject();
              if (cmd.agent === 'shell' && cmd.persona) {
                throw new OrqError('USAGE', 'O shell não recebe funções.');
              }
              const resolvedPersona = cmd.persona ? resolvePersona(cmd.persona) : undefined;
              const anchorRect = cmd.connectTo
                ? (current.state.rectOf(cmd.connectTo) ?? { x: 80, y: 80, ...TERMINAL_SIZE })
                : { x: 80, y: 80, ...TERMINAL_SIZE };
              const rect = { ...placeBeside(anchorRect, Object.values(current.state.layout()), TERMINAL_SIZE), ...TERMINAL_SIZE };
              const { recommendedFlash, recommendedLead } = await discoverModels();
              const effectiveFlash = recommendedFlash ?? 'gemini-3.8-flash-high';
              const effectiveLead = recommendedLead ?? 'gemini-4-argon-high';
              const resolvedArgs = resolveAutoModelArgs(cmd.args, effectiveFlash, effectiveLead);
              const session = await createTerminalFor({
                name: cmd.name,
                agent: cmd.agent,
                cwd: cmd.cwd,
                resume: true,
                args: resolvedArgs,
                regente: Boolean(cmd.regente),
                persona: cmd.persona,
              });
              current.state.place(cmd.name, rect);
              if (cmd.connectTo) {
                orquestra.connect(cmd.connectTo, cmd.name);
              }
              if (session.adapter.acceptsPrompts) {
                if (resolvedPersona) {
                  orquestra.brief(session.name, cmd.connectTo ?? 'Orquestra', resolveSessionGuide({ persona: resolvedPersona, regente: Boolean(cmd.regente) })!);
                } else if (cmd.regente) {
                  orquestra.brief(session.name, 'Orquestra', resolveSessionGuide({ regente: true })!);
                } else if (['agy', 'claude', 'codex'].includes(cmd.agent)) {
                  const cerebroGuide = getCerebroInstruction();
                  if (cerebroGuide) orquestra.brief(session.name, cmd.connectTo ?? 'Orquestra', cerebroGuide);
                }
              }
              changed();
              opts.send({
                kind: 'event',
                event: {
                  type: 'terminal.added',
                  info: info(session),
                  rect,
                  connectedTo: cmd.connectTo ?? null,
                },
              });
              return info(session);
            }
            case 'unload-idle-terminals': {
              const unloaded = await orq().unloadIdleTerminals();
              return { unloaded };
            }
            case 'ping-control':
              return { pid: process.pid, rssBytes: process.memoryUsage().rss };
            case 'list': {
              return {
                workspaces: project ? [{ id: 'default', dir: project.dir, name: project.name, status: 'open', terminalCount: orquestra.sessions().length, busy: orquestra.sessions().filter((s) => s.state === 'busy').length, waiting: orquestra.sessions().filter((s) => s.state === 'waiting').length }] : [],
                selectedId: project ? 'default' : null,
              };
            }
            case 'update-terminal': {
              const changes = { ...(cmd.changes ?? {}), ...(cmd.agent ? { agent: cmd.agent } : {}) };
              const session = await orq().updateTerminal(cmd.name, changes);
              recordPids();
              changed();
              return info(session);
            }
            case 'unload-terminal': {
              const session = await orq().unloadTerminal(cmd.name);
              recordPids();
              changed();
              return info(session);
            }
            case 'restart-terminal': {
              const session = await orq().restartTerminal(cmd.name);
              recordPids();
              changed();
              return info(session);
            }
            case 'send-input': {
              const session = requireSession(cmd.name);
              session.userInput(cmd.data);
              return {};
            }
            case 'read-output': {
              const session = requireSession(cmd.name);
              const screen = session.snapshot();
              const lines = cmd.lines ?? 40;
              const text = screen.data.split('\n').slice(-lines).join('\n');
              return { text };
            }
            case 'shutdown': {
              return { ok: true };
            }
          }
        })();
        return { id: cmd.id, ok: true, result };
      } catch (error) {
        if (error instanceof OrqError) {
          return { id: cmd.id, ok: false, error: { code: error.code, message: error.message } };
        }
        const messageStr = error instanceof Error ? error.message : 'Erro interno.';
        return { id: cmd.id, ok: false, error: { code: 'INTERNAL', message: messageStr } };
      }
    }
    const main = message as Exclude<MainToHost, { kind: 'shutdown' }>;
    if (main.kind === 'portal-reply') {
      const pending = portalCalls.get(main.id);
      if (main.ok) pending?.resolve(main.result); else pending?.reject(new OrqError(main.error?.code ?? 'APP_UNAVAILABLE', main.error?.message ?? 'Navegador indisponível.'));
      return;
    }
    if (main.kind === 'confirm-reply') {
      confirms.get(main.id)?.(main.approved);
      confirms.delete(main.id);
      return;
    }
    try {
      if (!isHostMethod(main.method)) throw new OrqError('USAGE', `Comando desconhecido: ${main.method}.`);
      const params = parseHostParams(main.method, main.params);
      if (!(main.method in handlers)) throw new OrqError('USAGE', 'Comando de workspace requer o gerenciador.');
      const result = await (handlers[main.method as BridgeMethod] as (p: unknown) => Promise<unknown>)(params);
      opts.send({ kind: 'response', id: main.id, ok: true, result });
    } catch (error) {
      if (error instanceof OrqError) {
        opts.send({ kind: 'response-error', id: main.id, error: { code: error.code, message: error.message } });
        return;
      }
      opts.log.error({ err: error, method: main.method }, 'erro interno no comando');
      opts.send({ kind: 'response-error', id: main.id, error: { code: 'INTERNAL', message: 'Erro interno do Orquestra. Veja o log.' } });
    }
  }

  return {
    handle,
    unloadIdleTerminals: () => orq().unloadIdleTerminals(),
    dispatchForTest: (method, params, caller) => orquestra.dispatchForTest(method, params, caller, new AbortController().signal),
    cancelWork: async () => { await project?.flow?.cancel(); },
    async close() {
      for (const [id, pending] of [...portalCalls]) { opts.send({ kind: 'portal-cancel', id }); pending.reject(new OrqError('APP_UNAVAILABLE', 'Workspace encerrado.')); }
      await project?.flow?.close();
      if (!opts.flowWorkers) await flowWorkers.close();
      usageAbort.abort();
      for (const resolve of confirms.values()) resolve(false);
      confirms.clear();
      detachProject();
      batcher.flush();
      await orquestra.close();
      opts.onPids?.([]);
    },
  };
}
