import {
  bandColor,
  bandOf,
  bandText,
  formatValue,
  longDate,
  prepare,
  readingTime,
  shortDate,
  strengthLabel,
  VARIABLES,
} from "./analysis.mjs";

const state = {
  model: null,
  cy: null,
  view: "overview",
  variable: null,
  dayIndex: null,
  readingId: null,
  metricKey: null,
  edgeId: null,
  expandedDay: null,
};

const statusEl = document.getElementById("status");
const panelEl = document.getElementById("panel");
const crumbEl = document.getElementById("crumb");
const canvasEl = document.getElementById("cy");
const wrapEl = document.getElementById("graph-wrap");
const tipEl = document.getElementById("tip");
const overlayEl = document.getElementById("graph-note");

const COMPACT = matchMedia("(max-width: 700px)").matches;
const R_DAY = COMPACT ? 370 : 470;
const R_VAR = COMPACT ? 168 : 205;
const R_AXIS = COMPACT ? 414 : 522;
const CHILD = COMPACT ? 0.82 : 1;
const ACCENT = "#FF3DAB";
const NEGATIVE = "#3DFFE7";
const POSITIVE = "#FF3DAB";

init();

async function init() {
  try {
    const payload = window.__GRAPH_DATA__ || (await (await fetch("data")).json());
    state.model = prepare(payload);
    renderGraph();
    bindChrome();
    renderOverviewPanel();
    renderCrumb();
    openFromHash();
    const meta = state.model.meta || {};
    statusEl.textContent = `${meta.nodeCount ?? state.model.nodes.length} nodes · ${meta.edgeCount ?? state.model.edges.length} edges · derived layer computed locally`;
    overlayEl.textContent = `${state.model.days.length} days · ${state.model.variables.length} variables · ${state.model.edgeList.length} derived links`;
  } catch (error) {
    statusEl.textContent = "failed: " + (error?.message || error);
    panelEl.innerHTML = `<div class="empty-state">Could not load the graph.<br>${esc(error?.message || String(error))}</div>`;
  }
}

/* ------------------------------------------------------------------ format */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtP(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 0.001) return "p < .001";
  if (value < 0.01) return "p < .01";
  return "p = " + value.toFixed(3);
}

