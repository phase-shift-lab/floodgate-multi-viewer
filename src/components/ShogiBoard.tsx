import type { BoardState, Move, PieceCode, Side } from '../domain/types';

const GLYPH: Record<PieceCode, string> = {
  FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
  TO: 'と', NY: '杏', NK: '圭', NG: '全', UM: '馬', RY: '龍',
};

const HAND_ORDER: PieceCode[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];

function Hand({ side, state, upside = false }: { side: Side; state: BoardState; upside?: boolean }) {
  const sideLabel = side === '+' ? '先手' : '後手';
  const items = HAND_ORDER.flatMap((code) => {
    const count = state.hands[side][code] ?? 0;
    return count ? [{ code, count }] : [];
  });
  return (
    <div className="hand" role="group" aria-label={`${sideLabel}の持駒`}>
      {items.length ? (
        <ul className="hand-pieces">
          {items.map(({ code, count }) => (
            <li key={code} className="hand-piece-item" aria-label={`${sideLabel}の${GLYPH[code]} ${count}枚`}>
              <span className={`hand-piece${upside ? ' upside' : ''}`} aria-hidden="true">{GLYPH[code]}</span>
              {count > 1 && <span className="hand-count" aria-hidden="true">×{count}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <span className="hand-empty">持駒なし</span>
      )}
    </div>
  );
}

export function ShogiBoard({ state, flipped, lastMove }: { state: BoardState; flipped: boolean; lastMove?: Move }) {
  const files = flipped ? [1,2,3,4,5,6,7,8,9] : [9,8,7,6,5,4,3,2,1];
  const ranks = flipped ? [9,8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8,9];
  const topSide: Side = flipped ? '+' : '-';
  const bottomSide: Side = flipped ? '-' : '+';
  return (
    <div className="board-wrap">
      <div className="board-stack">
        <Hand side={topSide} state={state} upside />
        <div className="shogi-board" role="grid" aria-label={`将棋盤 ${state.ply}手目`}>
          {ranks.flatMap((rank) => files.map((file) => {
            const square = `${file}${rank}`;
            const piece = state.squares[square];
            const isLastFrom = lastMove?.from !== '00' && lastMove?.from === square;
            const isLastTo = lastMove?.to === square;
            return (
              <div key={square} role="gridcell" aria-label={`${file}${rank}${piece ? ` ${piece.side === '+' ? '先手' : '後手'}${GLYPH[piece.code]}` : ' 空'}${isLastFrom ? ' 直前手の移動元' : ''}${isLastTo ? ' 直前手の移動先' : ''}`} className={`square${isLastFrom ? ' last-from' : ''}${isLastTo ? ' last-to' : ''}`}>
                {piece && <span className={`piece ${piece.side === topSide ? 'upside' : ''}`}>{GLYPH[piece.code]}</span>}
              </div>
            );
          }))}
        </div>
        <Hand side={bottomSide} state={state} />
      </div>
    </div>
  );
}
