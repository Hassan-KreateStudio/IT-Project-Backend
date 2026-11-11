import assert from "node:assert/strict";
import test from "node:test";

import { bandOf, describeP, prepare } from "./web/analysis.mjs";

test("glucose bands keep 70 and 180 in range", () => {
  assert.equal(bandOf(69.9), "low");
  assert.equal(bandOf(70), "in");
  assert.equal(bandOf(180), "in");
  assert.equal(bandOf(180.1), "high");
  assert.equal(bandOf(Number.NaN), "unknown");
});

test("p-value label uses p < 0.05", () => {
  assert.equal(describeP(0.03).text, "p = 0.03 (significant)");
  assert.equal(describeP(0.03).significant, true);
  assert.equal(describeP(0.05).text, "p = 0.05 (not significant)");
  assert.equal(describeP(0.0004).text, "p < 0.001 (significant)");
  assert.equal(describeP(null).text, "—");
});

test("same-day pairing uses the local day key, not the UTC date of the reading", () => {
  const payload = graphOf([
    ["a", "2026-11-07", 1000, 90],
    ["a", "2026-11-08", 8083, 110],
    ["a", "2026-11-09", 2000, 120],
  ]);
  // 8 Nov 00:00 in Nairobi is 21:00 UTC on 7 Nov. The reading stays on 8 Nov.
  const glucose = payload.nodes.find((node) => node.id === "glucose-a-2026-11-08");
  glucose.props.recordedAt = "2026-11-07T21:00:00Z";
  const model = prepare(payload);
  const day = model.days.find((item) => item.date === "2026-11-08");
  assert.equal(day.metrics.Steps.props.count, 8083);
  assert.equal(day.glucose, 110);
  const previous = model.days.find((item) => item.date === "2026-11-07");
  assert.equal(previous.glucose, 90);
  const edge = model.sameEdges.find((item) => item.source === "Steps" && item.target === "Glucose");
  assert.ok(edge);
  assert.equal(edge.n, 3);
});

test("correlations stay on one patient", () => {
  const mixed = graphOf([
    ["a", "2026-01-01", 10, 10],
    ["b", "2026-01-02", 10, 50],
    ["a", "2026-01-03", 20, 20],
    ["b", "2026-01-04", 20, 40],
    ["a", "2026-01-05", 30, 30],
    ["b", "2026-01-06", 30, 30],
    ["a", "2026-01-07", 40, 40],
    ["b", "2026-01-08", 40, 20],
    ["a", "2026-01-09", 50, 50],
    ["b", "2026-01-10", 50, 10],
  ]);
  assert.throws(() => prepare(mixed), /multiple patients/);

  const scoped = prepare({ ...mixed, meta: { patientId: "a" } });
  assert.equal(scoped.days.length, 5);
  assert.ok(scoped.days.every((day) => day.node.props.patientId === "a"));
  const edge = scoped.sameEdges.find((item) => item.source === "Steps" && item.target === "Glucose");
  assert.ok(edge, "expected a steps–glucose link");
  assert.ok(edge.r > 0.99, `expected patient a's positive correlation, got ${edge.r}`);
  assert.equal(edge.p < 0.05, true);

  const alone = prepare(graphOf([
    ["a", "2026-01-01", 10, 180],
    ["a", "2026-01-02", 20, 70],
    ["a", "2026-01-03", 30, 181],
  ]));
  assert.equal(alone.days.length, 3);
  const inRange = alone.days.reduce((sum, day) => sum + day.inRange, 0);
  assert.equal(inRange, 2);
  assert.equal(alone.days[0].band, "in");
  assert.equal(alone.days[2].band, "high");
});

function graphOf(rows) {
  const nodes = [];
  const edges = [];
  const users = new Set();
  for (const [patientId, date, steps, glucose] of rows) {
    users.add(patientId);
    const dayId = `day-${patientId}-${date}`;
    const stepsId = `steps-${patientId}-${date}`;
    const glucoseId = `glucose-${patientId}-${date}`;
    nodes.push({ id: dayId, label: "Day", props: { patientId, date, intensity: "MODERATE" } });
    nodes.push({ id: stepsId, label: "Steps", props: { patientId, count: steps } });
    nodes.push({
      id: glucoseId,
      label: "GlucoseReading",
      props: { patientId, value: glucose, recordedAt: `${date}T08:00:00Z` },
    });
    edges.push({ id: `e-steps-${patientId}-${date}`, type: "HAS_STEPS", start: dayId, end: stepsId });
    edges.push({ id: `e-glucose-${patientId}-${date}`, type: "HAS_GLUCOSE", start: dayId, end: glucoseId });
  }
  for (const id of users) {
    nodes.push({ id: `user-${id}`, label: "User", props: { id, role: "PATIENT", displayName: id, initials: id.slice(0, 1).toUpperCase() } });
  }
  return { nodes, edges, meta: {} };
}
