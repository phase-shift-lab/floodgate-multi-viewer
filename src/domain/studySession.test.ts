import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCsa } from './csa';
import { makeMove } from './studyRules';
import { addStudyMove, createStudy, navigateStudy, persistStudy, restoreStudy, STUDY_KEY, studyGame, studyPosition, type StudySession, type WatchSnapshot } from './studySession';
import type { ParsedGame } from './types';

const game = parseCsa('V2\nN+Black\nN-White\nPI\n+\n+7776FU\n-3334FU\n');
function watch(g: ParsedGame): WatchSnapshot { return {at:Date.now(),view:'live',slots:[{summary:g,game:g,ply:1,flipped:false,enabled:false,pinned:true,followingLatest:false,speed:1}],settings:{boardCount:1,playbackSeconds:1,orientation:'black',theme:'dark',autoSwitchFinished:true}}; }
const create = () => createStudy(game,1,watch(game),false,false);
const move = (s: StudySession,from:string,to:string) => { const b=studyPosition(s).board; return makeMove(b,from,to,b.squares[from].code); };
beforeEach(()=>sessionStorage.clear());
describe('study branches and bounded storage',()=>{
  it('saves the first interactive move atomically without changing the source game',async()=>{
    const s=await create(),first=move(s,'83','84'),original=JSON.stringify(game);
    const next=await createStudy(game,1,watch(game),false,false,undefined,{move:first,isCurrent:()=>true});
    expect(next.current).not.toBe('root');expect(next.nodes[next.current].move).toMatchObject({from:'83',to:'84'});
    expect(JSON.parse(sessionStorage.getItem(STUDY_KEY)!).current).toBe(next.current);expect(JSON.stringify(game)).toBe(original);
  });
  it('stale and illegal first moves preserve the previously saved variation',async()=>{
    const s=await create(),first=move(s,'83','84'),saved=sessionStorage.getItem(STUDY_KEY);
    await expect(createStudy(game,1,watch(game),false,false,undefined,{move:first,isCurrent:()=>false})).rejects.toThrow('局面が更新');
    expect(sessionStorage.getItem(STUDY_KEY)).toBe(saved);
    await expect(createStudy(game,1,watch(game),false,false,undefined,{move:{...first,to:'85'},isCurrent:()=>true})).rejects.toThrow();
    expect(sessionStorage.getItem(STUDY_KEY)).toBe(saved);
  });
  it('freezes verified prefix, preserves watching game and emits full engine history',async()=>{
    const original=JSON.stringify(game), s=await create();
    const next=addStudyMove(s,move(s,'83','84'));
    expect(studyGame(next).moveList.map((m)=>m.raw)).toEqual(['+7776FU','-8384FU']);
    expect(studyPosition(next).position).toContain(' moves 7g7f 8c8d'); expect(JSON.stringify(game)).toBe(original);
    expect(s.seconds).toBe(1); expect(s.enabled).toBe(false); expect(studyPosition(s).board.ply).toBe(1);
  });
  it('retains siblings, reuses identical move and remembers forward branch',async()=>{
    const root=await create(), a=addStudyMove(root,move(root,'83','84'));
    const back=navigateStudy(a,'root'), b=addStudyMove(back,move(back,'33','34'));
    expect(b.nodes.root.children).toHaveLength(2); const again=addStudyMove(navigateStudy(b,'root'),move(root,'83','84'));
    expect(again.current).toBe(a.current); expect(Object.keys(again.nodes)).toHaveLength(3); expect(again.nodes.root.preferred).toBe(a.current);
  });
  it('roundtrips with validation of watch settings and every branch',async()=>{
    let s=await create(); s=addStudyMove(s,move(s,'83','84')); s.seconds=10; s.stopped=true; persistStudy(s);
    const restored=await restoreStudy(); expect(restored?.seconds).toBe(10); expect(restored?.stopped).toBe(true); expect(studyPosition(restored!).position).toBe(studyPosition(s).position);
  });
  it.each(['cycle','unreachable','bad-move','bad-current','bad-key','duplicate-child'])('rejects corrupt tree %s',async(kind)=>{
    let s=await create(); s=addStudyMove(s,move(s,'83','84')); const child=s.nodes[s.current];
    if(kind==='cycle') child.children=['root'];
    if(kind==='unreachable') s.nodes.lost={id:'lost',children:[],key:'x'};
    if(kind==='bad-move') child.move!.to='85';
    if(kind==='bad-current') s.current='missing';
    if(kind==='bad-key') child.key='wrong';
    if(kind==='duplicate-child') s.nodes.root.children.push(child.id);
    persistStudy(s); await expect(restoreStudy()).rejects.toThrow();
  });
  it('rejects expired, future, malformed JSON and unsupported times',async()=>{
    const s=await create();
    for(const at of [Date.now()-7200001,Date.now()+100000]) { sessionStorage.setItem(STUDY_KEY,JSON.stringify({...s,at})); await expect(restoreStudy()).rejects.toThrow('期限'); }
    sessionStorage.setItem(STUDY_KEY,'{'); await expect(restoreStudy()).rejects.toThrow();
    sessionStorage.setItem(STUDY_KEY,JSON.stringify({...s,seconds:2})); await expect(restoreStudy()).rejects.toThrow();
  });
  it('storage rejection / 512KiB leave previous save intact',async()=>{
    const s=await create(), before=sessionStorage.getItem(STUDY_KEY);
    expect(()=>persistStudy({...s,game:{...s.game,sourceText:'x'.repeat(524289)}})).toThrow('容量'); expect(sessionStorage.getItem(STUDY_KEY)).toBe(before);
    const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
    expect(()=>persistStudy(s)).toThrow('保存できません'); spy.mockRestore(); expect(sessionStorage.getItem(STUDY_KEY)).toBe(before);
  });
  it('rejects node limit but can still revisit existing branch',async()=>{
    const root=await create(), a=addStudyMove(root,move(root,'83','84')), b=navigateStudy(a,'root');
    while(Object.keys(b.nodes).length<1024) { const id=`dummy${Object.keys(b.nodes).length}`; b.nodes[id]={id,children:[],key:''}; }
    expect(()=>addStudyMove(b,move(b,'33','34'))).toThrow('上限'); expect(addStudyMove(b,move(b,'83','84')).current).toBe(a.current);
  });
  it('cancelled prefix and restoration do not return usable sessions',async()=>{
    const c=new AbortController(); c.abort(); await expect(createStudy(game,1,watch(game),false,true,c.signal)).rejects.toThrow('取り消');
    await create(); await expect(restoreStudy(c.signal)).rejects.toThrow('取り消');
  });
});
