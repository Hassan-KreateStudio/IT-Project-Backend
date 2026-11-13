// Soft transition sounds for the graph pages. Generated in the browser with
// the Web Audio API so the pages stay free of audio files. Nothing here runs
// until a user gesture creates the audio context, and every call is safe to
// make when audio is missing, blocked, or muted.

const STORAGE_KEY = "graph-sound";
const MASTER = 0.36;

let ctx = null;
let master = null;
let muted = false;
let whooshStop = null;

export function planIntroCues() {
  return [
    { kind: "whoosh", at: 0 },
    { kind: "chime", at: 0.14, freq: 523 },
    { kind: "chime", at: 0.52, freq: 659 },
  ];
}

export function planEntranceCues() {
  return [
    { kind: "whoosh", at: 0 },
    { kind: "chime", at: 0.28, freq: 523 },
    { kind: "chime", at: 0.74, freq: 659 },
  ];
}

export function planEmptyCues() {
  return [{ kind: "chime", at: 0.16, freq: 494 }];
}

// Screen ids match the advanced sequence: overview, split, one day,
// today and tomorrow, add a measure, conclusion.
export function planScreenCues(from, to) {
  const cues = [{ kind: "whoosh", at: 0 }];
  if (to === "1") cues.push({ kind: "tone", at: 0.05, freq: 392 });
  if (to === "1b") cues.push({ kind: "tone", at: 0.04, freq: 494 });
  if (to === "5") cues.push({ kind: "tone", at: 0.06, freq: 311 });
  if (to === "0" && from === "5") cues.push({ kind: "tone", at: 0.04, freq: 349 });
  if (to === "1b") cues.push({ kind: "chime", at: 0.24, freq: 659 });
  if (to === "2") cues.push({ kind: "chime", at: 0.38, freq: 587 });
  if (to === "4") cues.push({ kind: "chime", at: 0.32, freq: 698 });
  if (to === "5") cues.push({ kind: "chime", at: 0.55, freq: 523 });
  return cues;
}

function storageGet() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function storageSet(value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, value);
  } catch (e) {}
}

function motionAllowed() {
  try {
    if (typeof matchMedia !== "function") return true;
    return !matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return true;
  }
}

function arm() {
  try {
    const root = typeof globalThis !== "undefined" ? globalThis : null;
    const AudioCtx = root && (root.AudioContext || root.webkitAudioContext);
    if (!AudioCtx) return false;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      whooshStop = null;
    }
    if (ctx.state === "suspended") {
      const pending = ctx.resume();
      if (pending && typeof pending.catch === "function") pending.catch(() => {});
    }
    return !!ctx && !!master;
  } catch (e) {
    ctx = null;
    master = null;
    return false;
  }
}

function applyMaster() {
  try {
    if (!master || !ctx) return;
    const level = muted ? 0 : MASTER;
    if (typeof master.gain.cancelScheduledValues === "function") {
      master.gain.cancelScheduledValues(ctx.currentTime);
    }
    master.gain.setValueAtTime(level, ctx.currentTime);
  } catch (e) {}
}

function paint(button) {
  if (!button) return;
  const label = muted ? "Unmute sound" : "Mute sound";
  button.classList.toggle("is-muted", muted);
  button.setAttribute("aria-pressed", muted ? "true" : "false");
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

export function bindAudio() {
  try {
    if (typeof document === "undefined") return;
    const button = document.getElementById("sound-toggle");
    muted = storageGet() === "off";
    paint(button);
    if (button && button.dataset.bound !== "1") {
      button.dataset.bound = "1";
      button.addEventListener("click", (event) => {
        try {
          event.preventDefault();
          event.stopPropagation();
          arm();
          muted = !muted;
          storageSet(muted ? "off" : "on");
          applyMaster();
          paint(button);
          if (!muted) playPlan([{ kind: "chime", at: 0, freq: 523 }], true);
        } catch (e) {}
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      });
    }
    if (typeof window !== "undefined" && window.__graphAudioUnlock !== true) {
      window.__graphAudioUnlock = true;
      const unlock = () => {
        try { arm(); } catch (e) {}
      };
      window.addEventListener("pointerdown", unlock, true);
      window.addEventListener("keydown", unlock, true);
    }
  } catch (e) {}
}

function envGain(peak, when, attack, dur) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  gain.connect(master);
  return gain;
}

function startWhoosh(when) {
  if (typeof whooshStop === "function") {
    try { whooshStop(); } catch (e) {}
    whooshStop = null;
  }
  const dur = 0.36;
  const rate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(rate * dur));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.55;
  filter.frequency.setValueAtTime(2200, when);
  filter.frequency.exponentialRampToValueAtTime(380, when + dur);
  const noiseGain = envGain(0.16, when, 0.04, dur);
  src.connect(filter);
  filter.connect(noiseGain);
  src.start(when);
  src.stop(when + dur + 0.02);

  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(230, when);
  body.frequency.exponentialRampToValueAtTime(108, when + dur);
  const bodyGain = envGain(0.05, when, 0.05, dur);
  body.connect(bodyGain);
  body.start(when);
  body.stop(when + dur + 0.02);

  whooshStop = () => {
    try { src.stop(); } catch (e) {}
    try { body.stop(); } catch (e) {}
  };
}

function startChime(freq, when) {
  const tone = Number(freq) > 0 ? Number(freq) : 523;
  const partials = [
    [tone, 0.1, 0.46],
    [tone * 2, 0.028, 0.28],
  ];
  for (const [frequency, peak, dur] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, when);
    osc.connect(envGain(peak, when, 0.018, dur));
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }
}

function startTone(freq, when) {
  const tone = Number(freq) > 0 ? Number(freq) : 392;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(tone, when);
  osc.frequency.exponentialRampToValueAtTime(tone * 1.22, when + 0.28);
  osc.connect(envGain(0.08, when, 0.03, 0.4));
  osc.start(when);
  osc.stop(when + 0.44);
}

function playPlan(cues, ignoreMotion) {
  try {
    if (!ignoreMotion && !motionAllowed()) return;
    if (!arm() || muted || !ctx || !master || ctx.state === "closed") return;
    const now = ctx.currentTime || 0;
    for (const cue of cues || []) {
      try {
        const when = now + (Number(cue.at) > 0 ? Number(cue.at) : 0);
        if (cue.kind === "whoosh") startWhoosh(when);
        else if (cue.kind === "chime") startChime(cue.freq, when);
        else if (cue.kind === "tone") startTone(cue.freq, when);
      } catch (err) {}
    }
  } catch (e) {}
}

export function cueIntro() {
  try { playPlan(planIntroCues()); } catch (e) {}
}

export function cueEntrance() {
  try { playPlan(planEntranceCues()); } catch (e) {}
}

export function cueEmpty() {
  try { playPlan(planEmptyCues()); } catch (e) {}
}

export function cueScreen(from, to) {
  try { playPlan(planScreenCues(from, to)); } catch (e) {}
}
