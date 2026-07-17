import { useCallback, useEffect, useMemo, useState } from 'react';
import { GamePanel } from './components/GamePanel';
import { loadCatalog, loadDay } from './data/client';
import { addRecent, loadFavorites, loadRecent, loadSettings, readShareState, saveFavorites, saveSettings } from './data/preferences';
import { compareGames, selectFeaturedGames } from './domain/selection';
import type { GameSummary, ViewerSettings } from './domain/types';

interface Slot { id: string; pinned: boolean }

export default function App() {
  const share = useMemo(() => readShareState(), []);
  const [settings, setSettings] = useState<ViewerSettings>(() => ({
    ...loadSettings(),
    ...(share.boards ? { boardCount: share.boards } : {}),
    ...(share.orientation ? { orientation: share.orientation } : {}),
  }));
  const [games, setGames] = useState<GameSummary[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [recent, setRecent] = useState(loadRecent);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fixture' | 'empty' | 'error'>('loading');
  const [view, setView] = useState<'live' | 'archive'>(share.view ?? 'live');
  const [expanded, setExpanded] = useState<number>();
  const [historyDate, setHistoryDate] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [sort, setSort] = useState<'new' | 'high' | 'low'>('new');
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const refresh = async () => {
      try {
        const result = await loadCatalog(controller.signal);
        setGames((current) => [...result.games, ...current.filter((game) => !result.games.some((fresh) => fresh.id === game.id))]);
        setStatus(result.games.length ? result.fixture ? 'fixture' : 'ready' : 'empty');
        setSlots((current) => {
          if (!current.length) {
            const featured = selectFeaturedGames(result.games, settings.boardCount);
            const shared = share.game && result.games.some((game) => game.id === share.game) ? share.game : undefined;
            return featured.map((game, index) => ({ id: index === 0 && shared ? shared : game.id, pinned: false }));
          }
          if (!settings.autoSwitchFinished) return current;
          const kept = current.filter((slot) => slot.pinned || result.games.find((game) => game.id === slot.id)?.live);
          const exclude = new Set(kept.map((slot) => slot.id));
          const replacements = selectFeaturedGames(result.games.filter((game) => !exclude.has(game.id)), settings.boardCount - kept.length);
          return [...kept, ...replacements.map((game) => ({ id: game.id, pinned: false }))];
        });
      } catch {
        if (!controller.signal.aborted && first) setStatus('error');
      } finally {
        first = false;
        if (!controller.signal.aborted) timeout = setTimeout(refresh, document.hidden ? 120_000 : 30_000);
      }
    };
    void refresh();
    const onVisibility = () => { if (timeout) clearTimeout(timeout); timeout = setTimeout(refresh, document.hidden ? 120_000 : 1_000); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { controller.abort(); if (timeout) clearTimeout(timeout); document.removeEventListener('visibilitychange', onVisibility); };
  }, [settings.autoSwitchFinished, settings.boardCount, share.game]);

  useEffect(() => {
    saveSettings(settings);
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
  }, [settings]);

  const setBoardCount = (count: 1 | 2 | 4) => {
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">本文へ移動</a>
      <header className="site-header">
        <div className="title-block"><span className="mark" aria-hidden="true">多</span><div><h1>Floodgate Multi Viewer</h1><p>公開棋譜を静かに、見やすく。</p></div></div>
        <nav aria-label="メインメニュー">
          <button className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}>ライブ</button>
          <button className={view === 'archive' ? 'active' : ''} onClick={() => setView('archive')}>過去対局</button>
        </nav>
        <div className="header-actions">
          <fieldset className="count-switch"><legend>表示局数</legend>{([1,2,4] as const).map((count) => <button key={count} aria-pressed={settings.boardCount === count} onClick={() => setBoardCount(count)}>{count}局</button>)}</fieldset>
          <label className="theme-select">配色<select aria-label="配色" value={settings.theme} onChange={(event) => setSettings((value) => ({ ...value, theme: event.target.value as ViewerSettings['theme'] }))}><option value="system">端末設定</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label>
          <label className="auto-switch"><input type="checkbox" checked={settings.autoSwitchFinished} onChange={(event) => setSettings((value) => ({ ...value, autoSwitchFinished: event.target.checked }))} />終局後に注目局へ切替</label>
        </div>
      </header>

      <main id="main" className={view === 'live' && visibleSlots.length === 4 ? 'four-board-main' : undefined}>
        {status === 'fixture' && <div className="notice warning" role="status"><strong>オフラインデータで表示中</strong><span>APIに接続できないため、実データ由来fixtureを使用しています。表示はstaleです。</span></div>}
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
            <label><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} />お気に入りAIのみ</label>
          </div>
          <details className="recent-games"><summary>最近見た対局（{recent.length}）</summary>{recent.length ? <ul>{recent.map((id) => <li key={id}><button disabled={!games.some((game) => game.id === id)} onClick={() => { setSlots((current) => [{ id, pinned: false }, ...current.slice(1)]); setView('live'); }}>{games.find((game) => game.id === id)?.black ?? id} {games.find((game) => game.id === id) ? `vs ${games.find((game) => game.id === id)?.white}` : '（一覧外）'}</button></li>)}</ul> : <p>まだありません。</p>}</details>
          <div className="archive-list">{filteredGames.map((game) => <button key={game.id} onClick={() => { setSlots((current) => [{ id: game.id, pinned: false }, ...current.slice(1)]); setView('live'); }}><span>{game.live ? 'LIVE' : game.result ?? '終局'}</span><strong>{game.black} <small>vs</small> {game.white}</strong><span>{game.startedAt ? new Date(game.startedAt).toLocaleString('ja-JP') : '日時不明'} · {game.group}</span></button>)}</div>
        </section>}

        {view === 'live' && <section aria-label="対局盤面">
          <div className="board-section-head"><div><span className="eyebrow">WATCH NOW</span><h2>注目対局</h2></div><div className="legend"><span><i className="live-dot" />ライブ</span><span>お気に入り {favorites.length}</span><span>最近見た {recent.length}</span></div></div>
          {status === 'loading' ? <div className="board-skeleton" role="status">注目対局を選んでいます…</div> : <div className={`boards count-${visibleSlots.length}`} data-testid="boards">
            {visibleSlots.map((slot, index) => {
              const summary = games.find((game) => game.id === slot.id);
              if (!summary) return null;
              const realIndex = expanded !== undefined ? expanded : index;
              return <GamePanel key={`${realIndex}:${slot.id}`} summary={summary} games={games} defaultSpeed={settings.playbackSeconds} initialPly={realIndex === 0 ? share.ply : undefined} defaultFlipped={settings.orientation === 'white'} pinned={slot.pinned} favoriteNames={favorites} onFavorite={toggleFavorite} onViewed={recordViewed} onSelect={(id) => setSlots((current) => current.map((value, position) => position === realIndex ? { ...value, id } : value))} onPin={() => setSlots((current) => current.map((value, position) => position === realIndex ? { ...value, pinned: !value.pinned } : value))} onSpeedChange={(seconds) => setSettings((value) => ({ ...value, playbackSeconds: seconds }))} boardCount={settings.boardCount} onOrientationChange={(flipped) => setSettings((value) => ({ ...value, orientation: flipped ? 'white' : 'black' }))} onExpand={() => setExpanded((value) => value === realIndex ? undefined : realIndex)} expanded={expanded === realIndex} />;
            })}
          </div>}
        </section>}
      </main>
      <footer className="site-footer"><p><strong>非公式ビューア</strong> — Floodgateおよび運営組織とは関係ありません。表示内容の正確性・継続性を保証しません。</p><p>出典: <a href="https://wdoor.c.u-tokyo.ac.jp/shogi/" target="_blank" rel="noreferrer">Floodgate 公開情報</a> · 取得頻度を抑え、公開パスだけを参照します。</p></footer>
    </div>
  );
}
