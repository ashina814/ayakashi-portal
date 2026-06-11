/* ───────────────────────── LUXEL — interaction & scene JS ───────────────────────── */

// ─── starfield: scatter twinkling stars ─────────────
(function buildStarfield() {
  const field = document.getElementById("starfield");
  if (!field) return;
  const COUNT = 180;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < COUNT; i++) {
    const s = document.createElement("div");
    s.className = "star";
    const size = Math.random() < 0.85 ? (0.8 + Math.random() * 1.4) : (2 + Math.random() * 1.8);
    const base = 0.25 + Math.random() * 0.6;
    s.style.cssText = `
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      width:${size}px; height:${size}px;
      --base:${base.toFixed(2)};
      --tw:${(3 + Math.random() * 5).toFixed(1)}s;
      --td:${(-Math.random() * 6).toFixed(1)}s;`;
    if (Math.random() < 0.06) s.style.background = "var(--warm-200)";
    frag.appendChild(s);
  }
  field.appendChild(frag);
})();

// ─── stardust motes (rising) ─────────────
const dustContainer = document.getElementById("stardust-container");
const DUST_COUNT = 26;
if (dustContainer) {
  for (let i = 0; i < DUST_COUNT; i++) {
    const f = document.createElement("div");
    f.className = "stardust";
    const dur = 6 + Math.random() * 5;
    f.style.cssText = `
      left:${Math.random() * 100}%;
      top:${35 + Math.random() * 60}%;
      width:${(2 + Math.random() * 3).toFixed(1)}px;
      height:${(2 + Math.random() * 3).toFixed(1)}px;
      --dur:${dur.toFixed(1)}s;
      --delay:${(-Math.random() * dur).toFixed(1)}s;
      --sway:${((Math.random() - 0.5) * 70).toFixed(0)}px;`;
    dustContainer.appendChild(f);
  }
}

// ─── refs ─────────────
const stage = document.getElementById("stage");
const flash = document.getElementById("flash");
const medallion = document.getElementById("medallion");

