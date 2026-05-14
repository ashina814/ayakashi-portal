/**
 * 墨書きの「幽世」を Canvas 2D で render → Three.js テクスチャ化する。
 *
 * 設計:
 *   1. document.fonts.load で Yuji Syuku の読み込みを保証
 *   2. measureText で正確なサイズの off-screen canvas を作る
 *   3. 白塗りで文字を描画（alpha が glyph の形になる）
 *   4. シェーダ側で FBM perturbation を掛けると墨絵になる
 *
 * opentype.js を使わない理由:
 *   - Canvas 2D + 既ロード webfont で十分な解像度が出る
 *   - 依存を増やさず PR を軽く保つ
 *   - per-stroke アニメ（書き順アニメ）が必要になった時点で opentype 導入
 */

import { CanvasTexture, LinearFilter } from "three";

const KANJI_FONT_SIZE = 384; // px on canvas
const KANJI_PADDING = 60;    // 滲み余白
const FONT_FAMILY = `"Yuji Syuku", "Shippori Mincho B1", serif`;

export interface SumiTextResult {
  texture: CanvasTexture;
  width: number;  // canvas 物理ピクセル
  height: number;
}

/**
 * フォントをロードして、指定テキストの墨書き用テクスチャを返す。
 * 失敗してもクラッシュさせず、デフォルトフォントでフォールバックする。
 */
export async function makeSumiTextTexture(
  text: string,
): Promise<SumiTextResult> {
  try {
    if ("fonts" in document) {
      // 明示的に必要サイズのフォントを load
      await document.fonts.load(`${KANJI_FONT_SIZE}px ${FONT_FAMILY}`);
      // フォント全体の準備完了を待つ
      await document.fonts.ready;
    }
  } catch {
    // フォント未対応環境 / フェイル時はそのまま続行
  }

  // 寸法計測
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = 1;
  measureCanvas.height = 1;
  const mctx = measureCanvas.getContext("2d")!;
  mctx.font = `${KANJI_FONT_SIZE}px ${FONT_FAMILY}`;
  const metrics = mctx.measureText(text);

  const textWidth = Math.max(1, Math.ceil(metrics.width));
  const ascent =
    metrics.actualBoundingBoxAscent || KANJI_FONT_SIZE * 0.88;
  const descent =
    metrics.actualBoundingBoxDescent || KANJI_FONT_SIZE * 0.12;
  const textHeight = Math.max(1, Math.ceil(ascent + descent));

  const canvas = document.createElement("canvas");
  canvas.width = textWidth + KANJI_PADDING * 2;
  canvas.height = textHeight + KANJI_PADDING * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 白塗りで描画（alpha = glyph シルエット）
  ctx.font = `${KANJI_FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.fillStyle = "white";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, KANJI_PADDING, KANJI_PADDING + ascent);

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  // ジャギ防止に少しだけ anisotropy（ortho なので 1 でも実質OK）

  return {
    texture,
    width: canvas.width,
    height: canvas.height,
  };
}
