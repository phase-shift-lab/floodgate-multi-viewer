import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { analysisRecovery, preparationRecovery, prepareAnalysis, type PanelSnapshot } from './engine/isolation';
import type { ReturnToSource } from './components/StudyView';
import { createStudy, persistStudy, restoreStudy, savedStudyExists, type StudySession, type WatchSnapshot } from './domain/studySession';
import { localAnalysis } from './engine/localAnalysis';
import { loadPieceSound, savePieceSound } from './data/pieceSound';
import { loadAnalysisEnabled } from './data/analysisPreferences';
import { GamePanel } from './components/GamePanel';
import { heartbeatStats, loadCatalog, loadDay, recordPageView, STATIC_MODE, type ViewerStats } from './data/client';
import { addRecent, getStatsSessionId, loadFavorites, loadRecent, loadSettings, readShareState, saveFavorites, saveSettings } from './data/preferences';
import { compareGames, selectFeaturedGames } from './domain/selection';
import type { GameSummary, ParsedGame, ViewerSettings } from './domain/types';

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
    const frame=requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.unified-panel')[index]?.querySelector<HTMLButtonElement>('.current-move')?.focus({preventScroll:true}));
    return () => cancelAnimationFrame(frame);
  },[panelRevision]);
  const recovery = restoredWatch ?? analysisRecovery;
  const share = useMemo(() => readShareState(), []);
  const [settings, setSettings] = useState<ViewerSettings>(() => {
    const saved = analysisRecovery?.settings ?? loadSettings();
    return {
      ...saved,
      boardCount: matchMedia('(max-width: 767px)').matches && !analysisRecovery ? 1 : saved.boardCount,
      ...(!analysisRecovery && share.boards ? { boardCount: share.boards } : {}),
      ...(!analysisRecovery && share.orientation ? { orientation: share.orientation } : {}),
    };
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const activePanel=useRef(0);
  const [settingsRequest,setSettingsRequest]=useState<{index:number;serial:number}>();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [games, setGames] = useState<GameSummary[]>(() => analysisRecovery?.slots.map((slot) => slot.summary) ?? []);
  const [slots, setSlots] = useState<Slot[]>(() => analysisRecovery?.slots.map((slot) => ({ id: slot.summary.id, pinned: slot.pinned })) ?? []);
  const analysisSnapshots = useRef(new Map<number, PanelSnapshot>(analysisRecovery?.slots.map((slot,index) => [index,slot])));
  const [favorites, setFavorites] = useState(loadFavorites);
  const [recent, setRecent] = useState(loadRecent);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fixture' | 'empty' | 'error'>('loading');
  const [view, setView] = useState<'live' | 'archive'>(analysisRecovery?.view ?? share.view ?? 'live');
  const [expanded, setExpanded] = useState<number | undefined>(analysisRecovery?.expanded);
  const [historyDate, setHistoryDate] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [sort, setSort] = useState<'new' | 'high' | 'low'>('new');
  const analysisContext=useRef({slots,games,view,expanded,settings});
  useLayoutEffect(()=>{analysisContext.current={slots,games,view,expanded,settings};},[slots,games,view,expanded,settings]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [viewerStats, setViewerStats] = useState<ViewerStats>();
  const [statsChecked, setStatsChecked] = useState(false);
  const [statsSessionId] = useState(getStatsSessionId);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const refresh = async () => {
      try {
        const result = await loadCatalog(controller.signal);
        setGames((current) => [...result.games, ...current.filter((game) => !result.games.some((fresh) => fresh.id === game.id))]);
        setStatus(result.games.length ? result.fixture ? 'fixture' : 'ready' : 'empty');
        const restoringInitial = (first && Boolean(analysisRecovery)) || skipSwitch.current;
        skipSwitch.current = false;
        setSlots((current) => {
          if (restoringInitial || studyingRef.current || Boolean(validation.current)) return current;
          if (!current.length) {
            const featured = selectFeaturedGames(result.games, settings.boardCount);
            const shared = share.game && result.games.some((game) => game.id === share.game) ? share.game : undefined;
            return featured.map((game, index) => ({ id: index === 0 && shared ? shared : game.id, pinned: false }));
          }
          if (!settings.autoSwitchFinished) return current;
          const kept = current.filter((slot) => slot.pinned || dialogGames.current.has(slot.id)
            || [...analysisSnapshots.current.values()].some(panel => panel.summary.id === slot.id && panel.followingLatest === false)
            || result.games.find((game) => game.id === slot.id)?.live);
          const exclude = new Set(kept.map((slot) => slot.id));
          const replacements = selectFeaturedGames(result.games.filter((game) => !exclude.has(game.id)), settings.boardCount - kept.length);
          return [...kept, ...replacements.map((game) => ({ id: game.id, pinned: false }))];
        });
      } catch {
        if (!controller.signal.aborted && first) setStatus('error');
      } finally {
        first = false;
        if (!controller.signal.aborted && !STATIC_MODE) timeout = setTimeout(refresh, document.hidden ? 120_000 : 30_000);
      }
    };
    void refresh();
    const onVisibility = () => { if (STATIC_MODE) return; if (timeout) clearTimeout(timeout); timeout = setTimeout(refresh, document.hidden ? 120_000 : 1_000); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { controller.abort(); if (timeout) clearTimeout(timeout); document.removeEventListener('visibilitychange', onVisibility); };
  }, [settings.autoSwitchFinished, settings.boardCount, share.game]);

  useEffect(() => {
    saveSettings(settings);
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
  }, [settings]);

  const setBoardCount = (count: 1 | 2 | 4) => {
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
      const rates = [game.blackRate, game.whiteRate].filter((rate): rate is number => rate !== undefined);
      const ratingMatch = !hasRateBounds || (rates.length > 0 && rates.some((rate) => rate >= min && rate <= max));
      return (!term || game.black.toLowerCase().includes(term) || game.white.toLowerCase().includes(term))
        && (group === 'all' || game.group === group)
        && (resultFilter === 'all' || (resultFilter === 'live' ? game.live : !game.live && (resultFilter === 'finished' || game.result?.includes(resultFilter))))
        && (!favoriteOnly || favorites.includes(game.black) || favorites.includes(game.white))
        && ratingMatch;
    }).sort((a, b) => sort === 'high' ? compareGames(a, b) : sort === 'low' ? compareGames(b, a) : b.startedAt.localeCompare(a.startedAt));
  }, [games, query, group, resultFilter, minRate, maxRate, sort, favoriteOnly, favorites]);

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
  const startStudy = async (game: ParsedGame, ply: number, snapshot: PanelSnapshot, index: number) => {
    if (validation.current) return;
    if ((study || hasSavedStudy) && !confirm('保存中の検討を新しい起点に置き換えますか？')) return;
    const controller = new AbortController(); validation.current=controller;
    setValidating(true); setStudyMessage('');
    try {
      analysisSnapshots.current.set(index,snapshot);
      const watch = watchSnapshot();
      const session = await createStudy(game,ply,watch,snapshot.flipped,snapshot.enabled,controller.signal);
      if (controller.signal.aborted) return;
      studyingRef.current=true; setStudying(true); localAnalysis.stopAll(); setStudy(session); setHasSavedStudy(true); setExpanded(settings.boardCount === 1 && expanded === undefined ? undefined : index); setView('live');
    } catch (error) { setStudyMessage((error as Error).message); }
    finally { validation.current=undefined; setValidating(false); }
  };
  const resumeStudy = async (automatic = false, preferredIndex?: number) => {
    if (validation.current) return;
    const controller = new AbortController(); validation.current=controller;
    setValidating(true); setStudyMessage('');
    try {
      const saved = await restoreStudy(controller.signal);
      if (!saved) throw new Error('保存された検討はありません');
      if (automatic && (saved.id !== preparationRecovery?.studySessionId || !globalThis.crossOriginIsolated)) throw new Error('解析準備後の検討を自動復元できませんでした。前の検討を再開から確認してください');
      if (controller.signal.aborted) return;
      if (!automatic) saved.watch = watchSnapshot();
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
    <div className={`app-shell${liveViewClass}${studying ? ' unified-studying' : ''}`}>
      <div className="watch-shell">
      <a className="skip-link" href="#main">本文へ移動</a>
      <header className="site-header">
        <div className="title-block"><span className="mark" aria-hidden="true">多</span><div><h1>Floodgate Multi Viewer</h1>{view === 'live' ? <div className="header-summary legend" aria-label="観戦情報"><strong><i className="live-dot" />注目対局</strong><span className={statsAvailable ? undefined : 'stats-status'}>{statsLabel}</span><span>お気に入り {favorites.length}</span><span>最近見た {recent.length}</span></div> : <p>公開棋譜を静かに、見やすく。</p>}</div></div>
        <button className="app-settings-toggle" aria-label="設定を開く" disabled={view !== 'live' || validating || autoRestoring || !visibleSlots.length} title="選択中の盤の設定" onClick={event => { event.currentTarget.focus({preventScroll:true}); setMenuOpen(false); const index=expanded ?? Math.min(activePanel.current,visibleSlots.length-1); setSettingsRequest(value => ({index,serial:(value?.serial ?? 0)+1})); }}>⚙</button>
        <button className="mobile-menu-toggle" aria-expanded={menuOpen} aria-controls="header-menu" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? '閉じる' : 'メニュー'}</button>
        <div id="header-menu" className={`header-menu${menuOpen ? ' is-open' : ''}`}>
          <nav aria-label="メインメニュー">
            <button disabled={studying} className={view === 'live' ? 'active' : ''} onClick={() => changeView('live')}>ライブ</button>
            <button disabled={studying} className={view === 'archive' ? 'active' : ''} onClick={() => changeView('archive')}>過去対局</button>
          </nav>
          <div className="header-actions">
            <button className="sound-toggle" aria-pressed={sound} onClick={toggleSound}>駒音 {sound ? 'ON' : 'OFF'}</button>
            <fieldset className="count-switch"><legend>表示局数</legend>{([1,2,4] as const).map((count) => <button key={count} disabled={studying} aria-pressed={settings.boardCount === count} onClick={() => setBoardCount(count)}>{count}局</button>)}</fieldset>
            <label className="theme-select">配色<select aria-label="配色" value={settings.theme} onChange={(event) => setSettings((value) => ({ ...value, theme: event.target.value as ViewerSettings['theme'] }))}><option value="system">端末設定</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label>
            <a className="header-source-link" aria-label="Floodgate 公開情報" href="https://wdoor.c.u-tokyo.ac.jp/shogi/" target="_blank" rel="noreferrer">出典</a>
            <label className="auto-switch"><input type="checkbox" checked={settings.autoSwitchFinished} onChange={(event) => setSettings((value) => ({ ...value, autoSwitchFinished: event.target.checked }))} />終局後に注目局へ切替</label>
          </div>
        </div>
      </header>

      <main id="main" className={liveMainClass}>
        {validating && <div className="notice" role="status">棋譜・保存データを検証中…<button onClick={() => validation.current?.abort()}>取消</button></div>}
        {studyMessage && <div className="notice error" role="alert">{studyMessage}</div>}
        {status === 'fixture' && <div className={`notice warning${noticeOpen ? ' is-open' : ''}`} role="status"><strong>静的fixtureで表示中</strong><button className="mobile-notice-toggle" aria-expanded={noticeOpen} aria-controls="fixture-notice" onClick={() => setNoticeOpen((open) => !open)}>{noticeOpen ? '閉じる' : '詳細'}</button><span id="fixture-notice">LIVE中継に接続できないため、同梱データを表示しています。ライブ更新と統計は停止中です。</span></div>}
        {status === 'error' && <div className="notice error" role="alert">対局情報を取得できませんでした。しばらくしてから再読み込みしてください。</div>}
        {status === 'empty' && <div className="empty-state">表示できる対局がありません。</div>}

        {view === 'archive' && <section className="archive-search" aria-labelledby="archive-title">
          <div className="section-title"><div><span className="eyebrow">ARCHIVE</span><h2 id="archive-title">過去対局を探す</h2></div><span>{filteredGames.length}局</span></div>
          <div className="filters">
            <label>AI名<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前で絞り込み" /></label>
            <label>日付<input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /></label>
            <button disabled={!historyDate || historyLoading} onClick={searchDay}>{historyLoading ? '取得中…' : '指定日を取得'}</button>
            <label>対局グループ<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">すべて</option>{[...new Set(games.map((game) => game.group))].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>結果<select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}><option value="all">すべて</option><option value="live">進行中</option><option value="finished">終局</option><option value="先手">先手勝ち</option><option value="後手">後手勝ち</option></select></label>
            <label>レート下限<input type="number" value={minRate} onChange={(event) => setMinRate(event.target.value)} placeholder="例 2500" /></label>
            <label>レート上限<input type="number" value={maxRate} onChange={(event) => setMaxRate(event.target.value)} placeholder="例 4000" /></label>
            <label>並び順<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="new">新しい順</option><option value="high">上位レート順</option><option value="low">下位レート順</option></select></label>
            <label className="favorite-filter"><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} />お気に入りAIのみ</label>
          </div>
          <details className="recent-games"><summary>最近見た対局（{recent.length}）</summary>{recent.length ? <ul>{recent.map((id) => <li key={id}><button disabled={!games.some((game) => game.id === id)} onClick={() => { setSlots((current) => [{ id, pinned: false }, ...current.slice(1)]); setView('live'); }}>{games.find((game) => game.id === id)?.black ?? id} {games.find((game) => game.id === id) ? `vs ${games.find((game) => game.id === id)?.white}` : '（一覧外）'}</button></li>)}</ul> : <p>まだありません。</p>}</details>
          <div className="archive-list">{filteredGames.map((game) => <button key={game.id} onClick={() => { setSlots((current) => [{ id: game.id, pinned: false }, ...current.slice(1)]); setView('live'); }}><span>{status === 'fixture' ? 'FIXTURE' : game.live ? 'LIVE' : game.result ?? '終局'}</span><strong>{game.black} <small>vs</small> {game.white}</strong><span>{game.startedAt ? new Date(game.startedAt).toLocaleString('ja-JP') : '日時不明'} · {game.group}</span></button>)}</div>
        </section>}

        {view === 'live' && <section className="live-section" aria-label="対局盤面" onPointerDownCapture={event => { const panel=(event.target as HTMLElement).closest('.unified-panel'); const index=[...event.currentTarget.querySelectorAll('.unified-panel')].indexOf(panel as Element); if (index >= 0) activePanel.current=index; }} onFocusCapture={event => { const panel=(event.target as HTMLElement).closest('.unified-panel'); const index=[...event.currentTarget.querySelectorAll('.unified-panel')].indexOf(panel as Element); if (index >= 0) activePanel.current=index; }}>
          {status === 'loading' ? <div className="board-skeleton" role="status">注目対局を選んでいます…</div> : <div className={`boards count-${visibleSlots.length}`} data-testid="boards">
            {visibleSlots.map((slot, index) => {
              const summary = games.find((game) => game.id === slot.id);
              if (!summary) return null;
              const realIndex = expanded !== undefined ? expanded : index;
              const restoredPanel = recovery?.slots[realIndex]?.summary.id === summary.id ? recovery.slots[realIndex] : undefined;
              return <GamePanel settingsRequest={settingsRequest?.index === realIndex ? settingsRequest.serial : undefined} onResumeStudy={hasSavedStudy ? () => void resumeStudy(false,realIndex) : undefined} study={studying ? study : undefined} onStudyChange={setStudy} onReturnStudy={returnFromStudy} onSound={toggleSound} onDialogChange={changeDialog} suspended={studying || validating || autoRestoring} sound={sound} onStudy={(game,ply,snapshot) => void startStudy(game,ply,snapshot,realIndex)} initialGame={restoredPanel?.game} initialFollowingLatest={restoredPanel?.followingLatest}
                key={`${panelRevision}:${restoredWatch?.at ?? 0}:${realIndex}:${slot.id}`} summary={summary} stats={viewerStats?.games[summary.id]} games={games} defaultSpeed={restoredPanel?.speed ?? settings.playbackSeconds} initialPly={restoredPanel?.ply ?? (realIndex === 0 ? share.ply : undefined)} defaultFlipped={restoredPanel?.flipped ?? settings.orientation === 'white'} initialAnalysisEnabled={restoredPanel?.enabled} onAnalysisSnapshot={(snapshot) => { analysisSnapshots.current.set(realIndex, snapshot); }} onPrepareAnalysis={(signal) => preparePanelAnalysis(realIndex,signal)} pinned={slot.pinned} favoriteNames={favorites} onFavorite={toggleFavorite} onViewed={recordViewed} onSelect={(id) => setSlots((current) => current.map((value, position) => position === realIndex ? { ...value, id } : value))} onPin={() => setSlots((current) => current.map((value, position) => position === realIndex ? { ...value, pinned: !value.pinned } : value))} onSpeedChange={(seconds) => setSettings((value) => ({ ...value, playbackSeconds: seconds }))} boardCount={settings.boardCount} fixture={status === 'fixture'} onOrientationChange={(flipped) => setSettings((value) => ({ ...value, orientation: flipped ? 'white' : 'black' }))} onExpand={() => setExpanded((value) => value === realIndex ? undefined : realIndex)} expanded={expanded === realIndex} />;
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
