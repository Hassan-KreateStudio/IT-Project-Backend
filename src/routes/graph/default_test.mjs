import assert from "node:assert/strict";
import test from "node:test";

import { prepare } from "./web/analysis.mjs";
import { buildView, glucoseColor, linkStrength } from "./web/default.js";

test("glucose colours match the approved default view", () => {
  assert.equal(glucoseColor(70), "#D8FF3C");
  assert.equal(glucoseColor(180), "#D8FF3C");
  assert.equal(glucoseColor(69.9), "#FFB020");
  assert.equal(glucoseColor(180.1), "#FF4D3A");
  assert.equal(glucoseColor(Number.NaN), "#888");
});

test("link badges keep a mild association visible", () => {
  assert.equal(linkStrength(-0.7818), "strong");
  assert.equal(linkStrength(-0.3307), "moderate");
  assert.equal(linkStrength(0.3307), "moderate");
  assert.equal(linkStrength(-0.1228), "weak");
  assert.equal(linkStrength(0.05), "none");
  assert.equal(linkStrength(Number.NaN), "none");
});

test("headline follows a negative steps link of at least moderate strength", () => {
  const walked = buildView(prepare(graphOf(rows({ glucose: [180, 150, 120, 100, 80] }))));
  assert.equal(walked.headline, "On days you walked more, your glucose was lower");
  assert.equal(walked.name, "Amina");
  assert.equal(walked.span, "5 days · 1 Jan – 5 Jan 2026");
  assert.deepEqual(walked.variables.map((variable) => variable.name), [
    "Steps",
    "Active minutes",
    "Intensity",
    "Sedentary Time",
    "Heart rate",
  ]);
  const steps = walked.variables.find((variable) => variable.key === "Steps");
  const edge = prepare(graphOf(rows({ glucose: [180, 150, 120, 100, 80] }))).sameEdges
    .find((item) => item.source === "Steps" && item.target === "Glucose");
  assert.equal(steps.link.r, edge.r);
  assert.ok(steps.link.r < -0.9);
  assert.equal(steps.strength, "strong");

  const rising = buildView(prepare(graphOf(rows({ glucose: [80, 100, 120, 150, 180] }))));
  assert.equal(rising.headline, "How your activity relates to your glucose");
  assert.ok(rising.variables.find((variable) => variable.key === "Steps").link.r > 0.9);
});

test("empty state is days with no glucose, or no days at all", () => {
  const quiet = buildView(prepare(graphOf(rows({ glucose: [] }))));
  assert.equal(quiet.hasData, false);
  assert.equal(buildView(prepare({ nodes: [], edges: [], meta: {} })).hasData, false);
});

test("day panel slots follow Nairobi local time and keep the earliest reading", () => {
  const view = buildView(prepare(graphOf([{
    date: "2026-11-08",
    steps: 2519,
    active: 15,
    sed: 945,
    hr: 70,
    intensity: "MODERATE",
    readings: [
      { value: 191, at: "2026-11-07T21:00:00Z" },
      { value: 199, at: "2026-11-08T04:00:00Z" },
      { value: 202, at: "2026-11-08T10:30:00Z" },
      { value: 223, at: "2026-11-08T16:30:00Z" },
    ],
  }, {
    date: "2026-11-09",
    steps: 8000,
    active: 40,
    sed: 600,
    hr: 80,
    intensity: "VIGOROUS",
    readings: [{ value: 120, at: "2026-11-09T10:30:00Z" }],
  }, {
    date: "2026-11-10",
    steps: 12000,
    active: 70,
    sed: 400,
    hr: 90,
    intensity: "LIGHT",
    readings: [{ value: 110, at: "2026-11-10T10:30:00Z" }],
  }])));
  assert.equal(view.days[0].slots.fasting, 191);
  assert.equal(view.days[0].slots.lunch, 202);
  assert.equal(view.days[0].slots.dinner, 223);
  assert.equal(view.days[0].intensityName, "MODERATE");
  assert.equal(view.hasData, true);
});

test("a variable recorded on fewer than half the days is marked sparse", () => {
  const partial = [1, 2, 3, 4, 5, 6, 7].map((n, index) => ({
    date: `2026-02-${String(n).padStart(2, "0")}`,
    steps: 1000 + n * 500,
    active: 10 + n,
    sed: 700 - n * 15,
    hr: index < 3 ? 60 + n * 5 : null,
    intensity: ["LIGHT", "MODERATE", "VIGOROUS", "LIGHT", "MODERATE", "VIGOROUS", "LIGHT"][index],
    readings: [{ value: 160 - n * 5, at: `2026-02-${String(n).padStart(2, "0")}T10:30:00Z` }],
  }));
  const view = buildView(prepare(graphOf(partial)));
  const heart = view.variables.find((variable) => variable.key === "HeartRate");
  assert.ok(heart, "expected heart rate to stay on the graph");
  assert.equal(heart.days, 3);
  assert.equal(heart.sparse, true);
  assert.equal(heart.name, "Heart rate");
});

function rows({ glucose }) {
  return [1, 2, 3, 4, 5].map((n, index) => ({
    date: `2026-01-0${n}`,
    steps: n * 1000,
    active: n * 10,
    sed: 800 - n * 20,
    hr: 60 + n * 5,
    intensity: ["LIGHT", "MODERATE", "VIGOROUS", "MODERATE", "LIGHT"][index],
    readings: glucose.length ? [{ value: glucose[index], at: `2026-01-0${n}T10:30:00Z` }] : [],
  }));
}

function graphOf(days) {
  const patientId = "patient";
  const nodes = [{
    id: "user",
    label: "User",
    props: { id: patientId, role: "PATIENT", displayName: "Amina", initials: "A" },
  }];
  const edges = [];
  for (const day of days) {
    const dayId = `day-${day.date}`;
    nodes.push({
      id: dayId,
      label: "Day",
      props: { patientId, date: day.date, intensity: day.intensity },
    });
    const add = (label, id, props) => {
      if (props.value == null && props.count == null && props.minutes == null && props.bpm == null) return;
      nodes.push({ id, label, props: { patientId, ...props } });
      edges.push({ id: `e-${id}`, type: "HAS", start: dayId, end: id });
    };
    if (day.steps != null) add("Steps", `steps-${day.date}`, { count: day.steps });
    if (day.hr != null) add("HeartRate", `hr-${day.date}`, { bpm: day.hr });
    if (day.active != null) add("ActiveMinutes", `active-${day.date}`, { minutes: day.active });
    if (day.sed != null) add("Sedentary", `sed-${day.date}`, { minutes: day.sed });
    for (const [index, reading] of (day.readings || []).entries()) {
      add("GlucoseReading", `glucose-${day.date}-${index}`, { value: reading.value, recordedAt: reading.at });
    }
  }
  return { nodes, edges, meta: { patientId } };
}
