# 引き継ぎ — ログイン画面プロトタイプ → Claude Code 実装

このプロトタイプは Astro コンポーネント化と本番化のためのモックです。
**確定済みの設計判断**と**実装で残っている項目**を分けて記載します。

参照:
- プロトタイプ本体: `ログイン画面 D プロトタイプ.html`
- 元設計: `ログイン画面詳細設計v1.md`
- デザインシステム: `デザインシステムv1.md`
- 全体ルール: `プロジェクト最重要事項メモ.md`

---

## 1. 採用した方向 (D 案ハイブリッド)

詳細設計 v1 の Three.js 案は**廃止**。理由:
- 純プロシージャル + 抽象テクスチャ + 鳥居 3D + 和風BGM 素材… の全部足し算で予算超過
- 1要素でも質が落ちると全体が安っぽくなる構造
- フォールバック路 (option 1 = 純コードアート) より更に身軽な道を選択

採用した方向:
- 背景に巨大な漢字「参」を薄く配置 → ログイン演出でこれが主役として育つ
- 純 HTML / CSS / SVG だけで構築、画像アセットなし
- Three.js / GSAP / Howler.js は MVP からは外す (本番化時に音だけ Howler.js 検討)

---

## 2. 確定した設計判断 (再相談不要)

| 項目 | 確定内容 |
|------|---------|
| サーバー名表示 | 「幽世」(40px、Yuji Syuku、letter-spacing 0.6em) |
| 主役CTA | 縦書き御札「参拝」、朱印「幽」入り |
| 背景の漢字 | 「参」(画面高さ70%、薄い金グラデーション、呼吸+滲みアニメ) |
| 短歌 | 左端縦書き「夜　ふかし / 霧　黄泉に　しづみ / 灯　ひとつ」 |
| 時刻 | 左下に十二時辰 (子〜亥の刻) を local time から自動 |
| 狐火 | 24個、上昇しながら左右揺らぎ、御札ホバーで反応せず (簡素化) |
| 月光スキャン | 22秒周期で上から下へ薄いビームが通る |
| カーソルハロー | マウス位置に追従、御札に近づくと拡大 |
| vignette | 中央以外を沈める、コーナーも追加暗化 |
| マウスパララックス | 「参」がマウスと逆方向に ±14px、ease-out 補間 |
| ローダー | 3.2秒、金線が伸びる → 「気配を辿っています」→ 狐火3点 → 本編 |

検討して**捨てた**もの:
- 紙吹雪 (世界観に合わない)
- 御札の燃焼 (CSS で炎は不自然になる)
- 墨筆の画面切断 (turbulence でも本物感出ない)
- 世界が御札に呑まれる演出 (派手すぎる)
- 結界収縮 (B案、選択されず)
- 太鼓の縦光柱3本 (騒がしい、伝わらない)
- 朱色の縁フラッシュ (使い方が中途半端)

---

## 3. エンディング演出 (確定)

クリック→ OAuth まで 4.2秒。

| 時刻 | イベント | 実装 |
|------|---------|------|
| 0.0s | 「参」が沈む (scale 1 → 0.95、opacity 1 → 0.55) | `.world-kanji.is-awakening` 0-10% |
| 0.3s | 沈み切って一瞬静止 | 10-12% hold |
| 0.3s | 押し戻されてふわっと立ち上がる、強発光 | 12-16% rebound |
| 0.3s | 狐火が御札へ吸い込まれる + 御札フェード開始 | `convergeFoxfire()` + `.is-vanishing` |
| 0.7s | 周囲の世界がフェードアウト (brightness 0.3 + blur 3px) | `.stage.is-fading-out` |
| 1.5s〜 | 「参」が金 → 白へ転調しながら拡大 (scale 1.5 → 2.3 → 3.4) | 同 keyframe 48-100% |
| 2.0s | キメの bloom + 白フラッシュ立ち上がり | `.kime-bloom.active` + `.flash.active` |
| 3.0s | 全画面白 | |
| 4.2s | `window.location = "/api/auth/discord"` | 現在は reset するだけ |

ポイント: **沈み → 押し戻し → emerge は1つの keyframe (`worldKanjiAwaken`) に統合**、バトンタッチで途切れない。

---

## 4. 本番化に必須 (未実装)

優先度高い順:

### 4.1 OAuth 飛ばし
```js
// enter() の最後の setTimeout 内
window.location.href = "/api/auth/discord";
```

### 4.2 結界を抜ける = 演出スキップ
現在は同じ `enter()` を呼んでるが、本来は OAuth に直行すべき:
```js
document.getElementById("skip").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "/api/auth/discord";  // 演出なし
});
```

