import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import {fixtureGames,fixtureSummaries} from './data/fixtures';
import {loadCatalog,loadDay,loadGame,type GameResult} from './data/client';

vi.mock('./data/client',async importOriginal=>({...await importOriginal<typeof import('./data/client')>(),STATIC_MODE:false,
  loadCatalog:vi.fn(),loadDay:vi.fn(),loadGame:vi.fn(),heartbeatStats:vi.fn().mockResolvedValue(undefined),recordPageView:vi.fn().mockResolvedValue(undefined)}));

beforeEach(()=>{
  vi.useFakeTimers();localStorage.clear();sessionStorage.clear();
  history.replaceState(null,'','/');
  localStorage.setItem('fgmv:analysis:v1',JSON.stringify({disabled:true}));
  localStorage.setItem('fgmv:settings:migrated:auto-switch-finished-default-on','1');
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});

it('後手勝ち検索は勝敗不明を除外し、指定日・AI名・レートと組み合わせる',async()=>{
  const summaries=['後手勝ち','先手勝ち',undefined,'後手勝ち'].map((result,index)=>({...fixtureSummaries[0],id:'archive-'+index,
    black:index===3?'Other':'Target',white:'White',live:false,result,startedAt:'2026-11-06T12:00:00+09:00',blackRate:index===3?1000:3000,whiteRate:3000}));
  const old={...summaries[0],id:'old',startedAt:'2026-11-05T12:00:00+09:00'};
  vi.mocked(loadCatalog).mockResolvedValue({games:[...summaries,old],fixture:false,stale:false,fetchedAt:new Date()});
  vi.mocked(loadDay).mockResolvedValue({games:summaries,fixture:false,stale:false,fetchedAt:new Date()});
  vi.mocked(loadGame).mockImplementation(async summary=>({game:{...fixtureGames[0],...summary},fixture:false,stale:false,fetchedAt:new Date()}));
  await act(async()=>{render(<App/>);});
  fireEvent.click(screen.getAllByRole('button',{name:'過去対局'})[0]);
  fireEvent.click(screen.getByRole('button',{name:'後手勝ちを探す'}));
  const rows=()=>document.querySelectorAll('.archive-list button');
  expect(rows()).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('日付'),{target:{value:'2026-11-06'}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'指定日を取得'}));});
  expect(rows()).toHaveLength(2);
  expect(screen.getByText(/検索対象：2026-11-06の取得済み対局/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('AI名'),{target:{value:'Target'}});
  fireEvent.change(screen.getByLabelText('レート下限'),{target:{value:'2500'}});
  expect(rows()).toHaveLength(1);
  expect(rows()[0]).toHaveTextContent('Target');
  fireEvent.change(screen.getByLabelText('レート上限'),{target:{value:'2900'}});
  expect(rows()).toHaveLength(0);
  vi.mocked(loadDay).mockResolvedValue({games:[summaries[0]],fixture:true,stale:false,fetchedAt:new Date()});
  fireEvent.change(screen.getByLabelText('レート上限'),{target:{value:''}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'指定日を取得'}));});
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
  expect(rows()).toHaveLength(1);
  expect(screen.getByText(/検索対象：同梱データ（指定日の実データではありません）/)).toBeInTheDocument();
});

it.each(['following','pinned','past','disabled'])('catalog retains CSA completion and respects %s viewing',async mode=>{
  localStorage.setItem('fgmv:settings:v1',JSON.stringify({boardCount:1,autoSwitchFinished:mode!=='disabled'}));
  const first={...fixtureSummaries[0],live:true,moves:2,blackRate:5000,whiteRate:5000};
  const next={...fixtureSummaries[1],live:true,blackRate:3000,whiteRate:3000};
  let ended=false;
  vi.mocked(loadCatalog).mockImplementation(async()=>({games:[first,next],fixture:false,stale:false,fetchedAt:new Date()}));
  vi.mocked(loadGame).mockImplementation(async summary=>({game:summary.id===first.id?
    {...fixtureGames[0],...first,live:!ended,moves:2,moveList:fixtureGames[0].moveList.slice(0,2),result:ended?'終了':undefined,endedAt:ended?'2026/11/03 12:00:01':undefined}:
    {...fixtureGames[1],...next},fixture:false,stale:false,fetchedAt:new Date()}));
  await act(async()=>{render(<App/>);});
  const label=()=>screen.getByRole('button',{name:'対局を選ぶ'});
  expect(label()).toHaveTextContent('LIVE · '+first.black+' vs '+first.white);
  if(mode==='pinned'){
    fireEvent.click(label());fireEvent.click(screen.getByText('その他の操作'));fireEvent.click(screen.getByRole('button',{name:'ピン留め'}));
  }
  if(mode==='past')fireEvent.click(screen.getByRole('button',{name:'1手戻る'}));
  ended=true;
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
  if(mode==='following') {
    expect(label()).toHaveTextContent('LIVE · '+next.black+' vs '+next.white);
  } else expect(label()).toHaveTextContent('終局 · '+first.black+' vs '+first.white);
});

