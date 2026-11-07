import { hasRecordRecovery } from './engine/recordRecovery';
import { WorkspaceContext, loadWorkspaceLayout, type WorkspaceLayout } from './components/WorkspaceContext';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { analysisRecovery, preparationRecovery, prepareAnalysis, type PanelSnapshot } from './engine/isolation';
import type { ReturnToSource } from './components/StudyView';
import { createStudy, navigateStudy, persistStudy, restoreStudy, savedStudyExists, type StudySession, type WatchSnapshot } from './domain/studySession';
import { localAnalysis } from './engine/localAnalysis';
import { loadPieceSound, playPieceSound, savePieceSound } from './data/pieceSound';
import { loadAnalysisEnabled } from './data/analysisPreferences';
import { CompletedGames } from './data/completedGames';
import { initialGames } from './data/initialGames';
import { GamePanel } from './components/GamePanel';
import { heartbeatStats, loadCatalog, loadDay, recordPageView, STATIC_MODE, type ViewerStats } from './data/client';
import { addRecent, getStatsSessionId, loadArchiveFilters, loadFavorites, loadRecent, loadSettings, readShareState, saveArchiveFilters, saveFavorites, saveSettings, type ArchiveFilters } from './data/preferences';
import { compareGames, replaceFinishedSlots, selectFeaturedGames } from './domain/selection';
import { BOARD_COUNTS, type BoardCount, type GameSummary, type Move, type ParsedGame, type ViewerSettings } from './domain/types';

interface Slot { id: string; pinned: boolean }

