# Handoff: LUXEL — Login / Sign-in Screen

## Overview
LUXEL is a Discord-gated login screen for a community server with a **celestial / starlit fantasy** theme ("星の幻想ファンタジー"). The screen presents a single radiant star (a North-Star "light core") cradling the server wordmark, with an engraved **astrolabe medallion** as the primary call-to-action. Clicking the medallion ("ENTER") plays a cinematic sequence — the star collapses, rebounds, then blooms into light that fills the screen — before redirecting to Discord OAuth.

The design intent: *"in darkness, a single light" (lumen in tenebris)*. Deep ultramarine night sky, a precise astronomical-instrument visual language, and a movie-like "the world grows and is enveloped in light" transition on sign-in.

## About the Design Files
The files in `prototype/` are **design references created in HTML/CSS/JS** — a prototype showing the intended look and behavior. They are **not production code to ship directly**. The task is to **recreate this design in the target codebase's existing environment** (the production stack is **Astro** per the original project intent — but use whatever the repo actually uses: React, Vue, Svelte, Astro components, etc.) following its established patterns, component structure, and conventions.

The HTML prototype hand-rolls everything in vanilla JS + two CSS files + Web Audio. In production you'll likely want to break the scene into components and decide which decorative layers are worth the DOM/paint cost (see **Performance Notes**).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, layered effects, and interaction timing are all defined here and in the prototype CSS. Recreate the UI to match. The one thing that is *placeholder-grade* is the OAuth redirect target — wire it to the real Discord auth endpoint.

---

## Screens / Views

### Screen: LUXEL Login (single screen)
- **Name**: LUXEL Login
- **Purpose**: The user signs in to the server via Discord. There is exactly one primary action (the medallion) plus a "skip the light" text link that performs the same action without dwelling, and a mute toggle.
- **Layout**: Full-viewport fixed stage (`position: fixed; inset: 0; overflow: hidden`), everything absolutely positioned and centered on a vertical axis. Background → midground → foreground stacking. Design reference resolution is a standard desktop viewport (~1600×900 / 1920×1080); the scene is responsive via `clamp()` and viewport units, not a fixed canvas.

**Vertical composition (top → bottom, centered):**
1. Wordmark block `LUXEL` + motto, near top (`top: 58px`)
2. The radiant star core, raised above center (`margin-top: -13vh` from the flex-centered position)
3. The astrolabe medallion CTA, lower third (`bottom: 8.5%`)
4. "Sign in with Discord" hint row directly under the medallion

**Corner elements (one per corner, balanced):**
- Top-left: faint coordinate readout `R.A 18ʰ 36ᵐ · LUXEL`
- Top-right: `skip the light →` link
- Bottom-left: current **moon phase** indicator (computed from date)
- Bottom-right: `♪ MUTE` / `♪ ON` audio toggle

**Decorative framing**: thin L-shaped corner marks inset `26px 30px`, plus a faint labeled constellation (`VELA · α–ι`) upper-right.

---

## Components

### 1. Server Wordmark (`.header`)
- Position: absolute, `top: 58px`, horizontally centered (`left: 50%; transform: translateX(-50%)`).
- Stack (column, `gap: 16px`, centered): thin rule → `H1 LUXEL` → shorter rule → italic motto.
- **H1 "LUXEL"**: font `Cinzel`, weight 600, `font-size: 52px`, `letter-spacing: 0.42em` (with matching `padding-left: 0.42em` to keep optical centering), color `#eef4ff`. Text-shadow: `0 0 30px rgba(122,162,255,0.55), 0 0 70px rgba(77,119,230,0.30)`.
- **Rules**: 1px tall gradient lines `linear-gradient(90deg, transparent, #7aa2ff 50%, transparent)`. Upper rule `120px` wide; lower rule `64px` wide at `opacity: 0.7`.
- **Motto** (`.sub`): text `lumen in tenebris`, font `Cormorant Garamond` italic, `15px`, `letter-spacing: 0.42em`, color `#8ea2c6`, `white-space: nowrap`.
- Entrance: fade + de-blur + 8px rise, `2s` duration, `1.5s` delay.

