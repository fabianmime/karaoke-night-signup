// Statistik-Ansicht (/stats) - eigener Login (stats-login.php), komplett
// unabhängig vom Admin. Lädt die Auswertung für den gewählten Zeitraum in
// einem Rutsch (stats-data.php) und rendert sie clientseitig.

const REFRESH_MS = 30000;
const nf = new Intl.NumberFormat('de-CH');
const PAGE_LABELS = { guest: 'Anmeldung/Voting', display: 'Display', moderation: 'Moderation' };
const FORM_FIELD_LABELS = {
  firstname: 'Vorname', lastname: 'Nachname', phone: 'Telefon', email: 'E-Mail',
  duetfirstname: 'Duett-Vorname', duetlastname: 'Duett-Nachname',
};

let currentRange = 'today';
let refreshTimer = null;
let lastData = null;
const charts = {};

document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupPasswordToggles();
  checkLogin();
});

document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('passwordForm').addEventListener('submit', changePassword);
document.getElementById('resetForm').addEventListener('submit', resetStats);
document.getElementById('rangeApply').addEventListener('click', () => loadStats());
document.querySelectorAll('.nav-tabs button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('.range-presets button').forEach((btn) => {
  btn.addEventListener('click', () => setRange(btn.dataset.range));
});

/* ---------- Login ---------- */

async function checkLogin() {
  try {
    const response = await fetch('/api/stats-check.php');
    const data = await response.json();
    if (data.loggedIn) {
      showPanel();
    } else {
      showLoginForm();
    }
  } catch (error) {
    console.error('Login check error:', error);
    showLoginForm();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const input = document.getElementById('statsPassword');
  try {
    const response = await fetch('/api/stats-login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    const result = await response.json();
    if (result.success) {
      input.value = '';
      document.getElementById('loginError').textContent = '';
      showPanel();
    } else {
      document.getElementById('loginError').textContent = result.message || 'Falsches Passwort';
    }
  } catch (error) {
    console.error('Login error:', error);
    document.getElementById('loginError').textContent = 'Login-Fehler';
  }
}

async function handleLogout() {
  if (!confirm('Wirklich abmelden?')) return;
  try {
    await fetch('/api/stats-logout.php', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  }
  clearInterval(refreshTimer);
  showLoginForm();
}

function showLoginForm() {
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('statsPanel').style.display = 'none';
}

function showPanel() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('statsPanel').style.display = 'block';
  setRange(currentRange);
}

function switchTab(tab) {
  document.querySelectorAll('.nav-tabs button[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${tab}`);
  });
  // Chart.js misst die Grösse beim Anzeigen eines vorher versteckten Tabs
  // sonst falsch (Canvas mit 0px Breite).
  if (tab === 'overview') Object.values(charts).forEach((c) => c.resize());
}

/* ---------- Zeitraum ---------- */

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setRange(range) {
  currentRange = range;
  document.querySelectorAll('.range-presets button').forEach((b) => {
    b.classList.toggle('active', b.dataset.range === range);
  });
  const custom = document.getElementById('rangeCustom');
  custom.hidden = range !== 'custom';
  if (range === 'custom') {
    const fromInput = document.getElementById('rangeFrom');
    const toInput = document.getElementById('rangeTo');
    if (!fromInput.value) fromInput.value = toLocalInput(startOfDay(new Date()));
    if (!toInput.value) toInput.value = toLocalInput(new Date());
    return;
  }
  loadStats();
}

// Liefert Unix-Sekunden; "live" = Zeitraum endet jetzt (dann Auto-Refresh).
function rangeBounds() {
  const now = new Date();
  const sec = (d) => Math.floor(d.getTime() / 1000);
  switch (currentRange) {
    case '1h':
      return { from: sec(now) - 3600, to: 0, live: true };
    case 'yesterday': {
      const today = startOfDay(now);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return { from: sec(yesterday), to: sec(today), live: false };
    }
    case '7d': {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 6);
      return { from: sec(start), to: 0, live: true };
    }
    case 'all':
      return { from: 0, to: 0, live: true };
    case 'custom': {
      const from = new Date(document.getElementById('rangeFrom').value);
      const to = new Date(document.getElementById('rangeTo').value);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
        return null;
      }
      return { from: sec(from), to: sec(to), live: to >= now };
    }
    case 'today':
    default:
      return { from: sec(startOfDay(now)), to: 0, live: true };
  }
}

