# Architecture

更新日: 2026-08-30

## 全体構成

```text
GitHub Pages (React/Vite)
  ├─ src/domain: CSA/HTML/レート解析、選定、再生
  ├─ src/data: 同梱fixture、保存、静的読み込み
  └─ UI: 複数盤、過去局検索・再生
        │ HTTPS/CORS
Cloudflare Worker (GitHub管理)
  ├─ Floodgate公開HTML/CSAの許可リスト中継
  ├─ エッジキャッシュとstale応答
  └─ Durable Objectによる匿名来場・同接集計
```

ブラウザからFloodgate本体へ直接取得は行いません。Workerは日付一覧、レート表、CSAだけを許可し、任意URLの中継を拒否します。Worker未設定・障害時は同梱fixtureを返します。

## データ境界

`src/domain` はDOM・React・ネットワークに依存しません。HTML一覧、レート表、CSAを正規化した `GameSummary` / `ParsedGame` に変換し、UIはその結果だけを扱います。不完全CSAは解析済み手数まで表示します。

fixtureは2026-07-17の公開HTML、レート表、CSAから必要部分を縮小した再生・解析用データです。`src/data/client.ts` はWorkerが利用可能なときにLIVE中継を使い、取得不能時にfixture状態をUIへ渡します。

## 機能と状態

盤面、LIVE局面表示、過去局検索、再生、設定・お気に入り・最近見た対局・共有URLを提供します。来場数は日ごとの匿名セッション数、同接は60秒以内にheartbeatを送信した匿名セッション数です。表示局数や盤面状態は従来どおりlocalStorageへ保存します。

## 安全性とアクセシビリティ

- APIキー、秘密情報、広告、解析SDKを含めない
- 任意URL取得や外部書き込みを行わない
- Reactエラー境界、静的fixture状態、フォーカス表示を用意
- キーボード再生と `prefers-reduced-motion` に対応

## テスト方針

VitestでCSA解析、レート解析、選定、再生、保存復元、Workerの許可リスト・統計入力を検証します。Playwrightでは実際のChromiumでデスクトップ・モバイルの表示、切替、再生、復元を検証します。
