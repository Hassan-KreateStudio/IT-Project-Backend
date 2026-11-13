// Guided sequence for /graph/advanced/. Numbers come from /graph/data findings.
// The picture is built from that same response.

import { bindAudio, cueEntrance, cueScreen } from "./sound.mjs";

try { bindAudio(); } catch (e) {}

function graphRoot() {
  const path = location.pathname;
  const at = path.indexOf("/graph");
  return at >= 0 ? path.slice(0, at + "/graph".length) : "";
}

function dataURL() {
  const url = new URL(graphRoot() + "/data", location.origin);
  const params = new URLSearchParams(location.search);
  const user = params.get("user") || params.get("userId") || params.get("id") || params.get("email");
  if (user) url.searchParams.set("user", user);
  return url.pathname + url.search;
}

async function loadGraph() {
  const response = await fetch(dataURL());
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body && body.error) || "request failed (" + response.status + ")");
  return body;
}

function showEmpty(copy) {
  document.body.classList.add("is-empty");
  const text = document.getElementById("empty-copy");
  if (copy && text) text.textContent = copy;
}

function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRaw(payload) {
  const nodes = payload.nodes || [];
  const edges = payload.edges || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const user = nodes.find((node) => node.label === "User");
  const profileNode = nodes.find((node) => node.label === "Profile");
  const days = nodes
    .filter((node) => node.label === "Day")
    .sort((a, b) => String(a.props?.date || "").localeCompare(String(b.props?.date || "")));
  return {
    name: user?.props?.displayName || "",
    initials: user?.props?.initials || "KH",
    profile: {
      age: num(profileNode?.props?.age) || 0,
      cm: num(profileNode?.props?.heightCm) || 0,
      kg: num(profileNode?.props?.weightKg) || 0,
      bmi: num(profileNode?.props?.bmi) || 0,
    },
    days: days.map((day) => {
      const children = edges.filter((edge) => edge.start === day.id).map((edge) => byId.get(edge.end)).filter(Boolean);
      const steps = children.find((node) => node.label === "Steps");
      const active = children.find((node) => node.label === "ActiveMinutes");
      const sed = children.find((node) => node.label === "Sedentary");
      const hr = children.find((node) => node.label === "HeartRate");
      const readings = children
        .filter((node) => node.label === "GlucoseReading")
        .sort((a, b) => String(a.props?.recordedAt || "").localeCompare(String(b.props?.recordedAt || "")));
      return {
        d: day.props?.date || "",
        s: num(steps?.props?.count),
        a: num(active?.props?.minutes) ?? 0,
        e: num(sed?.props?.minutes) ?? 0,
        h: hr && hr.props && hr.props.bpm != null ? num(hr.props.bpm) : null,
        t: day.props?.intensity || "",
        g: readings.map((reading) => num(reading.props?.value)).filter((value) => value != null),
        gt: readings.map((reading) => reading.props?.recordedAt),
      };
    }),
  };
}

