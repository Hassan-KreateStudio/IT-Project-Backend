// Derived, whole-window analysis for the graph pages. Nothing here changes
// the stored graph: the variable-to-variable layer is computed at load time
// from every complete day in the payload.

export const VARIABLES = [
  { key: "Steps", label: "Steps", short: "Steps", unit: "steps", color: "#FF3DAB", kind: "activity", nodeLabel: "Steps" },
  { key: "HeartRate", label: "Heart rate", short: "Heart", unit: "bpm", color: "#3DFFE7", kind: "activity", nodeLabel: "Heart rate" },
  { key: "ActiveMinutes", label: "Active minutes", short: "Active", unit: "min", color: "#D8FF3C", kind: "activity", nodeLabel: "Active" },
  { key: "Sedentary", label: "Sedentary", short: "Sedentary", unit: "min", color: "#9A9A9A", kind: "activity", nodeLabel: "Sedentary" },
  { key: "Intensity", label: "Intensity", short: "Intensity", unit: "level", color: "#9B7BFF", kind: "activity", nodeLabel: "Intensity" },
  { key: "Glucose", label: "Glucose", short: "Glucose", unit: "mg/dL", color: "#4D7CFF", kind: "outcome", nodeLabel: "Glucose" },
];

export const VAR_BY_KEY = Object.fromEntries(VARIABLES.map((variable) => [variable.key, variable]));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const INTENSITY = { LIGHT: 1, MODERATE: 2, VIGOROUS: 3, INTENSE: 3, SEDENTARY: 0 };

export const shortDate = (stamp) => {
  if (!stamp) return "—";
  const date = new Date(`${stamp}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(stamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

export const longDate = (stamp) => {
  if (!stamp) return "";
  const date = new Date(`${stamp}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(stamp);
  return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
};

export const readingTime = (reading) => {
  const stamp = reading?.props?.recordedAt;
  if (!stamp) return "—";
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

// Same bands as glucose/contracts.GlucoseBand: in range is 70–180 inclusive.
export const bandOf = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value < 70) return "low";
  if (value > 180) return "high";
  return "in";
};

export const bandColor = (band) => ({ low: "#FF4D3A", high: "#FFB020", in: "#4D7CFF" }[band] || "#6E6E6E");
export const bandText = (band) => ({ low: "Low · under 70", high: "High · over 180", in: "In range 70–180" }[band] || "Unknown");

const metricNumber = (node) => {
  if (!node) return null;
  const props = node.props || {};
  if (node.label === "Steps") return typeof props.count === "number" ? props.count : null;
  if (node.label === "HeartRate") return typeof props.bpm === "number" ? props.bpm : null;
  if (node.label === "ActiveMinutes" || node.label === "Sedentary") return typeof props.minutes === "number" ? props.minutes : null;
  return null;
};