async function loadStats(silent = false) {
  const bounds = rangeBounds();
  const errorEl = document.getElementById('loadError');
  if (!bounds) {
    errorEl.textContent = 'Bitte einen gültigen Zeitraum wählen ("Bis" nach "Von").';
    errorEl.hidden = false;
    return;
  }

  clearInterval(refreshTimer);
  if (bounds.live) {
    refreshTimer = setInterval(() => loadStats(true), REFRESH_MS);
  }

  const params = new URLSearchParams({ from: bounds.from, to: bounds.to });
  try {
    const response = await fetch(`/api/stats-data.php?${params}`);
    if (response.status === 403) {
      clearInterval(refreshTimer);
      showLoginForm();
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler beim Laden');

    errorEl.hidden = true;
    lastData = data;
    render(data, bounds);
  } catch (error) {
    console.error('Stats error:', error);
    if (!silent) {
      errorEl.textContent = error.message || 'Statistik konnte nicht geladen werden.';
      errorEl.hidden = false;
    }
  }
}

/* ---------- Formatierung ---------- */

function fmt(n) {
  return n === null || n === undefined ? '–' : nf.format(Math.round(n));
}

function pct(part, total) {
  if (!total) return '–';
  return `${Math.round((part / total) * 100)}%`;
}

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined) return '–';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')} Min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}

