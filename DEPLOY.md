# Deployment

更新日: 2026-08-26

GitHub Pagesへ静的ファイルを配信します。外部API、サーバー、認証、環境変数は不要です。

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

## 公開後確認

1. Pages URLで「静的fixtureで表示中」が表示されること。
2. 1/2/4局切替、盤面反転、棋譜再生、ページ再読み込み後の復元を確認する。
3. ブラウザ開発者ツールで外部APIへのfetchが発生していないことを確認する。
4. GitHub Actionsの `CI` と `Deploy GitHub Pages` が成功していることを確認する。

## 制約とロールバック

ライブ対局・視聴統計は提供しません。変更前のコミットへ戻すことで旧構成へ復元できますが、旧構成の外部サービス停止や公開設定変更は別途承認が必要です。
