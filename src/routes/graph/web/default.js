// Default /graph view. Correlations and glucose bands come from analysis.mjs.
// The picture — labels, colours, day panel — follows the approved design.

import { bandOf, prepare } from "./analysis.mjs";
import { bindAudio, cueEmpty, cueIntro } from "./sound.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const C = { in: "#D8FF3C", high: "#FF4D3A", low: "#FFB020", text: "#F6F4F0", second: "#E2E2E2", ink: "#0A0A0A" };
const SVG_NS = "http://www.w3.org/2000/svg";

// Entrance stays inside 1.2–1.8s. Dots use most of that window; the last one
// finishes around 1.55s. Reduced motion skips every play() call.
const INTRO = {
  centreDelay: 120,
  centreDuration: 520,
  lineDelay: 260,
  lineStagger: 45,
  lineDuration: 480,
  varDelay: 480,
  varStagger: 100,
  varDuration: 400,
  dotDelay: 200,
  dotWindow: 1080,
  dotDuration: 260,
  labelDelay: 360,
  labelDuration: 420,
  ringDelay: 80,
  ringDuration: 400,
};

const SLOTS = [
  { key: "fasting", name: "Fasting", time: "05:30" },
  { key: "lunch", name: "After lunch", time: "13:30" },
  { key: "dinner", name: "After dinner", time: "19:30" },
];

// Icons are hand-drawn stand-ins for the SF Symbols in the iPhone app.
const ICONS = {
  walk: `<circle cx="13" cy="3.8" r="2.8" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 7.6 11 14"/><path d="M12.4 8.6 8.8 11.6"/><path d="M12.4 8.6 15.3 11.4"/><path d="M11 14 8.3 21"/><path d="M11 14l3 3.2.9 3.8"/></g>`,
  run: `<circle cx="15.2" cy="3.8" r="2.8" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"><path d="M13.8 7.6 11.2 13.4"/><path d="M13.4 8.4 9.4 9.2 7.4 12"/><path d="M13.4 8.4l2.6 3 2.8-.6"/><path d="M11.2 13.4 7.2 15.6 4.4 15"/><path d="M11.2 13.4l3.2 3.4-1 4.6"/></g>`,
  flame: `<path fill="currentColor" d="M12.3 1.8c.6 3.6 5.7 6.2 5.7 12.2a6 6 0 0 1-12 0c0-3 1.6-4.8 2.7-6.1.2 2 1.1 3.2 2.3 3.8-.2-3.6.3-6.9 1.3-9.9z"/>`,
  chair: `<g fill="currentColor"><rect x="4.4" y="1.6" width="4.2" height="13.4" rx="1.8"/><rect x="4.4" y="10.8" width="15.2" height="4.6" rx="1.8"/><rect x="4.4" y="13" width="3.6" height="9.4" rx="1.5"/><rect x="16" y="13" width="3.6" height="9.4" rx="1.5"/></g>`,
  heart: `<path fill="currentColor" d="M12 21.2s-7.6-4.7-9.7-9.6C.8 8.1 3 3.8 7 3.8c2.2 0 3.7 1.2 5 3 1.3-1.8 2.8-3 5-3 4 0 6.2 4.3 4.7 7.8-2.1 4.9-9.7 9.6-9.7 9.6z"/>`,
  drop: `<path fill="currentColor" d="M12 2.2c-3 4.6-6.6 8.3-6.6 12.4a6.6 6.6 0 0 0 13.2 0c0-4.1-3.6-7.8-6.6-12.4z"/>`,
};

// Variable colours are the app brand colours, never a glucose-state colour.
const VARS = [
  { key: "Steps", name: "Steps", color: "#FF3DAB", more: "More steps", side: "L", icon: "walk" },
  { key: "ActiveMinutes", name: "Active minutes", color: "#F6F4F0", more: "More active minutes", side: "L", icon: "run" },
  { key: "Intensity", name: "Intensity", color: "#3DFFE7", more: "Higher intensity", side: "L", icon: "flame" },
  { key: "Sedentary", name: "Sedentary Time", color: "#9B7BFF", more: "More sedentary time", side: "R", icon: "chair" },
  { key: "HeartRate", name: "Heart rate", color: "#4D7CFF", more: "Higher heart rate", side: "R", icon: "heart" },
];

const WALKED = "On days you walked more, your glucose was lower";
const GENERIC = "How your activity relates to your glucose";