// ─── converge stardust into the medallion on click ─────────────
function convergeStardust() {
  const r = medallion.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  document.querySelectorAll(".stardust").forEach((f) => {
    const fr = f.getBoundingClientRect();
    const dx = cx - (fr.left + fr.width / 2);
    const dy = cy - (fr.top + fr.height / 2);
    f.style.animation = "none";
    f.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 0.9 },
        { transform: `translate(${dx * 0.9}px, ${dy * 0.9}px) scale(2.2)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 400, delay: Math.random() * 250,
        easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" }
    );
  });
}

// ─── ENTER sequence ─────────────
let entering = false;
function enter() {
  if (entering) return;
  entering = true;

  const worldStar = document.querySelector(".world-star");
  const kimeBloom = document.getElementById("kimeBloom");

  // 0.0s — core collapses → rebounds → blooms
  worldStar.classList.add("is-awakening");
  if (!muted) playChime();

  // 0.30s — stardust converges + medallion fades
  setTimeout(() => {
    convergeStardust();
    medallion.classList.add("is-vanishing");
  }, 300);

  // 0.55s — rebound thump
  setTimeout(() => { if (!muted) playThump(); }, 520);

  // 0.7s — surrounding world recedes
  setTimeout(() => stage.classList.add("is-fading-out"), 700);

  // 2.0s — kime bloom + white flash
  setTimeout(() => {
    kimeBloom.classList.add("active");
    flash.classList.add("active");
    if (!muted) playKime();
  }, 2000);

  // 4.2s — reset (prod: window.location.href = "/api/auth/discord")
  setTimeout(() => {
    entering = false;
    medallion.classList.remove("is-vanishing");
    stage.classList.remove("is-fading-out");
    worldStar.classList.remove("is-awakening");
    kimeBloom.classList.remove("active");
    flash.classList.remove("active");
    document.querySelectorAll(".stardust").forEach((f) => {
      f.getAnimations().forEach((a) => a.cancel());
      f.style.animation = "";
    });
  }, 4200);
}

// ─── audio engine (Web Audio API) — star chimes ─────────────
let audioCtx = null;
let masterGain = null;
let ambient = null;
let muted = localStorage.getItem("luxel-muted") !== "0";

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = muted ? 0 : 0.55;
  masterGain.connect(audioCtx.destination);
}
function ensureAudio() {
  initAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

// glassy star chime — bright sine harmonics, long decay
function playChime() {
  ensureAudio();
  const now = audioCtx.currentTime;
  const fund = 1046.5; // C6
  const harmonics = [
    { f: fund,        g: 0.5,  d: 2.4 },
    { f: fund * 1.5,  g: 0.3,  d: 1.8 },
    { f: fund * 2.0,  g: 0.22, d: 1.4 },
    { f: fund * 3.0,  g: 0.12, d: 1.0 },
    { f: fund * 4.0,  g: 0.07, d: 0.7 },
  ];
  harmonics.forEach((h, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = h.f;
    const g = audioCtx.createGain();
    const t = now + i * 0.012;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(h.g * 0.35, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + h.d);
    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + h.d + 0.1);
  });
}

// soft shimmer on hover
function playShimmer() {
  ensureAudio();
  const now = audioCtx.currentTime;
  [1568, 2093, 3136].forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = audioCtx.createGain();
    const t = now + i * 0.04;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + 1.0);
  });
}

// rebound thump — low sine sweep
function playThump() {
  ensureAudio();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.55, now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0005, now + 1.4);
  osc.connect(g).connect(masterGain);
  osc.start(now);
  osc.stop(now + 1.5);
}

// kime — sub-rumble + radiant bell shimmer
function playKime() {
  ensureAudio();
  const now = audioCtx.currentTime;
  // sub-bass swell
  {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(44, now);
    osc.frequency.linearRampToValueAtTime(74, now + 1.6);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.45, now + 1.4);
    g.gain.linearRampToValueAtTime(0.55, now + 1.9);
    g.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
    osc.connect(g).connect(masterGain);
    osc.start(now); osc.stop(now + 3.1);
  }
  // radiant bell shimmer (staggered)
  const bellStart = now + 1.2;
  [
    { f: 1318.5, g: 0.30, d: 3.6 }, // E6
    { f: 1760,   g: 0.22, d: 3.0 }, // A6
    { f: 2637,   g: 0.16, d: 2.4 },
    { f: 3520,   g: 0.10, d: 2.0 },
    { f: 5274,   g: 0.06, d: 1.4 },
  ].forEach((h, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = h.f;
    const g = audioCtx.createGain();
    const t = bellStart + i * 0.025;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(h.g * 0.30, t + 0.18);
    g.gain.linearRampToValueAtTime(h.g * 0.40, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0005, t + h.d);
    osc.connect(g).connect(masterGain);
    osc.start(t); osc.stop(t + h.d + 0.1);
  });
}

// ambient — airy detuned drone
function startAmbient() {
  if (ambient) return;
  ensureAudio();
  const make = (freq) => { const o = audioCtx.createOscillator(); o.type = "sine"; o.frequency.value = freq; return o; };
  const osc1 = make(98);
  const osc2 = make(99.5);
  const osc3 = make(294);
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 1.1;
  const g = audioCtx.createGain();
  g.gain.value = 0.07;
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoG = audioCtx.createGain();
  lfoG.gain.value = 0.035;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  osc1.connect(filter); osc2.connect(filter); osc3.connect(filter);
  filter.connect(g).connect(masterGain);
  osc1.start(); osc2.start(); osc3.start(); lfo.start();
  ambient = { osc1, osc2, osc3, lfo, g };
}

function setMuted(m) {
  muted = m;
  if (masterGain && audioCtx) {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.linearRampToValueAtTime(m ? 0 : 0.55, now + 0.6);
  }
  localStorage.setItem("luxel-muted", m ? "1" : "0");
  document.getElementById("mute").textContent = m ? "♪ MUTE" : "♪ ON";
}

const muteBtn = document.getElementById("mute");
muteBtn.addEventListener("click", () => {
  const next = !muted;
  setMuted(next);
  if (!next) { ensureAudio(); startAmbient(); }
});
muteBtn.textContent = muted ? "♪ MUTE" : "♪ ON";

// medallion hover shimmer (debounced)
let lastShimmer = 0;
medallion.addEventListener("mouseenter", () => {
  if (muted) return;
  const now = Date.now();
  if (now - lastShimmer < 400) return;
  lastShimmer = now;
  playShimmer();
});

// ─── parallax + cursor halo ─────────────
const worldStar = document.getElementById("worldStar");
const starfield = document.getElementById("starfield");
const cursorHalo = document.getElementById("cursorHalo");
let targetX = 0, targetY = 0, curX = 0, curY = 0;
let haloX = 0, haloY = 0, haloTX = 0, haloTY = 0;

window.addEventListener("mousemove", (e) => {
  targetX = (e.clientX / window.innerWidth - 0.5) * 2;
  targetY = (e.clientY / window.innerHeight - 0.5) * 2;
  haloTX = e.clientX; haloTY = e.clientY;
  cursorHalo.classList.add("visible");
  const r = medallion.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  cursorHalo.classList.toggle("is-near", Math.hypot(e.clientX - cx, e.clientY - cy) < 200);
});
window.addEventListener("mouseleave", () => cursorHalo.classList.remove("visible"));

function tick() {
  curX += (targetX - curX) * 0.06;
  curY += (targetY - curY) * 0.06;
  haloX += (haloTX - haloX) * 0.18;
  haloY += (haloTY - haloY) * 0.18;
  if (worldStar) worldStar.style.transform = `translate(${-curX * 16}px, ${-curY * 12}px)`;
  if (starfield) starfield.style.transform = `translate(${curX * 8}px, ${curY * 6}px)`;
  cursorHalo.style.transform = `translate(${haloX}px, ${haloY}px) translate(-50%, -50%)`;
  requestAnimationFrame(tick);
}
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(tick);

// ─── moon phase (computed from date) ─────────────
const PHASE_NAMES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
];
function moonPhase(date) {
  // approximate synodic phase 0..1 from a known new moon (2000-01-06)
  const synodic = 29.53058867;
  const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
  const now = date.getTime() / 86400000;
  let age = ((now - ref) % synodic + synodic) % synodic;
  return age / synodic; // 0..1
}
function renderMoon() {
  const p = moonPhase(new Date());        // 0..1
  const idx = Math.round(p * 8) % 8;
  document.getElementById("moonPhase").textContent = PHASE_NAMES[idx];
  // shadow offset: illuminate based on phase
  const shadow = document.getElementById("moonShadow");
  const illum = 1 - Math.abs(0.5 - p) * 2; // 0 at new, 1 at full
  const waxing = p < 0.5;
  // simple crescent via inset box-shadow-ish offset
  const off = (1 - illum) * 26;
  shadow.style.transform = `translateX(${waxing ? off : -off}px)`;
  shadow.style.opacity = (1 - illum * 0.92).toFixed(2);
}
renderMoon();
setInterval(renderMoon, 60 * 60 * 1000);

// ─── wire interactions ─────────────
medallion.addEventListener("click", enter);
medallion.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enter(); }
});
document.getElementById("skip").addEventListener("click", (e) => { e.preventDefault(); enter(); });
