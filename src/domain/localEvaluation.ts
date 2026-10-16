import { applyMove, formatMove } from './csa';
import type { BoardState, Move, ParsedGame, PieceCode, Side } from './types';

const SFEN: Record<PieceCode, string> = {
  FU: 'P', KY: 'L', KE: 'N', GI: 'S', KI: 'G', KA: 'B', HI: 'R', OU: 'K',
  TO: '+P', NY: '+L', NK: '+N', NG: '+S', UM: '+B', RY: '+R',
};

export function toSfen(board: BoardState): string {
  const ranks = Array.from({ length: 9 }, (_, rank) => {
    let row = '', empty = 0;
    for (let file = 9; file >= 1; file--) {
      const piece = board.squares[`${file}${rank + 1}`];
      if (!piece) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += piece.side === '+' ? SFEN[piece.code] : SFEN[piece.code].toLowerCase();
    }
    return row + (empty || '');
  });
  let hands = '';
  for (const side of ['+', '-'] as const) {
    for (const code of ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'] as const) {
      const count = board.hands[side][code] ?? 0;
      if (count > 0) hands += (count > 1 ? count : '') + (side === '+' ? SFEN[code] : SFEN[code].toLowerCase());
    }
  }
  return `${ranks.join('/')} ${board.turn === '+' ? 'b' : 'w'} ${hands || '-'} ${board.ply + 1}`;
}

export function toEnginePosition(game: ParsedGame, ply: number): string {
  let board = game.initial;
  const square = (value: string) => value[0] + 'abcdefghi'[Number(value[1]) - 1];
  const moves = game.moveList.slice(0, ply).map((move) => {
    const promoted = SFEN[move.piece].startsWith('+');
    const wasPromoted = move.from !== '00' && SFEN[board.squares[move.from]?.code ?? move.piece].startsWith('+');
    const usi = move.from === '00'
      ? `${SFEN[move.piece]}*${square(move.to)}`
      : `${square(move.from)}${square(move.to)}${promoted && !wasPromoted ? '+' : ''}`;
    board = applyMove(board, move);
    return usi;
  });
  return `${toSfen(game.initial)}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
}

export interface LocalScore { kind: 'cp' | 'mate'; value: number; depth: number; bound?: 'lowerbound' | 'upperbound' }
export interface Candidate { rank: number; score: LocalScore; pv: string[] }

export function parseCandidate(line: string, turn: Side): Candidate | undefined {
  const score = line.match(/\bscore (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/);
  const depth = line.match(/\bdepth (\d+)/);
  const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
  if (!line.startsWith('info ') || !score || !depth || rank < 1 || rank > 3) return;
  let bound = score[3] as LocalScore['bound'];
  if (turn === '-' && bound) bound = bound === 'lowerbound' ? 'upperbound' : 'lowerbound';
  const pv = line.match(/\bpv (.+)$/)?.[1].trim().split(/\s+/) ?? [];
  return { rank, score: { kind: score[1] as LocalScore['kind'], value: Number(score[2]) * (turn === '+' ? 1 : -1), depth: Number(depth[1]), bound }, pv };
}

export function parseLocalScore(line: string, turn: Side): LocalScore | undefined {
  const candidate = parseCandidate(line, turn);
  return candidate?.rank === 1 ? candidate.score : undefined;
}

export function formatPrincipalVariation(initial: BoardState, pv: string[]): string[] {
  let board = initial;
  let previous: Move | undefined;
  const labels: string[] = [];
  const square = (file: string, rank: string) => file + ('abcdefghi'.indexOf(rank) + 1);
  const promotion: Partial<Record<PieceCode, PieceCode>> = { FU: 'TO', KY: 'NY', KE: 'NK', GI: 'NG', KA: 'UM', HI: 'RY' };
  const drops: Record<string, PieceCode> = { P: 'FU', L: 'KY', N: 'KE', S: 'GI', G: 'KI', B: 'KA', R: 'HI' };
  for (const token of pv.slice(0, 6)) {
    const normal = token.match(/^([1-9])([a-i])([1-9])([a-i])(\+)?$/);
    const drop = token.match(/^([PLNSGBR])\*([1-9])([a-i])$/);
    let from: string, to: string, piece: PieceCode;
    if (normal) {
      from = square(normal[1], normal[2]); to = square(normal[3], normal[4]);
      const source = board.squares[from];
      if (!source || source.side !== board.turn) break;
      piece = normal[5] ? promotion[source.code]! : source.code;
      if (!piece) break;
    } else if (drop) {
      from = '00'; to = square(drop[2], drop[3]); piece = drops[drop[1]];
      if (!(board.hands[board.turn][piece] ?? 0) || board.squares[to]) break;
    } else break;
    if (board.squares[to]?.side === board.turn) break;
    const move: Move = { from, to, piece, side: board.turn, index: board.ply + 1, raw: token };
    labels.push(formatMove(move, board, previous));
    board = applyMove(board, move); previous = move;
  }
  return labels;
}

// A bounded visual scale of the score, not a calibrated win probability.
export function advantageScale(score?: LocalScore): number {
  if (!score) return 50;
  if (score.kind === 'mate') return score.value < 0 ? 0 : 100;
  return 50 + 50 * Math.tanh(score.value / 1200);
}

export function scoreLabel(score: LocalScore): string {
  const value = score.kind === 'mate'
    ? `${score.value < 0 ? '後手' : '先手'}の詰み${score.value ? ` ${Math.abs(score.value)}手` : ''}`
    : `${score.value > 0 ? '+' : ''}${score.value}`;
  return `${value}${score.bound === 'lowerbound' ? '以上' : score.bound === 'upperbound' ? '以下' : ''}`;
}
