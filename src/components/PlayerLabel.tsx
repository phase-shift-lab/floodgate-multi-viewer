import type { Side } from '../domain/types';
import { rateLabel } from '../domain/selection';

export interface PlayerInfo { name: string; rating?: number; favorite?: boolean; onFavorite?: () => void }
export type BoardPlayers = Record<Side,PlayerInfo>;
export function PlayerLabel({side,turn,player,position}:{side:Side;turn:Side;player:PlayerInfo;position:'top'|'bottom'}) {
  const label=side==='+'?'先手':'後手';
  return <div className={`board-player${side===turn?' has-turn':''}`} data-side={side} aria-label={`盤面${position==='top'?'上':'下'}側の対局者`}>
    <span className="player-side">{side==='+'?'▲':'△'} {label}</span>
    <strong title={player.name}>{player.name}</strong>
    <span className="turn-badge" aria-label={side===turn?`${label}の手番`:undefined}>{side===turn?'手番':''}</span>
    <span className="player-rating">{rateLabel(player.rating)}</span>
    {player.onFavorite && <button className="star" aria-label={`${player.name}をお気に入り${player.favorite?'解除':'登録'}`} onClick={player.onFavorite}>{player.favorite?'★':'☆'}</button>}
  </div>;
}
