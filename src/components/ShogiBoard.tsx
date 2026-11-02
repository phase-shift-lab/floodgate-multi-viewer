import type { BoardState, Move, PieceCode, Side } from '../domain/types';
import { PlayerLabel, type BoardPlayers } from './PlayerLabel';

const GLYPH: Record<PieceCode, string> = {
  FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
  TO: 'と', NY: '杏', NK: '圭', NG: '全', UM: '馬', RY: '龍',
};

const HAND_ORDER: PieceCode[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];

interface BoardInput { selected?: string; legalTargets?: string[]; onSquare?: (square: string) => void; onHand?: (side: Side, code: PieceCode) => void; locked?: boolean }
function Hand({ side, state, position, upside = false, input }: { side: Side; state: BoardState; position: 'front' | 'back'; upside?: boolean; input: BoardInput }) {
  const sideLabel = side === '+' ? '先手' : '後手';
  const items = HAND_ORDER.flatMap((code) => {
    const count = state.hands[side][code] ?? 0;
    return count ? [{ code, count }] : [];
  });
  return (
    <div className={`hand ${position}`} role="group" aria-label={`${sideLabel}の持駒`} data-position={position}>
      {items.length ? (
        <ul className="hand-pieces">
          {items.map(({ code, count }) => (
            <li key={code} className="hand-piece-item" aria-label={`${sideLabel}の${GLYPH[code]} ${count}枚`}>
              {input.onHand ? <button type="button" className={`hand-piece${upside ? ' upside' : ''}${input.selected === `hand:${code}` && state.turn === side ? ' selected-piece' : ''}`} disabled={input.locked || side !== state.turn} aria-label={`${sideLabel}の${GLYPH[code]}を打つ ${count}枚`} aria-pressed={input.selected === `hand:${code}` && state.turn === side} onClick={() => input.onHand?.(side,code)}>{GLYPH[code]}</button> : <span className={`hand-piece${upside ? ' upside' : ''}`} aria-hidden="true">{GLYPH[code]}</span>}
              <span className="hand-count-row" aria-hidden="true">
                {count > 1 && <span className="hand-count">{count}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="hand-empty" aria-label="持駒なし" />
      )}
    </div>
  );
}

export function ShogiBoard({ state, flipped, lastMove, players, ...input }: { state: BoardState; flipped: boolean; lastMove?: Move; players?:BoardPlayers } & BoardInput) {
  const files = flipped ? [1,2,3,4,5,6,7,8,9] : [9,8,7,6,5,4,3,2,1];
  const ranks = flipped ? [9,8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8,9];
  const topSide: Side = flipped ? '+' : '-';
  const bottomSide: Side = flipped ? '-' : '+';
  return (
    <div className="board-wrap">
      <div className="board-stack">
        {players && <PlayerLabel side={topSide} turn={state.turn} player={players[topSide]} position="top"/>}
        <Hand side={topSide} state={state} position="back" upside input={input} />
        <div className="board-coordinates">
        <div className="file-labels" aria-label="筋の番号">{files.map((file) => <span key={file}>{file}</span>)}</div>
        <div className="board-with-ranks">
        <div className="shogi-board" role="grid" aria-label={`将棋盤 ${state.ply}手目`}>
          {ranks.flatMap((rank) => files.map((file) => {
            const square = `${file}${rank}`;
            const piece = state.squares[square];
            const isLastFrom = lastMove?.from !== '00' && lastMove?.from === square;
            const isLastTo = lastMove?.to === square;
            const Tag = input.onSquare ? 'button' : 'div';
            return (
              <Tag key={square} role="gridcell" data-square={square} disabled={input.onSquare ? input.locked : undefined} onClick={input.onSquare ? () => input.onSquare?.(square) : undefined} aria-selected={input.onSquare ? input.selected === square : undefined} aria-label={`${file}${rank}${piece ? ` ${piece.side === '+' ? '先手' : '後手'}${GLYPH[piece.code]}` : ' 空'}${isLastFrom ? ' 直前手の移動元' : ''}${isLastTo ? ' 直前手の移動先' : ''}${input.legalTargets?.includes(square) ? ' 移動可能' : ''}`} className={`square${isLastFrom ? ' last-from' : ''}${isLastTo ? ' last-to' : ''}${input.selected === square ? ' selected-square' : ''}${input.legalTargets?.includes(square) ? ' legal-target' : ''}`}>
                {piece && <span className={`piece ${piece.side === topSide ? 'upside' : ''}`}>{GLYPH[piece.code]}</span>}
              </Tag>
            );
          }))}
        </div>
        <div className="rank-labels" aria-label="段の番号">{ranks.map((rank) => <span key={rank}>{'一二三四五六七八九'[rank-1]}</span>)}</div>
        </div></div>
        <Hand side={bottomSide} state={state} position="front" input={input} />
        {players && <PlayerLabel side={bottomSide} turn={state.turn} player={players[bottomSide]} position="bottom"/>}
      </div>
    </div>
  );
}
