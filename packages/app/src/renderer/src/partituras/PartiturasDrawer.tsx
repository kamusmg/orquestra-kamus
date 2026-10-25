import { useState, useMemo } from 'react';
import type { ScoreDefinition } from './types';
import { MiniCanvasPreview } from './MiniCanvasPreview';

export interface PartiturasDrawerProps {
  isOpen: boolean;
  onClose(): void;
  scores: ScoreDefinition[];
  currentWorkspaceId?: string;
  workspaceName?: string;
  onSelectScore(score: ScoreDefinition): void;
  onNewScore(): void;
  onDeleteScore(scoreId: string): Promise<void> | void;
}

export function PartiturasDrawer({
  isOpen,
  onClose,
  scores,
  currentWorkspaceId,
  workspaceName = 'Workspace',
  onSelectScore,
  onNewScore,
  onDeleteScore,
}: PartiturasDrawerProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'todos' | 'global' | 'workspace'>('todos');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredScores = useMemo(() => {
    return scores.filter((score) => {
      // Filtro de escopo
      if (scopeFilter === 'global' && score.scope !== 'global') return false;
      if (scopeFilter === 'workspace' && (score.scope !== 'workspace' || (currentWorkspaceId && score.workspaceId !== currentWorkspaceId))) {
        return false;
      }

      // Filtro de texto
      if (!filterQuery.trim()) return true;
      const query = filterQuery.toLowerCase();
      const matchName = score.name.toLowerCase().includes(query);
      const matchDesc = score.description?.toLowerCase().includes(query) ?? false;
      const matchTerminal = score.nodes.terminals.some(
        (t) => t.name.toLowerCase().includes(query) || (t.persona && t.persona.toLowerCase().includes(query))
      );
      return matchName || matchDesc || matchTerminal;
    });
  }, [scores, filterQuery, scopeFilter, currentWorkspaceId]);

  if (!isOpen) return null;

  const handleDragStart = (e: React.DragEvent, score: ScoreDefinition) => {
    e.dataTransfer.setData('application/orq-score', JSON.stringify(score));
    e.dataTransfer.setData('text/plain', score.name);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDelete = async (e: React.MouseEvent, scoreId: string) => {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja remover esta Partitura?')) {
      setDeletingId(scoreId);
      try {
        await onDeleteScore(scoreId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <aside
      className="partituras-drawer"
      aria-label="Gaveta de Partituras & Perfis"
      data-testid="partituras-drawer"
    >
      {/* Header da Gaveta */}
      <div className="drawer-header">
        <div className="drawer-title-row">
          <span className="drawer-icon">📖</span>
          <h3>Partituras & Perfis</h3>
          <span className="drawer-badge" data-testid="drawer-scores-count">
            {filteredScores.length}
          </span>
        </div>
        <div className="drawer-header-actions">
          <button
            className="drawer-action-btn primary"
            onClick={onNewScore}
            title="Salvar canvas atual como nova Partitura"
            data-testid="drawer-new-score-btn"
          >
            + Salvar Canvas
          </button>
          <button
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Fechar gaveta"
            data-testid="drawer-close-btn"
          >
            ×
          </button>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="drawer-toolbar">
        <div className="drawer-search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="drawer-search-input"
            placeholder="Buscar Partitura..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            data-testid="drawer-search-input"
          />
          {filterQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setFilterQuery('')}
              aria-label="Limpar busca"
            >
              ×
            </button>
          )}
        </div>

        {/* Chips de Filtro */}
        <div className="drawer-filter-chips">
          <button
            type="button"
            className={`filter-chip ${scopeFilter === 'todos' ? 'is-active' : ''}`}
            onClick={() => setScopeFilter('todos')}
            data-testid="filter-chip-todos"
          >
            Todos ({scores.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${scopeFilter === 'global' ? 'is-active' : ''}`}
            onClick={() => setScopeFilter('global')}
            data-testid="filter-chip-global"
          >
            Global ({scores.filter((s) => s.scope === 'global').length})
          </button>
          <button
            type="button"
            className={`filter-chip ${scopeFilter === 'workspace' ? 'is-active' : ''}`}
            onClick={() => setScopeFilter('workspace')}
            data-testid="filter-chip-workspace"
          >
            {workspaceName.length > 12 ? `${workspaceName.slice(0, 10)}…` : workspaceName} (
            {scores.filter((s) => s.scope === 'workspace').length})
          </button>
        </div>
      </div>

      {/* Lista de Partituras */}
      <div className="drawer-cards-list" data-testid="drawer-cards-list">
        {filteredScores.length === 0 ? (
          <div className="drawer-empty-state">
            <span className="empty-icon">📂</span>
            <p className="empty-text">
              {filterQuery ? 'Nenhuma partitura encontrada para a busca.' : 'Nenhuma partitura salva ainda.'}
            </p>
            <button className="primary-btn" onClick={onNewScore}>
              Salvar Canvas como Partitura
            </button>
          </div>
        ) : (
          filteredScores.map((score) => {
            const terminalsCount = score.nodes.terminals.length;
            const notesCount = score.nodes.notes.length;
            const edgesCount = score.edges.length;
            const isDeleting = deletingId === score.id;

            return (
              <div
                key={score.id}
                className="partitura-card"
                onClick={() => onSelectScore(score)}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, score)}
                title="Arraste para o canvas ou clique para inspecionar"
                data-testid={`score-card-${score.id}`}
              >
                <div className="card-top">
                  <div className="card-identity">
                    <span
                      className="card-icon"
                      style={{
                        backgroundColor: `${score.color ?? '#3b82f6'}20`,
                        color: score.color ?? '#3b82f6',
                        border: `1px solid ${score.color ?? '#3b82f6'}40`,
                      }}
                    >
                      {score.icon || '📙'}
                    </span>
                    <div className="card-title-group">
                      <h4 className="card-title">{score.name}</h4>
                      <span className={`scope-badge scope-${score.scope}`}>
                        {score.scope === 'global' ? 'Global' : 'Workspace'}
                      </span>
                    </div>
                  </div>

                  <div className="card-actions">
                    <button
                      className="card-delete-btn"
                      onClick={(e) => handleDelete(e, score.id)}
                      disabled={isDeleting}
                      title="Excluir partitura"
                      aria-label="Excluir partitura"
                      data-testid={`delete-score-${score.id}`}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {score.description && <p className="card-description">{score.description}</p>}

                {/* Miniatura do Canvas */}
                <div className="card-preview-container">
                  <MiniCanvasPreview score={score} className="card-mini-preview" />
                </div>

                {/* Rodapé do Card com badges */}
                <div className="card-footer">
                  <div className="card-meta-chips">
                    <span className="meta-chip" title={`${terminalsCount} agentes / terminais`}>
                      🤖 {terminalsCount}
                    </span>
                    {notesCount > 0 && (
                      <span className="meta-chip" title={`${notesCount} notas`}>
                        📝 {notesCount}
                      </span>
                    )}
                    {edgesCount > 0 && (
                      <span className="meta-chip" title={`${edgesCount} conexões`}>
                        ⚡ {edgesCount}
                      </span>
                    )}
                  </div>
                  <span className="drag-hint" title="Arraste para soltar no canvas">
                    ↔ Arraste para o canvas
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
