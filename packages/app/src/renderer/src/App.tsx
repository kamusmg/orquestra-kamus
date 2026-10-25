import { emptySettings, type Settings } from '@orquestra/shared/args';
import type { HostCommand } from '@orquestra/shared/host-protocol';
import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createCommandApi } from './api';
import { Canvas } from './canvas/Canvas';
import { Palette } from './canvas/Palette';
import { Sidebar } from './canvas/Sidebar';
import { ZoomControl } from './canvas/ZoomControl';
import { EditTerminalDialog } from './components/EditTerminalDialog';
import { NewTerminalDialog } from './components/NewTerminalDialog';
import { NoticeList } from './components/NoticeList';
import { PersonasDialog } from './components/PersonasDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SubscriptionUsage } from './components/SubscriptionUsage';
import { activateWorkspace } from './project';
import { useWorkspaces } from './workspaces';
import { suggestNoteName } from './notes/suggest-name';
import { appStore, layoutOf, useApp } from './store';
import type { Position } from '@orquestra/shared/workspace';
import { GroupDialog, type GroupDraft } from './groups/GroupDialog';
import { GroupMembersDialog } from './groups/GroupMembersDialog';
import { GroupUIContext } from './groups/ui-actions';
import { selectionMembers } from './groups/helpers';
import { portalStore, usePortalStore } from './portal/portal-state';
import { FlowWorkbench, FlowToolbar } from './flow/FlowWorkbench';
import {
  PartiturasDrawer,
  NewPartituraDialog,
  ApplyPartituraDialog,
  listScores,
  saveScore,
  removeScore,
  getLocalScores,
  type ScoreDefinition,
} from './partituras';

const globalApi = createCommandApi(window.orquestra.invoke);

