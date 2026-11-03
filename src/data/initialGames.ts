import {selectFeaturedGames} from '../domain/selection';
import type {GameSummary} from '../domain/types';
import {loadGame,type GameResult} from './client';
import {CompletedGames} from './completedGames';

/** Verify at most four zero-ply automatic candidates before exposing a board. */
export async function initialGames(catalog:GameSummary[],count:number,completed:CompletedGames,signal:AbortSignal,sharedId?:string,load=loadGame) {
  let games=completed.apply(catalog);
  const verified=new Set<string>(),excluded=new Set<string>();
  const targetCount=Math.max(0,count-(games.some(game=>game.id===sharedId)?1:0));
  for(let attempt=0;attempt<4;attempt++) {
    if(signal.aborted)throw new DOMException('対局確認を中止しました','AbortError');
    const candidates=selectFeaturedGames(games.filter(game=>game.id!==sharedId&&!excluded.has(game.id)),targetCount);
    const candidate=candidates.find(game=>game.live&&game.moves===0&&!verified.has(game.id));
    if(!candidate)break;
    const controller=new AbortController();
    const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,3000);
    let result:GameResult|undefined;
    try {result=await load(candidate,controller.signal);}
    catch {if(signal.aborted)throw new DOMException('対局確認を中止しました','AbortError');}
    finally {clearTimeout(timeout);signal.removeEventListener('abort',abort);}
    if(signal.aborted)throw new DOMException('対局確認を中止しました','AbortError');
    if(!result||controller.signal.aborted||result.fixture||result.stale) {excluded.add(candidate.id);continue;}
    const game=result.game;
    verified.add(candidate.id);
    if(game.live)completed.forget(game.id);else completed.remember(game);
    games=games.map(item=>item.id===candidate.id?{...item,live:game.live,moves:game.moveList.length,result:game.result,endedAt:game.endedAt}:item);
  }
  for(const game of games)if(game.live&&game.moves===0&&!verified.has(game.id))excluded.add(game.id);
  return {games,excluded};
}
