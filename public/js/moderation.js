let refreshInterval;
let lastNext = [];
let lastCurrent = null;
const expandedComments = new Set();
// Notiz-Bearbeitung (gleiches Prinzip wie im Admin-Panel): solange eine
// Notiz offen ist, rendert der 3s-Poll die Liste nicht neu, sonst würde das
// Textfeld mitten im Tippen ersetzt.
let editingCommentId = null;
let commentSaveTimeout = null;
let commentSavePromise = null;
let commentSaveFailed = false;
// null = noch keine Baseline geladen - erst ab dem zweiten Poll wird auf
// wirklich NEUE IDs geprüft, sonst würde jede bereits vorhandene Anmeldung
// beim Öffnen der Seite fälschlich einen Ton auslösen.
let knownNextIds = null;
const modNotifyPrefs = { sound: true, vibrate: false };

document.addEventListener('DOMContentLoaded', () => {
  checkLogin();
  setupThemeToggle();
  setupPasswordToggles();
  setupModNotifySettings();
  loadFooter();
});

/* ---------- Benachrichtigung bei neuer Anmeldung (Zahnrad-Menü) ---------- */

function setupModNotifySettings() {
  try {
    const stored = JSON.parse(localStorage.getItem('modNotifyPrefs') || '{}');
    Object.assign(modNotifyPrefs, stored);
  } catch (e) { /* localStorage evtl. nicht verfügbar */ }

  const soundCb = document.getElementById('modNotifySound');
  const vibrateCb = document.getElementById('modNotifyVibrate');
  if (soundCb) {
    soundCb.checked = modNotifyPrefs.sound;
    soundCb.addEventListener('change', () => {
      modNotifyPrefs.sound = soundCb.checked;
      saveModNotifyPrefs();
    });
  }
  if (vibrateCb) {
    // Vibration API existiert nicht auf iOS/Safari - Checkbox bleibt
    // sichtbar (Gerät kann wechseln), tut dort aber einfach nichts.
    vibrateCb.checked = modNotifyPrefs.vibrate;
    vibrateCb.addEventListener('change', () => {
      modNotifyPrefs.vibrate = vibrateCb.checked;
      saveModNotifyPrefs();
    });
  }
}

function saveModNotifyPrefs() {
  try {
    localStorage.setItem('modNotifyPrefs', JSON.stringify(modNotifyPrefs));
  } catch (e) { /* localStorage evtl. nicht verfügbar */ }
}

// Menü schliessen, wenn irgendwo ausserhalb geklickt wird (gleiches Muster
// wie das "⋮"-Menü in admin.js).
document.addEventListener('click', (e) => {
  document.querySelectorAll('.dropdown-wrap.open').forEach((wrap) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
});

function notifyNewSong() {
  if (modNotifyPrefs.sound) playNotifySound();
  if (modNotifyPrefs.vibrate && navigator.vibrate) navigator.vibrate([120, 60, 120]);
}

// Kurzer Beep per Web Audio API statt einer Audio-Datei - kein Asset-Upload
// nötig, funktioniert auch offline/ohne Netz.
function playNotifySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.18;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (error) {
    console.error('Notify sound error:', error);
  }
}

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