### 2. Radiant Star Core (`.world-star` > `.core`)
The hero. A layered point-source star. Size `clamp(250px, 39vh, 440px)` square. Sits in a flex-centered `.world-star` lifted with `margin-top: -13vh`. Gentle "breathing": `coreBreath 11s ease-in-out infinite` (scale 1 → 1.045, brightness 1 → 1.14).

Layers, back to front:
- **`.rays.fine`** and **`.rays.coarse`** — two `repeating-conic-gradient` spoke bursts (very low alpha, `rgba(200,218,255,0.05)` / `rgba(215,227,255,0.07)`), masked to an annulus, slowly counter-rotating (`120s` / `200s`).
- **`.halo`** — multi-stop radial gradient (8 stops to avoid banding) from `rgba(238,244,255,0.95)` core to transparent at 68%. Pulses `haloPulse 7s` (opacity/scale).
- **`.corona-tex`** — static SVG `feTurbulence` (fractalNoise, baseFrequency `0.024`, 3 octaves) tinted blue-white, masked to a ring, `mix-blend-mode: screen`, slow churn `18s`. This is what kills the "cheap smooth blob" look up close.
- **`.ghosts` .ghost g1–g4** — four small radial-gradient lens-flare ghosts along the diagonal axis; one is warm (`rgba(255,230,194,0.40)`) for subtle color interest.
- **`.spikes` .spike** — diffraction spikes: primary cross (`h` 168% wide, `v` 142%, both `2.2px`, with `box-shadow: 0 0 8px rgba(185,208,255,0.55)`), diagonal pair (`d1/d2`, 104%, 1.5px, opacity 0.55), and four fine secondaries (`s1–s4` at ±22° / ±68°, opacity 0.26–0.3). All are tapered gradient bars. Shimmer `spikeShimmer 6s`.
- **`.rim`** — thin chromatic ring at 27% size, `box-shadow` rings + inset glow, `rimPulse 7s`.
- **`.nucleus`** — bright center, 16% size, white→blue radial with `box-shadow: 0 0 60px 18px rgba(215,227,255,0.55), 0 0 130px 40px rgba(122,162,255,0.30)`.

### 3. Armillary Ring (`.orbit-ring.r1`, `.r2`)
Two concentric instrument rings centered on the core (NOT on the medallion).
- `.r1`: `clamp(360px, 54vh, 600px)`, 1px border `rgba(122,162,255,0.14)`. `::after` = inner hairline inset 7px at `rgba(122,162,255,0.07)`. `::before` = masked `repeating-conic-gradient` producing faint degree ticks every 7.5°.
- `.r2`: `clamp(540px, 82vh, 940px)`, fainter border `rgba(122,162,255,0.05)`.
- Each carries one orbiting `.planet` dot (5px, glowing `#b9d0ff`) on a `.orbit-spin` wrapper (`90s` forward / `140s` reverse via `.rev`).

### 4. Astrolabe Medallion CTA (`.medallion`) — the primary button
A `<button>` rendered as an engraved astrolabe SVG (`viewBox 0 0 168 168`, displayed at `168×168`). **The SVG is generated programmatically** in the prototype; reproduce the engraving with these elements (all coords in the 168-unit space, center `84,84`):
- **Bezel**: outer ring `r=81` stroked with vertical gradient `#cdddff → #5878c8 → #1b285e` (`stroke-width 2.4`); plate `r=78` filled radial `#1a2858 → #101a40 → #070c20`; two thin guide circles (`r=75`, `r=58`).
- **Degree ring**: 120 ticks every 3° from `r≈66.5–70.5` out to `r=74`; majors every 30° brighter/thicker (`#9fbcff`, opacity 0.65), minors `#7aa2ff` opacity 0.3.
- **Constellation band** (`.ring-rot`, rotates): 12 small drawn 4-point stars at `r=60`, every 30° (offset 15°), color `#b9d0ff`, every 3rd one larger. **Important:** these are *drawn paths*, NOT Unicode zodiac glyphs — an earlier version used `♈♉…` and they rendered as tofu boxes because the serif webfont lacks those code points. Keep them as SVG paths.
- **Tympanum**: 5 concentric circles `r=54,45,36,27,18` (`#2f47a8`, descending opacity), one eccentric ecliptic circle (`cx84 cy70 r22`, `#7aa2ff`), and a faint crosshair.
- **Rete** (`.ring-rot.rev`, counter-rotates): 6 flame-shaped star-pointers (quadratic-curve teardrops) with `#d7e3ff` tip dots, placed to **leave the bottom clear** for the label; plus a `r=50` ring.
- **Center star**: soft radial glow (`r=14`, white→`#9fbcff`) + a layered 4-point star (outer `#eef4ff`, inner `#ffffff`, 2.5px white dot) at `84,78`.
- **Label "ENTER"**: on a `<textPath>` along a lower-bezel arc (`r=60.5`), `text-anchor: middle`, `startOffset: 51.6%` (nudged right of 50% to compensate for trailing letter-spacing pulling glyphs left), font `Cinzel` 600, `font-size 11`, `letter-spacing 3`, fill `#eef4ff`. A dark stroked arc (`#070c20`, width 13) sits behind the text for legibility.

