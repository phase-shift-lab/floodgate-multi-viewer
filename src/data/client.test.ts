import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollDelay } from './client';
import type { GameSummary } from '../domain/types';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});

it('does not let a lagging live catalog overwrite completion parsed from the CSA',async()=>{
  vi.stubEnv('VITE_API_BASE','https://relay.example');vi.resetModules();
  const fetchMock=vi.fn().mockResolvedValue(new Response("V2.2\nN+Alpha\nN-Beta\nPI\n+\n'$END_TIME:2026/11/03 12:00:01\n"));
  vi.stubGlobal('fetch',fetchMock);
  const {loadGame}=await import('./client');
  const summary:GameSummary={id:'game',group:'g',black:'Alpha',white:'Beta',live:true,moves:99,startedAt:'',csaPath:'game.csa'};
  const result=await loadGame(summary,new AbortController().signal);
  expect(result).toMatchObject({fixture:false,game:{id:'game',live:false,moves:0,result:'不成立（0手終了）',endedAt:'2026/11/03 12:00:01'}});
  fetchMock.mockResolvedValue(new Response('V2.2\nN+Alpha\nN-Beta\nPI\n+\n+7776FU\n%TORYO\n'));
  expect(await loadGame(summary,new AbortController().signal)).toMatchObject({game:{live:false,moves:1,result:'先手勝ち'}});
  fetchMock.mockResolvedValue(new Response('V2.2\nN+Alpha\nN-Beta\nPI\n+\n'));
  expect(await loadGame({...summary,moves:0},new AbortController().signal)).toMatchObject({game:{live:true,moves:0,result:undefined}});
});

describe('pollDelay', () => {
  it('uses a short visible-tab interval and exponential backoff', () => {
    expect(pollDelay(0, false)).toBe(3_000);
    expect(pollDelay(1, false)).toBe(6_000);
    expect(pollDelay(5, false)).toBe(48_000);
  });

  it('slows hidden tabs and caps retries at one minute', () => {
    expect(pollDelay(0, true)).toBe(20_000);
    expect(pollDelay(5, true)).toBe(60_000);
    expect(pollDelay(99, true)).toBe(60_000);
  });
});

it('shared records bypass today and never substitute fixture moves on failure',async()=>{
 vi.stubEnv('VITE_API_BASE','https://relay.example');vi.resetModules();
 const fetchMock=vi.fn().mockResolvedValue(new Response('V2.2\nN+PastAlpha\nN-PastBeta\nPI\n+\n+7776FU\n%TORYO\n'));
 vi.stubGlobal('fetch',fetchMock);
 const {loadSharedGame}=await import('./sharedGame');
 const id='wdoor+floodgate-900-0+PastAlpha+PastBeta+20261101000000';
 const signal=new AbortController().signal;
 expect(await loadSharedGame(id,[],signal)).toMatchObject({fixture:false,game:{id,live:false,moves:1}});
 expect(fetchMock.mock.calls[0][0]).toBe('https://relay.example/api/csa?file='+encodeURIComponent(id+'.csa'));
 fetchMock.mockResolvedValue(new Response('missing',{status:404}));
 await expect(loadSharedGame(id,[],signal)).rejects.toThrow('404');
 fetchMock.mockResolvedValue(new Response('<html>unavailable</html>'));
 await expect(loadSharedGame(id,[],signal)).rejects.toThrow('CSA');
 fetchMock.mockClear();
 for(const bad of ['../file','wdoor+g+A+B+20261101000000/other','wdoor+g+A+B+20261101000000?x=1','wdoor+g+A+B+20261101000000%2Fcsa'])await expect(loadSharedGame(bad,[],signal)).rejects.toThrow();
 expect(fetchMock).not.toHaveBeenCalled();
});
