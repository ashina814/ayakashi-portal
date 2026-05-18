# Handoff: ログイン画面 (ayakashi-portal)

## このバンドルについて

これは **ayakashi-portal** のログイン画面のデザイン引き継ぎパッケージです。
プロトタイプは HTML / CSS / 純JS で組まれた**デザインリファレンス**で、本番コードとしてそのまま使うものではありません。
ターゲット環境 (Astro 5 SSR + Cloudflare Pages + Tailwind v3) で、既存のパッケージ規約に従って再実装してください。

## Fidelity

**Hi-fi** (ピクセル精度) — フォント・色・スペーシング・タイミングはすべて確定値。再実装時はこれを基準に。

## 同梱ファイル

| ファイル | 内容 |
|---------|------|
| `prototype.html` | 動作するプロトタイプ本体 (ブラウザで開いて確認可) |
| `HANDOFF.md` | 詳細な引き継ぎメモ (採用方針、確定事項、未実装項目、移植上の注意) |
| `README.md` | このファイル (Claude Code 向けの起動ガイド) |

## Claude Code セッション開始時の推奨手順

1. このフォルダをリポジトリの `apps/web/docs/login-handoff/` あたりに展開
2. Claude Code をリポジトリルートで起動
3. プロンプト先頭に以下を貼る:

```
ayakashi-portal のログイン画面 (M4) を実装します。
以下を読んでから着手してください:

- ./引き継ぎ資料v3.md
- ./デザインシステムv1.md
- ./プロジェクト最重要事項メモ.md
- ./ログイン画面詳細設計v1.md  (※ Three.js 案は廃止、HANDOFF.md 参照)
- ./apps/web/docs/login-handoff/HANDOFF.md  ← 確定事項
- ./apps/web/docs/login-handoff/prototype.html  ← 動くリファレンス

HANDOFF.md の §4「本番化に必須」の優先順位で実装してください。
スコープに含めない: 認証ロジック本体 (M1a で実装済み前提)、ハブ画面、Wiki、運営DB。
```

## 実装スコープ要約

詳細は `HANDOFF.md` 参照。要点だけ:

### 確定済み (再相談不要)
- Three.js は採用しない — 純 CSS / SVG / HTML で構築
- 演出: 背景の漢字「参」の沈み → 押し戻し → emerge → 白フラッシュ (4.2秒)
- 御札の縦書き「参拝」、朱印「幽」入り
- サーバー名: 「幽世」、左端に縦書き短歌、左下に十二時辰
- 狐火24個、月光スキャン、カーソルハロー、vignette、マウスパララックス

### 未実装 (本番化で必須、優先順)
1. `/api/auth/discord` への遷移 (現在は演出後リセットのみ)
2. 「結界を抜ける」スキップ = 演出なしで OAuth 直行
3. localStorage で初回 / 2回目以降の演出切替
4. `prefers-reduced-motion` 救済の徹底
5. 低スペック検出 (`hardwareConcurrency`, `deviceMemory`)
6. 音 (Howler.js + mp3/ogg、設計書 §9 通り、既定ミュート)
7. OAuth 戻り演出 (黒からの短いフェード)

### 検討して捨てたもの (再提案不要)
- 紙吹雪、御札の燃焼、墨筆、世界が御札に呑まれる演出、結界収縮、太鼓の縦光柱3本、朱色の縁フラッシュ

## デザイントークン

CSS変数は `prototype.html` の `:root` ブロックに集約。`apps/web/src/styles/tokens.css` に分離すること。
値はデザインシステム v1 §13.1 と完全一致。

主要色:
- `--color-ink-950: #0a0509` (背景)
- `--color-gold-100: #f5e7c4` (メインテキスト)
- `--color-gold-500: #b89540` (主役アクセント、御札の縁)
- `--color-mist-glow: #b8e0ff` (狐火、ホバーグロー)
- `--color-crimson-500: #c1283a` (印章、彼岸花)
- `--color-vermilion-500: #b04438` (朱印「幽」、鳥居の朱)

フォント:
- Yuji Syuku (display, 「幽世」「参」など大見出し)
- Shippori Mincho B1 (本文・短歌)
- Noto Sans JP (UI)
- JetBrains Mono (時刻・バージョン)

## Astro コンポーネント構成案

```
apps/web/src/components/login/
├ Stage.astro            ルート (SSR で UI 骨格)
├ Stage.client.tsx       client island (animation + audio)
├ ui/Ofuda.astro         御札
├ ui/ServerName.astro    「幽世」+ 罫線
├ ui/SkipLink.astro
├ ui/MuteToggle.astro
├ ui/HourMark.astro      十二時辰
├ ui/Poem.astro          縦書き短歌
└ scene/
   ├ Foxfire.tsx         狐火パーティクル
   ├ Vignette.astro
   ├ MoonScan.astro
   └ CursorHalo.tsx
```

## 注意点

- Cloudflare Workers 制約 (Node 専用 API、Sharp、`pg` 不可) は `プロジェクト最重要事項メモ.md` 参照
- 音は **Web Audio API のプロト実装をプレースホルダ**にしている。本番は Howler.js + 実素材
- フォントは Google Fonts `font-display: swap` + 日本語サブセット必須
- すべての操作要素に Tab 到達・WCAG 2.1 AA コントラスト確保

## 参考: プロトタイプの主要 keyframe

`worldKanjiAwaken` (3.2s):

| 進捗 | 状態 |
|------|------|
| 0% | scale 1, opacity 1, グラデ薄金 |
| 8-10% | scale 0.95, opacity 0.55 (沈み) |
| 16% | scale 1.06, 強発光 (押し戻し) |
| 48% | scale 1.5, 明色ソリッド転換 (emerge) |
| 82% | scale 2.3, 白 |
| 100% | scale 3.4, opacity 0, 全面白へ消失 |

Easing: `cubic-bezier(0.5, 0, 0.25, 1)`
