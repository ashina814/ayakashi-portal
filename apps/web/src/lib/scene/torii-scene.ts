/**
 * Login Screen Scene
 *
 * ログイン画面 詳細設計 v1 に準拠した「黄泉平坂を見下ろす」シーン。
 *   - カメラは坂の頂（y=1.5）から注視点 (0, 0.8, -10) を見下ろす（FOV 35°、シネマ寄り）
 *   - 鳥居は 14 体、InstancedMesh で坂を下りながら小さくなる
 *   - 奥に山稜のシルエット（noise displacement）
 *   - 月・霧・狐火・粒子・bloom は M4a/b の構成を流用
 *   - クリック → くぐる演出 は PR γ で追加予定（今は静的シーン）
 *
 * プロシージャル原則は維持。バイナリ素材は使わない。
 */

import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  KernelSize,
  NoiseEffect,
  RenderPass,
  VignetteEffect,
} from "postprocessing";

const INK_950 = 0x0a0509;
const INK_900 = 0x14090f;
const GOLD_100 = 0xf5e7c4;
const GOLD_500 = 0xb89540;
const VERMILION_500 = 0xb04438;
const VERMILION_700 = 0x621c14;
const MIST_GLOW = 0xb8e0ff;
const FOXFIRE_COLOR = 0x9be0ff;

export interface ToriiScene {
  dispose(): void;
  /** 御札ホバー中の演出を切替。最寄りの狐火が御札の3D投影点に寄ってくる */
  setOfudaHover(active: boolean): void;
  /**
   * 御札クリック → 鳥居をくぐる演出を開始。
   * 紙吹雪を放出してカメラが Z 方向に 4s かけて前進する。
   * 既に進行中なら何もしない。
   */
  startPassThrough(): void;
}

