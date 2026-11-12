// Guided tour for /graph/advanced/. Numbers come from /graph/data findings.
// The picture is built from that same response.

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
  };
  return map[key] ?? 1400;
}

function delayFor(n, from, to){
  const ang = (n.t != null ? n.t / TAU : (n.day && n.day.i != null ? n.day.i / days.length : 0.2));
  const role = n.day ? roleOf(n.day) : null;
  const goingSplit = (from==="0" || from==="2" || from==="4") && to==="1";
  const leavingSplit = from==="1" && to==="0";
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
  if (instant){
    trans = null;
    applyChrome(1);
    animateCam(targetCam(to), 0);
    return;
  }
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
  setStage("stage-tomorrow", t2);
  setStage("stage-extend", t4);

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
      trans = null;
      applyChrome(1);
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
    const a = edgeAlpha(e, pa, pb) * Math.min(1, ent * 1.4);
    if (a < 0.01) continue;
    const width = e.type==="GENERATES" ? Math.max(0.45, 0.45*cam.k) : Math.max(1.1, 1.5*cam.k);
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
  for (const n of sorted){
    drawNode(n, visOf(n), ent);
  }

  drawChainLabels(chainChromeAppear());
  drawStrandLabels();
  /* Sleep tag is HTML, inside #stage-extend. */
  ctx.globalAlpha = 1;
  updateSplitChrome();
  updateStageChrome();
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
/*  Tour chrome                                                               */
/* -------------------------------------------------------------------------- */
const STEP_INDEX = { "0":0, "1":1, "1b":2, "2":3, "4":4 };
const ORDER = ["0","1","1b","2","4"];
const NEXT_LABEL = { "0":"Next →", "1":"See one day →", "1b":"Next →", "2":"Next →", "4":"Back to start" };

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
  if (stop === "4") { go("0"); return; }
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