// scopePayload keeps a single patient's nodes. A payload that still contains
// several patients is refused so same-day and next-day correlations cannot
// pair one person's Monday with someone else's Tuesday.
export function scopePayload(payload) {
  const nodes = payload?.nodes || [];
  const edges = payload?.edges || [];
  const meta = payload?.meta || {};
  const days = nodes.filter((node) => node.label === "Day");
  const owners = [...new Set(days.map((day) => day.props?.patientId).filter(Boolean))];
  let patientId = String(meta.patientId || "").trim();
  if (!patientId) {
    if (owners.length === 1) {
      patientId = owners[0];
    } else if (owners.length === 0) {
      const patients = nodes.filter((node) => node.label === "User" && String(node.props?.role || "").toUpperCase() === "PATIENT");
      if (patients.length === 1) patientId = String(patients[0].props?.id || "");
      else if (patients.length > 1) throw new Error("multiple patients; pass user as an id or email");
    } else {
      throw new Error("multiple patients; pass user as an id or email");
    }
  }
  if (!patientId) return { ...payload, nodes, edges, meta };

  const keep = new Set();
  for (const node of nodes) {
    if (node.props?.patientId === patientId) keep.add(node.id);
    if (node.label === "User" && node.props?.id === patientId) keep.add(node.id);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (let pass = 0; pass < 4; pass++) {
    for (const edge of edges) {
      if (!keep.has(edge.start) || keep.has(edge.end)) continue;
      const next = byId.get(edge.end);
      if (!next || next.label === "User") continue;
      if (next.props?.patientId && next.props.patientId !== patientId) continue;
      keep.add(next.id);
    }
  }
  const scopedNodes = nodes.filter((node) => keep.has(node.id));
  const scopedEdges = edges.filter((edge) => keep.has(edge.start) && keep.has(edge.end));
  return {
    ...payload,
    nodes: scopedNodes,
    edges: scopedEdges,
    meta: {
      ...meta,
      patientId,
      nodeCount: scopedNodes.length,
      edgeCount: scopedEdges.length,
    },
  };
}

export function prepare(payload) {
  const scoped = scopePayload(payload);
  const nodes = scoped.nodes || [];
  const edges = scoped.edges || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const out = new Map();
  const inn = new Map();
  for (const edge of edges) {
    if (!out.has(edge.start)) out.set(edge.start, []);
    if (!inn.has(edge.end)) inn.set(edge.end, []);
    out.get(edge.start).push(edge);
    inn.get(edge.end).push(edge);
  }

  const users = nodes.filter((node) => node.label === "User");
  const dayOwnerIds = new Set(
    nodes
      .filter((node) => node.label === "Day")
      .map((node) => node.props?.patientId)
      .filter(Boolean),
  );
  const user = users.find((node) => dayOwnerIds.has(node.props?.id))
    || users.find((node) => String(node.props?.role || "").toUpperCase() === "PATIENT")
    || users.find((node) => String(node.props?.role || "").toUpperCase() !== "CAREGIVER")
    || users[0]
    || null;
  // Day.date is the patient-local calendar day (the phone's hk:yyyy-MM-dd, or
  // Africa/Nairobi). recordedAt is an instant and is not the day key: Nairobi
  // midnight is still the previous date in UTC. Same-day and next-day pairs
  // below line up by this date, so glucose and activity share one day.
  const dayNodes = nodes
    .filter((node) => node.label === "Day")
    .sort((a, b) => String(a.props?.date || "").localeCompare(String(b.props?.date || "")));

  const days = dayNodes.map((node, index) => {
    const children = (out.get(node.id) || []).map((edge) => byId.get(edge.end)).filter(Boolean);
    const metrics = {};
    for (const label of ["Steps", "HeartRate", "ActiveMinutes", "Sedentary"]) {
      const metric = children.find((child) => child.label === label);
      if (metric) metrics[label] = metric;
    }
    const readings = children
      .filter((child) => child.label === "GlucoseReading")
      .sort((a, b) => String(a.props?.recordedAt || "").localeCompare(String(b.props?.recordedAt || "")));
    const values = readings.map((reading) => reading.props?.value).filter((value) => typeof value === "number");
    const glucose = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return {
      index,
      node,
      id: node.id,
      date: node.props?.date || "",
      label: shortDate(node.props?.date),
      long: longDate(node.props?.date),
      metrics,
      readings,
      glucose,
      readingCount: readings.length,
      inRange: readings.filter((reading) => bandOf(reading.props?.value) === "in").length,
      intensity: node.props?.intensity ? String(node.props.intensity).toUpperCase() : null,
      band: bandOf(glucose),
    };
  });

  const series = {};
  for (const variable of VARIABLES) {
    if (variable.key === "Glucose") {
      series[variable.key] = days.map((day) => day.glucose);
    } else if (variable.key === "Intensity") {
      series[variable.key] = days.map((day) => (day.intensity ? INTENSITY[day.intensity] ?? null : null));
    } else {
      series[variable.key] = days.map((day) => metricNumber(day.metrics[variable.key]));
    }
  }

  const variables = VARIABLES.map((variable) => {
    const values = series[variable.key].filter((value) => typeof value === "number" && Number.isFinite(value));
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0;
    return {
      ...variable,
      values,
      mean,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      sd: Math.sqrt(variance),
      n: values.length,
      constant: values.length > 0 && variance < 1e-12,
      series: series[variable.key],
    };
  });

  const sameEdges = [];
  const nextEdges = [];
  for (let a = 0; a < variables.length; a++) {
    for (let b = a + 1; b < variables.length; b++) {
      const A = variables[a];
      const B = variables[b];
      const stat = correlation(A.series, B.series);
      if (!stat) continue;
      const edge = {
        id: `same-${A.key}-${B.key}`,
        kind: "same",
        source: A.key,
        target: B.key,
        r: stat.r,
        n: stat.n,
        p: pValue(stat.r, stat.n),
        strength: Math.abs(stat.r),
        direction: stat.r >= 0 ? "positive" : "negative",
      };
      edge.evidence = evidenceFor(stat.pairs, days, A, B, "same");
      sameEdges.push(edge);
    }
  }
  for (const A of variables) {
    for (const B of variables) {
      if (A.key === B.key) continue;
      const stat = laggedCorrelation(A.series, B.series);
      if (!stat) continue;
      if (Math.abs(stat.r) < 0.15) continue;
      const edge = {
        id: `next-${A.key}-${B.key}`,
        kind: "next",
        source: A.key,
        target: B.key,
        r: stat.r,
        n: stat.n,
        p: pValue(stat.r, stat.n),
        strength: Math.abs(stat.r),
        direction: stat.r >= 0 ? "positive" : "negative",
      };
      edge.evidence = evidenceFor(stat.pairs, days, A, B, "next");
      nextEdges.push(edge);
    }
  }

  const edgeById = new Map([...sameEdges, ...nextEdges].map((edge) => [edge.id, edge]));
  const edgeList = [...sameEdges, ...nextEdges].sort((a, b) => b.strength - a.strength);

  return {
    payload: scoped,
    nodes,
    edges,
    byId,
    out,
    inn,
    user,
    days,
    dayByIndex: new Map(days.map((day) => [day.index, day])),
    series,
    variables,
    variableByKey: Object.fromEntries(variables.map((variable) => [variable.key, variable])),
    sameEdges,
    nextEdges,
    edgeById,
    edgeList,
    meta: scoped.meta || {},
  };
}

function correlation(a, b) {
  const pairs = [];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = a[index];
    const y = b[index];
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y, index, index]);
  }
  if (pairs.length < 3) return null;
  const r = pearson(pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1]));
  if (!Number.isFinite(r)) return null;
  return { r, n: pairs.length, pairs };
}

