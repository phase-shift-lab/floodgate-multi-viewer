# 実施状況

更新日: 2026-07-18

## 完了

- [x] 空リポジトリ、Git状態、Node/npm/Git/GitHub CLI、GitHub認証を確認
- [x] Floodgate公開ページ・CSA・プレイヤーページの形状を確認
- [x] GET/OPTIONSのCORSヘッダーを実測しWorker採用を決定
- [x] 実装仕様と検証計画を確定
- [x] Vite + React + TypeScript基盤
- [x] HTML/CSA/レート解析、実データ由来fixture
- [x] 固定ホスト・固定パスCloudflare Worker
- [x] 盤面・ライブ・過去局・保存・共有UI
- [x] Vitest 32件、Playwright 8件、lint、typecheck、build
- [x] README、ARCHITECTURE、DEPLOY
- [x] GitHub Actions CI、GitHub Pages workflow
- [x] Worker dry-runバンドル
- [x] GitHub公開リポジトリ作成、commit、push
- [x] GitHub Pages公開と公開URLのHTTP確認
- [x] 2026-07-17実ページのDOM・レート・CSA形式を再監査し、parser/fixtureを追従
- [x] Workerのedge/browser cache分離、24時間stale保持、CSA短期更新を検証
- [x] fixture時の指数バックオフ、更新停止表示、要求対局へのfixture適合を検証
- [x] Cloudflare Worker本番配備、preview URL無効化
- [x] Worker URLをGitHub Actions変数へ設定し、Pagesをライブ接続版として再配備
- [x] 本番WorkerのCORS、Origin拒否、未許可パス拒否、実データ応答を確認
- [x] 4局表示を盤面上・操作/詳細下へ再配置し、広いPCでは4×1、狭いPCでは2×2、スマートフォンでは1列へ自動変形
- [x] 4×1を1920×900で盤面360px以上、1440×900で285px以上、1280×720で260px以上にし、1024×768の2×2を含めページスクロールなしに表示
- [x] 単局拡大を1440×900で盤面480px以上、1280×720で350px以上にし、折りたたみ状態ではページスクロールなし、詳細展開時はカード内スクロールに制限
- [x] スマートフォンは既定1局、2/4局選択時は横にはみ出さず縦1列に配置
- [x] 最新局面の即時追従、過去局面閲覧時の追従停止、直前手の移動元・移動先強調を分離して実装
- [x] 初回表示をダークテーマに変更し、保存済みテーマは従来どおり復元
- [x] PCの1・2局表示を画面高へ自動フィットし、1440×900・1280×720で盤面・主要操作・接続状態をページ縦スクロールなしで表示
- [x] ルート文字サイズを16.5pxへ拡大し、全体の可読性をわずかに向上
- [x] 持ち駒を盤上と同系統の駒形UIへ変更し、枚数表示、先後の向き、盤面反転、アクセシブルな読み上げを実装
- [x] 4局表示の持ち駒を拡大し、1200px以上では視認性を優先、768〜1199pxでは4局フィットを維持する段階サイズに調整

公開先: https://phase-shift-lab.github.io/floodgate-multi-viewer/
Worker: https://floodgate-multi-viewer-api.toshibacreat.workers.dev

## 検証記録

