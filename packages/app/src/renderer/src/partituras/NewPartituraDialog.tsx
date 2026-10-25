import { useMemo, useState } from 'react';
import type { ScoreDefinition, ScoreEdge, ScoreNodeNote, ScoreNodePortal, ScoreNodeTerminal, ScorePersona } from './types';
import { MiniCanvasPreview } from './MiniCanvasPreview';

interface NewPartituraDialogProps {
  currentWorkspaceId?: string;
  workspaceName?: string;
  terminals: Record<string, any>;
  notes: Record<string, any>;
  portals?: any[];
  connections: Array<{ a: string; b: string }>;
  personas?: Array<{ name: string; text: string; scope: any }>;
  onClose(): void;
  onSave(score: ScoreDefinition): Promise<void> | void;
}

const AVAILABLE_ICONS = [
  '📙', '🧠', '👾', '🤖', '⚡', '🚀', '🛠️', '🎯', '🎨', '🧪',
  '💻', '🔍', '📊', '🛡️', '📦', '⚙️', '🌐', '💡', '📝', '✨',
  '🔥', '💎', '📈', '🕹️', '📡', '🩺', '🎓', '🔮', '📐', '🏷️',
];

const AVAILABLE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#eab308', '#6366f1',
];

export function NewPartituraDialog({
  currentWorkspaceId,
  workspaceName = 'Workspace Atual',
  terminals,
  notes,
  portals = [],
  connections,
  personas = [],
  onClose,
  onSave,
}: NewPartituraDialogProps) {
  const [tab, setTab] = useState<'partitura' | 'detalhes'>('partitura');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'global' | 'workspace'>('workspace');
  const [selectedIcon, setSelectedIcon] = useState('📙');
  const [selectedColor, setSelectedColor] = useState('#f59e0b');

  const [includeCommands, setIncludeCommands] = useState(true);
  const [includeNotesContent, setIncludeNotesContent] = useState(true);
  const [includeChatHistory, setIncludeChatHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Constrói a partitura preliminar a partir do estado do canvas
  const previewScore: ScoreDefinition = useMemo(() => {
    const termNodes: ScoreNodeTerminal[] = Object.values(terminals).map((t: any) => ({
      name: t.name,
      agent: t.agent ?? 'claude',
      command: includeCommands ? (Array.isArray(t.args) && t.args.length > 0 ? `${t.agent} ${t.args.join(' ')}` : t.agent) : t.agent,
      args: includeCommands ? t.args : [],
      cwd: t.cwd,
      persona: t.persona,
      regente: Boolean(t.regente),
      position: t.position ?? { x: 0, y: 0 },
      size: t.size ?? { width: 320, height: 200 },
    }));

    const noteNodes: ScoreNodeNote[] = Object.values(notes).map((n: any) => ({
      name: n.name,
      content: includeNotesContent ? n.content : '',
      position: n.position ?? { x: 380, y: 0 },
      size: n.size ?? { width: 280, height: 180 },
    }));

    const portalNodes: ScoreNodePortal[] = portals.map((p: any) => ({
      id: p.portalId ?? p.id,
      name: p.name ?? 'Portal',
      url: p.initialUrl ?? p.url ?? 'https://duckduckgo.com',
      position: p.position ?? { x: 0, y: 240 },
      size: p.size ?? { width: 340, height: 240 },
    }));

    const edgeList: ScoreEdge[] = connections.map((c) => ({
      source: c.a,
      target: c.b,
    }));

    const personaList: ScorePersona[] = personas.map((p) => ({
      name: p.name,
      text: p.text,
      scope: p.scope,
    }));

    return {
      id: crypto.randomUUID(),
      name: name.trim() || 'Nova Partitura',
      description,
      icon: selectedIcon,
      color: selectedColor,
      scope,
      workspaceId: scope === 'workspace' ? currentWorkspaceId : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        includeCommands,
        includeNotesContent,
        includeChatHistory,
      },
      nodes: {
        terminals: termNodes,
        notes: noteNodes,
        portals: portalNodes,
      },
      edges: edgeList,
      personas: personaList,
    };
  }, [
    name,
    description,
    selectedIcon,
    selectedColor,
    scope,
    currentWorkspaceId,
    includeCommands,
    includeNotesContent,
    includeChatHistory,
    terminals,
    notes,
    portals,
    connections,
    personas,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor, informe o nome da Partitura.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSave(previewScore);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-label="Nova Partitura" data-testid="new-partitura-dialog">
      <div className="dialog new-partitura-modal">
        <header className="new-partitura-header">
          <h2>{selectedIcon} Nova Partitura</h2>
          <button className="dialog-close-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="new-partitura-body">
          {/* Coluna Esquerda: Preview do Grafo */}
          <div className="new-partitura-preview-col">
            <MiniCanvasPreview score={previewScore} height={420} />
            <div className="preview-metrics">
              <span>{previewScore.nodes.terminals.length} terminais</span>
              <span>·</span>
              <span>{previewScore.nodes.notes.length} notas</span>
              <span>·</span>
              <span>{previewScore.edges.length} conexões</span>
            </div>
          </div>

          {/* Coluna Direita: Abas & Formulário */}
          <div className="new-partitura-form-col">
            <div className="new-partitura-tabs">
              <button
                type="button"
                className={`tab-btn ${tab === 'partitura' ? 'active' : ''}`}
                onClick={() => setTab('partitura')}
              >
                Partitura
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === 'detalhes' ? 'active' : ''}`}
                onClick={() => setTab('detalhes')}
              >
                Detalhes
              </button>
            </div>

            {error ? <div className="form-error-banner">{error}</div> : null}

            {tab === 'partitura' ? (
              <form onSubmit={handleSubmit} className="partitura-tab-form">
                <label>
                  Nome da Partitura
                  <input
                    type="text"
                    value={name}
                    placeholder="Ex: Squad Fullstack Lead + Flash"
                    autoFocus
                    data-testid="new-partitura-name-input"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>

                <label>
                  Descrição (opcional)
                  <textarea
                    rows={2}
                    value={description}
                    placeholder="Descreva o propósito deste perfil de agentes..."
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>

                <div className="partitura-checkboxes">
                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={includeCommands}
                      onChange={(e) => setIncludeCommands(e.target.checked)}
                    />
                    <div>
                      <strong>Incluir comandos de inicialização</strong>
                      <small>Desative para compartilhar o layout sem tokens ou argumentos privados.</small>
                    </div>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={includeNotesContent}
                      onChange={(e) => setIncludeNotesContent(e.target.checked)}
                    />
                    <div>
                      <strong>Incluir o conteúdo das notas</strong>
                      <small>Desative para compartilhar como papel em branco (mantém posições e títulos).</small>
                    </div>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={includeChatHistory}
                      onChange={(e) => setIncludeChatHistory(e.target.checked)}
                    />
                    <div>
                      <strong>Incluir histórico de chat</strong>
                      <small>Salva as conversas ativas dos terminais.</small>
                    </div>
                  </label>
                </div>

                <label>
                  Espaço de trabalho
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as 'global' | 'workspace')}
                  >
                    <option value="workspace">{workspaceName} (apenas neste espaço)</option>
                    <option value="global">Global (disponível em todos os espaços)</option>
                  </select>
                </label>

                <div className="pickers-row">
                  <div className="icon-selector-field">
                    <span>Ícone</span>
                    <div className="icon-grid">
                      {AVAILABLE_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          className={`icon-btn ${selectedIcon === icon ? 'is-selected' : ''}`}
                          onClick={() => setSelectedIcon(icon)}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="color-selector-field">
                    <span>Cor</span>
                    <div className="color-palette">
                      {AVAILABLE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`color-circle ${selectedColor === c ? 'is-selected' : ''}`}
                          style={{ backgroundColor: c }}
                          onClick={() => setSelectedColor(c)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="dialog-actions">
                  <button type="button" onClick={onClose}>Cancelar</button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={submitting}
                    data-testid="new-partitura-submit"
                  >
                    {submitting ? 'Criando...' : 'Criar Partitura'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="detalhes-tab-content">
                <section>
                  <h4>Terminais ({previewScore.nodes.terminals.length})</h4>
                  <ul className="details-list">
                    {previewScore.nodes.terminals.map((t) => (
                      <li key={t.name} className="details-item">
                        <span className="dot" style={{ backgroundColor: selectedColor }} />
                        <strong>{t.name}</strong>
                        <span className="badge">{t.agent}</span>
                        {t.persona ? <span className="persona-tag">{t.persona}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h4>Notas ({previewScore.nodes.notes.length})</h4>
                  <ul className="details-list">
                    {previewScore.nodes.notes.map((n) => (
                      <li key={n.name} className="details-item">
                        <span>📄</span>
                        <span>{n.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h4>Conexões ({previewScore.edges.length})</h4>
                  <ul className="details-list">
                    {previewScore.edges.map((e, idx) => (
                      <li key={`conn-${idx}`} className="details-item">
                        <span>⇆</span>
                        <span>{e.source} ↔ {e.target}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <div className="dialog-actions">
                  <button type="button" onClick={onClose}>Fechar</button>
                  <button
                    type="button"
                    className="primary"
                    onClick={(e) => void handleSubmit(e as any)}
                    disabled={submitting}
                  >
                    Salvar Partitura
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