(async function () {
  let payload;
  try {
    payload = await loadGraph();
  } catch (error) {
    showEmpty(error && error.message);
    return;
  }
  const FINDINGS = payload.findings || null;
  const RAW = toRaw(payload);
  if (!RAW.days.length || !RAW.days.some((day) => day.g.length)) {
    showEmpty();
    return;
  }

const C = {
  ink:"#0A0A0A", night:"#161616", flare:"#FF3DAB", acid:"#D8FF3C", aurora:"#3DFFE7",
  text:"#F6F4F0", second:"#E2E2E2", mute:"#6E6E6E",
  alert:"#FF4D3A", warn:"#FFB020", info:"#4D7CFF",
  canvas:"#F6F4F0", sed:"#9B7BFF",
  sleep:"#8B9AAB",
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const TAU = Math.PI * 2;
const reduceMotion = () =>
  document.body.classList.contains("is-reduced") ||
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0;
const fmt = n => Math.round(n).toLocaleString("en-US");
const fmt1 = n => {
  /* One decimal, matching Python 3's round(n, 1) / format('.1f') on these
     averages (193.35 → 193.3, 191.95 → 191.9, 202.5 → 202.5). */
  return (Math.round(n * 10 - 1e-8) / 10).toFixed(1);
};
const fmtR = r => {
  const v = Math.round(r * 100) / 100;
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return sign + Math.abs(v).toFixed(2);
};
const stepBand = s => s == null ? null : s < 5000 ? "low" : s <= 10000 ? "mid" : "high";
const gState = v => v == null ? null : v < 70 ? "low" : v > 180 ? "high" : "in";
const gColor = v => ({ low:C.warn, high:C.alert, in:C.acid }[gState(v)] || "#888");
const eatClock = iso => {
  const d = new Date(iso);
  const h = (d.getUTCHours() + 3) % 24;
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};
const slotOf = iso => {
  const h = (new Date(iso).getUTCHours() + 3) % 24;
  return h < 10 ? { name:"Fasting", time:eatClock(iso) }
       : h < 16 ? { name:"After lunch", time:eatClock(iso) }
                : { name:"After dinner", time:eatClock(iso) };
};
const longDate = s => {
  const d = new Date(s + "T00:00:00");
  return `${WEEK[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const shortDate = s => {
  const d = new Date(s + "T00:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const titleCase = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

const days = RAW.days.map((d, i) => {
  const readings = d.g.map((v, j) => ({ v, at: d.gt[j], ...slotOf(d.gt[j]) }));
  const avg = mean(readings.map(r => r.v));
  return {
    i, date:d.d, steps:d.s, active:d.a, sed:d.e, hr:d.h, intensity:d.t,
    readings, avg, band: stepBand(d.s),
  };
});
const lowDays = days.filter(d => d.band === "low");
const midDays = days.filter(d => d.band === "mid");
const highDays = days.filter(d => d.band === "high");
const STATS = {
  lowN: lowDays.length,
  lowAvg: mean(lowDays.map(d => d.avg)),
  lowOver: lowDays.filter(d => d.avg > 180).length,
  midN: midDays.length,
  midAvg: mean(midDays.map(d => d.avg)),
  midOver: midDays.filter(d => d.avg > 180).length,
  highN: highDays.length,
};
function pearson(xs, ys){
  const n = xs.length; if (n < 3) return NaN;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let k = 0; k < n; k++){ const a = xs[k]-mx, b = ys[k]-my; num += a*b; dx += a*a; dy += b*b; }
  return dx < 1e-12 || dy < 1e-12 ? NaN : num / Math.sqrt(dx*dy);
}
function strengthOf(r){
  const a = Math.abs(r);
  if (!Number.isFinite(r) || a < 0.1) return "none";
  if (a >= 0.5) return "strong";
  if (a >= 0.3) return "moderate";
  return "weak";
}
const stepsPairs = days.filter(d => Number.isFinite(d.steps) && Number.isFinite(d.avg));
const stepsR = pearson(stepsPairs.map(d => d.steps), stepsPairs.map(d => d.avg));
const stepsStrength = strengthOf(stepsR);
const nov = days[days.length - 1];


/* Streaks and lag — every figure is computed from the days, never hard-coded.
   Position-within-run averages use every low-step run (including 1–2 day
   runs), matching lag.py. Streaks themselves are the runs of 3+ days. */
function findLowRuns(){
  const runs = [];
  let i = 0;
  while (i < days.length){
    if (days[i].band === "low"){
      let j = i;
      while (j < days.length && days[j].band === "low") j++;
      runs.push({
        i, j, len: j - i,
        start: days[i], end: days[j - 1],
        after: j < days.length ? days[j] : null,
      });
      i = j;
    } else i++;
  }
  return runs;
}
function shortRange(a, b){
  const da = new Date(a + "T00:00:00"), db = new Date(b + "T00:00:00");
  if (da.getMonth() === db.getMonth()){
    return `${da.getDate()}–${db.getDate()} ${MONTHS[da.getMonth()]}`;
  }
  return `${da.getDate()} ${MONTHS[da.getMonth()]} – ${db.getDate()} ${MONTHS[db.getMonth()]}`;
}
const lowRuns = findLowRuns();
const streaks = lowRuns.filter(r => r.len >= 3);
const longest = streaks.length ? streaks.reduce((a, b) => a.len >= b.len ? a : b) : { len:0, i:0, j: days.length ? 1 : 0, start: days[0], end: days[0], after: null };
const afterAvgs = streaks.filter(s => s.after).map(s => s.after.avg);
const posBuckets = [[], [], [], []];
for (const r of lowRuns){
  for (let k = r.i; k < r.j; k++){
    posBuckets[Math.min(k - r.i, 3)].push(days[k].avg);
  }
}
const inStreak = new Set();
const inLongest = new Set();
const isAfter = new Set();
for (const r of streaks){
  for (let k = r.i; k < r.j; k++) inStreak.add(k);
  if (r === longest) for (let k = r.i; k < r.j; k++) inLongest.add(k);
  if (r.after) isAfter.add(r.after.i);
}
const STREAKS = {
  n: streaks.length,
  longest: longest.len,
  longestStart: longest.start.date,
  longestEnd: longest.end.date,
  longestWhen: shortRange(longest.start.date, longest.end.date),
  afterAvg: mean(afterAvgs),
  afterAllInRange: afterAvgs.every(a => a <= 180),
  afterN: afterAvgs.length,
  pos: posBuckets.map(xs => mean(xs)),
  runs: streaks,
  inStreak, inLongest, isAfter,
};


/* The camera on Stop 2 zooms into this one streak: the longest run, plus
   the day that follows it. Averages are of this streak only. */
const focusDays = [];
for (let k = longest.i; k < longest.j; k++) focusDays.push(days[k]);
const focusAfter = longest.after;
const focusChain = focusAfter ? focusDays.concat(focusAfter) : focusDays.slice();
const FOCUS = {
  days: focusDays,
  after: focusAfter,
  chain: focusChain,
  set: new Set(focusChain.map(d => d.i)),
  streakSet: new Set(focusDays.map(d => d.i)),
  afterI: focusAfter ? focusAfter.i : -1,
  n: focusDays.length,
  streakAvg: mean(focusDays.map(d => d.avg)),
  afterAvg: focusAfter ? focusAfter.avg : NaN,
  afterInRange: !!(focusAfter && focusAfter.avg <= 180 && focusAfter.readings.every(r => r.v <= 180)),
  when: STREAKS.longestWhen,
  afterWhen: focusAfter ? shortDate(focusAfter.date) : "",
  afterLong: focusAfter ? longDate(focusAfter.date) : "",
};
function focusIndex(d){
  if (!d) return -1;
  return focusChain.findIndex(x => x.i === d.i);
}

const lagPairs = [];
for (let i = 0; i < days.length - 1; i++) lagPairs.push({ today: days[i], tomorrow: days[i + 1] });
const nextFastBy = band => {
  const xs = lagPairs.filter(p => p.today.band === band).map(p => p.tomorrow.readings[0].v);
  return { n: xs.length, mean: xs.length ? mean(xs) : NaN };
};
const afterLow = nextFastBy("low");
const afterMid = nextFastBy("mid");
const nextRfast = pearson(lagPairs.map(p => p.today.steps), lagPairs.map(p => p.tomorrow.readings[0].v));
const nextRavg  = pearson(lagPairs.map(p => p.today.steps), lagPairs.map(p => p.tomorrow.avg));
const sameRfast = pearson(days.map(d => d.steps), days.map(d => d.readings[0].v));
const LAG = {
  sameR: stepsR,
  sameRfast,
  sameStrength: stepsStrength,
  nextRfast,
  nextRavg,
  nextStrength: strengthOf(nextRfast),
  nextFastLow: afterLow.mean,
  nextFastMid: afterMid.mean,
  nextFastLowN: afterLow.n,
  nextFastMidN: afterMid.n,
  pairs: lagPairs.length,
};


/* Representative sample — evenly spaced, stratified so the over-180
   share of the low-step sample matches the full 38/51. Nov 11 is
   always included because Stop 1b zooms into that day. */
function evenly(arr, n){
  if (n >= arr.length) return arr.slice();
  if (n <= 0) return [];
  const out = [], used = new Set();
  for (let i = 0; i < n; i++){
    let idx = Math.round(i * (arr.length - 1) / Math.max(n - 1, 1));
    while (used.has(idx)) idx = (idx + 1) % arr.length;
    used.add(idx);
    out.push(arr[idx]);
  }
  return out;
}
function sampleLowDays(arr, n, must){
  const over = arr.filter(d => d.avg > 180);
  const inn  = arr.filter(d => d.avg <= 180);
  let nOver = Math.round((over.length / arr.length) * n);
  nOver = Math.max(must && must.avg > 180 ? 1 : 0, Math.min(over.length, nOver));
  let nIn = n - nOver;
  nIn = Math.max(must && must.avg <= 180 ? 1 : 0, Math.min(inn.length, nIn));
  nOver = n - nIn;
  const so = evenly(over, nOver);
  const si = evenly(inn, nIn);
  const put = (list, item) => {
    if (!item || list.includes(item)) return;
    list[list.length - 1] = item;
  };
  if (must && must.avg > 180) put(so, must); else if (must) put(si, must);
  return [...so, ...si].sort((a,b) => a.i - b.i);
}
const SAMPLE_N = 12;
const sampleLow = sampleLowDays(lowDays, SAMPLE_N, nov);
const sampleMid = evenly(midDays, SAMPLE_N);
const sampleLowSet = new Set(sampleLow.map(d => d.i));
const sampleMidSet = new Set(sampleMid.map(d => d.i));
const haloLow = lowDays.filter(d => !sampleLowSet.has(d.i));
const haloMid = midDays.filter(d => !sampleMidSet.has(d.i));
sampleLow.forEach((d, i) => d.sampleIdx = i);
sampleMid.forEach((d, i) => d.sampleIdx = i);
haloLow.forEach((d, i) => d.haloIdx = i);
haloMid.forEach((d, i) => d.haloIdx = i);

function roleOf(d){
  if (!d) return null;
  if (sampleLowSet.has(d.i)) return "sample-low";
  if (sampleMidSet.has(d.i)) return "sample-mid";
  if (d.band === "low") return "halo-low";
  if (d.band === "mid") return "halo-mid";
  return "high";
}

window.__computed = {
  ...STATS, nov, days: days.length, name: RAW.name, stepsR, stepsStrength,
  streaks: {
    n: STREAKS.n, longest: STREAKS.longest, when: STREAKS.longestWhen,
    afterAvg: STREAKS.afterAvg, afterAllInRange: STREAKS.afterAllInRange,
    pos: STREAKS.pos,
    focus: {
      n: FOCUS.n, when: FOCUS.when, afterWhen: FOCUS.afterWhen,
      streakAvg: FOCUS.streakAvg, afterAvg: FOCUS.afterAvg,
      afterInRange: FOCUS.afterInRange,
    },
  },
  lag: {
    sameR: LAG.sameR, sameRfast: LAG.sameRfast, sameStrength: LAG.sameStrength,
    nextRfast: LAG.nextRfast, nextRavg: LAG.nextRavg, nextStrength: LAG.nextStrength,
    nextFastLow: LAG.nextFastLow, nextFastMid: LAG.nextFastMid,
    nextFastLowN: LAG.nextFastLowN, nextFastMidN: LAG.nextFastMidN,
  },
  sampleLow: sampleLow.map(d => d.date),
  sampleMid: sampleMid.map(d => d.date),
  sampleLowOver: sampleLow.filter(d => d.avg > 180).length,
};

/* Reconstruct the full 726-node / 995-edge graph from the compact days. */
const ASPECT = 0.60;
const R = { profile: 230, day: 760, steps: 900, active: 1020, sed: 1140, hr: 1260, glu: 1420, sleep: 1600 };
const nodes = [];
const edges = [];
const addN = n => (nodes.push(n), n);
const addE = (a, b, type, color) => edges.push({ a, b, type, color });
const ell = (rx, t, aspect=ASPECT) => {
  const a = -Math.PI / 2 + t;
  return { x: rx * Math.cos(a), y: rx * aspect * Math.sin(a) };
};
const tDay = i => ((i + 0.5) / days.length) * TAU;
const tGlu = (i, j) => ((i * 3 + j + 0.5) / (days.length * 3)) * TAU;

const user = addN({ id:"user", kind:"user", x:0, y:0, r:86, color:C.flare, initials:RAW.initials, name:RAW.name });

const pItems = [
  { kind:"profile", color:"#C8C4BE", r:18 },
  { kind:"bmi",     color:"#A8A49E", r:14 },
  { kind:"weight",  color:"#A8A49E", r:14 },
  { kind:"height",  color:"#A8A49E", r:14 },
  { kind:"age",     color:"#A8A49E", r:14 },
];
const profileNodes = pItems.map((p, k) => {
  const t = Math.PI + (k - 2) * 0.22;
  const pos = ell(R.profile, t);
  return addN({ id:p.kind, kind:p.kind, ...pos, r:p.r, color:p.color });
});
const prof = profileNodes[0];
addE(user, prof, "HAS_PROFILE", "rgba(246,244,240,.28)");
addE(prof, profileNodes[1], "HAS_BMI", "rgba(246,244,240,.22)");
addE(prof, profileNodes[2], "HAS_WEIGHT", "rgba(246,244,240,.22)");
addE(prof, profileNodes[3], "HAS_HEIGHT", "rgba(246,244,240,.22)");
addE(prof, profileNodes[4], "HAS_AGE", "rgba(246,244,240,.22)");

const dayNodeOf = {};
const stepsNodeOf = {};
const gluNodesOf = {};
const metricOf = { active:{}, sed:{}, hr:{} };

for (const d of days) {
  const t = tDay(d.i);
  const dayN = addN({
    id:"day-"+d.i, kind:"day", day:d, ...ell(R.day, t), t,
    r:26, color:gColor(d.avg),
  });
  dayNodeOf[d.i] = dayN;
  addE(user, dayN, "HAS_DAY", gColor(d.avg));

  const mk = (kind, rx, color, value, unit, empty) => {
    const n = addN({
      id:`${kind}-${d.i}`, kind, day:d, ...ell(rx, t), t,
      r: empty ? 11 : 17, color, value, unit, empty: !!empty,
    });
    addE(dayN, n, "HAS_"+kind.toUpperCase(), color);
    return n;
  };
  stepsNodeOf[d.i] = mk("steps",  R.steps,  C.flare,  d.steps,  "steps");
  metricOf.active[d.i] = mk("active", R.active, C.canvas, d.active, "min");
  metricOf.sed[d.i]    = mk("sed",    R.sed,    C.sed,    d.sed,    "min");
  metricOf.hr[d.i]     = mk("hr",     R.hr,     C.info,   d.hr,     "bpm", d.hr == null);

  gluNodesOf[d.i] = [];
  for (let j = 0; j < d.readings.length; j++) {
    const r = d.readings[j];
    const n = addN({
      id:`glu-${d.i}-${j}`, kind:"glucose", day:d, reading:r, j,
      ...ell(R.glu, tGlu(d.i, j)),
      r:15, color:gColor(r.v), value:r.v, unit:"mg/dL",
    });
    gluNodesOf[d.i].push(n);
    addE(dayN, n, "HAS_GLUCOSE", gColor(r.v));
    addE(user, n, "GENERATES", gColor(r.v));
  }
}

/* Day-to-day NEXT, drawn only while the conclusion zoom is in play.
   The live headline counts stay the server totals. */
for (let i = 0; i < days.length - 1; i++){
  addE(dayNodeOf[i], dayNodeOf[i + 1], "NEXT", "rgba(61,255,231,.55)");
}

const NODE_COUNT = (FINDINGS && FINDINGS.nodeCount) || nodes.length;
const EDGE_COUNT = (FINDINGS && FINDINGS.edgeCount) || edges.length;
window.__computed.nodes = NODE_COUNT;
window.__computed.edges = EDGE_COUNT;
console.info("graph", NODE_COUNT, "nodes", EDGE_COUNT, "edges", STATS,
  "sampleLow", sampleLow.length, "over", window.__computed.sampleLowOver,
  "sampleMid", sampleMid.length,
  "streaks", window.__computed.streaks, "lag", window.__computed.lag);

/* -------------------------------------------------------------------------- */
/*  Layout targets for each stop                                              */
/* -------------------------------------------------------------------------- */
const MINI = {
  cx: 1180, cy: -40,
  aspect: 0.88,
  haloInner: 108, haloOuter: 168,
  dayR: 430, stepR: 575, gluR: 730,
  gluSpread: 0.11,
  aggR: 58, dayRs: 23, stepBase: 11, stepGain: 15, gluR0: 14, haloR: 7.5,
};
const novSampleIdx = sampleLow.findIndex(d => d === nov);

function miniPoint(side, radius, angle){
  const cx = side === "low" ? -MINI.cx : MINI.cx;
  return { x: cx + radius * Math.cos(angle), y: MINI.cy + radius * MINI.aspect * Math.sin(angle) };
}
function sampleAngle(side, idx, n){
  /* Nov 11 sits at angle 0 on the low graph — pointing toward the mid
     graph — so the later zoom into that day is a straight camera move. */
  const rot = side === "low" ? -novSampleIdx * (TAU / n) : 0;
  return rot + idx * (TAU / n);
}
function haloPoint(side, idx, n){
  const inner = idx % 2 === 0;
  const k = Math.floor(idx / 2);
  const nInner = Math.ceil(n / 2);
  const nOuter = Math.floor(n / 2);
  const count = inner ? nInner : nOuter;
  const radius = inner ? MINI.haloInner : MINI.haloOuter;
  const phase = inner ? 0 : Math.PI / Math.max(count, 1);
  const ang = phase + (k / Math.max(count, 1)) * TAU;
  return miniPoint(side, radius, ang);
}

/* Synthetic visuals — not counted in the 726 / 995, invisible on Stop 0. */
const extras = [];
const aggLow = {
  id:"agg-low", kind:"aggregate", band:"low",
  x: -MINI.cx, y: MINI.cy, r: MINI.aggR,
  color: gColor(STATS.lowAvg),
  label: "Under 5,000 steps",
  n: STATS.lowN, avg: STATS.lowAvg, over: STATS.lowOver,
};
const aggMid = {
  id:"agg-mid", kind:"aggregate", band:"mid",
  x: MINI.cx, y: MINI.cy, r: MINI.aggR,
  color: gColor(STATS.midAvg),
  label: "5,000–10,000 steps",
  n: STATS.midN, avg: STATS.midAvg, over: STATS.midOver,
};
extras.push(aggLow, aggMid);

/* Intensity is a property of the Day node, not a graph node of its own.
   We only materialise it as a visual on the one-day strand. */
const intensityNov = {
  id:"intensity-nov", kind:"intensity", day: nov,
  x: 0, y: 0, r: 20, color: C.aurora,
  value: nov.intensity, unit: "",
};
extras.push(intensityNov);

/* Example sleep ring — visual only, not counted in 726 / 995.
   Hours are a gentle uncorrelated wave, labelled as example data. */
const exampleSleep = i => {
  const h = 6.8 + 1.1 * Math.sin(i * 0.53 + 0.4) + 0.35 * Math.cos(i * 1.31 + 2.1);
  return Math.round(h * 10) / 10;
};
const sleepNodes = days.map(d => {
  const pos = ell(R.sleep, tDay(d.i));
  return {
    id: "sleep-"+d.i, kind:"sleep", day:d,
    x: pos.x, y: pos.y, t: tDay(d.i),
    r: 16, color: C.sleep, empty: true, example: true,
    value: exampleSleep(d.i), unit: "h",
  };
});
extras.push(...sleepNodes);
const sleepEdges = sleepNodes.map(n => ({
  a: dayNodeOf[n.day.i], b: n, color: C.sleep,
}));

const aggEdges = [];
for (const d of sampleLow){
  aggEdges.push({ a: aggLow, b: dayNodeOf[d.i], color: gColor(d.avg), side:"low" });
}
for (const d of sampleMid){
  aggEdges.push({ a: aggMid, b: dayNodeOf[d.i], color: gColor(d.avg), side:"mid" });
}

/* Vertical strand for 11 November — every variable, in order. */
const STRAND = {
  x: 80, y0: -860, dy: 210,
  rDay: 78, rMetric: 56, rGlu: 58,
};
const strandItems = [
  { key:"day",        pick: () => dayNodeOf[nov.i],          kind:"day",        title: longDate(nov.date), sub:null,          color: gColor(nov.avg),             value: null,                              unit:"" },
  { key:"steps",      pick: () => stepsNodeOf[nov.i],        kind:"steps",      title:"Steps",              sub:null,                    color: C.flare,                     value: fmt(nov.steps),                    unit:"steps" },
  { key:"intensity",  pick: () => intensityNov,              kind:"intensity",  title:"Intensity",          sub:null,                    color: C.aurora,                    value: titleCase(nov.intensity),          unit:"" },
  { key:"active",     pick: () => metricOf.active[nov.i],    kind:"active",     title:"Active minutes",     sub:null,                    color: C.canvas,                    value: fmt(nov.active),                   unit:"min" },
  { key:"sed",        pick: () => metricOf.sed[nov.i],       kind:"sed",        title:"Sedentary time",     sub:null,                    color: C.sed,                       value: fmt(nov.sed),                      unit:"min" },
  { key:"hr",         pick: () => metricOf.hr[nov.i],        kind:"hr",         title:"Heart rate",         sub: nov.hr==null ? "Not recorded" : null, color: C.info, value: nov.hr==null ? "—" : fmt(nov.hr), unit: nov.hr==null ? "" : "bpm" },
  { key:"glu0",       pick: () => gluNodesOf[nov.i][0],      kind:"glucose",    title: nov.readings[0].name, sub: nov.readings[0].time,  color: gColor(nov.readings[0].v),   value: String(Math.round(nov.readings[0].v)), unit:"mg/dL" },
  { key:"glu1",       pick: () => gluNodesOf[nov.i][1],      kind:"glucose",    title: nov.readings[1].name, sub: nov.readings[1].time,  color: gColor(nov.readings[1].v),   value: String(Math.round(nov.readings[1].v)), unit:"mg/dL" },
  { key:"glu2",       pick: () => gluNodesOf[nov.i][2],      kind:"glucose",    title: nov.readings[2].name, sub: nov.readings[2].time,  color: gColor(nov.readings[2].v),   value: String(Math.round(nov.readings[2].v)), unit:"mg/dL" },
];
strandItems.forEach((it, i) => {
  it.x = STRAND.x;
  it.y = STRAND.y0 + i * STRAND.dy;
  it.r = it.kind==="day" ? STRAND.rDay : it.kind==="glucose" ? STRAND.rGlu : STRAND.rMetric;
});
const strandNodeSet = new Set(strandItems.map(it => it.pick()));

function homeRadius(n){
  if (n.kind === "day") return 26;
  if (n.kind === "steps") return 12 + 12 * Math.min(1, (n.day.steps||0) / 12000);
  if (n.empty) return 11;
  if (n.kind === "glucose") return 15;
  if (n.kind === "user") return 86;
  return n.r;
}
function homeAlpha(n){
  if (n.empty) return 0.4;
  return 1;
}

function poseSleepAway(n){
  const outer = ell(R.sleep + 620, tDay(n.day.i));
  return { x: outer.x, y: outer.y, r: 8, a: 0, glow: false };
}

function pose0(n){
  if (n.kind === "sleep") return poseSleepAway(n);
  if (n.kind === "aggregate" || n.kind === "intensity"){
    const home = n.kind==="aggregate" ? n : dayNodeOf[nov.i];
    return { x: home.x, y: home.y, r: n.r * 0.2, a: 0, glow: false };
  }
  return { x: n.x, y: n.y, r: homeRadius(n), a: homeAlpha(n), glow: n.kind==="glucose" || n.kind==="day" || n.kind==="user" };
}

function poseSplit(n){
  if (n.kind === "sleep") return poseSleepAway(n);
  const side = n.day ? (n.day.band === "low" ? "low" : n.day.band === "mid" ? "mid" : null) : (n.band || null);
  const role = n.day ? roleOf(n.day) : null;

  if (n.kind === "aggregate"){
    return { x: n.x, y: n.y, r: MINI.aggR, a: 1, glow: true };
  }
  if (n.kind === "intensity"){
    const d = dayNodeOf[nov.i];
    const ps = poseSplit(d);
    return { x: ps.x, y: ps.y, r: 10, a: 0, glow: false };
  }
  if (n.kind === "user"){
    return { x: 0, y: MINI.cy, r: 40, a: 0, glow: false };
  }
  if (n.kind === "profile" || n.kind === "bmi" || n.kind === "weight" || n.kind === "height" || n.kind === "age"){
    return { x: n.x * 0.3, y: n.y * 0.3, r: n.r, a: 0, glow: false };
  }
  if (role === "high"){
    return { x: n.x * 0.4, y: n.y * 0.4 + 200, r: n.r * 0.5, a: 0, glow: false };
  }
  if (role === "halo-low" || role === "halo-mid"){
    const p = haloPoint(side, n.day.haloIdx, side==="low" ? haloLow.length : haloMid.length);
    if (n.kind === "day") return { x: p.x, y: p.y, r: MINI.haloR, a: 0.95, glow: false };
    return { x: p.x, y: p.y, r: 3, a: 0, glow: false };
  }
  if (role === "sample-low" || role === "sample-mid"){
    const ang = sampleAngle(side, n.day.sampleIdx, SAMPLE_N);
    if (n.kind === "day"){
      const p = miniPoint(side, MINI.dayR, ang);
      return { x: p.x, y: p.y, r: MINI.dayRs, a: 1, glow: true };
    }
    if (n.kind === "steps"){
      const p = miniPoint(side, MINI.stepR, ang);
      const r = MINI.stepBase + MINI.stepGain * Math.min(1, (n.day.steps||0) / 12000);
      return { x: p.x, y: p.y, r, a: 1, glow: true };
    }
    if (n.kind === "glucose"){
      const a = ang + (n.j - 1) * MINI.gluSpread;
      const p = miniPoint(side, MINI.gluR, a);
      return { x: p.x, y: p.y, r: MINI.gluR0, a: 1, glow: true };
    }
    const p = miniPoint(side, MINI.dayR, ang);
    return { x: p.x, y: p.y, r: 6, a: 0, glow: false };
  }
  return { x: n.x, y: n.y, r: homeRadius(n), a: 0, glow: false };
}

function poseDay(n){
  if (n.kind === "sleep") return poseSleepAway(n);
  const isNov = n.day === nov || n === intensityNov;
  const split = (n.kind === "intensity") ? poseSplit(dayNodeOf[nov.i]) : poseSplit(n);
  if (n.kind === "aggregate"){
    return { x: n.x, y: n.y, r: MINI.aggR * 0.7, a: 0, glow: false };
  }
  if (!isNov){
    return { x: split.x, y: split.y, r: split.r * 0.85, a: 0, glow: false };
  }
  const item = strandItems.find(it => it.pick() === n);
  if (item){
    return { x: item.x, y: item.y, r: item.r, a: 1, glow: true };
  }
  return { x: split.x, y: split.y, r: 8, a: 0, glow: false };
}

/* Stop 2 — the longest low-step streak as a real graph: Day nodes
   joined by NEXT, each with its steps (flare, above) and three
   glucose readings hanging below, coloured by state. The day after
   closes the chain, glowing lime. */
const CHAIN = {
  x0: -1240, x1: 1240,
  y: -20,
  amp: 72,
  dayR: 80,
  afterR: 98,
  gluR: 34,
  gluDy: 176,
  gluGap: 128,
  stepDy: -156,
  stepBase: 18,
  stepGain: 30,
};
function chainPos(k){
  const n = Math.max(2, FOCUS.chain.length);
  const t = k / (n - 1);
  return {
    x: CHAIN.x0 + (CHAIN.x1 - CHAIN.x0) * t,
    y: CHAIN.y - CHAIN.amp * Math.sin(Math.PI * t),
  };
}

function poseTomorrow(n){
  if (n.kind === "sleep") return poseSleepAway(n);
  if (n.kind === "aggregate" || n.kind === "intensity"){
    const home = n.kind==="aggregate" ? n : dayNodeOf[nov.i];
    return { x: home.x * 0.15, y: home.y * 0.15, r: 8, a: 0, glow: false };
  }
  if (n.kind === "user"){
    return { x: 0, y: CHAIN.y, r: 24, a: 0, glow: false };
  }
  if (n.kind === "profile" || n.kind === "bmi" || n.kind === "weight" || n.kind === "height" || n.kind === "age"){
    return { x: n.x * 0.15, y: n.y * 0.15, r: n.r, a: 0, glow: false };
  }
  const k = n.day ? focusIndex(n.day) : -1;
  if (k < 0){
    /* Everyone else leaves quietly. Focus days will fly in from wherever. */
    const home = (n.x != null) ? n : { x:0, y:0, r: 8 };
    return { x: home.x * 0.4, y: home.y * 0.4, r: (n.r || 8) * 0.4, a: 0, glow: false };
  }
  const p = chainPos(k);
  const isAfter = n.day.i === FOCUS.afterI;
  if (n.kind === "day"){
    return { x: p.x, y: p.y, r: isAfter ? CHAIN.afterR : CHAIN.dayR, a: 1, glow: true };
  }
  if (n.kind === "steps"){
    const r = CHAIN.stepBase + CHAIN.stepGain * Math.min(1, (n.day.steps || 0) / 12000);
    return { x: p.x, y: p.y + CHAIN.stepDy, r, a: 1, glow: true };
  }
  if (n.kind === "glucose"){
    return {
      x: p.x,
      y: p.y + CHAIN.gluDy + (n.j || 0) * CHAIN.gluGap,
      r: isAfter ? CHAIN.gluR + 4 : CHAIN.gluR,
      a: 1, glow: true,
    };
  }
  return { x: p.x, y: p.y, r: 6, a: 0, glow: false };
}

function poseExtend(n){
  if (n.kind === "sleep"){
    return { x: n.x, y: n.y, r: 16, a: 0.95, glow: true };
  }
  return pose0(n);
}

function poseFor(n, s){
  if (s === "1") return poseSplit(n);
  if (s === "1b") return poseDay(n);
  if (s === "2") return poseTomorrow(n);
  if (s === "4") return poseExtend(n);
  if (s === "5") return pose0(n);
  return pose0(n);
}

/* -------------------------------------------------------------------------- */
/*  Easing, curves, camera                                                    */
/* -------------------------------------------------------------------------- */
const canvas = document.getElementById("cy");
const tip = document.getElementById("tip");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 0, k: 1 };
let camFrom = null, camTo = null, camT = 1, camDur = 900, camStart = 0, camMode = "linear";
let entrance = 1, enterStart = 0, enterDur = 1500;
let stop = "0";
let hover = null;
let dragging = false, lastPX = 0, lastPY = 0;
let now = 0, frozenNow = null, frozen = false;
let trans = null;
let conclusionBorn = 0;

function worldToScreen(x, y){ return { x: cam.x + x * cam.k, y: cam.y + y * cam.k }; }
function screenToWorld(x, y){ return { x: (x - cam.x) / cam.k, y: (y - cam.y) / cam.k }; }

function clamp01(t){ return t < 0 ? 0 : t > 1 ? 1 : t; }
function lerp(a,b,t){ return a + (b-a)*t; }
function smootherstep(t){ t = clamp01(t); return t*t*t*(t*(t*6-15)+10); }
function easeInOutCubic(t){ t = clamp01(t); return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
function easeOutCubic(t){ t = clamp01(t); return 1 - Math.pow(1-t, 3); }
function easeOutBack(t){
  t = clamp01(t);
  const c1 = 1.08, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function bezier(p0, p1, p2, t){
  const u = 1 - t;
  return {
    x: u*u*p0.x + 2*u*t*p1.x + t*t*p2.x,
    y: u*u*p0.y + 2*u*t*p1.y + t*t*p2.y,
  };
}
function curvePos(from, to, t, bend){
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const c = { x: mx - (dy / len) * bend, y: my + (dx / len) * bend };
  return bezier(from, c, to, t);
}

function fitCam(set, rect){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for (const p of set){
    const r = p.r || 20;
    x0=Math.min(x0,p.x-r); y0=Math.min(y0,p.y-r); x1=Math.max(x1,p.x+r); y1=Math.max(y1,p.y+r);
  }
  const pad = 20;
  const vw = rect.r - rect.l - pad*2, vh = rect.b - rect.t - pad*2;
  const k = Math.min(vw / Math.max(x1-x0, 1), vh / Math.max(y1-y0, 1));
  const cx = (x0+x1)/2, cy = (y0+y1)/2;
  const sx = (rect.l+rect.r)/2, sy = (rect.t+rect.b)/2;
  return { x: sx - cx * k, y: sy - cy * k, k };
}

function areaFor(s){
  if (s === "1")  return { l: 36, t: 80,  r: W-36, b: H-348 };
  if (s === "1b") return { l: W*0.18, t: 96, r: W*0.88, b: H-72 };
  if (s === "2") return { l: 56, t: 188, r: W-220, b: H-390 };
  if (s === "4") return { l: 80, t: 252, r: W-80, b: H-236 };
  if (s === "5") return { l: 64, t: 430, r: W-64, b: H-130 };
  return { l: 40, t: 210, r: W-40, b: H-210 };
}

function targetCam(s){
  if (s === "1"){
    const set = [];
    for (const d of [...sampleLow, ...sampleMid]){
      set.push(poseSplit(dayNodeOf[d.i]));
      set.push(poseSplit(stepsNodeOf[d.i]));
      for (const g of gluNodesOf[d.i]) set.push(poseSplit(g));
    }
    set.push(poseSplit(aggLow), poseSplit(aggMid));
    for (const d of [...haloLow, ...haloMid]) set.push(poseSplit(dayNodeOf[d.i]));
    return fitCam(set, areaFor("1"));
  }
  if (s === "1b"){
    /* Place the strand at designed screen positions so captions and
       values have a fixed vertical rhythm at 1440×900 (and scale cleanly). */
    const yFirst = strandItems[0].y, yLast = strandItems[strandItems.length-1].y;
    const top = 118, bot = Math.min(H - 86, 848);
    const k = (bot - top) / (yLast - yFirst);
    const screenX = W * 0.68;
    return { x: screenX - STRAND.x * k, y: top - yFirst * k, k };
  }
  if (s === "2"){
    const set = [];
    for (const d of FOCUS.chain){
      set.push(poseTomorrow(dayNodeOf[d.i]));
      set.push(poseTomorrow(stepsNodeOf[d.i]));
      for (const g of gluNodesOf[d.i]) set.push(poseTomorrow(g));
    }
    /* Room under the last glucose for the date labels. */
    const last = FOCUS.chain[FOCUS.chain.length - 1];
    const gLast = poseTomorrow(gluNodesOf[last.i][2]);
    set.push({ x: gLast.x, y: gLast.y + 90, r: 20 });
    const after = poseTomorrow(dayNodeOf[FOCUS.afterI]);
    set.push({ x: after.x + after.r + 420, y: after.y, r: 20 });
    const first = FOCUS.chain[0];
    const sFirst = poseTomorrow(stepsNodeOf[first.i]);
    set.push({ x: sFirst.x, y: sFirst.y - 30, r: 16 });
    const gFirst = poseTomorrow(gluNodesOf[first.i][2]);
    set.push({ x: gFirst.x, y: gFirst.y + 90, r: 20 });
    return fitCam(set, areaFor("2"));
  }
  if (s === "4"){
    const set = nodes.map(n => ({ x: n.x, y: n.y, r: homeRadius(n) }));
    for (const n of sleepNodes) set.push({ x: n.x, y: n.y, r: 22 });
    return fitCam(set, areaFor("4"));
  }
  if (s === "5"){
    return fitCam(nodes, areaFor("5"));
  }
  return fitCam(nodes, areaFor("0"));
}

function camPath(from, to, t){
  const e = smootherstep(t);
  const midK = Math.min(from.k, to.k) * 0.82;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const u = 1 - e;
  return {
    x: u*u*from.x + 2*u*e*midX + e*e*to.x,
    y: u*u*from.y + 2*u*e*midY + e*e*to.y,
    k: u*u*from.k + 2*u*e*midK + e*e*to.k,
  };
}

function animateCam(to, dur, mode="cinematic"){
  if (reduceMotion() || dur === 0){ Object.assign(cam, to); camT = 1; camTo = to; camFrom = to; return; }
  camFrom = { ...cam }; camTo = to; camT = 0; camDur = dur; camStart = performance.now(); camMode = mode;
}

function durationFor(from, to){
  const key = `${from}-${to}`;
  const map = {
    "0-1": 1900, "1-0": 1700,
    "1-1b": 1800, "1b-1": 1600,
    "1b-2": 2400, "2-1b": 2000,
    "2-4": 2200, "4-2": 2000,
    "0-2": 2000, "2-0": 1800,
    "0-4": 2000, "4-0": 1600,
    "1-2": 2200, "2-1": 1900,
    "1-4": 2000, "4-1": 1800,
    "1b-4": 2100, "4-1b": 1900,
    "4-5": 2400, "5-4": 3400,
    "5-0": 3400, "0-5": 1200,
    "2-5": 2000, "5-2": 1800,
    "1-5": 1900, "5-1": 1700,
    "1b-5": 2000, "5-1b": 1800,
  };
  return map[key] ?? 1400;
}

function delayFor(n, from, to){
  const ang = (n.t != null ? n.t / TAU : (n.day && n.day.i != null ? n.day.i / days.length : 0.2));
  const role = n.day ? roleOf(n.day) : null;
  const goingSplit = (from==="0" || from==="2" || from==="4" || from==="5") && to==="1";
  const leavingSplit = from==="1" && (to==="0" || to==="5");
  const toDay = to==="1b";
  const fromDay = from==="1b";
  const spanDays = Math.max(1, days.length - 1);
  /* Stop 4 first, so 2→4 is a fly-home plus a staggered sleep entrance. */
  if (to==="4" || from==="4"){
    if (n.kind === "sleep"){
      const u = n.day.i / spanDays;
      return to==="4" ? 0.30 + u * 0.42 : u * 0.30;
    }
    if (n.day && FOCUS.set.has(n.day.i) && (from==="2" || to==="2")){
      const k = focusIndex(n.day);
      const base = (k / Math.max(1, FOCUS.chain.length - 1)) * 0.28;
      if (n.kind === "day") return base;
      if (n.kind === "steps") return base + 0.05;
      if (n.kind === "glucose") return base + 0.08 + (n.j || 0) * 0.025;
      return base;
    }
    if (n.kind === "day") return (n.day.i / spanDays) * 0.24;
    if (n.day) return 0.06 + ((n.t != null ? n.t : 0) / TAU) * 0.20;
    return 0.04;
  }
  if (to==="2" || from==="2"){
    if (n.day && FOCUS.set.has(n.day.i)){
      const k = focusIndex(n.day);
      const base = (k / Math.max(1, FOCUS.chain.length - 1)) * 0.50;
      if (n.kind === "day") return base;
      if (n.kind === "steps") return base + 0.07;
      if (n.kind === "glucose") return base + 0.12 + (n.j || 0) * 0.045;
      return base + 0.04;
    }
    if (n === intensityNov || n.kind === "intensity") return 0.02;
    if (n.kind === "aggregate") return 0.02;
    if (n.kind === "sleep") return 0.02;
    if (n.day === nov) return 0.03 + (n.j || 0) * 0.03;
    return 0.02;
  }
  if (goingSplit || leavingSplit){
    if (n.kind === "aggregate") return 0.34;
    if (n.kind === "day" && (role==="halo-low" || role==="halo-mid")) return 0.02 + ang * 0.20;
    if (n.kind === "day") return 0.06 + ang * 0.22;
    if (n.kind === "steps" && (role==="sample-low" || role==="sample-mid")) return 0.20 + ang * 0.22;
    if (n.kind === "glucose" && (role==="sample-low" || role==="sample-mid")) return 0.30 + ang * 0.20 + (n.j||0)*0.025;
    if (n.kind === "user") return 0.08;
    return 0.02 + ang * 0.16;
  }
  if (toDay || fromDay){
    const isNov = n.day === nov || n.kind==="aggregate" || n.kind==="intensity";
    if (n === intensityNov || n.kind==="intensity") return 0.42;
    if (isNov && n.kind==="day") return 0.04;
    if (isNov && n.kind==="steps") return 0.14;
    if (isNov && (n.kind==="active" || n.kind==="sed" || n.kind==="hr")) return 0.22 + ({active:0,sed:0.05,hr:0.10}[n.kind]||0);
    if (isNov && n.kind==="glucose") return 0.38 + (n.j||0)*0.06;
    if (n.kind==="aggregate") return 0.02;
    return 0.05 + ang * 0.18;
  }
  return ang * 0.12;
}
function spanFor(n, from, to){
  if ((to==="2" || from==="2") && n.day && n.day.i === FOCUS.afterI){
    return n.kind === "day" ? 0.48 : 0.44;
  }
  if ((to==="2" || from==="2") && n.day && FOCUS.set.has(n.day.i)){
    return 0.46;
  }
  return 0.55;
}
function bendFor(n, fromPose, toPose, from, to){
  const dx = toPose.x - fromPose.x, dy = toPose.y - fromPose.y;
  const dist = Math.hypot(dx, dy);
  const role = n.day ? roleOf(n.day) : null;
  const side = role && role.endsWith("low") ? -1 : role && role.endsWith("mid") ? 1 : 0;
  const ang = n.t != null ? n.t : 0;
  let mag = dist * 0.28;
  if ((from==="0" && to==="1") || (from==="1" && to==="0")){
    mag = dist * 0.36;
    const wobble = Math.sin((n.day ? n.day.i : 3) * 1.7) * dist * 0.08;
    return side * mag + wobble + Math.cos(ang) * dist * 0.04;
  }
  if (to==="4" || from==="4"){
    if (n.kind === "sleep") return dist * 0.20;
    return dist * 0.18 * Math.sin((n.t || 0) + 0.4);
  }
  if (to==="2" || from==="2"){
    const k = n.day ? focusIndex(n.day) : -1;
    if (k >= 0) return -dist * 0.18 + (k / 8 - 0.5) * dist * 0.08;
    return -dist * 0.20;
  }
  if (to==="1b" || from==="1b"){
    return (n.day === nov ? -dist * 0.22 : side * dist * 0.15);
  }
  return side * mag;
}

function localT(globalT, delay, span){
  return smootherstep((globalT - delay) / span);
}

const allVisuals = () => nodes.concat(extras);

function capturePoses(s){
  const map = new Map();
  for (const n of allVisuals()) map.set(n, { ...poseFor(n, s) });
  return map;
}
function currentVisualPose(n){
  if (trans && trans.t < 1 && trans.fromPoses){
    const a = trans.fromPoses.get(n) || poseFor(n, trans.from);
    const b = trans.toPoses.get(n) || poseFor(n, trans.to);
    const delay = trans.delays.get(n) || 0;
    const span = trans.spans.get(n) || 0.55;
    const t = localT(trans.t, delay, span);
    const bend = trans.bends.get(n) || 0;
    const p = curvePos(a, b, t, bend);
    return {
      x: p.x, y: p.y,
      r: lerp(a.r, b.r, t),
      a: lerp(a.a, b.a, easeOutCubic(t)),
      glow: t < 0.5 ? a.glow : b.glow,
      t,
    };
  }
  return { ...poseFor(n, stop), t: 1 };
}

function startTransition(to, opts={}){
  const from = stop;
  const dur = opts.dur != null ? opts.dur : durationFor(from, to);
  const instant = opts.instant || reduceMotion() || dur === 0;
  const fromPoses = new Map();
  for (const n of allVisuals()) fromPoses.set(n, currentVisualPose(n));
  const toPoses = capturePoses(to);
  const delays = new Map(), spans = new Map(), bends = new Map();
  for (const n of allVisuals()){
    delays.set(n, delayFor(n, from, to));
    spans.set(n, spanFor(n, from, to));
    bends.set(n, bendFor(n, fromPoses.get(n), toPoses.get(n), from, to));
  }
  stop = to;
  if (to === "5"){
    conclusionBorn = performance.now();
    ensureGalaxy();
    setGalaxyPull(1, instant ? 0 : 5200);
  } else if (from === "5"){
    setGalaxyPull(0, instant ? 0 : Math.max(dur * 0.92, 2600));
    if (instant) teardownGalaxy();
  }
  if (instant){
    trans = null;
    applyChrome(1);
    animateCam(targetCam(to), 0);
    return;
  }
  try { cueScreen(from, to); } catch (e) {}
  trans = {
    from, to,
    start: performance.now(),
    dur,
    t: 0,
    fromPoses, toPoses, delays, spans, bends,
  };
  applyChrome(0);
  animateCam(targetCam(to), dur, "cinematic");
}

function entranceFor(n, t){
  if (n.kind==="user") return 1;
  if (n.kind==="aggregate" || n.kind==="intensity" || n.kind==="sleep") return 0;
  const ang = (n.t != null ? n.t : Math.PI) / TAU;
  const delay = (n.t != null ? ang : 0.15) * 0.42;
  const dur = 0.58;
  const u = Math.max(0, Math.min(1, (t - delay) / dur));
  return easeOutBack(u);
}

/* -------------------------------------------------------------------------- */
/*  Sci-fi ambience                                                           */
/* -------------------------------------------------------------------------- */
function mulberry32(a){
  return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rng = mulberry32(170186);
const STARS = Array.from({length: 180}, () => ({
  x: rng(), y: rng(),
  r: rng() < 0.85 ? 1 : 1.6,
  a: 0.08 + rng() * 0.22,
  vx: (rng() - 0.5) * 0.0035,
  vy: (rng() - 0.5) * 0.0022,
  tw: rng() * TAU,
  per: 2200 + rng() * 2800,
  par: 0.04 + rng() * 0.08,
}));

function drawAmbience(alpha){
  if (alpha < 0.01) return;
  const t = now;
  ctx.save();
  for (const s of STARS){
    const tw = 0.65 + 0.35 * Math.sin(t / s.per + s.tw);
    const px = ((s.x * W + t * s.vx + (cam.x - W/2) * s.par) % W + W) % W;
    const py = ((s.y * H + t * s.vy + (cam.y - H/2) * s.par) % H + H) % H;
    ctx.globalAlpha = alpha * s.a * tw;
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(px, py, s.r, 0, TAU); ctx.fill();
  }
  const orbits = [R.profile, R.day, R.steps, R.active, R.sed, R.hr, R.glu];
  ctx.globalAlpha = alpha * 0.09;
  ctx.strokeStyle = "rgba(246,244,240,1)";
  ctx.lineWidth = 1;
  for (const rx of orbits){
    const a = worldToScreen(rx, 0), b = worldToScreen(-rx, 0);
    const c = worldToScreen(0, rx*ASPECT), d = worldToScreen(0, -rx*ASPECT);
    const cx = (a.x+b.x)/2, cy = (c.y+d.y)/2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(a.x-cx), Math.abs(c.y-cy), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha * 0.05;
  for (let i = 0; i < days.length; i += 10){
    const t0 = tDay(i);
    const inner = ell(R.profile + 20, t0);
    const outer = ell(R.glu + 20, t0);
    const s0 = worldToScreen(inner.x, inner.y), s1 = worldToScreen(outer.x, outer.y);
    ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
  }
  if (arguments.length > 1 && arguments[1] > 0.01){
    const sa = arguments[1];
    const a = worldToScreen(R.sleep, 0), b = worldToScreen(-R.sleep, 0);
    const c = worldToScreen(0, R.sleep*ASPECT), d = worldToScreen(0, -R.sleep*ASPECT);
    const cx = (a.x+b.x)/2, cy = (c.y+d.y)/2;
    ctx.globalAlpha = sa * 0.42;
    ctx.strokeStyle = C.sleep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(a.x-cx), Math.abs(c.y-cy), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMiniGuides(agg, side, alpha){
  if (alpha < 0.01) return;
  ctx.save();
  const rings = [MINI.haloOuter + 8, MINI.dayR, MINI.stepR, MINI.gluR];
  ctx.strokeStyle = side==="low" ? C.alert : C.acid;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < rings.length; i++){
    ctx.globalAlpha = alpha * (i===0 ? 0.16 : 0.22);
    const p0 = worldToScreen(agg.x + rings[i], agg.y);
    const p1 = worldToScreen(agg.x, agg.y + rings[i]*MINI.aspect);
    const c = worldToScreen(agg.x, agg.y);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, Math.abs(p0.x-c.x), Math.abs(p1.y-c.y), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/*  Render                                                                    */
/* -------------------------------------------------------------------------- */
function resize(){
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W+"px";
  canvas.style.height = H+"px";
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if (typeof resizeGalaxy === "function") resizeGalaxy();
}

function edgeAlpha(e, visA, visB){
  const aKind = e.a.kind, bKind = e.b.kind;
  const s = trans ? (trans.t < 0.5 ? trans.from : stop) : stop;
  const isGen = e.type === "GENERATES";
  const spoke = aKind==="user" && bKind==="day";
  const toSteps = aKind==="day" && bKind==="steps";
  const toGlu = aKind==="day" && bKind==="glucose";
  const profile = aKind==="profile" || bKind==="profile" || bKind==="bmi" || bKind==="weight" || bKind==="height" || bKind==="age";
  let a = 0.55;
  if (s === "2"){
    const focus = (e.a.day && FOCUS.set.has(e.a.day.i)) || (e.b.day && FOCUS.set.has(e.b.day.i));
    if (focus && (toSteps || toGlu)) a = 0.88;
    else a = 0;
  }
  else if (s === "1"){
    const role = e.a.day ? roleOf(e.a.day) : (e.b.day ? roleOf(e.b.day) : null);
    const sample = role==="sample-low" || role==="sample-mid";
    if (isGen) a = 0;
    else if (spoke) a = 0;
    else if (sample && (toSteps || toGlu)) a = 0.85;
    else a = 0;
  } else if (s === "1b"){
    const isNov = e.a.day===nov || e.b.day===nov;
    if (isNov && (toSteps || toGlu || (aKind==="day" && (bKind==="active"||bKind==="sed"||bKind==="hr")))) a = 0.95;
    else a = 0;
  } else {
    if (isGen) a = 0.022;
    else if (e.type==="HAS_DAY") a = 0.18;
    else if (e.type==="NEXT") a = (s==="5" || (trans && (trans.to==="5" || trans.from==="5"))) ? 0.30 : 0;
    else if (profile) a = 0.28;
    else a = 0.55;
  }
  a *= Math.min(visA.a, visB.a, 1);
  return a;
}

function drawEdge(sa, sb, color, alpha, width, frac){
  if (alpha < 0.01 || frac <= 0) return;
  const x2 = lerp(sa.x, sb.x, frac), y2 = lerp(sa.y, sb.y, frac);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(x2, y2); ctx.stroke();
}

function breathe(n){
  if (reduceMotion() || frozen) return 1;
  const s = trans ? (trans.t > 0.5 ? trans.to : trans.from) : stop;
  if (s !== "0") {
    if (n.kind==="aggregate" || (n.day===nov && (stop==="1"||stop==="1b") && n.kind==="day")){
      return 1 + 0.045 * Math.sin(now / 620 + (n.band==="mid"?Math.PI:0));
    }
    if (s==="2" && n.kind==="day" && n.day && n.day.i === FOCUS.afterI){
      return 1 + 0.10 * Math.sin(now / 480);
    }
    if (s==="2" && n.kind==="glucose" && n.day && n.day.i === FOCUS.afterI){
      return 1 + 0.06 * Math.sin(now / 560 + (n.j || 0));
    }
    if (s==="4" && n.kind==="sleep"){
      return 1 + 0.035 * Math.sin(now / 900 + (n.t || 0));
    }
    return 1;
  }
  const phase = (n.t != null ? n.t : 0);
  return 1 + 0.028 * Math.sin(now / 1700 + phase);
}

function nodeFill(n){
  if (n.kind==="aggregate") return n.color;
  if (n.kind==="day") return gColor(n.day.avg);
  if (n.kind==="glucose") return gColor(n.value);
  return n.color || C.text;
}

function drawNode(n, vis, ent){
  const a = vis.a * (n.kind==="aggregate" || n.kind==="intensity" ? 1 : Math.min(1, 0.3 + ent*0.9));
  if (a < 0.01) return;
  let x = vis.x, y = vis.y;
  if (entrance < 1 && !trans && stop==="0" && n.kind!=="aggregate" && n.kind!=="intensity" && n.kind!=="sleep"){
    const e = entranceFor(n, entrance);
    x = vis.x * e; y = vis.y * e;
  }
  const s = worldToScreen(x, y);
  const pulse = breathe(n);
  let rr = vis.r * cam.k * pulse;
  if (rr < 0.3) return;

  const fill = nodeFill(n);

  if (vis.glow){
    ctx.globalAlpha = a * (n.kind==="user" || n.kind==="aggregate" ? 0.48 : 0.30);
    const g = ctx.createRadialGradient(s.x, s.y, Math.max(rr*0.15, 1), s.x, s.y, rr*3.4);
    g.addColorStop(0, fill);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, rr*3.4, 0, TAU); ctx.fill();
  }

  ctx.globalAlpha = a;
  if ((n.empty || n.kind==="sleep") && a > 0.05 && vis.r > 4){
    ctx.strokeStyle = fill;
    ctx.lineWidth = Math.max(1.6, (n.kind==="sleep" ? 2.4 : 2) * cam.k);
    if (n.kind==="sleep"){
      const dash = Math.max(3, 4.2 * cam.k);
      ctx.setLineDash([dash, dash * 0.85]);
    }
    ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.fill();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(0.8, 1.2 * Math.min(cam.k, 2));
    ctx.stroke();
  }

  if (n.kind==="user" && a > 0.15){
    ctx.globalAlpha = a;
    ctx.fillStyle = C.flare;
    ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.text;
    ctx.lineWidth = Math.max(3, 5*Math.min(cam.k, 1.6));
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = `800 ${Math.round(rr*0.72)}px Bricolage, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(n.initials, s.x, s.y + rr*0.04);
  }

  if (n.kind==="aggregate" && a > 0.4 && rr > 18){
    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = Math.max(2, 3.2 * Math.min(cam.k, 1.8));
    ctx.beginPath(); ctx.arc(s.x, s.y, rr + Math.max(5, 7*cam.k), 0, TAU); ctx.stroke();
  }

  /* The day-after node lands with a lime ring that keeps breathing. */
  if (n.kind==="day" && n.day && n.day.i === FOCUS.afterI && a > 0.3 && rr > 10){
    const st = trans ? (trans.t > 0.5 ? trans.to : trans.from) : stop;
    if (st === "2"){
      let punch = 1;
      if (trans && trans.to === "2" && vis.t != null){
        const lt = vis.t;
        punch = lt < 0.72 ? 0.4 + 0.6 * lt : 1 + 0.22 * Math.sin(((lt - 0.72) / 0.28) * Math.PI);
      }
      ctx.globalAlpha = a * 0.95;
      ctx.strokeStyle = C.acid;
      ctx.lineWidth = Math.max(3.2, 4.6 * Math.min(cam.k, 2));
      ctx.beginPath(); ctx.arc(s.x, s.y, (rr + Math.max(8, 11*cam.k)) * punch, 0, TAU); ctx.stroke();
    }
  }

  if (hover === n){
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.x, s.y, rr+6, 0, TAU); ctx.stroke();
  }
}

function inkText(text, x, y, font, color, align, baseline, alpha, stroke){
  if (alpha < 0.02 || !text) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = align || "left";
  ctx.textBaseline = baseline || "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if (stroke){
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function strandAlpha(){
  if (stop === "1b" && (!trans || trans.t >= 1)) return 1;
  if (trans && (trans.to==="1b" || trans.from==="1b")){
    const t = trans.to==="1b" ? trans.t : 1 - trans.t;
    return easeOutCubic(Math.max(0, (t - 0.72) / 0.28));
  }
  return 0;
}

function drawStrandLabels(){
  const a = strandAlpha();
  if (a < 0.02) return;
  const first = strandItems[0], last = strandItems[strandItems.length-1];
  const pf = currentVisualPose(first.pick());
  const pl = currentVisualPose(last.pick());
  const s0 = worldToScreen(pf.x, pf.y), s1 = worldToScreen(pl.x, pl.y);
  ctx.globalAlpha = a * 0.55;
  const grad = ctx.createLinearGradient(s0.x, s0.y, s1.x, s1.y);
  grad.addColorStop(0, C.alert);
  grad.addColorStop(0.15, C.flare);
  grad.addColorStop(0.45, C.aurora);
  grad.addColorStop(0.7, C.info);
  grad.addColorStop(1, C.alert);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();

  /* Vertical rhythm is driven by the actual screen gap between beads, so
     captions sit clearly above their values and never collide, at any height. */
  const spacing = strandItems.length > 1
    ? Math.abs(worldToScreen(0, strandItems[1].y).y - worldToScreen(0, strandItems[0].y).y)
    : 96;
  const capSize = Math.round(Math.min(23, Math.max(18, spacing * 0.23)));
  const gap = Math.round(Math.min(11, Math.max(7, spacing * 0.11)));
  const inter = Math.round(Math.min(16, Math.max(10, spacing * 0.13)));
  const valueSize = Math.round(Math.min(62, Math.max(44, spacing - capSize - gap - inter)));
  const unitSize = Math.round(Math.min(22, Math.max(16, capSize - 1)));
  const daySize = Math.round(Math.min(56, Math.max(36, spacing * 0.52)));

  for (let i = 0; i < strandItems.length; i++){
    const it = strandItems[i];
    const n = it.pick();
    const vis = currentVisualPose(n);
    const local = trans && trans.to==="1b" ? vis.t : 1;
    const la = a * (0.3 + 0.7 * local);
    const s = worldToScreen(vis.x, vis.y);
    const rr = vis.r * cam.k;
    const lx = s.x - rr - 36;
    if (it.kind === "day"){
      inkText(it.title, lx, s.y, `800 ${daySize}px Bricolage, sans-serif`, C.text, "right", "middle", la, 12);
      continue;
    }
    /* Caption above, value (and unit) on the bead's baseline. Offsets are
       from glyph halves so the two lines cannot sit on top of each other. */
    const capY = s.y - valueSize * 0.52 - gap - capSize * 0.42;
    const caption = [it.title, it.sub].filter(Boolean).join("  ·  ");
    inkText(caption, lx, capY, `700 ${capSize}px Outfit, sans-serif`, C.second, "right", "middle", la*0.95, 7);

    const unitFont = `700 ${unitSize}px Outfit, sans-serif`;
    ctx.save();
    ctx.font = unitFont;
    const unitW = it.unit ? ctx.measureText(it.unit).width + 10 : 0;
    ctx.restore();
    inkText(it.value, lx - unitW, s.y, `800 ${valueSize}px Bricolage, sans-serif`, it.color, "right", "middle", la, 12);
    if (it.unit){
      inkText(it.unit, lx, s.y + 1, unitFont, C.second, "right", "middle", la*0.95, 6);
    }
  }
}

function splitChromeT(){
  if (stop === "1" && (!trans || trans.t >= 1)) return 1;
  if (trans && (trans.to==="1" || trans.from==="1") && trans.to!=="1b" && trans.from!=="1b"){
    const t = trans.to==="1" ? trans.t : 1 - trans.t;
    return easeOutCubic(Math.max(0, (t - 0.68) / 0.32));
  }
  if (trans && trans.from==="1" && trans.to==="1b") return 1 - easeInOutCubic(Math.min(1, trans.t / 0.40));
  if (trans && trans.from==="1b" && trans.to==="1") return easeOutCubic(Math.max(0, (trans.t - 0.55) / 0.45));
  return 0;
}

function updateSplitChrome(){
  const el = document.getElementById("split");
  const t = splitChromeT();
  if (t <= 0.01){
    el.classList.remove("is-on");
    el.style.opacity = 0;
    return;
  }
  el.classList.add("is-on");
  el.style.opacity = t;
  const count = (target) => {
    if (t >= 0.995) return Math.round(target);
    return Math.round(easeOutCubic(t) * target);
  };
  document.getElementById("num-low").textContent = count(STATS.lowAvg);
  document.getElementById("num-mid").textContent = count(STATS.midAvg);
}

function drawAggEdges(){
  const s = trans ? (trans.t < 0.55 ? trans.from : trans.to) : stop;
  const want = s==="1" || (trans && (trans.to==="1" || trans.from==="1"));
  if (!want) return;
  let appear = 0;
  if (stop==="1" && (!trans || trans.t>=1)) appear = 1;
  else if (trans && trans.to==="1") appear = easeOutCubic(Math.max(0, (trans.t - 0.42) / 0.50));
  else if (trans && trans.from==="1") appear = 1 - easeInOutCubic(Math.min(1, trans.t / 0.5));
  if (appear < 0.02) return;

  drawMiniGuides(aggLow, "low", appear * currentVisualPose(aggLow).a);
  drawMiniGuides(aggMid, "mid", appear * currentVisualPose(aggMid).a);

  let i = 0;
  for (const e of aggEdges){
    const pa = currentVisualPose(e.a), pb = currentVisualPose(e.b);
    const sa = worldToScreen(pa.x, pa.y), sb = worldToScreen(pb.x, pb.y);
    const stagger = (i / aggEdges.length) * 0.35;
    const frac = clamp01((appear - stagger) / 0.65);
    const a = 0.7 * appear * Math.min(pa.a, pb.a) * easeOutCubic(frac);
    const width = Math.max(1.4, 2.0 * cam.k);
    drawEdge(sa, sb, e.color, a, width, easeOutCubic(frac));
    i++;
  }
}


/* -------------------------------------------------------------------------- */
/*  Stops 2, 3 and 4 — timeline, arcs, sleep ring                             */
/* -------------------------------------------------------------------------- */
function appearOf(s, late, early){
  late = late == null ? 0.55 : late;
  early = early == null ? 0.42 : early;
  if (stop === s && (!trans || trans.t >= 1)) return 1;
  if (trans && trans.to === s) return easeOutCubic(Math.max(0, (trans.t - late) / (1 - late)));
  if (trans && trans.from === s) return 1 - easeInOutCubic(Math.min(1, trans.t / early));
  return 0;
}

function chainChromeAppear(){
  if (stop==="2" && (!trans || trans.t>=1)) return 1;
  if (trans && trans.to==="2") return easeOutCubic(Math.max(0, (trans.t - 0.62) / 0.38));
  if (trans && trans.from==="2") return 1 - easeInOutCubic(Math.min(1, trans.t / 0.40));
  return 0;
}

function nextChainAppear(){
  if (stop==="2" && (!trans || trans.t>=1)) return 1;
  if (trans && trans.to==="2") return trans.t;
  if (trans && trans.from==="2") return 1 - trans.t;
  return 0;
}

function drawNextChain(appear){
  if (appear < 0.02) return;
  const n = FOCUS.chain.length;
  ctx.save();
  for (let k = 0; k < n - 1; k++){
    /* Edges draw in one after another, time flowing along the chain.
       The last edge — into the day-after — arrives last. */
    const stagger = 0.16 + (k / Math.max(1, n - 2)) * 0.55;
    const frac = clamp01((appear - stagger) / 0.22);
    if (frac <= 0) continue;
    const da = FOCUS.chain[k], db = FOCUS.chain[k + 1];
    const pa = currentVisualPose(dayNodeOf[da.i]);
    const pb = currentVisualPose(dayNodeOf[db.i]);
    if (Math.min(pa.a, pb.a) < 0.05) continue;
    const sa = worldToScreen(pa.x, pa.y);
    const sb = worldToScreen(pb.x, pb.y);
    const tEnd = easeOutCubic(frac);
    const mx = (sa.x + sb.x) / 2;
    const my = (sa.y + sb.y) / 2;
    const dx = sb.x - sa.x, dy = sb.y - sa.y;
    const len = Math.hypot(dx, dy) || 1;
    const lift = Math.max(18, 28 * cam.k);
    const cpx = mx - (dy / len) * lift;
    const cpy = my + (dx / len) * lift;
    const midX = (1-tEnd)*(1-tEnd)*sa.x + 2*(1-tEnd)*tEnd*cpx + tEnd*tEnd*sb.x;
    const midY = (1-tEnd)*(1-tEnd)*sa.y + 2*(1-tEnd)*tEnd*cpy + tEnd*tEnd*sb.y;
    const ctrlX = (1-tEnd)*sa.x + tEnd*cpx;
    const ctrlY = (1-tEnd)*sa.y + tEnd*cpy;
    const g = ctx.createLinearGradient(sa.x, sa.y, midX, midY);
    g.addColorStop(0, gColor(da.avg));
    g.addColorStop(1, gColor(db.avg));
    ctx.strokeStyle = g;
    const isLast = k === n - 2;
    ctx.globalAlpha = (isLast ? 0.95 : 0.82) * Math.min(pa.a, pb.a) * easeOutCubic(frac);
    ctx.lineWidth = isLast ? Math.max(6.5, 5.5 * cam.k) : Math.max(5, 4.4 * cam.k);
    ctx.lineCap = "round";
    if (!reduceMotion()){
      ctx.setLineDash([10, 14]);
      ctx.lineDashOffset = -(now / 18) - k * 3;
    }
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.quadraticCurveTo(ctrlX, ctrlY, midX, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawChainLabels(appear){
  if (appear < 0.02) return;
  const n = FOCUS.chain.length;
  for (let k = 0; k < n; k++){
    const d = FOCUS.chain[k];
    const vis = currentVisualPose(dayNodeOf[d.i]);
    const glu = gluNodesOf[d.i];
    const lastG = currentVisualPose(glu[glu.length - 1]);
    const local = (trans && trans.to==="2") ? (d.i === FOCUS.afterI ? vis.t : lastG.t) : 1;
    const a = appear * (0.35 + 0.65 * local) * vis.a;
    if (a < 0.05) continue;
    const isAfter = d.i === FOCUS.afterI;
    const isFirst = k === 0;
    const dt = new Date(d.date + "T00:00:00");
    if (isAfter){
      /* To the right of the lime node, clear of the "21" date under the previous column. */
      const s = worldToScreen(vis.x, vis.y);
      const rr = vis.r * cam.k;
      const lx = s.x + rr + 28;
      inkText(`${dt.getDate()} ${MONTHS[dt.getMonth()]}`, lx, s.y - 22,
        "700 32px Outfit, sans-serif", C.acid, "left", "middle", a, 8);
      inkText("The next day", lx, s.y + 20,
        "800 30px Bricolage, sans-serif", C.acid, "left", "middle", a, 8);
      continue;
    }
    const sg = worldToScreen(lastG.x, lastG.y);
    const rr = lastG.r * cam.k;
    const y = sg.y + rr + 22;
    const label = isFirst ? `${dt.getDate()} ${MONTHS[dt.getMonth()]}` : String(dt.getDate());
    const size = isFirst ? 28 : 26;
    inkText(label, sg.x, y,
      `700 ${size}px Outfit, sans-serif`,
      C.second, "center", "top", a, 8);
  }
}

function sleepAppear(){
  if (stop==="4" && (!trans || trans.t>=1)) return 1;
  if (trans && trans.to==="4") return easeOutCubic(Math.max(0, (trans.t - 0.28) / 0.62));
  if (trans && trans.from==="4") return 1 - easeInOutCubic(Math.min(1, trans.t / 0.45));
  return 0;
}

function drawSleepEdges(appear){
  if (appear < 0.02) return;
  ctx.save();
  const n = sleepEdges.length;
  for (let i = 0; i < n; i++){
    const e = sleepEdges[i];
    const stagger = (i / n) * 0.48;
    const frac = clamp01((appear - stagger) / 0.52);
    if (frac <= 0) continue;
    const pa = currentVisualPose(e.a), pb = currentVisualPose(e.b);
    const sa = worldToScreen(pa.x, pa.y), sb = worldToScreen(pb.x, pb.y);
    const a = 0.72 * appear * Math.min(Math.max(pa.a, 0.4), pb.a) * easeOutCubic(frac);
    const width = Math.max(1.2, 1.6 * cam.k);
    drawEdge(sa, sb, C.sleep, a, width, easeOutCubic(frac));
  }
  ctx.restore();
}

function drawSleepTag(appear){
  if (appear < 0.02) return;
  /* Upper-right of the new ring, clear of the question. */
  const p = ell(R.sleep + 70, -0.12);
  const s = worldToScreen(p.x, p.y);
  const a = appear;
  inkText("Sleep (example)", s.x, s.y - 16,
    "800 40px Bricolage, sans-serif", C.sleep, "left", "middle", a, 10);
  inkText("Example data, not recorded", s.x, s.y + 24,
    "700 26px Outfit, sans-serif", C.second, "left", "middle", a * 0.95, 8);
}

function countInt(target, t){
  if (t >= 0.995) return Math.round(target);
  return Math.round(easeOutCubic(t) * target);
}
function countDec(target, t){
  if (t >= 0.995) return fmt1(target);
  return fmt1(easeOutCubic(t) * target);
}
function tickFromTo(from, to, t){
  return Math.round(lerp(from, to, easeOutCubic(t))).toLocaleString("en-US");
}

function setStage(id, t){
  const el = document.getElementById(id);
  if (!el) return;
  if (t <= 0.01){
    el.classList.remove("is-on");
    el.style.opacity = 0;
  } else {
    el.classList.add("is-on");
    el.style.opacity = t;
  }
}

function updateStageChrome(){
  const t2 = chainChromeAppear();
  const t4 = appearOf("4", 0.48, 0.40);
  const t5 = appearOf("5", 0.40, 0.40);
  setStage("stage-tomorrow", t2);
  setStage("stage-extend", t4);
  setStage("stage-concl", t5);
  if (t5 > 0.01){
    for (let i = 0; i < 3; i++){
      const el = document.getElementById("concl-l"+i);
      if (el) el.style.opacity = t5 * conclusionLineT(i);
    }
  }

  if (t2 > 0.01){
    document.getElementById("tm-after").textContent = countDec(FOCUS.afterAvg, t2);
    document.getElementById("tm-streak").textContent = countDec(FOCUS.streakAvg, t2);
  }
  if (t4 > 0.01){
    const added = days.length;
    document.getElementById("ext-n0").textContent = NODE_COUNT.toLocaleString("en-US");
    document.getElementById("ext-e0").textContent = EDGE_COUNT.toLocaleString("en-US");
    document.getElementById("ext-n1").textContent = tickFromTo(NODE_COUNT, NODE_COUNT + added, t4);
    document.getElementById("ext-e1").textContent = tickFromTo(EDGE_COUNT, EDGE_COUNT + added, t4);
  }
}

function ambFor(s){
  if (s==="0") return 1;
  if (s==="1") return 0.25;
  if (s==="1b") return 0.15;
  if (s==="2") return 0.28;
  if (s==="4") return 1;
  if (s==="5"){
    const ap = galaxyAppear();
    return 0.15 * (1 - ap);
  }
  return 0.2;
}

function draw(){
  now = frozen ? frozenNow : performance.now();
  ctx.clearRect(0,0,W,H);

  if (camT < 1 && camFrom && camTo && !frozen){
    camT = Math.min(1, (now - camStart) / camDur);
    const t = camT;
    if (camMode === "cinematic") Object.assign(cam, camPath(camFrom, camTo, t));
    else Object.assign(cam, { x:lerp(camFrom.x,camTo.x,easeInOutCubic(t)), y:lerp(camFrom.y,camTo.y,easeInOutCubic(t)), k:lerp(camFrom.k,camTo.k,easeInOutCubic(t)) });
  } else if (frozen && camFrom && camTo && camT < 1){
    if (camMode === "cinematic") Object.assign(cam, camPath(camFrom, camTo, camT));
    else Object.assign(cam, { x:lerp(camFrom.x,camTo.x,easeInOutCubic(camT)), y:lerp(camFrom.y,camTo.y,easeInOutCubic(camT)), k:lerp(camFrom.k,camTo.k,easeInOutCubic(camT)) });
  }

  if (!reduceMotion() && !frozen && entrance < 1){
    entrance = Math.min(1, (now - enterStart) / enterDur);
  } else if (reduceMotion()) entrance = 1;

  if (trans && !frozen){
    trans.t = Math.min(1, (now - trans.start) / trans.dur);
    if (trans.t >= 1){
      const left = trans.from;
      trans = null;
      applyChrome(1);
      if (left === "5" && stop !== "5"){
        galaxyFrozen = null;
        teardownGalaxy();
      }
    }
  }

  let amb = ambFor(stop);
  if (trans){
    amb = lerp(ambFor(trans.from), ambFor(trans.to), smootherstep(trans.t));
  }
  drawAmbience(amb, sleepAppear() * Math.max(amb, 0.5));

  const ent = entrance;
  const visCache = new Map();
  const visOf = n => {
    let v = visCache.get(n);
    if (!v){ v = currentVisualPose(n); visCache.set(n, v); }
    return v;
  };

  for (const e of edges){
    const pa = visOf(e.a), pb = visOf(e.b);
    let xa = pa.x, ya = pa.y, xb = pb.x, yb = pb.y;
    if (entrance < 1 && !trans && stop==="0"){
      const ea = entranceFor(e.a, ent), eb = entranceFor(e.b, ent);
      xa *= ea; ya *= ea; xb *= eb; yb *= eb;
    }
    const sa = worldToScreen(xa, ya), sb = worldToScreen(xb, yb);
    const dim = graphDim();
    const a = edgeAlpha(e, pa, pb) * Math.min(1, ent * 1.4) * dim;
    if (a < 0.01) continue;
    const width = e.type==="GENERATES" ? Math.max(0.45, 0.45*cam.k)
                : e.type==="NEXT" ? Math.max(1.0, 1.25*cam.k)
                : Math.max(1.1, 1.5*cam.k);
    let frac = 1;
    if (trans && trans.to==="1" && (e.b.kind==="steps"||e.b.kind==="glucose")){
      const role = e.b.day ? roleOf(e.b.day) : null;
      if (role==="sample-low" || role==="sample-mid"){
        frac = clamp01((visOf(e.b).t - 0.15) / 0.85);
      }
    }
    if (trans && trans.to==="2" && e.b.day && FOCUS.set.has(e.b.day.i) && (e.b.kind==="steps"||e.b.kind==="glucose")){
      frac = clamp01((visOf(e.b).t - 0.08) / 0.90);
    }
    drawEdge(sa, sb, e.color, a, width, frac < 1 ? easeOutCubic(frac) : 1);
  }

  drawAggEdges();

  const chainA = nextChainAppear();
  drawNextChain(chainA);
  drawSleepEdges(sleepAppear());

  const order = { sleep:0.4, glucose:0, hr:1, sed:2, active:3, intensity:3.5, steps:4, age:5, height:5, weight:5, bmi:5, profile:6, day:7, aggregate:7.5, user:8 };
  const sorted = allVisuals().slice().sort((a,b) => (order[a.kind]||0) - (order[b.kind]||0));
  const dimN = graphDim();
  for (const n of sorted){
    const vis = visOf(n);
    drawNode(n, dimN === 1 ? vis : { ...vis, a: vis.a * dimN }, ent);
  }

  drawChainLabels(chainChromeAppear());
  drawStrandLabels();
  /* Sleep tag is HTML, inside #stage-extend. */
  ctx.globalAlpha = 1;
  updateSplitChrome();
  updateStageChrome();
  drawGalaxy();
}

function loop(){
  draw();
  if (!frozen) requestAnimationFrame(loop);
}

/* -------------------------------------------------------------------------- */
/*  Interaction                                                               */
/* -------------------------------------------------------------------------- */
function hitTest(px, py){
  const w = screenToWorld(px, py);
  let best = null, bestD = Infinity;
  for (const n of allVisuals()){
    const vis = currentVisualPose(n);
    if (vis.a < 0.15) continue;
    let x = vis.x, y = vis.y;
    if (entrance < 1 && !trans && n.kind!=="aggregate" && n.kind!=="intensity" && n.kind!=="sleep"){
      const e = entranceFor(n, entrance);
      x *= e; y *= e;
    }
    const d = Math.hypot(w.x - x, w.y - y);
    if (d < vis.r + 10/cam.k && d < bestD){ best = n; bestD = d; }
  }
  return best;
}

function tipHTML(n){
  if (n.kind==="user") return `<b>${n.name}</b>The patient at the centre of this model.`;
  if (n.kind==="profile") return `<b>Profile</b>Age ${RAW.profile.age} · ${RAW.profile.cm} cm · ${RAW.profile.kg} kg`;
  if (n.kind==="bmi") return `<b>BMI</b><span class="big">${RAW.profile.bmi.toFixed(1)}</span>`;
  if (n.kind==="weight") return `<b>Weight</b><span class="big">${RAW.profile.kg} kg</span>`;
  if (n.kind==="height") return `<b>Height</b><span class="big">${RAW.profile.cm} cm</span>`;
  if (n.kind==="age") return `<b>Age</b><span class="big">${RAW.profile.age}</span>`;
  if (n.kind==="aggregate"){
    const avg = Math.round(n.avg);
    return `<b>${n.label}</b>${n.n} days · average glucose <span class="big" style="color:${gColor(n.avg)}">${avg} mg/dL</span><br>${n.over} of ${n.n} were over 180.`;
  }
  if (n.kind==="intensity"){
    return `<b>Intensity</b>${longDate(n.day.date)}<br><span class="big" style="color:${C.aurora}">${titleCase(n.value)}</span><br>A property of the day, not a separate node.`;
  }
  if (n.kind==="sleep"){
    return `<b>Sleep (example)</b>${longDate(n.day.date)}<br><span class="big">${n.value} ${n.unit}</span><br>Example data, not recorded.`;
  }
  const d = n.day;
  if (n.kind==="day"){
    const band = d.band==="low" ? "Low-step day" : d.band==="mid" ? "Middle day" : "High-step day";
    return `<b>${longDate(d.date)}</b><span class="big">${fmt(d.steps)} steps</span> · ${band}<br>Average glucose <span class="big" style="color:${gColor(d.avg)}">${Math.round(d.avg)} mg/dL</span>`;
  }
  const names = { steps:"Steps", active:"Active minutes", sed:"Sedentary time", hr:"Heart rate", glucose:"Glucose" };
  if (n.kind==="hr" && n.empty) return `<b>Heart rate</b>Not recorded on ${longDate(d.date)}.`;
  if (n.kind==="glucose"){
    return `<b>${n.reading.name}</b>${longDate(d.date)} · ${n.reading.time}<br><span class="big" style="color:${gColor(n.value)}">${Math.round(n.value)} mg/dL</span>`;
  }
  return `<b>${names[n.kind]||n.kind}</b>${longDate(d.date)}<br><span class="big">${fmt(n.value)} ${n.unit}</span>`;
}

function showTip(e, n){
  tip.innerHTML = tipHTML(n);
  tip.classList.add("show");
  moveTip(e);
}
function moveTip(e){
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 22, y = e.clientY + 22;
  if (x+w > innerWidth-12) x = e.clientX - w - 22;
  if (y+h > innerHeight-12) y = e.clientY - h - 22;
  tip.style.left = x+"px"; tip.style.top = y+"px";
}
function hideTip(){ tip.classList.remove("show"); hover = null; }

canvas.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  dragging = true; lastPX = e.clientX; lastPY = e.clientY;
  document.body.classList.add("is-drag");
  canvas.setPointerCapture(e.pointerId);
  camT = 1;
});
canvas.addEventListener("pointermove", e => {
  if (dragging){
    cam.x += e.clientX - lastPX;
    cam.y += e.clientY - lastPY;
    lastPX = e.clientX; lastPY = e.clientY;
    hideTip();
    return;
  }
  const n = hitTest(e.clientX, e.clientY);
  if (n !== hover){
    hover = n;
    if (n) showTip(e, n); else hideTip();
  } else if (n) moveTip(e);
});
canvas.addEventListener("pointerup", () => { dragging = false; document.body.classList.remove("is-drag"); });
canvas.addEventListener("pointercancel", () => { dragging = false; document.body.classList.remove("is-drag"); });
canvas.addEventListener("pointerleave", () => { if (!dragging) hideTip(); });
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  camT = 1;
  const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
  const nk = Math.max(0.12, Math.min(14, cam.k * factor));
  const w = screenToWorld(e.clientX, e.clientY);
  cam.k = nk;
  cam.x = e.clientX - w.x * cam.k;
  cam.y = e.clientY - w.y * cam.k;
}, { passive:false });

/* -------------------------------------------------------------------------- */
/*  Conclusion at scale — one large coherent network graph                    */
/* -------------------------------------------------------------------------- */
let gx = document.getElementById("gx");
let gl = null, galaxyReady = false, galaxyFrozen = null;
let GX = {
  pullCur: 0, pullFrom: 0, pullTo: 0, pullStart: 0, pullDur: 0,
};

const KH_SCALE = 1 / 150;

function gHash(i, s){
  let n = Math.imul((i | 0) ^ ((s || 0) * 0x9E3779B1), 0x9E3779B1);
  n = Math.imul(n ^ (n >>> 16), 0x85EBCA6B);
  n = Math.imul(n ^ (n >>> 13), 0xC2B2AE35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function gHex(c){
  if (!c) return [1,1,1];
  if (c[0] === "#"){
    const n = parseInt(c.slice(1), 16);
    if (c.length < 7){
      const r = (n >> 8) & 15, g = (n >> 4) & 15, b = n & 15;
      return [r/15, g/15, b/15];
    }
    return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
  }
  const m = /([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(c);
  return m ? [+m[1]/255, +m[2]/255, +m[3]/255] : [0.9, 0.9, 0.9];
}
function mat4Ortho(l, r, b, t, n, f){
  const o = new Float32Array(16);
  o[0] = 2/(r-l); o[5] = 2/(t-b); o[10] = -2/(f-n);
  o[12] = -(r+l)/(r-l); o[13] = -(t+b)/(t-b); o[14] = -(f+n)/(f-n); o[15] = 1;
  return o;
}
function xform4(m, x,y,z,w){
  w = w==null ? 1 : w;
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12]*w,
    m[1]*x + m[5]*y + m[9]*z + m[13]*w,
    m[2]*x + m[6]*y + m[10]*z + m[14]*w,
    m[3]*x + m[7]*y + m[11]*z + m[15]*w,
  ];
}

const PAL = [
  gHex(C.aurora), gHex(C.flare), gHex(C.acid), gHex(C.info),
  gHex(C.sed), gHex(C.canvas), gHex(C.warn), gHex("#C8C4BE"),
];
const SHAPE_COL = {
  path:    gHex(C.aurora),
  star:    gHex(C.flare),
  cycle:   gHex(C.acid),
  cluster: gHex(C.sed),
  tree:    gHex(C.info),
};

/* ----- CPU graph -------------------------------------------------------- */
function buildGalaxyCPU(){
  const MAXN = 40000, MAXE = 120000;
  const nx = new Float32Array(MAXN);
  const ny = new Float32Array(MAXN);
  const ns = new Float32Array(MAXN);
  const nr = new Float32Array(MAXN*3);
  const na = new Float32Array(MAXN);
  const nKH = new Uint8Array(MAXN);
  let nN = 0;

  const ea = new Int32Array(MAXE);
  const eb = new Int32Array(MAXE);
  const er = new Float32Array(MAXE);
  const eg = new Float32Array(MAXE);
  const ebl = new Float32Array(MAXE);
  const eal = new Float32Array(MAXE);
  const eKH = new Uint8Array(MAXE);
  let nE = 0;

  function addN(x,y,s, rgb, a, kh){
    const i = nN++;
    nx[i]=x; ny[i]=y; ns[i]=s;
    nr[i*3]=rgb[0]; nr[i*3+1]=rgb[1]; nr[i*3+2]=rgb[2];
    na[i]=a; nKH[i]=kh?1:0;
    return i;
  }
  function addE(a,b, rgb, al, kh){
    if (a===b || a<0 || b<0) return -1;
    const i = nE++;
    ea[i]=a; eb[i]=b;
    er[i]=rgb[0]; eg[i]=rgb[1]; ebl[i]=rgb[2];
    eal[i]=al; eKH[i]=kh?1:0;
    return i;
  }

  /* 1. The real patient graph, at the origin. */
  const khIndex = new Map();
  for (const nd of nodes){
    const i = addN(nd.x*KH_SCALE, -nd.y*KH_SCALE, Math.max(0.28, homeRadius(nd)*KH_SCALE), gHex(nd.color), nd.kind==="user"?1:0.95, true);
    khIndex.set(nd, i);
  }
  for (const e of edges){
    const a = khIndex.get(e.a), b = khIndex.get(e.b);
    if (a==null || b==null) continue;
    const c = gHex(e.color || C.aurora);
    const al = e.type==="GENERATES" ? 0.12 : e.type==="NEXT" ? 0.36 : 0.42;
    if (e.type==="GENERATES") continue; /* keep KH readable — skip the dense GENERATES hairball */
    addE(a, b, c, al, true);
  }
  const nKHNodes = nN;
  let khMax = 0;
  for (let i = 0; i < nKHNodes; i++) khMax = Math.max(khMax, Math.hypot(nx[i], ny[i]));
  GX.khR = khMax;
  GX.nKH = nKHNodes;

  /* 2. Planted, extractable structures — part of the fabric, clear when lit. */
  const extracts = [];
  const occupied = []; /* {x,y,r} exclusion for later communities */
  occupied.push({ x:0, y:0, r: khMax + 8 });

  function nearNode(x,y, maxD){
    let best = -1, bestD = maxD || 14;
    /* search last 800 nodes + a stride through earlier (enough for local wiring) */
    const start = Math.max(nKHNodes, nN - 900);
    for (let i = start; i < nN; i++){
      const d = Math.hypot(nx[i]-x, ny[i]-y);
      if (d > 0.4 && d < bestD){ bestD = d; best = i; }
    }
    return best;
  }
  function connectNear(i, nLinks, maxD){
    const cands = [];
    const start = Math.max(0, nN - 1200);
    for (let j = start; j < nN; j++){
      if (j===i) continue;
      const d = Math.hypot(nx[j]-nx[i], ny[j]-ny[i]);
      if (d > 0.8 && d < (maxD||16)) cands.push({ j, d });
    }
    cands.sort((a,b)=>a.d-b.d);
    const col = [nr[i*3], nr[i*3+1], nr[i*3+2]];
    for (let k = 0; k < Math.min(nLinks, cands.length); k++){
      addE(i, cands[k].j, col, 0.18, false);
    }
  }

  function plantPath(cx, cy, ang, len, col, seed){
    const ids = [], eids = [];
    let x = cx, y = cy, a = ang;
    let prev = -1;
    const step = 2.15;
    for (let i = 0; i < len; i++){
      a += (gHash(seed, i+3)-0.5)*0.55;
      x += Math.cos(a)*step;
      y += Math.sin(a)*step;
      const id = addN(x, y, 0.55 + (i===0||i===len-1?0.15:0), col, 0.72, false);
      ids.push(id);
      if (prev >= 0) eids.push(addE(prev, id, col, 0.22, false));
      prev = id;
    }
    connectNear(ids[0], 2, 14);
    connectNear(ids[ids.length-1], 2, 14);
    occupied.push({ x:(nx[ids[0]]+nx[prev])/2, y:(ny[ids[0]]+ny[prev])/2, r: len*step*0.4 + 4 });
    const path = ids.slice();
    extracts.push({ type:"path", nodes:ids, edges:eids.filter(e=>e>=0), path, color:col, cx, cy });
  }

  function plantStar(cx, cy, spokes, col, seed){
    const hub = addN(cx, cy, 1.15, col, 0.85, false);
    const ids = [hub], eids = [], path = [hub];
    const R = 6.2 + gHash(seed, 1)*2.4;
    for (let i = 0; i < spokes; i++){
      const a = (i/spokes)*TAU + (gHash(seed, i+2)-0.5)*0.18;
      const r = R * (0.82 + gHash(seed, i+20)*0.32);
      const id = addN(cx+Math.cos(a)*r, cy+Math.sin(a)*r, 0.55, col, 0.72, false);
      ids.push(id);
      eids.push(addE(hub, id, col, 0.24, false));
      path.push(id, hub);
      if (gHash(seed, i+40) < 0.35) connectNear(id, 1, 12);
    }
    connectNear(hub, 2, 16);
    occupied.push({ x:cx, y:cy, r: R+4 });
    extracts.push({ type:"star", nodes:ids, edges:eids.filter(e=>e>=0), path, color:col, cx, cy });
  }

  function plantCycle(cx, cy, len, col, seed){
    const ids = [], eids = [];
    const R = 6.8 + gHash(seed, 1)*2.2;
    for (let i = 0; i < len; i++){
      const a = (i/len)*TAU + (gHash(seed, i+2)-0.5)*0.12;
      const r = R * (0.92 + gHash(seed, i+20)*0.14);
      ids.push(addN(cx+Math.cos(a)*r, cy+Math.sin(a)*r, 0.58, col, 0.75, false));
    }
    for (let i = 0; i < len; i++){
      eids.push(addE(ids[i], ids[(i+1)%len], col, 0.24, false));
    }
    /* one light chord so it still reads as a graph, not a decoration */
    if (len >= 8) eids.push(addE(ids[0], ids[(len/2)|0], col, 0.12, false));
    const path = ids.concat([ids[0]]);
    connectNear(ids[0], 2, 14);
    connectNear(ids[(len/3)|0], 1, 14);
    occupied.push({ x:cx, y:cy, r: R+4 });
    extracts.push({ type:"cycle", nodes:ids, edges:eids.filter(e=>e>=0), path, color:col, cx, cy });
  }

  function plantCluster(cx, cy, n, col, seed){
    const ids = [], eids = [];
    const R = 5.4 + gHash(seed, 1)*1.6;
    for (let i = 0; i < n; i++){
      const a = gHash(seed, i+2)*TAU;
      const r = R * Math.sqrt(gHash(seed, i+30));
      ids.push(addN(cx+Math.cos(a)*r, cy+Math.sin(a)*r*0.88, 0.5+gHash(seed,i+50)*0.2, col, 0.74, false));
    }
    /* k-nearest — dense */
    for (let i = 0; i < n; i++){
      const ds = [];
      for (let j = 0; j < n; j++) if (j!==i){
        ds.push({ j, d: Math.hypot(nx[ids[i]]-nx[ids[j]], ny[ids[i]]-ny[ids[j]]) });
      }
      ds.sort((a,b)=>a.d-b.d);
      const k = 4 + (gHash(seed, i+70)<0.4?1:0);
      for (let t = 0; t < k; t++){
        if (ids[i] < ids[ds[t].j]) eids.push(addE(ids[i], ids[ds[t].j], col, 0.22, false));
      }
    }
    /* a tour so the agent visits everyone */
    const path = [];
    const left = ids.slice();
    let cur = left.shift();
    path.push(cur);
    while (left.length){
      let bi=0, bd=1e9;
      for (let t=0;t<left.length;t++){
        const d=Math.hypot(nx[cur]-nx[left[t]], ny[cur]-ny[left[t]]);
        if (d<bd){ bd=d; bi=t; }
      }
      cur = left.splice(bi,1)[0];
      path.push(cur);
    }
    connectNear(ids[0], 2, 14);
    connectNear(ids[n>>1], 2, 14);
    occupied.push({ x:cx, y:cy, r: R+4 });
    extracts.push({ type:"cluster", nodes:ids, edges:eids.filter(e=>e>=0), path, color:col, cx, cy });
  }

  function plantTree(cx, cy, col, seed){
    const ids = [], eids = [], path = [];
    const root = addN(cx, cy, 0.95, col, 0.85, false);
    ids.push(root); path.push(root);
    function branch(parent, depth, ang, len){
      if (depth > 3) return;
      const kids = depth===0 ? 3 : depth===1 ? 2 : (gHash(seed, parent+depth)<0.55?2:1);
      const spread = 0.85 - depth*0.12;
      for (let k = 0; k < kids; k++){
        const a = ang + (k - (kids-1)/2) * spread + (gHash(seed, parent*13+k)-0.5)*0.15;
        const l = len * (0.86 + gHash(seed, parent+k)*0.16);
        const x = nx[parent] + Math.cos(a)*l;
        const y = ny[parent] + Math.sin(a)*l;
        const id = addN(x, y, 0.7 - depth*0.1, col, 0.74, false);
        ids.push(id);
        eids.push(addE(parent, id, col, 0.24, false));
        path.push(id);
        branch(id, depth+1, a, len*0.72);
        path.push(parent); /* walk back so the agent stays on edges */
      }
    }
    const trunkAng = (gHash(seed, 9)-0.5)*0.6 - Math.PI/2;
    branch(root, 0, trunkAng, 5.4);
    connectNear(root, 2, 14);
    /* leaf connections */
    if (ids.length > 4) connectNear(ids[ids.length-1], 1, 12);
    occupied.push({ x:cx, y:cy, r: 16 });
    extracts.push({ type:"tree", nodes:ids, edges:eids.filter(e=>e>=0), path, color:col, cx, cy });
  }

  /* A path that leaves the patient graph and enters the large one. */
  {
    /* pick an outer KH node on the right-hand side */
    let start = 0, bestX = -1e9;
    for (let i = 0; i < nKHNodes; i++){
      if (nx[i] > bestX && Math.hypot(nx[i], ny[i]) > khMax*0.7){ bestX = nx[i]; start = i; }
    }
    const col = SHAPE_COL.path;
    const ids = [start], eids = [];
    let x = nx[start], y = ny[start], a = 0.15;
    let prev = start;
    for (let i = 0; i < 14; i++){
      a += (gHash(11, i)-0.5)*0.4;
      x += Math.cos(a)*2.2;
      y += Math.sin(a)*2.2;
      const id = addN(x, y, 0.55, col, 0.72, false);
      ids.push(id);
      eids.push(addE(prev, id, col, 0.28, false));
      prev = id;
    }
    occupied.push({ x:(nx[start]+x)/2, y:(ny[start]+y)/2, r: 16 });
    extracts.push({ type:"path", nodes:ids, edges:eids.filter(e=>e>=0), path:ids.slice(), color:col, cx:x, cy:y, fromKH:true });
  }

  /* Place the rest of the distinctive shapes around the disk, skipping the top-left text zone a bit. */
  const plan = [
    ["star",    38,  -8, 11],
    ["cycle",  -32,  22, 9],
    ["cluster", 28,  30, 22],
    ["tree",   -40, -28, 0],
    ["path",    55,  12, 14],
    ["star",   -18, -42, 12],
    ["cycle",   62, -28, 10],
    ["tree",    14,  48, 0],
    ["cluster",-58,   6, 24],
    ["path",   -48, -48, 13],
    ["star",    78,  18, 10],
    ["cycle",   42, -52, 10],
    ["tree",   -70, -16, 0],
    ["cluster",  8, -62, 22],
    ["path",    88, -12, 14],
    ["star",   -28,  55, 11],
    ["cycle",   70,  42, 9],
    ["tree",    50,  62, 0],
    ["cluster",-78,  32, 22],
    ["path",   100,  28, 13],
    ["star",    22,  78, 10],
    ["cycle",  -88, -40, 10],
    ["tree",    92, -48, 0],
    ["cluster",-10,  70, 20],
    ["path",   -96,  16, 14],
    ["star",    58, -78, 11],
    ["cycle",  -60,  70, 9],
    ["tree",   -50, -72, 0],
  ];
  for (let p = 0; p < plan.length; p++){
    const [kind, x, y, n] = plan[p];
    /* skip if too close to an occupied region */
    let ok = true;
    for (const o of occupied){
      if (Math.hypot(x-o.x, y-o.y) < o.r + 10){ ok = false; break; }
    }
    if (!ok) continue;
    const col = PAL[p % PAL.length];
    if (kind==="path") plantPath(x, y, gHash(p,1)*TAU, n, col, 200+p);
    else if (kind==="star") plantStar(x, y, n, col, 200+p);
    else if (kind==="cycle") plantCycle(x, y, n, col, 200+p);
    else if (kind==="cluster") plantCluster(x, y, n, col, 200+p);
    else plantTree(x, y, col, 200+p);
  }


  /* More planted shapes across the disk, so pops can happen everywhere. */
  {
    const kinds = ["path","star","cycle","cluster","tree"];
    for (let p = 0; p < 40; p++){
      const ang = (p / 40) * TAU + (gHash(p, 21) - 0.5) * 0.22;
      const rad = 26 + (p % 7) * 16 + gHash(p, 22) * 10;
      const x = Math.cos(ang) * rad * (0.9 + gHash(p, 23) * 0.22);
      const y = Math.sin(ang) * rad * (0.74 + gHash(p, 24) * 0.22);
      /* leave the top-left text region a little clearer */
      if (x < -55 && y > 48) continue;
      let ok = true;
      for (const o of occupied){
        if (Math.hypot(x - o.x, y - o.y) < o.r + 9){ ok = false; break; }
      }
      if (!ok) continue;
      const kind = kinds[p % 5];
      const col = PAL[(p + 3) % PAL.length];
      const n = 9 + Math.floor(gHash(p, 25) * 8);
      if (kind === "path") plantPath(x, y, gHash(p, 26) * TAU, 11 + (p % 5), col, 400 + p);
      else if (kind === "star") plantStar(x, y, 8 + (p % 6), col, 400 + p);
      else if (kind === "cycle") plantCycle(x, y, 8 + (p % 5), col, 400 + p);
      else if (kind === "cluster") plantCluster(x, y, 16 + (p % 10), col, 400 + p);
      else plantTree(x, y, col, 400 + p);
    }
  }

  /* 3. Organic communities filling the rest — Mitchell's best candidate, no spiral. */

  const communities = [];
  const NC = 560;
  for (let i = 0; i < NC; i++){
    let best=null, bestD=-1;
    for (let k = 0; k < 18; k++){
      const ang = gHash(i, k+1)*TAU;
      const rad = 20 + Math.pow(gHash(i, k+40), 0.58)*168;
      const x = Math.cos(ang)*rad * (0.88 + gHash(i,k+60)*0.28);
      const y = Math.sin(ang)*rad * (0.72 + gHash(i,k+80)*0.16);
      if (Math.hypot(x,y) < khMax + 7) continue;
      let dmin = 1e9;
      for (const o of occupied){
        dmin = Math.min(dmin, Math.hypot(x-o.x, y-o.y) - o.r);
      }
      for (const c of communities){
        dmin = Math.min(dmin, Math.hypot(x-c.x, y-c.y) - c.r);
      }
      if (dmin > bestD){ bestD = dmin; best = { x, y, d:dmin }; }
    }
    if (!best || bestD < 3.2) continue;
    const r = 3.8 + gHash(i, 90)*4.6;
    const nn = 22 + Math.floor(gHash(i, 91)*48);
    communities.push({ x:best.x, y:best.y, r, n:nn, seed:i });
  }

  /* Mini force-directed layout per community + kNN edges. */
  for (const C of communities){
    const pts = [];
    for (let i = 0; i < C.n; i++){
      const a = gHash(C.seed, i+2)*TAU;
      const r = C.r * Math.sqrt(gHash(C.seed, i+30));
      pts.push({ x: C.x+Math.cos(a)*r, y: C.y+Math.sin(a)*r*0.92, vx:0, vy:0 });
    }
    /* 12 quick iterations of repulsion + weak centering */
    for (let it = 0; it < 12; it++){
      for (let i = 0; i < pts.length; i++){
        let fx = (C.x-pts[i].x)*0.08, fy = (C.y-pts[i].y)*0.08;
        for (let j = 0; j < pts.length; j++){
          if (i===j) continue;
          const dx = pts[i].x-pts[j].x, dy = pts[i].y-pts[j].y;
          const d2 = dx*dx+dy*dy + 0.05;
          const f = 0.55 / d2;
          fx += dx*f; fy += dy*f;
        }
        pts[i].vx = (pts[i].vx + fx)*0.6;
        pts[i].vy = (pts[i].vy + fy)*0.6;
        pts[i].x += pts[i].vx;
        pts[i].y += pts[i].vy;
      }
    }
    const pal = PAL[Math.floor(gHash(C.seed, 5)*PAL.length)];
    const pal2 = PAL[Math.floor(gHash(C.seed, 6)*PAL.length)];
    const ids = [];
    for (let i = 0; i < pts.length; i++){
      const u = gHash(C.seed, i+8);
      const col = u<0.7 ? pal : pal2;
      const s = 0.38 + u*0.28;
      ids.push(addN(pts[i].x, pts[i].y, s, col, 0.62, false));
    }
    C.ids = ids;
    /* kNN */
    for (let i = 0; i < ids.length; i++){
      const ds = [];
      for (let j = 0; j < ids.length; j++) if (j!==i){
        ds.push({ j, d: Math.hypot(nx[ids[i]]-nx[ids[j]], ny[ids[i]]-ny[ids[j]]) });
      }
      ds.sort((a,b)=>a.d-b.d);
      const k = 3 + (gHash(C.seed, i+11)<0.35?1:0);
      for (let t = 0; t < Math.min(k, ds.length); t++){
        if (ids[i] < ids[ds[t].j]){
          const c = [nr[ids[i]*3], nr[ids[i]*3+1], nr[ids[i]*3+2]];
          addE(ids[i], ids[ds[t].j], c, 0.16, false);
        }
      }
    }
  }

  /* Bridges between nearby communities — one connected fabric. */
  for (let i = 0; i < communities.length; i++){
    const A = communities[i];
    const near = [];
    for (let j = i+1; j < communities.length; j++){
      const d = Math.hypot(A.x-communities[j].x, A.y-communities[j].y);
      if (d < A.r+communities[j].r+18) near.push({ j, d });
    }
    near.sort((a,b)=>a.d-b.d);
    const nB = 1 + (gHash(i, 15)<0.5?1:0) + (gHash(i,16)<0.2?1:0);
    for (let t = 0; t < Math.min(nB, near.length); t++){
      const B = communities[near[t].j];
      /* 2-3 bridge edges between closest members, with a midpoint node on long ones */
      for (let b = 0; b < 2; b++){
        const ia = A.ids[Math.floor(gHash(i, 20+t*3+b)*A.ids.length)];
        const ib = B.ids[Math.floor(gHash(i, 40+t*3+b)*B.ids.length)];
        const d = Math.hypot(nx[ia]-nx[ib], ny[ia]-ny[ib]);
        const c = [ (nr[ia*3]+nr[ib*3])*0.5, (nr[ia*3+1]+nr[ib*3+1])*0.5, (nr[ia*3+2]+nr[ib*3+2])*0.5 ];
        if (d > 9){
          const mx = (nx[ia]+nx[ib])/2 + (gHash(i,60+b)-0.5)*1.2;
          const my = (ny[ia]+ny[ib])/2 + (gHash(i,70+b)-0.5)*1.2;
          const mid = addN(mx, my, 0.36, c, 0.5, false);
          addE(ia, mid, c, 0.14, false);
          addE(mid, ib, c, 0.14, false);
        } else {
          addE(ia, ib, c, 0.15, false);
        }
      }
    }
  }

  /* Bridges from the patient graph's outer ring into nearby communities. */
  const outerKH = [];
  for (let i = 0; i < nKHNodes; i++){
    const r = Math.hypot(nx[i], ny[i]);
    if (r > khMax*0.62) outerKH.push(i);
  }
  let khBridges = 0;
  for (const C of communities){
    if (Math.hypot(C.x, C.y) > khMax + 28) continue;
    const kh = outerKH[Math.floor(gHash(C.seed, 99)*outerKH.length)];
    const net = C.ids[Math.floor(gHash(C.seed, 98)*C.ids.length)];
    const c = [ (nr[kh*3]+nr[net*3])*0.5, (nr[kh*3+1]+nr[net*3+1])*0.5, (nr[kh*3+2]+nr[net*3+2])*0.5 ];
    const d = Math.hypot(nx[kh]-nx[net], ny[kh]-ny[net]);
    if (d > 11){
      const mid = addN((nx[kh]+nx[net])/2, (ny[kh]+ny[net])/2, 0.4, c, 0.6, false);
      addE(kh, mid, c, 0.28, false);
      addE(mid, net, c, 0.22, false);
    } else {
      addE(kh, net, c, 0.28, false);
    }
    khBridges++;
    if (khBridges >= 16) break;
  }
  /* Wire planted structures into the finished community fabric. */
  function connectNearFull(i, nLinks, maxD){
    const cands = [];
    for (let j = 0; j < nN; j++){
      if (j===i) continue;
      const d = Math.hypot(nx[j]-nx[i], ny[j]-ny[i]);
      if (d > 0.8 && d < (maxD||16)) cands.push({ j, d });
    }
    cands.sort((a,b)=>a.d-b.d);
    const col = [nr[i*3], nr[i*3+1], nr[i*3+2]];
    let n = 0;
    for (const c of cands){
      if (n >= nLinks) break;
      /* skip if already connected (cheap: just add; duplicate edges are dim and rare) */
      addE(i, c.j, col, 0.18, false);
      n++;
    }
  }
  for (const ex of extracts){
    connectNearFull(ex.nodes[0], 2, 15);
    connectNearFull(ex.nodes[ex.nodes.length-1], 2, 15);
  }

  /* Adjacency of the finished fabric, for roamers and derived extracts. */
  const adj = Array.from({ length: nN }, () => []);
  const edgeOf = new Map();
  for (let i = 0; i < nE; i++){
    adj[ea[i]].push(eb[i]);
    adj[eb[i]].push(ea[i]);
    const a = ea[i], b = eb[i];
    edgeOf.set(a < b ? a + "," + b : b + "," + a, i);
  }
  function eid(a, b){
    const v = edgeOf.get(a < b ? a + "," + b : b + "," + a);
    return v == null ? -1 : v;
  }
  function edgesAlong(path){
    const out = [];
    for (let i = 0; i < path.length - 1; i++){
      const e = eid(path[i], path[i + 1]);
      if (e >= 0) out.push(e);
    }
    return out;
  }
  function walkFrom(start, len, seed){
    const path = [start];
    let cur = start, prev = -1;
    for (let h = 0; h < len; h++){
      const nbrs = adj[cur];
      if (!nbrs.length) break;
      const fresh = [];
      for (let k = 0; k < nbrs.length; k++){
        const j = nbrs[k];
        if (j !== prev && path.indexOf(j) < 0) fresh.push(j);
      }
      const pool = fresh.length ? fresh : nbrs.filter(j => j !== prev);
      if (!pool.length) break;
      const nxt = pool[Math.floor(gHash(seed, h + 11) * pool.length)];
      path.push(nxt);
      prev = cur; cur = nxt;
    }
    return path;
  }
  function findCycle(start, minLen, maxLen, seed){
    const seen = new Set([start]);
    const path = [start];
    let cur = start, parent = -1;
    for (let step = 0; step < maxLen + 12; step++){
      const nbrs = adj[cur].filter(j => j !== parent);
      const fresh = nbrs.filter(j => !seen.has(j));
      if (fresh.length){
        const nxt = fresh[Math.floor(gHash(seed, step + 4) * fresh.length)];
        path.push(nxt); seen.add(nxt);
        parent = cur; cur = nxt;
        continue;
      }
      if (path.length >= minLen && path.length <= maxLen && adj[cur].indexOf(start) >= 0){
        path.push(start);
        return path;
      }
      if (path.length <= 2) return null;
      path.pop();
      cur = path[path.length - 1];
      parent = path.length >= 2 ? path[path.length - 2] : -1;
    }
    if (path.length >= minLen && adj[path[path.length - 1]].indexOf(start) >= 0){
      path.push(start);
      return path;
    }
    return null;
  }
  function bfsTree(root, maxN, maxD){
    const nodes = [root];
    const pairs = [];
    const q = [[root, 0]];
    const seen = new Set([root]);
    let qi = 0;
    while (qi < q.length && nodes.length < maxN){
      const n = q[qi][0], d = q[qi][1]; qi++;
      if (d >= maxD) continue;
      for (const j of adj[n]){
        if (seen.has(j)) continue;
        seen.add(j);
        nodes.push(j);
        pairs.push([n, j]);
        q.push([j, d + 1]);
        if (nodes.length >= maxN) break;
      }
    }
    if (nodes.length < 8) return null;
    const kids = new Map();
    for (const pair of pairs){
      const a = pair[0], b = pair[1];
      if (!kids.has(a)) kids.set(a, []);
      kids.get(a).push(b);
    }
    const path = [];
    (function dfs(u){
      path.push(u);
      const ks = kids.get(u) || [];
      for (const v of ks){
        dfs(v);
        path.push(u);
      }
    })(root);
    const eids = pairs.map(pair => eid(pair[0], pair[1])).filter(e => e >= 0);
    return { nodes, edges: eids, path };
  }

  /* Derive many extracts from communities so shapes pop all over the fabric. */
  const kindsCycle = ["cluster", "star", "path", "cycle", "tree"];
  const usedCx = extracts.map(e => ({ x: e.cx, y: e.cy }));
  const comms = communities.slice().filter(C => C.ids && C.ids.length >= 8);
  for (let i = comms.length - 1; i > 0; i--){
    const j = Math.floor(gHash(i, 301) * (i + 1));
    const tmp = comms[i]; comms[i] = comms[j]; comms[j] = tmp;
  }
  const pickedC = [];
  for (const C of comms){
    let ok = true;
    for (const o of usedCx){
      if (Math.hypot(C.x - o.x, C.y - o.y) < 14){ ok = false; break; }
    }
    if (!ok) continue;
    usedCx.push({ x: C.x, y: C.y });
    pickedC.push(C);
    if (pickedC.length >= 80) break;
  }
  for (let pi = 0; pi < pickedC.length; pi++){
    const C = pickedC[pi];
    const kind = kindsCycle[pi % 5];
    const col = PAL[pi % PAL.length];
    const seed = 700 + pi;
    const cx = C.x, cy = C.y;
    let made = null;
    if (kind === "cluster"){
      const eids = [];
      for (let i = 0; i < C.ids.length; i++){
        for (let j = i + 1; j < C.ids.length; j++){
          const e = eid(C.ids[i], C.ids[j]);
          if (e >= 0) eids.push(e);
        }
      }
      const path = walkFrom(C.ids[Math.floor(gHash(seed, 1) * C.ids.length)], Math.min(16, C.ids.length), seed);
      if (path.length >= 5 && eids.length >= 6)
        made = { type: "cluster", nodes: C.ids.slice(), edges: eids, path, color: col, cx, cy };
    } else if (kind === "star"){
      let hub = C.ids[0], deg = -1;
      for (const id of C.ids){
        const d = adj[id].length;
        if (d > deg){ deg = d; hub = id; }
      }
      const leaves = adj[hub].slice(0, 12);
      if (leaves.length >= 4){
        const nodes = [hub].concat(leaves);
        const path = [];
        const eids = [];
        for (const l of leaves){
          path.push(hub, l);
          const e = eid(hub, l);
          if (e >= 0) eids.push(e);
        }
        path.push(hub);
        made = { type: "star", nodes, edges: eids, path, color: col, cx: nx[hub], cy: ny[hub] };
      }
    } else if (kind === "path"){
      const start = C.ids[Math.floor(gHash(seed, 1) * C.ids.length)];
      const path = walkFrom(start, 14, seed);
      if (path.length >= 8){
        const mid = path[(path.length / 2) | 0];
        made = { type: "path", nodes: path.slice(), edges: edgesAlong(path), path, color: col, cx: nx[mid], cy: ny[mid] };
      }
    } else if (kind === "cycle"){
      const start = C.ids[Math.floor(gHash(seed, 2) * C.ids.length)];
      let cyc = findCycle(start, 6, 14, seed);
      if (!cyc){
        for (let tt = 0; tt < 6 && !cyc; tt++){
          cyc = findCycle(C.ids[Math.floor(gHash(seed, 3 + tt) * C.ids.length)], 6, 14, seed + tt * 9);
        }
      }
      if (cyc && cyc.length >= 7){
        made = { type: "cycle", nodes: cyc.slice(), edges: edgesAlong(cyc), path: cyc, color: col, cx, cy };
      }
    } else {
      const root = C.ids[Math.floor(gHash(seed, 8) * C.ids.length)];
      const tr = bfsTree(root, 16, 3);
      if (tr){
        made = { type: "tree", nodes: tr.nodes, edges: tr.edges, path: tr.path, color: col, cx: nx[root], cy: ny[root] };
      }
    }
    if (made) extracts.push(made);
  }

  /* 80 roaming agents, starts spread across the whole fabric, not at the orbit. */
  const roamers = [];
  for (let i = 0; i < 80; i++){
    const C = communities[Math.floor(gHash(i, 501) * communities.length)];
    if (!C || !C.ids || !C.ids.length) continue;
    const start = C.ids[Math.floor(gHash(i, 502) * C.ids.length)];
    let path = walkFrom(start, 56 + Math.floor(gHash(i, 503) * 36), 900 + i);
    if (path.length < 12) path = walkFrom(start, 70, 1100 + i);
    if (path.length < 8) continue;
    roamers.push({
      path,
      color: PAL[i % PAL.length],
      phase: gHash(i, 504) * 22,
      hop: 0.26 + gHash(i, 505) * 0.24,
    });
  }
  GX.roamers = roamers;

  /* Fill-in fabric that occupies the orbit's exclusion hole.
     Organic communities (same visual language as the rest of the graph),
     irregularly placed so the region does not read as a circle or a ring.
     Invisible at the start of the zoom; fades in as the orbit fades out. */
  const fillN0 = nN;
  const fillE0 = nE;
  const fillComs = [];
  const nFillCom = 26;
  for (let f = 0; f < nFillCom; f++){
    /* Irregular positions: mostly inside the hole, a few overlapping the inner fabric. */
    const ang = (f / nFillCom) * TAU + (gHash(f, 821) - 0.5) * 0.7;
    const rad = Math.sqrt(gHash(f, 822)) * (khMax + 18);
    const cx = Math.cos(ang) * rad * (0.88 + gHash(f, 823) * 0.28);
    const cy = Math.sin(ang) * rad * (0.70 + gHash(f, 824) * 0.28);
    const r = 3.4 + gHash(f, 825) * 3.2;
    const nn = 28 + Math.floor(gHash(f, 826) * 30);
    const pal = PAL[Math.floor(gHash(f, 827) * PAL.length)];
    const pal2 = PAL[Math.floor(gHash(f, 828) * PAL.length)];
    const pts = [];
    for (let i = 0; i < nn; i++){
      const a = gHash(f, i + 10) * TAU;
      const rr = r * Math.sqrt(gHash(f, i + 40));
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.9, vx: 0, vy: 0 });
    }
    for (let it = 0; it < 10; it++){
      for (let i = 0; i < pts.length; i++){
        let fx = (cx - pts[i].x) * 0.08, fy = (cy - pts[i].y) * 0.08;
        for (let j = 0; j < pts.length; j++){
          if (i === j) continue;
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy + 0.05;
          const ff = 0.5 / d2;
          fx += dx * ff; fy += dy * ff;
        }
        pts[i].vx = (pts[i].vx + fx) * 0.6;
        pts[i].vy = (pts[i].vy + fy) * 0.6;
        pts[i].x += pts[i].vx;
        pts[i].y += pts[i].vy;
      }
    }
    const ids = [];
    for (let i = 0; i < pts.length; i++){
      const u = gHash(f, i + 90);
      const col = u < 0.7 ? pal : pal2;
      const s = 0.40 + u * 0.28;
      ids.push(addN(pts[i].x, pts[i].y, s, col, 0, false));
    }
    for (let i = 0; i < ids.length; i++){
      const ds = [];
      for (let j = 0; j < ids.length; j++) if (j !== i){
        ds.push({ j, d: Math.hypot(nx[ids[i]] - nx[ids[j]], ny[ids[i]] - ny[ids[j]]) });
      }
      ds.sort((a, b) => a.d - b.d);
      const k = 3 + (gHash(f, i + 110) < 0.35 ? 1 : 0);
      for (let tt = 0; tt < Math.min(k, ds.length); tt++){
        if (ids[i] < ids[ds[tt].j]){
          const c = [nr[ids[i] * 3], nr[ids[i] * 3 + 1], nr[ids[i] * 3 + 2]];
          addE(ids[i], ids[ds[tt].j], c, 0.16, false);
        }
      }
    }
    fillComs.push({ x: cx, y: cy, r, ids });
  }
  /* Bridges between fill communities. */
  for (let i = 0; i < fillComs.length; i++){
    const A = fillComs[i];
    const near = [];
    for (let j = i + 1; j < fillComs.length; j++){
      const d = Math.hypot(A.x - fillComs[j].x, A.y - fillComs[j].y);
      if (d < A.r + fillComs[j].r + 16) near.push({ j, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (let t = 0; t < Math.min(2, near.length); t++){
      const B = fillComs[near[t].j];
      const ia = A.ids[Math.floor(gHash(i, 900 + t) * A.ids.length)];
      const ib = B.ids[Math.floor(gHash(i, 910 + t) * B.ids.length)];
      const c = [
        (nr[ia * 3] + nr[ib * 3]) * 0.5,
        (nr[ia * 3 + 1] + nr[ib * 3 + 1]) * 0.5,
        (nr[ia * 3 + 2] + nr[ib * 3 + 2]) * 0.5,
      ];
      addE(ia, ib, c, 0.15, false);
    }
  }
  /* Bridges from fill-in into the surrounding (pre-fill, non-KH) fabric. */
  for (const C of fillComs){
    const cands = [];
    for (let j = GX.nKH + (C.ids[0] % 5); j < fillN0; j += 7){
      const d = Math.hypot(nx[j] - C.x, ny[j] - C.y);
      if (d < C.r + 24) cands.push({ j, d });
    }
    cands.sort((a, b) => a.d - b.d);
    for (let t = 0; t < Math.min(5, cands.length); t++){
      const ia = C.ids[Math.floor(gHash(t, 930) * C.ids.length)];
      const ib = cands[t].j;
      const c = [
        (nr[ia * 3] + nr[ib * 3]) * 0.5,
        (nr[ia * 3 + 1] + nr[ib * 3 + 1]) * 0.5,
        (nr[ia * 3 + 2] + nr[ib * 3 + 2]) * 0.5,
      ];
      addE(ia, ib, c, 0.15, false);
    }
  }
  const fillN1 = nN;
  const fillE1 = nE;
  GX.fillN0 = fillN0; GX.fillN1 = fillN1;
  GX.fillE0 = fillE0; GX.fillE1 = fillE1;
  const fillNodeA = new Float32Array(fillN1 - fillN0);
  const fillNodeS = new Float32Array(fillN1 - fillN0);
  for (let i = fillN0; i < fillN1; i++){
    fillNodeA[i - fillN0] = Math.min(0.96, 0.62 * 1.50);
    fillNodeS[i - fillN0] = ns[i] * 1.55;
  }
  const fillEdgeA = new Float32Array(fillE1 - fillE0);
  for (let i = fillE0; i < fillE1; i++){
    fillEdgeA[i - fillE0] = Math.min(0.50, eal[i] * 2.55);
  }
  GX.fillNodeA = fillNodeA; GX.fillNodeS = fillNodeS; GX.fillEdgeA = fillEdgeA;

  /* KH orbit dissolve targets: a filled, scrambled organic blob.
     As the camera zooms out, the distinctive ring eases into ordinary nodes.
     Reversing the zoom (a function of pull) brings the orbit back. */
  const khOx = new Float32Array(nKHNodes);
  const khOy = new Float32Array(nKHNodes);
  const khOs = new Float32Array(nKHNodes);
  const khOa = new Float32Array(nKHNodes);
  const khTx = new Float32Array(nKHNodes);
  const khTy = new Float32Array(nKHNodes);
  const khTs = new Float32Array(nKHNodes);
  const khTa = new Float32Array(nKHNodes);
  for (let i = 0; i < nKHNodes; i++){
    khOx[i] = nx[i]; khOy[i] = ny[i]; khOs[i] = ns[i]; khOa[i] = na[i];
    const r = Math.hypot(nx[i], ny[i]);
    const ang = Math.atan2(ny[i], nx[i]);
    const tr = r * (0.12 + 0.78 * gHash(i, 11));
    const ta = ang + (gHash(i, 12) - 0.5) * 1.55;
    khTx[i] = Math.cos(ta) * tr + (gHash(i, 13) - 0.5) * 1.15;
    khTy[i] = Math.sin(ta) * tr + (gHash(i, 14) - 0.5) * 1.15;
    khTs[i] = 0.42 + gHash(i, 15) * 0.22;
    khTa[i] = 0.90;
  }
  GX.khOx = khOx; GX.khOy = khOy; GX.khOs = khOs; GX.khOa = khOa;
  GX.khTx = khTx; GX.khTy = khTy; GX.khTs = khTs; GX.khTa = khTa;

  GX.nN = nN; GX.nE = nE;
  GX.nx = nx; GX.ny = ny; GX.ns = ns; GX.nr = nr; GX.na = na; GX.nIsKH = nKH;
  GX.ea = ea; GX.eb = eb; GX.er = er; GX.eg = eg; GX.ebl = ebl; GX.eal = eal; GX.eIsKH = eKH;
  GX.extracts = extracts;

  /* Packed static arrays for GL. Brightness lifted so the fabric reads on a projector. */
  const NODE_LIFT = 1.50;
  const NODE_SIZE = 1.55;
  const EDGE_LIFT = 2.55;
  const EDGE_CAP = 0.50;

  let nExtra = 0;
  for (let i = 0; i < nE; i++) if (!eKH[i]) nExtra++;
  const pos = new Float32Array((nN + nExtra) * 3);
  const col = new Float32Array((nN + nExtra) * 4);
  const sz  = new Float32Array(nN + nExtra);
  for (let i = 0; i < nN; i++){
    pos[i * 3] = nx[i]; pos[i * 3 + 1] = ny[i]; pos[i * 3 + 2] = 0;
    col[i * 4] = nr[i * 3]; col[i * 4 + 1] = nr[i * 3 + 1]; col[i * 4 + 2] = nr[i * 3 + 2];
    const isFillN = i >= GX.fillN0 && i < GX.fillN1;
    col[i * 4 + 3] = nKH[i] ? na[i] : (isFillN ? 0 : Math.min(0.96, na[i] * NODE_LIFT));
    sz[i] = nKH[i] ? ns[i] : (isFillN ? ns[i] * NODE_SIZE : ns[i] * NODE_SIZE);
  }
  /* Mid-edge dots on the fabric (not the KH orbit) so links read at a distance. */
  let midI = nN;
  for (let i = 0; i < nE; i++){
    if (eKH[i]) continue;
    const a = ea[i], b = eb[i];
    const isFillE = i >= GX.fillE0 && i < GX.fillE1;
    const k = midI++;
    pos[k * 3] = (nx[a] + nx[b]) * 0.5;
    pos[k * 3 + 1] = (ny[a] + ny[b]) * 0.5;
    pos[k * 3 + 2] = 0;
    col[k * 4] = er[i]; col[k * 4 + 1] = eg[i]; col[k * 4 + 2] = ebl[i];
    col[k * 4 + 3] = isFillE ? 0 : Math.min(0.48, eal[i] * EDGE_LIFT * 0.85);
    sz[k] = 0.24;
  }
  GX.nDraw = midI;
  /* Fill midpoints sit in the same packed arrays; we fade their alpha with dissolve.
     They were appended in edge-index order, so we record them by scanning isn't needed —
     we store target alphas now. */
  const fillMidA = [];
  const fillMidIdx = [];
  /* Re-walk the same loop logic to remember indices: midpoints are packed in non-KH edge order. */
  {
    let mi = nN;
    for (let i = 0; i < nE; i++){
      if (eKH[i]) continue;
      if (i >= GX.fillE0 && i < GX.fillE1){
        fillMidIdx.push(mi);
        fillMidA.push(Math.min(0.48, eal[i] * EDGE_LIFT * 0.85));
      }
      mi++;
    }
  }
  GX.fillMidIdx = new Int32Array(fillMidIdx);
  GX.fillMidA = new Float32Array(fillMidA);

  const lpos = new Float32Array(nE * 6);
  const lcol = new Float32Array(nE * 8);
  const ePackedA = new Float32Array(nE);
  for (let i = 0; i < nE; i++){
    const a = ea[i], b = eb[i];
    lpos[i * 6] = nx[a]; lpos[i * 6 + 1] = ny[a]; lpos[i * 6 + 2] = 0;
    lpos[i * 6 + 3] = nx[b]; lpos[i * 6 + 4] = ny[b]; lpos[i * 6 + 5] = 0;
    const isFillE = i >= GX.fillE0 && i < GX.fillE1;
    const aA = eKH[i] ? eal[i] : (isFillE ? 0 : Math.min(EDGE_CAP, eal[i] * EDGE_LIFT));
    ePackedA[i] = aA;
    lcol[i * 8] = er[i]; lcol[i * 8 + 1] = eg[i]; lcol[i * 8 + 2] = ebl[i]; lcol[i * 8 + 3] = aA;
    lcol[i * 8 + 4] = er[i]; lcol[i * 8 + 5] = eg[i]; lcol[i * 8 + 6] = ebl[i]; lcol[i * 8 + 7] = aA;
  }
  GX.pos = pos; GX.col = col; GX.sz = sz;
  GX.lpos = lpos; GX.lcol = lcol;
  GX.ePackedA = ePackedA;

  /* 18 staggered slots: SHAPE (trace + 1.5s glow) → fade → new shape elsewhere. */
  const fromKH = extracts.filter(e => e.fromKH);
  const rest = extracts.filter(e => !e.fromKH);
  rest.sort((a, b) => Math.atan2(a.cy, a.cx) - Math.atan2(b.cy, b.cx));
  const hop = 0.20;
  const hold = 1.50;
  const fade = 0.80;
  const gap = 0.20;
  const N_SLOTS = 18;
  GX.slots = [];
  for (let s = 0; s < N_SLOTS; s++){
    const playlist = [];
    const nR = Math.max(6, Math.ceil(rest.length / N_SLOTS) + 2);
    for (let r = 0; r < nR; r++){
      if (!rest.length) break;
      const idx = (s + r * N_SLOTS + r * 5) % rest.length;
      let ex = rest[idx];
      if (playlist.length){
        const last = playlist[playlist.length - 1];
        if (Math.hypot(ex.cx - last.cx, ex.cy - last.cy) < 20){
          ex = rest[(idx + 9) % rest.length];
        }
      }
      playlist.push(ex);
    }
    if (s === 0 && fromKH[0]) playlist.unshift(fromKH[0]);
    GX.slots.push({
      playlist,
      hop: hop + (s % 3) * 0.025,
      hold, fade, gap,
      phase: s * 0.40,
    });
  }

  return true;
}

/* ----- extraction + agent state at time t -------------------------------- */
function extractWindow(slot, tSec){
  const { playlist, hop, hold, fade, phase } = slot;
  if (!playlist.length) return null;
  /* each item lasts travel+hold+fade, then a tiny gap */
  let t = tSec + phase;
  if (t < 0) return null;
  const durations = playlist.map(ex => {
    const hops = Math.max(1, ex.path.length-1);
    return hops*hop + hold + fade + (slot.gap != null ? slot.gap : 0.20);
  });
  const cycle = durations.reduce((a,b)=>a+b, 0);
  t = t % cycle;
  let acc = 0, idx = 0;
  for (let i = 0; i < playlist.length; i++){
    if (t < acc + durations[i]){ idx = i; break; }
    acc += durations[i];
    idx = i;
  }
  const ex = playlist[idx];
  const local = t - acc;
  const hops = Math.max(1, ex.path.length-1);
  const travel = hops * hop;
  let u, lit, fading, travelling, agentU, seg;
  if (local < travel){
    travelling = true;
    const tau = local / hop;
    seg = Math.min(hops-1, Math.floor(tau));
    agentU = Math.min(1, tau - seg);
    /* nodes/edges up to current seg are lit, current edge partially */
    lit = (seg + agentU) / hops;
    fading = 0;
    u = local / travel;
  } else if (local < travel + hold){
    travelling = false;
    lit = 1; fading = 0; agentU = 1; seg = hops-1; u = 1;
  } else {
    travelling = false;
    const fd = Math.min(1, (local - travel - hold) / fade);
    lit = 1; fading = fd; agentU = 1; seg = hops-1; u = 1;
  }
  return { ex, lit, fading, travelling, agentU, seg, hops, u, travel };
}

function allActiveExtracts(tSec, pull){
  /* As we zoom, more slots come online. They start from KH and spread. */
  const nOn = pull < 0.14 ? 2 : pull < 0.28 ? 6 : pull < 0.45 ? 11 : pull < 0.65 ? 15 : 18;
  const out = [];
  for (let s = 0; s < nOn && s < GX.slots.length; s++){
    /* slots that aren't the KH-first one wait until the zoom has opened */
    if (s > 1 && pull < 0.18) continue;
    const w = extractWindow(GX.slots[s], tSec);
    if (w && w.fading < 0.98) out.push(w);
  }
  return out;
}

function agentPosOn(ex, seg, u){
  const path = ex.path;
  const a = path[Math.min(seg, path.length-1)];
  const b = path[Math.min(seg+1, path.length-1)];
  return {
    x: GX.nx[a] + (GX.nx[b]-GX.nx[a])*u,
    y: GX.ny[a] + (GX.ny[b]-GX.ny[a])*u,
  };
}

/* ----- KH orbit dissolve (a function of pull, so Back reverses it) ------- */
function khDissolveAmt(p){
  /* Intact through mid-zoom (orbit still readable), then dissolve into fabric. */
  return smootherstep(clamp01((p - 0.48) / 0.42));
}
function applyKHDissolve(p){
  if (!GX.khOx) return 0;
  const d = khDissolveAmt(p);
  if (GX._dAmt != null && Math.abs(GX._dAmt - d) < 0.0005) return d;
  GX._dAmt = d;
  const nKH = GX.nKH;
  /* Orbit: scatter and fade completely to nothing. */
  for (let i = 0; i < nKH; i++){
    const x = GX.khOx[i] * (1 - d) + GX.khTx[i] * d;
    const y = GX.khOy[i] * (1 - d) + GX.khTy[i] * d;
    const s = GX.khOs[i] * (1 - d);
    const a = GX.khOa[i] * (1 - d) * (1 - d);
    GX.nx[i] = x; GX.ny[i] = y; GX.ns[i] = s; GX.na[i] = a;
    GX.pos[i * 3] = x; GX.pos[i * 3 + 1] = y;
    GX.sz[i] = s;
    GX.col[i * 4 + 3] = a;
  }
  /* KH edges fade out; endpoints follow the scattering nodes. */
  for (let i = 0; i < GX.nE; i++){
    if (!GX.eIsKH[i]) continue;
    const a = GX.ea[i], b = GX.eb[i];
    GX.lpos[i * 6] = GX.nx[a]; GX.lpos[i * 6 + 1] = GX.ny[a];
    GX.lpos[i * 6 + 3] = GX.nx[b]; GX.lpos[i * 6 + 4] = GX.ny[b];
    const al = GX.ePackedA[i] * (1 - d) * (1 - d);
    GX.lcol[i * 8 + 3] = al; GX.lcol[i * 8 + 7] = al;
  }
  /* Fill-in fabric fades in to take the orbit's place. */
  if (GX.fillN1 > GX.fillN0){
    for (let i = GX.fillN0; i < GX.fillN1; i++){
      const k = i - GX.fillN0;
      GX.sz[i] = GX.fillNodeS[k];
      GX.col[i * 4 + 3] = GX.fillNodeA[k] * d;
    }
  }
  if (GX.fillE1 > GX.fillE0){
    for (let i = GX.fillE0; i < GX.fillE1; i++){
      const al = GX.fillEdgeA[i - GX.fillE0] * d;
      GX.lcol[i * 8 + 3] = al; GX.lcol[i * 8 + 7] = al;
    }
  }
  if (GX.fillMidIdx && GX.fillMidIdx.length){
    for (let i = 0; i < GX.fillMidIdx.length; i++){
      GX.col[GX.fillMidIdx[i] * 4 + 3] = GX.fillMidA[i] * d;
    }
  }
  if (gl && GX.bPos){
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, GX.pos.subarray(0, nKH * 3));
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bSz);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, GX.sz);
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bCol);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, GX.col);
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLpos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, GX.lpos);
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLcol);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, GX.lcol);
  }
  return d;
}

