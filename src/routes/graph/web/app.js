const COLORS = {
  User: '#D8FF3C',
  Day: '#FFFFFF',
  Steps: '#FF3DAB',
  HeartRate: '#3DFFE7',
  ActiveMinutes: '#FFB020',
  Sedentary: '#8A8A8A',
  GlucoseReading: '#4D7CFF'
};
const FALLBACK = '#4a4a4a';

const statusEl = document.getElementById('status');
const panelEl = document.getElementById('panel');
const crumbEl = document.getElementById('crumb');
const noteEl = document.getElementById('note');
const searchEl = document.getElementById('search');

const state = {
  graph: null,
  view: 'overview',
  day: null,
  reading: null,
  filter: 'all'
};

const byId = new Map();
const outEdges = new Map();
const inEdges = new Map();

let cy = null;

init();

async function init() {
  bindUI();
  try {
    const response = await fetch('data');
    const payload = await response.json();
    state.graph = payload;
    index(payload);
    statusEl.textContent = `${payload.meta.nodeCount} nodes · ${payload.meta.edgeCount} edges`
      + (payload.meta.truncated ? ` · capped at ${payload.meta.limit}` : '');
    openFromHash();
  } catch (error) {
    statusEl.textContent = 'failed: ' + error.message;
  }
}

function openFromHash() {
  const hash = decodeURIComponent(location.hash.replace('#', ''));
  const [kind, value] = hash.split('=');
  if (kind === 'day' && value) {
    const match = dayNodes().find(day => day.props.date === value);
    if (match) return renderDay(match.id);
  }
  if (kind === 'reading' && value) {
    // the hash can carry either the element id or the app's own id
    if (byId.has(value)) return renderReading(value);
    const match = state.graph.nodes.find(entry => entry.label === 'GlucoseReading' && entry.props.id === value);
    if (match) return renderReading(match.id);
  }
  renderOverview();
}

function index(payload) {
  payload.nodes.forEach(n => byId.set(n.id, n));
  payload.edges.forEach(e => {
    if (!outEdges.has(e.start)) outEdges.set(e.start, []);
    if (!inEdges.has(e.end)) inEdges.set(e.end, []);
    outEdges.get(e.start).push(e);
    inEdges.get(e.end).push(e);
  });
}

function node(id) { return byId.get(id); }
function dayNodes() {
  return state.graph.nodes
    .filter(n => n.label === 'Day')
    .sort((a, b) => (a.props.date || '').localeCompare(b.props.date || ''));
}

// ---------- views ----------

function renderOverview() {
  state.view = 'overview';
  state.day = null;
  state.reading = null;
  history.replaceState(null, '', '#overview');
  crumb(['You']);

  const days = dayNodes();
  const elements = [];
  const positions = {};

  const rootId = state.graph.nodes.find(n => n.label === 'User')?.id;
  const cols = 15;
  const cw = 96;
  const chh = 118;

  let rowCount = 1;
  days.forEach((day, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    rowCount = Math.max(rowCount, row + 1);
    const x = col * cw;
    const y = row * chh;
    positions[day.id] = { x, y };
    elements.push(cell(day));
  });

  const offsets = {
    Steps: [-24, -24],
    HeartRate: [24, -24],
    ActiveMinutes: [-24, 24],
    Sedentary: [24, 24]
  };

  days.forEach(day => {
    const base = positions[day.id];
    const children = (outEdges.get(day.id) || [])
      .map(edge => node(edge.end))
      .filter(child => child && COLORS[child.label] && child.label !== 'Day' && child.label !== 'User');

    const readings = children.filter(child => child.label === 'GlucoseReading');
    const metrics = children.filter(child => child.label !== 'GlucoseReading');

    metrics.forEach(child => {
      const [dx, dy] = offsets[child.label] || [0, 0];
      positions[child.id] = { x: base.x + dx, y: base.y + dy };
      elements.push(cell(child));
      elements.push(link(day.id, child.id));
    });

    readings.forEach((child, i) => {
      positions[child.id] = {
        x: base.x + (i - (readings.length - 1) / 2) * 13,
        y: base.y + 40
      };
      elements.push(cell(child));
      elements.push(link(day.id, child.id));
    });
  });

  draw(elements, positions, {
    minZoom: 0.3,
    style: [
      { selector: 'node', style: { label: '', width: 9, height: 9 } },
      { selector: 'node[label="Day"]', style: { shape: 'ellipse', width: 13, height: 13 } },
      { selector: 'node[label="GlucoseReading"]', style: { width: 6, height: 6 } },
      { selector: 'node[label="Steps"], node[label="HeartRate"], node[label="ActiveMinutes"], node[label="Sedentary"]', style: { width: 6, height: 6 } },
      { selector: 'node[label="User"]', style: { width: 26, height: 26 } },
      { selector: 'edge', style: { width: 0.5, opacity: 0.35 } }
    ],
    after: () => {
      applyFilter();
      statusEl.textContent = `${state.graph.meta.nodeCount} nodes · ${state.graph.meta.edgeCount} edges`;
    }
  });

  showOverviewPanel();
}

