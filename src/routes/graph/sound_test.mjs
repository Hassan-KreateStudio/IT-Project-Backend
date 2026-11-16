import assert from "node:assert/strict";
import test from "node:test";

import { cueDurationSeconds, playGraphSound } from "./web/sound.mjs";

test("playGraphSound does nothing without a browser", () => {
  playGraphSound("intro");
  playGraphSound("tour-move", { from: "0", to: "1", duration: 1900 });
  playGraphSound("not-a-cue");
});

test("cue lengths follow the picture", () => {
  assert.equal(cueDurationSeconds("intro"), 1.55);
  assert.equal(cueDurationSeconds("empty"), 1.45);
  assert.equal(cueDurationSeconds("tour-enter"), 1.5);
  assert.equal(cueDurationSeconds("day-open"), 0.46);
  assert.equal(cueDurationSeconds("day-close"), 0.34);
  assert.equal(cueDurationSeconds("day-step"), 0.18);
  assert.equal(cueDurationSeconds("tour-move", { from: "0", to: "1", duration: 1900 }), 1.9);
  assert.equal(cueDurationSeconds("tour-move", { from: "1", to: "1b", duration: 1800 }), 1.8);
  assert.equal(cueDurationSeconds("tour-move", { from: "1b", to: "2", duration: 2400 }), 2.4);
  assert.equal(cueDurationSeconds("tour-move", { from: "2", to: "4", duration: 2200 }), 2.2);
  assert.equal(cueDurationSeconds("tour-move", { from: "4", to: "5", duration: 2400 }), 5.2);
  assert.equal(cueDurationSeconds("tour-move", { from: "0", to: "5", duration: 1200 }), 5.2);
  assert.equal(cueDurationSeconds("tour-move", { from: "5", to: "0", duration: 3400 }), 3.4);
  assert.equal(cueDurationSeconds("tour-move", { from: "5", to: "1", duration: 1700 }), 2.6);
  assert.equal(cueDurationSeconds("tour-move", {}), 1.4);
  assert.equal(cueDurationSeconds("nope"), 0);
});