function signed(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

function userName() {
  return state.model?.user?.props?.displayName || "You";
}

function userInitials() {
  return state.model?.user?.props?.initials || "?";
}

function edgeTitle(edge) {
  const source = state.model.variableByKey[edge.source];
  const target = state.model.variableByKey[edge.target];
  return `${source?.short || edge.source} ${edge.kind === "next" ? "→" : "↔"} ${target?.short || edge.target}`;
}

function edgeSentence(edge) {
  const source = state.model.variableByKey[edge.source];
  const target = state.model.variableByKey[edge.target];
  if (edge.kind === "next") {
    return `${source.label} on one day against ${target.label.toLowerCase()} on the next day`;
  }
  return `${source.label} and ${target.label.toLowerCase()} on the same day`;
}

function edgeColor(edge) {
  return edge.direction === "positive" ? POSITIVE : NEGATIVE;
}

function variableMean(variable) {
  return formatValue(variable, variable.mean);
}

/* -------------------------------------------------------------------- graph */

function radial(angle, radius) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function renderGraph() {
  const model = state.model;
  const days = model.days;
  const activity = model.variables.filter((variable) => variable.key !== "Glucose");
  const elementList = [];
  const positions = {};

  // faint polar rings sit behind everything
  elementList.push({ data: { id: "ring-outer", type: "ring", size: (R_DAY + 18) * 2, color: "#242424", label: "" }, classes: "ring", position: { x: 0, y: 0 } });
  elementList.push({ data: { id: "ring-inner", type: "ring", size: (R_VAR + 50) * 2, color: "#242424", label: "" }, classes: "ring", position: { x: 0, y: 0 } });
  positions["ring-outer"] = { x: 0, y: 0 };
  positions["ring-inner"] = { x: 0, y: 0 };

  // time axis labels around the outer ring
  const labelEvery = days.length > 40 ? 10 : Math.max(1, Math.round(days.length / 8));
  for (let index = 0; index < days.length; index += labelEvery) {
    const angle = -Math.PI / 2 + (index / days.length) * Math.PI * 2;
    const point = radial(angle, R_AXIS);
    const id = `axis-${index}`;
    elementList.push({
      data: { id, type: "axis", label: days[index].label, color: "#6f6f6f" },
      classes: "axis",
      position: point,
    });
    positions[id] = point;
  }

  // variable hubs: glucose at the centre, activity variables around it
  const glucose = model.variableByKey.Glucose;
  elementList.push({
    data: {
      id: "var-Glucose",
      type: "variable",
      key: "Glucose",
      label: glucose.label,
      color: glucose.color,
      size: 94,
      value: glucose.constant ? "constant" : `${variableMean(glucose)} mg/dL`,
    },
    position: { x: 0, y: 0 },
  });
  positions["var-Glucose"] = { x: 0, y: 0 };

  const start = -Math.PI / 2;
  activity.forEach((variable, index) => {
    const angle = start + (index / activity.length) * Math.PI * 2;
    const point = radial(angle, R_VAR);
    const id = `var-${variable.key}`;
    elementList.push({
      data: {
        id,
        type: "variable",
        key: variable.key,
        label: variable.label,
        color: variable.color,
        size: variable.key === "Intensity" ? 58 : 70,
        value: variable.constant ? "constant" : `${variableMean(variable)} ${variable.unit}`,
      },
      position: point,
    });
    positions[id] = point;
  });

  // day nodes around the outside; colour = glucose band, size = steps
  const stepValues = days.map((day) => day.metrics.Steps?.props?.count).filter((value) => typeof value === "number");
  const stepMin = stepValues.length ? Math.min(...stepValues) : 0;
  const stepMax = stepValues.length ? Math.max(...stepValues) : 1;
  days.forEach((day, index) => {
    const angle = -Math.PI / 2 + (index / days.length) * Math.PI * 2;
    const point = radial(angle, R_DAY);
    const steps = day.metrics.Steps?.props?.count;
    const normalized = typeof steps === "number" ? (steps - stepMin) / Math.max(1, stepMax - stepMin) : 0.4;
    const id = `day-${index}`;
    elementList.push({
      data: {
        id,
        type: "day",
        dayIndex: index,
        label: day.label,
        date: day.date,
        band: day.band,
        color: bandColor(day.band),
        size: 9 + normalized * 11,
        steps: typeof steps === "number" ? steps : null,
        glucose: day.glucose,
        readings: day.readingCount,
      },
      position: point,
    });
    positions[id] = point;

    const clusterId = `cluster-${index}`;
    const clusterPoint = radial(angle, R_DAY - 122);
    elementList.push({
      data: { id: clusterId, type: "cluster", dayIndex: index, size: 200 * CHILD, height: 160 * CHILD, color: "#FF3DAB", label: "" },
      classes: "cluster",
      position: clusterPoint,
    });
    positions[clusterId] = clusterPoint;
    elementList.push({
      data: { id: `stem-${index}`, type: "stem", source: `day-${index}`, target: clusterId, color: "#FF3DAB" },
      classes: "cluster-stem",
    });
  });

  // derived variable-to-variable layer
  for (const edge of model.sameEdges) {
    const source = model.variableByKey[edge.source];
    const target = model.variableByKey[edge.target];
    const offset = edge.source === "Glucose" || edge.target === "Glucose"
      ? 18
      : 34 + (edge.source.length % 3) * 9;
    elementList.push({
      data: {
        id: edge.id,
        type: "derived",
        kind: "same",
        source: `var-${edge.source}`,
        target: `var-${edge.target}`,
        r: edge.r,
        n: edge.n,
        p: edge.p,
        weight: Math.abs(edge.r),
        width: 0.8 + Math.min(6.2, Math.abs(edge.r) * 9),
        color: edgeColor(edge),
        curve: offset,
        label: `r ${edge.r.toFixed(2)} · n ${edge.n}`,
        variables: `${source.short} · ${target.short}`,
      },
      classes: `derived same ${edge.direction}`,
    });
    elementList.push({
      data: { id: `hit-${edge.id}`, type: "edgehit", source: `var-${edge.source}`, target: `var-${edge.target}`, edgeId: edge.id, curve: offset },
      classes: "edge-hit",
    });
  }
  for (const edge of model.nextEdges) {
    const source = model.variableByKey[edge.source];
    const target = model.variableByKey[edge.target];
    elementList.push({
      data: {
        id: edge.id,
        type: "derived",
        kind: "next",
        source: `var-${edge.source}`,
        target: `var-${edge.target}`,
        r: edge.r,
        n: edge.n,
        p: edge.p,
        weight: Math.abs(edge.r),
        width: 0.9 + Math.min(6.2, Math.abs(edge.r) * 10),
        color: edgeColor(edge),
        curve: -(42 + (edge.source.length % 3) * 8),
        label: `next day · r ${edge.r.toFixed(2)} · n ${edge.n}`,
        variables: `${source.short} → next-day ${target.short}`,
      },
      classes: `derived next ${edge.direction}`,
    });
    elementList.push({
      data: { id: `hit-${edge.id}`, type: "edgehit", source: `var-${edge.source}`, target: `var-${edge.target}`, edgeId: edge.id, curve: -(42 + (edge.source.length % 3) * 8) },
      classes: "edge-hit",
    });
  }

  // one aggregate day→variable edge per child category
  days.forEach((day, index) => {
    const targets = [
      ["Steps", day.metrics.Steps],
      ["HeartRate", day.metrics.HeartRate],
      ["ActiveMinutes", day.metrics.ActiveMinutes],
      ["Sedentary", day.metrics.Sedentary],
      ["Glucose", day.readings.length ? { props: { value: day.glucose } } : null],
    ];
    for (const [key, value] of targets) {
      if (!value) continue;
      const variable = model.variableByKey[key];
      elementList.push({
        data: {
          id: `link-${index}-${key}`,
          type: "dayvar",
          source: `day-${index}`,
          target: `var-${key}`,
          color: variable.color,
          dayIndex: index,
          variable: key,
        },
        classes: "day-link",
      });
    }
  });

  // nested children, hidden until a day is opened
  days.forEach((day, index) => {
    const angle = -Math.PI / 2 + (index / days.length) * Math.PI * 2;
    const clusterPoint = radial(angle, R_DAY - 122);
    const atCluster = (dx, dy) => ({ x: clusterPoint.x + dx, y: clusterPoint.y + dy });
    const metricKeys = ["Steps", "HeartRate", "ActiveMinutes", "Sedentary"];
    const metricXs = [-58, -19, 19, 58].map((value) => value * CHILD);
    metricKeys.forEach((key, slot) => {
      const variable = model.variableByKey[key];
      const metric = day.metrics[key];
      if (!metric) return;
      const id = `metric-${index}-${key}`;
      const point = atCluster(metricXs[slot], -26 * CHILD);
      elementList.push({
        data: {
          id,
          type: "metric",
          dayIndex: index,
          key,
          label: key === "Sedentary" ? "Sed." : key === "HeartRate" ? "Heart" : key === "ActiveMinutes" ? "Active" : variable.short,
          value: formatValue(variable, metricValue(metric)),
          color: variable.color,
          size: 22,
        },
        classes: "child metric-child",
        position: point,
      });
      positions[id] = point;
      elementList.push({
        data: { id: `childlink-${index}-${key}`, type: "childlink", source: id, target: `var-${key}`, color: variable.color },
        classes: "child-edge",
      });
      elementList.push({
        data: { id: `daychild-${index}-${key}`, type: "daychild", source: `day-${index}`, target: id, color: "#5a5a5a" },
        classes: "day-child",
      });
    });
    // intensity is a day property, not a separate stored node
    if (day.intensity) {
      const variable = model.variableByKey.Intensity;
      const id = `metric-${index}-Intensity`;
      const point = atCluster(0, 62 * CHILD);
      elementList.push({
        data: {
          id,
          type: "metric",
          dayIndex: index,
          key: "Intensity",
          label: "Int.",
          value: day.intensity,
          color: variable.color,
          size: 20,
        },
        classes: "child metric-child",
        position: point,
      });
      positions[id] = point;
      elementList.push({
        data: { id: `childlink-${index}-Intensity`, type: "childlink", source: id, target: "var-Intensity", color: variable.color },
        classes: "child-edge",
      });
      elementList.push({
        data: { id: `daychild-${index}-Intensity`, type: "daychild", source: `day-${index}`, target: id, color: "#5a5a5a" },
        classes: "day-child",
      });
    }
    day.readings.forEach((reading, slot) => {
      const id = `reading-${index}-${slot}`;
      const point = atCluster((slot - 1) * 30, -30);
      const band = bandOf(reading.props?.value);
      elementList.push({
        data: {
          id,
          type: "reading",
          dayIndex: index,
          readingId: reading.id,
          label: String(Math.round(reading.props?.value ?? 0)),
          value: reading.props?.value,
          band,
          color: bandColor(band),
          size: 21,
        },
        classes: "child reading-child",
        position: point,
      });
      positions[id] = point;
      elementList.push({
        data: { id: `childlink-${index}-reading-${slot}`, type: "childlink", source: id, target: "var-Glucose", color: bandColor(band) },
        classes: "child-edge",
      });
      elementList.push({
        data: { id: `daychild-${index}-reading-${slot}`, type: "daychild", source: `day-${index}`, target: id, color: "#5a5a5a" },
        classes: "day-child",
      });
    });
  });

  state.cy = cytoscape({
    container: canvasEl,
    elements: elementList,
    layout: { name: "preset", positions, fit: true, padding: 42 },
    minZoom: 0.42,
    maxZoom: 3.2,
    selectionType: "single",
    style: graphStyle(),
  });

  bindGraph();
  requestAnimationFrame(() => {
    state.cy.resize();
    state.cy.fit(undefined, COMPACT ? 26 : 42);
  });
  window.addEventListener("resize", () => {
    state.cy.resize();
    state.cy.fit(undefined, COMPACT ? 26 : 42);
  });
}

const any = (collection, fn) => collection.filter(fn).length > 0;

function metricValue(node) {
  if (!node) return null;
  const props = node.props || {};
  if (node.label === "Steps") return props.count;
  if (node.label === "HeartRate") return props.bpm;
  if (node.label === "ActiveMinutes" || node.label === "Sedentary") return props.minutes;
  return null;
}

function graphStyle() {
  return [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        "background-opacity": 0.9,
        "border-width": 1.1,
        "border-color": "#ffffff",
        "border-opacity": 0.75,
        label: "data(label)",
        color: "#ffffff",
        "font-family": "Outfit, sans-serif",
        "font-size": 9,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-outline-width": 3,
        "text-outline-color": "#0A0A0A",
        "text-opacity": 0,
        width: "data(size)",
        height: "data(size)",
        "z-index": 20,
        "transition-property": "opacity, border-width, background-opacity, width, height",
        "transition-duration": "150ms",
      },
    },
    {
      selector: 'node[type="variable"]',
      style: {
        "background-opacity": 0.17,
        "border-width": 2.2,
        "border-color": "data(color)",
        "font-family": "Bricolage, Outfit, sans-serif",
        "font-size": 14,
        "font-weight": 800,
        "text-valign": "center",
        "text-margin-y": 0,
        "text-outline-width": 2,
        "text-outline-color": "#0A0A0A",
        "text-opacity": 1,
        "z-index": 40,
      },
    },
    {
      selector: 'node[type="day"]',
      style: {
        "background-opacity": 0.95,
        "border-color": "#F6F4F0",
        "border-width": 1,
        "font-size": 9,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "z-index": 18,
      },
    },
    {
      selector: 'node[type="axis"]',
      style: {
        "background-opacity": 0,
        "border-width": 0,
        "text-opacity": 1,
        color: "#6f6f6f",
        "font-size": 9,
        width: 1,
        height: 1,
        "text-valign": "center",
        "text-outline-width": 2,
        "text-outline-color": "#0A0A0A",
        events: "no",
        "z-index": 3,
      },
    },
    { selector: "node.ring", style: { "background-opacity": 0, "border-width": 1, "border-color": "#242424", "border-opacity": 0.9, events: "no", "z-index": 0 } },
    { selector: 'edge[type="stem"]', style: { width: 2.1, "line-color": "#FF3DAB", opacity: 1, "curve-style": "straight", "z-index": 20 } },
    { selector: "edge.cluster-stem", style: { display: "none" } },
    { selector: "edge.cluster-stem.show", style: { display: "element" } },
    { selector: "node.cluster", style: { shape: "round-rectangle", "background-color": "#FF3DAB", "background-opacity": 0.055, "border-width": 1.1, "border-color": "#FF3DAB", "border-opacity": 0.55, "border-style": "dashed", label: "", events: "no", width: "data(size)", height: "data(height)", "z-index": 12, display: "none" } },
    { selector: "node.cluster.show", style: { display: "element" } },
    {
      selector: 'node[type="metric"]',
      style: {
        shape: "round-rectangle",
        "background-opacity": 0.95,
        "border-color": "#ffffff",
        "border-width": 1,
        "font-size": 8.5,
        "text-opacity": 1,
        "text-valign": "bottom",
        "text-margin-y": 3,
        "text-outline-width": 3,
        "z-index": 55,
      },
    },
    {
      selector: 'node[type="reading"]',
      style: {
        shape: "diamond",
        "background-opacity": 1,
        "border-color": "#ffffff",
        "border-width": 1,
        "font-size": 8,
        "font-weight": 700,
        color: "#0A0A0A",
        "text-opacity": 1,
        "text-valign": "center",
        "text-margin-y": 0,
        "text-outline-width": 0,
        "z-index": 58,
      },
    },
    { selector: "node.child", style: { display: "none" } },
    { selector: "node.child.show", style: { display: "element" } },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#3a3a3a",
        "curve-style": "bezier",
        opacity: 0.7,
        "transition-property": "opacity, width, line-color",
        "transition-duration": "150ms",
      },
    },
    {
      selector: 'edge[type="dayvar"]',
      style: {
        width: 0.55,
        "line-opacity": 0.09,
        opacity: 1,
        "line-color": "data(color)",
        "curve-style": "bezier",
        "z-index": 6,
      },
    },
    {
      selector: 'edge[type="derived"]',
      style: {
        width: "data(width)",
        "line-color": "data(color)",
        opacity: 0.66,
        "curve-style": "unbundled-bezier",
        "control-point-distances": "data(curve)",
        "control-point-weights": 0.5,
        "z-index": 34,
        label: "data(label)",
        "font-size": 8.5,
        "font-family": "Outfit, sans-serif",
        color: "#d6d6d6",
        "text-opacity": 0,
        "text-background-color": "#0A0A0A",
        "text-background-opacity": 0.8,
        "text-background-padding": "2px",
        "text-rotation": "none",
      },
    },
    {
      selector: 'edge.next',
      style: {
        "line-style": "dashed",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "data(color)",
        "arrow-scale": 0.7,
      },
    },
    {
      selector: 'edge[type="childlink"]',
      style: {
        width: 1.5,
        "line-color": "data(color)",
        opacity: 0.8,
        "z-index": 30,
      },
    },
    {
      selector: 'edge[type="daychild"]',
      style: {
        width: 1,
        "line-color": "#4a4a4a",
        opacity: 0.9,
        "curve-style": "straight",
        "z-index": 28,
      },
    },
    { selector: ".child-edge", style: { display: "none" } },
    { selector: ".child-edge.show", style: { display: "element" } },
    { selector: ".day-child", style: { display: "none" } },
    { selector: ".day-child.show", style: { display: "element" } },
    { selector: ".day-link.hidden", style: { display: "none" } },
    { selector: ".show-label", style: { "text-opacity": 1 } },
    { selector: ".dim", style: { opacity: 0.18 } },
    { selector: "node.hover", style: { "border-width": 3, "border-color": "#ffffff", "text-opacity": 1, "z-index": 80 } },
    { selector: "node.selected", style: { "border-width": 3.2, "border-color": ACCENT, "text-opacity": 1, "z-index": 85 } },
    { selector: 'node[type="variable"].selected', style: { "background-opacity": 0.35 } },
    { selector: 'node[type="day"].selected', style: { "background-opacity": 1, width: 27, height: 27, "border-width": 3, "border-color": "#FF3DAB", "font-family": "Bricolage, Outfit, sans-serif", "font-size": 10, "font-weight": 800 } },
    { selector: 'node[type="metric"].selected, node[type="reading"].selected', style: { "background-opacity": 1, "border-width": 2.4 } },
    { selector: "edge.hover", style: { opacity: 1 } },
    { selector: "edge.focus", style: { opacity: 1 } },
    { selector: 'edge[type="dayvar"].focus', style: { opacity: 1, "line-opacity": 0.5, width: 1.1 } },
    { selector: "node.focus", style: { "border-width": 2.6, "border-color": "#ffffff", "text-opacity": 1 } },
  ];
}

