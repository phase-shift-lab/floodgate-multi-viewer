import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {parseCsa} from '../domain/csa';
import {selectFeaturedGames} from '../domain/selection';
import {CompletedGames} from './completedGames';
import {initialGames} from './initialGames';
import type {GameResult} from './client';
const source=(id:string,ended=false)=>({...parseCsa("V2.2\nN+A\nN-B\nPI\n+\n"+(ended?"'$END_TIME:2026/11/03 12:00:01":''),id),blackRate:5000-Number(id.slice(-1)),whiteRate:5000-Number(id.slice(-1))});
const result=(id:string,ended=false):GameResult=>({game:source(id,ended),fixture:false,stale:false,fetchedAt:new Date()});
beforeEach(()=>localStorage.clear());afterEach(()=>vi.useRealTimers());
it('checks zero-ply records before selection and keeps confirmed first-move waiting games',async()=>{
  const load=vi.fn(async game=>result(game.id,game.id==='game0'));
  const checked=await initialGames([source('game0'),source('game1')],1,new CompletedGames(),new AbortController().signal,undefined,load);
  expect(load).toHaveBeenCalledTimes(2);
  expect(selectFeaturedGames(checked.games.filter(game=>!checked.excluded.has(game.id)),1)[0].id).toBe('game1');
  expect(new CompletedGames().apply([source('game0')])[0].live).toBe(false);
});
it('never loads known ended records again on a warm startup and does not block a shared URL',async()=>{
  const cache=new CompletedGames();cache.remember(source('game0',true));
  const load=vi.fn(async game=>result(game.id));
  await initialGames([source('game0'),source('game1')],1,new CompletedGames(),new AbortController().signal,undefined,load);
  expect(load.mock.calls.map(([game])=>game.id)).toEqual(['game1']);
  load.mockClear();await initialGames([source('game0')],1,cache,new AbortController().signal,'game0',load);
  expect(load).not.toHaveBeenCalled();
});
it('bounds startup verification to four and never adopts unverified fallback data',async()=>{
  const load=vi.fn(async game=>({...result(game.id),fixture:true}));
  const games=Array.from({length:6},(_,i)=>source('game'+i));
  const checked=await initialGames(games,4,new CompletedGames(),new AbortController().signal,undefined,load);
  expect(load).toHaveBeenCalledTimes(4);expect(checked.excluded.size).toBe(6);
  expect(localStorage.getItem('fgmv:completed-games:v1')).toBeNull();
});
it('cancels a slow check after three seconds and leaves no timer or completion behind',async()=>{
  vi.useFakeTimers();
  const load=vi.fn((_game,signal:AbortSignal)=>new Promise<GameResult>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));
  const pending=initialGames([source('game0')],1,new CompletedGames(),new AbortController().signal,undefined,load);
  await vi.advanceTimersByTimeAsync(3000);const checked=await pending;
  expect(checked.excluded.has('game0')).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
