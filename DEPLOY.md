# Deployment

更新日: 2026-08-30

フロントエンドはGitHub Pagesへ静的配信し、LIVE中継・匿名統計はCloudflare Workerで提供します。

## ローカル検証

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## GitHub Pages

リポジトリの `Settings` → `Pages` → `Build and deployment` でSourceを `GitHub Actions` にします。`main` へのpushで `CI` と `Deploy GitHub Pages` が実行され、`dist/` が公開されます。

Viteのbaseは `/floodgate-multi-viewer/` です。リポジトリ名を変更する場合は `vite.config.ts` とPages URLを同時に更新します。

GitHub Actions Variablesに次を設定します。

```text
VITE_API_BASE=https://floodgate.phaseshiftlab.workers.dev
```

CloudflareはGitHub連携でこのリポジトリの `wrangler.toml` と `worker/index.js` をデプロイ対象にします。Workerには `STATS_ROOM` Durable Object bindingとmigration `v1` が必要です。

## 公開後確認

1. `https://floodgate.phaseshiftlab.workers.dev/health` が `ok` を返すこと。
2. Pages URLでLIVE対局、来場/日、対局別の観戦・同時が表示されること。
3. 1/2/4局切替、盤面反転、棋譜再生、ページ再読み込み後の復元を確認する。
4. Worker障害時にfixtureへフォールバックすることを確認する。
5. GitHub Actionsの `CI` と `Deploy GitHub Pages` が成功していることを確認する。

## 制約とロールバック

`VITE_API_BASE` を空に戻すと、フロントはfixture専用へ戻ります。WorkerはCloudflare Dashboardで以前のデプロイへロールバックできます。Durable Objectの集計値は匿名統計であり、厳密な実人数ではありません。