**Motion / states:**
- Idle float lives on a **wrapper** `.med-float` (`medFloat 5.5s ease-in-out infinite`, translateY 0 → -7px) so it never fights the hover transform.
- The button itself: base `transform: scale(1)`, `transition: filter 0.55s, transform 0.55s` both `cubic-bezier(0.22,1,0.36,1)`, `will-change: transform, filter`.
- **Hover**: `transform: scale(1.045)` + stronger glow `drop-shadow(0 0 40px rgba(122,162,255,0.6)) drop-shadow(0 0 16px rgba(238,244,255,0.5))`. (Do **not** animate by changing `animation-duration` of the inner rotations — that was the original source of hover jank.)
- **Active**: `scale(1.015)`, `transition-duration: 0.18s`.
- **Focus-visible**: `2px solid #7aa2ff` outline, `8px` offset, circular.

### 5. Discord Hint Row (`.medallion-hint`)
Under the medallion, `gap: 18px` from it. Flex row, `gap: 10px`, `white-space: nowrap`: a 16px Discord glyph (inline SVG, fill `#8ea2c6`) + text `Sign in with Discord`, `Cormorant Garamond` italic 14px, `letter-spacing: 0.22em`, `#8ea2c6`, opacity 0.85.

### 6. Corner Frame (`.frame`) + Coordinate Labels
- `.frame` inset `26px 30px`. Four `.fm` L-marks (`22×22px`, 1px `rgba(159,188,255,0.28)`, each showing only two adjacent borders).
- `.coord.c-tl`: `R.A 18ʰ 36ᵐ · LUXEL`, `JetBrains Mono` 9px, `letter-spacing 0.22em`, `rgba(159,188,255,0.32)`.
- Fade in `2.4s` at `2.8s` delay.

### 7. Constellation (`.constellation`)
Upper-right, `top: 11%; right: 7.5%`, `210×178px`. SVG polyline + star dots (a Cassiopeia-like "W") in `rgba(159,188,255,0.30)` / `#cdddff`, with a mono label `VELA · α–ι`. De-blur fade in at `3.2s`.

### 8. Chrome
- **`.chrome-skip`** ("skip the light →"): top-right `30px / 36px`, `Cormorant Garamond` italic 16px, `rgba(215,227,255,0.5)` → `#eef4ff` on hover. Triggers the same enter sequence.
- **`.chrome-mute`** (`♪ MUTE` / `♪ ON`): bottom-right `26px / 36px`, bordered pill, `JetBrains Mono` 10px. Toggles audio; state persisted in `localStorage["luxel-muted"]` (`"1"` = muted, default muted until user opts in).
- **`.sky-mark`**: bottom-left `28px / 36px`. A 26px moon disc whose shadow offset is computed from the real lunar phase (synodic age from a 2000-01-06 reference new moon), plus phase name (`Cinzel` 13px) and meta `LUXEL · v0.1.0` (`JetBrains Mono` 10px).

---

## Interactions & Behavior

### Idle ambient (always running)
- Starfield: ~180 twinkling dots (random size/opacity/delay), ~6% tinted warm.
- ~26 rising "stardust" motes (`dustRise`, 6–11s loops).
- Nebula drift, milky-way band, light-scan sweep, film grain.
- Parallax: on `mousemove`, `.world-star` translates up to ±16/±12px and `.starfield` ±8/±6px (opposite), eased each frame (lerp factor 0.06) in a `requestAnimationFrame` loop.
- Cursor halo: a soft 60px radial follows the cursor (lerp 0.18); grows to 130px and brightens within 200px of the medallion center (`.is-near`).
- All ambient motion is gated off under `prefers-reduced-motion: reduce`.

