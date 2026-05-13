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
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

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
}

/** ソフトな円形グラデーション texture（粒子・狐火の billboard 用） */
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  const TORII_COUNT = 14;
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
  const FOXFIRE_COUNT = 10;
  const spriteTexture = makeSoftSpriteTexture();

  const foxfireGeo = new BufferGeometry();
  const foxfirePositions = new Float32Array(FOXFIRE_COUNT * 3);
  foxfireGeo.setAttribute(
    "position",
    new Float32BufferAttribute(foxfirePositions, 3),
  );
  const foxfireMat = new PointsMaterial({
    map: spriteTexture,
    color: FOXFIRE_COLOR,
    size: 0.6,
    transparent: true,
    opacity: 0.95,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const foxfire = new Points(foxfireGeo, foxfireMat);
  scene.add(foxfire);

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
      // 鳥居列の左右に分散させて、奥行き方向にも散らす
      const side = i % 2 === 0 ? -1 : 1;
      const depthIndex = Math.floor(i / 2);
      return {
        centerX: side * (1.8 + Math.random() * 0.6),
        centerZ: -3 - depthIndex * 4.5,
        baseY: 0.5 + Math.random() * 1.2,
        radiusX: 0.4 + Math.random() * 0.4,
        radiusZ: 0.3 + Math.random() * 0.3,
        speed: 0.2 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        yAmp: 0.25 + Math.random() * 0.35,
      };
    },
  );

  // ─── 粒子 ─────────────────────────────────────
  const DUST_COUNT = 320;
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

  // ─── Bloom 後処理 ──────────────────────────────
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new Vector2(container.clientWidth, container.clientHeight),
    0.85,
    0.7,
    0.15,
  );
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  // ─── アニメーション ────────────────────────────
  let rafId = 0;
  let running = true;
  const startedAt = performance.now();

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);

    const t = (performance.now() - startedAt) / 1000;

    if (!prefersReducedMotion) {
      // カメラ呼吸: yaw ±0.4°、8s 周期。pitch も控えめに揺らす
      const yaw = Math.sin(t * (Math.PI * 2) / 8) * (0.4 * Math.PI / 180);
      const pitch = Math.sin(t * 0.3) * (0.2 * Math.PI / 180);
      camera.position.x = Math.sin(t * 0.15) * 0.05;
      camera.position.y = 1.5 + Math.sin(t * 0.4) * 0.04;
      camera.lookAt(
        Math.sin(yaw) * 4,
        0.8 + Math.sin(pitch) * 4,
        -10,
      );

      // ミストの横流れ
      mistBand.position.x = Math.sin(t * 0.18) * 1.5;
      mistBandNear.position.x = Math.sin(t * 0.22 + 1.2) * 1.0;

      // 狐火
      const posAttr = foxfire.geometry.getAttribute("position");
      for (let i = 0; i < FOXFIRE_COUNT; i += 1) {
        const p = foxfireParams[i];
        const phase = t * p.speed + p.phase;
        const x = p.centerX + Math.cos(phase) * p.radiusX;
        const z = p.centerZ + Math.sin(phase) * p.radiusZ;
        const y = p.baseY + Math.sin(phase * 0.7) * p.yAmp;
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;

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
    bloomPass.setSize(w, h);
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
    dispose() {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisChange);
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      spriteTexture.dispose();
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