/* ----- WebGL ------------------------------------------------------------ */

const GX_VS = `
attribute vec3 a_pos;
attribute vec4 a_col;
attribute float a_size;
uniform mat4 u_vp;
uniform float u_px;
uniform float u_dpr;
varying vec4 v_col;
varying float v_soft;
void main(){
  gl_Position = u_vp * vec4(a_pos, 1.0);
  float ps = a_size * u_px * 2.0;
  gl_PointSize = clamp(ps, 1.65 * u_dpr, 140.0 * u_dpr);
  v_col = a_col;
  v_soft = a_size > 1.4 ? 2.2 : 3.6;
}
`;
const GX_FS = `
precision mediump float;
varying vec4 v_col;
varying float v_soft;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p,p);
  if (r2 > 1.0) discard;
  float g = exp(-r2 * v_soft);
  float core = exp(-r2 * (v_soft * 3.6));
  vec3 rgb = v_col.rgb * (0.65*g + 0.9*core);
  float a = v_col.a * g;
  gl_FragColor = vec4(rgb * a, a);
}
`;
const GX_LVS = `
attribute vec3 a_pos;
attribute vec4 a_col;
uniform mat4 u_vp;
varying vec4 v_col;
void main(){
  gl_Position = u_vp * vec4(a_pos, 1.0);
  v_col = a_col;
}
`;
const GX_LFS = `
precision mediump float;
varying vec4 v_col;
void main(){
  gl_FragColor = vec4(v_col.rgb * v_col.a, v_col.a);
}
`;