// Badge words follow the approved view: |r| under 0.1 is no link, so a mild
// association (intensity is about -0.12) still reads as weak. strengthLabel in
// analysis.mjs calls |r| under 0.15 negligible. The r value itself is the
// same-day Pearson from prepare().
export function linkStrength(r) {
  const value = Math.abs(r);
  if (!Number.isFinite(r) || value < 0.1) return "none";
  if (value >= 0.5) return "strong";
  if (value >= 0.3) return "moderate";
  return "weak";
}

export function glucoseColor(value) {
  return { low: C.low, high: C.high, in: C.in }[bandOf(value)] || "#888";
}

function glucoseWord(value) {
  return { low: "Low", high: "High", in: "In range" }[bandOf(value)] || "—";
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Africa/Nairobi is UTC+3 all year. The day panel buckets a reading by that
// local hour: fasting before 10:00, after lunch before 16:00, otherwise dinner.
function slotOf(recordedAt) {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return null;
  const hour = (date.getUTCHours() + 3) % 24;
  if (hour < 10) return "fasting";
  if (hour < 16) return "lunch";
  return "dinner";
}

function slotsFrom(readings) {
  const slots = { fasting: null, lunch: null, dinner: null };
  for (const reading of readings || []) {
    const value = reading?.props?.value;
    if (!finite(value)) continue;
    const slot = slotOf(reading?.props?.recordedAt);
    if (!slot || slots[slot] != null) continue;
    slots[slot] = value;
  }
  return slots;
}

function fmtDate(stamp) {
  if (!stamp) return "—";
  const date = new Date(`${stamp}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(stamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function fmtLong(stamp) {
  if (!stamp) return "—";
  const date = new Date(`${stamp}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(stamp);
  return `${WEEK[date.getDay()]} ${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`;
}

function spanText(days) {
  if (!days.length) return "";
  const last = days[days.length - 1].date || "";
  const noun = days.length === 1 ? "day" : "days";
  const year = /^\d{4}/.test(last) ? last.slice(0, 4) : "";
  return `${days.length} ${noun} · ${fmtDate(days[0].date)} – ${fmtDate(last)}${year ? ` ${year}` : ""}`;
}

function sameGlucoseEdge(model, key) {
  return (model?.sameEdges || []).find((edge) =>
    (edge.source === key && edge.target === "Glucose") ||
    (edge.target === key && edge.source === "Glucose"));
}

export function buildView(model) {
  const series = model?.series || {};
  const days = (model?.days || []).map((day, index) => ({
    date: day.date,
    steps: finite(series.Steps?.[index]) ? series.Steps[index] : null,
    hr: finite(series.HeartRate?.[index]) ? series.HeartRate[index] : null,
    active: finite(series.ActiveMinutes?.[index]) ? series.ActiveMinutes[index] : null,
    sed: finite(series.Sedentary?.[index]) ? series.Sedentary[index] : null,
    intensity: finite(series.Intensity?.[index]) ? series.Intensity[index] : null,
    intensityName: day.intensity || null,
    slots: slotsFrom(day.readings),
    avg: finite(day.glucose) ? day.glucose : null,
    index,
  }));

  const variables = VARS.map((spec) => {
    const variable = model?.variableByKey?.[spec.key];
    const edge = sameGlucoseEdge(model, spec.key);
    const r = edge ? edge.r : Number.NaN;
    const recorded = variable?.n || 0;
    return {
      ...spec,
      days: recorded,
      constant: !!variable?.constant,
      link: { r, n: edge?.n || 0 },
      strength: linkStrength(r),
      sparse: recorded < days.length * 0.5,
    };
  }).filter((variable) => variable.days > 2 && !variable.constant);

  const withGlucose = days.filter((day) => day.avg != null);
  const hasData = days.length > 0 && withGlucose.length > 0;
  const steps = variables.find((variable) => variable.key === "Steps");
  const walked = !!(steps && steps.link.r < 0 && (steps.strength === "moderate" || steps.strength === "strong"));

  return {
    name: model?.user?.props?.displayName || "",
    hasData,
    headline: walked ? WALKED : GENERIC,
    span: spanText(days),
    days,
    variables,
    glucoseAverage: hasData ? withGlucose.reduce((sum, day) => sum + day.avg, 0) / withGlucose.length : null,
  };
}

const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let introPending = !reducedMotion;
let introUntil = 0;

const state = { view: null, selected: null };
let bound = false;

function dataURL() {
  const path = window.location.pathname;
  const at = path.indexOf("/graph");
  const root = at >= 0 ? path.slice(0, at + "/graph".length) : "";
  const url = new URL(`${root}/data`, window.location.origin);
  const params = new URLSearchParams(window.location.search);
  const user = params.get("user") || params.get("userId") || params.get("id") || params.get("email");
  if (user) url.searchParams.set("user", user);
  return url.pathname + url.search;
}

async function loadGraph() {
  const response = await fetch(dataURL());
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body && body.error) || `request failed (${response.status})`);
  return body;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function n0(value) {
  return Math.round(value).toLocaleString("en-US");
}

function stepBand(steps) {
  if (!finite(steps)) return null;
  if (steps < 5000) return "Inactive";
  if (steps <= 10000) return "Moderate";
  return "Active";
}

function titleWord(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function icon(name, x, y, size, color, parent) {
  const node = el("svg", { x, y, width: size, height: size, viewBox: "0 0 24 24", overflow: "visible" }, parent);
  node.setAttribute("aria-hidden", "true");
  node.style.color = color;
  node.innerHTML = ICONS[name];
  return node;
}

// play() uses the Web Animations API and then drops the animation so a later
// hover can change opacity. Inline styles hide the first frame; clearing them
// on finish returns the element to the stylesheet.
function play(node, keyframes, timing) {
  if (typeof node.animate !== "function") return;
  const anim = node.animate(keyframes, { fill: "both", easing: "cubic-bezier(0.16, 0.84, 0.32, 1)", ...timing });
  anim.finished.then(() => {
    if (!node.isConnected) return;
    node.style.opacity = "";
    node.style.transform = "";
    if (node.dataset.draw === "solid") node.style.strokeDasharray = "";
    node.style.strokeDashoffset = "";
    anim.cancel();
  }).catch(() => {});
}

function fade(node, delay, duration, from = {}, to = {}) {
  node.style.opacity = "0";
  if (from.transform) {
    node.style.transformBox = "fill-box";
    node.style.transformOrigin = "center";
    node.style.transform = from.transform;
  }
  play(node, [{ opacity: 0, ...from }, { opacity: 1, ...to }], { delay, duration });
}

function drawLine(line, length, delay, dashed) {
  line.dataset.draw = dashed ? "dash" : "solid";
  line.style.strokeDasharray = dashed ? "4px 14px" : `${length}px`;
  line.style.strokeDashoffset = `${length}px`;
  play(line, [
    { strokeDashoffset: `${length}px` },
    { strokeDashoffset: "0px" },
  ], { delay, duration: INTRO.lineDuration, easing: "ease-out" });
}

const tip = () => document.getElementById("tip");

function showTip(event, html) {
  const node = tip();
  node.innerHTML = html;
  node.classList.add("show");
  moveTip(event);
}

function moveTip(event) {
  const node = tip();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let x = event.clientX + 22;
  let y = event.clientY + 22;
  if (x + w > innerWidth - 10) x = event.clientX - w - 22;
  if (y + h > innerHeight - 10) y = event.clientY - h - 22;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

function hideTip() {
  tip().classList.remove("show");
}

function setFocus(key) {
  document.querySelectorAll("#svg .link, #svg g.var").forEach((node) => {
    node.classList.toggle("dim", !!key && node.dataset.key !== key);
  });
}

function varTip(variable, total) {
  const strength = variable.strength;
  const head = strength === "none"
    ? `No clear link between ${esc(variable.name.toLowerCase())} and glucose.`
    : `${esc(variable.more)} went with ${variable.link.r < 0 ? "lower" : "higher"} average glucose on the same day.`;
  const note = variable.sparse
    ? `<br>Recorded on only ${variable.days} of ${total} days.`
    : `<br>Based on ${variable.link.n} days.`;
  const badge = strength === "none" ? "" : `<span class="big">${strength.charAt(0).toUpperCase()}${strength.slice(1)} link.</span> `;
  return `<b>${esc(variable.name)}</b>${badge}${head}${note}`;
}

function bindVar(node, variable, total) {
  node.addEventListener("mouseenter", (event) => {
    setFocus(variable.key);
    showTip(event, varTip(variable, total));
  });
  node.addEventListener("mousemove", moveTip);
  node.addEventListener("mouseleave", () => {
    setFocus(null);
    hideTip();
  });
}

function panelHTML(day, index) {
  const days = state.view.days;
  const reads = SLOTS.map((slot) => {
    const value = day.slots[slot.key];
    if (value == null) {
      return `<div class="read"><div class="lab">${slot.name} <span>· ${slot.time}</span></div><div class="val" style="color:#888">—</div></div>`;
    }
    const color = glucoseColor(value);
    return `<div class="read"><div class="lab">${slot.name} <span>· ${slot.time}</span></div>
      <div class="val" style="color:${color}">${Math.round(value)}<small>mg/dL</small></div>
      <span class="st" style="background:${color}">${glucoseWord(value)}</span></div>`;
  }).join("");
  const act = (name, color, value, unit) => {
    const body = value == null
      ? `<div class="na">Not recorded</div>`
      : `<div class="val">${n0(value)}<small>${esc(unit)}</small></div>`;
    return `<div class="act"><div class="lab" style="color:${color}">${esc(name)}</div>${body}</div>`;
  };
  const intensity = day.intensityName
    ? `<div class="val" style="font-size:40px">${esc(titleWord(day.intensityName))}</div>`
    : `<div class="na">Not recorded</div>`;
  const band = stepBand(day.steps);
  const steps = day.steps == null
    ? `<span class="u">No steps recorded</span>`
    : `<span class="n">${n0(day.steps)}</span><span class="u">steps</span>${band ? `<span class="b">· ${esc(band)} day</span>` : ""}`;
  const prev = index > 0 ? fmtDate(days[index - 1].date) : "";
  const next = index < days.length - 1 ? fmtDate(days[index + 1].date) : "";
  return `
    <button class="close" id="close" type="button" aria-label="Close">✕ Close</button>
    <div class="p-date">${esc(fmtLong(day.date))}</div>
    <div class="p-steps">${steps}</div>
    <div class="p-h">Glucose readings</div>
    <div class="reads">${reads}</div>
    <div class="p-h">Activity</div>
    <div class="acts">
      ${act("Active minutes", "#F6F4F0", day.active, "min")}
      ${act("Heart rate", "#4D7CFF", day.hr, "bpm")}
      ${act("Sedentary Time", "#9B7BFF", day.sed, "min")}
      <div class="act"><div class="lab" style="color:#3DFFE7">Intensity</div>${intensity}</div>
    </div>
    <div class="p-nav">
      <button id="prev" type="button" ${index === 0 ? "disabled" : ""}>← ${esc(prev)}</button>
      <button id="next" type="button" ${index === days.length - 1 ? "disabled" : ""}>${esc(next)} →</button>
    </div>`;
}

function openDay(index) {
  const day = state.view?.days[index];
  if (!day) return;
  state.selected = index;
  const panel = document.getElementById("panel");
  panel.innerHTML = panelHTML(day, index);
  document.getElementById("close").onclick = closeDay;
  document.getElementById("prev").onclick = () => { if (index > 0) openDay(index - 1); };
  document.getElementById("next").onclick = () => { if (index < state.view.days.length - 1) openDay(index + 1); };
  document.getElementById("shade").classList.add("open");
  hideTip();
  render();
}

function closeDay() {
  state.selected = null;
  document.getElementById("shade").classList.remove("open");
  render();
}

function bindOnce() {
  if (bound) return;
  bound = true;
  document.getElementById("shade").addEventListener("click", (event) => {
    if (event.target.id === "shade") closeDay();
  });
  window.addEventListener("keydown", (event) => {
    if (state.selected == null || !state.view) return;
    if (event.key === "Escape") closeDay();
    if (event.key === "ArrowLeft" && state.selected > 0) {
      event.preventDefault();
      openDay(state.selected - 1);
    }
    if (event.key === "ArrowRight" && state.selected < state.view.days.length - 1) {
      event.preventDefault();
      openDay(state.selected + 1);
    }
  });
}

function fitRing(svg, W, H) {
  let ry = Math.max(220, H / 2 - 56);
  let rx = Math.min(W / 2 - 70, ry * 2);
  const card = svg.ownerDocument?.querySelector(".qr");
  if (!card) return { rx, ry };
  const box = svg.getBoundingClientRect();
  const qr = card.getBoundingClientRect();
  if (!qr.width || !qr.height) return { rx, ry };
  const pad = 18;
  const clear = 12;
  const hits = () => {
    for (let step = 0; step < 64; step++) {
      const angle = (step / 64) * Math.PI * 2;
      const x = box.left + W / 2 + (rx + pad) * Math.cos(angle);
      const y = box.top + H / 2 + (ry + pad) * Math.sin(angle);
      if (x >= qr.left - clear && x <= qr.right + clear && y >= qr.top - clear && y <= qr.bottom + clear) return true;
    }
    return false;
  };
  let guard = 0;
  // Shorten the ellipse vertically first so the lower-right arc clears the card
  // while the labels still fit inside the ring.
  while (hits() && guard < 48 && ry > 150) {
    ry *= 0.98;
    rx = Math.min(rx, ry * 2);
    guard += 1;
  }
  return { rx, ry };
}

function render() {
  const svg = document.getElementById("svg");
  const view = state.view;
  if (!svg || !view?.hasData) return;
  const animate = introPending;
  introPending = false;
  introUntil = animate ? performance.now() + 1650 : 0;
  if (animate) {
    try { cueIntro(); } catch (e) {}
  }
  svg.textContent = "";

  const days = view.days;
  const variables = view.variables;
  const W = svg.clientWidth || 1440;
  const H = svg.clientHeight || 760;
  const cx = W / 2;
  const cy = H / 2;
  // Pull the ring in only when it would sit on the corner QR. Wide screens keep the usual ellipse.
  const fitted = fitRing(svg, W, H);
  const ry = fitted.ry;
  const rx = fitted.rx;
  const RC = Math.max(70, Math.min(96, ry * 0.26));
  const RV = 22;
  const LINE = 7;

  const ring = el("ellipse", { cx, cy, rx, ry, fill: "none", stroke: "rgba(255,255,255,.12)", "stroke-width": 2, class: "ring" }, svg);
  if (animate) fade(ring, INTRO.ringDelay, INTRO.ringDuration);

  const left = variables.filter((variable) => variable.side === "L");
  const right = variables.filter((variable) => variable.side === "R");
  const place = (list, sign) => list.map((variable, index) => {
    const spread = list.length === 1 ? [0] : list.length === 2 ? [-0.36, 0.36] : [-0.58, 0, 0.58];
    return { variable, sign, x: cx + sign * rx * 0.3, y: cy + (spread[index] ?? 0) * ry };
  });
  const pos = [...place(left, -1), ...place(right, 1)];

  pos.forEach((item, order) => {
    const dx = item.x - cx;
    const dy = item.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const x1 = cx + (dx / dist) * RC;
    const y1 = cy + (dy / dist) * RC;
    const x2 = item.x - (dx / dist) * RV;
    const y2 = item.y - (dy / dist) * RV;
    const line = el("line", {
      x1, y1, x2, y2,
      stroke: item.variable.color,
      "stroke-width": LINE,
      "stroke-linecap": "round",
      class: "link",
    }, svg);
    line.dataset.key = item.variable.key;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (animate) drawLine(line, length, INTRO.lineDelay + order * INTRO.lineStagger, item.variable.strength === "none");
    else if (item.variable.strength === "none") line.setAttribute("stroke-dasharray", "4 14");
    const hit = el("line", { x1, y1, x2, y2, stroke: "transparent", "stroke-width": 30 }, svg);
    bindVar(hit, item.variable, days.length);
  });

  const dayG = el("g", {}, svg);
  const gapDeg = 12;
  const sweep = 360 - gapDeg;
  const per = (2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2)) / Math.max(days.length, 1);
  const dr = Math.max(9, Math.min(14, per * 0.34));
  const dotStagger = days.length > 1 ? Math.min(16, INTRO.dotWindow / (days.length - 1)) : 0;

  days.forEach((day, index) => {
    const denom = Math.max(days.length - 1, 1);
    const angle = ((-90 + gapDeg / 2 + (sweep * index) / denom) * Math.PI) / 180;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    day._a = angle;
    if (index === state.selected) {
      el("circle", { cx: x, cy: y, r: dr + 7, fill: "none", stroke: C.text, "stroke-width": 3 }, dayG);
    }
    const dot = el("circle", {
      cx: x, cy: y, r: dr, fill: glucoseColor(day.avg), class: "day", stroke: C.ink, "stroke-width": 2,
    }, dayG);
    if (animate) {
      fade(dot, INTRO.dotDelay + index * dotStagger, INTRO.dotDuration, { transform: "scale(0.25)" }, { transform: "scale(1)" });
    }
    dot.addEventListener("mouseenter", (event) => {
      dot.setAttribute("r", String(dr * 1.4));
      const band = stepBand(day.steps);
      const steps = day.steps == null ? "No steps recorded" : `${n0(day.steps)} steps`;
      const glucose = day.avg == null
        ? "No glucose recorded"
        : `Average glucose <span class="big" style="color:${glucoseColor(day.avg)}">${Math.round(day.avg)} mg/dL</span> · ${glucoseWord(day.avg)}`;
      showTip(event, `<b>${esc(fmtLong(day.date))}</b><span class="big">${esc(steps)}</span>${band ? ` · ${esc(band)} day` : ""}<br>${glucose}<br>Click to open this day`);
    });
    dot.addEventListener("mousemove", moveTip);
    dot.addEventListener("mouseleave", () => {
      dot.setAttribute("r", String(dr));
      hideTip();
    });
    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      openDay(index);
    });
  });

  days.forEach((day) => {
    const index = day.index;
    const first = index === 0;
    const last = index === days.length - 1;
    const newMonth = String(day.date || "").endsWith("-01");
    if (!first && !last && !newMonth) return;
    const off = dr + 26;
    const c = Math.cos(day._a);
    const s = Math.sin(day._a);
    const label = el("text", {
      x: cx + (rx + off) * c,
      y: cy + (ry + off) * s + 7,
      "font-size": 20,
      "font-weight": 700,
      fill: C.text,
      "text-anchor": Math.abs(c) < 0.35 ? "middle" : c > 0 ? "start" : "end",
      class: "halo ring-label",
    }, dayG);
    label.textContent = first || last ? fmtDate(day.date) : MONTHS_LONG[Number(String(day.date).slice(5, 7)) - 1] || "";
    if (animate) fade(label, INTRO.labelDelay, INTRO.labelDuration);
  });

  const centre = el("g", { class: "centre" }, svg);
  el("circle", { cx, cy, r: RC + 12, fill: "rgba(255,255,255,.05)" }, centre);
  el("circle", { cx, cy, r: RC, fill: "#151515", stroke: C.text, "stroke-width": 4 }, centre);
  icon("drop", cx - 14, cy - RC * 0.74, 28, C.text, centre);
  const title = el("text", {
    x: cx,
    y: cy - RC * 0.05,
    "text-anchor": "middle",
    "font-size": Math.round(RC * 0.36),
    fill: C.text,
  }, centre);
  title.style.fontFamily = "Bricolage";
  title.style.fontWeight = "800";
  title.style.letterSpacing = "-0.5px";
  title.textContent = "Glucose";
  const value = el("text", {
    x: cx,
    y: cy + RC * 0.36,
    "text-anchor": "middle",
    "font-size": Math.round(RC * 0.34),
    "font-weight": 700,
    fill: glucoseColor(view.glucoseAverage),
  }, centre);
  value.style.fontFamily = "Bricolage";
  value.style.fontWeight = "800";
  value.textContent = `${Math.round(view.glucoseAverage)} mg/dL`;
  const caption = el("text", {
    x: cx,
    y: cy + RC * 0.64,
    "text-anchor": "middle",
    "font-size": 17,
    "font-weight": 500,
    fill: C.second,
  }, centre);
  caption.textContent = "average";
  if (animate) {
    fade(centre, INTRO.centreDelay, INTRO.centreDuration, { transform: "scale(0.68)" }, { transform: "scale(1)" });
  }

  pos.forEach((item, order) => {
    const variable = item.variable;
    const group = el("g", { class: "var" }, svg);
    group.dataset.key = variable.key;
    el("circle", { cx: item.x, cy: item.y, r: RV, fill: variable.color, stroke: C.ink, "stroke-width": 3 }, group);
    const anchor = item.sign < 0 ? "end" : "start";
    const tx = item.x + item.sign * (RV + 18);
    // Name and badge only, centred on the node. Direction stays in the tooltip.
    const top = item.y - 40;
    const iconSize = 44;
    const gap = 10;
    const name = el("text", {
      y: top + 26, "font-size": 32, "font-weight": 700, fill: variable.color, class: "halo",
    }, group);
    name.textContent = variable.name;
    const nameWidth = (name.getComputedTextLength && name.getComputedTextLength()) || variable.name.length * 17;
    if (anchor === "start") {
      icon(variable.icon, tx, top - 9, iconSize, variable.color, group);
      name.setAttribute("x", tx + iconSize + gap);
    } else {
      name.setAttribute("x", tx);
      name.setAttribute("text-anchor", "end");
      icon(variable.icon, tx - nameWidth - gap - iconSize, top - 9, iconSize, variable.color, group);
    }
    // Signal bars: 3 strong, 2 moderate, 1 weak. Heights 8, 14, 20 sit on the text baseline.
    const word = variable.strength === "none" ? "NO LINK" : variable.strength.toUpperCase();
    const level = { strong: 3, moderate: 2, weak: 1, none: 0 }[variable.strength];
    const style = level === 3
      ? { bg: C.text, border: C.text, fg: C.ink, on: C.ink, off: "rgba(10,10,10,.25)" }
      : level === 2
        ? { bg: "transparent", border: C.text, fg: C.text, on: C.text, off: "rgba(246,244,240,.25)" }
        : { bg: "transparent", border: "rgba(246,244,240,.28)", fg: "rgba(246,244,240,.55)", on: "rgba(246,244,240,.55)", off: "rgba(246,244,240,.18)" };
    const barX = 14;
    const barW = 6;
    const barGap = 4;
    const barsWidth = 3 * barW + 2 * barGap;
    const badge = el("text", {
      y: top + 66, "font-size": 22, "font-weight": 700, fill: style.fg, "letter-spacing": 1.5,
    }, group);
    badge.textContent = word;
    const textWidth = (badge.getComputedTextLength && badge.getComputedTextLength()) || word.length * 15;
    const badgeWidth = barX + barsWidth + 10 + textWidth + 14;
    const x0 = anchor === "start" ? tx : tx - badgeWidth;
    const rect = el("rect", {
      x: x0 + 1.5, y: top + 39.5, width: badgeWidth - 3, height: 35, rx: 9,
      fill: style.bg, stroke: style.border, "stroke-width": 3,
    }, group);
    group.insertBefore(rect, badge);
    for (let bar = 0; bar < 3; bar++) {
      const height = 8 + bar * 6;
      el("rect", {
        x: x0 + barX + bar * (barW + barGap),
        y: top + 66 - height,
        width: barW,
        height,
        rx: 1.5,
        fill: bar < level ? style.on : style.off,
      }, group);
    }
    badge.setAttribute("x", x0 + barX + barsWidth + 10);
    el("circle", { cx: item.x, cy: item.y, r: RV + 14, fill: "transparent" }, group);
    bindVar(group, variable, days.length);
    if (animate) fade(group, INTRO.varDelay + order * INTRO.varStagger, INTRO.varDuration);
  });
}