/* ---------------------------------------------------------------- bindings */

function bindGraph() {
  const cy = state.cy;
  cy.on("tap", "node", (event) => {
    const node = event.target;
    if (node.hasClass("ring") || node.data("type") === "axis") return;
    if (node.data("type") === "variable") selectVariable(node.data("key"));
    else if (node.data("type") === "day") selectDay(node.data("dayIndex"));
    else if (node.data("type") === "metric") selectMetric(node.data("dayIndex"), node.data("key"));
    else if (node.data("type") === "reading") selectReading(node.data("dayIndex"), node.data("readingId"));
  });
  cy.on("tap", "edge", (event) => {
    const edge = event.target;
    if (edge.data("type") === "edgehit") selectEdge(edge.data("edgeId"));
    else if (edge.data("type") === "derived") selectEdge(edge.data("id"));
    else if (edge.data("type") === "dayvar") selectDay(edge.data("dayIndex"));
  });
  cy.on("tap", (event) => {
    if (event.target === cy) reset();
  });
  cy.on("mouseover", "node", (event) => {
    const node = event.target;
    if (node.hasClass("ring") || node.data("type") === "axis") return;
    node.addClass("hover");
    canvasEl.style.cursor = "pointer";
    showNodeTooltip(event, node);
  });
  cy.on("mouseout", "node", (event) => {
    event.target.removeClass("hover");
    canvasEl.style.cursor = "default";
    hideTip();
  });
  cy.on("mouseover", "edge", (event) => {
    const edge = event.target;
    if (edge.data("type") === "edgehit") {
      const visual = cy.edges(`[id="${edge.data("edgeId")}"]`);
      visual.addClass("hover").addClass("show-label");
      canvasEl.style.cursor = "pointer";
      showEdgeTooltip(event, visual);
      return;
    }
    if (edge.data("type") !== "derived" && edge.data("type") !== "dayvar") return;
    edge.addClass("hover");
    edge.addClass("show-label");
    canvasEl.style.cursor = "pointer";
    showEdgeTooltip(event, edge);
  });
  cy.on("mouseout", "edge", (event) => {
    const edge = event.target;
    if (edge.data("type") === "edgehit") {
      const visual = cy.edges(`[id="${edge.data("edgeId")}"]`);
      visual.removeClass("hover");
      if (!visual.hasClass("focus")) visual.removeClass("show-label");
      canvasEl.style.cursor = "default";
      hideTip();
      return;
    }
    edge.removeClass("hover");
    if (!edge.hasClass("focus")) edge.removeClass("show-label");
    canvasEl.style.cursor = "default";
    hideTip();
  });
  cy.on("pan zoom", hideTip);
  canvasEl.addEventListener("pointerleave", hideTip);
}