function renderDay(dayId) {
  state.view = 'day';
  state.day = dayId;
  state.reading = null;
  const day = node(dayId);
  if (!day) return renderOverview();
  history.replaceState(null, '', '#day=' + (day.props.date || ''));

  const label = shortDate(day.props.date);
  crumb(['You', label]);

  const elements = [cell(day)];
  const positions = { [day.id]: { x: 0, y: 0 } };

  const rootId = state.graph.nodes.find(n => n.label === 'User')?.id;
  if (rootId) {
    elements.push(cell(node(rootId)));
    positions[rootId] = { x: -330, y: 0 };
    elements.push(link(rootId, day.id));
  }

  const children = (outEdges.get(day.id) || [])
    .map(edge => node(edge.end))
    .filter(Boolean);
  const metrics = children.filter(child => child.label !== 'GlucoseReading');
  const readings = children
    .filter(child => child.label === 'GlucoseReading')
    .sort((a, b) => (a.props.recordedAt || '').localeCompare(b.props.recordedAt || ''));

  const order = ['Steps', 'HeartRate', 'ActiveMinutes', 'Sedentary'];
  metrics
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
    .forEach((metric, i) => {
      positions[metric.id] = { x: 250, y: -135 + i * 90 };
      elements.push(cell(metric, `${metricValue(metric)}\n${metricLabel(metric.label)}`));
      elements.push(link(day.id, metric.id));
    });

  if (readings.length) {
    elements.push({
      data: { id: 'rail', label: 'readings' },
      classes: 'rail',
      position: { x: 0, y: 0 }
    });
    readings.forEach((reading, i) => {
      const spread = readings.length > 1 ? 170 : 0;
      positions[reading.id] = {
        x: (i - (readings.length - 1) / 2) * spread,
        y: 250
      };
      elements.push(cell(reading, `${value(reading)}\n${time(reading)}`));
      elements.push(link(day.id, reading.id));
    });
  }

  draw(elements.filter(el => el.data.id !== 'rail'), positions, {
    minZoom: 0.5,
    style: [
      { selector: 'node[label="Day"]', style: { width: 96, height: 96, label: shortDate(day.props.date), 'font-size': 14, 'font-weight': 800, color: '#0A0A0A', 'text-valign': 'center', 'text-margin-y': 0 } },
      { selector: 'node[label="GlucoseReading"]', style: { width: 54, height: 54, 'font-size': 11, color: '#0A0A0A', 'text-valign': 'center', 'text-margin-y': 0 } },
      { selector: 'node[label="Steps"], node[label="HeartRate"], node[label="ActiveMinutes"], node[label="Sedentary"]', style: { width: 56, height: 56, 'font-size': 10, color: '#0A0A0A', 'text-valign': 'center', 'text-margin-y': 0, 'text-wrap': 'wrap' } },
      { selector: 'node[label="User"]', style: { width: 34, height: 34 } },
      { selector: 'edge', style: { width: 1, opacity: 0.55 } }
    ]
  });

  showDayPanel(day);
}

