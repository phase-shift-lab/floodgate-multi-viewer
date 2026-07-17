export type Side = '+' | '-';

export type PieceCode =
  | 'FU' | 'KY' | 'KE' | 'GI' | 'KI' | 'KA' | 'HI' | 'OU'
  | 'TO' | 'NY' | 'NK' | 'NG' | 'UM' | 'RY';

export interface Piece {
  side: Side;
  code: PieceCode;
}

export interface Move {
  index: number;
  side: Side;
  from: string;
  to: string;
  piece: PieceCode;
  raw: string;
  time?: number;
  evaluation?: number;
}

export interface GameSummary {
  id: string;
  group: string;
  black: string;
  white: string;
  blackRate?: number;
  whiteRate?: number;
  startedAt: string;
  endedAt?: string;
  live: boolean;
  result?: string;
  moves?: number;
  csaPath: string;
}

export interface ParsedGame extends GameSummary {
  version?: string;
  moveList: Move[];
  initial: BoardState;
  finalReason?: string;
  evaluationsTrusted: boolean;
  sourceText: string;
}

export interface BoardState {
  squares: Record<string, Piece>;
  hands: Record<Side, Partial<Record<PieceCode, number>>>;
  turn: Side;
  lastTo?: string;
  ply: number;
}

export type ConnectionState = 'connecting' | 'online' | 'stale' | 'offline' | 'paused';

export interface ViewerSettings {
  boardCount: 1 | 2 | 4;
  playbackSeconds: number;
  orientation: 'black' | 'white';
  theme: 'light' | 'dark' | 'system';
  autoSwitchFinished: boolean;
}
