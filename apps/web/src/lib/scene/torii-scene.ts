/**
 * Login Screen Scene — M4a 雛形
 *
 * Three.js で「月・霧・鳥居」の静的シーンを構築する。
 * シェーダーやパーティクル（狐火・粒子・bloom）は M4b で追加予定。
 *
 * 設計:
 *   - プロシージャル中心、テクスチャは抽象パターンのみ
 *   - 黒（ink-950）の闇に金（gold-100）/朱（vermilion-500）/青白（mist-glow）で点描
 *   - カメラはわずかに breath で揺れる（reduced-motion 時は停止）
 *   - DPR は最大 2 でクランプ（4K render を避ける）
 *   - document.hidden 中は描画停止（バッテリ節約）
 */

import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  WebGLRenderer,
  Fog,
  AdditiveBlending,
} from "three";

const INK_950 = 0x0a0509;
const GOLD_100 = 0xf5e7c4;
const GOLD_500 = 0xb89540;
const VERMILION_500 = 0xb04438;
const VERMILION_700 = 0x621c14;
const MIST_GLOW = 0xb8e0ff;

export interface ToriiScene {
  /** RAF を止めて DOM 要素も外す */
  dispose(): void;
}

export function initToriiScene(container: HTMLElement): ToriiScene {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const scene = new Scene();
  scene.background = new Color(INK_950);
  // 遠方を闇に溶かすフォグ
  scene.fog = new Fog(INK_950, 8, 22);

  // カメラ: 鳥居をやや下から見上げる構図
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

  // ─── 月 ─────────────────────────────────────────
  const moon = (() => {
    const g = new CircleGeometry(1.4, 64);
    const m = new MeshBasicMaterial({
      color: GOLD_100,
      transparent: true,
      opacity: 0.92,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new Mesh(g, m);
    mesh.position.set(-2.4, 5.8, -10);
    return mesh;
  })();
  scene.add(moon);

  // 月の周りのハロー（柔らかい光）
  const moonHalo = (() => {
    const g = new CircleGeometry(2.6, 64);
    const m = new MeshBasicMaterial({
      color: GOLD_500,
      transparent: true,
      opacity: 0.18,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new Mesh(g, m);
    mesh.position.copy(moon.position).setZ(moon.position.z - 0.01);
    return mesh;
  })();
  scene.add(moonHalo);

  // ─── 鳥居 ────────────────────────────────────────
  // 朱の鳥居を BoxGeometry の組み合わせで構成（プロシージャル原則に従う）
  const torii = new Group();
  const toriiMat = new MeshStandardMaterial({
    color: VERMILION_500,
    roughness: 0.6,
    metalness: 0.05,
    emissive: VERMILION_700,
    emissiveIntensity: 0.1,
  });

  // 二本の柱
  const pillarGeo = new BoxGeometry(0.32, 5.6, 0.32);
  const pillarLeft = new Mesh(pillarGeo, toriiMat);
  pillarLeft.position.set(-2.0, 2.8, 0);
  torii.add(pillarLeft);
  const pillarRight = new Mesh(pillarGeo, toriiMat);
  pillarRight.position.set(2.0, 2.8, 0);
  torii.add(pillarRight);

  // 笠木（上の横木、両端が少し跳ね上がる雰囲気は M4b で）
  const kasagi = new Mesh(new BoxGeometry(5.4, 0.42, 0.42), toriiMat);
  kasagi.position.set(0, 5.6, 0);
  torii.add(kasagi);

  // 島木（笠木の下の段）
  const shimaki = new Mesh(new BoxGeometry(5.0, 0.22, 0.32), toriiMat);
  shimaki.position.set(0, 5.25, 0);
  torii.add(shimaki);

  // 貫（中ほどの横木）
  const nuki = new Mesh(new BoxGeometry(4.6, 0.22, 0.22), toriiMat);
  nuki.position.set(0, 4.0, 0);
  torii.add(nuki);

  // 額束（中央の小柱）
  const gakuzuka = new Mesh(new BoxGeometry(0.32, 0.85, 0.22), toriiMat);
  gakuzuka.position.set(0, 4.6, 0);
  torii.add(gakuzuka);

  scene.add(torii);

  // ─── 地面（薄い霧の層を強調するための板） ──────
  const ground = (() => {
    const g = new PlaneGeometry(40, 40);
    const m = new MeshBasicMaterial({ color: INK_950, side: DoubleSide });
    const mesh = new Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    return mesh;
  })();
  scene.add(ground);

  // 地面の上に浮く青白いミスト帯（plane）
  const mistBand = (() => {
    const g = new PlaneGeometry(30, 1.6);
    const m = new MeshBasicMaterial({
      color: MIST_GLOW,
      transparent: true,
      opacity: 0.08,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new Mesh(g, m);
    mesh.position.set(0, 0.7, -2);
    return mesh;
  })();
  scene.add(mistBand);

  // ─── ライト ──────────────────────────────────────
  scene.add(new AmbientLight(0x1f1219, 0.6));

  const moonLight = new PointLight(GOLD_100, 1.4, 30, 1.4);
  moonLight.position.copy(moon.position);
  scene.add(moonLight);

  const rimLight = new PointLight(MIST_GLOW, 0.6, 16, 2);
  rimLight.position.set(0, 3, -6);
  scene.add(rimLight);

  // ─── アニメーション ─────────────────────────────
  let rafId = 0;
  let running = true;
  const startedAt = performance.now();

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);

    if (!prefersReducedMotion) {
      const t = (performance.now() - startedAt) / 1000;
      // 呼吸のような微細な揺れ
      camera.position.y = 1.6 + Math.sin(t * 0.4) * 0.06;
      camera.position.x = Math.sin(t * 0.15) * 0.08;
      camera.lookAt(0, 2.4, 0);

      // ミスト帯がゆっくり横に流れる
      mistBand.position.x = Math.sin(t * 0.18) * 1.2;
    }

    renderer.render(scene, camera);
  }
  animate();

  // ─── リサイズ ────────────────────────────────────
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  window.addEventListener("resize", onResize);

  // ─── タブ非アクティブ時は止める ──────────────────
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
      renderer.dispose();
      renderer.domElement.remove();
      // ジオメトリ・マテリアルの解放
      scene.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    },
  };
}
