import type { BoardState, Move, ParsedGame, PieceCode, Side } from './types';

const BASE_PIECES: PieceCode[] = ['FU', 'KY', 'KE', 'GI', 'KI', 'KA', 'HI'];
const DEMOTE: Partial<Record<PieceCode, PieceCode>> = {
  TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI',
};
const PROMOTABLE = new Set<PieceCode>(['FU', 'KY', 'KE', 'GI', 'KA', 'HI']);
const PIECE_LABELS: Record<PieceCode, string> = {
  FU: '歩',
  KY: '香',
  KE: '桂',
  GI: '銀',
  KI: '金',
  KA: '角',
  HI: '飛',
  OU: '玉',
  TO: 'と',
  NY: '成香',
  NK: '成桂',
  NG: '成銀',
  UM: '馬',
  RY: '龍',
};
const FILE_LABELS = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const RANK_LABELS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const FINAL_REASON_LABELS: Record<string, string> = {
  SENNICHITE: '千日手',
  JISHOGI: '持将棋',
  CHUDAN: '中断',
};

export function createInitialBoard(): BoardState {
  const squares: BoardState['squares'] = {};
  const put = (side: Side, rank: number, pieces: Array<PieceCode | null>) => {
    pieces.forEach((code, index) => {
      if (code) squares[`${9 - index}${rank}`] = { side, code };
    });
  };
  put('-', 1, ['KY', 'KE', 'GI', 'KI', 'OU', 'KI', 'GI', 'KE', 'KY']);
  put('-', 2, [null, 'HI', null, null, null, null, null, 'KA', null]);
  put('-', 3, ['FU', 'FU', 'FU', 'FU', 'FU', 'FU', 'FU', 'FU', 'FU']);
  put('+', 7, ['FU', 'FU', 'FU', 'FU', 'FU', 'FU', 'FU', 'FU', 'FU']);
  put('+', 8, [null, 'KA', null, null, null, null, null, 'HI', null]);
  put('+', 9, ['KY', 'KE', 'GI', 'KI', 'OU', 'KI', 'GI', 'KE', 'KY']);
  return { squares, hands: { '+': {}, '-': {} }, turn: '+', ply: 0 };
}

function emptyBoard(): BoardState {
  return { squares: {}, hands: { '+': {}, '-': {} }, turn: '+', ply: 0 };
}

function parseBoardLines(lines: string[]): BoardState {
  const state = lines.includes('PI') ? createInitialBoard() : emptyBoard();
  const boardLines = lines.filter((line) => /^P[1-9]/.test(line));
  if (!lines.includes('PI')) {
    if (!boardLines.length) return createInitialBoard();
    for (const line of boardLines) {
      const rank = Number(line[1]);
      const tokens = line.slice(2).match(/(?:[+-][A-Z]{2}| \*)/g) ?? [];
      tokens.slice(0, 9).forEach((token, index) => {
        if (token.trim() === '*') return;
        const code = token.slice(1) as PieceCode;
        state.squares[`${9 - index}${rank}`] = { side: token[0] as Side, code };
      });
    }
  }
  for (const line of lines.filter((value) => /^P[+-]/.test(value))) {
    const side = line[1] as Side;
    for (const match of line.slice(2).matchAll(/00([A-Z]{2})/g)) {
      const code = match[1] as PieceCode;
      if (BASE_PIECES.includes(code)) state.hands[side][code] = (state.hands[side][code] ?? 0) + 1;
    }
  }
  const turn = lines.find((line) => line === '+' || line === '-');
  if (turn) state.turn = turn as Side;
  return state;
}

export function applyMove(board: BoardState, move: Move): BoardState {
  const next: BoardState = {
    squares: { ...board.squares },
    hands: { '+': { ...board.hands['+'] }, '-': { ...board.hands['-'] } },
    turn: move.side === '+' ? '-' : '+',
    lastTo: move.to,
    ply: move.index,
  };
  if (move.from === '00') {
    const count = next.hands[move.side][move.piece] ?? 0;
    if (count > 0) next.hands[move.side][move.piece] = count - 1;
  } else {
    delete next.squares[move.from];
  }
  const captured = next.squares[move.to];
  if (captured && captured.side !== move.side) {
    const handCode = DEMOTE[captured.code] ?? captured.code;
    if (BASE_PIECES.includes(handCode)) {
      next.hands[move.side][handCode] = (next.hands[move.side][handCode] ?? 0) + 1;
    }
  }
  next.squares[move.to] = { side: move.side, code: move.piece };
  return next;
}

export function boardAt(game: ParsedGame, ply: number): BoardState {
  return game.moveList.slice(0, Math.max(0, Math.min(ply, game.moveList.length))).reduce(applyMove, game.initial);
}

function meta(lines: string[], key: string): string | undefined {
  return lines.find((line) => line.startsWith(key))?.slice(key.length).trim();
}

function parseRate(text: string, side: 'black' | 'white'): number | undefined {
  const match = text.match(new RegExp(`(?:['$]?)${side}[_ -]?rate\\s*[:=]\\s*(?:[^\\r\\n:]+:)?(-?\\d+(?:\\.\\d+)?)`, 'i'));
  return match ? Number(match[1]) : undefined;
}

