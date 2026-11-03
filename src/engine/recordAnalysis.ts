import { boardAt } from '../domain/csa';
import { toEnginePosition, type Candidate, type LocalScore } from '../domain/localEvaluation';
import { validatedPrefix } from '../domain/studyRules';
import type { ParsedGame } from '../domain/types';
import { localAnalysis, type AnalysisOptions } from './localAnalysis';

export const RECORD_TIMES = [1,3,5,10] as const;
export type RecordSeconds = typeof RECORD_TIMES[number];
export interface RecordResult { score?:LocalScore; candidates:Candidate[] }
export interface RecordState {
  phase:'idle'|'preparing'|'running'|'stopped'|'paused'|'done'|'error';
  game?:ParsedGame; seconds:RecordSeconds; results:RecordResult[]; message?:string;
}

/** One frozen record, one outstanding search, and bounded PVs per position. */
export class RecordAnalysis {
  private state:RecordState={phase:'idle',seconds:1,results:[]};
  private listeners=new Set<()=>void>();
  private controller?:AbortController;
  private cancel?:()=>void;
  private release?:()=>void;
  private generation=0;
  private key='record:'+crypto.randomUUID();
  getState=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private update(patch:Partial<RecordState>) { this.state={...this.state,...patch};for(const listener of this.listeners)listener(); }
  stop(phase:'stopped'|'paused'='stopped') {
    this.generation++;this.controller?.abort();this.cancel?.();this.cancel=undefined;this.release?.();this.release=undefined;
    if(this.state.phase==='running'||this.state.phase==='preparing')this.update({phase});
  }
  async start(game:ParsedGame,seconds:RecordSeconds,prepare:(signal:AbortSignal)=>Promise<boolean>,resume=false) {
    if(!RECORD_TIMES.includes(seconds))return;
    this.stop();
    const frozen=resume&&this.state.game?this.state.game:structuredClone(game);
    const results=resume?this.state.results:[];
    this.update({game:frozen,seconds,results,phase:'preparing',message:undefined});
    const generation=++this.generation,controller=new AbortController();this.controller=controller;
    try {
      await validatedPrefix(frozen,frozen.moveList.length,controller.signal);
      if(generation!==this.generation)return;
      if(!await prepare(controller.signal))throw new Error('解析の準備が完了していません。');
      if(generation!==this.generation)return;
      if(document.hidden){this.update({phase:'paused'});return;}
      this.release=localAnalysis.reserve(this.key);
      this.update({phase:'running'});
      this.next(generation);
    } catch(error) {
      if(generation!==this.generation)return;
      this.stop();this.update({phase:'error',message:error instanceof Error?error.message:String(error)});
    }
  }
  private next(generation:number) {
    if(generation!==this.generation)return;
    const {game,results,seconds}=this.state;if(!game)return;
    const ply=results.length;
    if(ply>game.moveList.length){this.release?.();this.release=undefined;this.update({phase:'done'});return;}
    const board=boardAt(game,ply);
    this.cancel=localAnalysis.request(this.key,toEnginePosition(game,ply),board.turn,state=>{
      if(generation!==this.generation)return;
      if(state.phase==='error') {this.stop();this.update({phase:'error',message:state.message??'解析に失敗しました。'});return;}
      if(state.phase==='paused'){this.stop('paused');return;}
      if(state.phase!=='done')return;
      const result:RecordResult={score:state.score,candidates:(state.candidates??[]).slice(0,3).map(candidate=>({...candidate,pv:candidate.pv.slice(0,12)}))};
      // Leave the worker's bestmove callback before cancelling/queueing a job.
      queueMicrotask(()=>{
        if(generation!==this.generation)return;
        this.cancel?.();this.cancel=undefined;
        this.update({results:[...this.state.results,result]});this.next(generation);
      });
    },{milliseconds:seconds*1000 as AnalysisOptions['milliseconds']});
  }
}
