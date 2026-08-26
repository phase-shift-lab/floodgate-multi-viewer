# Architecture

更新日: 2026-08-26

## 全体構成

```text
GitHub Pages (React/Vite)
  ├─ src/domain: CSA/HTML/レート解析、選定、再生
  ├─ src/data: 同梱fixture、保存、静的読み込み
  └─ UI: 複数盤、過去局検索・再生
```

ブラウザからFloodgate本体へ直接取得は行いません。CORS境界を持つ外部プロキシやAPIを配置せず、公開物は同梱fixtureだけで完結します。これにより、追加の認証・課金・外部状態を必要としません。

## データ境界

`src/domain` はDOM・React・ネットワークに依存しません。HTML一覧、レート表、CSAを正規化した `GameSummary` / `ParsedGame` に変換し、UIはその結果だけを扱います。不完全CSAは解析済み手数まで表示します。

fixtureは2026-07-17の公開HTML、レート表、CSAから必要部分を縮小した再生・解析用データです。`src/data/client.ts` は常にfixtureを返し、静的fixture状態をUIへ渡します。

## 機能と状態

盤面、ライブ風の局面表示、過去局検索、再生、設定・お気に入り・最近見た対局・共有URLをローカルで提供します。実時間更新、視聴統計、外部API障害時の再試行はありません。表示局数や盤面状態は従来どおりlocalStorageへ保存します。

## 安全性とアクセシビリティ

- 外部API、秘密情報、広告、解析SDKを含めない
- 任意URL取得や外部書き込みを行わない
- Reactエラー境界、静的fixture状態、フォーカス表示を用意
- キーボード再生と `prefers-reduced-motion` に対応

## テスト方針

VitestでCSA解析、レート解析、選定、再生、保存復元を検証します。Playwrightでは実際のChromiumでデスクトップ・モバイルの表示、切替、再生、復元を検証します。