### 4.3 初回 / 2回目以降の切替 (設計書 §11.4)
```js
const seenBefore = localStorage.getItem("ayakashi-visited") === "1";
if (seenBefore) {
  // 短縮版: ローダー省略、演出も短く
  document.getElementById("loader").style.display = "none";
} else {
  localStorage.setItem("ayakashi-visited", "1");
}
```

### 4.4 prefers-reduced-motion 対応強化
現在は最小限の `.foxfire` / `.fog` 停止のみ。設計書 §11.1 通りに:
- カメラ呼吸、霧の流動、狐火、御札の揺れを全停止
- bloom を弱める (intensity 0.3 まで)
- 演出は fade のみ残し、その他即時化

### 4.5 低スペック検出 (設計書 §12)
```js
const lowSpec =
  navigator.hardwareConcurrency < 4 ||
  (navigator.deviceMemory ?? 4) < 4;
if (lowSpec) {
  // 狐火を 8 個に、月光スキャン停止、パララックス停止
  document.documentElement.classList.add("low-spec");
}
```

### 4.6 音 (設計書 §9)
プロトタイプの Web Audio API シンセは**プレースホルダ**。本番では:
- Howler.js + mp3/ogg ペア
- BGM (和風器楽、ループポイント設計済み)
- Ambient (風、葉擦れ、遠雷)
- SFX (鈴、紙擦れ)
- すべて既定ミュート、localStorage に設定保存
- `assets/audio/CREDITS.md` にライセンス記録

### 4.7 OAuth 戻り演出
Discord 認証完了で戻ってきた時のフェードイン。v2 想定だが、MVP では黒からの短いフェード:
```css
@keyframes returnFade {
  from { opacity: 0; }
  to { opacity: 1; }
}
body.from-oauth { animation: returnFade 800ms ease-out; }
```

---

## 5. Astro 移植時の注意点

### 5.1 ファイル構成 (設計書 §15.1 通り)

```
apps/web/src/components/login/
├ Stage.astro                  ルート (SSR、UI骨格のみ)
├ Stage.client.tsx             クライアント側 (animation/audio JS)
├ ui/Ofuda.astro               御札 (SVG + 縦書き「参拝」)
├ ui/ServerName.astro          「幽世」+ 罫線 + 「あやかしの集う社」
├ ui/SkipLink.astro            結界を抜ける
├ ui/MuteToggle.astro          MUTE/ON
├ ui/HourMark.astro            十二時辰
├ ui/Poem.astro                左端の縦書き短歌
└ scene/
   ├ Foxfire.tsx               狐火パーティクル
   ├ Vignette.astro
   ├ MoonScan.astro
   └ CursorHalo.tsx
```

### 5.2 CSS 変数
プロトタイプの `:root` ブロックを `apps/web/src/styles/tokens.css` に分離。デザインシステム v1 §13.1 と一致。

### 5.3 Cloudflare Workers 制約 (再確認)
- Web Audio API はクライアントなので OK
- `localStorage` も OK
- 画像処理は不要 (アセットなし方針)

### 5.4 アニメーション
keyframes は各コンポーネントの scoped style に移動。`@property --burn` のような実験的プロパティは現状未使用 (削除済み)。

### 5.5 クリック時のクラス操作
プロトタイプは vanilla JS で `classList.add/remove`。Astro では React/Solid の state で `is-awakening` を切り替える形に。タイミングは `setTimeout` チェインで問題ない (アニメ完了時に state リセット)。

---

## 6. 残ってる微修正候補 (本番化後でも OK)

1. **emerge ピーク → 白への繋ぎがやや弱い** — bloom の半径と速度を再調整、または「参」の最終フェーズで scale 4.5 まで伸ばす
2. **text-fill-color 切替時の一瞬のカクつき** — 45% で gradient text-clip → solid color に切り替わる瞬間。CSS の根本制約、許容範囲
3. **モバイル検証** — `clamp(420px, 70vh, 760px)` で縮みはするが、沈み・emerge の迫力は要確認。狐火24個も多すぎるかも

---

## 7. プロトタイプから学んだこと (申し送り)

- 「カッコよくしたい」は積み上げじゃなく**緊張感**で出る
- 和風荘厳 = **重さ + 間 + 縦の動き**。横の派手さや円形は西洋的になる
- リアルな炎・墨は CSS / SVG filter では限界がある → **メタファーを変える方が早い**
- 「世界が御札に呑まれる」より「**ずっと見ていた世界が起き上がる**」のほうが物語が強い
- ティアキン的な「神聖な連続性」は急じゃなく**サスティン**

---

以上です。何か不明点があれば `ログイン画面 D プロトタイプ.html` の該当箇所を直接読むのが早いです。