/* ---------- Theme / Passwort-Toggle (gleiches Muster wie admin.js) ---------- */

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
    const response = await fetch('/api/mod-check.php');
    const data = await response.json();

    if (data.loggedIn) {
      showModPanel();
      refreshQueue();
      refreshInterval = setInterval(refreshQueue, 3000);
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
  const password = document.getElementById('modPasswordInput').value;

  try {
    const response = await fetch('/api/mod-login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const result = await response.json();

    if (result.success) {
      document.getElementById('modPasswordInput').value = '';
      document.getElementById('loginError').textContent = '';
      showModPanel();
      refreshQueue();
      refreshInterval = setInterval(refreshQueue, 3000);
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
  document.getElementById('modPanel').style.display = 'none';
}

function showModPanel() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('modPanel').style.display = 'block';
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
    await fetch('/api/mod-logout.php', { method: 'POST' });
    clearInterval(refreshInterval);
    checkLogin();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

/* ---------- Queue ---------- */

async function refreshQueue() {
  try {
    const response = await fetch('/api/mod-queue.php');
    const data = await response.json();

    lastCurrent = data.current || null;
    lastNext = data.next || [];
    // Verwaiste IDs entfernen (Song ist inzwischen dran oder aus der Liste),
    // sonst wächst das Set über den ganzen Abend unbegrenzt.
    const validIds = new Set(lastNext.map((entry) => entry.id));
    [...expandedComments].forEach((id) => {
      if (!validIds.has(id)) expandedComments.delete(id);
    });

    // Ton/Vibration nur bei einer wirklich NEUEN ID seit dem letzten Poll -
    // nicht beim allerersten Laden der Seite (siehe knownNextIds-Kommentar).
    if (knownNextIds !== null) {
      const hasNewEntry = [...validIds].some((id) => !knownNextIds.has(id));
      if (hasNewEntry) notifyNewSong();
    }
    knownNextIds = validIds;

    if (editingCommentId === null) renderFromCache();
  } catch (error) {
    console.error('Refresh error:', error);
  }
}

function singerLine(entry) {
  // Bei Duetten sauberer Umbruch nach dem "&" statt beide Namen in einer
  // Zeile zusammenzuquetschen - v.a. in der schmalen "Als Nächstes"-Liste
  // sonst schwer lesbar/abgeschnitten.
  return entry.duet_first_name
    ? `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)} &<br>${escapeHtml(entry.duet_first_name)} ${escapeHtml(entry.duet_last_name)}`
    : `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)}`;
}

function renderCurrent(entry) {
  const slot = document.getElementById('currentSlot');

  if (!entry) {
    slot.innerHTML = '<div class="mod-empty">Aktuell singt niemand.</div>';
    return;
  }

  // Bei "Jetzt auf der Bühne" ist die Bemerkung direkt vollständig
  // sichtbar (kein Antippen nötig) - anders als bei "Als Nächstes", wo
  // Platz kostbarer ist und man erst beim Vorbereiten nachschaut. Ohne
  // Notiz nur ein dezenter "Notiz hinzufügen"-Link.
  const comment = entry.comment || editingCommentId === entry.id
    ? renderCommentArea(entry, true)
    : `<button type="button" class="mod-comment-add" onclick="startCommentEdit(${entry.id})">＋ Notiz hinzufügen</button>`;

  slot.innerHTML = `
    <div class="mod-current">
      <p class="mod-current-label">Jetzt auf der Bühne</p>
      <p class="mod-current-title">${escapeHtml(entry.title)}</p>
      <div class="mod-current-row">
        <span class="mod-current-artist">${escapeHtml(entry.artist)}</span>
        <span class="mod-current-singer">🎤 ${singerLine(entry)}</span>
      </div>
      ${comment}
    </div>
  `;
}

function renderNext(entries) {
  const list = document.getElementById('nextList');

  if (!entries.length) {
    list.innerHTML = '<div class="mod-empty">Keine weiteren Anmeldungen.</div>';
    return;
  }

  list.innerHTML = entries.map((entry, index) => {
    const isEditing = editingCommentId === entry.id;
    const isExpanded = expandedComments.has(entry.id) || isEditing;
    // Streifen rechts gibt es jetzt immer: "i" klappt eine vorhandene Notiz
    // auf, "+" öffnet direkt die Bearbeitung für eine neue Notiz.
    const infoBtn = entry.comment
      ? `<button class="mod-info-btn ${isExpanded ? 'active' : ''}" onclick="toggleComment(${entry.id})" aria-label="Bemerkung anzeigen">i</button>`
      : `<button class="mod-info-btn mod-info-btn-add ${isEditing ? 'active' : ''}" onclick="startCommentEdit(${entry.id})" aria-label="Notiz hinzufügen">+</button>`;
    const comment = entry.comment || isEditing
      ? renderCommentArea(entry, isExpanded)
      : '';

    return `
      <div class="mod-item">
        ${infoBtn}
        <div class="mod-item-row">
          <div class="mod-item-pos">${index + 1}</div>
          <div class="mod-item-body">
            <div class="mod-item-title">${escapeHtml(entry.title)}</div>
            <div class="mod-item-meta">
              <span class="mod-item-artist">${escapeHtml(entry.artist)}</span>
              <span class="mod-item-singer">${singerLine(entry)}</span>
            </div>
          </div>
        </div>
        ${comment}
      </div>
    `;
  }).join('');
}

function renderFromCache() {
  renderCurrent(lastCurrent);
  renderNext(lastNext);
}

function renderCommentArea(entry, expanded) {
  if (editingCommentId === entry.id) {
    return `
      <div class="mod-comment expanded mod-comment-editing">
        <textarea id="commentEditInput" rows="3" placeholder="Notiz für die Moderation …" oninput="scheduleCommentSave(${entry.id})">${escapeHtml(entry.comment || '')}</textarea>
        <div class="mod-comment-edit-footer">
          <span class="comment-save-status" id="commentSaveStatus"></span>
          <button type="button" class="mod-comment-done" onclick="finishCommentEdit()">Fertig</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="mod-comment ${expanded ? 'expanded' : ''}">
      <div class="mod-comment-text">${escapeHtml(entry.comment)}</div>
      <button type="button" class="mod-comment-edit-btn" onclick="startCommentEdit(${entry.id})">✎ Bearbeiten</button>
    </div>
  `;
}

/* ---------- Notiz bearbeiten ---------- */

async function startCommentEdit(id) {
  if (editingCommentId !== null && editingCommentId !== id) {
    // Andere Notiz noch offen - erst sauber speichern/schliessen
    if (!(await flushPendingCommentSave())) return;
  }
  editingCommentId = id;
  commentSavePromise = null;
  commentSaveFailed = false;
  // Nach "Fertig" bleibt die Notiz aufgeklappt sichtbar
  expandedComments.add(id);
  renderFromCache();

  const input = document.getElementById('commentEditInput');
  if (input) {
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  }
}

async function finishCommentEdit() {
  // Bei Speicherfehler offen lassen, damit der Text nicht verloren geht
  if (!(await flushPendingCommentSave())) return;
  editingCommentId = null;
  commentSavePromise = null;
  renderFromCache();
}

// Auto-Save wie im Admin-Panel: 700ms nach dem letzten Tastendruck.
function scheduleCommentSave(id) {
  clearTimeout(commentSaveTimeout);
  setCommentSaveStatus('Speichert …', 'pending');
  commentSaveTimeout = setTimeout(() => {
    commentSaveTimeout = null;
    const input = document.getElementById('commentEditInput');
    if (input) commentSavePromise = saveCommentNow(id, input.value);
  }, 700);
}

// Noch ausstehendes (oder fehlgeschlagenes) Auto-Save sofort ausführen bzw.
// ein laufendes abwarten. Liefert false, wenn das Speichern fehlschlägt.
async function flushPendingCommentSave() {
  const input = document.getElementById('commentEditInput');
  if (commentSaveTimeout !== null || commentSaveFailed) {
    clearTimeout(commentSaveTimeout);
    commentSaveTimeout = null;
    if (input) commentSavePromise = saveCommentNow(editingCommentId, input.value);
  }
  return commentSavePromise ? commentSavePromise : true;
}

function setCommentSaveStatus(text, state) {
  const statusEl = document.getElementById('commentSaveStatus');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'comment-save-status' + (state ? ` ${state}` : '');
}

async function saveCommentNow(id, rawText) {
  const comment = rawText.trim();

  try {
    const response = await fetch(`/api/queue-comment.php?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    });
    const result = await response.json();

    if (!result.success) {
      commentSaveFailed = true;
      setCommentSaveStatus('Fehler: ' + (result.error || 'Speichern fehlgeschlagen'), 'error');
      return false;
    }
    commentSaveFailed = false;

    // Lokal mitschreiben, damit ein Zwischen-Poll nicht den alten Stand
    // zurückspiegelt, bevor die Liste wieder neu gerendert wird.
    [lastCurrent, ...lastNext].forEach((entry) => {
      if (entry && entry.id === id) entry.comment = comment || null;
    });
    setCommentSaveStatus('Gespeichert', '');
    return true;
  } catch (error) {
    console.error('Comment save error:', error);
    commentSaveFailed = true;
    setCommentSaveStatus('Fehler beim Speichern', 'error');
    return false;
  }
}

async function toggleComment(id) {
  if (editingCommentId !== null) {
    await finishCommentEdit();
    if (editingCommentId !== null) return;
  }
  if (expandedComments.has(id)) {
    expandedComments.delete(id);
  } else {
    expandedComments.add(id);
  }
  // Aus dem Cache statt neu vom Server - der Aufklapp-Zustand muss auch
  // den naechsten 3s-Poll ueberleben, sonst klappt die Bemerkung waehrend
  // des Lesens wieder zu.
  renderNext(lastNext);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : text;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