function bindChrome() {
  crumbEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-crumb]");
    if (!button) return;
    const kind = button.dataset.crumb;
    if (kind === "overview") reset();
    else if (kind === "day") selectDay(state.dayIndex);
    else if (kind === "variable") selectVariable(state.variable);
    else if (kind === "edge") selectEdge(state.edgeId);
  });
  panelEl.addEventListener("click", (event) => {
    const edgeRow = event.target.closest("[data-edge]");
    if (edgeRow) {
      selectEdge(edgeRow.dataset.edge);
      return;
    }
    const readingRow = event.target.closest("[data-reading]");
    if (readingRow) {
      selectReading(Number(readingRow.dataset.dayIndex), readingRow.dataset.reading);
      return;
    }
    const metricRow = event.target.closest("[data-metric]");
    if (metricRow) {
      selectMetric(Number(metricRow.dataset.dayIndex), metricRow.dataset.metric);
      return;
    }
    const dayRow = event.target.closest("[data-day]");
    if (dayRow) {
      selectDay(Number(dayRow.dataset.day));
      return;
    }
    const variableRow = event.target.closest("[data-variable]");
    if (variableRow) {
      selectVariable(variableRow.dataset.variable);
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "overview") reset();
    if (action.dataset.action === "day") selectDay(state.dayIndex);
    if (action.dataset.action === "collapse") {
      collapseExpanded();
      renderDayPanel(state.dayIndex);
      focusDay(state.dayIndex, false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      reset();
    }
  });
}

/* ------------------------------------------------------------------ focus */

function collapseExpanded() {
  if (state.expandedDay == null) return;
  const index = state.expandedDay;
  const cy = state.cy;
  cy.nodes(`[id="day-${index}"]`).removeClass("expanded");
  cy.nodes().filter((node) => (node.hasClass("child") || node.hasClass("cluster")) && node.data("dayIndex") === index).removeClass("show");
  cy.edges().filter((edge) => edge.hasClass("child-edge") && (edge.data("source").includes(`-${index}-`) || edge.data("target").includes(`-${index}-`))).removeClass("show");
  cy.edges().filter((edge) => edge.hasClass("day-child") && edge.data("source") === `day-${index}`).removeClass("show");
  cy.edges().filter((edge) => edge.hasClass("day-link") && edge.data("source") === `day-${index}`).removeClass("hidden");
  cy.edges(`[id="stem-${index}"]`).removeClass("show");
  state.expandedDay = null;
}

function expandDay(index) {
  const cy = state.cy;
  collapseExpanded();
  state.expandedDay = index;
  const children = cy.nodes().filter((node) => node.data("dayIndex") === index && (node.hasClass("child") || node.hasClass("cluster")));
  children.addClass("show");
  const childIds = new Set(children.map((node) => node.id()));
  cy.edges().forEach((edge) => {
    if (edge.hasClass("child-edge") && (childIds.has(edge.data("source")) || childIds.has(edge.data("target")))) edge.addClass("show");
    if (edge.hasClass("day-child") && edge.data("source") === `day-${index}`) edge.addClass("show");
    if (edge.hasClass("day-link") && edge.data("source") === `day-${index}`) edge.addClass("hidden");
  });
  cy.nodes(`[id="day-${index}"]`).addClass("expanded");
}

function clearFocusClasses() {
  const cy = state.cy;
  cy.elements().removeClass("dim selected focus hover show-label");
  cy.nodes(".ring, .axis").removeClass("dim");
}

function focusOnly(elements) {
  const cy = state.cy;
  cy.elements().addClass("dim");
  cy.nodes(".ring, .axis").removeClass("dim");
  elements.removeClass("dim");
}

function selectVariable(key) {
  const cy = state.cy;
  if (!state.model.variableByKey[key]) return;
  collapseExpanded();
  clearFocusClasses();
  state.view = "variable";
  state.variable = key;
  state.dayIndex = null;
  state.readingId = null;
  state.metricKey = null;
  state.edgeId = null;
  const variable = cy.nodes(`[id="var-${key}"]`);
  const linkedEdges = cy.edges().filter((edge) => edge.data("type") === "derived" && (edge.data("source") === `var-${key}` || edge.data("target") === `var-${key}`));
  const dayLinks = cy.edges().filter((edge) => edge.data("type") === "dayvar" && (edge.data("source") === `var-${key}` || edge.data("target") === `var-${key}`));
  const dayNodes = cy.nodes().filter((node) => node.data("type") === "day" && any(dayLinks, (edge) => edge.data("source") === node.id()));
  const hubs = cy.nodes().filter((node) => node.data("type") === "variable" && (node.id() === `var-${key}` || any(linkedEdges, (edge) => edge.data("source") === node.id() || edge.data("target") === node.id())));
  focusOnly(variable.union(linkedEdges).union(dayLinks).union(dayNodes).union(hubs));
  variable.addClass("selected");
  linkedEdges.addClass("focus");
  dayLinks.addClass("focus");
  renderVariablePanel(key);
  renderCrumb();
  remember("#variable=" + encodeURIComponent(key));
}

function selectDay(index) {
  const day = state.model.dayByIndex.get(index);
  if (!day) return;
  const cy = state.cy;
  clearFocusClasses();
  state.view = "day";
  state.variable = null;
  state.dayIndex = index;
  state.readingId = null;
  state.metricKey = null;
  state.edgeId = null;
  expandDay(index);
  const dayNode = cy.nodes(`[id="day-${index}"]`);
  const children = cy.nodes().filter((node) => node.data("dayIndex") === index && (node.hasClass("child") || node.hasClass("cluster")));
  const childEdges = cy.edges().filter((edge) => edge.hasClass("child-edge") && any(children, (node) => node.id() === edge.data("source")));
  const hubs = cy.nodes().filter((node) => node.data("type") === "variable" && any(childEdges, (edge) => edge.data("target") === node.id()));
  const dayLinks = cy.edges().filter((edge) => edge.data("type") === "dayvar" && edge.data("source") === `day-${index}` && !edge.hasClass("hidden"));
  const relatedDerived = cy.edges().filter((edge) => edge.data("type") === "derived" && any(hubs, (node) => node.id() === edge.data("source") || node.id() === edge.data("target")));
  const stem = cy.edges(`[id="stem-${index}"]`);
  focusOnly(dayNode.union(children).union(childEdges).union(hubs).union(dayLinks).union(relatedDerived).union(stem));
  dayNode.addClass("selected");
  dayLinks.addClass("focus");
  childEdges.addClass("show");
  renderDayPanel(index);
  renderCrumb();
  remember("#day=" + (day.date || index));
}

