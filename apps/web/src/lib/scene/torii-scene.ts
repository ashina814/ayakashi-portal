/**
 * Login Screen Scene
 *
 * Three.js で「月・霧・鳥居」の夜景に
 *   - 狐火（kitsune-bi）：鳥居の根元を漂う青白い火の玉群
 *   - 粒子（dust）：空気感を作る微細な粒
 *   - bloom：月・狐火・御札の輪郭を滲ませる UnrealBloomPass
 * を載せた M4b 版。
 *
 * 設計:
 *   - プロシージャル中心、テクスチャは canvas で動的生成
 *   - 黒（ink-950）の闇に金（gold-100）/朱（vermilion-500）/青白（mist-glow）で点描
 *   - カメラはわずかに breath で揺れる（reduced-motion 時は停止）
 *   - DPR は最大 2 でクランプ（4K render を避ける）
 *   - document.hidden 中は描画停止（バッテリ節約）
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
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const INK_950 = 0x0a0509;
const GOLD_100 = 0xf5e7c4;
const GOLD_500 = 0xb89540;
const VERMILION_500 = 0xb04438;
const VERMILION_700 = 0x621c14;
const MIST_GLOW = 0xb8e0ff;
const FOXFIRE_COLOR = 0x9be0ff; // 狐火の青白い色

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

export function initToriiScene(container: HTMLElement): ToriiScene {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const scene = new Scene();
  scene.background = new Color(INK_950);
  scene.fog = new Fog(INK_950, 8, 22);

  const camera = new PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.6, 9);
  camera.lookAt(0, 2.4, 0);

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
    new CircleGeometry(1.4, 64),
    new MeshBasicMaterial({
      color: GOLD_100,
      transparent: true,
      opacity: 0.92,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  moon.position.set(-2.4, 5.8, -10);
  scene.add(moon);

  const moonHalo = new Mesh(
    new CircleGeometry(2.6, 64),
    new MeshBasicMaterial({
      color: GOLD_500,
      transparent: true,
      opacity: 0.18,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  moonHalo.position.copy(moon.position).setZ(moon.position.z - 0.01);
  scene.add(moonHalo);

  // ─── 鳥居 ─────────────────────────────────────
  const torii = new Group();
  const toriiMat = new MeshStandardMaterial({
    color: VERMILION_500,
    roughness: 0.6,
    metalness: 0.05,
    emissive: VERMILION_700,
    emissiveIntensity: 0.1,
  });

  const pillarGeo = new BoxGeometry(0.32, 5.6, 0.32);
  const pillarLeft = new Mesh(pillarGeo, toriiMat);
  pillarLeft.position.set(-2.0, 2.8, 0);
  torii.add(pillarLeft);
  const pillarRight = new Mesh(pillarGeo, toriiMat);
  pillarRight.position.set(2.0, 2.8, 0);
  torii.add(pillarRight);

  const kasagi = new Mesh(new BoxGeometry(5.4, 0.42, 0.42), toriiMat);
  kasagi.position.set(0, 5.6, 0);
  torii.add(kasagi);
  const shimaki = new Mesh(new BoxGeometry(5.0, 0.22, 0.32), toriiMat);
  shimaki.position.set(0, 5.25, 0);
  torii.add(shimaki);
  const nuki = new Mesh(new BoxGeometry(4.6, 0.22, 0.22), toriiMat);
  nuki.position.set(0, 4.0, 0);
  torii.add(nuki);
  const gakuzuka = new Mesh(new BoxGeometry(0.32, 0.85, 0.22), toriiMat);
  gakuzuka.position.set(0, 4.6, 0);
  torii.add(gakuzuka);

  scene.add(torii);

  // ─── 地面 & ミスト ────────────────────────────
  const ground = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshBasicMaterial({ color: INK_950, side: DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const mistBand = new Mesh(
    new PlaneGeometry(30, 1.6),
    new MeshBasicMaterial({
      color: MIST_GLOW,
      transparent: true,
      opacity: 0.08,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  mistBand.position.set(0, 0.7, -2);
  scene.add(mistBand);

  // ─── ライト ───────────────────────────────────
  scene.add(new AmbientLight(0x1f1219, 0.6));
  const moonLight = new PointLight(GOLD_100, 1.4, 30, 1.4);
  moonLight.position.copy(moon.position);
  scene.add(moonLight);
  const rimLight = new PointLight(MIST_GLOW, 0.6, 16, 2);
  rimLight.position.set(0, 3, -6);
  scene.add(rimLight);

  // ─── 狐火 (kitsune-bi) ─────────────────────────
  // 8体、鳥居の根元を中心に螺旋を描いて漂う。
  const FOXFIRE_COUNT = 8;
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
    size: 0.7,
    transparent: true,
    opacity: 0.95,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const foxfire = new Points(foxfireGeo, foxfireMat);
  scene.add(foxfire);

  // 各狐火に螺旋パラメータを割り当てる
  interface FoxfireParam {
    centerX: number;
    centerZ: number;
    baseY: number;
    radius: number;
    speed: number;
    phase: number;
    yAmp: number;
  }
  const foxfireParams: FoxfireParam[] = Array.from({ length: FOXFIRE_COUNT }, (_, i) => {
    // 鳥居の柱の根元 2 ヶ所に寄せて配置
    const side = i % 2 === 0 ? -1 : 1;
    return {
      centerX: side * 2.0 + (Math.random() - 0.5) * 0.4,
      centerZ: (Math.random() - 0.5) * 1.2,
      baseY: 0.6 + Math.random() * 1.4,
      radius: 0.3 + Math.random() * 0.4,
      speed: 0.25 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
      yAmp: 0.3 + Math.random() * 0.4,
    };
  });

  // ─── 粒子 (dust) ────────────────────────────────
  // 空間にうっすらと浮く塵。bloom の餌にもなる。
  const DUST_COUNT = 280;
  const dustGeo = new BufferGeometry();
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i += 1) {
    dustPositions[i * 3 + 0] = (Math.random() - 0.5) * 16;
    dustPositions[i * 3 + 1] = Math.random() * 7;
    dustPositions[i * 3 + 2] = -8 + Math.random() * 12;
  }
  dustGeo.setAttribute(
    "position",
    new Float32BufferAttribute(dustPositions, 3),
  );
  const dustMat = new PointsMaterial({
    map: spriteTexture,
    color: 0xe8d8a8,
    size: 0.08,
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new Points(dustGeo, dustMat);
  scene.add(dust);

  // ─── Bloom ─────────────────────────────────────
  // UnrealBloomPass で明るい部位（月・狐火）を滲ませる。
  // strength を強めに、threshold を低く取って暗部にも僅かに光が乗るようにする。
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new Vector2(container.clientWidth, container.clientHeight),
    0.85, // strength
    0.7,  // radius
    0.15, // threshold (低めにして暗部も少し滲ませる)
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
  const tmpVec = new Vector3();

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);

    const t = (performance.now() - startedAt) / 1000;

    if (!prefersReducedMotion) {
      camera.position.y = 1.6 + Math.sin(t * 0.4) * 0.06;
      camera.position.x = Math.sin(t * 0.15) * 0.08;
      camera.lookAt(0, 2.4, 0);

      mistBand.position.x = Math.sin(t * 0.18) * 1.2;

      // 狐火の位置を更新
      const posAttr = foxfire.geometry.getAttribute("position");
      for (let i = 0; i < FOXFIRE_COUNT; i += 1) {
        const p = foxfireParams[i];
        const phase = t * p.speed + p.phase;
        const x = p.centerX + Math.cos(phase) * p.radius;
        const z = p.centerZ + Math.sin(phase) * p.radius;
        const y = p.baseY + Math.sin(phase * 0.7) * p.yAmp;
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;

      // 粒子のゆっくり浮上
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
