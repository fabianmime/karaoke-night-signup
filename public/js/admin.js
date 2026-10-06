let refreshInterval;
let songSearchTimeout;
let lastQueue = [];
let confirmingCancelId = null;
let editingCommentId = null;
let commentSaveTimeout = null;
let filterSearchTimeout = null;
let bulkFilterStatus = null;
let dragState = null;
let bannerMode = false;

const STATUS_LABELS = {
  pending: 'Angemeldet',
  approved: 'Genehmigt',
  playing: 'Singt',
  completed: 'Fertig',
  cancelled: 'Storniert',
};
const STATUS_ORDER = ['pending', 'approved', 'playing', 'completed', 'cancelled'];

// Ab dieser Fensterbreite ist links neben dem zentrierten <main> (max-width
// 1200px) genug Platz für das 300px breite "Jetzt auf der Bühne"-Panel samt
// Abstand, ohne die Tabelle selbst zu verschieben (siehe .admin-now-playing-
// panel in admin.css, dessen "left" auf denselben Werten basiert). Passt
// hier nicht, bleibt die Tabelle einfach wie gewohnt zentriert.
const ADMIN_PANEL_MIN_WIDTH = 1848;
let resizeAdminPanelTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  checkLogin();
  setupThemeToggle();
  setupPasswordToggles();
  setupDragReorder();
  loadFooter();
});

async function loadFooter() {
  try {
    const response = await fetch('/api/settings-public.php');
    const data = await response.json();
    document.getElementById('ctFooter').innerHTML = data.footer_html || '';
  } catch (error) {
    console.error('Footer error:', error);
  }
}

document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('addSongForm').addEventListener('submit', submitNewSong);
document.getElementById('passwordForm').addEventListener('submit', changePassword);
document.getElementById('songSearchInput').addEventListener('input', debounceSongSearch);
document.getElementById('importBtn').addEventListener('click', importCatalog);
document.getElementById('saveGeneralBtn').addEventListener('click', saveGeneralSettings);
document.getElementById('saveModPasswordBtn').addEventListener('click', saveModPassword);
document.getElementById('copyApiKeyBtn').addEventListener('click', copyApiKey);
document.getElementById('regenerateApiKeyBtn').addEventListener('click', regenerateApiKey);
document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
document.getElementById('resetVotesBtn').addEventListener('click', resetVotes);
document.getElementById('deleteAllDataBtn').addEventListener('click', deleteAllData);
document.getElementById('bannerToggleBtn').addEventListener('click', toggleBannerMode);
document.getElementById('saveFooterBtn').addEventListener('click', saveFooter);
document.getElementById('saveBrandingTextBtn').addEventListener('click', saveBrandingText);
document.getElementById('uploadLogoBtn').addEventListener('click', () => uploadBrandingImage('logo'));
document.getElementById('uploadBannerBtn').addEventListener('click', () => uploadBrandingImage('banner'));
document.getElementById('resetLogoBtn').addEventListener('click', () => resetBrandingImage('logo'));
document.getElementById('resetBannerBtn').addEventListener('click', () => resetBrandingImage('banner'));
document.getElementById('filterSearchInput').addEventListener('input', debounceFilterSearch);
document.querySelectorAll('#bulkStatusPills .status-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    bulkFilterStatus = btn.dataset.value;
    document.querySelectorAll('#bulkStatusPills .status-pill').forEach((p) => {
      p.classList.toggle('current', p === btn);
    });
  });
});
document.getElementById('bulkApplyBtn').addEventListener('click', applyBulkFilter);

// Delegiert statt pro Zeile gebunden, weil Filter-Zeilen (Suche + die zwei
// Übersichtslisten "Gesperrt"/"Prüfen") laufend per innerHTML neu gerendert
// werden - ein direkt gebundener Listener wäre nach jedem Rendern weg.
document.addEventListener('input', (e) => {
  if (!e.target.matches('.filter-reason-input')) return;
  scheduleFilterReasonSave(e.target);
});

