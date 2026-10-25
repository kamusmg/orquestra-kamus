export interface ScoreNodeTerminal {
  name: string;
  agent: 'claude' | 'agy' | 'codex' | 'shell';
  command?: string;
  args?: string[];
  cwd?: string;
  persona?: string | null;
  regente?: boolean;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface ScoreNodeNote {
  name: string;
  content?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface ScoreNodePortal {
  id?: string;
  name?: string;
  url: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface ScoreEdge {
  source: string;
  target: string;
  a?: string;
  b?: string;
}

export interface ScorePersona {
  name: string;
  text: string;
  scope?: 'global' | 'project';
  color?: string;
  icon?: string;
}

export interface ScoreDefinition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  scope: 'global' | 'workspace';
  workspaceId?: string;
  createdAt: number;
  updatedAt: number;
  settings?: {
    includeCommands?: boolean;
    includeNotesContent?: boolean;
    includeChatHistory?: boolean;
  };
  nodes: {
    terminals: ScoreNodeTerminal[];
    notes: ScoreNodeNote[];
    portals: ScoreNodePortal[];
  };
  edges: ScoreEdge[];
  personas?: ScorePersona[];
}
