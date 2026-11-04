import {expect,it} from 'vitest';
import {boardAt,parseCsa} from './csa';
import {exportRecord,recordFilename,variationRecord} from './recordExport';
import {positionKey} from './studyRules';

const source='V2.2\nN+先手\nN-後手\n$START_TIME:2026/11/04 12:00:00\nPI\n+\n+7776FU\nT3\n-3334FU\nT60\n+8822UM\n-3122GI\n+0088KA\n%TORYO\n';
it('exports full KIF with promotion, capture on the same square, drop, side clocks and ending',()=>{
 const game=parseCsa(source),kif=exportRecord(game,'kif');
 expect(kif).toContain('手合割：平手');
 expect(kif).toContain('1 ７六歩(77) (0:03/00:00:03)');
 expect(kif).toContain('2 ３四歩(33) (1:00/00:01:00)');
 expect(kif).toContain('3 ２二角成(88)');
 expect(kif).toContain('4 同　銀(31)');
 expect(kif).toContain('5 ８八角打');
 expect(kif).toContain('6 投了');
 expect(exportRecord(game,'csa')).toBe(source);
});
it('exports only the chosen variation, preserving initial board and hands without original ending or other moves',()=>{
 const game=parseCsa(source),moves=game.moveList.slice(0,2);
 const variation=variationRecord(game,moves),csa=exportRecord(variation,'csa'),roundtrip=parseCsa(csa);
 expect(roundtrip.moveList.map(m=>m.raw)).toEqual(moves.map(m=>m.raw));
 expect(positionKey(roundtrip.initial)).toBe(positionKey(game.initial));
 expect(positionKey(boardAt(roundtrip,2))).toBe(positionKey(boardAt(game,2)));
 expect(csa).not.toContain('%TORYO');expect(csa).not.toContain('+8822UM');
 expect(exportRecord(variation,'kif')).not.toContain('投了');
 const custom={...game,initial:{...game.initial,turn:'-' as const,hands:{'+':{FU:12},'-':{KA:1}}}};
 const text=exportRecord({...custom,moveList:[],finalReason:undefined},'kif');
 expect(text).toContain('後手の持駒：角');expect(text).toContain('先手の持駒：歩十二');expect(text).toContain('後手番');
 expect(positionKey(parseCsa(exportRecord(variationRecord(custom,[]),'csa')).initial)).toBe(positionKey(custom.initial));
});
it('creates bounded file names with date, players and variation suffix',()=>{
 const game={...parseCsa(source),black:'a/b:*?<>|',white:'x'.repeat(200)};
 const name=recordFilename(game,'kif',true);
 expect(name).toMatch(/^20261104_a_b_______vs_x+_変化\.kifu$/);
 expect(name.length).toBeLessThan(160);
 expect(recordFilename(game,'csa')).toMatch(/\.csa$/);
});