function gxCompile(src, type){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    console.error("shader", gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}
function gxProg(vs, fs){
  const p = gl.createProgram();
  gl.attachShader(p, gxCompile(vs, gl.VERTEX_SHADER));
  gl.attachShader(p, gxCompile(fs, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
    console.error("program", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}
function gxBuf(data, dynamic){
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  return b;
}

function initGalaxyGL(){
  if (galaxyReady && gl && !gl.isContextLost()) { resizeGalaxy(); return true; }
  if (!gx) return false;
  try {
    gl = gx.getContext("webgl", {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, powerPreference: "high-performance",
    }) || gx.getContext("experimental-webgl", {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false,
    });
  } catch (e){ gl = null; }
  if (!gl){ console.warn("WebGL unavailable"); return false; }
  const pts = gxProg(GX_VS, GX_FS);
  const lns = gxProg(GX_LVS, GX_LFS);
  if (!pts || !lns) return false;
  GX.prog = pts;
  GX.lprog = lns;
  GX.u = {
    vp: gl.getUniformLocation(pts, "u_vp"),
    px: gl.getUniformLocation(pts, "u_px"),
    dpr: gl.getUniformLocation(pts, "u_dpr"),
  };
  GX.lu = { vp: gl.getUniformLocation(lns, "u_vp") };
  GX.loc = {
    pos: gl.getAttribLocation(pts, "a_pos"),
    col: gl.getAttribLocation(pts, "a_col"),
    size: gl.getAttribLocation(pts, "a_size"),
  };
  GX.lloc = {
    pos: gl.getAttribLocation(lns, "a_pos"),
    col: gl.getAttribLocation(lns, "a_col"),
  };
  GX.bPos = gxBuf(GX.pos, true);
  GX.bCol = gxBuf(GX.col, true);
  GX.bSz  = gxBuf(GX.sz, true);
  GX.bLpos = gxBuf(GX.lpos, true);
  GX.bLcol = gxBuf(GX.lcol, true);

  /* dynamic: lit nodes, lit-edge points, agents */
  GX.litMax = 12000;
  GX.litPos = new Float32Array(GX.litMax*3);
  GX.litCol = new Float32Array(GX.litMax*4);
  GX.litSz  = new Float32Array(GX.litMax);
  GX.bLitPos = gxBuf(GX.litPos, true);
  GX.bLitCol = gxBuf(GX.litCol, true);
  GX.bLitSz  = gxBuf(GX.litSz, true);

  GX.leMax = 16000;
  GX.lePos = new Float32Array(GX.leMax*6);
  GX.leCol = new Float32Array(GX.leMax*8);
  GX.bLePos = gxBuf(GX.lePos, true);
  GX.bLeCol = gxBuf(GX.leCol, true);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,0);
  galaxyReady = true;
  resizeGalaxy();
  return true;
}

function resizeGalaxy(){
  if (!gx) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  gx.width = Math.round((W||innerWidth) * dpr);
  gx.height = Math.round((H||innerHeight) * dpr);
  gx.style.width = (W||innerWidth)+"px";
  gx.style.height = (H||innerHeight)+"px";
  if (gl) gl.viewport(0, 0, gx.width, gx.height);
}

function setGalaxyPull(to, dur){
  GX.pullFrom = galaxyPull();
  GX.pullTo = to;
  GX.pullStart = now || performance.now();
  GX.pullDur = Math.max(0, dur || 0);
  if (dur <= 0) GX.pullCur = to;
}
function galaxyPull(){
  if (galaxyFrozen) return galaxyFrozen.pull;
  if (!GX.pullDur) return GX.pullTo;
  const t = clamp01(((now||performance.now()) - GX.pullStart) / GX.pullDur);
  const e = t*t*t*(t*(t*6-15)+10);
  GX.pullCur = GX.pullFrom + (GX.pullTo - GX.pullFrom) * e;
  return GX.pullCur;
}
function galaxyAge(){
  if (galaxyFrozen) return galaxyFrozen.age;
  if (!conclusionBorn) return 0;
  return Math.max(0, ((now||performance.now()) - conclusionBorn) / 1000);
}
function galaxyAgentTime(){
  if (galaxyFrozen) return galaxyFrozen.agentTime;
  return Math.max(0, galaxyAge() - 0.55);
}
function galaxyAppear(){
  if (galaxyFrozen) return 1;
  if (stop==="5" && (!trans || trans.t>=1)) return 1;
  if (trans && trans.to==="5") return easeOutCubic(Math.max(0, (trans.t - 0.08) / 0.35));
  if (trans && trans.from==="5"){
    const p = galaxyPull();
    return clamp01(p / 0.12);
  }
  return 0;
}
function conclusionLineT(i){
  const age = galaxyAge();
  const start = [0.45, 2.20, 4.40][i];
  return easeOutCubic(clamp01((age - start) / 0.7));
}

/* Orthographic zoom: starts on the patient graph, eases out, then STOPS. */
function viewHalf(p){
  const close = 13.2, mid = 52, far = 128;
  if (p < 0.46) return close + (mid-close) * smootherstep(p/0.46);
  return mid + (far-mid) * smootherstep((p-0.46)/0.54);
}
function galaxyVP(p){
  const halfH = viewHalf(p);
  const aspect = (W||1440) / (H||900);
  const halfW = halfH * aspect;
  /* Keep the patient graph a little below centre so the headline stays clear.
     As we zoom, shift slightly so more of the large graph fills the right/bottom. */
  const cx = lerp(0, 22, p);
  const cy = lerp(1.2, 22, p);
  const vp = mat4Ortho(cx-halfW, cx+halfW, cy-halfH, cy+halfH, -8, 8);
  return { vp, cx, cy, halfH, halfW };
}

function buildLit(actives, tSec, pull){
  let np = 0, nl = 0;
  const P = GX.litPos, C = GX.litCol, S = GX.litSz;
  const LP = GX.lePos, LC = GX.leCol;
  for (const w of actives){
    const ex = w.ex;
    const bright = (1 - w.fading) * (0.72 + 0.28 * Math.min(1, w.lit*1.15));
    if (bright < 0.04) continue;
    const col = ex.color;
    const nShow = Math.max(1, Math.ceil(ex.path.length * Math.min(1, w.lit) + 0.001));
    const shown = new Set(ex.path.slice(0, Math.min(nShow+1, ex.path.length)));
    /* For hold/fade, light the whole shape (all nodes + edges), not just the path prefix. */
    const full = w.lit >= 0.97 || !w.travelling;
    const nodeSet = full ? ex.nodes : ex.path.slice(0, Math.min(nShow+1, ex.path.length));
    for (const id of nodeSet){
      if (np >= GX.litMax) break;
      const i = np++;
      P[i*3]=GX.nx[id]; P[i*3+1]=GX.ny[id]; P[i*3+2]=0;
      C[i*4]=col[0]; C[i*4+1]=col[1]; C[i*4+2]=col[2]; C[i*4+3]=bright;
      S[i] = GX.ns[id] * (full ? 2.85 : 2.25);
    }
    const edges = ex.edges || [];
    const nEshow = full ? edges.length : Math.min(edges.length, Math.max(0, nShow-1));
    for (let e = 0; e < nEshow && nl < GX.leMax; e++){
      const ei = edges[e];
      if (ei < 0) continue;
      const a = GX.ea[ei], b = GX.eb[ei];
      /* skip if we haven't reached this edge yet during travel */
      if (!full && !(shown.has(a) && shown.has(b))) continue;
      const i = nl++;
      LP[i*6]=GX.nx[a]; LP[i*6+1]=GX.ny[a]; LP[i*6+2]=0;
      LP[i*6+3]=GX.nx[b]; LP[i*6+4]=GX.ny[b]; LP[i*6+5]=0;
      const al = bright * 1.0;
      LC[i*8]=col[0]; LC[i*8+1]=col[1]; LC[i*8+2]=col[2]; LC[i*8+3]=al;
      LC[i*8+4]=col[0]; LC[i*8+5]=col[1]; LC[i*8+6]=col[2]; LC[i*8+7]=al;
      /* extra mid-points so the lit edge reads thicker / glowing */
      if (np < GX.litMax-3){
        for (let s = 1; s <= 3; s++){
          const t = s/4;
          const i2 = np++;
          P[i2*3]=GX.nx[a]+(GX.nx[b]-GX.nx[a])*t;
          P[i2*3+1]=GX.ny[a]+(GX.ny[b]-GX.ny[a])*t;
          P[i2*3+2]=0;
          C[i2*4]=col[0]; C[i2*4+1]=col[1]; C[i2*4+2]=col[2]; C[i2*4+3]=al*0.85;
          S[i2] = 0.85;
        }
      }
    }
    /* Agent pulse + short trail, only while travelling (and briefly at arrival). */
    if (w.travelling || (w.lit>=1 && w.fading===0 && w.u===1)){
      const trailN = 10;
      const hops = w.hops;
      for (let k = trailN; k >= 0 && np < GX.litMax; k--){
        const back = k / trailN * 0.72; /* seconds-ish in hop units */
        let tau = (w.seg + w.agentU) - back / (0.28) * 0.28;
        if (tau < 0) continue;
        const sg = Math.min(hops-1, Math.floor(tau));
        const uu = tau - sg;
        const p = agentPosOn(ex, sg, uu);
        const fade = 1 - k/trailN;
        const i = np++;
        P[i*3]=p.x; P[i*3+1]=p.y; P[i*3+2]=0;
        C[i*4]=col[0]; C[i*4+1]=col[1]; C[i*4+2]=col[2]; C[i*4+3]=(k===0?1:0.55*fade*fade)*Math.max(bright,0.7);
        S[i] = k===0 ? 3.1 : 1.15*fade + 0.45;
      }
    }
  }
  /* Roaming pulses across the whole graph — short trails, real edges. */
  const roam = GX.roamers || [];
  let nRoamDrawn = 0;
  for (let ri = 0; ri < roam.length; ri++){
    const ag = roam[ri];
    const hops = ag.path.length - 1;
    if (hops < 1) continue;
    const cycle = hops * ag.hop;
    let tau = (tSec == null ? 0 : tSec) + ag.phase;
    if (tau < 0) continue;
    tau = tau % cycle;
    const head = tau / ag.hop;
    const colr = ag.color;
    if (nl < GX.leMax){
      const seg = Math.min(hops - 1, Math.floor(head));
      const a = ag.path[seg], b = ag.path[seg + 1];
      const i = nl++;
      LP[i * 6] = GX.nx[a]; LP[i * 6 + 1] = GX.ny[a]; LP[i * 6 + 2] = 0;
      LP[i * 6 + 3] = GX.nx[b]; LP[i * 6 + 4] = GX.ny[b]; LP[i * 6 + 5] = 0;
      const al = 0.70;
      LC[i * 8] = colr[0]; LC[i * 8 + 1] = colr[1]; LC[i * 8 + 2] = colr[2]; LC[i * 8 + 3] = al;
      LC[i * 8 + 4] = colr[0]; LC[i * 8 + 5] = colr[1]; LC[i * 8 + 6] = colr[2]; LC[i * 8 + 7] = al;
    }
    const trailN = 8;
    for (let k = trailN; k >= 0 && np < GX.litMax; k--){
      const tHop = head - k * 0.11;
      if (tHop < 0) continue;
      const sg = Math.min(hops - 1, Math.floor(tHop));
      const uu = tHop - sg;
      const a = ag.path[sg], b = ag.path[Math.min(sg + 1, ag.path.length - 1)];
      const x = GX.nx[a] + (GX.nx[b] - GX.nx[a]) * uu;
      const y = GX.ny[a] + (GX.ny[b] - GX.ny[a]) * uu;
      const fade = 1 - k / trailN;
      const i = np++;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = 0;
      C[i * 4] = colr[0]; C[i * 4 + 1] = colr[1]; C[i * 4 + 2] = colr[2];
      C[i * 4 + 3] = (k === 0 ? 0.98 : 0.50 * fade * fade);
      S[i] = k === 0 ? 2.15 : 0.95 * fade + 0.35;
    }
    nRoamDrawn++;
  }
  GX.nRoamDrawn = nRoamDrawn;

  GX.nLit = np;
  GX.nLe = nl;
  if (!gl) return;
  if (np){
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLitPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, P.subarray(0, np*3));
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLitCol); gl.bufferSubData(gl.ARRAY_BUFFER, 0, C.subarray(0, np*4));
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLitSz);  gl.bufferSubData(gl.ARRAY_BUFFER, 0, S.subarray(0, np));
  }
  if (nl){
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLePos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, LP.subarray(0, nl*6));
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLeCol); gl.bufferSubData(gl.ARRAY_BUFFER, 0, LC.subarray(0, nl*8));
  }
}

