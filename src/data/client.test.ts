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
