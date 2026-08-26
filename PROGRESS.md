# 実施状況

更新日: 2026-08-26

## 完了

- [x] Vite + React + TypeScript基盤
- [x] HTML/CSA/レート解析、実データ由来fixture
- [x] 盤面・過去局・保存・共有UI
- [x] GitHub Actions CI、GitHub Pages workflow
- [x] 静的fixture専用モードへ移行
- [x] 外部API・視聴統計・サーバー依存を除去
- [x] 外部サービス前提のREADME、設計、配備文書を更新

## 検証記録

変更後に `npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:e2e`、`npm run build` を実行する。

公開先: https://phase-shift-lab.github.io/floodgate-multi-viewer/

## 制約

ライブ対局、視聴統計、外部API取得は提供しない。fixtureの更新や新しい外部サービス導入は別仕様で承認する。
