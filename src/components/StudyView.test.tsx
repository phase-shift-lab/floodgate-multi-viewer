import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StudyView, type ReturnToSource } from './StudyView';
import { loadGame } from '../data/client';
import { fixtureGames } from '../data/fixtures';
import { createInitialBoard, parseCsa } from '../domain/csa';
import { positionKey } from '../domain/studyRules';
import type { StudySession } from '../domain/studySession';
import type { BoardState } from '../domain/types';

vi.mock('./LocalEvaluation',()=>({LocalEvaluation:()=> <div>解析表示</div>}));
vi.mock('../data/client',()=>({loadGame:vi.fn()}));
function session(board: BoardState): StudySession {
  return {schema:1,id:'ui-test',at:Date.now(),game:{...parseCsa('V2\nPI\n+'),initial:board},origin:0,nodes:{root:{id:'root',children:[],key:positionKey(board)}},current:'root',flipped:false,enabled:false,seconds:1,stopped:false,watch:{at:Date.now(),view:'live',slots:[],settings:{boardCount:1,playbackSeconds:1,orientation:'black',theme:'dark',autoSwitchFinished:true}}};
}
function Harness({initial,onReturn=async()=>{}}:{initial:StudySession;onReturn?:(target?:ReturnToSource)=>Promise<void>}) {
  const [s,setS]=useState(initial);
  const [settingsRequest,setSettingsRequest]=useState(0);
  return <><button onClick={()=>setSettingsRequest(n=>n+1)}>設定を開く</button><StudyView settingsRequest={settingsRequest} session={s} onChange={setS} onReturn={onReturn} sound={false} onSound={()=>{}} /></>;
}
const savedBranches = () => Object.keys(JSON.parse(sessionStorage.getItem('fgmv:study:v1')!).nodes).length-1;
const square = (sq:string) => document.querySelector<HTMLButtonElement>(`[data-square="${sq}"]`)!;
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();sessionStorage.clear();});
describe('study input transactions',()=>{
  it('counts new source moves from its original final move, keeps the variation frozen and can pick the source record',async()=>{
    vi.useFakeTimers();
    const full={...fixtureGames[0],live:true,moveList:fixtureGames[0].moveList.slice(0,2)};
    const next={...full,moveList:fixtureGames[0].moveList.slice(0,3)};
    const initial=session(full.initial); initial.game={...full,moveList:[]};
    initial.watch.slots=[{summary:full,game:full,pinned:false,ply:0,flipped:false,enabled:false,followingLatest:false}];
    vi.mocked(loadGame).mockResolvedValue({game:next,fixture:false,stale:false,fetchedAt:new Date()});
    const onReturn=vi.fn(async()=>{});render(<Harness initial={initial} onReturn={onReturn} />);
    fireEvent.click(square('77'));fireEvent.click(square('76'));
    await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
    expect(screen.getByText('本譜に新着1手')).toBeInTheDocument();
    expect(square('76')).toHaveTextContent('歩');expect(square('77')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button',{name:'棋譜を開く'}));
    fireEvent.click(screen.getByRole('button',{name:'本譜'}));
    fireEvent.click(screen.getByRole('button',{name:/^3\./}));fireEvent.click(screen.getByRole('button',{name:'盤面に表示'}));
    expect(onReturn).toHaveBeenCalledWith({ply:3,game:next});
    expect(JSON.parse(sessionStorage.getItem('fgmv:study:v1')!).nodes).toHaveProperty('root');
  });
  it('promotion cancellation and Escape leave board and branch unchanged; confirm once',()=>{
    const board:BoardState={squares:{'99':{side:'+',code:'OU'},'11':{side:'-',code:'OU'},'54':{side:'+',code:'FU'}},hands:{'+':{},'-':{}},turn:'+',ply:0};
    render(<Harness initial={session(board)} />);
    fireEvent.click(square('54')); fireEvent.click(square('53'));
    expect(screen.getByRole('dialog',{name:'成りの選択'})).toBeInTheDocument();
    expect(square('54')).toHaveTextContent('歩'); expect(square('53')).toBeEmptyDOMElement();
    fireEvent.keyDown(window,{key:'Escape'}); expect(screen.queryByRole('dialog')).toBeNull(); expect(square('54')).toHaveTextContent('歩');
    fireEvent.click(square('54'));fireEvent.click(square('53'));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'成る'}));
    expect(square('53')).toHaveTextContent('と'); expect(square('54')).toBeEmptyDOMElement(); expect(savedBranches()).toBe(1);
  });
  it('hand drops select legal squares, retain count, and undo restores capture-free state',()=>{
    const board:BoardState={squares:{'99':{side:'+',code:'OU'},'11':{side:'-',code:'OU'}},hands:{'+':{FU:2},'-':{}},turn:'+',ply:0};
    render(<Harness initial={session(board)} />);
    fireEvent.click(screen.getByRole('button',{name:'先手の歩を打つ 2枚'})); expect(square('55')).toHaveClass('legal-target'); expect(square('51')).not.toHaveClass('legal-target');
    fireEvent.click(square('55')); expect(square('55')).toHaveTextContent('歩'); expect(screen.getByRole('button',{name:'先手の歩を打つ 1枚'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'1手戻る'})); expect(square('55')).toBeEmptyDOMElement(); expect(screen.getByRole('button',{name:'先手の歩を打つ 2枚'})).not.toBeDisabled();
  });
  it('storage refusal prevents a move from becoming visible',()=>{
    render(<Harness initial={session(createInitialBoard())} />);
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
    fireEvent.click(square('77'));fireEvent.click(square('76'));
    expect(square('77')).toHaveTextContent('歩'); expect(square('76')).toBeEmptyDOMElement(); expect(screen.getByRole('alert')).toHaveTextContent('保存できません');
  });
  it('clear branches requires confirmation; cancel retains tree',()=>{
    render(<Harness initial={session(createInitialBoard())} />);
    fireEvent.click(square('77'));fireEvent.click(square('76'));
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button',{name:'設定を開く'}));
    fireEvent.click(screen.getByRole('button',{name:'変化を全消去'}));expect(savedBranches()).toBe(1);
    confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'設定を開く'}));fireEvent.click(screen.getByRole('button',{name:'変化を全消去'}));expect(savedBranches()).toBe(0);expect(square('77')).toHaveTextContent('歩');
  });
});