function renderReading(readingId) {
  const reading = node(readingId);
  if (!reading) return;
  const parent = (inEdges.get(readingId) || [])
    .map(edge => node(edge.start))
    .find(parentNode => parentNode && parentNode.label === 'Day');
  if (!parent) return;

  state.view = 'reading';
  state.day = parent.id;
  state.reading = readingId;
  history.replaceState(null, '', '#reading=' + readingId);

  crumb(['You', shortDate(parent.props.date), `${time(reading)} · ${value(reading)}`]);

  const elements = [cell(reading, `${value(reading)}\n${time(reading)}`)];
  const positions = { [reading.id]: { x: 0, y: 0 } };

  elements.push(cell(parent));
  positions[parent.id] = { x: -300, y: 0 };
  elements.push(link(parent.id, reading.id));

  const rootId = state.graph.nodes.find(n => n.label === 'User')?.id;
  if (rootId) {
    elements.push(cell(node(rootId)));
    positions[rootId] = { x: -520, y: 0 };
    elements.push(link(rootId, parent.id));
  }

  const siblings = (outEdges.get(parent.id) || [])
    .map(edge => node(edge.end))
    .filter(sibling => sibling && sibling.label === 'GlucoseReading' && sibling.id !== readingId)
    .sort((a, b) => (a.props.recordedAt || '').localeCompare(b.props.recordedAt || ''));

  siblings.forEach((sibling, i) => {
    positions[sibling.id] = { x: 260, y: (i - (siblings.length - 1) / 2) * 130 };
    elements.push(cell(sibling, `${value(sibling)}\n${time(sibling)}`));
  });

  draw(elements, positions, {
    minZoom: 0.5,
    style: [
      { selector: 'node[label="GlucoseReading"]', style: { width: 62, height: 62, 'font-size': 15, color: '#0A0A0A', 'text-valign': 'center', 'text-margin-y': 0 } },
      { selector: 'node[label="Day"]', style: { width: 80, height: 80, label: shortDate(parent.props.date), 'font-size': 11, color: '#0A0A0A', 'text-valign': 'center', 'text-margin-y': 0 } },
      { selector: 'node[label="User"]', style: { width: 30, height: 30 } },
      { selector: 'edge', style: { width: 1.5, opacity: 0.7 } }
    ]
  });

  showReadingPanel(reading, parent);
}

// ---------- cytoscape plumbing ----------

function cell(entry, display = '') {
  return {
    data: {
      id: entry.id,
      label: entry.label,
      display,
      color: entry.label === 'GlucoseReading' ? glucoseColor(entry.props.value) : (COLORS[entry.label] || FALLBACK),
      value: entry.props.value,
      props: entry.props,
      date: entry.props.date
    }
  };
}

function link(start, end) {
  return { data: { id: `e-${start}-${end}`, source: start, target: end } };
}

function draw(elements, positions, options) {
  const container = document.getElementById('cy');
  if (cy) cy.destroy();

  cy = cytoscape({
    container,
    elements,
    wheelSensitivity: 0.2,
    minZoom: options.minZoom || 0.4,
    maxZoom: 3,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          width: 22,
          height: 22,
          label: 'data(display)',
          'font-family': 'Outfit, sans-serif',
          'font-size': 9,
          'font-weight': 700,
          color: '#9a9a9a',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 5,
          'text-wrap': 'wrap',
          'text-max-width': 90
        }
      },
      { selector: 'edge', style: { 'line-color': '#333', width: 0.8, 'curve-style': 'bezier', 'target-arrow-shape': 'none' } },
      { selector: '.faded', style: { opacity: 0.1 } },
      { selector: '.focus', style: { 'border-width': 3, 'border-color': '#FF3DAB' } },
      ...(options.style || [])
    ],
    layout: { name: 'preset', positions, fit: true, padding: 70 }
  });

  cy.on('tap', 'node', event => {
    const id = event.target.id();
    const entry = node(id);
    if (!entry) return;

    if (state.view === 'overview') {
      if (entry.label === 'Day') renderDay(id);
      else if (entry.label === 'GlucoseReading') {
        const parent = (inEdges.get(id) || []).map(edge => node(edge.start)).find(p => p && p.label === 'Day');
        if (parent) renderDay(parent.id);
      } else if (entry.label !== 'User') {
        const parent = (inEdges.get(id) || []).map(edge => node(edge.start)).find(p => p && p.label === 'Day');
        if (parent) renderDay(parent.id);
      }
      return;
    }

    if (state.view === 'day' && entry.label === 'GlucoseReading') renderReading(id);
  });

  cy.on('tap', event => {
    if (event.target === cy) cy.elements().removeClass('faded focus');
  });

  if (options.after) options.after();
}

