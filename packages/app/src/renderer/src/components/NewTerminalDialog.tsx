// Entrada sem módulos do Node: a interface roda no navegador do Electron.
import {
  extractModelArg,
  formatArgs,
  normalizeUserArgs,
  parseArgs,
  replaceModelArg,
  reservedArgError,
  type Settings,
} from '@orquestra/shared/args';
import { terminalNameSchema, type HostAgent } from '@orquestra/shared/host-protocol';
import { useEffect, useMemo, useState } from 'react';
import { createCommandApi, type CommandApi } from '../api';
import { ArgsField } from './ArgsField';

const parseArgsSafe = (text: string): string[] => {
  try {
    return parseArgs(text);
  } catch {
    return [];
  }
};

const AGENTS: Array<{ id: HostAgent; label: string; disabled?: boolean }> = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'agy', label: 'agy (Antigravity)' },
  { id: 'shell', label: 'Shell (PowerShell)' },
  { id: 'codex', label: 'Codex' },
];

export function suggestName(agent: string, existing: string[]): string {
  for (let index = 1; ; index++) {
    const candidate = `${agent}-${index}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

export function NewTerminalDialog(props: {
  projectDir: string;
  existingNames: string[];
  defaultArgs: Partial<Settings['defaultArgs']>;
  personas?: string[];
  api?: CommandApi;
  onCancel(): void;
  onCreate(input: {
    name: string;
    agent: HostAgent;
    cwd: string;
    resume: boolean;
    args: string[];
    regente: boolean;
    persona?: string;
    monitor: boolean;
  }): Promise<void>;
}) {
  const api = useMemo(
    () => props.api ?? (typeof window !== 'undefined' && (window as unknown as { orquestra?: { invoke: unknown } })?.orquestra?.invoke ? createCommandApi(window.orquestra.invoke) : undefined),
    [props.api]
  );
  const [liveModels, setLiveModels] = useState<Array<{ id: string; label: string; agent: string }>>([]);
  const [recommendedFlash, setRecommendedFlash] = useState<string>('gemini-3.8-flash-high');
  const [recommendedLead, setRecommendedLead] = useState<string>('gemini-4-argon-high');

  useEffect(() => {
    if (!api) return;
    void api
      .command('models.list' as never, {} as never)
      .then((res: { models?: Array<{ id: string; label: string; agent: string }>; recommendedFlash?: string | null; recommendedLead?: string | null }) => {
        if (res?.models?.length) setLiveModels(res.models);
        if (res?.recommendedFlash) setRecommendedFlash(res.recommendedFlash);
        if (res?.recommendedLead) setRecommendedLead(res.recommendedLead);
      })
      .catch(() => {});
  }, [api]);

  const defaultMonitor = (kind: HostAgent) => kind !== 'shell';
  const [agent, setAgent] = useState<HostAgent>('claude');
  const [name, setName] = useState(() => suggestName('claude', props.existingNames));
  const [cwd, setCwd] = useState(props.projectDir);
  const defaultFor = (kind: HostAgent) => formatArgs(kind === 'shell' ? [] : props.defaultArgs[kind] ?? []);
  const [argsText, setArgsText] = useState(() => defaultFor('claude'));
  const [resume, setResume] = useState(true);
  const [regente, setRegente] = useState(false);
  const [persona, setPersona] = useState('');
  const [monitor, setMonitor] = useState(() => defaultMonitor('claude'));
  const [userEditedMonitor, setUserEditedMonitor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const chooseAgent = (next: HostAgent) => {
    if (name === suggestName(agent, props.existingNames)) setName(suggestName(next, props.existingNames));
    // Mesma regra do nome sugerido: só troca o que você não editou.
    if (argsText === defaultFor(agent)) setArgsText(defaultFor(next));
    if (!userEditedMonitor) setMonitor(defaultMonitor(next));
    setAgent(next);
  };

  const submit = async () => {
    if (submitting) return;
    const parsed = terminalNameSchema.safeParse(name);
    if (!parsed.success) return setError(`Nome inválido: ${parsed.error.issues[0]?.message ?? 'confira o nome'}.`);
    if (props.existingNames.includes(name)) return setError(`Já existe um nó chamado ${name}. Escolha outro nome.`);
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
    setError(null);
    setSubmitting(true);
    try {
      await props.onCreate({
        name,
        agent,
        cwd,
        resume: agent !== 'shell' && effectiveResume,
        args,
        regente,
        ...(agent !== 'shell' && persona ? { persona } : {}),
        monitor,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-label="Novo terminal">
      <form
        className="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2>Novo terminal</h2>
        <fieldset>
          <legend>Tipo</legend>
          {AGENTS.map((option) => (
            <label key={option.id} className={option.disabled ? 'muted' : ''}>
              <input
                type="radio"
                name="agent"
                data-testid={`agent-${option.id}`}
                disabled={option.disabled || submitting}
                checked={agent === option.id}
                onChange={() => chooseAgent(option.id)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label>
          Nome
          <input data-testid="new-terminal-name" value={name} onChange={(event) => setName(event.target.value)} disabled={submitting} autoFocus />
        </label>
        <label>
          Pasta
          <input data-testid="new-terminal-cwd" value={cwd} onChange={(event) => setCwd(event.target.value)} disabled={submitting} />
        </label>
        <label>
          Argumentos
          <ArgsField agent={agent} value={argsText} onChange={setArgsText} testId="new-terminal-args" disabled={submitting} />
        </label>
        {(agent === 'agy' || agent === 'claude') ? (
          <label className="dialog-field">
            <span>Modelo (<code>--model</code> — fácil de trocar)</span>
            <input
              data-testid="new-terminal-model"
              list="new-orq-known-models"
              placeholder="Padrão do agente (ex: gemini-3.8-flash-high, gemini-4-argon-high, opus)"
              value={extractModelArg(parseArgsSafe(argsText))}
              onChange={(e) => setArgsText(formatArgs(replaceModelArg(parseArgsSafe(argsText), e.target.value)))}
              disabled={submitting}
            />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              <button
                type="button"
                className="chip"
                style={{ cursor: 'pointer', fontSize: '11px', padding: '2px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                disabled={submitting}
                onClick={(e) => {
                  e.preventDefault();
                  setArgsText(formatArgs(replaceModelArg(parseArgsSafe(argsText), recommendedFlash)));
                }}
              >
                ⚡ Flash Atual ({recommendedFlash})
              </button>
              <button
                type="button"
                className="chip"
                style={{ cursor: 'pointer', fontSize: '11px', padding: '2px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                disabled={submitting}
                onClick={(e) => {
                  e.preventDefault();
                  setArgsText(formatArgs(replaceModelArg(parseArgsSafe(argsText), recommendedLead)));
                }}
              >
                🧠 Lead Atual ({recommendedLead})
              </button>
              <button
                type="button"
                className="chip"
                style={{ cursor: 'pointer', fontSize: '11px', padding: '2px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                disabled={submitting}
                onClick={(e) => {
                  e.preventDefault();
                  setArgsText(formatArgs(replaceModelArg(parseArgsSafe(argsText), 'auto-flash')));
                }}
              >
                🔄 Auto-Flash (sempre o mais novo)
              </button>
            </div>
            <datalist id="new-orq-known-models">
              <option value="auto-flash">auto-flash (Sempre usar o Flash High mais recente — atual: {recommendedFlash})</option>
              <option value="auto-lead">auto-lead (Sempre usar o Lead/Argon High mais recente — atual: {recommendedLead})</option>
              {liveModels.length > 0 ? (
                liveModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} ({m.label})
                  </option>
                ))
              ) : (
                <>
                  <option value="gemini-4-argon-high">gemini-4-argon-high (Argon Tech Lead / Revisor)</option>
                  <option value="gemini-3.8-flash-high">gemini-3.8-flash-high (Flash High Executor / NanoBanana)</option>
                  <option value="gemini-3.8-flash-medium">gemini-3.8-flash-medium (Flash Medium Econômico)</option>
                  <option value="claude-opus-5-5-high">claude-opus-5-5-high</option>
                  <option value="opus">opus (Claude Opus)</option>
                  <option value="sonnet">sonnet (Claude Sonnet)</option>
                </>
              )}
            </datalist>
          </label>
        ) : null}
        <label className="check">
          <input
            type="checkbox"
            data-testid="new-terminal-resume"
            checked={resume && agent !== 'shell'}
            disabled={submitting || agent === 'shell'}
            onChange={(event) => setResume(event.target.checked)}
          />
          Retomar a sessão ao reabrir o projeto
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-testid="new-terminal-regente"
            checked={regente}
            disabled={submitting}
            onChange={(event) => setRegente(event.target.checked)}
          />
          Regente
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-testid="new-terminal-monitor"
            checked={monitor}
            disabled={submitting}
            onChange={(event) => {
              setMonitor(event.target.checked);
              setUserEditedMonitor(true);
            }}
          />
          Monitorar atividade
        </label>
        <label>
          Função
          <select
            data-testid="new-terminal-persona"
            value={persona}
            disabled={submitting || agent === 'shell'}
            onChange={(event) => setPersona(event.target.value)}
          >
            <option value="">(nenhuma)</option>
            {(props.personas ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="dialog-error" data-testid="new-terminal-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={props.onCancel} disabled={submitting}>Cancelar</button>
          <button type="submit" className="primary" data-testid="new-terminal-submit" disabled={submitting}>Criar</button>
        </div>
      </form>
    </div>
  );
}
