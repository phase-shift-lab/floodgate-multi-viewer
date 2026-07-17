# Floodgate Multi Viewer

Floodgateの公開対局を1・2・4局で観戦し、終了局を検索・再生できる非公式Webアプリです。PCは4局、スマートフォンは1局を既定表示し、上流へ直接アクセスを集中させない限定Cloudflare Workerと障害時fixtureを備えます。

> 非公式ビューアです。Floodgateおよび運営組織による公式製品ではありません。表示内容の完全性・即時性は保証されません。対局・レート情報の出典は [Floodgate](http://wdoor.c.u-tokyo.ac.jp/shogi/floodgate.html) です。

公開版: https://phase-shift-lab.github.io/floodgate-multi-viewer/

データAPI: https://floodgate-multi-viewer-api.toshibacreat.workers.dev

## 主な機能

- ライブ優先の注目局自動選定と1・2・4局のレスポンシブ表示（広いPCは4×1、狭いPCは2×2、スマートフォンは1列）
- 盤ごとの対局選択、ピン留め、反転、拡大、棋譜、最新局面の即時追従と直前手強調
- 過去局の絞り込み、キーボード操作、0.1〜60秒の自動再生
- お気に入り、最近見た対局、表示設定の保存と共有URL
- ダークテーマを既定とし、明示的な接続・stale・fixture状態、エラー境界
- CSA/HTML/レート解析の単体テストと主要操作のPlaywright E2E

## 開発

Node.js 24系を推奨します。

```powershell
npm ci
npm run dev
```

ルートから次を実行できます。

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run dev:worker
npm run deploy:worker
```

ブラウザアプリは `VITE_API_BASE` にWorkerのURLを指定します。未指定または取得失敗時は、実データから保存したfixtureへフォールバックするため、過去棋譜の確認とテストは継続できます。

```powershell
$env:VITE_API_BASE='http://localhost:8787'
npm run dev
```

## 構成

- `src/domain/`: UI非依存のCSA・HTML・レート解析、選定、再生ロジック
- `src/data/`: 取得、リトライ、fixture、localStorage
- `src/components/`: 盤面と対局パネル
- `worker/`: 許可済みFloodgate公開パスだけを中継するWorker
- `e2e/`: デスクトップ、モバイル、再生、復元、障害、Pagesサブパスの検証

設計の詳細は [ARCHITECTURE.md](./ARCHITECTURE.md)、配備手順は [DEPLOY.md](./DEPLOY.md)、実装状況と検証結果は [PROGRESS.md](./PROGRESS.md) を参照してください。

## ライセンスと利用上の注意

本リポジトリのコードはMIT Licenseです。Floodgateから取得した公開情報の権利・利用条件は各提供元に帰属します。過剰アクセス、公式サービスを装う表示、任意URLプロキシ、広告・外部解析SDKは採用していません。
