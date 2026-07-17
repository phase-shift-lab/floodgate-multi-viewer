# Floodgate Multi Viewer 実装仕様

更新日: 2026-07-17

## 目的と完了条件

Floodgateの公開情報を低負荷に取得し、PCでは最大4局、スマートフォンでは1局を既定表示する非公式Web観戦アプリをGitHub Pagesで公開する。計画・モックではなく、パーサー、限定プロキシ、ライブ更新、過去局再生、永続化、共有URL、障害時fixture、テスト、CI、デプロイ文書を含む実用版を完了条件とする。

## 調査結果と設計判断

- リポジトリは空、Git未初期化のため Vite + React + TypeScript で新規構築する。
- `wdoor.c.u-tokyo.ac.jp` は通常GETに `Access-Control-Allow-Origin` がなく、OPTIONSも405だったため、GitHub Pagesからの直接取得は不可と判断しCloudflare Workerを採用する。
- Workerは任意URLを受けず、`today`、厳格な日付の`day`、検証済みCSA名の`csa`、レート一覧の`ratings`だけを上流の固定ホストへ変換する。
- HTML/CSA/レート解析はUIから分離し、実データ由来fixtureをオフラインフォールバックとテストに共用する。
- 上流負荷を抑えるため、一覧は30秒、進行CSAは3秒を基準にし、Worker edge cache、ETag、タブ非表示間隔延長、指数バックオフ、AbortControllerを組み合わせる。

## 機能要件

- 1/2/4局表示、盤ごとの対局選択・ピン・反転・拡大・棋譜開閉・最新追従。
- レート下限、平均レート、開始時刻、AI重複ペナルティによるライブ優先自動選定。不足分は直近終局で補う。
- 盤面と持駒をCSAから再現し、投了・不完全棋譜を安全に扱う。
- 過去局はAI名、日付、グループ、結果、レート帯、上位/下位レートで検索・整列できる。
- 再生は先頭/前/再生停止/次/末尾/スライダー/棋譜クリック/キーボードを備え、0.25〜10秒のプリセットと0.1〜60秒入力に対応する。
- 設定、お気に入り、最近見た対局をlocalStorageへ保存し、対局ID・手数・形式をURLへ共有する。
- ダークモード、エラー境界、読込/空/障害/stale状態、フォーカス表示、reduced-motionを実装する。

## 対象外（BACKLOG）

PWA、ブラウザ通知、自動戦型判定、4局同期再生。外部解析SDK、広告SDK、秘密情報、任意URLプロキシは導入しない。

## 検証

`npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:e2e`、`npm run build`をすべて成功させる。Playwrightでは1440×900、390×844、表示局数切替、再生、手動移動、反転、復元、API障害、Pagesサブパスを確認する。
