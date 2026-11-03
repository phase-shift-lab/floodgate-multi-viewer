import { preparationRecovery } from './isolation';
import type { ParsedGame } from '../domain/types';
import { RECORD_TIMES, type RecordSeconds } from './recordAnalysis';

const KEY='fgmv:record-preparation:v1';
interface Recovery { owner:string;game:ParsedGame;seconds:RecordSeconds;at:number }
function read():Recovery|undefined {
  try {
    const raw=sessionStorage.getItem(KEY);sessionStorage.removeItem(KEY);
    if(!raw||!preparationRecovery)return;
    const value=JSON.parse(raw) as Recovery;
    if(typeof value.owner!=='string'||!RECORD_TIMES.includes(value.seconds)||!value.game?.moveList||!Number.isFinite(value.at)||Date.now()-value.at<0||Date.now()-value.at>120_000)return;
    return value;
  }catch{return;}
}
let recovery=read();
export function hasRecordRecovery(owner:string) { return recovery?.owner===owner; }
export function peekRecordRecovery(owner:string) { return recovery?.owner===owner?recovery:undefined; }
export function takeRecordRecovery(owner:string) {
  if(recovery?.owner!==owner)return;
  const value=recovery;recovery=undefined;return value;
}
export function saveRecordRecovery(owner:string,game:ParsedGame,seconds:RecordSeconds) {
  const raw=JSON.stringify({owner,game,seconds,at:Date.now()});
  if(raw.length>512*1024)throw new Error('棋譜が大きいため解析準備を保存できません。端末解析を準備してから再度開始してください。');
  sessionStorage.setItem(KEY,raw);
}
export function clearRecordRecovery(owner:string) {
  try {
    const raw=sessionStorage.getItem(KEY);
    if(raw&&JSON.parse(raw).owner===owner)sessionStorage.removeItem(KEY);
  }catch{ /* Cancellation must remain possible even if storage access is denied. */ }
}
