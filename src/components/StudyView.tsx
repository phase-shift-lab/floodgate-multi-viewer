import { useWorkspace } from './WorkspaceContext';
import { RecordAnalysisPanel } from './RecordAnalysisPanel';
import { variationRecord } from '../domain/recordExport';
import { hasRecordRecovery } from '../engine/recordRecovery';
import { DetailPanel, type DetailTab } from './DetailPanel';
import { BoardSurface, BoardControls } from './BoardSurface';
import { loadGame } from '../data/client';
import { shareUrl } from '../data/preferences';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMove } from '../domain/csa';
import { legalMoves } from '../domain/studyRules';
import { addStudyMove, branchNodes, navigateStudy, persistStudy, STUDY_TIMES, studyPosition, type StudySeconds, type StudySession } from '../domain/studySession';
import type { Move, ParsedGame } from '../domain/types';
import { prepareAnalysis, retryAnalysisPreparation } from '../engine/isolation';
import { localAnalysis } from '../engine/localAnalysis';
import { playPieceSound } from '../data/pieceSound';
import { LocalEvaluation } from './LocalEvaluation';
import { ShogiBoard } from './ShogiBoard';
import type { BoardPlayers } from './PlayerLabel';
import { PromotionChoice } from './PromotionChoice';

export interface ReturnToSource { ply?: number; game?: ParsedGame }
interface Props { session: StudySession; onChange: (s: StudySession) => void; onReturn: (target?: ReturnToSource) => Promise<void>; sound: boolean; onSound: () => void; players?: BoardPlayers; settingsRequest?: number }
export function StudyView({ session, onChange, onReturn, sound, onSound, players, settingsRequest }: Props) {
  const workspace=useWorkspace();
  const latestSession=useRef(session);
  useLayoutEffect(()=>{latestSession.current=session;},[session]);
  const recordOwner='study:'+session.id;
  const [dialogOpen,setDialogOpen] = useState(()=>!workspace&&(hasRecordRecovery(recordOwner)||hasRecordRecovery(recordOwner+':source')));
  const [detailTab,setDetailTab] = useState<DetailTab>('record');
  const [recordTab,setRecordTab] = useState<'source'|'branches'>(()=>hasRecordRecovery(recordOwner+':source')?'source':'branches');
  const recordSelector=<div className="record-kind" role="group" aria-label="棋譜の種類"><button aria-pressed={recordTab === 'source'} onClick={() => setRecordTab('source')}>本譜</button><button aria-pressed={recordTab === 'branches'} onClick={() => setRecordTab('branches')}>変化</button></div>;
  const [headerTarget,setHeaderTarget] = useState<HTMLDivElement | null>(null);
  const [detailsTarget,setDetailsTarget] = useState<HTMLDivElement | null>(null);
  const baselineGame = session.watch.slots.find(slot => slot.summary.id === session.game.id)?.game ?? session.game;
  const [sourceGame,setSourceGame] = useState(baselineGame);
  const [liveMessage,setLiveMessage] = useState('');
  useEffect(() => {
    if (!baselineGame.live) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let live = true;
      try {
        const result = await loadGame(baselineGame,controller.signal);
        if (controller.signal.aborted) return;
        if (!result.fixture) {
          setSourceGame(current => result.game.moveList.length >= current.moveList.length ? result.game : current);
          setLiveMessage(''); live=result.game.live;
        } else setLiveMessage('新着確認は一時停止中');
      } catch { if (!controller.signal.aborted) setLiveMessage('新着を確認できませんでした'); }
      if (!controller.signal.aborted && live) timer=setTimeout(poll,document.hidden ? 120_000 : 30_000);
    };
    timer=setTimeout(poll,30_000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [baselineGame]);
  const [selected,setSelected] = useState<string>();
  const [promotion,setPromotion] = useState<Move[]>();
  const [message,setMessage] = useState('');
  const [requestId,setRequestId] = useState(0);
  const [leaving,setLeaving] = useState(false);
  const inputLock = useRef(false);
  const { board,position,terminal } = useMemo(() => studyPosition(session),[session]);
  const moves = useMemo(() => terminal ? [] : legalMoves(board),[board,terminal]);
  const node = session.nodes[session.current];
  const path = branchNodes(session);
  const commit = (next: StudySession): boolean => {
    try { onChange(persistStudy(next)); setMessage(''); return true; }
    catch (error) { setMessage(String(error instanceof Error ? error.message : error)); return false; }
  };
  const cancelSelection = useCallback(() => { setPromotion(undefined); setSelected(undefined); inputLock.current=false; },[]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelSelection(); };
    window.addEventListener('keydown',escape); return () => window.removeEventListener('keydown',escape);
  },[cancelSelection]);
  const add = (move: Move) => {
    if (inputLock.current || leaving) return;
    inputLock.current=true;
    try { if (commit(addStudyMove(session,move))) { playPieceSound(sound); setRequestId(0); cancelSelection(); } }
    catch (error) { setMessage((error as Error).message); }
    finally { inputLock.current=false; }
  };
  const selectSquare = (square: string) => {
    if (promotion || leaving || terminal) return;
    if (square === selected) { cancelSelection(); return; }
    if (board.squares[square]?.side === board.turn) { setSelected(square); setMessage(''); return; }
    const options = moves.filter((move) => move.to === square && (selected?.startsWith('hand:') ? move.from === '00' && move.piece === selected.slice(5) : move.from === selected));
    if (!options.length) { setMessage(selected ? 'そこには指せません。強調された升を選んでください' : '手番側の駒を選んでください'); return; }
    if (options.length > 1) setPromotion(options);
    else add(options[0]);
  };
  const navigate = (id: string) => { if (commit(navigateStudy(session,id))) { cancelSelection(); setRequestId(0); } };
  const prepare = useCallback(async (signal?: AbortSignal) => {
    persistStudy(latestSession.current);
    return prepareAnalysis(() => { const current=latestSession.current; persistStudy(current); return current.watch; },session.id,signal);
  },[session.id]);
  const retry = () => {
    if (!commit({...session,enabled:true,stopped:false})) return;
    retryAnalysisPreparation(); localAnalysis.retry(); setRequestId((id) => id+1);
  };
  const returnToWatch = async (target?: ReturnToSource) => {
    if (leaving) return;
    setLeaving(true); cancelSelection();
    try { await onReturn(target); } catch (error) { setMessage((error as Error).message); setLeaving(false); }
  };
  const targets = [...new Set(moves.filter((m) => selected?.startsWith('hand:') ? m.from === '00' && m.piece === selected.slice(5) : m.from === selected).map((m) => m.to))];

  const timeline = ['root',...path.map(item => item.id)];
  let next = node.preferred ?? node.children[0];
  while (next && !timeline.includes(next) && timeline.length < 513) { timeline.push(next); const child=session.nodes[next]; next=child.preferred ?? child.children[0]; }
  const recordGame=variationRecord(session.game,[...session.game.moveList.slice(0,session.origin),...path.map(item=>item.move!)]);
  const pickRecordPly=(ply:number,record:ParsedGame)=>{
    if(ply<session.origin) {void returnToWatch({ply,game:sourceGame});return;}
    let id='root';
    for(const move of record.moveList.slice(session.origin,ply)) {
      const child=session.nodes[id].children.find(key=>session.nodes[key].move?.raw===move.raw);
      if(!child) {setMessage('この変化は変更されています。最新の棋譜を選んでください');return;}
      id=child;
    }
    pickBranch(id);
  };
  const openDetails = (tab: DetailTab) => { if (promotion || leaving) return; cancelSelection(); setDetailTab(tab); setDialogOpen(true); };
  const requestSettings=useEffectEvent(() => openDetails('settings'));
  const lastSettingsRequest=useRef(settingsRequest);
  useEffect(() => { if (settingsRequest && settingsRequest !== lastSettingsRequest.current) requestSettings(); lastSettingsRequest.current=settingsRequest; },[settingsRequest]);
  const newCount = Math.max(0,sourceGame.moveList.length-baselineGame.moveList.length);
  const pickBranch = (id: string) => { if (commit(navigateStudy(session,id))) { cancelSelection(); setRequestId(0); setDialogOpen(false); } };
  const share = () => {
    const url=shareUrl({game:session.game.id,ply:session.origin,view:session.game.live?'live':'archive',boards:1,orientation:session.flipped?'white':'black'});
    void navigator.clipboard.writeText(url).then(()=>setMessage('元対局のURLをコピーしました。変化は含みません。')).catch(()=>setMessage(url));
  };
  return <BoardSurface studying label="検討盤"
    caption={<strong className="study-badge">検討中</strong>}
    captionActions={<><button aria-label="盤面反転" onClick={()=>{cancelSelection();commit({...session,flipped:!session.flipped});}}>反転</button><button className="context-share" onClick={share}>共有</button><button className="return-source" aria-label="本譜へ戻る" disabled={leaving||Boolean(promotion)} onClick={()=>void returnToWatch()}>本譜</button></>}
    evaluation={<LocalEvaluation board={board} position={position} enabled={session.enabled} onEnabledChange={enabled => commit({...session,enabled,stopped:false})} onPrepare={prepare} detailsTarget={detailsTarget} onDetails={() => openDetails('analysis')} study milliseconds={session.seconds*1000 as 1000|3000|5000|10000} requestId={requestId} stopped={session.stopped || Boolean(terminal) || leaving} />}
    board={<ShogiBoard players={players ?? {'+':{name:session.game.black},'-':{name:session.game.white}}} state={board} flipped={session.flipped} lastMove={node.move ?? session.game.moveList.at(-1)} selected={selected} legalTargets={targets} locked={Boolean(promotion) || leaving || Boolean(terminal)} onSquare={selectSquare} onHand={(side,code) => { if (side === board.turn && !promotion) { setSelected(selected === 'hand:'+code ? undefined : 'hand:'+code); setMessage(''); } }} />}
    status={<><span>{terminal ?? (promotion ? '成る・成らないを選んでください' : selected ? '移動可能な升 '+targets.length+'か所' : '手番側の駒・持駒を選んでください')}</span>{selected && !promotion && <button onClick={cancelSelection}>選択取消</button>}{newCount > 0 && <strong className="study-new-moves">本譜に新着{newCount}手</strong>}{liveMessage && <small>{liveMessage}</small>}</>}
    controls={<BoardControls variation onSource={()=>void returnToWatch()} onVariation={()=>{if(!workspace){openDetails('record');return;}setRecordTab('branches');requestAnimationFrame(()=>{document.querySelector('.is-studying .record-actions')?.setAttribute('open','');document.querySelector('.is-studying .study-history')?.setAttribute('open','');});}} onFlip={() => { cancelSelection(); commit({...session,flipped:!session.flipped}); }} current={node.move ? formatMove(node.move) : '検討の起点'} ply={path.length} max={timeline.length-1} onPrevious={() => { if (node.parent) navigate(node.parent); }} onNext={() => { const id=node.preferred ?? node.children[0]; if (id) navigate(id); }} onCurrent={() => openDetails('record')} onSeek={ply => navigate(timeline[ply])} action="起点へ" onAction={() => navigate('root')} previousDisabled={!node.parent} nextDisabled={!node.children.length} disabled={Boolean(promotion) || leaving} />}
    footer={<><div className="connection">検討はこのタブに2時間保存 · 本譜{session.origin}手目から</div>{message && <div className="study-message" role="alert">{message}</div>}{promotion && <PromotionChoice moves={promotion} original={board.squares[promotion[0].from]?.code} onPick={add} onCancel={cancelSelection}/>} </>}
    record={workspace&&<RecordAnalysisPanel embedded key={recordTab} owner={recordTab==='source'?recordOwner+':source':recordOwner} game={recordTab==='source'?sourceGame:recordGame} ply={recordTab==='source'?session.origin:session.origin+path.length} active={!leaving} onPrepare={prepare} onPick={recordTab==='source'?(ply,game)=>void returnToWatch({ply,game}):pickRecordPly} isVariation={recordTab==='branches'} recordSelector={recordSelector} recordFooter={<details className="study-history"><summary>他の変化を選ぶ</summary><button onClick={()=>pickBranch('root')}>起点</button>{Object.values(session.nodes).filter(item=>item.move).map(item=><button key={item.id} onClick={()=>pickBranch(item.id)}>{formatMove(item.move!)}</button>)}</details>}/>}
    modal={<DetailPanel open={dialogOpen} tab={detailTab} onHeaderTarget={setHeaderTarget} onClose={() => setDialogOpen(false)}>
      {!workspace&&<div className="record-pane" hidden={detailTab !== 'record'}>
        <div hidden={recordTab !== 'source'}><RecordAnalysisPanel headerTarget={headerTarget} owner={recordOwner+':source'} game={sourceGame} ply={session.origin} active={dialogOpen && detailTab === 'record' && recordTab === 'source' && !leaving} onPrepare={prepare} onPick={(ply,game)=>void returnToWatch({ply,game})} recordSelector={recordSelector}/></div>
        <div hidden={recordTab !== 'branches'}><RecordAnalysisPanel headerTarget={headerTarget} owner={recordOwner} game={recordGame} ply={session.origin+path.length} active={dialogOpen && detailTab === 'record' && recordTab === 'branches' && !leaving} onPrepare={prepare} onPick={pickRecordPly} isVariation recordSelector={recordSelector} recordFooter={<details className="study-history"><summary>他の変化を選ぶ</summary><button onClick={() => pickBranch('root')}>起点（本譜{session.origin}手目）</button><ol>{Object.values(session.nodes).filter(item => item.move).map(item => <li key={item.id}><button aria-current={node.id === item.id ? 'step' : undefined} onClick={() => pickBranch(item.id)}><small>{item.parent === 'root' ? '起点' : '枝'+Object.keys(session.nodes).indexOf(item.parent!)} → </small>{formatMove(item.move!)} <small>枝{Object.keys(session.nodes).indexOf(item.id)}</small></button></li>)}</ol></details>}/>
        </div>
      </div>
      }<div hidden={detailTab !== 'analysis'} ref={setDetailsTarget} className="unified-analysis" />
      <div hidden={detailTab !== 'settings'} className="board-settings"><strong>つようら王11micro · 先手基準</strong><label>解析時間<select aria-label="解析時間" value={session.seconds} onChange={event => { setRequestId(0); commit({...session,seconds:Number(event.target.value) as StudySeconds,stopped:false}); }}>{STUDY_TIMES.map(value => <option key={value} value={value}>{value}秒</option>)}</select></label><button aria-pressed={session.enabled} onClick={() => { if (!session.enabled) { retryAnalysisPreparation(); localAnalysis.retry(); } commit({...session,enabled:!session.enabled,stopped:false}); }}>解析 {session.enabled ? 'ON' : 'OFF'}</button><button disabled={Boolean(terminal) || leaving} onClick={retry}>再解析</button><button disabled={session.stopped || leaving} onClick={() => commit({...session,stopped:true})}>停止</button><button aria-pressed={sound} onClick={onSound}>駒音 {sound ? 'ON' : 'OFF'}</button><button disabled={Boolean(promotion) || leaving} onClick={() => { if (confirm('検討の変化をすべて消去して起点に戻りますか？')) { if (commit({...session,current:'root',nodes:{root:{...session.nodes.root,children:[],preferred:undefined}},stopped:false})) { cancelSelection(); setRequestId(0); } } }}>変化を全消去</button><p>同一局面4回で停止。公式の勝敗裁定は行いません。10秒解析はCPU・電池を多く使います。</p></div>
    </DetailPanel>} />;
}