function selectMetric(index, key) {
  const day = state.model.dayByIndex.get(index);
  const variable = state.model.variableByKey[key];
  if (!day || !variable) return;
  const cy = state.cy;
  clearFocusClasses();
  state.view = "metric";
  state.variable = null;
  state.dayIndex = index;
  state.metricKey = key;
  state.readingId = null;
  state.edgeId = null;
  expandDay(index);
  const child = cy.nodes(`[id="metric-${index}-${key}"]`);
  const dayNode = cy.nodes(`[id="day-${index}"]`);
  const hub = cy.nodes(`[id="var-${key}"]`);
  const childEdge = cy.edges(`[id="childlink-${index}-${key}"]`);
  const related = cy.edges(`[id="daychild-${index}-${key}"]`);
  const cluster = cy.nodes(`[id="cluster-${index}"]`);
  const stem = cy.edges(`[id="stem-${index}"]`);
  focusOnly(child.union(dayNode).union(hub).union(childEdge).union(related).union(cluster).union(stem));
  child.addClass("selected");
  childEdge.addClass("focus");
  renderMetricPanel(index, key);
  renderCrumb();
  remember("#metric=" + encodeURIComponent(key) + "&day=" + encodeURIComponent(day.date));
}

function selectReading(index, readingId) {
  const day = state.model.dayByIndex.get(index);
  if (!day) return;
  const reading = day.readings.find((item) => item.id === readingId);
  if (!reading) return;
  const cy = state.cy;
  const slot = day.readings.indexOf(reading);
  clearFocusClasses();
  state.view = "reading";
  state.variable = null;
  state.dayIndex = index;
  state.readingId = readingId;
  state.metricKey = null;
  state.edgeId = null;
  expandDay(index);
  const child = cy.nodes(`[id="reading-${index}-${slot}"]`);
  const dayNode = cy.nodes(`[id="day-${index}"]`);
  const hub = cy.nodes(`[id="var-Glucose"]`);
  const childEdge = cy.edges(`[id="childlink-${index}-reading-${slot}"]`);
  const related = cy.edges(`[id="daychild-${index}-reading-${slot}"]`);
  const cluster = cy.nodes(`[id="cluster-${index}"]`);
  const stem = cy.edges(`[id="stem-${index}"]`);
  focusOnly(child.union(dayNode).union(hub).union(childEdge).union(related).union(cluster).union(stem));
  child.addClass("selected");
  childEdge.addClass("focus");
  renderReadingPanel(index, reading);
  renderCrumb();
  remember("#reading=" + encodeURIComponent(reading.props?.id || reading.id));
}

function selectEdge(edgeId) {
  const edge = state.model.edgeById.get(edgeId);
  if (!edge) return;
  const cy = state.cy;
  collapseExpanded();
  clearFocusClasses();
  state.view = "edge";
  state.edgeId = edgeId;
  state.variable = null;
  state.dayIndex = null;
  state.readingId = null;
  state.metricKey = null;
  const source = cy.nodes(`[id="var-${edge.source}"]`);
  const target = cy.nodes(`[id="var-${edge.target}"]`);
  const edgeEl = cy.edges(`[id="${edgeId}"]`);
  const evidenceIndices = new Set(edge.evidence.flatMap((item) => edge.kind === "next" ? [item.sourceIndex, item.targetIndex] : [item.sourceIndex]));
  const evidenceDays = cy.nodes().filter((node) => node.data("type") === "day" && evidenceIndices.has(node.data("dayIndex")));
  const dayLinks = cy.edges().filter((edgeEl) => {
    if (edgeEl.data("type") !== "dayvar") return false;
    const dayIndex = edgeEl.data("dayIndex");
    if (!evidenceIndices.has(dayIndex)) return false;
    return edgeEl.data("variable") === edge.source || edgeEl.data("variable") === edge.target;
  });
  focusOnly(source.union(target).union(edgeEl).union(evidenceDays).union(dayLinks));
  edgeEl.addClass("focus").addClass("show-label");
  dayLinks.addClass("focus");
  source.addClass("selected");
  target.addClass("selected");
  renderEdgePanel(edge);
  renderCrumb();
  remember("#edge=" + encodeURIComponent(edgeId));
}

function focusDay(index, render = true) {
  const cy = state.cy;
  const dayNode = cy.nodes(`[id="day-${index}"]`);
  const children = cy.nodes().filter((node) => node.data("dayIndex") === index && (node.hasClass("child") || node.hasClass("cluster")));
  const childEdges = cy.edges().filter((edge) => edge.hasClass("child-edge") && any(children, (node) => node.id() === edge.data("source")));
  const hubs = cy.nodes().filter((node) => node.data("type") === "variable" && any(childEdges, (edge) => edge.data("target") === node.id()));
  clearFocusClasses();
  focusOnly(dayNode.union(children).union(childEdges).union(hubs));
  dayNode.addClass("selected");
  if (render) renderDayPanel(index);
}

function reset() {
  const cy = state.cy;
  collapseExpanded();
  clearFocusClasses();
  state.view = "overview";
  state.variable = null;
  state.dayIndex = null;
  state.readingId = null;
  state.metricKey = null;
  state.edgeId = null;
  ensureChildrenShown(false);
  renderOverviewPanel();
  renderCrumb();
  remember("#overview");
}

function ensureChildrenShown(show) {
  const cy = state.cy;
  if (show) cy.elements(".child, .child-edge, .day-child").addClass("show");
  else cy.elements(".child, .child-edge, .day-child").removeClass("show");
}

function remember(hash) {
  if (location.hash === hash) return;
  history.pushState(null, "", hash);
}

window.addEventListener("popstate", openFromHash);

function openFromHash() {
  const raw = decodeURIComponent(location.hash.replace("#", ""));
  if (!raw || raw === "overview") return reset();
  const parts = raw.split("&").map((part) => part.split("="));
  const [kind, value] = parts[0] || [];
  if (kind === "variable" && state.model.variableByKey[value]) return selectVariable(value);
  if (kind === "day" && value) {
    const day = state.model.days.find((item) => item.date === value || String(item.index) === value);
    if (day) return selectDay(day.index);
  }
  if (kind === "edge" && state.model.edgeById.has(value)) return selectEdge(value);
  if (kind === "reading" && value) {
    const day = state.model.days.find((item) => item.readings.some((reading) => reading.id === value || reading.props?.id === value));
    const reading = day?.readings.find((item) => item.id === value || item.props?.id === value);
    if (day && reading) return selectReading(day.index, reading.id);
  }
  if (kind === "metric" && value) {
    const dayPart = parts.find((part) => part[0] === "day");
    const day = state.model.days.find((item) => item.date === (dayPart?.[1] || ""));
    if (day) return selectMetric(day.index, value);
  }
  reset();
}

/* ------------------------------------------------------------------ panels */

