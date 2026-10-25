import { useState, useMemo } from 'react';
import type { ScoreDefinition, ScoreNodeTerminal, ScoreNodeNote, ScoreNodePortal, ScoreEdge } from './types';
import { MiniCanvasPreview } from './MiniCanvasPreview';

export interface ApplyPartituraDialogProps {
  score: ScoreDefinition;
  onClose(): void;
  onApply(customizedScore: ScoreDefinition): Promise<void> | void;
}

export function ApplyPartituraDialog({ score, onClose, onApply }: ApplyPartituraDialogProps) {
  const [tab, setTab] = useState<'partitura' | 'detalhes'>('partitura');
  const [selectedTerminals, setSelectedTerminals] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    score.nodes.terminals.forEach((_, idx) => {
      map[idx] = true;
    });
    return map;
  });
  const [selectedNotes, setSelectedNotes] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    score.nodes.notes.forEach((_, idx) => {
      map[idx] = true;
    });
    return map;
  });
  const [selectedPortals, setSelectedPortals] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    score.nodes.portals.forEach((_, idx) => {
      map[idx] = true;
    });
    return map;
  });

  // Hot-swap de motores e argumentos por terminal
  const [terminalOverrides, setTerminalOverrides] = useState<
    Record<number, { agent: 'claude' | 'agy' | 'codex' | 'shell'; args: string; name: string }>
  >(() => {
    const map: Record<number, { agent: 'claude' | 'agy' | 'codex' | 'shell'; args: string; name: string }> = {};
    score.nodes.terminals.forEach((t, idx) => {
      map[idx] = {
        agent: t.agent,
        args: Array.isArray(t.args) ? t.args.join(' ') : (t.command?.replace(new RegExp(`^${t.agent}\\s*`), '') ?? ''),
        name: t.name,
      };
    });
    return map;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computa o score filtrado e modificado para preview em tempo real
  const customizedScore: ScoreDefinition = useMemo(() => {
    const activeTerminals: ScoreNodeTerminal[] = [];
    const activeTerminalNameMap = new Map<string, string>(); // oldName -> newName

    score.nodes.terminals.forEach((orig, idx) => {
      if (selectedTerminals[idx]) {
        const override = terminalOverrides[idx] ?? { agent: orig.agent, args: '', name: orig.name };
        const rawArgs = override.args.trim().split(/\s+/).filter(Boolean);
        const newTerm: ScoreNodeTerminal = {
          ...orig,
          name: override.name.trim() || orig.name,
          agent: override.agent,
          args: rawArgs,
          command: rawArgs.length > 0 ? `${override.agent} ${rawArgs.join(' ')}` : override.agent,
        };
        activeTerminals.push(newTerm);
        activeTerminalNameMap.set(orig.name, newTerm.name);
      }
    });

    const activeNotes: ScoreNodeNote[] = score.nodes.notes.filter((_, idx) => selectedNotes[idx]);
    const activePortals: ScoreNodePortal[] = score.nodes.portals.filter((_, idx) => selectedPortals[idx]);

    // Filtra arestas apenas entre nós que continuam selecionados
    const activeTerminalNames = new Set(activeTerminals.map((t) => t.name));
    const activeNoteNames = new Set(activeNotes.map((n) => n.name));
    const activeNames = new Set([...activeTerminalNames, ...activeNoteNames]);

    const activeEdges: ScoreEdge[] = score.edges
      .map((e) => {
        const newSource = activeTerminalNameMap.get(e.source) ?? e.source;
        const newTarget = activeTerminalNameMap.get(e.target) ?? e.target;
        return { source: newSource, target: newTarget };
      })
      .filter((e) => activeNames.has(e.source) && activeNames.has(e.target));

    return {
      ...score,
      nodes: {
        terminals: activeTerminals,
        notes: activeNotes,
        portals: activePortals,
      },
      edges: activeEdges,
    };
  }, [score, selectedTerminals, selectedNotes, selectedPortals, terminalOverrides]);

  // Lista de comandos executáveis para o alerta de segurança
  const executableCommands = useMemo(() => {
    return customizedScore.nodes.terminals
      .filter((t) => t.command && t.command.trim() !== '')
      .map((t) => ({ name: t.name, command: t.command!, agent: t.agent }));
  }, [customizedScore]);

  const handleApply = async () => {
    if (customizedScore.nodes.terminals.length === 0 && customizedScore.nodes.notes.length === 0 && customizedScore.nodes.portals.length === 0) {
      setError('Selecione pelo menos um nó para adicionar ao canvas.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onApply(customizedScore);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-label="Detalhes da Partitura" data-testid="apply-partitura-dialog">
      <div className="dialog new-partitura-modal">
        {/* Header com Ícone e Título */}
        <div className="new-partitura-header">
          <div className="new-partitura-title-wrap">
            <span
              className="new-partitura-icon-badge"
              style={{ backgroundColor: `${score.color ?? '#3b82f6'}22`, color: score.color ?? '#3b82f6', border: `1px solid ${score.color ?? '#3b82f6'}44` }}
            >
              {score.icon || '📙'}
            </span>
            <div>
              <h2>{score.name}</h2>
              <small className="muted">
                {score.scope === 'global' ? 'Global' : 'Workspace'} · {score.nodes.terminals.length} terminais · {score.nodes.notes.length} notas · {score.edges.length} conexões
              </small>
            </div>
          </div>
          <button className="dialog-close-btn" onClick={onClose} aria-label="Fechar" data-testid="apply-partitura-close">
            ×
          </button>
        </div>

        {/* Corpo: 2 Colunas (Preview à esquerda, Formulário à direita) */}
        <div className="new-partitura-body">
          {/* Coluna Esquerda: Preview SVG Dinâmico */}
          <div className="new-partitura-left">
            <div className="preview-label-row">
              <span className="preview-label">Prévia do Grafo</span>
              <span className="preview-badge">
                {customizedScore.nodes.terminals.length + customizedScore.nodes.notes.length + customizedScore.nodes.portals.length} nós ativos
              </span>
            </div>
            <MiniCanvasPreview score={customizedScore} className="apply-dialog-preview" />
          </div>

          {/* Coluna Direita: Abas Partitura / Detalhes */}
          <div className="new-partitura-right">
            <div className="new-partitura-tabs">
              <button
                type="button"
                className={`tab-btn ${tab === 'partitura' ? 'active' : ''}`}
                onClick={() => setTab('partitura')}
                data-testid="apply-tab-partitura"
              >
                Partitura
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === 'detalhes' ? 'active' : ''}`}
                onClick={() => setTab('detalhes')}
                data-testid="apply-tab-detalhes"
              >
                Detalhes
              </button>
            </div>

            {error && <div className="dialog-error-banner" role="alert">{error}</div>}

            <div className="new-partitura-scroll-content">
              {tab === 'partitura' ? (
                <div className="partitura-info-panel">
                  {score.description && (
                    <div className="partitura-description-box">
                      <p>{score.description}</p>
                    </div>
                  )}

                  {/* Alerta de Segurança e Comandos a Executar */}
                  {executableCommands.length > 0 && (
                    <div className="security-alert-box" data-testid="apply-partitura-commands-warning">
                      <div className="security-alert-header">
                        <span className="security-alert-icon">⚠️</span>
                        <strong>Comandos que esta Partitura executará</strong>
                      </div>
                      <p className="security-alert-desc">
                        Ao adicionar ao canvas, os terminais abaixo serão inicializados com os comandos declarados:
                      </p>
                      <ul className="security-commands-list">
                        {executableCommands.map((item, idx) => (
                          <li key={idx} className="security-command-item">
                            <span className={`engine-tag engine-${item.agent}`}>{item.agent}</span>
                            <span className="command-terminal-name">{item.name}:</span>
                            <code className="command-code">{item.command}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Resumo da Estrutura */}
                  <div className="partitura-topology-summary">
                    <h4>Topologia do Grafo</h4>
                    <div className="summary-badges-grid">
                      <div className="summary-chip">
                        <span className="chip-count">{customizedScore.nodes.terminals.length}</span>
                        <span className="chip-label">Agentes / Terminais</span>
                      </div>
                      <div className="summary-chip">
                        <span className="chip-count">{customizedScore.nodes.notes.length}</span>
                        <span className="chip-label">Notas Compartilhadas</span>
                      </div>
                      <div className="summary-chip">
                        <span className="chip-count">{customizedScore.nodes.portals.length}</span>
                        <span className="chip-label">Portais Web</span>
                      </div>
                      <div className="summary-chip">
                        <span className="chip-count">{customizedScore.edges.length}</span>
                        <span className="chip-label">Conexões Ativas</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Aba Detalhes: Hot-Swap de Motores e Seleção Individual de Nós */
                <div className="partitura-details-panel" data-testid="apply-partitura-details-list">
                  <div className="details-section-header">
                    <h4>Terminais & Agentes</h4>
                    <small className="muted">Alterne claude ↔ agy ↔ codex e ajuste flags antes de instanciar</small>
                  </div>

                  <div className="terminals-hotswap-list">
                    {score.nodes.terminals.map((term, idx) => {
                      const isSelected = Boolean(selectedTerminals[idx]);
                      const currentOverride = terminalOverrides[idx] ?? {
                        agent: term.agent,
                        args: Array.isArray(term.args) ? term.args.join(' ') : '',
                        name: term.name,
                      };

                      return (
                        <div
                          key={idx}
                          className={`node-config-card ${isSelected ? 'is-selected' : 'is-disabled'}`}
                          data-testid={`term-config-${idx}`}
                        >
                          <div className="node-config-top">
                            <label className="checkbox-label node-toggle-label">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) =>
                                  setSelectedTerminals((prev) => ({ ...prev, [idx]: e.target.checked }))
                                }
                              />
                              <span className="node-toggle-title">
                                {term.regente ? '👑 ' : ''}
                                {term.name}
                              </span>
                            </label>
                            {term.persona && (
                              <span className="persona-badge" title={`Persona: ${term.persona}`}>
                                🎭 {term.persona}
                              </span>
                            )}
                          </div>

                          {isSelected && (
                            <div className="node-config-fields">
                              <div className="node-field-row">
                                <label className="inline-label">Nome:</label>
                                <input
                                  type="text"
                                  className="compact-input"
                                  value={currentOverride.name}
                                  onChange={(e) =>
                                    setTerminalOverrides((prev) => ({
                                      ...prev,
                                      [idx]: { ...currentOverride, name: e.target.value },
                                    }))
                                  }
                                  placeholder={term.name}
                                />
                              </div>

                              <div className="node-field-row">
                                <label className="inline-label">Motor ↕:</label>
                                <select
                                  className="compact-select engine-select"
                                  value={currentOverride.agent}
                                  onChange={(e) =>
                                    setTerminalOverrides((prev) => ({
                                      ...prev,
                                      [idx]: {
                                        ...currentOverride,
                                        agent: e.target.value as 'claude' | 'agy' | 'codex' | 'shell',
                                      },
                                    }))
                                  }
                                  data-testid={`term-agent-select-${idx}`}
                                >
                                  <option value="agy">Google Antigravity (agy)</option>
                                  <option value="claude">Anthropic Claude (claude)</option>
                                  <option value="codex">OpenAI Codex (codex)</option>
                                  <option value="shell">Shell nativo (shell)</option>
                                </select>
                              </div>

                              <div className="node-field-row">
                                <label className="inline-label">Flags / Modelo:</label>
                                <input
                                  type="text"
                                  className="compact-input args-input"
                                  value={currentOverride.args}
                                  onChange={(e) =>
                                    setTerminalOverrides((prev) => ({
                                      ...prev,
                                      [idx]: { ...currentOverride, args: e.target.value },
                                    }))
                                  }
                                  placeholder="--model ... --dangerously-skip-permissions"
                                  data-testid={`term-args-input-${idx}`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {score.nodes.notes.length > 0 && (
                    <>
                      <div className="details-section-header" style={{ marginTop: '16px' }}>
                        <h4>Notas Compartilhadas ({score.nodes.notes.length})</h4>
                      </div>
                      <div className="simple-nodes-list">
                        {score.nodes.notes.map((note, idx) => (
                          <label key={idx} className="checkbox-label simple-node-item">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedNotes[idx])}
                              onChange={(e) =>
                                setSelectedNotes((prev) => ({ ...prev, [idx]: e.target.checked }))
                              }
                            />
                            <span>📝 {note.name}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}

                  {score.nodes.portals.length > 0 && (
                    <>
                      <div className="details-section-header" style={{ marginTop: '16px' }}>
                        <h4>Portais Web ({score.nodes.portals.length})</h4>
                      </div>
                      <div className="simple-nodes-list">
                        {score.nodes.portals.map((portal, idx) => (
                          <label key={idx} className="checkbox-label simple-node-item">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedPortals[idx])}
                              onChange={(e) =>
                                setSelectedPortals((prev) => ({ ...prev, [idx]: e.target.checked }))
                              }
                            />
                            <span>🌐 {portal.name || portal.url}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Ações do Rodapé */}
            <div className="new-partitura-footer">
              <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleApply}
                disabled={submitting}
                data-testid="apply-partitura-submit"
              >
                {submitting ? 'Adicionando…' : 'Adicionar ao Canvas'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