function bindPts(loc, bPos, bCol, bSz){
  gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
  gl.enableVertexAttribArray(loc.pos);
  gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bCol);
  gl.enableVertexAttribArray(loc.col);
  gl.vertexAttribPointer(loc.col, 4, gl.FLOAT, false, 0, 0);
  if (loc.size >= 0 && bSz){
    gl.bindBuffer(gl.ARRAY_BUFFER, bSz);
    gl.enableVertexAttribArray(loc.size);
    gl.vertexAttribPointer(loc.size, 1, gl.FLOAT, false, 0, 0);
  }
}

function drawGalaxy(){
  const showing = !!galaxyFrozen || stop === "5" || (trans && (trans.to === "5" || trans.from === "5"));
  const appear = showing ? galaxyAppear() : 0;
  if (gx) gx.style.opacity = String(appear);
  if (!showing){
    const idle = document.getElementById("concl-honest");
    if (idle && idle.style.opacity !== "0") idle.style.opacity = "0";
    return;
  }
  if (appear >= 0.01 && (!galaxyReady || !gl || gl.isContextLost())) ensureGalaxy();
  const honest = document.getElementById("concl-honest");
  const notesOnNow = typeof notesOn !== "undefined" && notesOn;
  if (honest){
    const age = galaxyAge();
    const p = galaxyPull();
    honest.style.opacity = notesOnNow ? 0 : easeOutCubic(clamp01((age-1.6)/0.6)) * (p>0.18?1:clamp01(p/0.18));
  }
  if (!galaxyReady || !gl || appear < 0.01) return;

  const p = galaxyPull();
  const cam = galaxyVP(p);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const px = ((H||900) / 2) / cam.halfH * dpr;
  applyKHDissolve(p);
  const actives = allActiveExtracts(galaxyAgentTime(), p);
  buildLit(actives, galaxyAgentTime(), p);

  gl.viewport(0, 0, gx.width, gx.height);
  gl.clear(gl.COLOR_BUFFER_BIT);

  /* Base edges (dim, the fabric). */
  gl.useProgram(GX.lprog);
  gl.uniformMatrix4fv(GX.lu.vp, false, cam.vp);
  gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLpos);
  gl.enableVertexAttribArray(GX.lloc.pos);
  gl.vertexAttribPointer(GX.lloc.pos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLcol);
  gl.enableVertexAttribArray(GX.lloc.col);
  gl.vertexAttribPointer(GX.lloc.col, 4, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, GX.nE * 2);

  /* Base nodes. */
  gl.useProgram(GX.prog);
  gl.uniformMatrix4fv(GX.u.vp, false, cam.vp);
  gl.uniform1f(GX.u.px, px);
  gl.uniform1f(GX.u.dpr, dpr);
  bindPts(GX.loc, GX.bPos, GX.bCol, GX.bSz);
  gl.drawArrays(gl.POINTS, 0, GX.nDraw || GX.nN);

  /* Lit extracted edges (brighter). */
  if (GX.nLe > 0){
    gl.useProgram(GX.lprog);
    gl.uniformMatrix4fv(GX.lu.vp, false, cam.vp);
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLePos);
    gl.enableVertexAttribArray(GX.lloc.pos);
    gl.vertexAttribPointer(GX.lloc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, GX.bLeCol);
    gl.enableVertexAttribArray(GX.lloc.col);
    gl.vertexAttribPointer(GX.lloc.col, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, GX.nLe * 2);
  }

  /* Lit nodes + agent pulses. */
  if (GX.nLit > 0){
    gl.useProgram(GX.prog);
    gl.uniformMatrix4fv(GX.u.vp, false, cam.vp);
    gl.uniform1f(GX.u.px, px);
    gl.uniform1f(GX.u.dpr, dpr);
    bindPts(GX.loc, GX.bLitPos, GX.bLitCol, GX.bLitSz);
    gl.drawArrays(gl.POINTS, 0, GX.nLit);
  }
}


