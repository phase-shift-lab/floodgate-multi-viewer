import { applyMove, createInitialBoard, formatMove } from './csa';
import { toSfen } from './localEvaluation';
import type { BoardState, Move, ParsedGame, PieceCode, Side } from './types';

export const PROMOTE: Partial<Record<PieceCode, PieceCode>> = { FU: 'TO', KY: 'NY', KE: 'NK', GI: 'NG', KA: 'UM', HI: 'RY' };
export const DEMOTE: Partial<Record<PieceCode, PieceCode>> = { TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI' };
export const HAND_CODES: PieceCode[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];
const CODES = new Set(['FU','KY','KE','GI','KI','KA','HI','OU','TO','NY','NK','NG','UM','RY']);
const SQUARES = Array.from({ length: 81 }, (_, i) => `${i % 9 + 1}${Math.floor(i / 9) + 1}`);
export const opposite = (side: Side): Side => side === '+' ? '-' : '+';
const zone = (side: Side, rank: number) => side === '+' ? rank <= 3 : rank >= 7;
const dead = (side: Side, code: PieceCode, rank: number) => (code === 'FU' || code === 'KY') ? rank === (side === '+' ? 1 : 9) : code === 'KE' && (side === '+' ? rank <= 2 : rank >= 8);

/** Geometric attacks, including pinned pieces. No recursive legality search. */
export function attacks(board: BoardState, from: string, to: string): boolean {
  const p = board.squares[from];
  if (!p || from === to) return false;
  const dx = Number(to[0]) - Number(from[0]), dy = Number(to[1]) - Number(from[1]);
  const x = Math.abs(dx), y = dy * (p.side === '+' ? -1 : 1);
  const gold = (Math.abs(y) <= 1 && x <= 1 && (y >= 0 || x === 0));
  let ray = false;
  switch (p.code) {
    case 'OU': return x <= 1 && Math.abs(y) <= 1;
    case 'FU': return x === 0 && y === 1;
    case 'KE': return x === 1 && y === 2;
    case 'GI': return (y === 1 && x <= 1) || (y === -1 && x === 1);
    case 'KI': case 'TO': case 'NY': case 'NK': case 'NG': return gold;
    case 'KY': ray = x === 0 && y > 0; break;
    case 'HI': ray = dx === 0 || dy === 0; break;
    case 'KA': ray = x === Math.abs(y); break;
    case 'RY': if (x === 1 && Math.abs(y) === 1) return true; ray = dx === 0 || dy === 0; break;
    case 'UM': if (x + Math.abs(y) === 1) return true; ray = x === Math.abs(y); break;
  }
  if (!ray) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let f = Number(from[0]) + sx, r = Number(from[1]) + sy;
  while (`${f}${r}` !== to) {
    if (board.squares[`${f}${r}`]) return false;
    f += sx; r += sy;
  }
  return true;
}

export function inCheck(board: BoardState, side = board.turn): boolean {
  const king = Object.keys(board.squares).find((s) => board.squares[s].side === side && board.squares[s].code === 'OU');
  return !king || Object.keys(board.squares).some((s) => board.squares[s].side !== side && attacks(board, s, king));
}

export function validateBoard(value: BoardState): void {
  if (!value || !value.squares || !value.hands || !['+','-'].includes(value.turn) || !Number.isSafeInteger(value.ply) || value.ply < 0) throw new Error('初期局面の形式が不正です');
  const totals: Partial<Record<PieceCode, number>> = {};
  for (const [sq, p] of Object.entries(value.squares)) {
    if (!/^[1-9]{2}$/.test(sq) || !p || !['+','-'].includes(p.side) || !CODES.has(p.code)) throw new Error('初期局面の座標または駒が不正です');
    if (dead(p.side, p.code, Number(sq[1]))) throw new Error('行き所のない不成駒があります');
    const base = DEMOTE[p.code] ?? p.code;
    totals[base] = (totals[base] ?? 0) + 1;
  }
  for (const side of ['+', '-'] as const) {
    if (!value.hands[side] || Object.values(value.squares).filter((p) => p.side === side && p.code === 'OU').length !== 1) throw new Error('先後それぞれ1枚の玉が必要です');
    for (const [code, n] of Object.entries(value.hands[side])) {
      if (!HAND_CODES.includes(code as PieceCode) || !Number.isSafeInteger(n) || n < 0) throw new Error('持駒が不正です');
      totals[code as PieceCode] = (totals[code as PieceCode] ?? 0) + n;
    }
    for (let f = 1; f <= 9; f++) {
      if (Object.entries(value.squares).filter(([sq,p]) => sq[0] === String(f) && p.side === side && p.code === 'FU').length > 1) throw new Error('初期局面に二歩があります');
    }
  }
  const limits = { FU:18, KY:4, KE:4, GI:4, KI:4, KA:2, HI:2, OU:2 };
  if (Object.entries(limits).some(([code, max]) => (totals[code as PieceCode] ?? 0) > max)) throw new Error('駒の総数が上限を超えています');
  if (inCheck(value, opposite(value.turn))) throw new Error('手番でない側の玉が王手されています');
}

function basicError(board: BoardState, move: Move): string | undefined {
  if (move.side !== board.turn) return '手番が違います';
  if (!/^[1-9]{2}$/.test(move.to) || !CODES.has(move.piece)) return '座標または駒が不正です';
  const target = board.squares[move.to];
  if (target?.side === move.side) return '自分の駒がある升です';
  if (target?.code === 'OU') return '玉は捕獲できません';
  if (move.from === '00') {
    if (target || !HAND_CODES.includes(move.piece) || !(board.hands[move.side][move.piece]! > 0)) return 'その駒は打てません';
    if (dead(move.side, move.piece, Number(move.to[1]))) return '行き所のない升へは打てません';
    if (move.piece === 'FU' && Object.entries(board.squares).some(([sq,p]) => sq[0] === move.to[0] && p.side === move.side && p.code === 'FU')) return '二歩です';
  } else {
    if (!/^[1-9]{2}$/.test(move.from)) return '移動元が不正です';
    const p = board.squares[move.from];
    if (!p || p.side !== move.side || !attacks(board, move.from, move.to)) return 'その駒の動きでは指せません';
    if (move.piece !== p.code && (PROMOTE[p.code] !== move.piece || !(zone(move.side, Number(move.from[1])) || zone(move.side, Number(move.to[1]))))) return '成り方が不正です';
    if (dead(move.side, move.piece, Number(move.to[1]))) return 'この升では成る必要があります';
  }
  return undefined;
}

export function moveError(board: BoardState, move: Move): string | undefined {
  const error = basicError(board, move);
  if (error) return error;
  const next = applyMove(board, { ...move, index: board.ply + 1 });
  if (inCheck(next, move.side)) return '自分の玉を王手から守ってください';
  // A directly checking pawn cannot be interposed against. Only board moves can reply.
  if (move.from === '00' && move.piece === 'FU') {
    const king = Object.keys(next.squares).find((sq) => next.squares[sq].side === next.turn && next.squares[sq].code === 'OU');
    if (king && attacks(next, move.to, king) && ![...pseudoMoves(next, false)].some((reply) => !basicError(next, reply) && !inCheck(applyMove(next, reply), next.turn))) return '打歩詰です';
  }
  return undefined;
}

function* pseudoMoves(board: BoardState, drops = true): Generator<Move> {
  for (const [from,p] of Object.entries(board.squares)) {
    if (p.side !== board.turn) continue;
    for (const to of SQUARES) {
      if (!attacks(board, from, to)) continue;
      const codes = [p.code];
      if (PROMOTE[p.code] && (zone(p.side, Number(from[1])) || zone(p.side, Number(to[1])))) codes.push(PROMOTE[p.code]!);
      for (const piece of codes) yield makeMove(board, from, to, piece);
    }
  }
  if (drops) for (const piece of HAND_CODES) if ((board.hands[board.turn][piece] ?? 0) > 0) {
    for (const to of SQUARES) yield makeMove(board, '00', to, piece);
  }
}

export function makeMove(board: BoardState, from: string, to: string, piece: PieceCode): Move {
  return { side: board.turn, from, to, piece, index: board.ply + 1, raw: `${board.turn}${from}${to}${piece}` };
}
export function legalMoves(board: BoardState): Move[] { return [...pseudoMoves(board)].filter((m) => !moveError(board, m)); }
export function positionKey(board: BoardState): string { return toSfen(board).split(' ').slice(0,3).join(' '); }
export function terminalReason(board: BoardState, history: string[]): string | undefined {
  if (history.filter((key) => key === positionKey(board)).length >= 4) return '同一局面4回（勝敗は裁定しません）';
  if (!legalMoves(board).length) return inCheck(board) ? '詰み：この枝の入力・解析を停止しました' : '合法手がありません';
}

/** Parse the initial position strictly; the watching parser deliberately remains permissive. */
export function strictInitial(text: string): BoardState {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trimEnd());
  const firstMove = lines.findIndex((l) => /^[+-].+/.test(l));
  const head = firstMove < 0 ? lines : lines.slice(0, firstMove);
  const rows = head.filter((l) => /^P[1-9]/.test(l));
  const pi = head.filter((l) => l.startsWith('PI'));
  if ((rows.length && pi.length) || pi.length > 1 || (rows.length !== 9 && !pi.length) || head.some((l) => l.startsWith('P') && !/^P(?:[1-9]|[+-]|I)/.test(l))) throw new Error('未対応または不完全な初期局面です');
  const board: BoardState = pi.length ? createInitialBoard() : { squares: {}, hands: { '+':{}, '-':{} }, turn:'+', ply:0 };
  if (pi.length) {
    if (!/^PI(?:[1-9]{2}[A-Z]{2})*$/.test(pi[0])) throw new Error('駒落ち初期局面が不正です');
    for (const m of pi[0].slice(2).matchAll(/([1-9]{2})([A-Z]{2})/g)) {
      if (board.squares[m[1]]?.code !== m[2]) throw new Error('駒落ちの駒が一致しません');
      delete board.squares[m[1]];
    }
  }
  const seen = new Set<string>();
  for (const line of rows) {
    if (seen.has(line[1]) || !/^P[1-9](?:[+-][A-Z]{2}| \* ){9}$/.test(line + (line.endsWith('*') ? ' ' : ''))) throw new Error('盤面行が不正です');
    seen.add(line[1]);
    const body = line.slice(2).padEnd(27, ' ');
    for (let i = 0; i < 9; i++) {
      const token = body.slice(i*3, i*3+3);
      if (token.trim() !== '*') board.squares[`${9-i}${line[1]}`] = { side: token[0] as Side, code: token.slice(1) as PieceCode };
    }
  }
  for (const line of head.filter((l) => /^P[+-]/.test(l))) {
    if (!/^P[+-](?:\d{2}[A-Z]{2})*$/.test(line)) throw new Error('初期駒の指定が不正です');
    const side = line[1] as Side;
    for (const m of line.slice(2).matchAll(/(\d{2})([A-Z]{2})/g)) {
      const code = m[2] as PieceCode;
      if (m[1] === '00') board.hands[side][code] = (board.hands[side][code] ?? 0) + 1;
      else {
        if (!/^[1-9]{2}$/.test(m[1]) || board.squares[m[1]]) throw new Error('初期駒の升が重複しています');
        board.squares[m[1]] = { side, code };
      }
    }
  }
  const turns = head.filter((l) => l === '+' || l === '-');
  if (turns.length !== 1) throw new Error('初期手番が不明です');
  board.turn = turns[0] as Side;
  validateBoard(board);
  return board;
}

