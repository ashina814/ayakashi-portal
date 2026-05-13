/**
 * Audio Manager — M4d
 *
 * 詳細設計 v1 §9 に準拠した最小実装:
 *   - 既定はミュート起動（ブラウザ autoplay policy 対策）
 *   - 音量は localStorage に保存（キー `ayakashi.muted`）
 *   - SFX (鈴・紙) は Web Audio API で procedurally 合成 → 素材ファイル不要
 *   - BGM は public/audio/bgm.mp3 がある場合のみ HTMLAudio で loop 再生。
 *     ファイル不在なら silent。素材は別途投入する想定。
 *
 * 外部から呼ぶ:
 *   const a = createAudioManager();
 *   a.setMuted(false);   // ユーザー操作の中で
 *   a.chime();           // 鈴
 *   a.rustle();          // 紙の擦れ
 *   a.dispose();
 */

const BGM_URL = "/audio/bgm.mp3";

export interface AudioManager {
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** 鈴のようなチャイム（短く澄んだ音） */
  chime(volume?: number): void;
  /** 紙の擦れ・捌け（短いノイズバースト） */
  rustle(volume?: number): void;
  dispose(): void;
}

export function createAudioManager(): AudioManager {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let bgm: HTMLAudioElement | null = null;
  let bgmLoaded = false;
  let muted = true;

  function ensureContext(): AudioContext {
    if (ctx) return ctx;
    // Safari 等の旧表記にもフォールバック
    const Ctor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctor();
    masterGain = ctx!.createGain();
    masterGain.gain.value = muted ? 0 : 0.7;
    masterGain.connect(ctx!.destination);
    return ctx!;
  }

  function startBgmIfReady() {
    if (bgm || muted) return;
    const el = new Audio(BGM_URL);
    el.loop = true;
    el.volume = 0.18;
    el.muted = muted;
    el.preload = "auto";
    el.addEventListener("canplaythrough", () => {
      bgmLoaded = true;
    }, { once: true });
    el.addEventListener("error", () => {
      // ファイルが無い等。silent に諦める。
      bgmLoaded = false;
    }, { once: true });
    el.play().catch(() => {
      // 自動再生規制で失敗することがある。次のユーザー操作で再試行する。
    });
    bgm = el;
  }

  function chime(volume = 0.35) {
    const c = ensureContext();
    if (muted) return;
    const t = c.currentTime;
    // 2 倍音と 3 倍音を混ぜたシンプルなチャイム
    const fundamentals = [880, 1320];
    for (const f of fundamentals) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume / fundamentals.length, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain).connect(masterGain!);
      osc.start(t);
      osc.stop(t + 1.6);
    }
  }

  function rustle(volume = 0.32) {
    const c = ensureContext();
    if (muted) return;
    const t = c.currentTime;
    // 短いホワイトノイズをエンベロープで包み、バンドパスで紙質感に
    const dur = 0.45;
    const sampleRate = c.sampleRate;
    const len = Math.floor(sampleRate * dur);
    const buf = c.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      const env = 1 - i / len; // 線形減衰
      data[i] = (Math.random() * 2 - 1) * env * 0.7;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.9;
    const gain = c.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(masterGain!);
    src.start(t);
  }

  function setMuted(next: boolean) {
    muted = next;
    if (ctx && masterGain) {
      const target = next ? 0 : 0.7;
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(target, now + 0.4);
    }
    if (bgm) {
      bgm.muted = next;
      if (!next) bgm.play().catch(() => {});
    } else if (!next) {
      // 初めてミュート解除した瞬間に BGM を仕込む
      ensureContext();
      startBgmIfReady();
    }
    localStorage.setItem("ayakashi.muted", String(next));
  }

  // 初期化: localStorage から状態を読み取り。AudioContext と BGM は
  // ユーザー操作（ボタン押下や hover）の中で初めて作る。
  const stored = localStorage.getItem("ayakashi.muted");
  muted = stored !== "false";

  return {
    setMuted,
    isMuted: () => muted,
    chime,
    rustle,
    dispose() {
      bgm?.pause();
      bgm = null;
      masterGain?.disconnect();
      masterGain = null;
      ctx?.close();
      ctx = null;
    },
  };
}