function ensureGalaxyCPU(){
  if (GX.built) return true;
  const t0 = performance.now();
  buildGalaxyCPU();
  GX.built = true;
  console.info("galaxy", GX.nN, "nodes", GX.nE, "edges", Math.round(performance.now() - t0) + "ms");
  return true;
}
function ensureGalaxy(){
  try {
    ensureGalaxyCPU();
    if (!galaxyReady || !gl || gl.isContextLost()) initGalaxyGL();
  } catch (err) {
    console.error("galaxy", err);
    return false;
  }
  return !!galaxyReady;
}
function scheduleGalaxy(){
  if (GX.built) return;
  const run = () => { if (!GX.built) ensureGalaxyCPU(); };
  /* Build after the overview entrance so the first stops keep their frame time. */
  setTimeout(() => {
    if (GX.built) return;
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 2000 });
    else run();
  }, reduceMotion() ? 0 : 1800);
}
function teardownGalaxy(){
  if (gl){
    const bufs = [GX.bPos, GX.bCol, GX.bSz, GX.bLpos, GX.bLcol, GX.bLitPos, GX.bLitCol, GX.bLitSz, GX.bLePos, GX.bLeCol];
    for (const b of bufs) if (b) gl.deleteBuffer(b);
    if (GX.prog) gl.deleteProgram(GX.prog);
    if (GX.lprog) gl.deleteProgram(GX.lprog);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }
  gl = null;
  galaxyReady = false;
  GX.prog = null;
  GX.lprog = null;
  GX.bPos = GX.bCol = GX.bSz = GX.bLpos = GX.bLcol = null;
  GX.bLitPos = GX.bLitCol = GX.bLitSz = GX.bLePos = GX.bLeCol = null;
  GX._dAmt = null;
  if (gx && gx.parentNode){
    gx.style.opacity = "0";
    const next = document.createElement("canvas");
    next.id = "gx";
    gx.replaceWith(next);
    gx = next;
  }
}