export async function validatedPrefix(game: ParsedGame, ply: number, signal?: AbortSignal): Promise<{ initial: BoardState; prefix: Move[]; board: BoardState; keys: string[] }> {
  if (!Number.isSafeInteger(ply) || ply < 0 || ply > game.moveList.length) throw new Error('開始手数が不正です');
  const initial = strictInitial(game.sourceText);
  if (positionKey(initial) !== positionKey(game.initial)) throw new Error('初期局面と観戦データが一致しません');
  let board = initial;
  const keys = [positionKey(initial)], prefix: Move[] = [];
  for (const line of game.sourceText.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trimEnd())) {
    if (prefix.length >= ply) break;
    if (/^%/.test(line)) throw new Error(`${prefix.length + 1}手目：終局後の着手は検討に使えません`);
    if (!/^[+-].+/.test(line)) continue;
    const m = line.match(/^([+-])(\d{2})(\d{2})([A-Z]{2})$/);
    const expected = game.moveList[prefix.length];
    const error = !m || expected?.raw !== line ? 'CSAの着手行が不正です' : moveError(board, expected);
    if (error) throw new Error(`${prefix.length + 1}手目：${error}。${prefix.length}手目以前から開始してください`);
    if (terminalReason(board, keys)) throw new Error(`${prefix.length}手目で終端に達しています`);
    board = applyMove(board, expected); prefix.push(expected); keys.push(positionKey(board));
    if (prefix.length % 24 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) throw new Error('検証を取り消しました');
    }
  }
  if (signal?.aborted) throw new Error('検証を取り消しました');
  if (prefix.length !== ply) throw new Error('起点までの棋譜が不足しています');
  return { initial, prefix, board, keys };
}