export function App() {
  const project = useApp((state) => state.project);
  const api = useMemo(() => createCommandApi(window.orquestra.invoke, () => project?.workspaceId), [project?.workspaceId]);
  const { workspaces, selectedId, changing } = useWorkspaces((state) => state);
  const paused = workspaces.find((item) => item.id === selectedId);
  const terminals = useApp((state) => state.terminals);
  const notes = useApp((state) => state.notes);
  const edges = useApp((state) => state.edges);
  const editing = useApp((state) => state.editing);
  const portals = usePortalStore((state) => state.portals);
  const [creating, setCreating] = useState(false);
  const [defaultArgs, setDefaultArgs] = useState<Settings['defaultArgs']>({ claude: [], agy: [], codex: [] });
  const [canvasSettings, setCanvasSettings] = useState<Settings['canvas']>(() => emptySettings().canvas);
  const [personas, setPersonas] = useState<string[]>([]);
  const [personasDetailed, setPersonasDetailed] = useState<Array<{ name: string; text: string; scope: any }>>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [personasOpen, setPersonasOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState<string | undefined>();
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [managingGroup, setManagingGroup] = useState<string | null>(null);

  // Estados do Livrinho de Partituras & Perfis de Agentes
  const [scoresDrawerOpen, setScoresDrawerOpen] = useState(false);
  const [newScoreOpen, setNewScoreOpen] = useState(false);
  const [applyingScore, setApplyingScore] = useState<ScoreDefinition | null>(null);
  const [dropPosition, setDropPosition] = useState<Position | undefined>();
  const [scores, setScores] = useState<ScoreDefinition[]>([]);

  const refreshScores = useCallback(async () => {
    try {
      const list = await listScores(api, project?.workspaceId);
      setScores(list);
    } catch {
      setScores(getLocalScores());
    }
  }, [api, project?.workspaceId]);

  useEffect(() => {
    void refreshScores();
  }, [refreshScores]);

  useEffect(() => {
    void globalApi.command('settings.get', {}).then((settings) => setCanvasSettings({ ...emptySettings().canvas, ...settings.canvas })).catch(() => {});
  }, []);
  useEffect(() => { setCreating(false); setPersonasOpen(false); setCreatingGroup(undefined); setGroupDraft(null); setManagingGroup(null); }, [project?.workspaceId]);

  useEffect(() => {
    let previous: boolean | undefined;
    const sync = () => {
      const blocked = Boolean(document.querySelector('[role="dialog"], .ctx-menu, .workspace-changing, .usage-details:not([hidden])'));
      if (blocked !== previous) { previous = blocked; void window.orquestra?.portal?.setModalState(blocked); }
    };
    const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded'] }); sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    portalStore.getState().loadFromStorage(project?.workspaceId || 'default');
    if (project?.workspaceId) void api.command('portal.registry', {}).then(({ portals }) => {
      for (const portal of portals) if (!portalStore.getState().portals[portal.id]) portalStore.getState().setPortal({ id: portal.id, workspaceId: project.workspaceId!, activeTabId: 'tab-1', tabs: [{ id: 'tab-1', url: 'about:blank', title: portal.title, isLoading: false, canGoBack: false, canGoForward: false }], mode: 'desktop', presetId: 'desktop-compact', orientation: 'portrait', zoomLevel: 1, isAttached: false, visible: false });
    }).catch(() => {});
  }, [project?.workspaceId]);

  const handleUnloadIdle = () => {
    try {
      const sendFn = (window.orquestra as unknown as { send?: (c: unknown) => void }).send;
      if (sendFn) {
        sendFn({ type: 'unload-idle-terminals' } as unknown as HostCommand);
      }
      void api.command('terminal.unloadIdle', {}).then((res) => {
        for (const name of (res as { unloaded?: string[] }).unloaded ?? []) {
          const current = appStore.getState().terminals[name];
          if (current) {
            appStore.getState().replaceTerminal(name, { ...current, state: 'exited', unloaded: true });
          }
        }
      }).catch(() => {});
    } catch (error) {
      appStore.getState().notify('error', (error as Error).message);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && (event.key === 'U' || event.key === 'u')) {
        event.preventDefault();
        handleUnloadIdle();
      }
      if (
        (event.ctrlKey && event.shiftKey && (event.key === 'P' || event.key === 'p')) ||
        (event.altKey && (event.key === 'P' || event.key === 'p'))
      ) {
        event.preventDefault();
        setScoresDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openNewTerminal = async (groupId?: string) => {
    setCreatingGroup(groupId);
    try {
      setDefaultArgs((await api.command('settings.get', {})).defaultArgs);
    } catch {
      // Sem padrões, o diálogo abre com o campo vazio.
      setDefaultArgs({ claude: [], agy: [], codex: [] });
    }
    try {
      const personaRes = await api.command('persona.list', {});
      setPersonasDetailed(personaRes.personas);
      setPersonas(personaRes.personas.map((persona) => persona.name));
    } catch {
      setPersonas([]);
      setPersonasDetailed([]);
    }
    if (appStore.getState().project?.workspaceId === project?.workspaceId) setCreating(true);
  };

  const handleSaveScore = async (score: ScoreDefinition) => {
    await saveScore(score, api);
    await refreshScores();
    appStore.getState().notify('info', `Partitura "${score.name}" salva com sucesso!`);
  };

  const handleRemoveScore = async (scoreId: string) => {
    await removeScore(scoreId, api);
    await refreshScores();
    appStore.getState().notify('info', 'Partitura removida.');
  };

  const applyScoreToCanvas = async (scoreToApply: ScoreDefinition, targetPos?: Position) => {
    let offsetX = 0;
    let offsetY = 0;
    if (targetPos) {
      const allX = [
        ...scoreToApply.nodes.terminals.map((t) => t.position?.x ?? 0),
        ...scoreToApply.nodes.notes.map((n) => n.position?.x ?? 0),
      ];
      const allY = [
        ...scoreToApply.nodes.terminals.map((t) => t.position?.y ?? 0),
        ...scoreToApply.nodes.notes.map((n) => n.position?.y ?? 0),
      ];
      const minX = allX.length > 0 ? Math.min(...allX) : 0;
      const minY = allY.length > 0 ? Math.min(...allY) : 0;
      offsetX = targetPos.x - minX;
      offsetY = targetPos.y - minY;
    }

    const state = appStore.getState();
    const existing = new Set([...Object.keys(state.terminals), ...Object.keys(state.notes)]);
    const disambiguation = new Map<string, string>();

    const getUniqueName = (base: string) => {
      let candidate = base;
      let count = 2;
      while (existing.has(candidate)) {
        candidate = `${base} #${count}`;
        count++;
      }
      existing.add(candidate);
      return candidate;
    };

    const layoutNodes: Array<{ name: string; x: number; y: number; width: number; height: number }> = [];

    // 1. Criar Terminais
    for (const term of scoreToApply.nodes.terminals) {
      const finalName = getUniqueName(term.name);
      disambiguation.set(term.name, finalName);
      const x = (term.position?.x ?? 0) + offsetX;
      const y = (term.position?.y ?? 0) + offsetY;

      try {
        const info = await api.command('terminal.create', {
          name: finalName,
          agent: term.agent,
          cwd: term.cwd || project?.dir || '.',
          resume: false,
          args: term.args ?? [],
          regente: Boolean(term.regente),
          persona: term.persona || undefined,
          monitor: false,
        });
        appStore.getState().addTerminal(info);
        layoutNodes.push({
          name: finalName,
          x,
          y,
          width: term.size?.width ?? 320,
          height: term.size?.height ?? 200,
        });
      } catch (err) {
        console.error(`Erro ao criar terminal ${finalName}:`, err);
      }
    }

    // 2. Criar Notas
    for (const note of scoreToApply.nodes.notes) {
      const finalName = getUniqueName(note.name);
      disambiguation.set(note.name, finalName);
      const x = (note.position?.x ?? 0) + offsetX;
      const y = (note.position?.y ?? 0) + offsetY;

      try {
        const createdNote = await api.command('note.create', {
          name: finalName,
          content: note.content ?? '',
        });
        appStore.getState().upsertNote(createdNote);
        layoutNodes.push({
          name: finalName,
          x,
          y,
          width: note.size?.width ?? 280,
          height: note.size?.height ?? 180,
        });
      } catch (err) {
        console.warn(`Tentativa de criar nota "${finalName}" falhou, aplicando fallback com hífen...`, err);
        const fallbackName = getUniqueName(finalName.replace(/\s+/g, '-'));
        try {
          const createdNote = await api.command('note.create', {
            name: fallbackName,
            content: note.content ?? '',
          });
          disambiguation.set(note.name, fallbackName);
          appStore.getState().upsertNote(createdNote);
          layoutNodes.push({
            name: fallbackName,
            x,
            y,
            width: note.size?.width ?? 280,
            height: note.size?.height ?? 180,
          });
        } catch (fallbackErr) {
          console.error(`Erro ao criar nota ${finalName} (fallback: ${fallbackName}):`, fallbackErr);
        }
      }
    }

    // 3. Atualizar posições no layout
    if (layoutNodes.length > 0) {
      try {
        await api.command('layout.update', { nodes: layoutNodes });
        layoutNodes.forEach((node) => {
          appStore.getState().moveNode(node.name, { x: node.x, y: node.y });
        });
      } catch (err) {
        console.warn('Erro ao atualizar layout dos nós da partitura:', err);
      }
    }

    // 4. Reconectar arestas traduzidas
    for (const edge of scoreToApply.edges) {
      const a = disambiguation.get(edge.source) ?? edge.source;
      const b = disambiguation.get(edge.target) ?? edge.target;
      if (existing.has(a) && existing.has(b)) {
        try {
          await api.command('edge.connect', { a, b });
          appStore.getState().addEdge({ a, b });
        } catch (err) {
          console.warn(`Erro ao conectar ${a} -> ${b}:`, err);
        }
      }
    }
  };

  const handleApplyScore = async (customizedScore: ScoreDefinition) => {
    await applyScoreToCanvas(customizedScore, dropPosition);
    setDropPosition(undefined);
    setApplyingScore(null);
    appStore.getState().notify('info', `Partitura "${customizedScore.name}" adicionada ao canvas!`);
  };

  const handleScoreDrop = (droppedScore: ScoreDefinition, position: Position) => {
    setDropPosition(position);
    setApplyingScore(droppedScore);
  };

  const create = async (input: {
    name: string;
    agent: 'claude' | 'agy' | 'codex' | 'shell';
    cwd: string;
    resume: boolean;
    args: string[];
    regente: boolean;
    persona?: string;
    monitor: boolean;
  }) => {
    const info = await api.command('terminal.create', { ...input, ...(creatingGroup ? { groupId: creatingGroup } : {}) });
    appStore.getState().addTerminal(info);
    if (creatingGroup) appStore.getState().applyGroupLayout(await api.command('group.layout', {}));
    setCreating(false);
  };

  const createNote = async (groupId?: string) => {
    const state = appStore.getState();
    const name = suggestNoteName([...Object.keys(state.terminals), ...Object.keys(state.notes)]);
    try {
      appStore.getState().upsertNote(await api.command('note.create', { name, content: '', ...(groupId ? { groupId } : {}) }));
      if (groupId) { appStore.getState().applyGroupLayout(await api.command('group.layout', {})); return; }
      // Sem rect, o store escolheu a próxima posição livre; o núcleo grava a mesma.
      const rect = layoutOf(appStore.getState(), name);
      if (rect) await api.command('layout.update', { nodes: [{ name, ...rect }] });
    } catch (error) {
      appStore.getState().notify('error', (error as Error).message);
    }
  };

  const newGroup = (fromSelection: boolean, position?: Position) => {
    const state = appStore.getState();
    const viewport = state.canvasViewport ?? state.viewport ?? { x: 0, y: 0, zoom: 1 };
    setGroupDraft({ members: fromSelection ? selectionMembers(state) : [], position: position ?? { x: (80 - viewport.x) / viewport.zoom, y: (120 - viewport.y) / viewport.zoom } });
  };

  const createPortalNode = async () => {
    const wsId = project?.workspaceId || 'default';
    const state = appStore.getState();
    const viewport = state.canvasViewport ?? state.viewport ?? { x: 0, y: 0, zoom: 1 };
    const portalId = `portal-${Date.now()}`;
    const position: Position = {
      x: (140 - viewport.x) / viewport.zoom,
      y: (120 - viewport.y) / viewport.zoom,
    };
    try {
      const created = await window.orquestra?.portal?.create({
        portalId,
        workspaceId: wsId,
        initialUrl: 'https://duckduckgo.com',
        mode: 'desktop',
        presetId: 'desktop-compact',
        orientation: 'portrait',
        position,
      });
      if (created) {
        portalStore.getState().setPortal({ ...created, position });
      }
    } catch (error) {
      appStore.getState().notify('error', (error as Error).message);
    }
  };

  const requestRemove = async (name: string) => {
    const view = appStore.getState().terminals[name];
    const busy = view && (view.state === 'busy' || view.queued > 0);
    if (!window.confirm(busy ? `${name} está ocupado ou tem pedidos na fila. Remover mesmo assim?` : `Remover ${name}?`)) return;
    try {
      await api.command('terminal.remove', { name });
    } catch (error) {
      appStore.getState().notify('error', (error as Error).message);
    }
  };

  return (
    <FlowWorkbench api={api}>
      <GroupUIContext.Provider value={{
        edit: (id, focus) => { const group = appStore.getState().groups.find((group) => group.id === id); if (group) setGroupDraft({ group, members: group.members, position: group.position, focus }); },
        members: (id) => setManagingGroup(id),
        newTerminal: (id) => void openNewTerminal(id),
        newNote: (id) => void createNote(id),
      }}>
        <div className="app">
          <Sidebar onOpenSettings={() => setSettingsOpen(true)} onOpenPersonas={() => setPersonasOpen(true)} onUnloadIdle={handleUnloadIdle} />
          <div className="workspace-main">
          <div className="titlebar">
            <div className="titlebar-actions">
              <button
                type="button"
                className="titlebar-btn"
                data-testid="titlebar-scores-button"
                onClick={() => setScoresDrawerOpen((prev) => !prev)}
                title="Partituras & Perfis de Agentes (Ctrl+Shift+P / Alt+P)"
              >
                <span>📖</span>
                <span>Partituras</span>
                {scores.length > 0 && (
                  <span className="titlebar-badge" data-testid="titlebar-scores-badge">
                    {scores.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          <main className="canvas">
            <ReactFlowProvider key={project?.workspaceId ?? 'paused'}>
            <FlowToolbar />
            <Palette
              onNewTerminal={() => void openNewTerminal()}
              onNewNote={() => void createNote()}
              onNewPortal={() => void createPortalNode()}
              onNewGroup={() => newGroup(false)}
              onGroupSelection={() => newGroup(true)}
              onOpenScores={() => setScoresDrawerOpen(true)}
            />
            {project ? (
              <Canvas
                snapToGrid={canvasSettings.snapToGrid}
                motion={canvasSettings.motion}
                onRemoveRequest={(name) => void requestRemove(name)}
                onNewGroup={newGroup}
                onScoreDrop={handleScoreDrop}
              />
            ) : (
              <div className="empty workspace-empty">
                {paused ? (
                  <>
                    <p>{paused.name} está pausado. Seus agentes serão iniciados ao ativar o workspace.</p>
                    <button onClick={() => void activateWorkspace(paused.id)}>Ativar workspace</button>
                  </>
                ) : (
                  <p>Abra uma pasta de projeto para começar.</p>
                )}
              </div>
            )}
            <ZoomControl />
            </ReactFlowProvider>
            <SubscriptionUsage api={globalApi} />
            <NoticeList />
          </main>
          </div>
        </div>
        {changing ? <div className="workspace-changing" role="status">Atualizando workspace…</div> : null}
        <PartiturasDrawer
          isOpen={scoresDrawerOpen}
          onClose={() => setScoresDrawerOpen(false)}
          scores={scores}
          currentWorkspaceId={project?.workspaceId}
          workspaceName={project?.name ?? 'Workspace'}
          onSelectScore={(score) => {
            setDropPosition(undefined);
            setApplyingScore(score);
          }}
          onNewScore={() => setNewScoreOpen(true)}
          onDeleteScore={handleRemoveScore}
        />
        {newScoreOpen && (
          <NewPartituraDialog
            currentWorkspaceId={project?.workspaceId}
            workspaceName={project?.name}
            terminals={terminals}
            notes={notes}
            portals={Object.values(portals)}
            connections={edges}
            personas={personasDetailed}
            onClose={() => setNewScoreOpen(false)}
            onSave={handleSaveScore}
          />
        )}
        {applyingScore && (
          <ApplyPartituraDialog
            score={applyingScore}
            onClose={() => {
              setApplyingScore(null);
              setDropPosition(undefined);
            }}
            onApply={handleApplyScore}
          />
        )}
        {creating && project ? (
          <NewTerminalDialog
            projectDir={project.dir}
            existingNames={Object.keys(terminals)}
            defaultArgs={defaultArgs}
            personas={personas}
            onCancel={() => setCreating(false)}
            onCreate={create}
          />
        ) : null}
        {editing ? <EditTerminalDialog name={editing} api={api} onClose={() => appStore.getState().setEditing(null)} /> : null}
        {settingsOpen ? <SettingsDialog api={api} onClose={() => setSettingsOpen(false)} onCanvasChange={setCanvasSettings} /> : null}
        {personasOpen ? <PersonasDialog api={api} hasProject={project !== null} onClose={() => setPersonasOpen(false)} /> : null}
        {groupDraft && project ? <GroupDialog key={groupDraft.group?.id ?? 'new'} draft={groupDraft} api={api} onClose={() => setGroupDraft(null)} /> : null}
        {managingGroup && project ? <GroupMembersDialog id={managingGroup} api={api} onClose={() => setManagingGroup(null)} /> : null}
      </GroupUIContext.Provider>
    </FlowWorkbench>
  );
}
