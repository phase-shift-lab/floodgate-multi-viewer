# Deployment

更新日: 2026-07-18

GitHub Pagesは静的UI、Cloudflare WorkerはFloodgate公開情報の限定取得を担当します。Workerを先に配備し、そのURLをGitHub ActionsのRepository variableへ設定します。

本番URL:

- Pages: https://phase-shift-lab.github.io/floodgate-multi-viewer/
- Worker: https://floodgate-multi-viewer-api.toshibacreat.workers.dev

## 1. ローカル検証

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

すべて成功してから公開します。

## 2. Cloudflare Worker

認証済みなら次だけで配備できます。

```powershell
npm run deploy:worker
```

Cloudflare認証がない場合は、一度だけ次を実行します。

```powershell
npx wrangler login
npm run deploy:worker
```

表示された `https://floodgate-multi-viewer-api.<account-subdomain>.workers.dev` を控えます。`wrangler.toml` の `ALLOWED_ORIGINS` はブラウザOrigin単位です。別アカウントやカスタムドメインから公開する場合は、公開元Originだけをカンマ区切りで追加して再配備します。任意Originの `*` にはしません。

本番設定では一時的なpreview URLを `preview_urls = false` で無効化しています。

ローカルでWorkerとUIを接続する場合:

```powershell
npm run dev:worker
```

別のPowerShellで:

```powershell
$env:VITE_API_BASE='http://localhost:8787'
npm run dev
```

## 3. GitHub Pages

GitHubリポジトリの `Settings` → `Pages` → `Build and deployment` でSourceを `GitHub Actions` にします。次に `Settings` → `Secrets and variables` → `Actions` → `Variables` でRepository variableを追加します。

- Name: `VITE_API_BASE`
- Value: 手順2のWorker URL（末尾 `/` なし）

`main` へpushすると、`CI` が全検証を行い、`Deploy GitHub Pages` が `dist/` を公開します。手動再配備はGitHubの `Actions` → `Deploy GitHub Pages` → `Run workflow` から実行できます。

既定の公開URL:

```text
https://phase-shift-lab.github.io/floodgate-multi-viewer/
```

Viteのbaseは `/floodgate-multi-viewer/` です。リポジトリ名を変更する場合は `vite.config.ts` のbase、README、Pages URLを同時に更新します。

## 4. 公開後確認

1. Pages URLを開き、非公式表示と出典が見えることを確認する。
2. 接続状態が `LIVE` または `STALE` で、fixture固定になっていないことを確認する。
3. 1/2/4局切替、盤面反転、過去局再生、ページ再読み込み後の復元を確認する。
4. 1440×900では4局横一列、1024×768では2×2がページスクロールなしで収まり、390×844では既定1局・2/4局時は縦一列になることを確認する。
5. ライブは最新局面へ即時追従し、過去局面を見ている場合だけ新着通知が出ること、直前手の移動元・移動先が強調されることを確認する。
6. ブラウザ開発者ツールでFloodgate本体へ直接fetchしておらず、Workerの `/api/*` だけを利用していることを確認する。
7. GitHub Actionsの `CI` と `Deploy GitHub Pages` が成功していることを確認する。

## 障害とロールバック

- Worker障害: UIはfixtureへフォールバックし、接続状態を明示します。原因修正後に `npm run deploy:worker` を再実行します。
- Pages障害: GitHub Actionsの直前の成功runを再実行するか、修正commitをpushします。
- 上流形式変更: fixtureとパーサーテストを先に更新し、解析結果を確認してから配備します。
- Workerを緊急停止しても、上流URLへ自動的に直結はしません。Repository variableを削除して再ビルドするとfixtureモードになります。

## 2026-07-17 本番検証記録

- Worker version: `1cd34f63-0a03-4bc9-ada8-104a33fdae67`
- GitHub Pages Actions run: `29580554307`（build/deploy成功）
- Pages HTMLとサブパス配下のJS: HTTP 200
- ビルド済みJSへの本番Worker URL埋込: 確認済み
- Worker `/api/today`: HTTP 200、許可OriginへだけCORSヘッダーを返却
- 未許可Origin: HTTP 403、任意URL相当の未許可パス: HTTP 404