### The ENTER sequence (`enter()`) — cinematic, ~4.2s
Triggered by clicking `.medallion`, pressing Enter/Space on it, or clicking "skip the light". Guarded by an `entering` flag (ignores re-entry). Timeline:

| t (ms) | Event |
|---|---|
| 0 | `.world-star` gets `.is-awakening` → `coreAwaken 3.2s`: **collapse** (scale→0.6, dim) → brief **hold** → **rebound flash** (scale 1.12, brightness 2.4) → **bloom** (scale → 4.6, brightness → 4, huge white drop-shadow). Nucleus blazes to full white. Star chime plays (if unmuted). |
| 300 | Stardust **converges** into the medallion (Web Animations API, per-mote toward medallion center); medallion gets `.is-vanishing` (fades out, 1.0s). |
| ~520 | Low rebound "thump" (sub sine sweep 90→30Hz). |
| 700 | `.stage` gets `.is-fading-out` → surrounding world recedes (brightness→0.32, blur 3px), while the awakening star is exempted so it keeps blazing. |
| 2000 | `.kime-bloom` + `.flash` activate: radial white bloom scales 0.15→3.0 over 2.4s; full-screen `#eef4ff` flash ramps to opacity 1. "Kime" audio (sub-bass swell + staggered radiant bell shimmer). |
| 4200 | **Reset** all classes/animations (prototype only). **In production, replace this reset with the redirect:** `window.location.href = "/api/auth/discord"` (or your OAuth start URL). Fire it around the peak of the white flash (~t=2600–3200ms) so the navigation happens under cover of full white. |

### Audio (Web Audio API, all synthesized — no audio files)
- Master gain `0.55` (or 0 when muted), 0.6s ramp on toggle.
- `playChime` — C6 fundamental + harmonics, glassy sine bells, long decay (on ENTER and as the core blooms).
- `playShimmer` — light triad on medallion hover (debounced 400ms; only if unmuted).
- `playThump` — rebound sub.
- `playKime` — climax: sub-bass swell + radiant bell stack.
- `startAmbient` — airy detuned drone (two ~98–99.5Hz sines + 294Hz through a lowpass, slow LFO on gain), started when the user un-mutes.
- Browsers block audio until a user gesture: the context is created/resumed on first interaction (`ensureAudio`). Default state is **muted**; user opts in via the toggle.

---

## State Management
Minimal — this is a presentational screen.
- `entering: boolean` — guards the ENTER sequence against double-fire.
- `muted: boolean` — persisted to `localStorage["luxel-muted"]`.
- Audio graph singletons (`audioCtx`, `masterGain`, `ambient`) created lazily.
- Parallax/halo target-vs-current values driven by a rAF loop.
- Moon phase derived from `new Date()` (recomputed hourly via `setInterval`).
- **Data fetching**: none on this screen. The only "backend" touchpoint is the OAuth redirect on ENTER.

---

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| `--void-950` | `#04060f` | deepest background / vignette |
| `--void-900` | `#070b1e` | base night sky |
| `--void-850` | `#0a1026` | moon shadow |
| `--void-800` | `#0c1330` | — |
| `--indigo-800` | `#14215a` | sky wash |
| `--indigo-700` | `#1b2a6b` | — |
| `--indigo-500` | `#2f47a8` | instrument lines / engraving |
| `--star-500` | `#4d77e6` | mid accents |
| `--star-400` | `#7aa2ff` | **primary star blue** (rules, ticks, focus) |
| `--star-300` | `#9fbcff` | brighter marks |
| `--star-200` | `#b9d0ff` | glints, planets |
| `--star-100` | `#d7e3ff` | bright detail / body text on dark |
| `--star-050` | `#eef4ff` | near-white (wordmark, label) |
| `--warm-200` | `#ffe6c2` | rare warm star / one lens ghost |
| `--silver-500` | `#8ea2c6` | muted captions (motto, hint) |
| `--silver-700` | `#5a6c91` | faintest text |

