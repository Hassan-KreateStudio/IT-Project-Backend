// Generated transition sounds for the graph pages. Web Audio only: no files.
// Nothing here is a control. Callers start a cue when a transition starts;
// if the browser has not yet allowed audio, the cue is skipped and the
// picture still runs.
//
// prefers-reduced-motion, and the tour's is-reduced class (?reduced=1 or
// ?motion=0), silence every cue. The animations are already removed in
// those cases, so a whoosh would be the only motion left.
//
// Cue lengths, in seconds:
//   intro, tour-enter   1.55 / 1.50   overview bloom while the graph draws in
//   empty                1.45          soft bed, droplet as the empty-state drop pulses
//   day-open             0.46          rising whoosh and a fifth (the day panel has no timed fade)
//   day-close            0.34          falling whoosh
//   day-step             0.18          one quiet ping, higher forward and lower back
//   tour-move            the camera move, except:
//     into stop 5        5.20          the illustrated network keeps zooming after the nodes settle
//     leaving stop 5     at least 2.60 the network fades for max(camera, 2.6s)

const HOME_ROOT = 392; // G4, the overview motif
const HOME_FIFTH = 587.33;

let installed = false;
let ctx = null;
let master = null;
let noiseBuf = null;
let active = [];
let ticket = 0;

export function cueDurationSeconds(cue, detail = {}) {
  switch (cue) {
    case "intro": return 1.55;
    case "empty": return 1.45;
    case "day-open": return 0.46;
    case "day-close": return 0.34;
    case "day-step": return 0.18;
    case "tour-enter": return 1.5;
    case "tour-move": return moveSeconds(detail.from, detail.to, detail.duration);
    default: return 0;
  }
}

function moveSeconds(from, to, durationMs) {
  const ms = Number(durationMs);
  const requested = Number.isFinite(ms) && ms > 0 ? ms : 1400;
  // Stop 5's camera move is short. The picture that matters is the
  // orthographic zoom, which runs for 5.2s (setGalaxyPull), while the
  // three conclusion lines enter at 0.45s, 2.20s and 4.40s.
  if (to === "5") return 5.2;
  // Leaving the network, the zoom back lasts at least 2.6s.
  if (from === "5") return Math.max(requested, 2600) / 1000;
  return requested / 1000;
}

function motionOff() {
  try {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    if (typeof document !== "undefined" && document.body?.classList.contains("is-reduced")) return true;
  } catch {
    // If the preference cannot be read, keep the sound. The animation is still playing.
  }
  return false;
}

export function installSounds() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const arm = () => {
    try { unlock(); } catch { /* audio is optional */ }
  };
  // Capture runs before the click or key that starts the transition,
  // so the context exists by the time the cue is played.
  window.addEventListener("pointerdown", arm, { capture: true });
  window.addEventListener("keydown", arm, { capture: true });
  window.addEventListener("touchstart", arm, { capture: true, passive: true });
  window.addEventListener("click", arm, { capture: true });
  try {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { if (mq.matches) releaseAll(0.08); };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", stop);
  } catch { /* a live preference change is optional */ }
}

function unlock() {
  if (motionOff()) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended" || c.state === "interrupted") {
    c.resume().catch(() => {});
  }
}

function audio() {
  if (ctx && ctx.state !== "closed") return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (typeof AC !== "function") return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    // Quiet on purpose: a presence in the room, not a notification.
    master.gain.value = 0.58;
    const smooth = ctx.createBiquadFilter();
    smooth.type = "lowpass";
    smooth.frequency.value = 9000;
    smooth.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 2.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    master.connect(smooth);
    smooth.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = makeNoise(ctx);
  } catch {
    try { if (ctx && ctx.state !== "closed") ctx.close(); } catch { /* already unusable */ }
    ctx = null;
    master = null;
    noiseBuf = null;
    return null;
  }
  return ctx;
}

function makeNoise(c) {
  const n = c.sampleRate * 2;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  // Paul Kellet's pink filter. Bandpassed, it reads as air rather than hiss.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const scale = peak > 0 ? 0.9 / peak : 1;
  const fade = Math.floor(c.sampleRate * 0.02);
  for (let i = 0; i < n; i++) {
    let k = scale;
    if (i < fade) k *= i / fade;
    else if (i > n - 1 - fade) k *= (n - 1 - i) / fade;
    d[i] *= k;
  }
  return buf;
}