function graphDim(){
  const p = galaxyPull();
  const ap = galaxyAppear();
  if (ap < 0.02 && p < 0.02) return 1;
  /* Cross-fade the 2D patient graph into the WebGL cluster. */
  return clamp01(1 - Math.max(ap, p / 0.16) * 1.15);
}

/* -------------------------------------------------------------------------- */
/*  Tour chrome                                                               */
/* -------------------------------------------------------------------------- */
const STEP_INDEX = { "0":0, "1":1, "1b":2, "2":3, "4":4, "5":5 };
const ORDER = ["0","1","1b","2","4","5"];
const NEXT_LABEL = { "0":"Next →", "1":"See one day →", "1b":"Next →", "2":"Next →", "4":"Next →", "5":"Back to start" };

function applyChrome(chromeT){
  const s = stop;
  const hl = document.getElementById("headline");
  const tour = document.getElementById("tour");
  const back = document.getElementById("back");
  const next = document.getElementById("next");

  hl.classList.toggle("is-off", s !== "0");

  document.getElementById("proof-low").textContent = `${STATS.lowOver} of ${STATS.lowN}`;
  document.getElementById("proof-mid").textContent = `${STATS.midOver} of ${STATS.midN}`;
  updateNotes();
  if (typeof updateStageChrome === "function") updateStageChrome();

  tour.style.display = "flex";
  const idx = STEP_INDEX[s] + 1;
  document.getElementById("step-label").textContent = `${idx} of ${ORDER.length}`;
  document.getElementById("dots").innerHTML = ORDER.map((id, i) =>
    `<button type="button" data-dot="${i}" class="${i===idx-1?"on":""}" aria-label="Go to ${i+1} of ${ORDER.length}"></button>`
  ).join("");
  document.getElementById("dots").querySelectorAll("button").forEach(b => {
    b.onclick = () => go(ORDER[+b.dataset.dot]);
  });
  back.hidden = s==="0";
  next.disabled = false;
  next.textContent = NEXT_LABEL[s] || "Next →";
}

