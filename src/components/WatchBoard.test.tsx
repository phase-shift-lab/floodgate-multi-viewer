import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialBoard, applyMove } from '../domain/csa';
import type { BoardState, Move } from '../domain/types';
import { WatchBoard } from './WatchBoard';
const players={'+':{name:'Sente'},'-':{name:'Gote'}};
const square=(s:string)=>document.querySelector<HTMLElement>(`[data-square="${s}"]`)!;
function props(board:BoardState=createInitialBoard()){return{board,revision:'a',flipped:false,players,disabled:false,onMove:vi.fn<(move:Move,isCurrent:()=>boolean)=>Promise<boolean>>(async()=>true),onNotice:vi.fn()};}
afterEach(cleanup);
describe('automatic study input',()=>{
 it('selection, invalid move and cancellation do not start study; a legal move starts once',async()=>{
  const p=props();render(<WatchBoard {...p}/>);
  fireEvent.click(square('77'));expect(p.onMove).not.toHaveBeenCalled();expect(square('76')).toHaveClass('legal-target');
  fireEvent.click(square('75'));expect(p.onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(window,{key:'Escape'});expect(square('76')).not.toHaveClass('legal-target');
  fireEvent.click(square('77'));await act(async()=>{fireEvent.click(square('76'));fireEvent.click(square('76'));});
  expect(p.onMove).toHaveBeenCalledTimes(1);expect(p.onMove.mock.calls[0][0]).toMatchObject({from:'77',to:'76',piece:'FU'});
 });
 it('a new source position invalidates selection and an in-flight move guard',async()=>{
  const p=props();let guard=()=>false;
  p.onMove.mockImplementation(async(_m,isCurrent)=>{guard=isCurrent;return false;});
  const view=render(<WatchBoard {...p}/>);fireEvent.click(square('77'));
  const next=applyMove(p.board,{from:'77',to:'76',piece:'FU',side:'+',index:1,raw:'+7776FU'});
  await act(async()=>{view.rerender(<WatchBoard {...p} board={next} revision="b"/>);});
  expect(square('76')).not.toHaveClass('legal-target');expect(p.onNotice).toHaveBeenCalledWith(expect.stringContaining('局面が更新'));
  view.rerender(<WatchBoard {...p}/>);fireEvent.click(square('77'));await act(async()=>{fireEvent.click(square('76'));});
  expect(guard()).toBe(true);view.rerender(<WatchBoard {...p} board={next} revision="c"/>);expect(guard()).toBe(false);
 });
 it('promotion is confirmed before study starts, and hand drops use the same path',async()=>{
  const board:BoardState={squares:{'99':{side:'+',code:'OU'},'11':{side:'-',code:'OU'},'54':{side:'+',code:'FU'}},hands:{'+':{GI:1},'-':{}},turn:'+',ply:0};
  const p=props(board);render(<WatchBoard {...p}/>);
  fireEvent.click(square('54'));fireEvent.click(square('53'));expect(p.onMove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(p.onMove).not.toHaveBeenCalled();
  fireEvent.click(square('54'));fireEvent.click(square('53'));await act(async()=>{fireEvent.click(screen.getByRole('button',{name:/^成る$/}));});
  expect(p.onMove.mock.calls[0][0]).toMatchObject({piece:'TO'});
  fireEvent.click(screen.getByRole('button',{name:'先手の銀を打つ 1枚'}));await act(async()=>{fireEvent.click(square('55'));});
  expect(p.onMove.mock.calls[1][0]).toMatchObject({from:'00',to:'55',piece:'GI'});
 });
});