function clampFreq(hz) {
  const n = Number(hz);
  if (!Number.isFinite(n)) return 440;
  return Math.max(40, Math.min(12000, n));
}

function clampGain(gain) {
  const n = Number(gain);
  if (!Number.isFinite(n)) return 0.0002;
  return Math.max(0.0002, Math.min(0.45, n));
}

function route(node, dest, pan) {
  if (pan && ctx && typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    panner.connect(dest);
    return;
  }
  node.connect(dest);
}

function releaseAll(fade) {
  if (!ctx) { active = []; return; }
  const t = ctx.currentTime;
  const dying = active;
  active = [];
  const seconds = Math.max(0.02, fade || 0.08);
  for (const rec of dying) {
    for (const gain of rec.gains) {
      try {
        gain.gain.cancelScheduledValues(t);
        const now = Math.max(gain.gain.value || 0.0001, 0.0001);
        gain.gain.setValueAtTime(now, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      } catch { /* this voice is already gone */ }
    }
    for (const source of rec.sources) {
      try { source.stop(t + seconds + 0.03); } catch { /* already stopped */ }
    }
  }
}

function beginVoice() {
  const rec = { gains: [], sources: [] };
  active.push(rec);
  return rec;
}

function whoosh(track, spec) {
  if (!ctx || !master || !noiseBuf) return;
  const duration = Math.max(0.08, spec.duration || 0.3);
  const t0 = ctx.currentTime + Math.max(0, spec.delay || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(120, t0);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.setValueAtTime(spec.q || 0.85, t0);
  const from = clampFreq(spec.from);
  const to = clampFreq(spec.to);
  band.frequency.setValueAtTime(from, t0);
  if (spec.mid && spec.midAt > 0 && spec.midAt < duration) {
    band.frequency.exponentialRampToValueAtTime(clampFreq(spec.mid), t0 + spec.midAt);
  }
  band.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const gain = ctx.createGain();
  const peak = clampGain(spec.gain);
  const attack = Math.min(spec.attack || 0.08, duration * 0.35);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.max(attack, 0.01));
  gain.gain.exponentialRampToValueAtTime(Math.max(peak * 0.4, 0.0002), t0 + duration * 0.62);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(highpass);
  highpass.connect(band);
  band.connect(gain);
  route(gain, master, spec.pan || 0);
  src.start(t0);
  src.stop(t0 + duration + 0.04);
  track.gains.push(gain);
  track.sources.push(src);
}

function tone(track, spec) {
  if (!ctx || !master) return;
  const duration = Math.max(0.05, spec.duration || 0.2);
  const t0 = ctx.currentTime + Math.max(0, spec.delay || 0);
  const osc = ctx.createOscillator();
  osc.type = spec.type || "sine";
  const freq = clampFreq(spec.freq);
  const start = clampFreq(spec.fromFreq || freq);
  osc.frequency.setValueAtTime(start, t0);
  if (Math.abs(start - freq) > 0.5) {
    osc.frequency.exponentialRampToValueAtTime(freq, t0 + Math.min(0.16, duration * 0.45));
  }
  const gain = ctx.createGain();
  const peak = clampGain(spec.gain);
  const attack = Math.min(Math.max(spec.attack || 0.02, 0.006), duration * 0.5);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  route(gain, master, spec.pan || 0);
  osc.start(t0);
  osc.stop(t0 + duration + 0.04);
  track.gains.push(gain);
  track.sources.push(osc);
}

function warm(track, spec) {
  tone(track, { ...spec, type: spec.type || "triangle" });
  tone(track, {
    ...spec,
    type: spec.type || "triangle",
    freq: (spec.freq || 440) * 1.004,
    fromFreq: (spec.fromFreq || spec.freq || 440) * 1.004,
    gain: (spec.gain || 0.05) * 0.45,
  });
}

function overview(track, seconds) {
  whoosh(track, { duration: seconds * 0.92, from: 240, to: 920, gain: 0.24, q: 0.75, attack: 0.12 });
  warm(track, { freq: HOME_ROOT, gain: 0.11, attack: 0.32, duration: seconds * 0.88, delay: 0.1 });
  warm(track, { freq: HOME_FIFTH, gain: 0.06, attack: 0.24, duration: seconds * 0.6, delay: seconds * 0.22 });
}

function playEmpty(track) {
  warm(track, { freq: 196, gain: 0.07, attack: 0.22, duration: 1.15 });
  // drop-pulse in default.html starts at 0.38s.
  whoosh(track, { duration: 0.26, delay: 0.38, from: 520, to: 1380, gain: 0.16, q: 1.2, attack: 0.02 });
  tone(track, { freq: 880, fromFreq: 1174, gain: 0.12, attack: 0.012, duration: 0.85, delay: 0.4 });
}

function playDayOpen(track) {
  whoosh(track, { duration: 0.3, from: 460, to: 1480, gain: 0.2, q: 1.05, attack: 0.018 });
  tone(track, { freq: 880, fromFreq: 988, gain: 0.2, attack: 0.01, duration: 0.46 });
  tone(track, { freq: 1318.5, fromFreq: 1480, gain: 0.09, attack: 0.012, duration: 0.4, delay: 0.02 });
}

function playDayClose(track) {
  whoosh(track, { duration: 0.3, from: 1080, to: 240, gain: 0.18, q: 0.9, attack: 0.016 });
  tone(track, { freq: 293.66, fromFreq: 349.23, gain: 0.1, attack: 0.012, duration: 0.34, type: "triangle" });
}

function playDayStep(track, detail) {
  const freq = detail.direction < 0 ? 523.25 : 698.46;
  tone(track, { freq, fromFreq: freq * 1.06, gain: 0.14, attack: 0.006, duration: 0.18 });
}

// Split numbers fade in after 68% of the move (splitChromeT).
function playSplit(track, seconds) {
  whoosh(track, { duration: seconds * 0.9, from: 300, to: 720, gain: 0.16, q: 0.7, pan: -0.42, attack: 0.1 });
  whoosh(track, { duration: seconds * 0.9, from: 420, to: 960, gain: 0.16, q: 0.7, pan: 0.42, attack: 0.12 });
  const tail = seconds * 0.38;
  warm(track, { freq: 523.25, gain: 0.07, attack: 0.16, duration: tail, delay: seconds * 0.62, pan: -0.25 });
  warm(track, { freq: 659.25, gain: 0.06, attack: 0.16, duration: tail, delay: seconds * 0.66, pan: 0.25 });
}

// Zoom into one day. The chime lands as the camera arrives.
function playZoomIn(track, seconds) {
  whoosh(track, { duration: seconds * 0.95, from: 260, to: 1640, gain: 0.22, q: 1.15, attack: 0.06 });
  tone(track, {
    freq: 987.77, fromFreq: 1174.7, gain: 0.14, attack: 0.02,
    duration: Math.max(0.28, seconds * 0.28), delay: seconds * 0.7,
  });
}

// The streak camera travels along the chain. Numbers appear after 62%.
function playStreak(track, seconds) {
  whoosh(track, { duration: seconds * 0.96, from: 280, to: 520, gain: 0.2, q: 0.65, attack: 0.14 });
  warm(track, { freq: 329.63, gain: 0.08, attack: 0.2, duration: seconds * 0.4, delay: seconds * 0.58 });
}

// Sleep nodes stagger in from about 30% to 72% of the move.
function playExtend(track, seconds) {
  whoosh(track, { duration: seconds * 0.92, from: 340, to: 880, gain: 0.18, q: 0.8, attack: 0.1 });
  const notes = [987.77, 1174.7, 1318.5];
  notes.forEach((freq, i) => {
    tone(track, {
      freq, fromFreq: freq * 1.03, gain: 0.07, attack: 0.01,
      duration: 0.42, delay: seconds * (0.34 + i * 0.16),
    });
  });
}

function playHome(track, seconds) {
  whoosh(track, { duration: seconds * 0.94, from: 860, to: 220, gain: 0.2, q: 0.7, attack: 0.08 });
  warm(track, { freq: HOME_ROOT, gain: 0.09, attack: 0.18, duration: seconds * 0.42, delay: seconds * 0.55 });
  warm(track, { freq: HOME_FIFTH, gain: 0.045, attack: 0.16, duration: seconds * 0.32, delay: seconds * 0.62 });
}

// The network opens for 5.2s. Partial entries match conclusionLineT.
function playReveal(track) {
  whoosh(track, {
    duration: 4.7, from: 1480, mid: 460, midAt: 2.35, to: 170,
    gain: 0.2, q: 0.55, attack: 0.2,
  });
  warm(track, { freq: 220, gain: 0.07, attack: 0.45, duration: 5.05, delay: 0.05 });
  warm(track, { freq: 329.63, gain: 0.055, attack: 0.4, duration: 4.55, delay: 0.5 });
  warm(track, { freq: 440, gain: 0.045, attack: 0.4, duration: 2.85, delay: 2.25 });
  tone(track, { freq: 659.25, fromFreq: 698.46, gain: 0.04, attack: 0.18, duration: 0.85, delay: 4.4, type: "sine" });
}

function playLeaveNetwork(track, seconds, to) {
  whoosh(track, { duration: seconds * 0.96, from: 190, to: 920, gain: 0.2, q: 0.7, attack: 0.1 });
  warm(track, { freq: 220, gain: 0.06, attack: 0.08, duration: seconds * 0.42 });
  warm(track, { freq: 329.63, gain: 0.04, attack: 0.08, duration: seconds * 0.36, delay: 0.04 });
  if (to === "0") {
    warm(track, { freq: HOME_ROOT, gain: 0.09, attack: 0.16, duration: seconds * 0.38, delay: seconds * 0.58 });
  }
}

function playMove(track, detail, seconds) {
  const from = detail.from;
  const to = detail.to;
  if (to === "5") { playReveal(track); return; }
  if (from === "5") { playLeaveNetwork(track, seconds, to); return; }
  if (to === "1") { playSplit(track, seconds); return; }
  if (to === "1b") { playZoomIn(track, seconds); return; }
  if (to === "2") { playStreak(track, seconds); return; }
  if (to === "4") { playExtend(track, seconds); return; }
  if (to === "0") { playHome(track, seconds); return; }
  // A dot jump to a stop without its own figure still gets the camera whoosh.
  const rising = to === "1b";
  whoosh(track, {
    duration: seconds * 0.92,
    from: rising ? 280 : 640,
    to: rising ? 1200 : 260,
    gain: 0.18, q: 0.8, attack: 0.08,
  });
}

function perform(cue, detail) {
  if (!ctx || ctx.state !== "running" || !master) return;
  const seconds = cueDurationSeconds(cue, detail);
  if (!(seconds > 0)) return;
  releaseAll(0.11);
  const track = beginVoice();
  switch (cue) {
    case "intro":
    case "tour-enter":
      overview(track, seconds);
      break;
    case "empty":
      playEmpty(track);
      break;
    case "day-open":
      playDayOpen(track);
      break;
    case "day-close":
      playDayClose(track);
      break;
    case "day-step":
      playDayStep(track, detail);
      break;
    case "tour-move":
      playMove(track, detail, seconds);
      break;
    default:
      break;
  }
}

export function playGraphSound(cue, detail) {
  try {
    if (typeof window === "undefined" || motionOff()) return;
    if (!ctx || ctx.state === "closed" || !master) return;
    const run = (mine) => {
      if (mine !== ticket || motionOff() || !ctx || ctx.state !== "running") return;
      try { perform(cue, detail || {}); } catch { /* never block the animation */ }
    };
    if (ctx.state === "running") {
      run(++ticket);
      return;
    }
    const activeGesture = typeof navigator !== "undefined" && navigator.userActivation?.isActive === true;
    if ((ctx.state === "suspended" || ctx.state === "interrupted") && activeGesture) {
      const mine = ++ticket;
      ctx.resume().then(() => run(mine)).catch(() => {});
    }
  } catch { /* never block the animation */ }
}
