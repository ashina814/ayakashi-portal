/**
 * Login Scene — 墨絵 × 結界 ハイブリッド（PR 1 基盤）
 *
 * 設計方針:
 *   - 2D 主体。OrthographicCamera + 全画面 quad の重ね合わせ。
 *   - レイヤー（奥→手前）:
 *       ① 紙   : 暗い和紙テクスチャ
 *       ② 鳥居 : SDF + FBM perturbation で墨絵風シルエット
 *       ③ 結界 : 同心 3 リング、脈動と色相循環（PR 3 で詰める）
 *       ④ 金粉 : Points、べき乗分布のサイズで遠近感
 *   - 後処理: Bloom（線の滲み）+ Vignette + Noise（紙の繊維感）
 *
 * 既存 API はそのまま維持:
 *   - setOfudaHover(active)  : 結界がより強く脈動する
 *   - setPassProgress(p)     : くぐる演出の進行度（後段で詳細化）
 *   - triggerConfetti()      : 金粉のミニ爆発
 *   - dispose()
 *
 * 3D 用 primitive（InstancedMesh / BoxGeometry / lights / GodRaysEffect 等）
 * は本ファイルから完全に消えた。
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  CanvasTexture,
  Vector2,
  WebGLRenderer,
} from "three";
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  NoiseEffect,
  RenderPass,
  VignetteEffect,
} from "postprocessing";
import { makeSumiTextTexture } from "./sumi-text";

const INK_950 = 0x0a0509;
const GOLD_100 = 0xf5e7c4;

export interface ToriiScene {
  dispose(): void;
  /** 御札ホバー: 結界がより強く脈動する */
  setOfudaHover(active: boolean): void;
  /** くぐる演出の進行度 0..1（GSAP から駆動） */
  setPassProgress(progress: number): void;
  /** 金粉のミニ爆発を発射 */
  triggerConfetti(): void;
}

// ─────────────────────────────────────────────
// シェーダ
// ─────────────────────────────────────────────

const QUAD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * 共有 GLSL 断片: Stefan Gustavson の 2D simplex noise + FBM。
 *
 * value noise から差し替え。simplex の方が等方的で、グラデーションが
 * 自然に出るので「滲み」「火」「霧」あらゆる用途で質感が上がる。
 */
const NOISE_GLSL = `
// 2D Simplex noise — public domain implementation (Stefan Gustavson)
vec3 permute_(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute_(permute_(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  // 0..1 範囲に変換
  return 0.5 + 0.5 * (130.0 * dot(m, g));
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}
`;

/**
 * 紙: 暗ベース + 微妙な warm tint + ピクセル単位のざらつき
 * 加えて Vignette は postprocessing で別途掛かる。
 */
const PAPER_FRAGMENT = `
${NOISE_GLSL}
uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  // アスペクトに合わせて補正したノイズ空間
  vec2 np = uv * vec2(uResolution.x / uResolution.y, 1.0);

  // 大きな warm tint variation（低周波）
  float warm = fbm(np * 1.5);
  // 細かい紙繊維（高周波）
  float grain = fbm(np * 18.0);

  vec3 base = vec3(0.039, 0.020, 0.035);     // ink-950
  vec3 warmTint = vec3(0.05, 0.034, 0.022);  // 茶寄りの暖色
  vec3 col = base + warmTint * (warm * 0.6);
  col += vec3(grain * 0.025);

  // 中央をほんのり明るく（後で vignette が掛かるので相殺される）
  float r = length(uv - 0.5);
  col += vec3(0.018, 0.012, 0.007) * (1.0 - smoothstep(0.0, 0.7, r));

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * 鳥居 SDF: 6 つの矩形（柱2 + 笠木 + 島木 + 貫 + 額束）の min() 合成。
 * 距離 d を FBM で perturbation してエッジを「墨の滲み」にする。
 */
const TORII_FRAGMENT = `
${NOISE_GLSL}
uniform float uTime;
uniform float uReveal;       // 0..1 描画進行（PR 2 で本格化）
uniform float uPassProgress; // 0..1 くぐる演出（後段で fade out + scale）
uniform vec2 uResolution;
varying vec2 vUv;

