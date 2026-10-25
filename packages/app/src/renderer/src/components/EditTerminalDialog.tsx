import {
  extractModelArg,
  formatArgs,
  normalizeUserArgs,
  parseArgs,
  replaceModelArg,
  reservedArgError,
} from '@orquestra/shared/args';
import { terminalNameSchema, type HostAgent as AgentKind } from '@orquestra/shared/host-protocol';
import type { PersonaScope } from '@orquestra/shared/regent';
import { useEffect, useState } from 'react';
import type { CommandApi } from '../api';
import { appStore, useApp } from '../store';
import { ArgsField } from './ArgsField';

const sameArgs = (a: string[], b: string[]) => a.length === b.length && a.every((arg, index) => arg === b[index]);

const parseArgsSafe = (text: string): string[] => {
  try {
    return parseArgs(text);
  } catch {
    return [];
  }
};

export function EditTerminalDialog({ name, api, onClose }: { name: string; api: CommandApi; onClose(): void }) {
  const view = useApp((state) => state.terminals[name]);
  const [newName, setNewName] = useState(name);
  const [agent, setAgent] = useState<AgentKind>(view?.agent ?? 'claude');
  const [cwd, setCwd] = useState(view?.cwd ?? '');
  const [argsText, setArgsText] = useState(formatArgs(view?.args ?? []));
  const [persona, setPersona] = useState<string>(view?.persona ?? '');
  const [personas, setPersonas] = useState<Array<{ name: string; scope: PersonaScope }>>([]);
  const [resume, setResume] = useState(view?.resume ?? true);
  const [regente, setRegente] = useState(view?.regente ?? false);
  const [monitor, setMonitor] = useState(view?.monitor ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void api
      .command('persona.list', {})
      .then((res) => setPersonas((res as { personas?: Array<{ name: string; scope: PersonaScope }> })?.personas ?? []))
      .catch(() => setPersonas([]));
  }, [api]);

  if (!view) return null;

  const submit = async () => {
    if (submitting) return;
    const trimmed = newName.trim();
    const parsedName = terminalNameSchema.safeParse(trimmed);
    if (!parsedName.success) return setError(`Nome inválido: ${parsedName.error.issues[0]?.message ?? 'confira o nome'}. Escolha outro nome.`);
    if (trimmed !== name && appStore.getState().terminals[trimmed]) return setError(`Já existe um terminal chamado ${trimmed}. Escolha outro nome.`);
    let args: string[];
    try {
      args = parseArgs(argsText);
    } catch (parseError) {
      return setError((parseError as Error).message);
    }
    const normalized = normalizeUserArgs(agent, args);
    args = normalized.args;
    let effectiveResume = resume;
    if (normalized.impliedResume) {
      effectiveResume = true;
      setResume(true);
    }
    const reserved = reservedArgError(agent, args);
    if (reserved) return setError(reserved);

    const changes: {
      newName?: string;
      agent?: AgentKind;
      cwd?: string;
      args?: string[];
      resume?: boolean;
      regente?: boolean;
      monitor?: boolean;
      persona?: string | null;
    } = {};
    if (trimmed !== name) changes.newName = trimmed;
    if (agent !== view.agent) changes.agent = agent;
    if (cwd !== view.cwd) changes.cwd = cwd;
    if (!sameArgs(args, view.args)) changes.args = args;
    if (agent !== 'shell' && effectiveResume !== view.resume) changes.resume = effectiveResume;
    if (regente !== view.regente) changes.regente = regente;
    if (monitor !== view.monitor) changes.monitor = monitor;
    if (agent !== 'shell') {
      const currentPersona = view.persona ?? '';
      if (persona !== currentPersona) changes.persona = persona || null;
    }
    if (Object.keys(changes).length === 0) return onClose();
    const relaunch = agent !== view.agent || changes.cwd !== undefined || changes.args !== undefined;
    const busy = view.state === 'busy' || view.queued > 0;
    if (relaunch && busy && !window.confirm(`${name} está ocupado ou tem pedidos na fila. Salvar reinicia o agente e interrompe o trabalho. Continuar?`)) return;

    setError(null);
    setSubmitting(true);
    try {
      appStore.getState().replaceTerminal(name, await api.command('terminal.update', { name, ...changes }));
      onClose();
    } catch (updateError) {
      setError((updateError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-label="Editar terminal">
      <form
        className="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2>Editar terminal</h2>
        <p className="muted">Tipo: {agent}</p>
        <label className="dialog-field">
          <span>Agente (Hot-Swap)</span>
          <select
            data-testid="edit-terminal-agent"
            value={agent}
            onChange={(event) => {
              const nextAgent = event.target.value as AgentKind;
              setAgent(nextAgent);
              if (nextAgent === 'shell') {
                setResume(false);
                setRegente(false);
                setPersona('');
              }
            }}
          >
            <option value="claude">claude</option>
            <option value="agy">agy</option>
            <option value="codex">codex</option>
            <option value="shell">shell</option>
          </select>
        </label>
        <label>
          Nome
          <input data-testid="edit-terminal-name" value={newName} onChange={(event) => setNewName(event.target.value)} disabled={submitting} autoFocus />
        </label>
        <label>
          Pasta
          <input data-testid="edit-terminal-cwd" value={cwd} onChange={(event) => setCwd(event.target.value)} disabled={submitting} />
        </label>
        <label>
          Argumentos
          <ArgsField agent={agent} value={argsText} onChange={setArgsText} testId="edit-terminal-args" disabled={submitting} />
        </label>
        {(agent === 'agy' || agent === 'claude') ? (
          <label className="dialog-field">
            <span>Modelo (<code>--model</code> — fácil de trocar)</span>
            <input
              data-testid="edit-terminal-model"
              list="orq-known-models"
              placeholder="Padrão do agente (ex: gemini-3.8-flash-high, gemini-4-argon-high, opus)"
              value={extractModelArg(parseArgsSafe(argsText))}
              onChange={(e) => setArgsText(formatArgs(replaceModelArg(parseArgsSafe(argsText), e.target.value)))}
              disabled={submitting}
            />
            <datalist id="orq-known-models">
              <option value="gemini-4-argon-high">gemini-4-argon-high (Argon Tech Lead / Revisor)</option>
              <option value="gemini-3.8-flash-high">gemini-3.8-flash-high (Flash High Executor / NanoBanana)</option>
              <option value="gemini-3.8-flash-medium">gemini-3.8-flash-medium (Flash Medium Econômico)</option>
              <option value="opus">opus (Claude Opus)</option>
              <option value="sonnet">sonnet (Claude Sonnet)</option>
            </datalist>
          </label>
        ) : null}
        {agent !== 'shell' ? (
          <label className="dialog-field">
            <span>Função embutida (evoluível pelo Regente)</span>
            <select
              data-testid="edit-terminal-persona"
              value={persona}
              onChange={(event) => setPersona(event.target.value)}
              disabled={submitting}
            >
              <option value="">Sem função</option>
              {(personas ?? []).map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.scope === 'project' ? 'projeto' : 'global'})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="check">
          <input
            type="checkbox"
            data-testid="edit-terminal-resume"
            checked={resume && agent !== 'shell'}
            disabled={submitting || agent === 'shell'}
            onChange={(event) => setResume(event.target.checked)}
          />
          Retomar a sessão ao reabrir o projeto
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-testid="edit-terminal-regente"
            checked={regente}
            disabled={submitting}
            onChange={(event) => setRegente(event.target.checked)}
          />
          Regente
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-testid="edit-terminal-monitor"
            checked={monitor}
            disabled={submitting}
            onChange={(event) => setMonitor(event.target.checked)}
          />
          Monitorar atividade
        </label>
        {error ? <p className="dialog-error" data-testid="edit-terminal-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="submit" className="primary" data-testid="edit-terminal-submit" disabled={submitting}>Salvar</button>
        </div>
      </form>
    </div>
  );
}