// ---------- panels ----------

function showOverviewPanel() {
  const days = dayNodes();
  const readings = state.graph.nodes.filter(n => n.label === 'GlucoseReading');
  const values = readings.map(r => r.props.value).filter(v => typeof v === 'number');
  const average = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const inRange = values.filter(v => v >= 70 && v <= 180).length;

  panelEl.innerHTML = `
    <div class="label">The whole graph</div>
    <div class="daynum">${days.length} days</div>
    <div class="meta">${readings.length} readings · ${inRange} in range</div>
    <div class="label" style="margin-top:22px">Average</div>
    <div class="value" style="color:${average ? (average > 180 ? '#FFB020' : '#fff') : '#6E6E6E'}">${average ?? '—'}</div>
    <div class="meta">mg/dL across the window</div>
    <div class="label" style="margin-top:22px">How to read this</div>
    <div class="stat"><span>Each white dot</span><span>one day</span></div>
    <div class="stat"><span>Around it</span><span>that day's metrics</span></div>
    <div class="stat"><span>Below it</span><span>its readings</span></div>
    <div class="meta" style="margin-top:16px">Click a day to open it.</div>`;
}

function showDayPanel(day) {
  const children = (outEdges.get(day.id) || []).map(edge => node(edge.end)).filter(Boolean);
  const readings = children
    .filter(child => child.label === 'GlucoseReading')
    .sort((a, b) => (a.props.recordedAt || '').localeCompare(b.props.recordedAt || ''));
  const metrics = children.filter(child => child.label !== 'GlucoseReading');

  const readingRows = readings.map(reading => `
    <div class="reading" data-reading="${reading.id}">
      <span class="t">${time(reading)}</span>
      <span class="v" style="color:${band(reading.props.value)}">${value(reading)}</span>
      <span class="s">mg/dL</span>
    </div>`).join('');

  const metricRows = metrics.map(metric => `
    <div class="stat"><span>${metricLabel(metric.label)}</span><span>${metricValue(metric)}</span></div>`).join('');

  panelEl.innerHTML = `
    <div class="label">Selected day</div>
    <div class="daynum">${shortDate(day.props.date)}</div>
    <div class="meta">${longDate(day.props.date)} · ${readings.length} reading${readings.length === 1 ? '' : 's'}</div>
    <div class="label" style="margin-top:22px">Readings</div>
    ${readingRows || '<div class="meta">none logged</div>'}
    <div class="label" style="margin-top:22px">That day</div>
    ${metricRows || '<div class="meta">no metrics</div>'}`;

  panelEl.querySelectorAll('[data-reading]').forEach(row => {
    row.addEventListener('click', () => renderReading(row.dataset.reading));
  });
}

function showReadingPanel(reading, parent) {
  const props = Object.entries(reading.props)
    .map(([key, val]) => `<div class="stat"><span>${key}</span><span>${val}</span></div>`)
    .join('');

  panelEl.innerHTML = `
    <div class="label">Selected reading</div>
    <div class="value" style="color:${band(reading.props.value)}">${value(reading)}</div>
    <div class="meta">mg/dL · ${longDate(parent.props.date)}, ${time(reading)}</div>
    <div class="label" style="margin-top:22px">Properties</div>
    ${props}
    <div class="label" style="margin-top:22px">Connected to</div>
    <div class="stat"><span>Day</span><span>${shortDate(parent.props.date)}</span></div>
    <div class="stat"><span>User</span><span>${userInitials()}</span></div>`;
}

// ---------- filter, search, crumb ----------