### Typography
- **Display / structural**: `Cinzel` (600) — wordmark, ENTER label, moon phase. Wide tracking (0.42em on the wordmark).
- **Body / lyrical**: `Cormorant Garamond` (400/500, italic) — motto, Discord hint, skip link.
- **Mono / technical**: `JetBrains Mono` (400/500) — coordinates, meta, mute toggle. Small (9–10px), tracked 0.2em.
- Loaded from Google Fonts in the prototype: `Cinzel:400,500,600,700`, `Cormorant Garamond:ital,wght`, `JetBrains Mono:400,500`.

### Spacing / sizing
- Stage: full viewport, fixed.
- Core: `clamp(250px, 39vh, 440px)`; world-star lifted `-13vh`.
- Rings: `clamp(360px, 54vh, 600px)` and `clamp(540px, 82vh, 940px)`.
- Medallion: `168×168px`.
- Corner inset: `26px 30px`; chrome inset `~26–58px` from edges.

### Motion / easing
- Primary easing: `cubic-bezier(0.22, 1, 0.36, 1)` (entrances, hover).
- Core awaken: `cubic-bezier(0.5, 0, 0.25, 1)` over 3.2s.
- Kime bloom: `cubic-bezier(0.45, 0, 0.2, 1)` over 2.4s.
- Idle loops: core breath 11s, halo/rim/spike pulses 6–7s, medallion float 5.5s, ring spins 60–200s.

### Shadows / glows (recurring)
- Wordmark: `0 0 30px rgba(122,162,255,0.55), 0 0 70px rgba(77,119,230,0.30)`.
- Nucleus: `0 0 60px 18px rgba(215,227,255,0.55), 0 0 130px 40px rgba(122,162,255,0.30)`.
- Medallion idle: `drop-shadow(0 0 22px rgba(122,162,255,0.28))`; hover adds the stronger double drop-shadow above.

---

## Assets
- **No raster/image assets.** Everything is CSS gradients, inline SVG, and one inline SVG `feTurbulence` noise (data-URI) for grain and corona texture.
- **Fonts**: Cinzel, Cormorant Garamond, JetBrains Mono (Google Fonts). Swap to your app's font pipeline if self-hosting.
- **Discord glyph**: inline SVG path (in the hint row). Replace with your icon system if you have one.
- **Audio**: fully synthesized at runtime via Web Audio — no files to bundle.

---

## Performance Notes (read before reproducing 1:1)
The prototype favors richness over frugality. When porting, weigh these:
- `corona-tex` and the two `rays` layers use blend modes + masks + (for corona) an SVG turbulence texture. They're the biggest paint cost. They also do the most to defeat the "cheap blob" look up close. Keep at least the corona texture; the two ray layers can be merged to one if needed.
- Many simultaneous `box-shadow`/`filter: drop-shadow` glows can be costly on low-end GPUs. Consider promoting key layers with `will-change` (already done on animated ones) and capping star/dust counts on mobile.
- Honor `prefers-reduced-motion` (the prototype already disables all loops and shortens the loader there).
- The parallax + cursor-halo rAF loop is cheap but pointer-driven; gate it behind a non-touch / fine-pointer media query if you like.

## Open items for the implementer
1. **Wire the real Discord OAuth redirect** in place of the prototype's 4.2s reset (fire ~2.6–3.2s, under the white flash).
2. Decide component boundaries (e.g. `<StarCore>`, `<AstrolabeMedallion>`, `<CornerFrame>`, `<SkyMark>`).
3. Confirm the server wordmark text/motto and the version string (`v0.1.0`) are final.
4. Decide whether audio ships (it's tasteful but optional); keep the default-muted + persisted-opt-in behavior if so.
5. Accessibility: the medallion is a real `<button>` with an `aria-label`; keep that. Ensure the "skip the light" link is keyboard-reachable and the flash/bloom respect reduced-motion.

## Files (in this bundle)
- `prototype/ログイン画面 LUXEL プロトタイプ.html` — the screen markup + scene structure.
- `prototype/luxel/luxel.css` — tokens, background, starfield, star core, rings, wordmark.
- `prototype/luxel/luxel-2.css` — medallion, chrome, corner frame, ENTER sequence, loader, reduced-motion.
- `prototype/luxel/luxel.js` — starfield/stardust generation, parallax, cursor halo, moon phase, audio engine, the `enter()` sequence.
- `screenshots/luxel-login.png` — reference render of the settled screen.