/** ソフトな円形グラデーション texture（dust / halo 用） */
function makeSoftSpriteTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.25, "rgba(255, 255, 255, 0.6)");
  grad.addColorStop(0.6, "rgba(255, 255, 255, 0.12)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * 狐火本体の炎テクスチャ。縦長の不規則な炎形を多層グラデで描く。
 * 白＝色を乗せやすいよう中央は白基調にして、色は ShaderMaterial 側で
 * 乗算する設計。
 */
function makeFlameTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size / 2, size / 2 - size * 0.04);
  // 細長い炎の形状（高さ > 幅）
  ctx.scale(0.45, 1.15);

  // ① 外周の薄いオーラ（やや広め）
  let g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.46);
  g.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  g.addColorStop(0.3, "rgba(255, 255, 255, 0.28)");
  g.addColorStop(0.6, "rgba(255, 255, 255, 0.08)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(-size, -size, size * 2, size * 2);

  // ② 中段の本体（少し上にオフセット = 火の先端が伸びる雰囲気）
  g = ctx.createRadialGradient(0, -size * 0.08, 0, 0, -size * 0.06, size * 0.25);
  g.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  g.addColorStop(0.4, "rgba(255, 255, 255, 0.55)");
  g.addColorStop(0.85, "rgba(255, 255, 255, 0.08)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(-size, -size, size * 2, size * 2);

  // ③ 中心の白熱（小さく強く）
  g = ctx.createRadialGradient(0, -size * 0.08, 0, 0, -size * 0.08, size * 0.1);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.5, "rgba(255, 255, 255, 0.7)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(-size, -size, size * 2, size * 2);

  ctx.restore();
  return new CanvasTexture(canvas);
}

/**
 * 火の粉用テクスチャ。本体より小さい鋭めの円グラデ。
 * チリチリした粒感のために本体とは別エミッタにする。
 */
function makeEmberTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.25, "rgba(255, 255, 255, 0.7)");
  grad.addColorStop(0.6, "rgba(255, 255, 255, 0.15)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

const FOXFIRE_VERTEX = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying float vFlicker;
varying vec3 vColor;

void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // ゆらぎ: 速い揺らぎ + 遅いうねりを合成
  float fast = sin(uTime * 6.0 + aPhase * 12.5664) * 0.5 + 0.5;
  float slow = sin(uTime * 1.7 + aPhase * 7.2832) * 0.5 + 0.5;
  vFlicker = 0.6 + 0.4 * mix(slow, fast, 0.6);
  gl_PointSize = aSize * vFlicker * uPixelRatio * (200.0 / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FOXFIRE_FRAGMENT = `
uniform sampler2D uMap;
varying float vFlicker;
varying vec3 vColor;

void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  // テクスチャ自体は半透明グラデ。ベース色を掛け、ゆらぎで明度を更に動かす
  vec3 col = vColor * tex.rgb * (0.7 + 0.6 * vFlicker);
  gl_FragColor = vec4(col, tex.a);
}
`;

/** 端末スペック + ビューポートから描画品質プリセットを決定する */
type QualityTier = "high" | "mobile" | "low";
interface QualityPreset {
  tier: QualityTier;
  toriiCount: number;
  foxfireCount: number;
  dustCount: number;
  /** UnrealBloomPass の strength。0 で bloom 自体を無効化 */
  bloomStrength: number;
  bloomRadius: number;
  /** DPR の上限 */
  maxDpr: number;
  /** 紙吹雪の数 */
  confettiCount: number;
}

function detectQuality(): QualityPreset {
  // navigator の貧弱な値（古い iPhone / Android）は low に
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as any).deviceMemory ?? 8;
  const isLowSpec = cores < 4 || memory < 4;
  // viewport 幅が狭ければ mobile preset（描画負荷を抑える）
  const isMobileViewport = window.innerWidth < 768;

  if (isLowSpec) {
    return {
      tier: "low",
      toriiCount: 8,
      foxfireCount: 6,
      dustCount: 120,
      bloomStrength: 0,
      bloomRadius: 0,
      maxDpr: 1.25,
      confettiCount: 80,
    };
  }
  if (isMobileViewport) {
    return {
      tier: "mobile",
      toriiCount: 10,
      foxfireCount: 8,
      dustCount: 200,
      bloomStrength: 0.55,
      bloomRadius: 0.6,
      maxDpr: 1.5,
      confettiCount: 130,
    };
  }
  return {
    tier: "high",
    toriiCount: 14,
    foxfireCount: 12,
    dustCount: 320,
    bloomStrength: 0.85,
    bloomRadius: 0.7,
    maxDpr: 2,
    confettiCount: 200,
  };
}

/** 鳥居 1 体分のジオメトリを単一 BufferGeometry に merge する */
function buildToriiGeometry(): BufferGeometry {
  // 各パーツをローカル座標に配置（鳥居の足元中心が原点になるよう Y オフセット）
  const parts: BufferGeometry[] = [];

  const pillar = new BoxGeometry(0.32, 5.6, 0.32);
  const pillarLeft = pillar.clone().translate(-2.0, 2.8, 0);
  const pillarRight = pillar.clone().translate(2.0, 2.8, 0);
  parts.push(pillarLeft, pillarRight);
  pillar.dispose();

  parts.push(new BoxGeometry(5.4, 0.42, 0.42).translate(0, 5.6, 0)); // 笠木
  parts.push(new BoxGeometry(5.0, 0.22, 0.32).translate(0, 5.25, 0)); // 島木
  parts.push(new BoxGeometry(4.6, 0.22, 0.22).translate(0, 4.0, 0)); // 貫
  parts.push(new BoxGeometry(0.32, 0.85, 0.22).translate(0, 4.6, 0)); // 額束

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error("Failed to merge torii geometry");
  parts.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  return merged;
}

/** 山稜（横長プレーン + 上辺ノイズ変位）を作る */
function buildMountainSilhouette(): Mesh {
  const width = 80;
  const height = 12;
  const segments = 80;
  const geo = new PlaneGeometry(width, height, segments, 1);

  // 上辺（y > 0）に複数周波数のサイン波で起伏を作る
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (y > 0) {
      const n =
        Math.sin(x * 0.18) * 1.3 +
        Math.sin(x * 0.52 + 0.9) * 0.7 +
        Math.sin(x * 1.13 + 2.4) * 0.4;
      pos.setY(i, y + n);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new MeshBasicMaterial({
    color: INK_900,
    fog: true,
    side: DoubleSide,
  });
  const mesh = new Mesh(geo, mat);
  return mesh;
}

export function initToriiScene(container: HTMLElement): ToriiScene {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // M4e: 低スペック検出。CPU / メモリが乏しい端末はパーティクル削減 + bloom OFF
  const quality = detectQuality();

  const scene = new Scene();
  scene.background = new Color(INK_950);
  // 詳細設計に従い、奥行きを長く取る（山稜を fog の縁に置くため）
  scene.fog = new Fog(INK_950, 10, 38);

  // ─── カメラ（詳細設計 §3） ────────────────────
  const camera = new PerspectiveCamera(
    35,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.5, 8);
  camera.lookAt(0, 0.8, -10);

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxDpr));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // ─── 月 ───────────────────────────────────────
  const moon = new Mesh(
    new CircleGeometry(1.3, 64),
    new MeshBasicMaterial({
      color: GOLD_100,
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  moon.position.set(-3.6, 6.4, -25);
  scene.add(moon);

  const moonHalo = new Mesh(
    new CircleGeometry(2.4, 64),
    new MeshBasicMaterial({
      color: GOLD_500,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  moonHalo.position.copy(moon.position).setZ(moon.position.z - 0.01);
  scene.add(moonHalo);

  // ─── 山稜 ─────────────────────────────────────
  const mountain = buildMountainSilhouette();
  mountain.position.set(0, -1.2, -26);
  scene.add(mountain);

  // ─── 鳥居（InstancedMesh で 14 体） ─────────────
  const TORII_COUNT = quality.toriiCount;
  const toriiGeo = buildToriiGeometry();
  const toriiMat = new MeshStandardMaterial({
    color: VERMILION_500,
    roughness: 0.6,
    metalness: 0.05,
    emissive: VERMILION_700,
    emissiveIntensity: 0.12,
  });
  const torii = new InstancedMesh(toriiGeo, toriiMat, TORII_COUNT);

  const tmpMat = new Matrix4();
  const tmpQuat = new Quaternion();
  const tmpScale = new Vector3();
  const tmpPos = new Vector3();
  for (let i = 0; i < TORII_COUNT; i += 1) {
    // 一直線に並べる。手前 z=-1 → 奥 z=-27 程度。
    const z = -1 - i * 2.0;
    // 坂を下る雰囲気で Y もわずかに下がる（y=0 → y=-1.5）
    const y = -i * 0.11;
    // 遠方ほど少しだけ小さくして遠近感を強調
    const s = Math.max(0.55, 1 - i * 0.035);
    tmpPos.set(0, y, z);
    tmpScale.set(s, s, s);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    torii.setMatrixAt(i, tmpMat);
  }
  torii.instanceMatrix.needsUpdate = true;
  scene.add(torii);

  // ─── 地面 & ミスト ────────────────────────────
  const ground = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshBasicMaterial({ color: INK_950, side: DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  const mistBand = new Mesh(
    new PlaneGeometry(40, 1.8),
    new MeshBasicMaterial({
      color: MIST_GLOW,
      transparent: true,
      opacity: 0.1,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  mistBand.position.set(0, 0.6, -8);
  scene.add(mistBand);

  // 低い霧 (もう一枚、手前寄り)
  const mistBandNear = new Mesh(
    new PlaneGeometry(30, 1.0),
    new MeshBasicMaterial({
      color: MIST_GLOW,
      transparent: true,
      opacity: 0.06,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  mistBandNear.position.set(0, 0.25, -3);
  scene.add(mistBandNear);

  // ─── ライト ───────────────────────────────────
  scene.add(new AmbientLight(0x1f1219, 0.55));
  const moonLight = new PointLight(GOLD_100, 1.6, 60, 1.6);
  moonLight.position.copy(moon.position);
  scene.add(moonLight);
  const rimLight = new PointLight(MIST_GLOW, 0.4, 24, 2);
  rimLight.position.set(0, 2.5, -12);
  scene.add(rimLight);

  // ─── 狐火 ─────────────────────────────────────
  // 三層構造:
  //   ① コア (cores)   : 縦長の炎本体。ShaderMaterial + 速い flicker
  //   ② 火の粉 (embers) : コア周囲に飛び散る小さな粒。チリチリ感の主因
  //   ③ ハロー (halos)  : コア周囲の柔らかい光。距離感と滲み
  // 色は 青白 / 金 / 朱 を混ぜて「夜の社の火」感を出す。
  const FOXFIRE_COUNT = quality.foxfireCount;
  const EMBER_PER_CORE = quality.tier === "low" ? 0 : quality.tier === "mobile" ? 4 : 6;
  const EMBER_COUNT = FOXFIRE_COUNT * EMBER_PER_CORE;
  const spriteTexture = makeSoftSpriteTexture();
  const flameTexture = makeFlameTexture();
  const emberTexture = makeEmberTexture();

  // 色パレット: 青白 40% / 金 35% / 朱 25%
  const COLOR_PALETTE: [number, number, number][] = [
    [0.72, 0.9, 1.0],   // 青白 (mist-glow 寄り)
    [0.72, 0.9, 1.0],   // 青白
    [1.0, 0.82, 0.5],   // 金 (gold-300 寄り)
    [1.0, 0.78, 0.42],  // 金やや暖色
    [1.0, 0.56, 0.36],  // 朱 (vermilion-300 寄り)
  ];
  function pickPaletteColor(rand: number): [number, number, number] {
    return COLOR_PALETTE[Math.floor(rand * COLOR_PALETTE.length)];
  }

  // ─ ① コア ─────────
  const foxfireGeo = new BufferGeometry();
  const foxfirePositions = new Float32Array(FOXFIRE_COUNT * 3);
  const foxfireSizes = new Float32Array(FOXFIRE_COUNT);
  const foxfirePhases = new Float32Array(FOXFIRE_COUNT);
  const foxfireColors = new Float32Array(FOXFIRE_COUNT * 3);
  for (let i = 0; i < FOXFIRE_COUNT; i += 1) {
    // サイズも幅広く: 大きい "近い火" と 小さい "遠い火" を混在させてメリハリ
    foxfireSizes[i] = 32 + Math.random() * 40;
    foxfirePhases[i] = Math.random();
    const [r, g, b] = pickPaletteColor(Math.random());
    foxfireColors[i * 3 + 0] = r;
    foxfireColors[i * 3 + 1] = g;
    foxfireColors[i * 3 + 2] = b;
  }
  foxfireGeo.setAttribute(
    "position",
    new Float32BufferAttribute(foxfirePositions, 3),
  );
  foxfireGeo.setAttribute(
    "aSize",
    new Float32BufferAttribute(foxfireSizes, 1),
  );
  foxfireGeo.setAttribute(
    "aPhase",
    new Float32BufferAttribute(foxfirePhases, 1),
  );
  foxfireGeo.setAttribute(
    "aColor",
    new Float32BufferAttribute(foxfireColors, 3),
  );

  const foxfireMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMap: { value: flameTexture },
    },
    vertexShader: FOXFIRE_VERTEX,
    fragmentShader: FOXFIRE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const foxfire = new Points(foxfireGeo, foxfireMat);
  scene.add(foxfire);

  // ─ ② 火の粉 (embers) ─────────
  // 同じシェーダを使い、テクスチャだけ差し替え。サイズは小さく、phase に
  // 大きなばらつきを与えて チリチリ させる。
  const emberGeo = new BufferGeometry();
  const emberPositions = new Float32Array(EMBER_COUNT * 3);
  const emberSizes = new Float32Array(EMBER_COUNT);
  const emberPhases = new Float32Array(EMBER_COUNT);
  const emberColors = new Float32Array(EMBER_COUNT * 3);
  for (let i = 0; i < EMBER_COUNT; i += 1) {
    emberSizes[i] = 4 + Math.random() * 10;
    emberPhases[i] = Math.random();
    const parentIdx = Math.floor(i / EMBER_PER_CORE);
    // 親コアの色を継承しつつ、わずかにジッタ
    const pr = foxfireColors[parentIdx * 3 + 0];
    const pg = foxfireColors[parentIdx * 3 + 1];
    const pb = foxfireColors[parentIdx * 3 + 2];
    emberColors[i * 3 + 0] = Math.min(1, pr + (Math.random() - 0.5) * 0.15);
    emberColors[i * 3 + 1] = Math.min(1, pg + (Math.random() - 0.5) * 0.15);
    emberColors[i * 3 + 2] = Math.min(1, pb + (Math.random() - 0.5) * 0.15);
  }
  emberGeo.setAttribute(
    "position",
    new Float32BufferAttribute(emberPositions, 3),
  );
  emberGeo.setAttribute(
    "aSize",
    new Float32BufferAttribute(emberSizes, 1),
  );
  emberGeo.setAttribute(
    "aPhase",
    new Float32BufferAttribute(emberPhases, 1),
  );
  emberGeo.setAttribute(
    "aColor",
    new Float32BufferAttribute(emberColors, 3),
  );

  const emberMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMap: { value: emberTexture },
    },
    vertexShader: FOXFIRE_VERTEX,
    fragmentShader: FOXFIRE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const ember = new Points(emberGeo, emberMat);
  scene.add(ember);

  // 火の粉ごとの軌道パラメータ（親コアからの局所軌道）
  interface EmberParam {
    parentIdx: number;
    localRadius: number;
    localSpeed: number;
    localPhase: number;
    yOffset: number;
  }
  const emberParams: EmberParam[] = Array.from(
    { length: EMBER_COUNT },
    (_, i) => ({
      parentIdx: Math.floor(i / EMBER_PER_CORE),
      localRadius: 0.12 + Math.random() * 0.35,
      localSpeed: 0.7 + Math.random() * 1.6, // コアより速く
      localPhase: Math.random() * Math.PI * 2,
      yOffset: (Math.random() - 0.3) * 0.6,
    }),
  );

  // ─ ③ ハロー ─────────
  // コアの色を継承しないと「青ハローと朱コア」がぶつかるので、ハローも
  // 親コアの色を引き継いだ vertexColors にして陰気な統一感を出す。
  const foxfireHaloGeo = new BufferGeometry();
  const haloPositions = new Float32Array(FOXFIRE_COUNT * 3);
  const haloColors = new Float32Array(FOXFIRE_COUNT * 3);
  for (let i = 0; i < FOXFIRE_COUNT; i += 1) {
    haloColors[i * 3 + 0] = foxfireColors[i * 3 + 0];
    haloColors[i * 3 + 1] = foxfireColors[i * 3 + 1];
    haloColors[i * 3 + 2] = foxfireColors[i * 3 + 2];
  }
  foxfireHaloGeo.setAttribute(
    "position",
    new Float32BufferAttribute(haloPositions, 3),
  );
  foxfireHaloGeo.setAttribute(
    "color",
    new Float32BufferAttribute(haloColors, 3),
  );
  const foxfireHaloMat = new PointsMaterial({
    map: spriteTexture,
    vertexColors: true,
    size: 2.2,
    transparent: true,
    opacity: 0.18,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const foxfireHalo = new Points(foxfireHaloGeo, foxfireHaloMat);
  scene.add(foxfireHalo);

  interface FoxfireParam {
    centerX: number;
    centerZ: number;
    baseY: number;
    radiusX: number;
    radiusZ: number;
    speed: number;
    phase: number;
    yAmp: number;
  }
  const foxfireParams: FoxfireParam[] = Array.from(
    { length: FOXFIRE_COUNT },
    (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      // 深さを均一でなく不均一に配置（メリハリ）。手前 -1 から奥 -20 まで散らす。
      const depthBucket = i / Math.max(1, FOXFIRE_COUNT - 1);
      // depthBucket を非線形に変換して近距離側に多めに寄せる
      const depthNorm = Math.pow(depthBucket, 0.85);
      const centerZ = -1.2 - depthNorm * 18 + (Math.random() - 0.5) * 1.0;
      return {
        centerX:
          side * (1.6 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.6,
        centerZ,
        baseY: 0.4 + Math.random() * 1.5,
        radiusX: 0.25 + Math.random() * 0.5,
        radiusZ: 0.2 + Math.random() * 0.4,
        speed: 0.22 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
        yAmp: 0.2 + Math.random() * 0.45,
      };
    },
  );

  // ─── 粒子 ─────────────────────────────────────
  const DUST_COUNT = quality.dustCount;
  const dustGeo = new BufferGeometry();
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i += 1) {
    dustPositions[i * 3 + 0] = (Math.random() - 0.5) * 22;
    dustPositions[i * 3 + 1] = Math.random() * 7;
    dustPositions[i * 3 + 2] = -2 - Math.random() * 24;
  }
  dustGeo.setAttribute(
    "position",
    new Float32BufferAttribute(dustPositions, 3),
  );
  const dustMat = new PointsMaterial({
    map: spriteTexture,
    color: 0xe8d8a8,
    size: 0.07,
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new Points(dustGeo, dustMat);
  scene.add(dust);

  // ─── 紙吹雪 (passthrough 演出用、最初は非表示) ──
  const CONFETTI_COUNT = quality.confettiCount;
  const confettiGeo = new BufferGeometry();
  const confettiPositions = new Float32Array(CONFETTI_COUNT * 3);
  const confettiVelocities = new Float32Array(CONFETTI_COUNT * 3);
  // 初期位置を御札の近くに集める（後で発射時に再初期化）
  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    confettiPositions[i * 3 + 0] = 0;
    confettiPositions[i * 3 + 1] = 1.0;
    confettiPositions[i * 3 + 2] = 5.5;
  }
  confettiGeo.setAttribute(
    "position",
    new Float32BufferAttribute(confettiPositions, 3),
  );
  const confettiMat = new PointsMaterial({
    map: spriteTexture,
    color: 0xebe2c9, // washi-100
    size: 0.18,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const confetti = new Points(confettiGeo, confettiMat);
  scene.add(confetti);

  // ─── Post-processing（pmndrs/postprocessing） ────────────
  // tier ごとに使うエフェクトを切替。低スペは passthrough（renderPass のみ）。
  const composer = new EffectComposer(renderer);
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(new RenderPass(scene, camera));

  // 各エフェクトの保持変数（dispose や resize で扱うため）
  const effectsForDispose: Array<{ dispose?: () => void }> = [];

  if (quality.tier !== "low") {
    const effects: any[] = [];

    // Bloom: 月・狐火・御札の輪郭を滲ませる本命
    const bloom = new BloomEffect({
      intensity: quality.tier === "high" ? 1.1 : 0.7,
      luminanceThreshold: 0.18,
      luminanceSmoothing: 0.4,
      kernelSize:
        quality.tier === "high" ? KernelSize.LARGE : KernelSize.MEDIUM,
      mipmapBlur: true,
    });
    effects.push(bloom);
    effectsForDispose.push(bloom);

    // God rays: 月から差す光条。重いので high 限定
    if (quality.tier === "high") {
      const godRays = new GodRaysEffect(camera, moon, {
        height: 480,
        kernelSize: KernelSize.SMALL,
        density: 0.92,
        decay: 0.93,
        weight: 0.32,
        exposure: 0.55,
        samples: 50,
        clampMax: 1.0,
      });
      effects.push(godRays);
      effectsForDispose.push(godRays);
    }

    // 軽い色収差: 画面端だけほんのり虹色（high のみ、強さは控えめ）
    if (quality.tier === "high") {
      const ca = new ChromaticAberrationEffect({
        offset: new Vector2(0.0006, 0.0006),
        radialModulation: true,
        modulationOffset: 0.4,
      });
      effects.push(ca);
      effectsForDispose.push(ca);
    }

    // Vignette: 画面の縁を闇に沈める（常時）
    const vignette = new VignetteEffect({
      darkness: quality.tier === "high" ? 0.65 : 0.55,
      offset: 0.32,
    });
    effects.push(vignette);
    effectsForDispose.push(vignette);

    // Film grain: 和紙の繊維感
    const noise = new NoiseEffect({
      premultiply: true,
      blendFunction: BlendFunction.SOFT_LIGHT,
    });
    (noise.blendMode as any).opacity.value =
      quality.tier === "high" ? 0.32 : 0.22;
    effects.push(noise);
    effectsForDispose.push(noise);

    composer.addPass(new EffectPass(camera, ...effects));
  }

  // ─── マウス追従 & 御札ホバー状態 ────────────────
  // 詳細設計 §3: yaw ±1.5°, pitch ±0.8°、0.5s ease-out
  const mouseTarget = new Vector2(0, 0);
  const mouseSmooth = new Vector2(0, 0);

  const onPointerMove = (e: PointerEvent) => {
    mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener("pointermove", onPointerMove);

  // 御札ホバー: 0 → 1 にゆっくり補間。狐火 2 体が引き寄せられる目印
  let ofudaHoverTarget = 0;
  let ofudaHoverFactor = 0;
  // 御札の 3D 上のおおよその位置（画面中央下に重なるよう、カメラ近くに置く）
  const ofudaWorldPos = new Vector3(0, 1.0, 5.5);
  // 引き寄せる狐火のインデックス（手前 2 体を採用）
  const ATTRACT_INDICES = [0, 1];

  // ─── くぐる演出（passthrough）状態 ──────────────
  // 詳細設計 §7.4:
  //   0.0s クリック、紙吹雪が打ち上がる
  //   0.4s カメラ前進開始、4s ease-out で z=-30 まで
  // ホスト側（login.astro）が霧と白フラッシュ・遷移を担当する
  let passing = false;
  let passStartTime = 0;
  const CAMERA_START_Z = 8;
  const CAMERA_END_Z = -30;
  const CAMERA_DURATION = 4.0; // 秒
  const CONFETTI_START_DELAY = 0.0;
  const CONFETTI_FADE_DURATION = 0.3;
  const CONFETTI_LIFE = 4.0;

  function initConfetti() {
    const posAttr = confetti.geometry.getAttribute("position");
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      // 御札周囲に集めて、放射状に飛ばす
      posAttr.setXYZ(i, ofudaWorldPos.x, ofudaWorldPos.y, ofudaWorldPos.z);
      // 上向き + 放射状 + 軽い前方成分
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 2;
      const upward = 1.5 + Math.random() * 1.5;
      confettiVelocities[i * 3 + 0] = Math.cos(angle) * speed;
      confettiVelocities[i * 3 + 1] = upward;
      confettiVelocities[i * 3 + 2] = Math.sin(angle) * speed * 0.6 - 0.5;
    }
    posAttr.needsUpdate = true;
  }

  // ─── アニメーション ────────────────────────────
  let rafId = 0;
  let running = true;
  const startedAt = performance.now();

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);

    const t = (performance.now() - startedAt) / 1000;

    if (!prefersReducedMotion) {
      // マウス追従（フレーム約 60fps で 0.08 lerp → 0.5s 程度で到達）
      mouseSmooth.lerp(mouseTarget, 0.08);

      // カメラ呼吸 + マウス追従を合成
      const breathYaw = Math.sin((t * (Math.PI * 2)) / 8) * (0.4 * Math.PI / 180);
      const breathPitch = Math.sin(t * 0.3) * (0.2 * Math.PI / 180);
      const mouseYaw = mouseSmooth.x * (1.5 * Math.PI / 180);
      const mousePitch = mouseSmooth.y * (0.8 * Math.PI / 180);

      // passthrough 中はカメラ Z を前進させる（ease-out cubic）
      let passProgress = 0;
      if (passing) {
        const elapsed = (performance.now() - passStartTime) / 1000;
        const raw = Math.min(elapsed / CAMERA_DURATION, 1);
        passProgress = 1 - Math.pow(1 - raw, 3); // ease-out cubic
      }
      const camZ =
        CAMERA_START_Z + (CAMERA_END_Z - CAMERA_START_Z) * passProgress;

      camera.position.x = Math.sin(t * 0.15) * 0.05;
      camera.position.y = 1.5 + Math.sin(t * 0.4) * 0.04;
      camera.position.z = camZ;
      camera.lookAt(
        Math.sin(breathYaw + mouseYaw) * 4,
        0.8 + Math.sin(breathPitch + mousePitch) * 4,
        // 前進中は注視点も一緒に下げて、奥の鳥居を見据える
        -10 + (CAMERA_END_Z - CAMERA_START_Z) * passProgress * 0.8,
      );

      // ミストの横流れ
      mistBand.position.x = Math.sin(t * 0.18) * 1.5;
      mistBandNear.position.x = Math.sin(t * 0.22 + 1.2) * 1.0;

      // 紙吹雪のアップデート（passing 中のみ）
      if (passing) {
        const elapsed = (performance.now() - passStartTime) / 1000;
        // フェードイン → 持続 → フェードアウト
        let alpha = 0;
        if (elapsed < CONFETTI_FADE_DURATION) {
          alpha = elapsed / CONFETTI_FADE_DURATION;
        } else if (elapsed < CONFETTI_LIFE - CONFETTI_FADE_DURATION) {
          alpha = 1;
        } else if (elapsed < CONFETTI_LIFE) {
          alpha = 1 - (elapsed - (CONFETTI_LIFE - CONFETTI_FADE_DURATION)) /
            CONFETTI_FADE_DURATION;
        }
        confettiMat.opacity = Math.max(0, alpha);

        const cAttr = confetti.geometry.getAttribute("position");
        const dt = 1 / 60;
        const gravity = -3.5;
        for (let i = 0; i < CONFETTI_COUNT; i += 1) {
          // 速度に重力を加える
          confettiVelocities[i * 3 + 1] += gravity * dt;
          // 横方向の空気抵抗（ゆっくり減衰）
          confettiVelocities[i * 3 + 0] *= 0.99;
          confettiVelocities[i * 3 + 2] *= 0.99;

          cAttr.setXYZ(
            i,
            cAttr.getX(i) + confettiVelocities[i * 3 + 0] * dt,
            cAttr.getY(i) + confettiVelocities[i * 3 + 1] * dt,
            cAttr.getZ(i) + confettiVelocities[i * 3 + 2] * dt,
          );
        }
        cAttr.needsUpdate = true;
      }

      // 御札ホバーの補間（活性 0.06、解除 0.04 で 400ms 前後）
      const hoverLerp = ofudaHoverTarget > ofudaHoverFactor ? 0.06 : 0.04;
      ofudaHoverFactor += (ofudaHoverTarget - ofudaHoverFactor) * hoverLerp;

      // 狐火（コア / 火の粉 / ハローを同期更新）
      foxfireMat.uniforms.uTime.value = t;
      emberMat.uniforms.uTime.value = t;

      const posAttr = foxfire.geometry.getAttribute("position");
      const haloAttr = foxfireHalo.geometry.getAttribute("position");

      // コア位置を計算しつつ親位置として配列にキャッシュ
      const corePos: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < FOXFIRE_COUNT; i += 1) {
        const p = foxfireParams[i];
        const phase = t * p.speed + p.phase;
        const nx = p.centerX + Math.cos(phase) * p.radiusX;
        const nz = p.centerZ + Math.sin(phase) * p.radiusZ;
        const ny = p.baseY + Math.sin(phase * 0.7) * p.yAmp;

        let x = nx;
        let y = ny;
        let z = nz;
        if (ATTRACT_INDICES.includes(i) && ofudaHoverFactor > 0.001) {
          x = nx + (ofudaWorldPos.x - nx) * ofudaHoverFactor;
          y = ny + (ofudaWorldPos.y - ny) * ofudaHoverFactor;
          z = nz + (ofudaWorldPos.z - nz) * ofudaHoverFactor;
        }
        posAttr.setXYZ(i, x, y, z);
        haloAttr.setXYZ(i, x, y, z);
        corePos.push({ x, y, z });
      }
      posAttr.needsUpdate = true;
      haloAttr.needsUpdate = true;

      // 火の粉: 親コアの位置に局所軌道で乗せる
      if (EMBER_COUNT > 0) {
        const emberAttr = ember.geometry.getAttribute("position");
        for (let i = 0; i < EMBER_COUNT; i += 1) {
          const ep = emberParams[i];
          const parent = corePos[ep.parentIdx];
          const lp = t * ep.localSpeed + ep.localPhase;
          const ox = Math.cos(lp) * ep.localRadius;
          const oz = Math.sin(lp * 0.85) * ep.localRadius * 0.7;
          const oy = ep.yOffset + Math.sin(lp * 1.3) * 0.15;
          emberAttr.setXYZ(i, parent.x + ox, parent.y + oy, parent.z + oz);
        }
        emberAttr.needsUpdate = true;
      }

      // 粒子
      const dustAttr = dust.geometry.getAttribute("position");
      for (let i = 0; i < DUST_COUNT; i += 1) {
        const y = dustAttr.getY(i) + 0.003;
        dustAttr.setY(i, y > 7 ? 0 : y);
      }
      dustAttr.needsUpdate = true;
    }

    composer.render();
  }
  animate();

  // ─── リサイズ ──────────────────────────────────
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
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
      ofudaHoverTarget = active ? 1 : 0;
    },
    startPassThrough() {
      if (passing) return;
      passing = true;
      passStartTime = performance.now();
      initConfetti();
    },
    dispose() {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisChange);
      effectsForDispose.forEach((e) => e.dispose?.());
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      spriteTexture.dispose();
      flameTexture.dispose();
      emberTexture.dispose();
      toriiGeo.dispose();
      toriiMat.dispose();
      scene.traverse((obj) => {
        if (obj instanceof Mesh || obj instanceof Points) {
          obj.geometry.dispose();
          const mat = (obj as Mesh | Points).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    },
  };
}
