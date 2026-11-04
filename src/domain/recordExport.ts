import { applyMove, createInitialBoard, formatMove } from './csa';
import { positionKey } from './studyRules';
import type { BoardState, ParsedGame, PieceCode } from './types';

export type RecordFormat = 'kif' | 'csa';
const LABELS: Record<PieceCode,string> = {FU:'歩',KY:'香',KE:'桂',GI:'銀',KI:'金',KA:'角',HI:'飛',OU:'玉',TO:'と',NY:'杏',NK:'圭',NG:'全',UM:'馬',RY:'龍'};
const HANDS: PieceCode[] = ['HI','KA','KI','GI','KE','KY','FU'];
const REASONS: Record<string,string> = {TORYO:'投了',CHUDAN:'中断',SENNICHITE:'千日手',JISHOGI:'持将棋',TIME_UP:'切れ負け',ILLEGAL_MOVE:'反則負け',KACHI:'入玉勝ち'};
const clean = (text:string) => Array.from(text,c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127?' ':c).join('');

function csaInitial(board:BoardState): string[] {
  const rows=Array.from({length:9},(_,i)=>'P'+(i+1)+Array.from({length:9},(_,j)=>{
    const p=board.squares[`${9-j}${i+1}`];return p ? p.side+p.code : ' * ';
  }).join(''));
  for(const side of ['+','-'] as const) rows.push('P'+side+HANDS.flatMap(code=>Array.from({length:board.hands[side][code]??0},()=> '00'+code)).join(''));
  return [...rows,board.turn];
}

/** A variation has no source-game ending or engine comments. */
export function variationRecord(game:ParsedGame, moves:ParsedGame['moveList']): ParsedGame {
  return {...game,live:true,result:undefined,finalReason:undefined,endedAt:undefined,moves:moves.length,moveList:moves,
    sourceText:['V2.2','N+'+clean(game.black),'N-'+clean(game.white),'$START_TIME:'+clean(game.startedAt),
      ...csaInitial(game.initial),...moves.flatMap(move=>[move.raw,...(move.time===undefined?[]:['T'+move.time])])].join('\n')+'\n'};
}

function kifInitial(board:BoardState): string[] {
  if(positionKey(board)===positionKey(createInitialBoard())) return ['手合割：平手'];
  const hands=(side:'+'|'-')=>HANDS.filter(code=>board.hands[side][code]).map(code=>LABELS[code]+(board.hands[side][code]===1?'':kanji(board.hands[side][code]!))).join('　')||'なし';
  return ['後手の持駒：'+hands('-'),'  ９ ８ ７ ６ ５ ４ ３ ２ １','+---------------------------+',
    ...Array.from({length:9},(_,r)=>'|'+Array.from({length:9},(_,f)=>{
      const p=board.squares[`${9-f}${r+1}`];return p?(p.side==='-'?'v':' ')+LABELS[p.code]:' ・';
    }).join('')+'|'+'一二三四五六七八九'[r]),
    '+---------------------------+','先手の持駒：'+hands('+'),...(board.turn==='-'?['後手番']:[])];
}
function kanji(n:number):string {return n<10?'〇一二三四五六七八九'[n]:(n<20?'十':'二十')+(n%10?'〇一二三四五六七八九'[n%10]:'');}
function clock(n:number, hours=false):string {
  const seconds=Math.max(0,Math.floor(n));
  const tail=String(seconds%60).padStart(2,'0');
  return hours?`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${tail}`:`${Math.floor(seconds/60)}:${tail}`;
}
export function exportRecord(game:ParsedGame,format:RecordFormat):string {
  if(format==='csa') return game.sourceText.replace(/^\uFEFF/,'').trimEnd()+'\n';
  const lines=['#KIF version=2.0 encoding=UTF-8','開始日時：'+clean(game.startedAt),'先手：'+clean(game.black),'後手：'+clean(game.white),...kifInitial(game.initial),'手数----指手---------消費時間--'];
  let board=game.initial;
  const total={'+':0,'-':0};
  game.moveList.forEach((move,i)=>{
    const text=formatMove(move,board,game.moveList[i-1]).slice(1).replace(/^同/,'同　');
    let timing='';
    if(move.time!==undefined && Number.isFinite(move.time)) {total[move.side]+=move.time;timing=` (${clock(move.time)}/${clock(total[move.side],true)})`;}
    lines.push(`${i+1} ${text}${move.from==='00'?'':`(${move.from})`}${timing}`);
    board=applyMove(board,move);
  });
  if(game.finalReason) lines.push(REASONS[game.finalReason]?`${game.moveList.length+1} ${REASONS[game.finalReason]}`:'*終了情報：'+clean(game.finalReason));
  return lines.join('\r\n')+'\r\n';
}
export function recordFilename(game:ParsedGame,format:RecordFormat,variation=false):string {
  const date=game.startedAt.match(/\d{4}[/-]?\d{2}[/-]?\d{2}/)?.[0].replace(/\D/g,'')||'日付不明';
  const safe=(s:string)=>clean(s).replace(/[<>:"/\\|?*]/g,'_').replace(/[. ]+$/,'').slice(0,60)||'不明';
  return `${date}_${safe(game.black)}_vs_${safe(game.white)}${variation?'_変化':''}.${format==='kif'?'kifu':'csa'}`;
}