export function fromUsi(board: BoardState, token: string): Move | undefined {
  const n = token.match(/^([1-9])([a-i])([1-9])([a-i])(\+)?$/), d = token.match(/^([PLNSGBR])\*([1-9])([a-i])$/);
  const sq = (f:string,r:string) => f + ('abcdefghi'.indexOf(r)+1);
  if (n) {
    const from = sq(n[1],n[2]), p = board.squares[from];
    if (!p) return;
    const code = n[5] ? PROMOTE[p.code] : p.code;
    if (code) return makeMove(board,from,sq(n[3],n[4]),code);
  }
  if (d) return makeMove(board,'00',sq(d[2],d[3]),({P:'FU',L:'KY',N:'KE',S:'GI',G:'KI',B:'KA',R:'HI'} as Record<string,PieceCode>)[d[1]]);
}
export function validatedPv(board: BoardState, pv: string[], limit: number): { labels: string[]; truncated: boolean } {
  const labels: string[] = [];
  let previous: Move | undefined;
  for (const token of pv.slice(0,limit)) {
    const move = fromUsi(board,token);
    if (!move || moveError(board,move)) return { labels, truncated:true };
    labels.push(formatMove(move,board,previous)); previous = move; board = applyMove(board,move);
  }
  return { labels,truncated:false };
}
