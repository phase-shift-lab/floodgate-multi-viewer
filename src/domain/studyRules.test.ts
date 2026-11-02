import { describe, expect, it } from 'vitest';
import { applyMove, createInitialBoard, parseCsa } from './csa';
import { attacks, inCheck, legalMoves, makeMove, moveError, positionKey, strictInitial, terminalReason, validateBoard, validatedPrefix, validatedPv } from './studyRules';
import type { BoardState, PieceCode, Side } from './types';
import csa from '../fixtures/floodgate-sample.csa?raw';

// Hand-authored coordinates and expected destinations, independent of the move generator.
// Rules: https://www.shogi.or.jp/match/taikyoku_rules/ (articles 4,5,8,10).
function bare(turn: Side = '+'): BoardState { return {squares:{'99':{side:'+',code:'OU'},'11':{side:'-',code:'OU'}},hands:{'+':{},'-':{}},turn,ply:0}; }
describe('study move rules / independent coordinate fixtures', () => {
  it.each<[PieceCode,string[]]>([
    ['FU',['54']], ['KY',['51','52','53','54']], ['KE',['43','63']],
    ['GI',['44','54','64','46','66']], ['KI',['44','54','64','45','65','56']],
    ['TO',['44','54','64','45','65','56']], ['NY',['44','54','64','45','65','56']],
    ['NK',['44','54','64','45','65','56']], ['NG',['44','54','64','45','65','56']],
    ['OU',['44','54','64','45','65','46','56','66']],
  ])('%s movement from 55', (code,destinations) => {
    const b = bare(); b.squares['55']={side:'+',code};
    const actual = Array.from({length:81},(_,i)=>`${i%9+1}${Math.floor(i/9)+1}`).filter((sq)=>attacks(b,'55',sq));
    expect(actual.sort()).toEqual(destinations.sort());
    b.squares['55'].side='-';
    expect(actual.map((sq)=>`${sq[0]}${10-Number(sq[1])}`).sort()).toEqual(Array.from({length:81},(_,i)=>`${i%9+1}${Math.floor(i/9)+1}`).filter((sq)=>attacks(b,'55',sq)).sort());
  });
  it.each(['HI','KA','RY','UM'] as PieceCode[])('sliding %s cannot jump, promoted extra step', (code) => {
    const b=bare(); b.squares['55']={side:'+',code};
    const diagonal=code==='KA'||code==='UM'; const to=diagonal?'22':'52', block=diagonal?'44':'54';
    expect(attacks(b,'55',to)).toBe(true); b.squares[block]={side:'+',code:'FU'}; expect(attacks(b,'55',to)).toBe(false);
    if(code==='UM') expect(attacks(b,'55','56')).toBe(true);
    if(code==='RY') expect(attacks(b,'55','44')).toBe(true);
  });
  it('rejects wrong turn, empty source, own piece and king capture',()=>{
    const b=createInitialBoard();
    expect(moveError(b,{...makeMove(b,'77','76','FU'),side:'-'})).toContain('手番');
    expect(moveError(b,makeMove(b,'55','54','FU'))).toBeTruthy();
    expect(moveError(b,makeMove(b,'88','77','KA'))).toContain('自分');
    const k=bare(); k.squares['12']={side:'+',code:'HI'};
    expect(moveError(k,makeMove(k,'12','11','HI'))).toContain('玉');
  });
  it('captures demote and promotions require zone / force dead ranks',()=>{
    const b=bare(); b.squares['54']={side:'+',code:'FU'};
    expect(moveError(b,makeMove(b,'54','53','FU'))).toBeUndefined(); expect(moveError(b,makeMove(b,'54','53','TO'))).toBeUndefined();
    b.squares['54']={side:'+',code:'HI'}; b.squares['53']={side:'-',code:'NG'};
    expect(applyMove(b,makeMove(b,'54','53','RY')).hands['+'].GI).toBe(1);
    const p=bare(); p.squares['52']={side:'+',code:'FU'};
    expect(moveError(p,makeMove(p,'52','51','FU'))).toContain('成る'); expect(moveError(p,makeMove(p,'52','51','TO'))).toBeUndefined();
    const k=bare(); k.squares['54']={side:'+',code:'KE'};
    expect(moveError(k,makeMove(k,'54','42','KE'))).toContain('成る'); expect(moveError(k,makeMove(k,'54','42','NK'))).toBeUndefined();
    expect(moveError(createInitialBoard(),makeMove(createInitialBoard(),'77','76','TO'))).toContain('成り');
  });
  it('drops reject nifu, dead ranks, occupied squares and promoted pieces',()=>{
    const b=bare(); b.hands['+']={FU:2,KY:1,KE:1,TO:1}; b.squares['57']={side:'+',code:'FU'};
    expect(moveError(b,makeMove(b,'00','55','FU'))).toContain('二歩');
    expect(moveError(b,makeMove(b,'00','41','KY'))).toContain('行き所');
    expect(moveError(b,makeMove(b,'00','42','KE'))).toContain('行き所');
    expect(moveError(b,makeMove(b,'00','57','FU'))).toBeTruthy();
    expect(moveError(b,makeMove(b,'00','44','TO'))).toBeTruthy();
    b.squares['57'].code='TO'; expect(moveError(b,makeMove(b,'00','55','FU'))).toBeUndefined();
  });
  it('pins, discovered checks, king adjacency and legal interposition',()=>{
    const b=bare(); delete b.squares['99']; b.squares['59']={side:'+',code:'OU'}; b.squares['51']={side:'-',code:'HI'}; b.squares['58']={side:'+',code:'KI'};
    expect(moveError(b,makeMove(b,'58','48','KI'))).toContain('王手');
    expect(moveError(b,makeMove(b,'58','57','KI'))).toBeUndefined();
    delete b.squares['58']; expect(inCheck(b)).toBe(true); b.hands['+'].KI=1;
    expect(moveError(b,makeMove(b,'00','55','KI'))).toBeUndefined();
    const k=bare(); delete k.squares['11']; k.squares['97']={side:'-',code:'OU'};
    expect(moveError(k,makeMove(k,'99','98','OU'))).toContain('王手');
  });
  it('uchifuzume: defended pawn with no escape, escape, board capture, pinned capture',()=>{
    // White king 51, own lances 41/61 block sideways; gold 53 protects 42/52/62.
    const b=bare(); delete b.squares['11']; b.squares['51']={side:'-',code:'OU'}; b.squares['41']={side:'-',code:'KY'}; b.squares['61']={side:'-',code:'KY'}; b.squares['53']={side:'+',code:'KI'}; b.hands['+'].FU=1;
    const pawn=makeMove(b,'00','52','FU'); expect(moveError(b,pawn)).toBe('打歩詰です');
    delete b.squares['41']; expect(moveError(b,pawn)).toBeUndefined();
    b.squares['41']={side:'-',code:'KI'}; expect(moveError(b,pawn)).toBeUndefined(); // gold captures 52
    b.squares['31']={side:'+',code:'HI'}; expect(moveError(b,pawn)).toBe('打歩詰です'); // gold pinned to 51
    delete b.squares['31']; b.squares['41']={side:'-',code:'KY'}; delete b.squares['53'];
    expect(moveError(b,pawn)).toBeUndefined(); // undefended pawn can be taken by king
  });
  it('fourfold key includes turn and hands, stops only on fourth',()=>{
    const b=bare(), key=positionKey(b);
    expect(terminalReason(b,[key,key,key])).toBeUndefined();
    expect(terminalReason(b,[key,key,key,key])).toContain('同一局面4回');
    expect(positionKey({...b,turn:'-'})).not.toBe(key); b.hands['+'].FU=1; expect(positionKey(b)).not.toBe(key);
  });
  it('validates starting kings, inventory, nifu, dead pieces and non-moving king safety',()=>{
    expect(()=>validateBoard(createInitialBoard())).not.toThrow();
    const b=bare(); b.hands['+'].FU=19; expect(()=>validateBoard(b)).toThrow('総数');
    b.hands['+']={}; b.squares['12']={side:'+',code:'HI'}; expect(()=>validateBoard(b)).toThrow('手番でない');
    delete b.squares['12']; delete b.squares['11']; expect(()=>validateBoard(b)).toThrow('玉');
  });
  it('strict source accepts real CSA rows and verifies prefix without modifying watching game',async()=>{
    const game=parseCsa(csa), raw=JSON.stringify(game);
    expect(positionKey(strictInitial(csa))).toBe(positionKey(createInitialBoard()));
    const result=await validatedPrefix(game,12); expect(result.prefix).toHaveLength(12); expect(JSON.stringify(game)).toBe(raw);
    expect(legalMoves(result.board).length).toBeGreaterThan(0);
  });
  it('rejects skipped malformed moves only when crossing the bad boundary',async()=>{
    const game=parseCsa('V2\nPI\n+\n+7776FU\n-3334ZZZ\n-8384FU\n');
    await expect(validatedPrefix(game,1)).resolves.toBeDefined(); await expect(validatedPrefix(game,2)).rejects.toThrow('2手目');
    const bad=parseCsa('V2\nPI\n+\n+7775FU'); await expect(validatedPrefix(bad,1)).rejects.toThrow('1手目');
    expect(()=>strictInitial('PI\n+\nP+00OU')).toThrow();
  });
  it('PV legal prefix, illegal first move, promotion and drop validation',()=>{
    expect(validatedPv(createInitialBoard(),['7g7f','3c3d','7f7d'],12)).toEqual({labels:['▲７六歩','△３四歩'],truncated:true});
    expect(validatedPv(createInitialBoard(),['7g7e'],12)).toEqual({labels:[],truncated:true});
    const b=bare(); b.hands['+'].KA=1; expect(validatedPv(b,['B*5e'],12).labels).toEqual(['▲５五角打']);
  });
});
