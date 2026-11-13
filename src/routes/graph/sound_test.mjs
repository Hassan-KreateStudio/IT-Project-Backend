import assert from "node:assert/strict";
import test from "node:test";

import {
  bindAudio,
  cueEmpty,
  cueEntrance,
  cueIntro,
  cueScreen,
  planEmptyCues,
  planEntranceCues,
  planIntroCues,
  planScreenCues,
} from "./web/sound.mjs";

const KINDS = new Set(["whoosh", "chime", "tone"]);

function assertCues(cues) {
  assert.ok(cues.length > 0);
  for (const cue of cues) {
    assert.ok(KINDS.has(cue.kind));
    assert.ok(cue.at >= 0 && cue.at < 1.6);
    if (cue.freq != null) assert.ok(cue.freq >= 200 && cue.freq <= 1200);
  }
}

test("screen changes use a whoosh, with a tone for a split or zoom and a chime when nodes arrive", () => {
  const order = ["0", "1", "1b", "2", "4", "5"];
  for (let i = 0; i < order.length - 1; i++) {
    const cues = planScreenCues(order[i], order[i + 1]);
    assertCues(cues);
    assert.ok(cues.some((cue) => cue.kind === "whoosh"));
  }

  const split = planScreenCues("0", "1");
  assert.ok(split.some((cue) => cue.kind === "tone"));

  const oneDay = planScreenCues("1", "1b");
  assert.ok(oneDay.some((cue) => cue.kind === "tone"));
  assert.ok(oneDay.some((cue) => cue.kind === "chime"));

  const measure = planScreenCues("2", "4");
  assert.ok(measure.some((cue) => cue.kind === "chime"));
  assert.equal(measure.some((cue) => cue.kind === "tone"), false);

  const ending = planScreenCues("4", "5");
  assert.ok(ending.some((cue) => cue.kind === "tone"));
  assert.ok(ending.some((cue) => cue.kind === "chime"));

  const back = planScreenCues("5", "0");
  assert.ok(back.some((cue) => cue.kind === "whoosh"));
  assert.ok(back.some((cue) => cue.kind === "tone"));
});

test("entrance cues stay short", () => {
  for (const cues of [planIntroCues(), planEntranceCues(), planEmptyCues()]) assertCues(cues);
  assert.ok(planIntroCues().some((cue) => cue.kind === "whoosh"));
  assert.ok(planEntranceCues().some((cue) => cue.kind === "chime"));
  assert.equal(planEmptyCues()[0].kind, "chime");
});

test("playing cues does not throw when Web Audio is unavailable", () => {
  assert.doesNotThrow(() => {
    bindAudio();
    cueIntro();
    cueEntrance();
    cueEmpty();
    cueScreen("0", "1");
    cueScreen("1", "1b");
    cueScreen("2", "4");
    cueScreen("5", "0");
  });
});

test("cues schedule oscillators when an audio context exists", () => {
  let started = 0;
  class Param {
    constructor() { this.value = 0; }
    setValueAtTime(value) {
      if (!(value > 0)) throw new Error("ramp start must be positive");
      this.value = value;
    }
    exponentialRampToValueAtTime(value) {
      if (!(value > 0) || !(this.value > 0)) throw new Error("bad exponential ramp");
      this.value = value;
    }
    cancelScheduledValues() {}
  }
  class Node {
    constructor() {
      this.gain = new Param();
      this.frequency = new Param();
      this.Q = new Param();
    }
    connect() { return this; }
    start() { started += 1; }
    stop() {}
  }
  class Ctx {
    constructor() {
      this.state = "running";
      this.currentTime = 1;
      this.sampleRate = 44100;
      this.destination = new Node();
    }
    createGain() { return new Node(); }
    createOscillator() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return new Node(); }
    resume() { this.state = "running"; return Promise.resolve(); }
  }
  globalThis.AudioContext = Ctx;
  assert.doesNotThrow(() => {
    cueIntro();
    cueEntrance();
    cueEmpty();
    cueScreen("0", "1");
    cueScreen("1", "1b");
    cueScreen("2", "4");
    cueScreen("4", "5");
    cueScreen("5", "0");
  });
  assert.ok(started > 0, "expected at least one scheduled sound");
});
