# Floodgate Multi Viewer

Floodgateの公開棋譜を1・2・4局で観戦し、同梱fixtureの終了局を検索・再生できる静的Webアプリです。GitHub Pagesだけで配信し、外部API・ライブ更新・視聴統計は使用しません。

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
- `src/data/`: 同梱fixture、localStorage、静的データ読み込み
- `src/components/`: 盤面と対局パネル
- `e2e/`: デスクトップ、モバイル、再生、復元の検証

起動時は画面上に「静的fixtureで表示中」と表示されます。fixtureは実データ由来の縮小サンプルで、ライブ対局の取得やFloodgate本体への直接アクセスは行いません。

## ライセンスと利用上の注意

本リポジトリのコードはMIT Licenseです。Floodgateから取得した公開情報の権利・利用条件は各提供元に帰属します。広告・外部解析SDK・任意URLプロキシ・秘密情報は採用していません。
