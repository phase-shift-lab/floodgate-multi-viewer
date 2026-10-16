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

## 端末での局面解析

つようら王11microと対応やねうら王WASMで現在の局面を端末上で解析します。初期ONで、盤面の上に先手基準の評価値・形勢ゲージ・第一候補・探索深さを表示します。ゲージは勝率ではありません。「候補手・読み筋」を開くと最大3候補と各6手までの日本語読み筋、解析ON/OFFを確認できます。対局ごとのOFF設定は保存し、OFF時はエンジンを読み込みません。CSAに含まれる評価値とは区別します。

エンジンは全盤で1つ、探索スレッド1、ハッシュ16MB、1局面500msです。複数盤は順番に解析し、局面変更時は古い探索を中止します。非表示時は探索を停止し、解析結果を最大128局面までメモリ内に保持します。履歴全体は一括解析しません。端末のCPU・電池を使用し、実行メモリは評価ファイルの約4.9MBより大きくなります（WASM初期メモリ132MiB）。

共有メモリを利用するため、初回解析時にアプリのパス内限定のService Workerを登録し、1回再読み込みします。表示対局・手数・反転・解析ON状態をsessionStorageで一時復元します。Workerはキャッシュせず、同一アプリの応答にCOOP/COEPを付与します。外部通信にはヘッダーを追加しません。「候補手・読み筋」内の解除ボタンで登録を解除して再読み込みできます。解除後は自動解析を停止し、手動でONにすると再開します。再読込後も共有メモリを利用できない場合はエラー表示で停止し、再読込を繰り返しません。

解析局面・結果の送信、有料API、サーバー側の解析はありません。配布ライセンス・対応ソース・ビルド手順は `public/engine/NOTICE.txt` と `public/engine/source.zip` を参照してください。評価関数はMIT、探索エンジンはGPLv3です。

## ライセンスと利用上の注意

ビューアのコードはMIT Licenseです。同梱エンジン・評価関数には上記の個別ライセンスが適用されます。Floodgateから取得した公開情報の権利・利用条件は各提供元に帰属します。広告・外部解析SDK・任意URLプロキシ・秘密情報は採用していません。来場・同接は、ログインや個人情報を使わない匿名セッションの集計値です。