function go(s, opts={}){
  if (s === stop && !opts.force && (!trans || trans.t>=1)) return;
  hideTip();
  startTransition(s, opts);
}

document.getElementById("next").onclick = () => {
  if (stop === "5") return go("0");
  const i = ORDER.indexOf(stop);
  go(ORDER[Math.min(ORDER.length-1, i+1)]);
};
document.getElementById("back").onclick = () => {
  const i = ORDER.indexOf(stop);
  go(ORDER[Math.max(0, i-1)]);
};

addEventListener("keydown", e => {
  if (e.key === "n" || e.key === "N"){ toggleNotes(); return; }
  if (e.key === "ArrowRight" || e.key === "Enter") document.getElementById("next").click();
  if (e.key === "ArrowLeft" || e.key === "Escape") document.getElementById("back").click();
});

/* -------------------------------------------------------------------------- */
/*  Presenter notes (N to toggle)                                             */
/* -------------------------------------------------------------------------- */
let notesOn = false;
function notesText(s){
  /* Wording is what Hassan will say. Every figure is computed from the data.
     The streaks line says "the day after each streak ended" — the last low-step
     day of a streak is still high; it is the following (active) day that
     returns to range (six 3+ streaks, next-day averages all under 180). */
  if (s === "0"){
    return `One patient, ${days.length} days, as one connected model. ${NODE_COUNT.toLocaleString("en-US")} data points, ${EDGE_COUNT.toLocaleString("en-US")} connections. Every day links to its activity and its glucose readings.`;
  }
  if (s === "1"){
    return `Pull out every day under 5,000 steps and every day 5,000–10,000, then compare. ${Math.round(STATS.lowAvg)} vs ${Math.round(STATS.midAvg)} mg/dL. ${STATS.lowOver} of ${STATS.lowN} inactive days went over 180, none of the active days did. This is the evidence behind the STRONG steps badge.`;
  }
  if (s === "1b"){
    const when = `${new Date(nov.date+"T00:00:00").getDate()} ${MONTHS[new Date(nov.date+"T00:00:00").getMonth()]}`;
    return `Trace it down to one day. ${when}: ${fmt(nov.steps)} steps, ${fmt(nov.sed)} min sitting, all three readings high. Every claim goes down to raw data.`;
  }
  if (s === "2"){
    const pos = STREAKS.pos.map(v => fmt1(v)).join(", ");
    return `The longest run of inactive days was ${FOCUS.n} days, ${FOCUS.when}. Each bad day stood alone, and glucose recovered the next day. ${FOCUS.afterWhen} was back in range, ${fmt1(FOCUS.afterAvg)} against ${fmt1(FOCUS.streakAvg)} through the streak. Across all ${STREAKS.n} streaks of three or more, the day after was in range every time, ${fmt1(STREAKS.afterAvg)} on average. No build-up by position: ${pos}. Same day is strong, ${Math.round(STATS.lowAvg)} versus ${Math.round(STATS.midAvg)}; the next day has no link, ${fmt1(LAG.nextFastLow)} versus ${fmt1(LAG.nextFastMid)}, r ${fmtR(LAG.nextRfast)}. The glucose is synthetic and planted per day, so no carry-over is expected.`;
  }
  if (s === "4"){
    return `What if we add sleep, or meals, or medication? Each new measure is one more ring, ${days.length} more nodes. The sleep ring here is example data, not recorded.`;
  }
  if (s === "5"){
    return `A handful of graph queries turned one patient's raw data into explainable findings, down to a single reading. The data is organised as connections, so “what came before this spike?” is a walk along links, not a rebuild. At scale, agents can traverse the same structure across thousands of patients and more measures — the large graph you see is an illustration of that idea, not real patient data — and every answer carries its path, so clinicians can check it. Glucose in this demo is synthetic, so no clinical claims. Next: real CGM data, more patients, and agent-driven questions.`;
  }
  return "";
}
function updateNotes(){
  const el = document.getElementById("notes");
  const body = document.getElementById("notes-body");
  body.textContent = notesText(stop);
  el.classList.toggle("is-on", notesOn);
  el.classList.toggle("is-narrow", stop === "1b");
  el.setAttribute("aria-hidden", notesOn ? "false" : "true");
}
function toggleNotes(force){
  notesOn = force == null ? !notesOn : !!force;
  updateNotes();
}

/* -------------------------------------------------------------------------- */
/*  Boot                                                                      */
/* -------------------------------------------------------------------------- */
function startEntrance(skip){
  if (skip){ entrance = 1; return; }
  entrance = 0; enterStart = performance.now();
  try { cueEntrance(); } catch (e) {}
}

function boot(){
  const q = new URLSearchParams(location.search);
  if (q.get("reduced") === "1" || q.get("motion") === "0") document.body.classList.add("is-reduced");
  if (q.get("notes") === "1") notesOn = true;
  document.getElementById("h1").textContent = `${days.length} days of one patient, as one connected model`;
  document.getElementById("counts").textContent =
    `${NODE_COUNT.toLocaleString("en-US")} data points  ·  ${EDGE_COUNT.toLocaleString("en-US")} connections`;

  resize();
  const shot = q.get("shot") || "";
  const at = q.get("at") != null ? parseFloat(q.get("at")) : null;
  const from = q.get("from");

  const shotMap = {
    "stop0":"0", "v2-stop0":"0", "0":"0",
    "stop1":"1", "v2-split":"1", "split":"1", "1":"1",
    "stop1-day":"1b", "v2-day":"1b", "day":"1b", "1b":"1b",
    "stop2":"2", "v2-stop2":"2", "v4-streaks":"2", "streaks":"2",
    "v5-tomorrow":"2", "tomorrow":"2", "2":"2",
    "stop4":"4", "v4-extend":"4", "extend":"4", "4":"4",
    "stop5":"5", "v6-conclusion":"5", "conclusion":"5", "5":"5",
    "v7-scale-a":"5", "scale-a":"5", "v7-scale-b":"5", "scale-b":"5",
    "v8-scale-a":"5", "v8-scale-b":"5",
    "v9-scale-a":"5", "v9-scale-b":"5",
    "trans-split":"1", "v2-trans-split":"1", "v2-trans-split-a":"1", "v2-trans-split-b":"1",
    "trans-day":"1b", "v2-trans-day":"1b",
  };
  const startStop = shotMap[shot] || (shot.includes("trans") ? "1" : "0");
  const isTransShot = shot.includes("trans") || at != null;
  const skip = reduceMotion() || (!!shot && !isTransShot);

  if (isTransShot){
    const src = from || (startStop==="1b" ? "1" : startStop==="1" ? "0" : "0");
    entrance = 1;
    stop = src;
    Object.assign(cam, targetCam(src));
    camT = 1; camFrom = { ...cam }; camTo = { ...cam };
    applyChrome(src==="1"?1:0);
    const tFreeze = Number.isFinite(at) ? at : 0.45;
    startTransition(startStop, { instant:false, dur: 1000 });
    frozen = true;
    frozenNow = (trans ? trans.start : performance.now()) + tFreeze * (trans ? trans.dur : 1000);
    if (trans){
      trans.t = tFreeze;
      camT = tFreeze;
      camStart = frozenNow - tFreeze * camDur;
    }
    now = frozenNow;
    requestAnimationFrame(() => { draw(); });
    return;
  }

  startEntrance(skip);
  stop = startStop;
  if (stop === "5"){
    ensureGalaxy();
    conclusionBorn = performance.now() - 8000;
    const isA = shot === "v9-scale-a" || shot === "v8-scale-a" || shot === "v7-scale-a" || shot === "scale-a";
    galaxyFrozen = isA
      ? { pull: 0.42, agentTime: 2.4, age: 2.90 }
      : { pull: 1, agentTime: 18.5, age: 19.30, snapshot: true };
    setGalaxyPull(isA ? 0.42 : 1, 0);
  } else {
    scheduleGalaxy();
  }
  Object.assign(cam, targetCam(stop));
  camT = 1; camTo = { ...cam }; camFrom = { ...cam };
  applyChrome(1);
  requestAnimationFrame(loop);
}

addEventListener("resize", () => {
  resize();
  if (camT >= 1 && !dragging && !trans) Object.assign(cam, targetCam(stop));
});

function useFindings(report) {
  if (!report) return;
  if (report.low) {
    STATS.lowN = report.low.count;
    STATS.lowAvg = report.low.average;
    STATS.lowOver = report.low.over180;
  }
  if (report.middle) {
    STATS.midN = report.middle.count;
    STATS.midAvg = report.middle.average;
    STATS.midOver = report.middle.over180;
  }
  const streaks = report.streaks;
  if (streaks) {
    STREAKS.n = streaks.count;
    STREAKS.longest = streaks.longest;
    STREAKS.afterAvg = streaks.afterAverage;
    STREAKS.afterAllInRange = streaks.afterAllInRange;
    if (Array.isArray(streaks.positionAverages) && streaks.positionAverages.length) {
      STREAKS.pos = streaks.positionAverages;
    }
    FOCUS.n = streaks.longest;
    FOCUS.when = streaks.longestWhen || FOCUS.when;
    FOCUS.streakAvg = streaks.longestAverage || FOCUS.streakAvg;
    FOCUS.afterAvg = streaks.afterAverage || FOCUS.afterAvg;
    FOCUS.afterInRange = streaks.afterAllInRange;
  }
  const correlation = report.correlation;
  if (correlation) {
    LAG.sameR = correlation.sameDay;
    LAG.nextRavg = correlation.nextDay;
    LAG.nextRfast = correlation.nextDayFasting;
    LAG.sameStrength = strengthOf(correlation.sameDay);
    LAG.nextStrength = strengthOf(correlation.nextDayFasting);
  }
  if (report.nextFasting) {
    LAG.nextFastLow = report.nextFasting.afterLow;
    LAG.nextFastMid = report.nextFasting.afterMiddle;
  }
}


(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { useFindings(FINDINGS); boot(); });

})();