it('does not mount an ended zero-ply game on either a cold or a warm startup',async()=>{
  localStorage.setItem('fgmv:settings:v1',JSON.stringify({boardCount:1}));
  const ended={...fixtureSummaries[0],live:true,moves:0,blackRate:5000,whiteRate:5000};
  const waiting={...fixtureSummaries[1],live:true,moves:0,blackRate:3000,whiteRate:3000};
  vi.mocked(loadCatalog).mockImplementation(async()=>({games:[ended,waiting],fixture:false,stale:false,fetchedAt:new Date()}));
  vi.mocked(loadGame).mockImplementation(async summary=>({game:{...fixtureGames[summary.id===ended.id?0:1],...summary,
    live:summary.id!==ended.id,moveList:[],moves:0,result:summary.id===ended.id?'不成立（0手終了）':undefined,
    endedAt:summary.id===ended.id?'2026/11/03 12:00:01':undefined},fixture:false,stale:false,fetchedAt:new Date()}));
  let view!:ReturnType<typeof render>;
  await act(async()=>{view=render(<App/>);});
  expect(screen.getByRole('button',{name:'対局を選ぶ'})).toHaveTextContent(waiting.black+' vs '+waiting.white);
  expect(JSON.parse(localStorage.getItem('fgmv:recent:v1')!)).not.toContain(ended.id);
  view.unmount();vi.mocked(loadGame).mockClear();
  await act(async()=>{render(<App/>);});
  expect(screen.getByRole('button',{name:'対局を選ぶ'})).toHaveTextContent(waiting.black+' vs '+waiting.white);
  expect(vi.mocked(loadGame).mock.calls.some(([summary])=>summary.id===ended.id)).toBe(false);
});

it('switches a newly confirmed finished slot immediately without another catalog poll',async()=>{
  localStorage.setItem('fgmv:settings:v1',JSON.stringify({boardCount:1}));
  const first={...fixtureSummaries[0],live:true,moves:2,blackRate:5000,whiteRate:5000};
  const next={...fixtureSummaries[1],live:true,moves:2,blackRate:3000,whiteRate:3000};
  let finish!:(value:GameResult)=>void;
  vi.mocked(loadCatalog).mockResolvedValue({games:[first,next],fixture:false,stale:false,fetchedAt:new Date()});
  vi.mocked(loadGame).mockImplementation(async summary=>summary.id===first.id?new Promise(resolve=>{finish=resolve;}):
    {game:{...fixtureGames[1],...next},fixture:false,stale:false,fetchedAt:new Date()});
  await act(async()=>{render(<App/>);});
  await act(async()=>{finish({game:{...fixtureGames[0],...first,live:false,result:'終了'},fixture:false,stale:false,fetchedAt:new Date()});});
  expect(screen.getByRole('button',{name:'対局を選ぶ'})).toHaveTextContent(next.black+' vs '+next.white);
  expect(loadCatalog).toHaveBeenCalledOnce();
});

it('keeps an explicitly shared finished zero-ply game instead of replacing it',async()=>{
  const shared={...fixtureSummaries[0],live:true,moves:0};
  history.replaceState(null,'','/?boards=1&game='+encodeURIComponent(shared.id));
  vi.mocked(loadCatalog).mockImplementation(async()=>({games:[shared,fixtureSummaries[1]],fixture:false,stale:false,fetchedAt:new Date()}));
  vi.mocked(loadGame).mockResolvedValue({game:{...fixtureGames[0],...shared,live:false,moveList:[],result:'不成立（0手終了）'},fixture:false,stale:false,fetchedAt:new Date()});
  await act(async()=>{render(<App/>);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
  expect(screen.getByRole('button',{name:'対局を選ぶ'})).toHaveTextContent('終局 · '+shared.black+' vs '+shared.white);
});