export function parseCsa(text: string, fallbackId = 'fixture-game'): ParsedGame {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trimEnd());
  const moveList: Move[] = [];
  let lastMove: Move | undefined;
  let evaluationCount = 0;
  for (const line of lines) {
    const match = line.match(/^([+-])(\d{2})(\d{2})([A-Z]{2})$/);
    if (match) {
      lastMove = {
        index: moveList.length + 1,
        side: match[1] as Side,
        from: match[2],
        to: match[3],
        piece: match[4] as PieceCode,
        raw: line,
      };
      moveList.push(lastMove);
      continue;
    }
    const time = line.match(/^T(\d+)$/);
    if (time && lastMove) lastMove.time = Number(time[1]);
    const evaluation = line.match(/^'\*\*\s*(-?\d+)(?:\s|$)/);
    if (evaluation && lastMove) {
      lastMove.evaluation = Number(evaluation[1]);
      evaluationCount += 1;
    }
  }
  const reason = lines.find((line) => /^%[A-Z_]+$/.test(line));
  const id = meta(lines, '$EVENT:') ?? fallbackId;
  const startedAt = meta(lines, '$START_TIME:') ?? id.match(/(\d{8})(\d{6})/)?.slice(1).join('T') ?? '';
  const group = meta(lines, '$EVENT:')?.split('+')[1] ?? id.split('+')[1] ?? 'floodgate';
  const black = meta(lines, 'N+') ?? id.split('+').at(-3) ?? '先手不明';
  const white = meta(lines, 'N-') ?? id.split('+').at(-2) ?? '後手不明';
  return {
    id,
    group,
    black,
    white,
    blackRate: parseRate(text, 'black'),
    whiteRate: parseRate(text, 'white'),
    startedAt,
    live: !reason,
    result: reason ? resultFromReason(reason, moveList.at(-1)?.side) : undefined,
    moves: moveList.length,
    csaPath: `${id}.csa`,
    version: lines.find((line) => /^V\d/.test(line))?.slice(1),
    moveList,
    initial: parseBoardLines(lines),
    finalReason: reason?.slice(1),
    evaluationsTrusted: evaluationCount >= 2 && evaluationCount / Math.max(1, moveList.length) >= 0.8,
    sourceText: text,
  };
}

function resultFromReason(reason: string, lastSide?: Side): string {
  if (reason === '%TORYO') return lastSide === '+' ? '先手勝ち' : '後手勝ち';
  if (reason === '%SENNICHITE') return '千日手';
  if (reason === '%JISHOGI') return '持将棋';
  if (reason === '%CHUDAN') return '中断';
  return reason.slice(1);
}

function coordinateLabel(square: string): string {
  if (!/^[1-9]{2}$/.test(square)) return square;
  return `${FILE_LABELS[Number(square[0])]}${RANK_LABELS[Number(square[1])]}`;
}

function inPromotionZone(side: Side, square: string): boolean {
  if (!/^[1-9]{2}$/.test(square)) return false;
  const rank = Number(square[1]);
  return side === '+' ? rank <= 3 : rank >= 7;
}

function promotedFrom(move: Move, previousBoard?: BoardState): PieceCode | undefined {
  if (!previousBoard || move.from === '00') return undefined;
  const before = previousBoard.squares[move.from]?.code;
  if (!before) return undefined;
  return DEMOTE[move.piece] === before ? before : undefined;
}

function isNonPromotion(move: Move, previousBoard?: BoardState): boolean {
  if (!previousBoard || move.from === '00') return false;
  const before = previousBoard.squares[move.from]?.code;
  if (!before || before !== move.piece || !PROMOTABLE.has(before)) return false;
  return inPromotionZone(move.side, move.from) || inPromotionZone(move.side, move.to);
}

export function formatMove(move: Move, previousBoard?: BoardState, previousMove?: Move): string {
  const side = move.side === '+' ? '▲' : '△';
  const sourcePiece = promotedFrom(move, previousBoard);
  const piece = sourcePiece ?? move.piece;
  const destination = previousMove?.to === move.to ? '同' : coordinateLabel(move.to);
  let suffix = '';
  if (move.from === '00') suffix = '打';
  else if (sourcePiece) suffix = '成';
  else if (isNonPromotion(move, previousBoard)) suffix = '不成';
  return `${side}${destination}${PIECE_LABELS[piece] ?? move.piece}${suffix}`;
}

export function formatMoveInGame(game: ParsedGame, ply: number): string {
  const move = game.moveList[ply - 1];
  if (!move) return '';
  return formatMove(move, boardAt(game, move.index - 1), game.moveList[move.index - 2]);
}

export function formatMoveSource(move: Move): string | undefined {
  return move.from === '00' ? undefined : `(${move.from})`;
}

export function formatFinalReason(game: ParsedGame): string | undefined {
  if (!game.finalReason) return undefined;
  if (game.finalReason === 'TORYO') {
    const lastSide = game.moveList.at(-1)?.side;
    const resignedSide = lastSide ? (lastSide === '+' ? '-' : '+') : game.initial.turn;
    return `${resignedSide === '+' ? '▲' : '△'}投了`;
  }
  return FINAL_REASON_LABELS[game.finalReason] ?? game.finalReason;
}