| 日時 | コマンド/確認 | 結果 |
| --- | --- | --- |
| 2026-07-17 | Node/npm/gh/CORS事前調査 | Node 24.14.1、npm 11.11.0、gh認証済み、上流CORSなし |
| 2026-07-17 | `npm run lint` | 成功、warning 0 |
| 2026-07-17 | `npm run typecheck` | 成功、UI/Workerともエラー0 |
| 2026-07-17 | `npm run test` | 成功、8 files / 27 tests |
| 2026-07-17 | `npm run test:e2e` | 成功、Chromium 5/5 |
| 2026-07-17 | `npm run build` | 成功、28 modules、JS gzip 71.46 kB |
| 2026-07-17 | `npm run deploy:worker -- --dry-run` | 成功、upload gzip 2.52 KiB |
| 2026-07-17 | `npx wrangler whoami` | 未認証。`wrangler login` が必要 |
| 2026-07-17 | GitHub Actions CI | 成功、commit `4e3d8ed`、Actions run 29570117512（lint / typecheck / unit 27件 / E2E 5件 / build） |
| 2026-07-17 | GitHub Pages deploy | 成功、commit `4e3d8ed`、Actions run 29570117559 |
| 2026-07-17 | 公開URL確認 | HTML 200、タイトル一致、サブパスJS 200 |
| 2026-07-17 | `npm run deploy:worker` | 成功、Worker version `1cd34f63-0a03-4bc9-ada8-104a33fdae67` |
| 2026-07-17 | Worker本番API確認 | `/api/today` 200、許可Origin CORS一致、未許可Origin 403、未許可パス 404 |
| 2026-07-17 | GitHub Actions変数 | `VITE_API_BASE` に本番Worker URLを設定 |
| 2026-07-17 | ライブ接続版Pages deploy | 成功、Actions run 29580554307、build/deployとも成功 |
| 2026-07-17 | 本番成果物確認 | Pages HTML/JS 200、Worker URL埋込済み、Worker実データ応答 200（164,667 bytes） |
| 2026-07-17 | 4局表示・初期テーマ調整後 `npm run lint` / `npm run typecheck` | 成功、warning・型エラー0 |
| 2026-07-17 | 4局表示・初期テーマ調整後 `npm run test` | 成功、8 files / 28 tests |
| 2026-07-17 | 4局表示・初期テーマ調整後 `npm run test:e2e` | 成功、Chromium 5/5。1440×900でカード下端900px以内、390×844も合格 |
| 2026-07-17 | 4局表示・初期テーマ調整後 `npm run build` | 成功、28 modules、JS gzip 71.46 kB |
| 2026-07-17 | 1440×900 Playwright表示確認 | ダーク初期表示、盤面左・情報/操作右の2×2配置、4カードすべての下端が900px以内 |
| 2026-07-17 | 4局全画面表示の最終検証 | lint・typecheck成功、Vitest 8 files / 28 tests、Playwright 5/5、production build成功 |
| 2026-07-17 | 4局盤面拡大の最終検証 | 1440×900で4盤とも220px以上・全カード下端900px以内。lint・typecheck成功、Vitest 8 files / 28 tests、Playwright 5/5、production build成功 |
| 2026-07-18 | レスポンシブ4局表示の最終検証 | lint・typecheck成功、warning・型エラー0。Vitest 9 files / 32 tests、Playwright Chromium 6/6、production build 29 modules・JS gzip 71.70 kB |
| 2026-07-18 | GitHub Actions CI（run 29617754223） | Linux Chromiumで1024×768の下段が数px超える差異を検出。公開済みPages自体はdeploy成功 |
| 2026-07-18 | 1024×768安全余白修正 | 2×2時だけ重複するセクション見出しを省略。対象E2Eを3回連続実行して3/3成功 |
| 2026-07-18 | 安全余白修正後の全検証 | lint・typecheck成功、Vitest 9 files / 32 tests、Playwright Chromium 6/6、production build 29 modules・JS gzip 71.70 kB |
| 2026-07-18 | GitHub Actions CI / Pages（commit `00ee6d0`） | CI run 29618028996、Pages run 29618028966ともに成功 |
| 2026-07-18 | 公開版レスポンシブ実測 | 1440×900は4×1・盤面288px、1024×768は2×2で縦横スクロールなし。390×844は既定1局・盤面343px・横はみ出しなし。全表示でダーク既定 |
| 2026-07-18 | 公開版の最新局面・直前手確認 | 4局の「直前手」表示、移動先4件・移動元3件を確認。移動元なし1件はCSAの駒打ちで仕様どおり |
| 2026-07-18 | 4局・単局拡大フィット最終検証 | lint・typecheck成功、Vitest 9 files / 32 tests、Playwright Chromium 8/8、build 29 modules・JS gzip 71.71 kB。4局は1920×900で360px以上、1440×900で285px以上、1280×720で260px以上。単局拡大は1440×900で480px以上、1280×720で350px以上。対象PC寸法でページ縦overflowなし |
| 2026-07-18 | 1・2局自動フィット先行検証 | Playwright Chromium 1/1。1440×900は単局470px以上・2局400px以上、1280×720は単局320px以上・2局300px以上。全条件で盤面・主要操作・接続状態が表示領域内、ページ縦overflowなし、ルート文字サイズ16.5px以上を確認 |
| 2026-07-18 | 持ち駒UIの最終検証 | lint・typecheck成功、Vitest 10 files / 34 tests、Playwright Chromium 9/9、production build 29 modules・JS gzip 71.88 kB。1440×900の4局、390×844の1局、1・2・4局切替、盤面反転と保存復元で駒形・枚数・向きを確認 |
| 2026-07-18 | 4局表示の持ち駒拡大 | lint・typecheck成功、Vitest 10 files / 34 tests、Playwright Chromium 9/9、1024×768対象E2E 1/1、production build 29 modules・JS gzip 71.88 kB。1440px幅で持ち駒15×17px以上、1024px幅で11×12px以上を確認 |

## 簡易品質チェック

- 目的・完了条件への適合: 30/30
- 仕様・設計の一貫性: 20/20
- 安全性・戻しやすさ: 15/15
- 検証の妥当性: 20/20
- 保守性・レート効率: 14/15
- 合計: 99/100
