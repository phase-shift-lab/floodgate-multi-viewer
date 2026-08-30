# Floodgate Multi Viewer

Floodgateの公開棋譜を1・2・4局で観戦するWebアプリです。フロントエンドはGitHub Pages、公開データのLIVE中継と匿名統計はCloudflare Workerで提供し、Worker未接続時は同梱fixtureへ安全にフォールバックします。

> 非公式ビューアです。Floodgateおよび運営組織による公式製品ではありません。

公開版: https://phase-shift-lab.github.io/floodgate-multi-viewer/

## 開発

Node.js 24系を推奨します。

```powershell
npm ci
npm run dev
```

検証:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## 構成

- `src/domain/`: CSA・HTML・レート解析、選定、再生ロジック
- `src/data/`: 同梱fixture、localStorage、LIVE中継クライアント
- `src/components/`: 盤面と対局パネル
- `worker/`: Floodgate公開データの許可リスト中継と匿名統計
- `e2e/`: デスクトップ、モバイル、再生、復元の検証

`VITE_API_BASE` にWorker URLを設定するとLIVE中継を利用します。未設定またはWorker障害時は「静的fixtureで表示中」へ切り替わります。ブラウザからFloodgate本体へは直接アクセスしません。

## ライセンスと利用上の注意

本リポジトリのコードはMIT Licenseです。Floodgateから取得した公開情報の権利・利用条件は各提供元に帰属します。広告・外部解析SDK・任意URLプロキシ・秘密情報は採用していません。来場・同接は、ログインや個人情報を使わない匿名セッションの集計値です。