function laggedCorrelation(a, b) {
  const pairs = [];
  for (let index = 0; index < Math.min(a.length, b.length) - 1; index++) {
    const x = a[index];
    const y = b[index + 1];
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y, index, index + 1]);
  }
  if (pairs.length < 3) return null;
  const r = pearson(pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1]));
  if (!Number.isFinite(r)) return null;
  return { r, n: pairs.length, pairs };
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return NaN;
  const ma = a.reduce((sum, value) => sum + value, 0) / n;
  const mb = b.reduce((sum, value) => sum + value, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let index = 0; index < n; index++) {
    const x = a[index] - ma;
    const y = b[index] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da < 1e-12 || db < 1e-12) return NaN;
  return num / Math.sqrt(da * db);
}

function pValue(r, n) {
  if (!Number.isFinite(r) || n < 4) return null;
  if (Math.abs(r) >= 0.999999) return 0;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))) * Math.sqrt(n - 3);
  return 2 * (1 - normalCdf(Math.abs(z)));
}

function normalCdf(z) {
  // Abramowitz–Stegun 7.1.26
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function evidenceFor(pairs, days, A, B, kind) {
  if (!pairs.length) return [];
  const valuesA = pairs.map((pair) => pair[0]);
  const valuesB = pairs.map((pair) => pair[1]);
  const meanA = valuesA.reduce((sum, value) => sum + value, 0) / valuesA.length;
  const meanB = valuesB.reduce((sum, value) => sum + value, 0) / valuesB.length;
  const sdA = Math.sqrt(valuesA.reduce((sum, value) => sum + (value - meanA) ** 2, 0) / Math.max(1, valuesA.length - 1)) || 1;
  const sdB = Math.sqrt(valuesB.reduce((sum, value) => sum + (value - meanB) ** 2, 0) / Math.max(1, valuesB.length - 1)) || 1;
  return pairs
    .map(([x, y, sourceIndex, targetIndex]) => {
      const zx = (x - meanA) / sdA;
      const zy = (y - meanB) / sdB;
      const sourceDay = days[sourceIndex];
      const targetDay = days[targetIndex];
      return {
        sourceIndex,
        targetIndex,
        sourceDate: sourceDay?.date,
        targetDate: targetDay?.date,
        sourceLabel: sourceDay ? shortDate(sourceDay.date) : "—",
        targetLabel: targetDay ? shortDate(targetDay.date) : "—",
        sourceValue: x,
        targetValue: y,
        zx,
        zy,
        contribution: Math.abs(zx * zy),
        direction: zx * zy >= 0 ? "together" : "opposite",
      };
    })
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 8);
}

export function formatValue(variable, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (variable.key === "Glucose") return `${Math.round(value)}`;
  if (variable.key === "Steps") return Math.round(value).toLocaleString();
  if (variable.key === "Intensity") return value === 1 ? "Light" : value === 2 ? "Moderate" : value === 3 ? "Vigorous" : String(value);
  return `${Math.round(value)}`;
}

// describeP is the Fisher z test of a correlation, shown as a short label.
// Significant means p < 0.05.
export function describeP(value) {
  if (value == null || !Number.isFinite(value)) return { text: "—", significant: false, known: false };
  const significant = value < 0.05;
  const figure = value < 0.001 ? "p < 0.001" : `p = ${String(Number(value.toFixed(3)))}`;
  const verdict = significant ? "significant" : "not significant";
  return { text: `${figure} (${verdict})`, significant, known: true };
}

export function strengthLabel(r) {
  const value = Math.abs(r);
  if (value >= 0.5) return "strong";
  if (value >= 0.3) return "moderate";
  if (value >= 0.15) return "weak";
  return "negligible";
}