document.querySelectorAll('.nav-tabs button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ---------- Theme (gleiches Muster wie LiveVoice Pi Streamer) ---------- */

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

/* ---------- Login ---------- */

async function checkLogin() {
  try {
    const response = await fetch('/api/auth-check.php');
    const data = await response.json();

    if (data.loggedIn) {
      showAdminPanel();
      pollQueue();
      refreshInterval = setInterval(pollQueue, 3000);
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
  const password = document.getElementById('adminPassword').value;

  try {
    const response = await fetch('/api/auth-login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const result = await response.json();

    if (result.success) {
      document.getElementById('adminPassword').value = '';
      document.getElementById('loginError').textContent = '';
      showAdminPanel();
      pollQueue();
      refreshInterval = setInterval(pollQueue, 3000);
    } else {
      document.getElementById('loginError').textContent = result.message || 'Falsches Passwort';
    }
  } catch (error) {
    console.error('Login error:', error);
    document.getElementById('loginError').textContent = 'Login-Fehler';
  }
}

function showLoginForm() {
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
}

function logout() {
  document.getElementById('logoutModal').style.display = 'flex';
}

function cancelLogout() {
  document.getElementById('logoutModal').style.display = 'none';
}

async function confirmLogout() {
  document.getElementById('logoutModal').style.display = 'none';

  try {
    await fetch('/api/auth-logout.php', { method: 'POST' });
    clearInterval(refreshInterval);
    checkLogin();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

/* ---------- Tabs ---------- */

function switchTab(tab) {
  document.querySelectorAll('.nav-tabs button[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.getElementById('queuePanel').classList.toggle('active', tab === 'queue');
  document.getElementById('filterPanel').classList.toggle('active', tab === 'filter');
  document.getElementById('settingsPanel').classList.toggle('active', tab === 'settings');

  if (tab === 'settings') {
    loadGeneralSettings();
    loadCatalogCount();
  }
  if (tab === 'filter') {
    loadFilterOverviewLists();
  }
}

/* ---------- Warteschlange ---------- */

function pollQueue() {
  refreshQueue();
  refreshHistory();
  refreshBannerMode();
}

async function refreshBannerMode() {
  try {
    const response = await fetch('/api/settings-get.php');
    const data = await response.json();
    bannerMode = !!data.banner_mode;
    renderBannerToggle();
  } catch (error) {
    console.error('Banner mode error:', error);
  }
}

function renderBannerToggle() {
  document.getElementById('bannerToggleBtn').classList.toggle('banner-active', bannerMode);
  document.getElementById('eyeIconOpen').style.display = bannerMode ? 'none' : 'block';
  document.getElementById('eyeIconClosed').style.display = bannerMode ? 'block' : 'none';
  document.getElementById('bannerModeHint').textContent = bannerMode
    ? 'Display zeigt aktuell den Vollbild-Banner - die Warteschlange ist fürs Publikum ausgeblendet.'
    : '';
}

async function toggleBannerMode() {
  const next = !bannerMode;
  try {
    await fetch('/api/settings-update.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banner_mode: next }),
    });
    bannerMode = next;
    renderBannerToggle();
  } catch (error) {
    console.error('Banner toggle error:', error);
  }
}

async function refreshQueue() {
  try {
    const response = await fetch('/api/queue-admin-all.php');
    const queue = await response.json();
    if (!Array.isArray(queue)) return;

    lastQueue = queue;
    // Während des Ziehens, einer offenen Notiz-Bearbeitung oder eines
    // offenen "⋮"-Menüs nicht neu rendern - der Auto-Refresh würde sonst die
    // Geste/den Text/das offene Menü mittendrin zurücksetzen.
    if (!dragState && editingCommentId === null && !document.querySelector('.dropdown-wrap.open')) {
      renderQueueList();
    }
  } catch (error) {
    console.error('Refresh error:', error);
  }
}

function renderQueueList() {
  const list = document.getElementById('queueList');
  const count = document.getElementById('queueCount');

  // Panel zuerst entscheiden - läuft es, taucht der spielende Song separat
  // links auf und fliegt aus der normalen Liste raus (sonst doppelt).
  const panelActive = updateAdminNowPlayingPanel();
  const listEntries = panelActive ? lastQueue.filter((entry) => entry.status !== 'playing') : lastQueue;

  count.textContent = lastQueue.length === 0
    ? 'Keine Anmeldungen'
    : (lastQueue.length === 1 ? '1 Anmeldung' : `${lastQueue.length} Anmeldungen`);

  list.innerHTML = listEntries.length === 0
    ? '<div class="empty-state">Noch keine Anmeldungen.</div>'
    : listEntries.map(renderQueueItem).join('');
}

// "Jetzt auf der Bühne" links neben der (immer zentriert bleibenden)
// Tabelle - nur wenn wirklich jemand spielt UND genug Platz dafür da ist
// (siehe ADMIN_PANEL_MIN_WIDTH), sonst bleibt die Karte einfach wie gewohnt
// Teil der normalen Liste. Rückgabewert sagt renderQueueList(), ob der
// spielende Song aus der Liste raus soll.
function updateAdminNowPlayingPanel() {
  const panel = document.getElementById('adminNowPlayingPanel');
  if (!panel) return false;

  const playing = lastQueue.find((entry) => entry.status === 'playing');
  const canShow = !!playing && window.innerWidth >= ADMIN_PANEL_MIN_WIDTH;

  if (!canShow) {
    panel.classList.remove('active');
    panel.innerHTML = '';
    return false;
  }

  const topnav = document.querySelector('.topnav');
  panel.style.top = `${(topnav ? topnav.offsetHeight : 56) + 20}px`;
  panel.classList.add('active');

  // "Storniert" aus dem "⋮"-Menü führt zu genau dieser Bestätigung wie in
  // der normalen Liste (renderQueueItem()) - ohne diesen Zweig würde ein
  // Klick im Panel scheinbar nichts tun, weil confirmingCancelId sonst nur
  // dort ausgewertet wird.
  if (confirmingCancelId === playing.id) {
    panel.innerHTML = `
      <p class="admin-now-playing-eyebrow"><span class="dot"></span>Jetzt auf der Bühne</p>
      <div class="admin-now-playing-title">${escapeHtml(playing.title)}</div>
      <div class="admin-now-playing-artist">${escapeHtml(playing.artist)}</div>
      <div class="confirm-row">
        <span>Wirklich stornieren?</span>
        <button class="btn-danger" onclick="confirmCancel(${playing.id})">Ja, stornieren</button>
        <button class="btn-secondary" onclick="cancelCancelConfirm()">Abbrechen</button>
      </div>
    `;
    return true;
  }

  // renderCommentLine() bringt Stimmenzahl (unterm Stift) und die editierbare
  // Notiz gleich mit - dieselbe Funktion/derselbe Bearbeitungs-Zustand wie in
  // der normalen Liste, hier nur grösser/abgesetzt dargestellt (siehe CSS).
  panel.innerHTML = `
    <p class="admin-now-playing-eyebrow"><span class="dot"></span>Jetzt auf der Bühne</p>
    <div class="admin-now-playing-title">${escapeHtml(playing.title)}</div>
    <div class="admin-now-playing-artist">${escapeHtml(playing.artist)}</div>
    <div class="admin-now-playing-singer">🎤 ${singerLine(playing)}</div>
    <div class="admin-now-playing-comment">${renderCommentLine(playing)}</div>
    ${renderQueueActions(playing)}
  `;

  return true;
}

window.addEventListener('resize', () => {
  clearTimeout(resizeAdminPanelTimeout);
  // Volles Re-Render statt nur des Panels - eine Grössenänderung kann das
  // Panel ein-/ausblenden, was auch beeinflusst, ob der spielende Song in
  // der Liste auftaucht oder nicht.
  resizeAdminPanelTimeout = setTimeout(renderQueueList, 150);
});

function singerLine(entry) {
  return entry.duet_first_name
    ? `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)} & ${escapeHtml(entry.duet_first_name)} ${escapeHtml(entry.duet_last_name)} 👥`
    : `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)}`;
}

function renderCommentLine(entry) {
  if (editingCommentId === entry.id) {
    return `
      <div class="comment-edit">
        <textarea id="commentEditInput" rows="2" oninput="scheduleCommentSave(${entry.id})">${escapeHtml(entry.comment || '')}</textarea>
        <div class="comment-edit-footer">
          <span class="comment-save-status" id="commentSaveStatus">Gespeichert</span>
          <button type="button" class="btn-icon-edit" title="Schliessen" onclick="closeCommentEdit()">✕</button>
        </div>
      </div>
    `;
  }

  // Ohne Notiz bleibt das Feld bewusst leer statt "Keine Notiz" zu zeigen -
  // der Stift daneben bleibt trotzdem klickbar, um eine zu erfassen.
  const text = entry.comment ? `💬 ${escapeHtml(entry.comment)}` : '';

  // Stimmenzahl unterhalb des Stift-Icons statt oben in der Titelzeile -
  // gleiches Rechts-unten-Muster wie auf dem Display (Sänger oben, Stimmen
  // darunter, beides rechtsbündig).
  return `
    <div class="queue-contact comment-line">
      <span>${text}</span>
      <div class="comment-line-actions">
        <button type="button" class="btn-icon-edit" title="Notiz bearbeiten" onclick="startCommentEdit(${entry.id})">✎</button>
        <span class="votes-badge" title="Stimmen">🗳️ ${entry.votes || 0}</span>
      </div>
    </div>
  `;
}

function renderFilterBadge(entry) {
  if (entry.filter_status === 'blocked') {
    return `<span class="filter-badge filter-badge-blocked" title="${escapeHtml(entry.filter_reason || 'Gesperrt')}">🚫 Gesperrt</span>`;
  }
  if (entry.filter_status === 'review') {
    const hint = entry.filter_reason || 'Dieser Song muss überprüft werden, ob er zugelassen werden kann.';
    return `<span class="filter-badge filter-badge-review" title="${escapeHtml(hint)}">⚠️ Prüfen!</span>`;
  }
  return '';
}

function renderQueueItem(entry) {
  const filterBadge = renderFilterBadge(entry);
  const isPlaying = entry.status === 'playing';

  const body = `
    <div class="queue-body">
      <div class="queue-title-row">
        <div class="queue-title">${escapeHtml(entry.title)} ${filterBadge}</div>
        <div class="queue-singer">${singerLine(entry)}</div>
      </div>
      <div class="queue-meta">${escapeHtml(entry.artist)} · ${escapeHtml(entry.phone)} · ${escapeHtml(entry.email)}</div>
      ${renderCommentLine(entry)}
    </div>
  `;

  if (confirmingCancelId === entry.id) {
    return `
      <div class="queue-item${isPlaying ? ' is-playing' : ''}" data-id="${entry.id}">
        <div class="queue-item-top">
          <div class="drag-handle">⠿</div>
          <div class="queue-pos">${entry.position}</div>
          ${body}
        </div>
        <div class="confirm-row">
          <span>Wirklich stornieren?</span>
          <button class="btn-danger" onclick="confirmCancel(${entry.id})">Ja, stornieren</button>
          <button class="btn-secondary" onclick="cancelCancelConfirm()">Abbrechen</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="queue-item${isPlaying ? ' is-playing' : ''}" data-id="${entry.id}">
      <div class="queue-item-top">
        <div class="drag-handle">⠿</div>
        <div class="queue-pos">${entry.position}</div>
        ${body}
      </div>
      ${renderQueueActions(entry)}
    </div>
  `;
}

// Nächstlogischer Schritt im Workflow als grosser primärer Button, alle
// anderen/selteneren Wechsel hinter einem "⋮"-Menü statt 5 gleichwertige
// Pills nebeneinander. Wird sowohl in der normalen Liste als auch im
// "Jetzt auf der Bühne"-Panel verwendet.
//
// "Singen" gibt es bewusst nur EINMAL im ganzen Screen: nur der oberste
// genehmigte Song (erster "approved"-Eintrag in Positions-Reihenfolge, also
// lastQueue - die API liefert bereits nach position sortiert) bekommt einen
// Primär-Button dafür - sonst liess sich versehentlich mehr als ein Song
// gleichzeitig auf "Singt" setzen. Läuft schon jemand, heisst der Button
// "Singen (aktuellen Fertig)" und beendet den laufenden Song gleich mit
// (startNextSong()). Alle anderen genehmigten Songs zeigen keinen
// Primär-Button, nur das "⋮"-Menü (kann "Singt" dort trotzdem manuell
// wählen, das ist eine bewusste Ausnahme, kein Vorschlag).
function renderQueueActions(entry) {
  let primaryBtn = '';
  const excluded = [entry.status];

  if (entry.status === 'pending') {
    excluded.push('approved');
    primaryBtn = `<button type="button" class="btn-primary-action" data-value="approved" onclick="updateStatus(${entry.id}, 'approved')">Genehmigen</button>`;
  } else if (entry.status === 'approved') {
    const topApproved = lastQueue.find((e) => e.status === 'approved');
    if (topApproved && topApproved.id === entry.id) {
      excluded.push('playing');
      const playingEntry = lastQueue.find((e) => e.status === 'playing');
      primaryBtn = playingEntry
        ? `<button type="button" class="btn-primary-action" data-value="playing" onclick="startNextSong(${entry.id}, ${playingEntry.id})">Singen (aktuellen Fertig)</button>`
        : `<button type="button" class="btn-primary-action" data-value="playing" onclick="updateStatus(${entry.id}, 'playing')">Singen</button>`;
    }
  } else if (entry.status === 'playing') {
    excluded.push('completed');
    primaryBtn = `<button type="button" class="btn-primary-action" data-value="completed" onclick="updateStatus(${entry.id}, 'completed')">Song Fertig</button>`;
  }

  // Menü VOR der eigentlichen Aktion schliessen: updateStatus() ruft am Ende
  // pollQueue() auf, dessen Refresh-Guard ein noch offenes ".dropdown-wrap"
  // als "Nutzer ist mitten in der Bedienung" wertet und das Re-Render
  // überspringt - ohne dieses Schliessen hätte der Klick den Status zwar in
  // der DB geändert, aber sichtbar "nichts" bewirkt.
  const dropdownItems = STATUS_ORDER
    .filter((status) => !excluded.includes(status))
    .map((status) => {
      const action = status === 'cancelled'
        ? `startCancelConfirm(${entry.id})`
        : `updateStatus(${entry.id}, '${status}')`;
      const onClick = `this.closest('.dropdown-wrap').classList.remove('open'); ${action}`;
      return `<button type="button" onclick="${onClick}">${STATUS_LABELS[status]}</button>`;
    })
    .join('');

  return `
    <div class="queue-actions">
      ${primaryBtn}
      <div class="dropdown-wrap">
        <button type="button" class="btn-icon dots-btn" title="Weitere Aktionen" aria-label="Weitere Aktionen" onclick="this.closest('.dropdown-wrap').classList.toggle('open')">⋮</button>
        <div class="dropdown-menu">${dropdownItems}</div>
      </div>
    </div>
  `;
}

// Menü schliessen, wenn irgendwo ausserhalb geklickt wird.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.dropdown-wrap.open').forEach((wrap) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
});

/* ---------- Moderationsnotiz bearbeiten ---------- */

function startCommentEdit(id) {
  editingCommentId = id;
  renderQueueList();

  const input = document.getElementById('commentEditInput');
  if (input) {
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  }
}

function closeCommentEdit() {
  clearTimeout(commentSaveTimeout);
  editingCommentId = null;
  renderQueueList();
}

// Auto-Save statt Speichern-Button: 700ms nach dem letzten Tastendruck
// wird automatisch gesichert - der Poll-Refresh (alle 3s) lässt die Karte
// währenddessen unangetastet (siehe editingCommentId-Guard in refreshQueue).
function scheduleCommentSave(id) {
  clearTimeout(commentSaveTimeout);
  setCommentSaveStatus('Speichert …', 'pending');
  commentSaveTimeout = setTimeout(() => saveCommentNow(id), 700);
}

function setCommentSaveStatus(text, state) {
  const statusEl = document.getElementById('commentSaveStatus');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'comment-save-status' + (state ? ` ${state}` : '');
}

async function saveCommentNow(id) {
  const input = document.getElementById('commentEditInput');
  if (!input) return;
  const comment = input.value.trim();

  try {
    const response = await fetch(`/api/queue-comment.php?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    });
    const result = await response.json();

    // Lokal mitschreiben, damit ein Zwischen-Poll nicht den alten Stand
    // zurückspiegelt, solange die Karte noch im Edit-Modus ist.
    const entry = lastQueue.find((e) => e.id === id);
    if (entry) entry.comment = comment;

    setCommentSaveStatus(result.success ? 'Gespeichert' : ('Fehler: ' + result.error), result.success ? '' : 'error');
  } catch (error) {
    console.error('Comment auto-save error:', error);
    setCommentSaveStatus('Fehler beim Speichern', 'error');
  }
}

/* ---------- Drag & Drop Umsortieren ---------- */

function setupDragReorder() {
  const list = document.getElementById('queueList');

  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const item = handle.closest('.queue-item');
    if (!item) return;

    const rect = item.getBoundingClientRect();

    // Platzhalter besetzt die Original-Position im Layout, während die
    // Karte selbst "fixed" wird und dem Finger/Mauszeiger 1:1 folgt -
    // fühlt sich dadurch wie echtes Anheben an statt wie ein Sprung.
    const placeholder = document.createElement('div');
    placeholder.className = 'queue-item-placeholder';
    placeholder.style.height = `${rect.height}px`;
    item.before(placeholder);

    dragState = { item, placeholder, offsetY: e.clientY - rect.top };

    item.style.position = 'fixed';
    item.style.top = `${rect.top}px`;
    item.style.left = `${rect.left}px`;
    item.style.width = `${rect.width}px`;
    item.classList.add('dragging');

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) { /* ignoriert */ }
    e.preventDefault();
  });

  list.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const { item, placeholder, offsetY } = dragState;

    item.style.top = `${e.clientY - offsetY}px`;

    const siblings = [...list.children].filter((el) => el !== item && el !== placeholder);
    let next = null;
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        next = sib;
        break;
      }
    }

    if (next !== placeholder && next !== placeholder.nextElementSibling) {
      flipReorder(list, () => {
        if (next) {
          list.insertBefore(placeholder, next);
        } else {
          list.appendChild(placeholder);
        }
      });
    }
  });

  const endDrag = () => {
    if (!dragState) return;
    const { item, placeholder } = dragState;

    placeholder.replaceWith(item);
    item.style.position = '';
    item.style.top = '';
    item.style.left = '';
    item.style.width = '';
    item.classList.remove('dragging');

    dragState = null;
    persistQueueOrder();
  };

  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);
}

// FLIP-Technik (First-Last-Invert-Play): merkt sich die Positionen vor der
// DOM-Änderung, wendet danach sofort einen Gegen-Versatz an und animiert
// den dann auf 0 weg - dadurch gleiten die verdrängten Karten smooth an
// ihren neuen Platz statt instant zu springen.
function flipReorder(container, mutate) {
  const firstRects = new Map([...container.children].map((el) => [el, el.getBoundingClientRect()]));

  mutate();

  container.querySelectorAll(':scope > *').forEach((el) => {
    const firstRect = firstRects.get(el);
    if (!firstRect) return;
    const lastRect = el.getBoundingClientRect();
    const deltaY = firstRect.top - lastRect.top;
    if (Math.abs(deltaY) < 1) return;

    el.style.transition = 'none';
    el.style.transform = `translateY(${deltaY}px)`;
    el.getBoundingClientRect(); // Reflow erzwingen
    requestAnimationFrame(() => {
      el.style.transition = 'transform 200ms ease';
      el.style.transform = '';
    });
  });
}

async function persistQueueOrder() {
  const ids = [...document.getElementById('queueList').querySelectorAll('.queue-item')]
    .map((el) => Number(el.dataset.id))
    .filter((id) => Number.isFinite(id));

  // Der spielende Song fehlt in der DOM-Liste, solange das "Jetzt auf der
  // Bühne"-Panel aktiv ist (siehe renderQueueList()) - trotzdem vorne mit
  // übergeben, sonst würde queue-reorder.php ihn als "übersehen" ans Ende
  // der Warteschlange anhängen statt ihn auf Position 1 zu belassen.
  const playing = lastQueue.find((entry) => entry.status === 'playing');
  if (playing && !ids.includes(playing.id)) {
    ids.unshift(playing.id);
  }

  if (!ids.length) return;

  try {
    await fetch('/api/queue-reorder.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ids }),
    });
    refreshQueue();
  } catch (error) {
    console.error('Reorder error:', error);
  }
}

// Für den "Singen (aktuellen Fertig)"-Button: aktuell laufenden Song
// beenden UND den nächsten gleich mit starten, statt zwei Klicks zu
// brauchen (in denen kurz niemand "spielt"). Bricht ab, wenn schon das
// Beenden fehlschlägt (z.B. Netzwerkfehler) - sonst könnte am Ende doch
// wieder mehr als ein Song gleichzeitig "Singt" sein, genau das Problem,
// das dieser Button eigentlich vermeiden soll.
async function startNextSong(nextId, currentPlayingId) {
  const completedOk = await updateStatus(currentPlayingId, 'completed');
  if (!completedOk) return;
  await updateStatus(nextId, 'playing');
}

async function updateStatus(id, status) {
  try {
    const response = await fetch(`/api/queue-status.php?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    if (result.success) {
      // "Singt" rückt den Song immer ganz nach oben - der Ansager soll ihn
      // ohne Suchen zuoberst finden.
      if (status === 'playing') {
        await moveToTop(id);
      }
      pollQueue();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Update error:', error);
    return false;
  }
}

async function moveToTop(id) {
  const ids = [id, ...lastQueue.map((entry) => entry.id).filter((entryId) => entryId !== id)];
  try {
    await fetch('/api/queue-reorder.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ids }),
    });
  } catch (error) {
    console.error('Move to top error:', error);
  }
}

function startCancelConfirm(id) {
  confirmingCancelId = id;
  renderQueueList();
}

function cancelCancelConfirm() {
  confirmingCancelId = null;
  renderQueueList();
}

async function confirmCancel(id) {
  confirmingCancelId = null;
  await updateStatus(id, 'cancelled');
}

/* ---------- Verlauf ---------- */

async function refreshHistory() {
  try {
    const response = await fetch('/api/queue-history.php');
    const history = await response.json();
    const list = document.getElementById('historyList');

    if (!Array.isArray(history) || history.length === 0) {
      list.innerHTML = '<div class="empty-state">Noch kein Verlauf.</div>';
      return;
    }

    list.innerHTML = history.map(renderHistoryItem).join('');
  } catch (error) {
    console.error('History error:', error);
  }
}

function renderHistoryItem(entry) {
  const badgeLabel = entry.status === 'cancelled' ? 'Storniert' : 'Fertig';
  const commentLine = entry.comment
    ? `<div class="queue-contact">💬 ${escapeHtml(entry.comment)}</div>`
    : '';

  return `
    <div class="history-item">
      <div class="history-item-row">
        <div>
          <div class="queue-title">${escapeHtml(entry.title)}<span class="history-badge ${entry.status}">${badgeLabel}</span></div>
          <div class="queue-meta">${escapeHtml(entry.artist)} · ${singerLine(entry)}</div>
          ${commentLine}
        </div>
        <button class="btn-secondary" onclick="restoreFromHistory(${entry.id})">Zurück in die Warteschlange</button>
      </div>
    </div>
  `;
}

async function restoreFromHistory(id) {
  try {
    const response = await fetch('/api/queue-restore.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const result = await response.json();

    if (result.success) {
      pollQueue();
    } else {
      alert('Fehler: ' + result.error);
    }
  } catch (error) {
    console.error('Restore error:', error);
    alert('Fehler beim Wiederherstellen');
  }
}

async function clearHistory() {
  if (!confirm('Kompletten Verlauf endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;

  const feedback = document.getElementById('historyFeedback');

  try {
    const response = await fetch('/api/queue-clear-history.php', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = `${result.deleted} Einträge gelöscht.`;
      feedback.className = 'feedback ok';
      refreshHistory();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Clear history error:', error);
    feedback.textContent = 'Fehler beim Löschen.';
    feedback.className = 'feedback err';
  }
}

async function deleteAllData() {
  // Zweifache Bestätigung, weil das unwiderruflich sowohl die aktive
  // Warteschlange als auch den kompletten Verlauf löscht - deutlich
  // drastischer als "Verlauf löschen".
  if (!confirm('Wirklich ALLE Anmeldungen löschen - aktuelle Warteschlange UND kompletter Verlauf, inkl. aller Stimmen? Der Song-Katalog und alle Einstellungen bleiben erhalten.')) return;
  if (!confirm('Letzte Bestätigung: Das kann NICHT rückgängig gemacht werden. Wirklich fortfahren?')) return;

  const feedback = document.getElementById('deleteAllDataFeedback');

  try {
    const response = await fetch('/api/queue-delete-all.php', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = `${result.deleted} Anmeldungen gelöscht.`;
      feedback.className = 'feedback ok';
      refreshQueue();
      refreshHistory();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Delete all data error:', error);
    feedback.textContent = 'Fehler beim Löschen.';
    feedback.className = 'feedback err';
  }
}

async function resetVotes() {
  if (!confirm('Wirklich ALLE Stimmen unwiderruflich löschen? Jede/r bekommt danach wieder 3 neue Stimmen, alle Song-Zähler stehen auf 0. Das kann nicht rückgängig gemacht werden.')) return;

  const feedback = document.getElementById('resetVotesFeedback');

  try {
    const response = await fetch('/api/votes-reset.php', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = `${result.deleted} Stimmen gelöscht - alle Zähler stehen wieder auf 0.`;
      feedback.className = 'feedback ok';
      refreshQueue();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Reset votes error:', error);
    feedback.textContent = 'Fehler beim Zurücksetzen.';
    feedback.className = 'feedback err';
  }
}

/* ---------- Einstellungen: Anmeldesperre & Mitteilung ---------- */

async function loadGeneralSettings() {
  try {
    const response = await fetch('/api/settings-get.php');
    const data = await response.json();
    document.getElementById('registrationLocked').checked = !!data.registration_locked;
    document.getElementById('votingLocked').checked = !!data.voting_locked;
    document.getElementById('announcement').value = data.announcement || '';
    document.getElementById('showVotesOnDisplay').checked = !!data.show_votes_on_display;
    document.getElementById('footerHtml').value = data.footer_html || '';
    document.getElementById('eventName').value = data.event_name || '';
    document.getElementById('eventSubtitle').value = data.event_subtitle || '';
    renderBrandingImage('logo', data.brand_logo_url || '');
    renderBrandingImage('banner', data.brand_banner_url || '');
    document.getElementById('modPasswordStatus').textContent = data.moderation_password_set
      ? 'Aktuell: ein Moderations-Passwort ist gesetzt.'
      : 'Aktuell: noch kein Moderations-Passwort gesetzt - Login ist gesperrt, bis eines gesetzt wird.';
    document.getElementById('controlApiKey').value = data.control_api_key || '';
    document.getElementById('controlApiKeyStatus').textContent = data.control_api_key
      ? ''
      : 'Noch kein Schlüssel erzeugt - "Neu generieren" klicken, bevor das Companion-Modul eingerichtet wird.';
  } catch (error) {
    console.error('Settings load error:', error);
  }
}

async function copyApiKey() {
  const feedback = document.getElementById('controlApiKeyFeedback');
  const value = document.getElementById('controlApiKey').value;
  if (!value) {
    feedback.textContent = 'Kein Schlüssel vorhanden.';
    feedback.className = 'feedback err';
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    feedback.textContent = 'In die Zwischenablage kopiert.';
    feedback.className = 'feedback ok';
  } catch (error) {
    console.error('Copy error:', error);
    feedback.textContent = 'Kopieren fehlgeschlagen - bitte manuell markieren.';
    feedback.className = 'feedback err';
  }
}

// Ein neu generierter Schlüssel macht den bisherigen sofort ungültig - ein
// bereits eingerichtetes Companion-Modul müsste dann mit dem neuen Wert
// aktualisiert werden, deshalb vorher eine Bestätigung wie bei den anderen
// unumkehrbaren Aktionen in dieser Sektion (kein eigenes Modal, siehe
// resetVotes()/deleteAllData()).
async function regenerateApiKey() {
  const feedback = document.getElementById('controlApiKeyFeedback');
  if (!confirm('Neuen API-Key erzeugen? Der bisherige Schlüssel wird sofort ungültig - ein bereits eingerichtetes Companion-Modul muss danach mit dem neuen Wert aktualisiert werden.')) {
    return;
  }

  try {
    const response = await fetch('/api/settings-api-key-regenerate.php', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      document.getElementById('controlApiKey').value = result.api_key;
      document.getElementById('controlApiKeyStatus').textContent = '';
      feedback.textContent = 'Neuer Schlüssel erzeugt.';
      feedback.className = 'feedback ok';
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('API key regenerate error:', error);
    feedback.textContent = 'Fehler beim Erzeugen.';
    feedback.className = 'feedback err';
  }
}

async function saveFooter() {
  const feedback = document.getElementById('footerFeedback');
  const footer_html = document.getElementById('footerHtml').value.trim();

  try {
    const response = await fetch('/api/settings-update.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ footer_html }),
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = 'Gespeichert.';
      feedback.className = 'feedback ok';
      loadFooter();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Footer save error:', error);
    feedback.textContent = 'Fehler beim Speichern.';
    feedback.className = 'feedback err';
  }
}

/* ---------- Einstellungen: Branding (Logo, Banner, Event-Texte) ---------- */

const BRANDING_IMAGE_UI = {
  logo: {
    preview: 'brandingLogoPreview',
    status: 'brandingLogoStatus',
    file: 'brandingLogoFile',
    button: 'uploadLogoBtn',
    feedback: 'brandingLogoFeedback',
    emptyText: 'Aktuell: neutrales Standard-Logo.',
    customText: 'Aktuell: eigenes Logo.',
    emptyPreview: '/img/default-logo.svg',
  },
  banner: {
    preview: 'brandingBannerPreview',
    status: 'brandingBannerStatus',
    file: 'brandingBannerFile',
    button: 'uploadBannerBtn',
    feedback: 'brandingBannerFeedback',
    emptyText: 'Aktuell: automatischer Banner aus Logo und Texten.',
    customText: 'Aktuell: eigenes Banner-Bild.',
    emptyPreview: '',
  },
};

function renderBrandingImage(type, url) {
  const ui = BRANDING_IMAGE_UI[type];
  const preview = document.getElementById(ui.preview);
  const src = url || ui.emptyPreview;
  if (src) {
    preview.src = src;
  } else {
    preview.removeAttribute('src');
  }
  preview.parentElement.hidden = !src;
  document.getElementById(ui.status).textContent = url ? ui.customText : ui.emptyText;
}

// Logo in Navigation/Login dieser Admin-Seite sofort mitziehen, ohne
// Neuladen (gleiche Logik wie auf den anderen Seiten via branding.js).
async function refreshPageBranding() {
  try {
    const response = await fetch('/api/settings-public.php', { cache: 'no-store' });
    if (window.karaokeApplyBranding) window.karaokeApplyBranding(await response.json());
  } catch (error) {
    console.error('Branding refresh error:', error);
  }
}

async function saveBrandingText() {
  const feedback = document.getElementById('brandingTextFeedback');
  const payload = {
    event_name: document.getElementById('eventName').value.trim(),
    event_subtitle: document.getElementById('eventSubtitle').value.trim(),
  };

  try {
    const response = await fetch('/api/settings-update.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = 'Gespeichert.';
      feedback.className = 'feedback ok';
      refreshPageBranding();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Branding text save error:', error);
    feedback.textContent = 'Fehler beim Speichern.';
    feedback.className = 'feedback err';
  }
}

async function uploadBrandingImage(type) {
  const ui = BRANDING_IMAGE_UI[type];
  const fileInput = document.getElementById(ui.file);
  const feedback = document.getElementById(ui.feedback);
  const btn = document.getElementById(ui.button);

  if (!fileInput.files.length) {
    feedback.textContent = 'Bitte zuerst eine Bilddatei wählen.';
    feedback.className = 'feedback err';
    return;
  }

  const formData = new FormData();
  formData.append('type', type);
  formData.append('image', fileInput.files[0]);

  btn.disabled = true;
  feedback.textContent = 'Lade hoch …';
  feedback.className = 'feedback';

  try {
    const response = await fetch('/api/branding-upload.php', { method: 'POST', body: formData });
    let result;
    try {
      result = await response.json();
    } catch (parseError) {
      // z.B. 413 vom Webserver bei zu grossen Dateien - kommt nicht als JSON
      result = { error: response.status === 413 ? 'Datei ist zu gross' : `HTTP ${response.status}` };
    }

    if (result.success) {
      feedback.textContent = 'Hochgeladen - ist sofort auf allen Seiten aktiv.';
      feedback.className = 'feedback ok';
      fileInput.value = '';
      renderBrandingImage(type, result.url);
      refreshPageBranding();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Branding upload error:', error);
    feedback.textContent = 'Fehler beim Hochladen.';
    feedback.className = 'feedback err';
  } finally {
    btn.disabled = false;
  }
}

async function resetBrandingImage(type) {
  const ui = BRANDING_IMAGE_UI[type];
  const feedback = document.getElementById(ui.feedback);
  const question = type === 'logo'
    ? 'Eigenes Logo entfernen und wieder das neutrale Standard-Logo verwenden?'
    : 'Eigenes Banner-Bild entfernen und den automatischen Banner verwenden?';
  if (!confirm(question)) return;

  try {
    const response = await fetch('/api/branding-delete.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = 'Zurückgesetzt.';
      feedback.className = 'feedback ok';
      renderBrandingImage(type, '');
      refreshPageBranding();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Branding reset error:', error);
    feedback.textContent = 'Fehler beim Zurücksetzen.';
    feedback.className = 'feedback err';
  }
}

async function saveModPassword() {
  const feedback = document.getElementById('modPasswordFeedback');
  const newPassword = document.getElementById('modPassword').value;

  if (newPassword.length < 4) {
    feedback.textContent = 'Passwort ist zu kurz (mind. 4 Zeichen).';
    feedback.className = 'feedback err';
    return;
  }

  try {
    const response = await fetch('/api/settings-mod-password.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = 'Moderations-Passwort gesetzt.';
      feedback.className = 'feedback ok';
      document.getElementById('modPassword').value = '';
      loadGeneralSettings();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Mod password error:', error);
    feedback.textContent = 'Fehler beim Speichern.';
    feedback.className = 'feedback err';
  }
}

async function saveGeneralSettings() {
  const feedback = document.getElementById('generalFeedback');
  const payload = {
    registration_locked: document.getElementById('registrationLocked').checked,
    voting_locked: document.getElementById('votingLocked').checked,
    announcement: document.getElementById('announcement').value.trim(),
    show_votes_on_display: document.getElementById('showVotesOnDisplay').checked,
  };

  try {
    const response = await fetch('/api/settings-update.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = 'Gespeichert.';
      feedback.className = 'feedback ok';
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Settings save error:', error);
    feedback.textContent = 'Fehler beim Speichern.';
    feedback.className = 'feedback err';
  }
}

async function changePassword(e) {
  e.preventDefault();
  const feedback = document.getElementById('passwordFeedback');
  const current_password = document.getElementById('currentPassword').value;
  const new_password = document.getElementById('newPassword').value;

  if (new_password.length < 4) {
    feedback.textContent = 'Neues Passwort ist zu kurz (mind. 4 Zeichen).';
    feedback.className = 'feedback err';
    return;
  }

  try {
    const response = await fetch('/api/settings-password.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password, new_password }),
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = 'Passwort geändert.';
      feedback.className = 'feedback ok';
      document.getElementById('passwordForm').reset();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Password change error:', error);
    feedback.textContent = 'Fehler beim Ändern.';
    feedback.className = 'feedback err';
  }
}

/* ---------- Filter (Gesperrt / Prüfen) ---------- */

async function applyBulkFilter() {
  const feedback = document.getElementById('bulkFeedback');
  const textarea = document.getElementById('bulkArtistNames');
  const reason = document.getElementById('bulkFilterReason').value.trim();

  const artists = textarea.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (artists.length === 0) {
    feedback.textContent = 'Bitte mindestens einen Bandnamen eingeben.';
    feedback.className = 'feedback err';
    return;
  }

  if (!bulkFilterStatus) {
    feedback.textContent = 'Bitte einen Status auswählen (Keine Sperre / Prüfen / Gesperrt).';
    feedback.className = 'feedback err';
    return;
  }

  feedback.textContent = 'Wird angewendet …';
  feedback.className = 'feedback';

  try {
    const response = await fetch('/api/filter-bulk-set.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artists, filter_status: bulkFilterStatus, filter_reason: reason }),
    });
    const result = await response.json();

    if (result.success) {
      let text = `${result.total_rows_updated} Songs bei ${result.total_artists} Bands aktualisiert.`;
      if (result.not_found.length > 0) {
        text += ` Keine Treffer (Tippfehler? bereits klassifiziert?) bei: ${result.not_found.join(', ')}.`;
      }
      feedback.textContent = text;
      feedback.className = 'feedback ok';
      loadFilterOverviewLists();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Bulk filter error:', error);
    feedback.textContent = 'Fehler beim Anwenden.';
    feedback.className = 'feedback err';
  }
}

function debounceFilterSearch() {
  clearTimeout(filterSearchTimeout);
  const query = document.getElementById('filterSearchInput').value.trim();

  if (query.length < 2) {
    document.getElementById('filterSearchResults').innerHTML = '';
    return;
  }

  filterSearchTimeout = setTimeout(() => searchFilterCatalog(query), 300);
}

async function searchFilterCatalog(query) {
  const results = document.getElementById('filterSearchResults');
  try {
    const response = await fetch(`/api/filter-search.php?query=${encodeURIComponent(query)}&limit=30`);
    const songs = await response.json();

    if (!Array.isArray(songs) || songs.length === 0) {
      results.innerHTML = '<div class="empty-state">Keine Treffer.</div>';
      return;
    }

    results.innerHTML = songs.map(renderFilterRow).join('');
  } catch (error) {
    console.error('Filter search error:', error);
    results.innerHTML = '<div class="empty-state">Suchfehler.</div>';
  }
}

function renderFilterRow(song) {
  const status = song.filter_status || 'none';
  const reason = song.filter_reason || '';

  const pill = (value, label) => `
    <button
      type="button"
      class="status-pill ${status === value ? 'current' : ''}"
      data-value="${value}"
      onclick="setFilterStatus(${song.id}, '${value}', this)"
    >${label}</button>
  `;

  return `
    <div class="filter-row" data-id="${song.id}">
      <div class="filter-row-text">${escapeHtml(song.title)} — <span class="artist">${escapeHtml(song.artist)}</span></div>
      <input type="text" class="filter-reason-input" placeholder="Grund (optional, z.B. vulgäre Sprache)" value="${escapeHtml(reason)}">
      <div class="filter-actions">
        ${pill('none', 'Keine Sperre')}
        ${pill('review', '⚠️ Prüfen!')}
        ${pill('blocked', '🚫 Gesperrt')}
      </div>
    </div>
  `;
}

// "btn" statt einer globalen ID, um den Grund-Input zu finden - derselbe
// Song kann gleichzeitig in der Suche UND einer Übersichtsliste (Gesperrt/
// Prüfen) auftauchen, eine ID wäre dort doppelt im DOM.
async function setFilterStatus(songId, status, btn) {
  const row = btn.closest('.filter-row');
  const reasonInput = row ? row.querySelector('.filter-reason-input') : null;
  const reason = reasonInput ? reasonInput.value.trim() : '';

  try {
    const response = await fetch('/api/filter-set.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song_id: songId, filter_status: status, filter_reason: reason }),
    });
    const result = await response.json();

    if (result.success) {
      if (row) {
        row.querySelectorAll('.status-pill').forEach((p) => {
          p.classList.toggle('current', p.dataset.value === status);
        });
      }
      // Übersichtslisten neu laden - der Song kann in eine andere
      // Kategorie gewandert oder ganz herausgefallen sein.
      loadFilterOverviewLists();
    } else {
      alert('Fehler: ' + result.error);
    }
  } catch (error) {
    console.error('Filter set error:', error);
    alert('Fehler beim Speichern');
  }
}

// Auto-Save fürs Grund-Feld, analog zur Moderationsnotiz (700ms nach dem
// letzten Tastendruck) - bisher wurde der Grund nur mitgespeichert, wenn
// gleichzeitig auch einer der Status-Buttons angeklickt wurde. Der Timeout
// hängt am Input-Element selbst statt an einer globalen Variable, da in den
// Übersichtslisten mehrere Grund-Felder gleichzeitig sichtbar sein können.
function scheduleFilterReasonSave(input) {
  clearTimeout(input._filterSaveTimeout);
  input._filterSaveTimeout = setTimeout(() => saveFilterReasonNow(input), 700);
}

async function saveFilterReasonNow(input) {
  const row = input.closest('.filter-row');
  if (!row) return;

  const songId = Number(row.dataset.id);
  const currentPill = row.querySelector('.status-pill.current');
  const status = currentPill ? currentPill.dataset.value : 'none';
  const reason = input.value.trim();

  try {
    const response = await fetch('/api/filter-set.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song_id: songId, filter_status: status, filter_reason: reason }),
    });
    const result = await response.json();
    if (!result.success) {
      alert('Fehler beim Speichern des Grunds: ' + result.error);
    }
  } catch (error) {
    console.error('Filter reason save error:', error);
    alert('Fehler beim Speichern des Grunds');
  }
}

function loadFilterOverviewLists() {
  loadFilterListByStatus('blocked', 'filterBlockedList');
  loadFilterListByStatus('review', 'filterReviewList');
}

async function loadFilterListByStatus(status, elementId) {
  const el = document.getElementById(elementId);
  try {
    const response = await fetch(`/api/filter-search.php?status=${status}&limit=200`);
    const songs = await response.json();

    if (!Array.isArray(songs) || songs.length === 0) {
      el.innerHTML = '<div class="empty-state">Keine Einträge.</div>';
      return;
    }

    el.innerHTML = songs.map(renderFilterRow).join('');
  } catch (error) {
    console.error('Filter list error:', error);
    el.innerHTML = '<div class="empty-state">Fehler beim Laden.</div>';
  }
}

/* ---------- Songs verwalten ---------- */

function debounceSongSearch() {
  clearTimeout(songSearchTimeout);
  const query = document.getElementById('songSearchInput').value.trim();

  if (query.length < 2) {
    document.getElementById('songResults').innerHTML = '';
    return;
  }

  songSearchTimeout = setTimeout(() => searchSongs(query), 300);
}

async function searchSongs(query) {
  const results = document.getElementById('songResults');
  try {
    const response = await fetch(`/api/songs-search.php?query=${encodeURIComponent(query)}&limit=30`);
    const songs = await response.json();

    if (!Array.isArray(songs) || songs.length === 0) {
      results.innerHTML = '<div class="empty-state">Keine Treffer.</div>';
      return;
    }

    results.innerHTML = songs.map((song) => `
      <div class="song-row">
        <div class="song-row-text">${escapeHtml(song.title)}${song.duo ? ' 👥' : ''} — <span class="artist">${escapeHtml(song.artist)}</span></div>
        <button class="btn-icon" title="Song löschen" onclick="deleteSong(${song.id}, '${escapeHtml(query).replace(/'/g, "\\'")}')">✕</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Song search error:', error);
    results.innerHTML = '<div class="empty-state">Suchfehler.</div>';
  }
}

async function deleteSong(id, query) {
  if (!confirm('Diesen Song aus dem Katalog löschen? Damit verschwinden auch alle Warteschlangen-Einträge dazu.')) return;

  try {
    const response = await fetch(`/api/songs-delete.php?id=${id}`, { method: 'DELETE' });
    const result = await response.json();

    if (result.success) {
      if (query) searchSongs(query);
      loadCatalogCount();
    } else {
      alert('Fehler: ' + result.error);
    }
  } catch (error) {
    console.error('Delete song error:', error);
    alert('Fehler beim Löschen');
  }
}

async function submitNewSong(e) {
  e.preventDefault();
  const feedback = document.getElementById('addSongFeedback');

  const payload = {
    title: document.getElementById('newTitle').value.trim(),
    artist: document.getElementById('newArtist').value.trim(),
    genre: document.getElementById('newGenre').value.trim(),
    year: document.getElementById('newYear').value.trim(),
    language: document.getElementById('newLanguage').value.trim(),
    duo: document.getElementById('newDuo').checked,
  };

  if (!payload.title || !payload.artist) {
    feedback.textContent = 'Titel und Künstler sind Pflicht.';
    feedback.className = 'feedback err';
    return;
  }

  try {
    const response = await fetch('/api/songs-add.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = `"${payload.title}" hinzugefügt.`;
      feedback.className = 'feedback ok';
      document.getElementById('addSongForm').reset();
      loadCatalogCount();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Add song error:', error);
    feedback.textContent = 'Fehler beim Hinzufügen.';
    feedback.className = 'feedback err';
  }
}

async function importCatalog() {
  const fileInput = document.getElementById('importFile');
  const feedback = document.getElementById('importFeedback');
  const btn = document.getElementById('importBtn');

  if (!fileInput.files.length) {
    feedback.textContent = 'Bitte zuerst eine CSV-Datei wählen.';
    feedback.className = 'feedback err';
    return;
  }

  const formData = new FormData();
  formData.append('csv', fileInput.files[0]);

  btn.disabled = true;
  feedback.textContent = 'Importiere - bei einem grossen Katalog dauert das etwas …';
  feedback.className = 'feedback';

  try {
    const response = await fetch('/api/songs-import.php', {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();

    if (result.success) {
      feedback.textContent = `${result.imported} neue Songs importiert (${result.skipped} bereits vorhanden/übersprungen), ${result.newly_review_explicit || 0} davon neu als "explizit" automatisch zur Prüfung markiert.`;
      feedback.className = 'feedback ok';
      fileInput.value = '';
      loadCatalogCount();
    } else {
      feedback.textContent = 'Fehler: ' + result.error;
      feedback.className = 'feedback err';
    }
  } catch (error) {
    console.error('Import error:', error);
    feedback.textContent = 'Fehler beim Import.';
    feedback.className = 'feedback err';
  } finally {
    btn.disabled = false;
  }
}

async function loadCatalogCount() {
  const el = document.getElementById('catalogCount');
  try {
    const response = await fetch('/api/songs-all.php?limit=1');
    const data = await response.json();
    el.textContent = `${data.total} Songs im Katalog`;
  } catch (error) {
    el.textContent = '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : text;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