function fmtDateTime(unix) {
  return new Date(unix * 1000).toLocaleString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(unix) {
  return new Date(unix * 1000).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

function bucketLabel(unix, bucket, multiDay) {
  const d = new Date(unix * 1000);
  if (bucket >= 86400) {
    return d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }
  const time = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  return multiDay ? `${d.toLocaleDateString('de-CH', { weekday: 'short' })} ${time}` : time;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- Bausteine ---------- */

function tiles(id, items) {
  document.getElementById(id).innerHTML = items.map((t) => `
    <div class="tile">
      <div class="tile-label">${escapeHtml(t.label)}</div>
      <div class="tile-value">${escapeHtml(t.value)}</div>
      ${t.sub ? `<div class="tile-sub">${escapeHtml(t.sub)}</div>` : ''}
    </div>
  `).join('');
}

// Horizontale Balkenliste: ein Mass, eine Farbe - Länge relativ zum
// grössten Wert (bzw. zu "max", z.B. beim Funnel zum ersten Schritt).
function barList(id, items, opts = {}) {
  const el = document.getElementById(id);
  if (!items.length) {
    el.innerHTML = `<p class="empty-note">${escapeHtml(opts.empty || 'Noch keine Daten im gewählten Zeitraum.')}</p>`;
    return;
  }
  const max = opts.max ?? Math.max(...items.map((i) => i.count), 1);
  el.innerHTML = `<div class="bar-list${opts.className ? ` ${opts.className}` : ''}">${items.map((i) => `
    <div class="bar-row" title="${escapeHtml(i.label)}: ${fmt(i.count)}">
      <span class="bar-label">${escapeHtml(i.label)}</span>
      <span class="bar-value">${fmt(i.count)}${i.extra ? `<span class="bar-extra">${escapeHtml(i.extra)}</span>` : ''}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${max ? Math.max(0, (i.count / max) * 100) : 0}%"></div></div>
    </div>
  `).join('')}</div>`;
}

function dataTable(id, columns, rows, empty) {
  const el = document.getElementById(id);
  if (!rows.length) {
    el.innerHTML = `<p class="empty-note">${escapeHtml(empty || 'Noch keine Daten im gewählten Zeitraum.')}</p>`;
    return;
  }
  el.innerHTML = `<table class="data"><thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.num ? 'num' : ''}${c.wrap ? ' wrap' : ''}">${escapeHtml(c.value(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function funnel(id, steps) {
  const first = steps[0]?.count || 0;
  barList(id, steps.map((s, i) => ({
    label: s.label,
    count: s.count,
    extra: i === 0 ? '' : pct(s.count, first),
  })), { max: Math.max(first, 1), className: 'funnel', empty: 'Noch keine Besucher im gewählten Zeitraum.' });
}

/* ---------- Diagramme ---------- */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function lineChart(key, canvasId, labels, datasets, showLegend) {
  if (typeof Chart === 'undefined') return;
  const muted = cssVar('--muted');
  const grid = cssVar('--grid');
  const text = cssVar('--text');

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.fill ? withAlpha(d.color, 0.15) : d.color,
        fill: !!d.fill,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: cssVar('--card-bg'),
        pointBackgroundColor: d.color,
        tension: 0,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: showLegend,
          position: 'top',
          align: 'start',
          labels: { color: text, usePointStyle: true, pointStyle: 'line', boxWidth: 18 },
        },
        tooltip: {
          backgroundColor: cssVar('--card-bg'),
          titleColor: text,
          bodyColor: text,
          borderColor: cssVar('--border'),
          borderWidth: 1,
          padding: 10,
          usePointStyle: true,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          border: { color: grid },
        },
        y: {
          beginAtZero: true,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted, precision: 0 },
        },
      },
    },
  };

  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart(document.getElementById(canvasId), config);
}

// Farben hängen am Theme - beim Umschalten (Button oder System) neu zeichnen.
function rerenderCharts() {
  if (lastData) renderCharts(lastData);
}
new MutationObserver(rerenderCharts).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerenderCharts);

function renderCharts(d) {
  const multiDay = d.range.to - d.range.from > 86400;
  // Leere Zeitabschnitte vor der ersten Aktivität abschneiden - bei "Heute"
  // wäre sonst der halbe Tag bis zum Eventbeginn eine flache Nulllinie.
  const raw = d.timeline;
  const firstUsed = raw.starts.findIndex((_, i) =>
    raw.active[i] || raw.pageviews[i] || raw.searches[i] || raw.registrations[i] || raw.votes[i]);
  const cut = Math.max(0, firstUsed - 1);
  const t = Object.fromEntries(Object.entries(raw).map(([key, arr]) => [key, arr.slice(cut)]));
  const labels = t.starts.map((s) => bucketLabel(s, d.range.bucket, multiDay));

  lineChart('active', 'activeChart', labels, [
    { label: 'Aktive Gäste', data: t.active, color: cssVar('--series-1'), fill: true },
  ], false);

  lineChart('activity', 'activityChart', labels, [
    { label: 'Suchen', data: t.searches, color: cssVar('--series-1') },
    { label: 'Anmeldungen', data: t.registrations, color: cssVar('--series-2') },
    { label: 'Stimmen', data: t.votes, color: cssVar('--series-3') },
  ], true);

  const rows = t.starts.map((s, i) => ({ s, i }));
  dataTable('activeTable', [
    { label: 'Zeit', value: (r) => labels[r.i] },
    { label: 'Aktive Gäste', num: true, value: (r) => fmt(t.active[r.i]) },
    { label: 'Seitenaufrufe', num: true, value: (r) => fmt(t.pageviews[r.i]) },
  ], rows);
  dataTable('activityTable', [
    { label: 'Zeit', value: (r) => labels[r.i] },
    { label: 'Suchen', num: true, value: (r) => fmt(t.searches[r.i]) },
    { label: 'Anmeldungen', num: true, value: (r) => fmt(t.registrations[r.i]) },
    { label: 'Stimmen', num: true, value: (r) => fmt(t.votes[r.i]) },
  ], rows);
}

/* ---------- Rendern ---------- */

function peak(values, starts, bucket, multiDay) {
  let best = -1;
  let idx = -1;
  values.forEach((v, i) => {
    if (v > best) { best = v; idx = i; }
  });
  if (best <= 0) return null;
  return `Spitze ${fmt(best)} um ${bucketLabel(starts[idx], bucket, multiDay)}`;
}

function render(d, bounds) {
  const k = d.kpis;
  const multiDay = d.range.to - d.range.from > 86400;

  document.getElementById('rangeInfo').textContent =
    `${fmtDateTime(d.range.from)} – ${bounds.live ? 'jetzt' : fmtDateTime(d.range.to)}`
    + (bounds.live ? ` · aktualisiert ${fmtTime(d.now)}, automatisch alle 30 s` : '');

  // Live-Leiste
  const online = d.online || {};
  document.getElementById('liveStrip').innerHTML = `
    <span><span class="live-dot"></span>Gerade online:</span>
    ${Object.keys(PAGE_LABELS).map((p) => `<span>${PAGE_LABELS[p]} <strong>${fmt(online[p] || 0)}</strong></span>`).join('')}
  `;

  // Übersicht
  tiles('overviewTiles', [
    { label: 'Besucher', value: fmt(k.visitors), sub: `${fmt(k.pageviews)} Seitenaufrufe` },
    { label: 'Verweildauer', value: fmtDuration(k.session.median), sub: `Median · Ø ${fmtDuration(k.session.avg)}` },
    { label: 'Suchen', value: fmt(k.searches), sub: `${fmt(k.unique_terms)} verschiedene Begriffe` },
    { label: 'Anmeldungen', value: fmt(k.registrations), sub: `${pct(k.registrations, k.visitors)} der Besucher` },
    { label: 'Stimmen', value: fmt(k.votes), sub: `von ${fmt(k.voters)} Votern` },
    { label: 'Gesungen', value: fmt(k.performed), sub: `${fmt(k.cancelled)} storniert/gelöscht` },
  ]);
  renderCharts(d);
  funnel('funnel', d.funnel);
  funnel('voteFunnel', d.vote_funnel);

  // Suche
  tiles('searchTiles', [
    { label: 'Suchen', value: fmt(k.searches), sub: 'nach Tipp-Pause gezählt' },
    { label: 'Verschiedene Begriffe', value: fmt(k.unique_terms) },
    { label: 'Ohne Treffer', value: fmt(k.zero_searches), sub: `${pct(k.zero_searches, k.searches)} aller Suchen` },
    { label: 'Songs ausgewählt', value: fmt(k.song_selects), sub: peak(d.timeline.searches, d.timeline.starts, d.range.bucket, multiDay) },
    { label: 'Formularfehler', value: fmt(k.form_errors), sub: 'Absenden mit fehlenden/ungültigen Angaben' },
  ]);
  barList('topTerms', d.top_terms.map((t) => ({
    label: t.term,
    count: t.count,
    extra: t.avg_results !== null ? `Ø ${nf.format(t.avg_results)} Treffer` : '',
  })));
  barList('zeroTerms', d.zero_terms.map((t) => ({ label: t.term, count: t.count })),
    { empty: 'Keine Suchen ohne Treffer 🎉' });
  barList('topSelected', d.top_selected);

  // Songs & Voting
  const soloCount = k.registrations - k.duo;
  tiles('songTiles', [
    { label: 'Anmeldungen', value: fmt(k.registrations), sub: `${fmt(soloCount)} Solo · ${fmt(k.duo)} Duett` },
    { label: 'Abgelehnt: vergeben', value: fmt(k.rejected.taken), sub: 'Song war schon angemeldet' },
    { label: 'Abgelehnt: gesperrt', value: fmt(k.rejected.blocked + k.rejected.locked), sub: `${fmt(k.rejected.blocked)} Song gesperrt · ${fmt(k.rejected.locked)} Anmeldung zu` },
    { label: 'Stimmen', value: fmt(k.votes), sub: `${fmt(k.vote_removes)} zurückgenommen` },
    { label: 'Voter', value: fmt(k.voters), sub: k.voters ? `Ø ${nf.format(Math.round(((k.votes - k.vote_removes) / k.voters) * 10) / 10)} Stimmen` : '' },
  ]);
  barList('topVoted', d.top_voted);
  const vpv = d.votes_per_voter;
  barList('votesPerVoter', [1, 2, 3].map((n) => ({
    label: `${n} ${n === 1 ? 'Stimme' : 'Stimmen'}`,
    count: vpv[n] || 0,
  })).filter(() => k.voters > 0), { empty: 'Noch keine Stimmen im gewählten Zeitraum.' });
  barList('wantedTaken', d.wanted_taken, { empty: 'Keine Mehrfach-Wünsche im gewählten Zeitraum.' });
  barList('bdGenre', d.breakdowns.genre);
  barList('bdLanguage', d.breakdowns.language);
  barList('bdDecade', d.breakdowns.decade);
  barList('bdArtist', d.breakdowns.artist);

  // Ablauf
  const tm = d.timing;
  tiles('flowTiles', [
    { label: 'Freigabezeit', value: fmtDuration(tm.approval.median), sub: `Median · Anmeldung → genehmigt (${fmt(tm.approval.n)})` },
    { label: 'Wartezeit', value: fmtDuration(tm.wait.median), sub: `Median · Anmeldung → auf der Bühne (${fmt(tm.wait.n)})` },
    { label: 'Längste Wartezeit', value: fmtDuration(tm.wait.max) },
    { label: 'Bühnenzeit', value: fmtDuration(tm.stage.median), sub: `Median pro Song (${fmt(tm.stage.n)})` },
    { label: 'Storniert/gelöscht', value: fmt(k.cancelled), sub: `${pct(k.cancelled, k.registrations)} der Anmeldungen` },
  ]);
  dataTable('setlist', [
    { label: '#', num: true, value: (r) => String(r.n) },
    { label: 'Zeit', value: (r) => fmtTime(r.played_at) },
    { label: 'Song', wrap: true, value: (r) => r.label || 'Unbekannt' },
    { label: 'Wartezeit', num: true, value: (r) => fmtDuration(r.wait_s) },
    { label: 'Bühnenzeit', num: true, value: (r) => fmtDuration(r.stage_s) },
    { label: 'Stimmen', num: true, value: (r) => fmt(r.votes) },
  ], d.setlist.map((r, i) => ({ ...r, n: i + 1 })), 'Im gewählten Zeitraum wurde noch kein Song gesungen.');

  // Besucher
  const returning = Math.max(0, k.visitors - k.new_visitors);
  tiles('visitorTiles', [
    { label: 'Besucher', value: fmt(k.visitors), sub: `${fmt(k.new_visitors)} neu · ${fmt(returning)} wiederkehrend` },
    { label: 'Seitenaufrufe', value: fmt(k.pageviews), sub: k.visitors ? `Ø ${nf.format(Math.round((k.pageviews / k.visitors) * 10) / 10)} pro Besucher` : '' },
    { label: 'Verweildauer', value: fmtDuration(k.session.median), sub: `Median · längste ${fmtDuration(k.session.max)}` },
    { label: 'Startauswahl', value: `${fmt(k.choose_register)} / ${fmt(k.choose_vote)}`, sub: 'Anmelden / Voten geöffnet' },
  ]);
  dataTable('pagesTable', [
    { label: 'Seite', value: (r) => PAGE_LABELS[r.page] || r.page },
    { label: 'Aufrufe', num: true, value: (r) => fmt(r.views) },
    { label: 'Besucher', num: true, value: (r) => fmt(r.visitors) },
    { label: 'Gerade online', num: true, value: (r) => fmt(online[r.page] || 0) },
  ], d.pages);
  barList('devDevice', d.devices.device);
  barList('devOs', d.devices.os);
  barList('devBrowser', d.devices.browser);
  barList('sources', d.sources);

  // Export-Links auf den aktuellen Zeitraum
  const exportParams = `from=${d.range.from}&to=${bounds.to || ''}`;
  document.getElementById('exportEvents').href = `/api/stats-export.php?type=events&${exportParams}`;
  document.getElementById('exportVisits').href = `/api/stats-export.php?type=visits&${exportParams}`;
}

/* ---------- Verwaltung ---------- */

function feedback(id, message, ok) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = `feedback ${ok ? 'ok' : 'err'}`;
}

async function changePassword(e) {
  e.preventDefault();
  const current = document.getElementById('currentPassword');
  const next = document.getElementById('newPassword');
  try {
    const response = await fetch('/api/stats-password.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current.value, new_password: next.value }),
    });
    const result = await response.json();
    if (result.success) {
      current.value = '';
      next.value = '';
      feedback('passwordFeedback', result.message, true);
    } else {
      feedback('passwordFeedback', result.error || 'Fehler beim Speichern', false);
    }
  } catch (error) {
    feedback('passwordFeedback', 'Fehler beim Speichern', false);
  }
}

async function resetStats(e) {
  e.preventDefault();
  if (!confirm('Wirklich ALLE Statistikdaten unwiderruflich löschen?')) return;
  const input = document.getElementById('resetPassword');
  try {
    const response = await fetch('/api/stats-reset.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    const result = await response.json();
    if (result.success) {
      input.value = '';
      feedback('resetFeedback', `Statistik zurückgesetzt (${fmt(result.deleted_events)} Ereignisse, ${fmt(result.deleted_visits)} Besuche gelöscht).`, true);
      loadStats();
    } else {
      feedback('resetFeedback', result.error || 'Fehler beim Zurücksetzen', false);
    }
  } catch (error) {
    feedback('resetFeedback', 'Fehler beim Zurücksetzen', false);
  }
}

/* ---------- Theme & Passwort-Anzeige (wie admin.js) ---------- */

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch (e) {
      /* localStorage evtl. nicht verfügbar */
    }
  });
}

function setupPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? '👁' : '🙈';
    });
  });
}