function reveal(view) {
  state.view = view;
  document.body.classList.remove("is-loading");
  if (!view.hasData) {
    document.body.classList.add("is-empty");
    if (!reducedMotion) {
      try { cueEmpty(); } catch (e) {}
    }
    return;
  }
  document.getElementById("who").textContent = view.name;
  document.getElementById("span").textContent = view.span;
  document.getElementById("headline").textContent = view.headline;
  document.body.classList.add("is-ready");
  bindOnce();
  const fontsAlreadyLoaded = !document.fonts || document.fonts.status === "loaded";
  render();
  window.addEventListener("resize", () => {
    if (performance.now() < introUntil) return;
    render();
  });
  // A late font can change label widths. Re-measure after the entrance so the
  // first paint is not thrown away mid-animation.
  if (!fontsAlreadyLoaded && document.fonts?.ready) {
    document.fonts.ready.then(() => {
      const wait = Math.max(0, introUntil - performance.now() + 40);
      setTimeout(() => render(), wait);
    });
  }
}

function fail(error) {
  document.body.classList.remove("is-loading", "is-ready");
  document.body.classList.add("is-empty");
  const title = document.getElementById("empty-title");
  const copy = document.getElementById("empty-copy");
  if (title) title.textContent = "Could not load";
  if (copy) copy.textContent = error?.message || "The analysis could not be loaded.";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function boot() {
  try {
    const fonts = document.fonts?.ready
      ? Promise.race([document.fonts.ready, wait(800)])
      : Promise.resolve();
    const [payload] = await Promise.all([
      window.__GRAPH_DATA__ ? Promise.resolve(window.__GRAPH_DATA__) : loadGraph(),
      fonts,
    ]);
    reveal(buildView(prepare(payload)));
  } catch (error) {
    fail(error);
  }
}

if (typeof document !== "undefined") {
  try { bindAudio(); } catch (e) {}
  if (document.getElementById("stage")) boot();
}