function renderOverviewPanel() {
  const model = state.model;
  const readings = model.days.reduce((sum, day) => sum + day.readings.length, 0);
  const inRange = model.days.reduce((sum, day) => sum + day.inRange, 0);
  const top = model.edgeList.slice(0, 7);
  const active = model.edgeList.filter((edge) => edge.kind === "next").length;
  const strong = model.edgeList.filter((edge) => edge.strength >= 0.3).length;
  panelEl.innerHTML = `
    <div class="eyebrow"><span>The whole graph</span><span class="live"><i></i>90-day window</span></div>
    <div class="hero-stat"><span class="num">${model.days.length}</span><span class="unit">days, every one connected</span></div>
    <p class="panel-sub"><b>${readings}</b> glucose readings · <b>${inRange}</b> in range · <b>${model.edges.length}</b> stored relationships</p>
    <div class="stat-grid">
      <div><b>${model.variables.length}</b><span>variables</span></div>
      <div><b>${model.sameEdges.length}</b><span>same-day links</span></div>
      <div><b>${active}</b><span>next-day links</span></div>
      <!-- <div><b>${strong}</b><span>moderate or stronger</span></div> -->
    </div>
    <div class="section-head">Derived relationships <span>whole window</span></div>
    <p class="method">Every link below is computed from all complete days in the payload. It is an analysis overlay, not a stored edge.</p>
    ${model.variableByKey.Intensity.constant ? '<p class="method">Intensity is constant in this window (all MODERATE), so it has no variance and no derived links.</p>' : ""}
    ${top.map((edge) => edgeRow(edge, true)).join("")}
    <div class="section-head">Why this is a graph</div>
    <div class="why">
      <p><b>The aggregate is an edge.</b> A variable relationship is computed once across the whole window; clicking it walks back to every day that contributed.</p>
      <p><b>The path is the query.</b> <span class="mono">variable → day → next day → glucose</span> is a traversal. A flat table needs a self-join for every lag.</p>
      <p><b>The evidence stays attached.</b> Each day is still a node with its own metrics and readings. The relationship layer does not replace the data; it sits on top of it.</p>
    </div>
    <div class="query">
      <div class="query-label">Graph-shaped question</div>
      <code>MATCH (u:User)-[:HAS_DAY]-&gt;(d:Day)<br>MATCH (d)-[:HAS_ACTIVE_MINUTES]-&gt;(a)<br>MATCH (d)-[:NEXT]-&gt;(n)-[:HAS_GLUCOSE]-&gt;(g)<br>RETURN a.minutes, g.value</code>
      <span>NEXT is derived from the dated day nodes at load time.</span>
    </div>
    <div class="section-head">Read the ring</div>
    <div class="hint-list">
      <div class="hint"><span class="glyph">01</span><span><b>Outer ring: 90 days.</b> Dot colour is glucose band; dot size is step count. The ring is the holistic window, not a sample.</span></div>
      <div class="hint"><span class="glyph">02</span><span><b>Centre: variables.</b> Glucose sits at the centre; the five activity variables around it. Faint lines are stored day links, strong links are derived.</span></div>
      <div class="hint"><span class="glyph">03</span><span><b>Click a day.</b> Its metric and reading children open inward, so the rest of the window stays visible while the day is unfolded.</span></div>
    </div>`;
}

function renderVariablePanel(key) {
  const variable = state.model.variableByKey[key];
  if (!variable) return;
  const links = state.model.edgeList.filter((edge) => edge.source === key || edge.target === key);
  const high = [...state.model.days].filter((day) => typeof variable.series[day.index] === "number").sort((a, b) => variable.series[b.index] - variable.series[a.index]).slice(0, 5);
  const low = [...state.model.days].filter((day) => typeof variable.series[day.index] === "number").sort((a, b) => variable.series[a.index] - variable.series[b.index]).slice(0, 3);
  const constant = variable.constant;
  panelEl.innerHTML = `
    <div class="eyebrow"><span>Variable</span><span class="live"><i style="background:${variable.color}"></i>${variable.n} days</span></div>
    <h2 class="var-title"><i style="background:${variable.color}"></i>${esc(variable.label)}</h2>
    <div class="hero-stat"><span class="num" style="color:${variable.color}">${constant ? "—" : esc(variableMean(variable))}</span><span class="unit">${esc(variable.unit)}${constant ? "" : " · mean"}</span></div>
    <p class="date-sub">${constant ? "Constant across the window; no variance to relate." : `Range ${esc(formatValue(variable, variable.min))}–${esc(formatValue(variable, variable.max))} · ${variable.n} complete days`}</p>
    ${constant ? "" : sparkline(variable)}
    <div class="section-head">Derived links <span>click to inspect</span></div>
    ${links.length ? links.map((edge) => edgeRow(edge)).join("") : '<div class="empty-state">No derived links for this variable.</div>'}
    <div class="section-head">Highest days <span>click to open</span></div>
    ${high.map((day) => dayRow(day, variable)).join("")}
    <div class="section-head">Lowest days</div>
    ${low.map((day) => dayRow(day, variable)).join("")}
    <div class="method-note">Links are Pearson correlations over the whole 90-day window. Next-day links use 89 adjacent day pairs.</div>`;
}

function renderDayPanel(index) {
  const day = state.model.dayByIndex.get(index);
  if (!day) return renderOverviewPanel();
  const readings = day.readings.map((reading) => {
    const band = bandOf(reading.props?.value);
    return `<div class="reading-row${state.readingId === reading.id ? " is-active" : ""}" data-reading="${esc(reading.id)}" data-day-index="${index}">
      <span class="t">${esc(readingTime(reading))}</span>
      <span class="v" style="color:${bandColor(band)}">${esc(Math.round(reading.props?.value ?? 0))}</span>
      <span class="s">mg/dL</span>
    </div>`;
  }).join("");
  const metrics = ["Steps", "HeartRate", "ActiveMinutes", "Sedentary"].map((key) => {
    const metric = day.metrics[key];
    if (!metric) return "";
    const variable = state.model.variableByKey[key];
    return `<div class="metric-row${state.metricKey === key ? " is-active" : ""}" data-metric="${key}" data-day-index="${index}">
      <i style="background:${variable.color}"></i><span class="name">${esc(variable.label)}</span><span class="val">${esc(formatValue(variable, metricValue(metric)))} ${esc(variable.unit)}</span>
    </div>`;
  }).join("");
  const related = state.model.edgeList.filter((edge) => {
    const sourceVar = state.model.variableByKey[edge.source];
    const targetVar = state.model.variableByKey[edge.target];
    return (day.metrics[edge.source] || edge.source === "Glucose") && (day.metrics[edge.target] || edge.target === "Glucose")
      && (edge.source !== "Intensity" && edge.target !== "Intensity");
  }).slice(0, 5);

  panelEl.innerHTML = `
    <div class="eyebrow"><span>Selected day</span><span class="live"><i></i>${day.readingCount} readings</span></div>
    <h2 class="date-title">${esc(day.label)}</h2>
    <p class="date-sub">${esc(day.long)} · ${day.inRange} of ${day.readingCount} readings in range${day.intensity ? ` · ${esc(day.intensity.toLowerCase())} intensity` : ""}</p>
    <div class="section-head">Readings <span>click to follow</span></div>
    ${readings || '<div class="empty-state">No readings logged.</div>'}
    <div class="section-head">That day <span>click to open the metric</span></div>
    ${metrics || '<div class="empty-state">No metrics recorded.</div>'}
    <div class="stat"><span>Intensity</span><span>${esc(day.intensity || "—")}</span></div>
    <div class="section-head">Relationship context</div>
    ${related.map((edge) => edgeRow(edge)).join("") || '<div class="empty-state">No derived links for this day.</div>'}
    <div class="method-note">The derived links are whole-window aggregates. This day is one of the observations behind them, not the definition of them.</div>
    <button class="ghost" data-action="collapse">Collapse day cluster</button>
    <button class="ghost" data-action="overview">Back to the whole graph</button>`;
}

