import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import {fixtureGames,fixtureSummaries} from './data/fixtures';
import {loadCatalog,loadGame} from './data/client';

vi.mock('./data/client',async importOriginal=>({...await importOriginal<typeof import('./data/client')>(),STATIC_MODE:false,
  loadCatalog:vi.fn(),loadGame:vi.fn(),heartbeatStats:vi.fn().mockResolvedValue(undefined),recordPageView:vi.fn().mockResolvedValue(undefined)}));

beforeEach(()=>{
  vi.useFakeTimers();localStorage.clear();sessionStorage.clear();
  localStorage.setItem('fgmv:analysis:v1',JSON.stringify({disabled:true}));
  localStorage.setItem('fgmv:settings:migrated:auto-switch-finished-default-on','1');
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});

it.each(['following','pinned','past','disabled'])('catalog retains CSA completion and respects %s viewing',async mode=>{
  localStorage.setItem('fgmv:settings:v1',JSON.stringify({boardCount:1,autoSwitchFinished:mode!=='disabled'}));
  const first={...fixtureSummaries[0],live:true,blackRate:5000,whiteRate:5000};
  const next={...fixtureSummaries[1],live:true,blackRate:3000,whiteRate:3000};
  vi.mocked(loadCatalog).mockImplementation(async()=>({games:[first,next],fixture:false,stale:false,fetchedAt:new Date()}));
  vi.mocked(loadGame).mockImplementation(async summary=>({game:summary.id===first.id?
    {...fixtureGames[0],...first,live:false,moves:mode==='past'?2:0,moveList:mode==='past'?fixtureGames[0].moveList.slice(0,2):[],result:'不成立（0手終了）',endedAt:'2026/11/03 12:00:01'}:
    {...fixtureGames[1],...next},fixture:false,stale:false,fetchedAt:new Date()}));
  await act(async()=>{render(<App/>);});
  const label=()=>screen.getByRole('button',{name:'対局を選ぶ'});
  expect(label()).toHaveTextContent('終局 · '+first.black+' vs '+first.white);
  if(mode==='pinned'){
    fireEvent.click(label());fireEvent.click(screen.getByRole('button',{name:'ピン留め'}));
  }
  if(mode==='past')fireEvent.click(screen.getByRole('button',{name:'1手戻る'}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
  if(mode==='following') {
    expect(label()).toHaveTextContent('LIVE · '+next.black+' vs '+next.white);
  } else expect(label()).toHaveTextContent('終局 · '+first.black+' vs '+first.white);
});