float sdRect(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float toriiSDF(vec2 p) {
  float d = 1e6;
  // 柱（左右）— わずかにテーパしたいが今は素直な矩形
  d = min(d, sdRect(p - vec2(-0.36,  0.00), vec2(0.025, 0.42)));
  d = min(d, sdRect(p - vec2( 0.36,  0.00), vec2(0.025, 0.42)));
  // 笠木（上の太い横木）
  d = min(d, sdRect(p - vec2(0.0,  0.44), vec2(0.50, 0.045)));
  // 島木（笠木の下の段）
  d = min(d, sdRect(p - vec2(0.0,  0.385), vec2(0.46, 0.022)));
  // 貫（中ほどの横木）
  d = min(d, sdRect(p - vec2(0.0,  0.21), vec2(0.40, 0.020)));
  // 額束（中央の小柱）
  d = min(d, sdRect(p - vec2(0.0,  0.30), vec2(0.025, 0.07)));
  return d;
}

void main() {
  // 中央を 0,0 とする座標、縦横の歪みを除去
  vec2 p = vUv - 0.5;
  p.x *= uResolution.x / uResolution.y;

  // 鳥居全体のスケール（くぐる演出で進めると拡大）
  float scale = 1.0 + uPassProgress * 1.6;
  p /= scale;

  float d = toriiSDF(p);

  // 滲み: 距離を FBM で揺らがせる
  float bleedNoise = fbm(vUv * 28.0 + uTime * 0.03);
  d -= bleedNoise * 0.0085;

  // ストロークアルファ: 内側はベタ、外側に向かって滑らかに消える
  float alpha = 1.0 - smoothstep(-0.004, 0.014, d);

  // ドライブラシ: 高周波ノイズで部分的にかすれさせる
  float dry = fbm(vUv * 70.0);
  alpha *= mix(0.55, 1.0, smoothstep(0.32, 0.7, dry));

  // 墨だまり: 内側の濃度を低周波で変化（中央寄りは濃く、縁は薄く）
  float pool = fbm(vUv * 10.0);
  float darkness = mix(0.85, 1.0, pool);

  // 反転墨（暗背景の上に乗せる温白色）
  vec3 inkColor = vec3(0.93, 0.86, 0.62) * darkness;

  // reveal: 下から上へ徐々に出る（PR 2 で書き下ろす予定の暫定）
  float revealMask = smoothstep(0.0, 0.12, uReveal - (1.0 - vUv.y));
  alpha *= revealMask;

  // くぐる演出: progress が進むほどフェードアウト
  alpha *= 1.0 - smoothstep(0.55, 0.95, uPassProgress);

  gl_FragColor = vec4(inkColor, alpha * 0.94);
}
`;

/**
 * 「幽世」墨書きシェーダ。
 * Canvas で描いたグリフテクスチャを sampling し、シェーダで
 *   - エッジを FBM で perturbation して滲ませる
 *   - 高周波ノイズでドライブラシ
 *   - 低周波ノイズで墨溜まりの濃淡
 *   - reveal 方向: 左から右の wipe
 */
const SUMI_KANJI_FRAGMENT = `
${NOISE_GLSL}
uniform sampler2D uGlyph;
uniform float uTime;
uniform float uReveal;        // 0..1 描画進行
uniform float uPassProgress;  // 0..1 くぐる演出
varying vec2 vUv;

void main() {
  // FBM でサンプリング位置を揺らがせて滲み効果
  vec2 perturb = vec2(
    fbm(vUv * 30.0 + uTime * 0.04),
    fbm(vUv * 30.0 + vec2(11.7, 3.3))
  ) * 0.012 - 0.006;
  float base = texture2D(uGlyph, vUv + perturb).a;

  // 加えて中心側のサンプル（より「内側ベタ」感を出すための補強）
  float core = texture2D(uGlyph, vUv).a;
  float alpha = max(base * 0.9, core);

  // ドライブラシ: 高周波で部分的にかすれる
  float dry = fbm(vUv * 65.0);
  alpha *= mix(0.55, 1.0, smoothstep(0.32, 0.7, dry));

  // 墨溜まり: 低周波で濃淡
  float pool = fbm(vUv * 7.0 + 4.2);
  vec3 inkColor = vec3(0.93, 0.86, 0.62) * mix(0.82, 1.0, pool);

  // reveal: 左から右へ wipe（柔らかい縁）
  float revealMask = smoothstep(0.0, 0.18, uReveal - vUv.x * 0.85);
  alpha *= revealMask;

  // くぐる演出: progress でフェードアウト
  alpha *= 1.0 - smoothstep(0.5, 0.95, uPassProgress);

  gl_FragColor = vec4(inkColor, alpha);
}
`;

/**
 * 結界（PR 3 本格版）:
 *   - 4 リングに増やし、それぞれ位相をずらして「呼吸が外に伝播」する感じ
 *   - simplex FBM でリング線が微振動（角度ベースで等方的に揺らぐ）
 *   - 朱 ⇄ 金 の色相が 30s 周期でゆっくり循環
 *   - くぐる演出 (uPassProgress) では蹴り出し風に加速膨張
 */
const BARRIER_FRAGMENT = `
${NOISE_GLSL}
uniform float uTime;
uniform float uBreath;       // 0..1 御札ホバー強度
uniform float uPassProgress; // 0..1 くぐる演出
uniform vec2 uResolution;
varying vec2 vUv;

// 朱 vermilion-500 / 金 gold-500
const vec3 COLOR_VERMILION = vec3(0.756, 0.157, 0.227);
const vec3 COLOR_GOLD      = vec3(0.96, 0.78, 0.27);

void main() {
  vec2 p = vUv - 0.5;
  p.x *= uResolution.x / uResolution.y;

  // 結界中心: 鳥居の門の中央付近（笠木のすぐ下）
  vec2 center = vec2(0.0, 0.20);
  vec2 toC = p - center;
  float r = length(toC);
  float ang = atan(toC.y, toC.x); // -π..π

  // 大域色相循環: 30s 周期で 朱→金→朱
  float globalCycle = 0.5 + 0.5 * sin(uTime * 0.21);

  // くぐる演出のキック (ease-in で蹴り出してから加速)
  float kick = smoothstep(0.0, 0.55, uPassProgress);
  kick = kick * kick;

  vec3 col = vec3(0.0);
  float aSum = 0.0;

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // 半径の基本値
    float baseRadius = 0.15 + fi * 0.06;

    // 位相差: 内側のリングから外側へ呼吸が伝播
    float phase = uTime * 0.85 - fi * 0.5;
    float pulse = sin(phase) * 0.5 + 0.5;
    baseRadius += pulse * 0.004 * (1.0 + uBreath * 3.5);

    // くぐる演出で外へ蹴り出し
    baseRadius += kick * (0.45 + fi * 0.16);

    // 線の太さ
    float thickness = 0.004 + uBreath * 0.003 + pulse * 0.001;

    // エッジを simplex で微振動（角度ベースで連続）
    float wobble =
      (fbm(vec2(ang * 1.5 + fi * 2.3, uTime * 0.18 + fi)) - 0.5) * 0.0055;
    float dist = abs(r - baseRadius + wobble);
    float ring = smoothstep(thickness, 0.0, dist);

    // 色相: リングごとに位相差を持たせて循環。さらに脈動でわずかに明度変化
    float hue = mix(0.4, 1.0, globalCycle) + fi * 0.08;
    vec3 baseCol = mix(COLOR_VERMILION, COLOR_GOLD, fract(hue));
    baseCol *= mix(0.85, 1.15, pulse);

    col += baseCol * ring;
    aSum += ring * mix(0.7, 1.0, 1.0 - fi / 4.0);
  }

  // 破裂すると消える
  float fade = 1.0 - smoothstep(0.6, 1.0, uPassProgress);
  gl_FragColor = vec4(col, aSum * fade);
}
`;

// ─────────────────────────────────────────────
// 品質プリセット
// ─────────────────────────────────────────────

type QualityTier = "high" | "mobile" | "low";
interface QualityPreset {
  tier: QualityTier;
  goldDustCount: number;
  confettiCount: number;
  bloomIntensity: number;
  bloomEnabled: boolean;
  maxDpr: number;
}

function detectQuality(): QualityPreset {
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as any).deviceMemory ?? 8;
  const isLowSpec = cores < 4 || memory < 4;
  const isMobileViewport = window.innerWidth < 768;
  if (isLowSpec) {
    return {
      tier: "low",
      goldDustCount: 40,
      confettiCount: 80,
      bloomIntensity: 0,
      bloomEnabled: false,
      maxDpr: 1.25,
    };
  }
  if (isMobileViewport) {
    return {
      tier: "mobile",
      goldDustCount: 80,
      confettiCount: 120,
      bloomIntensity: 0.55,
      bloomEnabled: true,
      maxDpr: 1.5,
    };
  }
  return {
    tier: "high",
    goldDustCount: 140,
    confettiCount: 200,
    bloomIntensity: 0.85,
    bloomEnabled: true,
    maxDpr: 2,
  };
}

// ─────────────────────────────────────────────
// 金粉スプライト texture
// ─────────────────────────────────────────────

function makeDustSprite(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, "rgba(255, 240, 196, 1)");
  grad.addColorStop(0.3, "rgba(255, 220, 150, 0.55)");
  grad.addColorStop(0.7, "rgba(255, 200, 110, 0.1)");
  grad.addColorStop(1, "rgba(255, 200, 110, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

// ─────────────────────────────────────────────
// メインファクトリ
// ─────────────────────────────────────────────

export function initToriiScene(container: HTMLElement): ToriiScene {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const quality = detectQuality();

  const scene = new Scene();
  scene.background = new Color(INK_950);

  // 全画面を覆う Ortho カメラ（−1..1 の正規化空間）
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxDpr));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const initialResolution = new Vector2(
    container.clientWidth,
    container.clientHeight,
  );

  // 共有 quad（全 layer で使い回す）
  const quadGeo = new PlaneGeometry(2, 2);

  // ─ ① 紙 ─────────────────────────
  const paperMat = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: PAPER_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: initialResolution.clone() },
    },
  });
  const paperMesh = new Mesh(quadGeo, paperMat);
  paperMesh.position.z = -0.3;
  scene.add(paperMesh);

  // ─ ② 鳥居 ─────────────────────────
  const toriiMat = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: TORII_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 1.0 }, // PR 2 で 0 から ease するように。今は最初から出す
      uPassProgress: { value: 0 },
      uResolution: { value: initialResolution.clone() },
    },
  });
  const toriiMesh = new Mesh(quadGeo, toriiMat);
  toriiMesh.position.z = -0.1;
  scene.add(toriiMesh);

  // ─ ③ 結界 ─────────────────────────
  const barrierMat = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: BARRIER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBreath: { value: 0 },
      uPassProgress: { value: 0 },
      uResolution: { value: initialResolution.clone() },
    },
  });
  const barrierMesh = new Mesh(quadGeo, barrierMat);
  barrierMesh.position.z = 0.0;
  scene.add(barrierMesh);

  // ─ ④ 「幽世」墨書き（テクスチャ非同期ロード後にアルファ反映） ──
  const kanjiMat = new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: SUMI_KANJI_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uGlyph: { value: null },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPassProgress: { value: 0 },
    },
  });
  // 別 geometry: アスペクト比をテクスチャに合わせて変えるため、独自の Plane
  const kanjiGeo = new PlaneGeometry(1, 1);
  const kanjiMesh = new Mesh(kanjiGeo, kanjiMat);
  // 画面上部中央寄り（NDC: 0..1 quad の位置を scale で調整）
  kanjiMesh.position.set(0, 0.6, 0.05);
  kanjiMesh.scale.set(0.001, 0.001, 1); // テクスチャ未ロード時は実質非表示
  scene.add(kanjiMesh);

  // 非同期: 「幽世」テクスチャ生成 → uniform 注入 + 適切スケール
  let kanjiRevealStart = 0;
  void makeSumiTextTexture("幽世")
    .then((res) => {
      kanjiMat.uniforms.uGlyph.value = res.texture;
      const aspect = res.width / res.height;
      // NDC 上で kanji 縦サイズが 0.32 になるよう scale を決定
      const desiredHeight = 0.32;
      kanjiMesh.scale.set(desiredHeight * aspect, desiredHeight, 1);
      kanjiRevealStart = performance.now();
    })
    .catch((err) => {
      // 失敗してもシーン本体は崩さない
      console.warn("[scene] sumi text load failed:", err);
    });

  // ─ ⑤ 金粉 ─────────────────────────
  const dustTexture = makeDustSprite();
  const dustGeo = new BufferGeometry();
  const dustCount = quality.goldDustCount;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSizes = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i += 1) {
    // 全画面範囲（NDC -1..1）にまく
    dustPositions[i * 3 + 0] = (Math.random() - 0.5) * 2.2;
    dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 2.2;
    dustPositions[i * 3 + 2] = 0.1;
    // べき乗分布で大小混在（多くは小、少数は大）
    const u = Math.random();
    dustSizes[i] = Math.pow(u, 2.4) * 0.05 + 0.005;
  }
  dustGeo.setAttribute(
    "position",
    new Float32BufferAttribute(dustPositions, 3),
  );
  dustGeo.setAttribute("size", new Float32BufferAttribute(dustSizes, 1));
  const dustMat = new PointsMaterial({
    map: dustTexture,
    color: GOLD_100,
    size: 0.03,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const dust = new Points(dustGeo, dustMat);
  dust.position.z = 0.2;
  scene.add(dust);

  // 金粉の縦方向速度（個別）
  const dustVelY = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i += 1) {
    dustVelY[i] = 0.00015 + Math.random() * 0.0004;
  }

  // ─ 後処理 ─────────────────────────
  const composer = new EffectComposer(renderer);
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(new RenderPass(scene, camera));

  const effectsForDispose: Array<{ dispose?: () => void }> = [];
  const effects: any[] = [];
  if (quality.bloomEnabled) {
    const bloom = new BloomEffect({
      intensity: quality.bloomIntensity,
      luminanceThreshold: 0.2,
      luminanceSmoothing: 0.4,
      kernelSize:
        quality.tier === "high" ? KernelSize.LARGE : KernelSize.MEDIUM,
      mipmapBlur: true,
    });
    effects.push(bloom);
    effectsForDispose.push(bloom);
  }
  if (quality.tier !== "low") {
    const vignette = new VignetteEffect({
      darkness: quality.tier === "high" ? 0.72 : 0.6,
      offset: 0.28,
    });
    effects.push(vignette);
    effectsForDispose.push(vignette);

    const noise = new NoiseEffect({
      premultiply: true,
      blendFunction: BlendFunction.SOFT_LIGHT,
    });
    (noise.blendMode as any).opacity.value =
      quality.tier === "high" ? 0.28 : 0.2;
    effects.push(noise);
    effectsForDispose.push(noise);
  }
  if (effects.length > 0) {
    composer.addPass(new EffectPass(camera, ...effects));
  }

  // ─ 状態 ─────────────────────────
  let breathTarget = 0;
  let breathSmooth = 0;
  let confettiActive = false;
  let confettiStartTime = 0;

  // ─ アニメーション ─────────────────────────
  let rafId = 0;
  let running = true;
  const startedAt = performance.now();

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);

    const t = (performance.now() - startedAt) / 1000;

    paperMat.uniforms.uTime.value = t;
    toriiMat.uniforms.uTime.value = t;
    barrierMat.uniforms.uTime.value = t;
    kanjiMat.uniforms.uTime.value = t;

    // 「幽世」reveal: テクスチャがロードされてから 2.5s かけて左→右
    if (kanjiRevealStart > 0) {
      const elapsed = (performance.now() - kanjiRevealStart) / 1000;
      const reveal = Math.min(1, elapsed / 2.5);
      // ease-out cubic
      kanjiMat.uniforms.uReveal.value = 1 - Math.pow(1 - reveal, 3);
    }

    if (!prefersReducedMotion) {
      // 結界の脈動強度を補間
      const lerp = breathTarget > breathSmooth ? 0.06 : 0.04;
      breathSmooth += (breathTarget - breathSmooth) * lerp;
      barrierMat.uniforms.uBreath.value = breathSmooth;

      // 金粉の上昇（画面外に出たら下から再投入）
      const posAttr = dust.geometry.getAttribute("position");
      for (let i = 0; i < dustCount; i += 1) {
        let y = posAttr.getY(i);
        y += dustVelY[i];
        if (y > 1.2) {
          y = -1.2;
          posAttr.setX(i, (Math.random() - 0.5) * 2.2);
        }
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;

      // 紙吹雪（confetti）= 金粉のミニ爆発
      if (confettiActive) {
        const elapsed = (performance.now() - confettiStartTime) / 1000;
        if (elapsed > 2.0) {
          confettiActive = false;
        }
        // 速度を一時的に上げる（簡易、PR 5 で詳細化）
        // 今は visual な追加なし — placeholder
      }
    }

    composer.render();
  }
  animate();

  // ─ リサイズ ─────────────────────────
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    paperMat.uniforms.uResolution.value.set(w, h);
    toriiMat.uniforms.uResolution.value.set(w, h);
    barrierMat.uniforms.uResolution.value.set(w, h);
  };
  window.addEventListener("resize", onResize);

  const onVisChange = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(rafId);
    } else if (!running) {
      running = true;
      animate();
    }
  };
  document.addEventListener("visibilitychange", onVisChange);

  return {
    setOfudaHover(active: boolean) {
      breathTarget = active ? 1 : 0;
    },
    setPassProgress(p: number) {
      const clamped = Math.max(0, Math.min(1, p));
      toriiMat.uniforms.uPassProgress.value = clamped;
      barrierMat.uniforms.uPassProgress.value = clamped;
      kanjiMat.uniforms.uPassProgress.value = clamped;
    },
    triggerConfetti() {
      if (confettiActive) return;
      confettiActive = true;
      confettiStartTime = performance.now();
    },
    dispose() {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisChange);
      effectsForDispose.forEach((e) => e.dispose?.());
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      dustTexture.dispose();
      quadGeo.dispose();
      kanjiGeo.dispose();
      paperMat.dispose();
      toriiMat.dispose();
      barrierMat.dispose();
      kanjiMat.dispose();
      (kanjiMat.uniforms.uGlyph.value as any)?.dispose?.();
      dustGeo.dispose();
      dustMat.dispose();
    },
  };
}
