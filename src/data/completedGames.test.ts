import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {GameSummary} from '../domain/types';
import {CompletedGames} from './completedGames';
const game=(id='ended'):GameSummary=>({id,group:'g',black:'A',white:'B',live:false,moves:0,result:'不成立（0手終了）',endedAt:'2026/11/03 12:00:01',startedAt:'',csaPath:id+'.csa'});
beforeEach(()=>localStorage.clear());
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('remembers verified completion across app instances and expires after 24 hours',()=>{
  vi.useFakeTimers();const cache=new CompletedGames();expect(cache.remember(game())).toBe(true);
  expect(new CompletedGames().apply([{...game(),live:true,result:undefined}])[0].live).toBe(false);
  vi.advanceTimersByTime(24*60*60*1000);
  expect(new CompletedGames().apply([{...game(),live:true}])[0].live).toBe(true);
});
it('limits metadata to 256 records and does not renew it on identical reports',()=>{
  const cache=new CompletedGames();cache.remember(game());
  const saved=localStorage.getItem('fgmv:completed-games:v1');
  expect(cache.remember(game())).toBe(false);expect(localStorage.getItem('fgmv:completed-games:v1')).toBe(saved);
  for(let i=0;i<256;i++)cache.remember(game('game-'+i));
  expect(JSON.parse(localStorage.getItem('fgmv:completed-games:v1')!)).toHaveLength(256);
  expect(new CompletedGames().apply([{...game(),live:true}])[0].live).toBe(true);
});
it('removes an obsolete zero-ply completion when a newer catalog has actual moves',()=>{
  const cache=new CompletedGames();cache.remember(game());
  expect(cache.apply([{...game(),live:true,moves:2}])[0]).toMatchObject({live:true,moves:2});
  expect(new CompletedGames().apply([{...game(),live:true}])[0].live).toBe(true);
});
it('ignores corrupt metadata and continues in memory when storage is denied',()=>{
  localStorage.setItem('fgmv:completed-games:v1','not JSON');expect(()=>new CompletedGames()).not.toThrow();
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('denied');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
  const cache=new CompletedGames();expect(cache.remember(game())).toBe(true);
  expect(cache.apply([{...game(),live:true}])[0].live).toBe(false);
  expect(cache.remember({...game('live'),live:true})).toBe(false);
});