export default function App() {
  const [study,setStudy] = useState<StudySession>();
  const [studying,setStudying] = useState(false);
  const studyingRef = useRef(false);
  const skipSwitch = useRef(false);
  const validation = useRef<AbortController | undefined>(undefined);
  const [studyMessage,setStudyMessage] = useState('');
  const [validating,setValidating] = useState(false);
  const [autoRestoring,setAutoRestoring] = useState(preparationRecovery?.purpose === 'study');
  const [hasSavedStudy,setHasSavedStudy] = useState(savedStudyExists);
  const [sound,setSound] = useState(loadPieceSound);
  const [restoredWatch,setRestoredWatch] = useState<WatchSnapshot>();
  const dialogGames = useRef(new Set<string>());
  const changeDialog = useCallback((id: string, open: boolean) => { if (open) dialogGames.current.add(id); else dialogGames.current.delete(id); },[]);
  const [panelRevision,setPanelRevision] = useState(0);
  const returnFocus = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (returnFocus.current === undefined) return;
    const index=returnFocus.current; returnFocus.current=undefined;
    const frame=requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.unified-panel')[index]?.querySelector<HTMLButtonElement>('.integrated-controls button,.current-move')?.focus({preventScroll:true}));
    return () => cancelAnimationFrame(frame);
  },[panelRevision]);
  const recovery = restoredWatch ?? analysisRecovery;
  const share = useMemo(() => readShareState(), []);
  const manuallySelectedPastGames = useRef(new Set<string>());
  const [savedSettings] = useState(loadSettings);
  const preferredBoardCount = useRef(savedSettings.boardCount);
  const [settings, setSettings] = useState<ViewerSettings>(() => {
    const saved = analysisRecovery?.settings ?? savedSettings;
    return {
      ...saved,
      ...(!analysisRecovery && share.boards ? { boardCount: share.boards } : {}),
      ...(!analysisRecovery && share.orientation ? { orientation: share.orientation } : {}),
    };
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const activePanel=useRef(0);
  const [selectedPanel,setSelectedPanel]=useState(()=>Math.max(0,analysisRecovery?.slots.findIndex(slot=>hasRecordRecovery('watch:'+slot.summary.id))??0));
  const [workspaceLayout,setWorkspaceLayout]=useState(loadWorkspaceLayout);
  const [recordControlsTarget,setRecordControlsTarget]=useState<HTMLDivElement|null>(null);
  const [settingsRequest,setSettingsRequest]=useState<{index:number;serial:number}>();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [games, setGames] = useState<GameSummary[]>(() => analysisRecovery?.slots.map((slot) => slot.summary) ?? []);
  const [slots, setSlots] = useState<Slot[]>(() => analysisRecovery?.slots.map((slot) => ({ id: slot.summary.id, pinned: slot.pinned })) ?? []);
  const analysisSnapshots = useRef(new Map<number, PanelSnapshot>(analysisRecovery?.slots.map((slot,index) => [index,slot])));
  const [completedGames]=useState(()=>new CompletedGames());
  const [favorites, setFavorites] = useState(loadFavorites);
  const [recent, setRecent] = useState(loadRecent);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fixture' | 'empty' | 'error'>('loading');
  const [view, setView] = useState<'live' | 'archive'>(analysisRecovery?.view ?? share.view ?? 'live');
  const [expanded, setExpanded] = useState<number | undefined>(analysisRecovery?.expanded);
  const [savedArchiveFilters] = useState(loadArchiveFilters);
  const [archiveFiltersSaved,setArchiveFiltersSaved] = useState(true);
  const [historyDate, setHistoryDate] = useState(savedArchiveFilters.historyDate);
  const [archiveSearch,setArchiveSearch] = useState<{date:string;fixture:boolean;ids:string[]}>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState(savedArchiveFilters.query);
  const [group, setGroup] = useState(savedArchiveFilters.group);
  const [resultFilter, setResultFilter] = useState<ArchiveFilters['resultFilter']>(savedArchiveFilters.resultFilter);
  const [minRate, setMinRate] = useState(savedArchiveFilters.minRate);
  const [maxRate, setMaxRate] = useState(savedArchiveFilters.maxRate);
  const [sort, setSort] = useState<ArchiveFilters['sort']>(savedArchiveFilters.sort);
  const analysisContext=useRef({slots,games,view,expanded,settings});
  useLayoutEffect(()=>{analysisContext.current={slots,games,view,expanded,settings};},[slots,games,view,expanded,settings]);
  const recordFinished = useCallback((game:GameSummary) => {
    if(!completedGames.remember(game))return;
    setGames(current=>completedGames.apply(current));
    const context=analysisContext.current;
    if(!context.settings.autoSwitchFinished||context.view!=='live'||studyingRef.current||validation.current)return;
    const protectedIds=new Set([...dialogGames.current,...manuallySelectedPastGames.current,...(share.game?[share.game]:[]),...[...analysisSnapshots.current.values()].filter(panel=>!panel.followingLatest).map(panel=>panel.summary.id)]);
    setSlots(current=>replaceFinishedSlots(current,completedGames.apply(context.games),protectedIds));
  },[completedGames,share.game]);
  const [favoriteOnly, setFavoriteOnly] = useState(savedArchiveFilters.favoriteOnly);
  useEffect(()=>{
    const saved=saveArchiveFilters({query,group,historyDate,minRate,maxRate,resultFilter,sort,favoriteOnly});
    let active=true;
    queueMicrotask(()=>{if(active)setArchiveFiltersSaved(saved);});
    return()=>{active=false;};
  },[query,group,historyDate,minRate,maxRate,resultFilter,sort,favoriteOnly]);
  const [viewerStats, setViewerStats] = useState<ViewerStats>();
  const [statsChecked, setStatsChecked] = useState(false);
  const [statsSessionId] = useState(getStatsSessionId);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    let inFlight=false;
    const refresh = async () => {
      if(inFlight||controller.signal.aborted)return;
      inFlight=true;
      try {
        const result = await loadCatalog(controller.signal);
        let initialExcluded=new Set<string>();
        if(!result.fixture&&!analysisRecovery&&!analysisContext.current.slots.length) {
          const checked=await initialGames(result.games,settings.boardCount,completedGames,controller.signal,share.game);
          result.games=checked.games;initialExcluded=checked.excluded;
        }else result.games=completedGames.apply(result.games);
        if(controller.signal.aborted)return;
        setGames((current) => [...result.games, ...current.filter((game) => !result.games.some((fresh) => fresh.id === game.id))]);
        setStatus(result.games.length ? result.fixture ? 'fixture' : 'ready' : 'empty');
        const restoringInitial = (first && Boolean(analysisRecovery)) || skipSwitch.current;
        skipSwitch.current = false;
        setSlots((current) => {
          if (restoringInitial || studyingRef.current || Boolean(validation.current)) return current;
          if (!current.length) {
            const shared=result.games.find(game=>game.id===share.game);
            const featured = selectFeaturedGames(result.games.filter(game=>game.id!==shared?.id&&!initialExcluded.has(game.id)), settings.boardCount-(shared?1:0));
            return [...(shared?[shared]:[]),...featured].map(game=>({id:game.id,pinned:false}));
          }
          if (!settings.autoSwitchFinished) return current;
          const protectedIds=new Set([...dialogGames.current,...manuallySelectedPastGames.current,...(share.game?[share.game]:[]),...[...analysisSnapshots.current.values()].filter(panel=>!panel.followingLatest).map(panel=>panel.summary.id)]);
          return replaceFinishedSlots(current,result.games,protectedIds);
        });
      } catch {
        if (!controller.signal.aborted && first) setStatus('error');
      } finally {
        inFlight=false;
        first = false;
        if (!controller.signal.aborted && !STATIC_MODE) timeout = setTimeout(refresh, document.hidden ? 120_000 : 30_000);
      }
    };
    void refresh();
    const onVisibility = () => { if (STATIC_MODE) return; if (timeout) clearTimeout(timeout); timeout = setTimeout(refresh, document.hidden ? 120_000 : 1_000); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { controller.abort(); if (timeout) clearTimeout(timeout); document.removeEventListener('visibilitychange', onVisibility); };
  }, [settings.autoSwitchFinished, settings.boardCount, share.game,completedGames]);

  useEffect(() => {
    saveSettings({...settings,boardCount:preferredBoardCount.current});
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
  }, [settings]);

  const setBoardCount = (count: BoardCount) => {
    preferredBoardCount.current=count;
    setMenuOpen(false);
    setSettings((value) => ({ ...value, boardCount: count }));
    setExpanded(undefined);
    setSlots((current) => {
      const pinned = current.filter((slot) => slot.pinned).slice(0, count);
      const exclude = new Set(pinned.map((slot) => slot.id));
      const recommended = selectFeaturedGames(games.filter((game) => !exclude.has(game.id)), count - pinned.length);
      return [...pinned, ...recommended.map((game) => ({ id: game.id, pinned: false }))];
    });
  };

  const protectSelectedPastGame = (id:string) => {
    if(games.some(game=>game.id===id&&!game.live))manuallySelectedPastGames.current.add(id);
  };
  const openArchivedGame = (id:string) => {
    protectSelectedPastGame(id);
    setSlots(current=>[{id,pinned:false},...current.slice(1)]);
    setExpanded(undefined);
    activePanel.current=0;
    setSelectedPanel(0);
    setView('live');
  };

  const toggleFavorite = (name: string) => {
    setFavorites((current) => {
      const next = current.includes(name) ? current.filter((value) => value !== name) : [...current, name];
      saveFavorites(next);
      return next;
    });
  };

  const recordViewed = useCallback((id: string) => {
    setRecent(addRecent(id));
  }, []);

  const searchDay = async () => {
    if (!historyDate) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    try {
      const result = await loadDay(historyDate, controller.signal);
      setArchiveSearch({date:historyDate,fixture:result.fixture,ids:result.games.map(game=>game.id)});
      setGames((current) => [...result.games, ...current.filter((game) => !result.games.some((item) => item.id === game.id))]);
      setStatus(result.fixture ? 'fixture' : 'ready');
    } finally { setHistoryLoading(false); }
  };

  const filteredGames = useMemo(() => {
    const term = query.trim().toLowerCase();
    const min = minRate ? Number(minRate) : -Infinity;
    const max = maxRate ? Number(maxRate) : Infinity;
    const hasRateBounds = Boolean(minRate || maxRate);
    return games.filter((game) => {
      const ratingMatch = !hasRateBounds || [game.blackRate, game.whiteRate].every(
        rate => typeof rate === 'number' && Number.isFinite(rate) && rate >= min && rate <= max);
      return (!term || game.black.toLowerCase().includes(term) || game.white.toLowerCase().includes(term))
        && (group === 'all' || game.group === group)
        && (!archiveSearch || (archiveSearch.fixture ? archiveSearch.ids.includes(game.id) : game.startedAt.slice(0,10)===archiveSearch.date))
        && (resultFilter === 'all' || (resultFilter === 'live' ? game.live : !game.live && (resultFilter === 'finished' || game.result===resultFilter+'勝ち')))
        && (!favoriteOnly || favorites.includes(game.black) || favorites.includes(game.white))
        && ratingMatch;
    }).sort((a, b) => sort === 'high' ? compareGames(a, b) : sort === 'low' ? compareGames(b, a) : b.startedAt.localeCompare(a.startedAt));
  }, [games, query, group, resultFilter, minRate, maxRate, sort, favoriteOnly, favorites, archiveSearch]);

  const visibleSlots = expanded !== undefined ? slots.slice(expanded, expanded + 1) : slots.slice(0, settings.boardCount);
  const visibleGameIdsKey = visibleSlots.map((slot) => slot.id).join('\n');
  const isExpandedLive = view === 'live' && expanded !== undefined;
  const isSingleBoardLive = view === 'live' && !isExpandedLive && visibleSlots.length === 1;
  const isTwoBoardLive = view === 'live' && !isExpandedLive && visibleSlots.length === 2;
  const isFourBoardLive = view === 'live' && !isExpandedLive && visibleSlots.length === 4;
  const liveViewClass = isExpandedLive
    ? ' expanded-view'
    : isSingleBoardLive
      ? ' single-board-view'
      : isTwoBoardLive
        ? ' two-board-view'
        : isFourBoardLive
          ? ' four-board-view'
          : '';
  const liveMainClass = isExpandedLive
    ? 'expanded-main'
    : isSingleBoardLive
      ? 'single-board-main'
      : isTwoBoardLive
        ? 'two-board-main'
        : isFourBoardLive
          ? 'four-board-main'
          : undefined;
  const statsAvailable = Boolean(viewerStats);
  const statsLabel = statsAvailable ? `来場 ${formatPeoplePerDay(viewerStats?.pageViewsToday)}` : statsChecked ? '統計 未接続' : '統計 確認中';

  useEffect(() => {
    const controller = new AbortController();
    void recordPageView(statsSessionId, controller.signal).then((stats) => {
      if (stats) setViewerStats(stats);
    }).catch((error) => {
      if (!controller.signal.aborted) console.warn('stats page view failed', error);
    }).finally(() => {
      if (!controller.signal.aborted) setStatsChecked(true);
    });
    return () => controller.abort();
  }, [statsSessionId]);

  useEffect(() => {
    if (studying || view !== 'live' || !visibleGameIdsKey) return;
    const gameIds = visibleGameIdsKey.split('\n');
    const controller = new AbortController();
    const send = async () => {
      try {
        const stats = await heartbeatStats(statsSessionId, gameIds, controller.signal);
        if (stats) setViewerStats(stats);
      } catch (error) {
        if (!controller.signal.aborted) console.warn('stats heartbeat failed', error);
      } finally {
        if (!controller.signal.aborted) setStatsChecked(true);
      }
    };
    void send();
    const timer = setInterval(send, 25_000);
    const onVisibility = () => { if (!document.hidden) void send(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [view, statsSessionId, visibleGameIdsKey, studying]);

  const toggleSound = () => setSound((on) => { savePieceSound(!on); return !on; });
  const watchSnapshot = (): WatchSnapshot => ({
    slots:slots.map((slot,index) => {
      const snapshot = analysisSnapshots.current.get(index);
      if (!snapshot?.game || snapshot.summary.id !== slot.id) throw new Error('すべての観戦枠の棋譜取得後に検討を開始してください');
      return {...snapshot,pinned:slot.pinned};
    }), view,expanded,settings:{...settings},at:0,
  });
  const startStudy = async (game: ParsedGame, ply: number, snapshot: PanelSnapshot, index: number, move:Move, isCurrent:()=>boolean) => {
    if (validation.current) return false;
    if ((study || hasSavedStudy) && !confirm('保存中の検討を新しい起点に置き換えますか？')) return false;
    const controller = new AbortController(); validation.current=controller;
    setValidating(true); setStudyMessage('');
    try {
      analysisSnapshots.current.set(index,snapshot);
      const watch = watchSnapshot();
      const session = await createStudy(game,ply,watch,snapshot.flipped,snapshot.enabled,controller.signal,{move,isCurrent});
      if (controller.signal.aborted) return false;
      studyingRef.current=true; setStudying(true); localAnalysis.stopAll(); setStudy(session); setHasSavedStudy(true); setExpanded(settings.boardCount === 1 && expanded === undefined ? undefined : index); setView('live');
      playPieceSound(sound);
      return true;
    } catch (error) { setStudyMessage((error as Error).message); return false; }
    finally { validation.current=undefined; setValidating(false); }
  };
  const resumeStudy = async (automatic = false, preferredIndex?: number, nodeId?:string) => {
    if (validation.current) return;
    const controller = new AbortController(); validation.current=controller;
    setValidating(true); setStudyMessage('');
    try {
      let saved = await restoreStudy(controller.signal);
      if (!saved) throw new Error('保存された検討はありません');
      if (automatic && (saved.id !== preparationRecovery?.studySessionId || !globalThis.crossOriginIsolated)) throw new Error('解析準備後の検討を自動復元できませんでした。前の検討を再開から確認してください');
      if (controller.signal.aborted) return;
      if (!automatic) saved.watch = watchSnapshot();
      if(nodeId) saved=navigateStudy(saved,nodeId);
      persistStudy(saved); studyingRef.current=true; setStudying(true); localAnalysis.stopAll(); setStudy(saved);
      const index=preferredIndex !== undefined && slots[preferredIndex]?.id === saved.game.id ? preferredIndex : slots.findIndex(slot => slot.id === saved.game.id);
      if (index < 0) {
        setSlots(current => [{id:saved.game.id,pinned:true},...current.slice(1)]);
        setGames(current => [saved.game,...current.filter(game => game.id !== saved.game.id)]);
      }
      setExpanded(settings.boardCount === 1 && expanded === undefined ? undefined : Math.max(0,index)); setView('live');
    } catch (error) { setStudyMessage((error as Error).message); }
    finally { validation.current=undefined; setValidating(false); setAutoRestoring(false); }
  };
  const autoResumeStarted = useRef(false);
  useEffect(() => {
    if (preparationRecovery?.purpose !== 'study' || autoResumeStarted.current) return;
    autoResumeStarted.current=true;
    // Run after mount so no engine is started by an unvalidated saved session.
    void Promise.resolve().then(() => resumeStudy(true));
    // Only the consumed reload marker may trigger this once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const returnFromStudy = async (target?: ReturnToSource) => {
    if (!study) return;
    const saved=persistStudy(study); await localAnalysis.settle();
    const watch: WatchSnapshot={...saved.watch,slots:saved.watch.slots.map(slot => ({...slot})),at:saved.at};
    let index=expanded !== undefined && watch.slots[expanded]?.summary.id === saved.game.id ? expanded : watch.slots.findIndex(slot => slot.summary.id === saved.game.id);
    if (target && index < 0) index=0;
    if (index >= 0) {
      const slot=watch.slots[index];
      watch.slots[index]={...slot,followingLatest:false,
        ...(target?.game ? {summary:target.game,game:target.game} : {}),
        ...(target?.ply !== undefined ? {ply:target.ply} : {})};
    }
    analysisSnapshots.current=new Map(watch.slots.map((slot,i) => [i,slot]));
    skipSwitch.current=true;
    setSettings(watch.settings); setView(watch.view); setExpanded(watch.expanded);
    setSlots(watch.slots.map(slot => ({id:slot.summary.id,pinned:slot.pinned})));
    setGames(current => [...watch.slots.map(slot => slot.summary),...current.filter(game => !watch.slots.some(slot => slot.summary.id === game.id))]);
    returnFocus.current=watch.expanded !== undefined ? 0 : Math.max(0,index);
    setRestoredWatch(watch); setPanelRevision(value => value+1); studyingRef.current=false; setStudying(false);
  };

  const preparePanelAnalysis = (selectedIndex: number, signal?: AbortSignal) => {
    return prepareAnalysis(() => {
      const {slots,games,view,expanded,settings}=analysisContext.current;
      const snapshots = slots.map((slot, index): PanelSnapshot => {
        const current = analysisSnapshots.current.get(index);
        const snapshot = current?.summary.id === slot.id ? current : {
          summary: games.find((game) => game.id === slot.id)!,
          pinned: slot.pinned, ply: Number.MAX_SAFE_INTEGER, flipped: settings.orientation === 'white', enabled: loadAnalysisEnabled(slot.id), followingLatest: true,
        };
        return { ...snapshot, enabled: index === selectedIndex || snapshot.enabled };
      });
      return { slots: snapshots, view, expanded, settings };
    },undefined,signal);
  };

  const changeView = (next: 'live' | 'archive') => {
    setView(next); setMenuOpen(false);
  };

  return (
    <div data-layout={workspaceLayout} className={`app-shell integrated-app${liveViewClass}${studying ? ' unified-studying' : ''}`}>
      <div className="watch-shell">
      <a className="skip-link" href="#main">本文へ移動</a>
      <header className="site-header" onKeyDown={event=>{if(event.key==='Escape')setMenuOpen(false);}}>
        <div className="title-block"><img className="dawn-logo" src={`${import.meta.env.BASE_URL}dawn.svg`} alt="夜明け"/><h1>Floodgate Multi Viewer</h1></div>
        <nav className="header-main-nav" aria-label="メインメニュー"><button disabled={studying || validating} className={view === 'live' ? 'active' : ''} onClick={() => changeView('live')}>ライブ</button><button disabled={studying || validating} className={view === 'archive' ? 'active' : ''} onClick={() => changeView('archive')}>過去対局</button></nav>
        {view==='live'&&<div className="workspace-toolbar" aria-label="観戦・解析操作">
          <div className="desktop-layout"><label><select aria-label="配置" value={workspaceLayout} onChange={e=>{const layout=e.target.value as WorkspaceLayout;setWorkspaceLayout(layout);try{localStorage.setItem('fgmv:layout:v1',layout);}catch{/* Optional preference. */}}}><option value="auto">自動</option><option value="stack">縦型</option><option value="side">横型</option></select></label></div>
          <label><select aria-label="表示局数" value={settings.boardCount} disabled={studying||validating} onChange={e=>setBoardCount(Number(e.target.value) as BoardCount)}>{BOARD_COUNTS.map(n=><option key={n} value={n}>{n}局</option>)}</select></label>
          <div className="workspace-analysis-controls" ref={setRecordControlsTarget}/>
        </div>}
        <button className="mobile-menu-toggle" aria-label="表示と設定" aria-expanded={menuOpen} aria-controls="header-menu" onClick={() => setMenuOpen(open => !open)}>⚙</button>
        <div id="header-menu" className={`header-menu${menuOpen ? ' is-open' : ''}`}>
          <nav className="mobile-navigation" aria-label="画面切替"><button disabled={studying || validating} className={view === 'live' ? 'active' : ''} onClick={() => changeView('live')}>ライブ</button><button disabled={studying || validating} className={view === 'archive' ? 'active' : ''} onClick={() => changeView('archive')}>過去対局</button></nav>
          <div className="mobile-layout"><label><span>配置</span><select aria-label="スマホの配置" value={workspaceLayout} onChange={e=>{const layout=e.target.value as WorkspaceLayout;setWorkspaceLayout(layout);try{localStorage.setItem('fgmv:layout:v1',layout);}catch{/* Optional preference. */}}}><option value="auto">自動</option><option value="stack">縦型</option><option value="side">横型</option></select></label></div>
          <button className="app-settings-toggle" aria-label="設定を開く" disabled={view !== 'live' || validating || autoRestoring || !visibleSlots.length} onClick={() => { document.querySelector<HTMLButtonElement>('.mobile-menu-toggle')?.focus({preventScroll:true}); setMenuOpen(false); const index=expanded ?? Math.min(activePanel.current,visibleSlots.length-1); setSettingsRequest(value => ({index,serial:(value?.serial ?? 0)+1})); }}>選択中の盤の設定</button>
          <div className="header-actions">
            <button className="sound-toggle" aria-pressed={sound} onClick={toggleSound}>駒音 {sound ? 'ON' : 'OFF'}</button>
            <label className="theme-select">配色<select aria-label="配色" value={settings.theme} onChange={event => setSettings(value => ({ ...value, theme: event.target.value as ViewerSettings['theme'] }))}><option value="system">端末設定</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label>
            <a className="header-source-link" aria-label="Floodgate 公開情報" href="https://wdoor.c.u-tokyo.ac.jp/shogi/" target="_blank" rel="noreferrer">出典</a>
            <label className="auto-switch"><input type="checkbox" checked={settings.autoSwitchFinished} onChange={event => setSettings(value => ({ ...value, autoSwitchFinished: event.target.checked }))} />終局後に注目局へ切替</label>
          </div>
          <div className="header-summary legend" aria-label="観戦情報"><strong><i className="live-dot" />注目対局</strong><span>{statsLabel}</span><span>お気に入り {favorites.length}</span><span>最近見た {recent.length}</span></div>
        </div>
      </header>

      <main id="main" className={liveMainClass}>
        {view==='live' && status!=='loading' && !visibleSlots.length && <div className="notice" role="status">表示できる注目対局をまだ確認できません。過去対局から手動で選ぶか、次の更新をお待ちください。</div>}
        {validating && <div className="notice" role="status">棋譜・保存データを検証中…<button onClick={() => validation.current?.abort()}>取消</button></div>}
        {studyMessage && <div className="notice error" role="alert">{studyMessage}</div>}
        {status === 'fixture' && <div className={`notice warning${noticeOpen ? ' is-open' : ''}`} role="status"><strong>静的fixtureで表示中</strong><button className="mobile-notice-toggle" aria-expanded={noticeOpen} aria-controls="fixture-notice" onClick={() => setNoticeOpen((open) => !open)}>{noticeOpen ? '閉じる' : '詳細'}</button><span id="fixture-notice">LIVE中継に接続できないため、同梱データを表示しています。ライブ更新と統計は停止中です。</span></div>}
        {status === 'error' && <div className="notice error" role="alert">対局情報を取得できませんでした。しばらくしてから再読み込みしてください。</div>}
        {status === 'empty' && <div className="empty-state">表示できる対局がありません。</div>}

        {view === 'archive' && <section className="archive-search" aria-labelledby="archive-title">
          <div className="section-title"><div><span className="eyebrow">ARCHIVE</span><h2 id="archive-title">過去対局を探す</h2></div><span>{filteredGames.length}局</span></div>
          <button className="archive-white-win" aria-pressed={resultFilter==='後手'} onClick={()=>setResultFilter('後手')}>後手勝ちを探す</button>
          <p className="archive-scope" role="status">検索対象：{(archiveSearch?.fixture??status==='fixture')?'同梱データ（指定日の実データではありません）':archiveSearch?archiveSearch.date+'の取得済み対局':'この画面に取得済みの対局'}。勝敗不明の対局は勝ち側の検索に含めません。</p>
          <p className="archive-scope" role="status">{archiveFiltersSaved?'検索条件はこのブラウザーに自動保存されます。日付の対局は「指定日を取得」で読み込みます。':'検索条件を保存できません。このタブ内でのみ保持されます。'}</p>
          <div className="filters">
            <label>AI名<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前で絞り込み" /></label>
            <label>日付<input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /></label>
            <button disabled={!historyDate || historyLoading} onClick={searchDay}>{historyLoading ? '取得中…' : '指定日を取得'}</button>
            <label>対局グループ<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">すべて</option>{[...new Set([...(group==='all'?[]:[group]),...games.map((game) => game.group)])].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>結果<select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as ArchiveFilters['resultFilter'])}><option value="all">すべて</option><option value="live">進行中</option><option value="finished">終局</option><option value="先手">先手勝ち</option><option value="後手">後手勝ち</option></select></label>
            <label>レート下限（両者）<input type="number" value={minRate} onChange={(event) => setMinRate(event.target.value)} placeholder="例 2500" /></label>
            <label>レート上限（両者）<input type="number" value={maxRate} onChange={(event) => setMaxRate(event.target.value)} placeholder="例 4000" /></label>
            <label>並び順<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="new">新しい順</option><option value="high">上位レート順</option><option value="low">下位レート順</option></select></label>
            <label className="favorite-filter"><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} />お気に入りAIのみ</label>
          </div>
          <details className="recent-games"><summary>最近見た対局（{recent.length}）</summary>{recent.length ? <ul>{recent.map((id) => <li key={id}><button disabled={!games.some((game) => game.id === id)} onClick={() => openArchivedGame(id)}>{games.find((game) => game.id === id)?.black ?? id} {games.find((game) => game.id === id) ? `vs ${games.find((game) => game.id === id)?.white}` : '（一覧外）'}</button></li>)}</ul> : <p>まだありません。</p>}</details>
          <div className="archive-list">{filteredGames.map((game) => <button key={game.id} onClick={() => openArchivedGame(game.id)}><span>{status === 'fixture' ? 'FIXTURE' : game.live ? 'LIVE' : game.result ?? '終局'}</span><strong>{game.black} <small>vs</small> {game.white}</strong><span>{game.startedAt ? new Date(game.startedAt).toLocaleString('ja-JP') : '日時不明'} · {game.group}</span></button>)}</div>
        </section>}

        {view === 'live' && <section className="live-section" aria-label="対局盤面" onPointerDownCapture={event => { const panel=(event.target as HTMLElement).closest('.unified-panel'); const index=[...event.currentTarget.querySelectorAll('.unified-panel')].indexOf(panel as Element); if (index >= 0) {activePanel.current=expanded??index;setSelectedPanel(expanded??index);} }} onFocusCapture={event => { const panel=(event.target as HTMLElement).closest('.unified-panel'); const index=[...event.currentTarget.querySelectorAll('.unified-panel')].indexOf(panel as Element); if (index >= 0) {activePanel.current=expanded??index;setSelectedPanel(expanded??index);} }}>
          {status === 'loading' ? <div className="board-skeleton" role="status">注目対局を選んでいます…</div> : <div className={`boards count-${visibleSlots.length}`} data-testid="boards">
            {visibleSlots.map((slot, index) => {
              const summary = games.find((game) => game.id === slot.id);
              if (!summary) return null;
              const realIndex = expanded !== undefined ? expanded : index;
              const restoredPanel = recovery?.slots[realIndex]?.summary.id === summary.id ? recovery.slots[realIndex] : undefined;
              return <WorkspaceContext.Provider key={panelRevision+':'+realIndex+':'+slot.id} value={{layout:workspaceLayout,selected:studying||realIndex===(expanded??Math.min(selectedPanel,visibleSlots.length-1)),controlsTarget:recordControlsTarget}}><GamePanel onGameFinished={recordFinished} settingsRequest={settingsRequest?.index === realIndex ? settingsRequest.serial : undefined} savedStudy={study?.game.id===summary.id?study:undefined} onResumeStudy={hasSavedStudy ? nodeId => void resumeStudy(false,realIndex,nodeId) : undefined} study={studying ? study : undefined} onStudyChange={setStudy} onReturnStudy={returnFromStudy} onSound={toggleSound} onDialogChange={changeDialog} suspended={studying || validating || autoRestoring} sound={sound} onStudy={(game,ply,snapshot,move,isCurrent) => startStudy(game,ply,snapshot,realIndex,move,isCurrent)} initialGame={restoredPanel?.game} initialFollowingLatest={restoredPanel?.followingLatest}
                key={`${panelRevision}:${restoredWatch?.at ?? 0}:${realIndex}:${slot.id}`} summary={summary} stats={viewerStats?.games[summary.id]} games={games} defaultSpeed={restoredPanel?.speed ?? settings.playbackSeconds} initialPly={restoredPanel?.ply ?? (realIndex === 0 ? share.ply : undefined)} defaultFlipped={restoredPanel?.flipped ?? settings.orientation === 'white'} initialAnalysisEnabled={restoredPanel?.enabled} onAnalysisSnapshot={(snapshot) => { analysisSnapshots.current.set(realIndex, snapshot); }} onPrepareAnalysis={(signal) => preparePanelAnalysis(realIndex,signal)} pinned={slot.pinned} favoriteNames={favorites} onFavorite={toggleFavorite} onViewed={recordViewed} onSelect={(id) => {protectSelectedPastGame(id);setSlots((current) => current.map((value, position) => position === realIndex ? { ...value, id } : value));}} onPin={() => setSlots((current) => current.map((value, position) => position === realIndex ? { ...value, pinned: !value.pinned } : value))} onSpeedChange={(seconds) => setSettings((value) => ({ ...value, playbackSeconds: seconds }))} boardCount={settings.boardCount} fixture={status === 'fixture'} onOrientationChange={(flipped) => setSettings((value) => ({ ...value, orientation: flipped ? 'white' : 'black' }))} onExpand={() => setExpanded((value) => value === realIndex ? undefined : realIndex)} expanded={expanded === realIndex} /></WorkspaceContext.Provider>;
            })}
          </div>}
        </section>}
      </main>
      <footer className="site-footer"><p><strong>非公式ビューア</strong> — Floodgateおよび運営組織とは関係ありません。表示内容の正確性・継続性を保証しません。</p><p>出典: <a href="https://wdoor.c.u-tokyo.ac.jp/shogi/" target="_blank" rel="noreferrer">Floodgate 公開情報</a> · 取得頻度を抑え、公開パスだけを参照します。</p></footer>
      </div>
    </div>
  );
}

function formatPeoplePerDay(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ja-JP')}人/日` : '-';
}