function renderReadingPanel(index, reading) {
  const day = state.model.dayByIndex.get(index);
  const band = bandOf(reading.props?.value);
  const siblings = day.readings.filter((item) => item.id !== reading.id);
  panelEl.innerHTML = `
    <div class="eyebrow"><span>Selected reading</span><span class="live"><i></i>${esc(day.label)}</span></div>
    <div class="hero-stat"><span class="num" style="color:${bandColor(band)}">${esc(Math.round(reading.props?.value ?? 0))}</span><span class="unit">mg/dL</span></div>
    <p class="date-sub">${esc(day.long)} · ${esc(readingTime(reading))}</p>
    <span class="status-chip ${band}"><i></i>${esc(bandText(band))}</span>
    <div class="section-head">Properties</div>
    <div class="properties">${Object.entries(reading.props || {}).map(([key, value]) => `<div class="property"><span>${esc(key)}</span><span>${esc(typeof value === "number" ? Math.round(value * 10) / 10 : value)}</span></div>`).join("")}</div>
    <div class="section-head">Connected to</div>
    <div class="stat"><span>Day</span><span>${esc(day.label)}</span></div>
    <div class="stat"><span>User</span><span>${esc(userInitials())} · ${esc(userName())}</span></div>
    ${siblings.length ? `<div class="section-head">Other readings that day</div>${siblings.map((item, index2) => `<div class="reading-row" data-reading="${esc(item.id)}" data-day-index="${index}"><span class="t">${esc(readingTime(item))}</span><span class="v" style="color:${bandColor(bandOf(item.props?.value))}">${esc(Math.round(item.props?.value ?? 0))}</span><span class="s">mg/dL</span></div>`).join("")}` : ""}
    <button class="ghost" data-action="day">Back to ${esc(day.label)}</button>`;
}

function renderMetricPanel(index, key) {
  const day = state.model.dayByIndex.get(index);
  const metric = day.metrics[key];
  const variable = state.model.variableByKey[key];
  if (!metric) return renderDayPanel(index);
  const others = ["Steps", "HeartRate", "ActiveMinutes", "Sedentary"].filter((item) => item !== key && day.metrics[item]);
  panelEl.innerHTML = `
    <div class="eyebrow"><span>Selected metric</span><span class="live"><i style="background:${variable.color}"></i>${esc(day.label)}</span></div>
    <div class="hero-stat"><span class="num" style="color:${variable.color}">${esc(formatValue(variable, metricValue(metric)))}</span><span class="unit">${esc(variable.unit)}</span></div>
    <p class="date-sub">${esc(day.long)} · one of the day's four activity variables</p>
    <div class="section-head">Connected day</div>
    <div class="stat"><span>Day</span><span>${esc(day.label)}</span></div>
    <div class="stat"><span>User</span><span>${esc(userInitials())} · ${esc(userName())}</span></div>
    <div class="section-head">Other metrics that day</div>
    ${others.map((item) => `<div class="metric-row" data-metric="${item}" data-day-index="${index}"><i style="background:${state.model.variableByKey[item].color}"></i><span class="name">${esc(state.model.variableByKey[item].label)}</span><span class="val">${esc(formatValue(state.model.variableByKey[item], metricValue(day.metrics[item])))}</span></div>`).join("")}
    <div class="section-head">Derived links for this variable</div>
    ${state.model.edgeList.filter((edge) => edge.source === key || edge.target === key).map((edge) => edgeRow(edge)).join("") || '<div class="empty-state">No derived links.</div>'}
    <button class="ghost" data-action="day">Back to ${esc(day.label)}</button>`;
}

function renderEdgePanel(edge) {
  const source = state.model.variableByKey[edge.source];
  const target = state.model.variableByKey[edge.target];
  const evidence = edge.evidence || [];
  panelEl.innerHTML = `
    <div class="eyebrow"><span>Derived relationship</span><span class="live"><i style="background:${edgeColor(edge)}"></i>${edge.kind === "next" ? "next day" : "same day"}</span></div>
    <h2 class="var-title">${esc(source.short)} <span class="arrow">${edge.kind === "next" ? "→" : "↔"}</span> ${esc(target.short)}</h2>
    <div class="hero-stat"><span class="num" style="color:${edgeColor(edge)}">${signed(edge.r)}</span><span class="unit">Pearson r <!-- · ${strengthLabel(edge.r)} --></span></div>
    <p class="date-sub">${esc(edgeSentence(edge))} · n = ${edge.n} <!-- · ${fmtP(edge.p)} --></p>
    <div class="method-note full">This is computed across the entire window, not from the selected day. ${edge.kind === "next" ? "The pair is day t → day t+1 (89 transitions)." : "The pair is the same day (90 days)."}</div>
    <div class="section-head">Scatter <span>whole window</span></div>
    ${scatterSvg(edge, source, target)}
    <div class="section-head">Strongest evidence <span>click to open a day</span></div>
    ${evidence.map((item) => `<div class="evidence-row" data-day="${item.sourceIndex}">
      <span class="date">${esc(item.sourceLabel)}${edge.kind === "next" ? ` <span class="mut">→</span> ${esc(item.targetLabel)}` : ""}</span>
      <span class="vals"><b style="color:${source.color}">${esc(formatValue(source, item.sourceValue))}</b> <span class="mut">·</span> <b style="color:${target.color}">${esc(formatValue(target, item.targetValue))}</b></span>
      <!-- <span class="z">${signed(item.zx, 1)} · ${signed(item.zy, 1)}</span> -->
    </div>`).join("")}
    <div class="section-head">Path shape</div>
    <div class="path-shape"><span style="color:${source.color}">${esc(source.short)}</span><span class="mut">→</span><span>day${edge.kind === "next" ? " t+1" : ""}</span><span class="mut">→</span><span style="color:${target.color}">${esc(target.short)}</span></div>
    <div class="method-note">Click a day in the evidence list to open its cluster and see the actual metric and reading nodes behind the aggregate.</div>`;
}

function edgeRow(edge, showKind = false) {
  const source = state.model.variableByKey[edge.source];
  const target = state.model.variableByKey[edge.target];
  return `<div class="edge-row" data-edge="${esc(edge.id)}">
    <span class="edge-swatch" style="background:${edgeColor(edge)}"></span>
    <span class="edge-name"><b style="color:${source.color}">${esc(source.short)}</b> <span class="mut">${edge.kind === "next" ? "→ next" : "↔"}</span> <b style="color:${target.color}">${esc(target.short)}</b></span>
    <span class="edge-r">${signed(edge.r)}</span>
    <span class="edge-n">${showKind ? (edge.kind === "next" ? "t+1" : "same") : "n " + edge.n}</span>
  </div>`;
}

function dayRow(day, variable) {
  const value = variable.series[day.index];
  return `<div class="day-row" data-day="${day.index}">
    <span class="date">${esc(day.label)}</span>
    <span class="val" style="color:${variable.color}">${esc(formatValue(variable, value))}</span>
    <span class="band-dot" style="background:${bandColor(day.band)}"></span>
  </div>`;
}

