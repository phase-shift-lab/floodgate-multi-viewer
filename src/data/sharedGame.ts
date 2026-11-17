import {summaryFromCsaName} from '../domain/html';
import type {GameSummary} from '../domain/types';
import {loadGame,STATIC_MODE,type GameResult} from './client';
import {fixtureGame,fixtureSummaries} from './fixtures';

/** A shared ID is a CSA filename, not a position in today's catalog. */
export async function loadSharedGame(id:string,catalog:GameSummary[],signal:AbortSignal):Promise<GameResult> {
  if(!/^wdoor\+[^/\\?#\s]+\+\d{14}$/i.test(id))throw new Error('共有URLの対局IDが不正です');
  const summary=catalog.find(game=>game.id===id)??summaryFromCsaName(id+'.csa');
  if(!summary||summary.id!==id)throw new Error('共有URLの対局IDを確認できません');
  if(STATIC_MODE&&fixtureSummaries.some(game=>game.id===id))return {game:fixtureGame(summary),fixture:true,stale:true,fetchedAt:new Date()};
  const result=await loadGame(summary,signal,{allowFixture:false});
  if(result.fixture||result.game.id!==id)throw new Error('共有された棋譜を取得できません');
  return result;
}
