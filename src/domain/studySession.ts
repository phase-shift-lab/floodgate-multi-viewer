import { applyMove } from './csa';
import { toEnginePosition } from './localEvaluation';
import { moveError, positionKey, terminalReason, validatedPrefix } from './studyRules';
import type { BoardState, Move, ParsedGame, ViewerSettings } from './types';
import type { AnalysisRecovery } from '../engine/isolation';

export type StudySeconds = 1 | 3 | 5 | 10;
export const STUDY_TIMES: StudySeconds[] = [1,3,5,10];
export interface StudyNode { id: string; parent?: string; move?: Move; children: string[]; preferred?: string; key: string }
export interface WatchSnapshot extends AnalysisRecovery { settings: ViewerSettings }
export interface StudySession {
  schema: 1; id: string; at: number; game: ParsedGame; origin: number;
  nodes: Record<string, StudyNode>; current: string;
  watch: WatchSnapshot; flipped: boolean; enabled: boolean; seconds: StudySeconds; stopped: boolean;
}
export const STUDY_KEY = 'fgmv:study:v1';
export const MAX_BYTES = 512 * 1024;
const TTL = 2 * 60 * 60 * 1000;
export function branchNodes(session: StudySession): StudyNode[] {
  const result: StudyNode[] = [], seen = new Set<string>();
  let node = session.nodes[session.current];
  while (node?.parent) {
    if (seen.has(node.id) || result.length >= 512) throw new Error('変化の参照が不正です');
    seen.add(node.id); result.unshift(node); node = session.nodes[node.parent];
  }
  return result;
}
export function studyGame(session: StudySession): ParsedGame {
  return { ...session.game, moveList: [...session.game.moveList.slice(0,session.origin), ...branchNodes(session).map((n) => n.move!)] };
}
export function studyPosition(session: StudySession): { board: BoardState; position: string; history: string[]; terminal?: string } {
  const game = studyGame(session);
  let board = game.initial;
  const history = [positionKey(board)];
  for (const move of game.moveList) { board = applyMove(board,move); history.push(positionKey(board)); }
  return { board, position:toEnginePosition(game,game.moveList.length), history, terminal:terminalReason(board,history) };
}
export async function createStudy(game: ParsedGame, ply: number, watch: WatchSnapshot, flipped: boolean, enabled: boolean, signal?: AbortSignal, entry?:{move:Move;isCurrent:()=>boolean}): Promise<StudySession> {
  const { initial, prefix, board } = await validatedPrefix(game,ply,signal);
  // Freeze only the verified prefix as the study's source. The full watch game stays in the snapshot.
  const session: StudySession = {
    schema:1, id:crypto.randomUUID(), at:Date.now(), game:{...structuredClone(game), initial, moveList:prefix}, origin:ply,
    nodes:{ root:{id:'root',children:[],key:positionKey(board)} }, current:'root',
    watch:{...structuredClone(watch),at:Date.now()}, flipped, enabled, seconds:1, stopped:false,
  };
  if(entry&&!entry.isCurrent())throw new Error('局面が更新されたため、検討開始を取り消しました。');
  const next=entry?addStudyMove(session,entry.move):session;
  return persistStudy(next);
}
export function addStudyMove(session: StudySession, move: Move): StudySession {
  const { board,terminal } = studyPosition(session);
  if (terminal) throw new Error(terminal);
  const error = moveError(board,move);
  if (error) throw new Error(error);
  const parent = session.nodes[session.current];
  const existing = parent.children.find((id) => {
    const m = session.nodes[id].move!;
    return m.from === move.from && m.to === move.to && m.piece === move.piece;
  });
  if (!existing && (Object.keys(session.nodes).length >= 1024 || branchNodes(session).length >= 512)) throw new Error('変化の上限に達しました。手戻しや既存の枝の参照はできます');
  const id = existing ?? crypto.randomUUID();
  return { ...session, current:id, stopped:false, nodes:{...session.nodes,
    [parent.id]:{...parent,children:existing ? parent.children : [...parent.children,id],preferred:id},
    [id]:existing ? session.nodes[id] : {id,parent:parent.id,children:[],move:{...move,index:board.ply+1},key:positionKey(applyMove(board,move))},
  }};
}
export function navigateStudy(session: StudySession, id: string): StudySession {
  const node = session.nodes[id];
  if (!node) throw new Error('変化が見つかりません');
  return { ...session,current:id,stopped:false,nodes:node.parent ? {...session.nodes,[node.parent]:{...session.nodes[node.parent],preferred:id}} : session.nodes };
}
export function persistStudy(session: StudySession): StudySession {
  const at = Date.now();
  const next = {...session,at,watch:{...session.watch,at:session.watch.at || at}};
  const raw = JSON.stringify(next);
  if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error('保存容量512KiBを超えました。変化は追加していません');
  try { sessionStorage.setItem(STUDY_KEY,raw); }
  catch { throw new Error('検討を保存できません。ブラウザーの保存設定を確認してください。変更は確定していません'); }
  return next;
}
export function savedStudyExists(): boolean { try { return Boolean(sessionStorage.getItem(STUDY_KEY)); } catch { return false; } }
export async function restoreStudy(signal?: AbortSignal): Promise<StudySession | undefined> {
  const raw = sessionStorage.getItem(STUDY_KEY);
  if (!raw) return;
  if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error('保存データが容量上限を超えています');
  const s = JSON.parse(raw) as StudySession;
  if (!s || s.schema !== 1 || typeof s.id !== 'string' || !Number.isFinite(s.at) || Date.now()-s.at < 0 || Date.now()-s.at > TTL) throw new Error('検討データが不正または2時間の保存期限を過ぎています');
  if (!STUDY_TIMES.includes(s.seconds) || typeof s.enabled !== 'boolean' || typeof s.flipped !== 'boolean' || typeof s.stopped !== 'boolean' || !s.nodes || !s.nodes.root || !s.nodes[s.current]) throw new Error('検討設定が不正です');
  if (!s.watch || !['live','archive'].includes(s.watch.view) || !s.watch.settings || ![1,2,4].includes(s.watch.settings.boardCount) || !Array.isArray(s.watch.slots) || !s.watch.slots.length || s.watch.slots.length > 4) throw new Error('観戦の保存データが不正です');
  const settings = s.watch.settings;
  if (!['black','white'].includes(settings.orientation) || !['dark','light','system'].includes(settings.theme) || typeof settings.autoSwitchFinished !== 'boolean' || !Number.isFinite(settings.playbackSeconds) || settings.playbackSeconds < .1 || settings.playbackSeconds > 60 || (s.watch.expanded !== undefined && (!Number.isInteger(s.watch.expanded) || s.watch.expanded < 0 || s.watch.expanded >= s.watch.slots.length))) throw new Error('観戦設定が不正です');
  for (const slot of s.watch.slots) {
    if (typeof slot.summary?.id !== 'string' || !Number.isSafeInteger(slot.ply) || slot.ply < 0 || typeof slot.flipped !== 'boolean' || typeof slot.enabled !== 'boolean' || typeof slot.pinned !== 'boolean' || typeof slot.followingLatest !== 'boolean' || !Number.isFinite(slot.speed) || slot.speed! < .1 || slot.speed! > 60 || !slot.game || slot.game.id !== slot.summary.id) throw new Error('観戦枠の保存データが不正です');
    const verified = await validatedPrefix(slot.game,Math.min(slot.ply,slot.game.moveList.length),signal);
    if (slot.ply <= slot.game.moveList.length && positionKey(verified.board) !== positionKey(slot.game.moveList.slice(0,slot.ply).reduce(applyMove,slot.game.initial))) throw new Error('観戦局面が一致しません');
  }
  const { board,keys } = await validatedPrefix(s.game,s.origin,signal);
  const ids = Object.keys(s.nodes);
  if (ids.length > 1024 || s.nodes.root.parent || s.nodes.root.move || s.nodes.root.id !== 'root' || s.nodes.root.key !== positionKey(board)) throw new Error('変化のルートが不正です');
  const queue = [{id:'root',board,keys,depth:0}], seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i], node = s.nodes[item.id];
    if (seen.has(item.id) || !node || node.id !== item.id || !Array.isArray(node.children) || new Set(node.children).size !== node.children.length || (node.preferred && !node.children.includes(node.preferred))) throw new Error('変化に重複・循環・不正参照があります');
    seen.add(item.id);
    if (item.depth > 512 || (node.children.length && terminalReason(item.board,item.keys))) throw new Error('終端または上限後の変化があります');
    for (const id of node.children) {
      const child = s.nodes[id];
      if (!child || child.parent !== node.id || !child.move || child.move.index !== item.board.ply+1 || moveError(item.board,child.move)) throw new Error('保存された変化に不正手があります');
      const next = applyMove(item.board,child.move), key = positionKey(next);
      if (child.key !== key) throw new Error('変化の局面キーが一致しません');
      queue.push({id,board:next,keys:[...item.keys,key],depth:item.depth+1});
    }
    if (i % 24 === 0) { await new Promise((resolve) => setTimeout(resolve,0)); if (signal?.aborted) throw new Error('復元を取り消しました'); }
  }
  if (seen.size !== ids.length) throw new Error('参照できない変化が保存されています');
  return s;
}