function sparkline(variable) {
  const values = variable.series.filter((value) => typeof value === "number");
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 292;
  const height = 58;
  const points = variable.series.map((value, index) => {
    if (typeof value !== "number") return null;
    const x = (index / Math.max(1, variable.series.length - 1)) * width;
    const y = height - 6 - ((value - min) / span) * (height - 12);
    return [x, y];
  }).filter(Boolean);
  const d = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="spark-area" d="${d}L${width} ${height}L0 ${height}Z" style="fill:${variable.color}"/><path class="spark-line" d="${d}" style="stroke:${variable.color}"/></svg>`;
}

function scatterSvg(edge, source, target) {
  // use every pair in the window for the scatter
  const points = [];
  if (edge.kind === "same") {
    for (let index = 0; index < state.model.days.length; index++) {
      const x = source.series[index];
      const y = target.series[index];
      if (typeof x === "number" && typeof y === "number") points.push([x, y]);
    }
  } else {
    for (let index = 0; index < state.model.days.length - 1; index++) {
      const x = source.series[index];
      const y = target.series[index + 1];
      if (typeof x === "number" && typeof y === "number") points.push([x, y]);
    }
  }
  if (!points.length) return "";
  const width = 286;
  const height = 150;
  const pad = 18;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const project = ([x, y]) => [pad + ((x - minX) / spanX) * (width - pad * 2), height - pad - ((y - minY) / spanY) * (height - pad * 2)];
  // least squares line
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let index = 0; index < points.length; index++) {
    num += (xs[index] - meanX) * (ys[index] - meanY);
    den += (xs[index] - meanX) ** 2;
  }
  const slope = den ? num / den : 0;
  const lineFrom = project([minX, meanY + slope * (minX - meanX)]);
  const lineTo = project([maxX, meanY + slope * (maxX - meanX)]);
  const dots = points.map(([x, y]) => {
    const [px, py] = project([x, y]);
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.2" style="fill:${edgeColor(edge)}" opacity=".72"/>`;
  }).join("");
  return `<svg class="scatter" viewBox="0 0 ${width} ${height}" aria-label="Scatter plot of all day pairs">
    <line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>
    <line class="axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"/>
    <line x1="${lineFrom[0].toFixed(1)}" y1="${lineFrom[1].toFixed(1)}" x2="${lineTo[0].toFixed(1)}" y2="${lineTo[1].toFixed(1)}" style="stroke:${edgeColor(edge)}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".8"/>
    ${dots}
    <text x="${pad}" y="${height - 4}" class="axis-label">${esc(source.short)}</text>
    <text x="${pad}" y="${pad - 5}" class="axis-label">${esc(target.short)}${edge.kind === "next" ? " (next day)" : ""}</text>
  </svg>`;
}

/* -------------------------------------------------------------------- crumb */

function renderCrumb() {
  const bits = [`<button data-crumb="overview">${esc(userName())}</button>`];
  if (state.view === "variable") {
    const variable = state.model.variableByKey[state.variable];
    bits.push(`<b>${esc(variable.label)}</b>`);
  } else if (state.view === "day") {
    const day = state.model.dayByIndex.get(state.dayIndex);
    bits.push(`<b>${esc(day.label)}</b>`);
  } else if (state.view === "reading") {
    const day = state.model.dayByIndex.get(state.dayIndex);
    const reading = day.readings.find((item) => item.id === state.readingId);
    bits.push(`<button data-crumb="day">${esc(day.label)}</button>`);
    bits.push(`<b>${esc(readingTime(reading))} · ${esc(Math.round(reading.props?.value ?? 0))} mg/dL</b>`);
  } else if (state.view === "metric") {
    const day = state.model.dayByIndex.get(state.dayIndex);
    const variable = state.model.variableByKey[state.metricKey];
    bits.push(`<button data-crumb="day">${esc(day.label)}</button>`);
    bits.push(`<b>${esc(variable.label)}</b>`);
  } else if (state.view === "edge") {
    const edge = state.model.edgeById.get(state.edgeId);
    bits.push(`<b>${esc(edgeTitle(edge))}</b>`);
  } else {
    bits.push(`<b>whole graph</b>`);
  }
  const separator = '<span class="crumb-arrow">›</span>';
  crumbEl.innerHTML = bits.join(separator) + `<span class="crumb-note"><i></i>${state.view === "overview" ? "derived layer · all days" : "click background to reset"}</span>`;
}

/* ------------------------------------------------------------------ tooltip */

function showNodeTooltip(event, node) {
  const type = node.data("type");
  let html = "";
  if (type === "variable") {
    const variable = state.model.variableByKey[node.data("key")];
    html = `<b>${esc(variable.label)}</b><span>${variable.constant ? "Constant in this window" : `${esc(formatValue(variable, variable.mean))} ${esc(variable.unit)} mean · ${variable.n} days`}</span>`;
  } else if (type === "day") {
    const day = state.model.dayByIndex.get(node.data("dayIndex"));
    html = `<b>${esc(day.label)}</b><span>${day.readingCount} readings · ${esc(day.long)}</span><span>Steps ${esc(formatValue(state.model.variableByKey.Steps, day.metrics.Steps?.props?.count))} · glucose ${day.glucose == null ? "—" : Math.round(day.glucose)} mg/dL</span>`;
  } else if (type === "metric") {
    const variable = state.model.variableByKey[node.data("key")];
    html = `<b>${esc(variable.label)}</b><span>${esc(node.data("value"))} ${esc(variable.unit)} · ${esc(state.model.dayByIndex.get(node.data("dayIndex"))?.label)}</span>`;
  } else if (type === "reading") {
    const reading = state.model.dayByIndex.get(node.data("dayIndex"))?.readings.find((item) => item.id === node.data("readingId"));
    html = `<b>${esc(Math.round(reading?.props?.value ?? 0))} mg/dL</b><span>${esc(readingTime(reading))} · ${esc(bandText(node.data("band")))}</span>`;
  }
  showTipAt(event, html);
}

function showEdgeTooltip(event, edge) {
  if (edge.data("type") === "dayvar") {
    const variable = state.model.variableByKey[edge.data("variable")];
    const day = state.model.dayByIndex.get(edge.data("dayIndex"));
    showTipAt(event, `<b>stored relationship</b><span>${esc(day.label)} → ${esc(variable.label)} · HAS_${esc(edge.data("variable").replace(/([A-Z])/g, "_$1").toUpperCase())}</span>`);
    return;
  }
  const modelEdge = state.model.edgeById.get(edge.data("id"));
  if (!modelEdge) return;
  const source = state.model.variableByKey[modelEdge.source];
  const target = state.model.variableByKey[modelEdge.target];
  showTipAt(event, `<b>${esc(edgeTitle(modelEdge))}</b><span>${modelEdge.kind === "next" ? "next-day" : "same-day"} r ${signed(modelEdge.r)} · n ${modelEdge.n}</span>`);
}

function showTipAt(event, html) {
  if (!html) return;
  const rect = wrapEl.getBoundingClientRect();
  const pos = event.renderedPosition || { x: 0, y: 0 };
  tipEl.innerHTML = html;
  tipEl.classList.add("is-on");
  const x = Math.min(Math.max(pos.x + 14, 10), rect.width - 260);
  const y = Math.min(Math.max(pos.y + 14, 10), rect.height - 80);
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${y}px`;
}

function hideTip() {
  tipEl.classList.remove("is-on");
}