function applyFilter() {
  if (!cy) return;
  const kind = state.filter;
  cy.batch(() => {
    cy.nodes().removeClass('faded');
    if (kind === 'all') return;

    const keep = new Set();
    if (kind === 'glucose') {
      cy.nodes('[label="GlucoseReading"]').forEach(n => keep.add(n.id()));
      cy.nodes('[label="Day"]').forEach(n => keep.add(n.id()));
      if (state.graph.nodes.find(n => n.label === 'User')) {
        cy.nodes('[label="User"]').forEach(n => keep.add(n.id()));
      }
    }
    if (kind === 'high') {
      cy.nodes('[label="GlucoseReading"]').forEach(n => {
        const v = n.data('value');
        if (typeof v === 'number' && (v > 180 || v < 70)) {
          keep.add(n.id());
          (inEdges.get(n.id()) || []).forEach(edge => keep.add(edge.start));
        }
      });
    }
    cy.nodes().forEach(n => { if (!keep.has(n.id())) n.addClass('faded'); });
    cy.edges().forEach(e => {
      if (keep.has(e.source().id()) && keep.has(e.target().id())) return;
      e.addClass('faded');
    });
  });
}

function bindUI() {
  document.getElementById('f-all').addEventListener('click', () => setFilter('all'));
  document.getElementById('f-glucose').addEventListener('click', () => setFilter('glucose'));
  document.getElementById('f-high').addEventListener('click', () => setFilter('high'));

  searchEl.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const query = searchEl.value.trim().toLowerCase();
    if (!query) return;
    const match = dayNodes().find(day => (day.props.date || '').includes(query)
      || shortDate(day.props.date).toLowerCase() === query);
    if (match) renderDay(match.id);
    else flash('No day matches “' + searchEl.value + '”');
  });
}

function setFilter(kind) {
  state.filter = kind;
  ['f-all', 'f-glucose', 'f-high'].forEach(id => document.getElementById(id).classList.remove('on'));
  document.getElementById({ all: 'f-all', glucose: 'f-glucose', high: 'f-high' }[kind]).classList.add('on');
  document.getElementById('f-high').classList.toggle('amber', kind === 'high');
  applyFilter();
}

function crumb(parts) {
  crumbEl.innerHTML = parts.map((part, index) => {
    const isLast = index === parts.length - 1;
    const label = isLast ? `<b>${part}</b>` : `<span data-crumb="${index}">${part}</span>`;
    return label;
  }).join(' › ');

  crumbEl.querySelectorAll('[data-crumb]').forEach(span => {
    span.addEventListener('click', () => {
      const index = Number(span.dataset.crumb);
      if (index === 0 || state.view === 'reading') renderDay(state.day);
      else renderOverview();
    });
  });
}

function flash(message) {
  noteEl.textContent = message;
  noteEl.style.opacity = 1;
  setTimeout(() => { noteEl.style.opacity = 0; }, 2400);
}

// ---------- formatting ----------

function glucoseColor(value) {
  if (typeof value !== 'number') return FALLBACK;
  if (value < 70) return '#FF4D3A';
  if (value > 180) return '#FFB020';
  return '#4D7CFF';
}

function band(value) {
  if (typeof value !== 'number') return '#fff';
  if (value < 70) return '#FF4D3A';
  if (value > 180) return '#FFB020';
  return '#4D7CFF';
}

function value(entry) {
  const v = entry.props.value;
  return typeof v === 'number' ? Math.round(v) : '—';
}

function time(entry) {
  const stamp = entry.props.recordedAt;
  if (!stamp) return '—';
  const date = new Date(stamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function shortDate(stamp) {
  if (!stamp) return '—';
  const date = new Date(stamp + 'T00:00:00');
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function longDate(stamp) {
  if (!stamp) return '';
  const date = new Date(stamp + 'T00:00:00');
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

function metricLabel(label) {
  return {
    Steps: 'Steps',
    HeartRate: 'Heart rate',
    ActiveMinutes: 'Active',
    Sedentary: 'Sedentary',
    Intensity: 'Intensity'
  }[label] || label;
}

function metricValue(metric) {
  const props = metric.props;
  if (metric.label === 'Steps') return (props.count ?? 0).toLocaleString();
  if (metric.label === 'HeartRate') return `${props.bpm ?? '—'} bpm`;
  if (metric.label === 'ActiveMinutes') return `${props.minutes ?? 0} min`;
  if (metric.label === 'Sedentary') return `${props.minutes ?? 0} min`;
  if (props.intensity) return props.intensity;
  return '—';
}

function userInitials() {
  return state.graph.nodes.find(n => n.label === 'User')?.props.initials || 'You';
}
