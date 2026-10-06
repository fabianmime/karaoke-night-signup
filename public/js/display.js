// Auto-refresh display every 2 seconds
let showVotes = false;
let hasLoadedOnce = false;
let lastAnnouncedPlayingId = null;
let spotlightHideTimeout = null;
let layoutChangeTimeout = null;

// Ab dieser Breite (px) ist genug Platz für das "Jetzt auf der Bühne"-Panel
// links neben der Liste, ohne dass der breitere Container (siehe .wide in
// display.html) zu gedrängt wirkt - die Grössen richten sich nach der
// Bildschirmgrösse (--u), passt also bei allen 16:9-Auflösungen ab 720p,
// fällt nur bei kleinen Fenstern weg und zeigt dann nur die zentrierte Liste.
const SPLIT_MIN_WIDTH = 1200;
// Wie lange das Vollbild-Spotlight bei einem Sängerwechsel stehen bleibt,
// bevor es wieder ausblendet, ist pro Display über die Toolbar einstellbar
// (displayPrefs.durationSec) - das hier sind die Auswahlmöglichkeiten.
const SPOTLIGHT_DURATION_OPTIONS_SEC = [5, 8, 10, 15, 20, 30, 45, 60];

// Display-Einstellungen aus der Toolbar (wie Planning Center Live): gelten
// nur für diesen Browser, darum localStorage statt Server-Setting - so
// können z.B. Beamer und Bühnenmonitor unterschiedliche Ansichten zeigen.
// "queue" = Warteschlange wie bisher, "banner" = immer das Vollbild-Banner,
// bei Songwechsel blendet das Spotlight darüber ein und wieder aus.
const DISPLAY_PREFS_KEY = 'karaokeDisplayPrefs';
const DISPLAY_LAYOUTS = ['queue', 'banner'];
const DEFAULT_DISPLAY_PREFS = { layout: 'queue', durationSec: 5 };
// Toolbar erscheint, sobald die Maus so nah am oberen Rand ist, und
// verschwindet nach dieser Zeit ohne Bewegung darüber wieder.
const TOOLBAR_REVEAL_ZONE_PX = 90;
const TOOLBAR_HIDE_DELAY_MS = 2500;
const CURSOR_HIDE_DELAY_MS = 3000;

let displayPrefs = loadDisplayPrefs();
// Admin-/Companion-"Standbild" (banner_mode). Hat immer Vorrang: Banner
// ohne Song-Einblendungen, egal welche Ansicht hier gewählt ist.
let serverBannerMode = false;
let currentPlayingEntry = null;
let toolbarHideTimeout = null;
let cursorHideTimeout = null;
// Der eigentliche Layout-Wechsel (Panel einblenden, Liste nach rechts
// schieben) wird bei einem Sängerwechsel erst nach dieser Verzögerung
// angewendet - lange genug, dass das Vollbild-Spotlight (0.6s Einblend-
// Transition) längst deckend ist. So sieht das Publikum nie den Sprung
// selbst, nur das fertige Layout, sobald das Spotlight wieder wegblendet.
const LAYOUT_CHANGE_DELAY_MS = 900;
// Auf dem Display nur die nächsten paar Songs, dafür gross und vom Publikum
// gut lesbar - der Rest erscheint als "... und N weitere".
const DISPLAY_MAX_SONGS = 8;
// Skalierungsbereich für fitDisplayToViewport(): bei wenigen Songs wird bis
// MAX vergrössert, bei knappem Platz (z.B. Mitteilung aktiv) bis MIN
// verkleinert - darunter wäre die Schrift nicht mehr lesbar.
const MIN_STAGE_SCALE = 0.55;
const MAX_STAGE_SCALE = 1.4;
let resizeFitTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  initDisplayToolbar();
  applyViewMode();
  refreshDisplay();
  refreshAnnouncement();
  setInterval(refreshDisplay, 2000);
  setInterval(refreshAnnouncement, 5000);
});

window.addEventListener('resize', () => {
  clearTimeout(resizeFitTimeout);
  resizeFitTimeout = setTimeout(fitDisplayToViewport, 150);
});

// Header und Liste werden per CSS-Variable (--stage-scale, siehe
// display.html) so gross wie möglich gemacht, ohne dass gescrollt werden
// muss: Start beim Maximum, dann so weit verkleinern, bis alles passt. Läuft
// in mehreren kleinen Schritten, weil sich durch kleinere Schrift auch
// Zeilenumbrüche/Höhen nochmal ändern können.
function fitDisplayToViewport() {
  const container = document.getElementById('displayContainer');
  if (!container || container.offsetParent === null) return; // z.B. Banner-Modus aktiv

  let scale = MAX_STAGE_SCALE;
  container.style.setProperty('--stage-scale', String(scale));

  for (let i = 0; i < 6; i++) {
    const availableHeight = window.innerHeight - container.getBoundingClientRect().top;
    const neededHeight = container.scrollHeight;

    if (neededHeight <= availableHeight + 1 || scale <= MIN_STAGE_SCALE) {
      break;
    }

    const ratio = availableHeight / neededHeight;
    scale = Math.max(MIN_STAGE_SCALE, scale * ratio * 0.97);
    container.style.setProperty('--stage-scale', String(scale));
  }
}

async function refreshAnnouncement() {
  try {
    const response = await fetch('/api/settings-public.php');
    const data = await response.json();

    if (window.karaokeApplyBranding) window.karaokeApplyBranding(data);
    serverBannerMode = !!data.banner_mode;
    applyViewMode();
    showVotes = !!data.show_votes_on_display;

    const banner = document.getElementById('announcementBanner');
    if (data.announcement) {
      banner.textContent = data.announcement;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }

    // Banner ein-/ausgeblendet oder Mitteilung geändert ändert die
    // verfügbare Höhe für die Liste - neu einpassen.
    fitDisplayToViewport();

    document.getElementById('ctFooter').innerHTML = data.footer_html || '';
  } catch (error) {
    console.error('Announcement error:', error);
  }
}

async function refreshDisplay() {
  try {
    const response = await fetch('/api/queue-current.php');
    const queue = await response.json();

    const playingEntry = queue.find((entry) => entry.status === 'playing') || null;
    currentPlayingEntry = playingEntry;
    // Genug Platz nur bei breitem Bildschirm UND wenn es überhaupt ein
    // "Jetzt auf der Bühne" gibt - sonst bleibt die Liste einfach zentriert,
    // exakt wie vorher.
    const canSplit = !!playingEntry && window.innerWidth >= SPLIT_MIN_WIDTH;
    const id = playingEntry ? playingEntry.id : null;
    const isNewPlaying = hasLoadedOnce && !!id && id !== lastAnnouncedPlayingId;

    if (isNewPlaying) {
      showSpotlight(playingEntry);
      // Bis der verzögerte Wechsel greift, bleibt Liste/Panel unverändert
      // stehen (deckt das Spotlight ohnehin ab) - kein renderQueueList()/
      // renderNowPlayingPanel() hier, sonst würde der Sprung schon vor dem
      // Spotlight sichtbar.
      clearTimeout(layoutChangeTimeout);
      layoutChangeTimeout = setTimeout(() => applyStageContent(queue, playingEntry, canSplit), LAYOUT_CHANGE_DELAY_MS);
    } else {
      // Kein Sängerwechsel gerade unterwegs - laufend aktuell halten (z.B.
      // Stimmenzahl, neue Anmeldungen, oder eine Fenstergrössenänderung).
      clearTimeout(layoutChangeTimeout);
      applyStageContent(queue, playingEntry, canSplit);
    }

    lastAnnouncedPlayingId = id;
    hasLoadedOnce = true;
  } catch (error) {
    console.error('Display refresh error:', error);
  }
}

function applyStageContent(queue, playingEntry, canSplit) {
  // Im Split-Modus taucht der spielende Song separat im Panel auf, darum
  // aus der Liste raus (sonst doppelt) - ohne Split bleibt er wie bisher
  // inline mit .playing-Hervorhebung in der Liste.
  const listEntries = canSplit ? queue.filter((entry) => entry.status !== 'playing') : queue;

  renderQueueList(listEntries);
  renderNowPlayingPanel(playingEntry, canSplit);
  document.getElementById('stageLayout').classList.toggle('split', canSplit);
  // Container wird breiter statt die Liste zu stauchen - sie bleibt dadurch
  // immer exakt gleich breit, egal ob jemand spielt oder nicht, und rückt
  // nur als Ganzes nach rechts (siehe .wide in display.html).
  document.getElementById('displayContainer').classList.toggle('wide', canSplit);
  fitDisplayToViewport();
}

function renderQueueList(queue) {
  const displayDiv = document.getElementById('queueDisplay');

  if (queue.length === 0) {
    displayDiv.innerHTML = '<div class="empty">Keine Anmeldungen...</div>';
    return;
  }

  let html = '';
  queue.slice(0, DISPLAY_MAX_SONGS).forEach((entry, index) => {
    const isPlaying = entry.status === 'playing';
    const singers = entry.duet_first_name
      ? `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)} & ${escapeHtml(entry.duet_first_name)} ${escapeHtml(entry.duet_last_name)}`
      : `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)}`;
    const votesLine = showVotes ? `<p class="votes">🗳️ ${entry.votes || 0} Votes</p>` : '';

    html += `
      <div class="queue-item ${isPlaying ? 'playing' : ''}">
        <div class="position-badge">${index + 1}</div>
        <div class="queue-item-content">
          <div class="title-row">
            <div class="song-info">
              <p class="song-title">${escapeHtml(entry.title)}</p>
              <p class="artist">${escapeHtml(entry.artist)}</p>
            </div>
            <div class="singer-col">
              <p class="singer">🎤 ${singers}</p>
              ${votesLine}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  const hiddenCount = queue.length - DISPLAY_MAX_SONGS;
  if (hiddenCount > 0) {
    html += `<p class="queue-more">… und ${hiddenCount} ${hiddenCount === 1 ? 'weiterer Song' : 'weitere Songs'}</p>`;
  }

  displayDiv.innerHTML = html;
}

function renderNowPlayingPanel(entry, active) {
  const panel = document.getElementById('nowPlayingPanel');

  if (!active || !entry) {
    panel.classList.remove('active');
    panel.innerHTML = '';
    return;
  }

  panel.classList.add('active');

  const singers = entry.duet_first_name
    ? `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)} & ${escapeHtml(entry.duet_first_name)} ${escapeHtml(entry.duet_last_name)}`
    : `${escapeHtml(entry.first_name)} ${escapeHtml(entry.last_name)}`;
  const votesLine = showVotes ? `<p class="now-playing-votes">🗳️ ${entry.votes || 0} Votes</p>` : '';

  panel.innerHTML = `
    <p class="now-playing-eyebrow"><span class="dot"></span>Jetzt auf der Bühne</p>
    <h2 class="now-playing-title">${escapeHtml(entry.title)}</h2>
    <p class="now-playing-artist">${escapeHtml(entry.artist)}</p>
    <p class="now-playing-singer">🎤 ${singers}</p>
    ${votesLine}
  `;
}

function showSpotlight(entry, { force = false } = {}) {
  // Nicht überlagern, solange Admin/Companion das Standbild aktiviert hat -
  // das soll wirklich stehen bleiben. Die Ansicht "Banner + Song-
  // Einblendung" zeigt zwar auch das Banner, blendet aber bewusst ein.
  // force: "Einblendung testen" in der Toolbar soll immer etwas zeigen.
  if (serverBannerMode && !force) return;

  // Kein escapeHtml() nötig: alle drei Felder werden unten per .textContent
  // gesetzt (nicht innerHTML), das ist bereits XSS-sicher. escapeHtml()
  // liefert HTML-Entities (z.B. "&#39;") zurück, die bei .textContent nicht
  // wieder decodiert würden - Namen mit Apostroph ("O'Brien") würden sonst
  // sichtbar kaputt auf dem Display erscheinen.
  const singers = entry.duet_first_name
    ? `${entry.first_name} ${entry.last_name} & ${entry.duet_first_name} ${entry.duet_last_name}`
    : `${entry.first_name} ${entry.last_name}`;

  document.getElementById('spotlightTitle').textContent = entry.title;
  document.getElementById('spotlightArtist').textContent = entry.artist;
  document.getElementById('spotlightSinger').textContent = `Gesungen von ${singers}`;

  const overlay = document.getElementById('stageSpotlight');
  overlay.classList.add('show');

  clearTimeout(spotlightHideTimeout);
  spotlightHideTimeout = setTimeout(() => {
    overlay.classList.remove('show');
  }, displayPrefs.durationSec * 1000);
}

// Banner im Vollbild, wenn Admin das Standbild aktiviert hat ODER dieses
// Display auf "Banner + Song-Einblendung" steht - sonst die Warteschlange.
function applyViewMode() {
  const showBanner = serverBannerMode || displayPrefs.layout === 'banner';
  document.getElementById('normalView').style.display = showBanner ? 'none' : 'block';
  document.getElementById('bannerView').style.display = showBanner ? 'block' : 'none';
  document.getElementById('toolbarNote').textContent = serverBannerMode
    ? 'Standbild aktiv (Admin) – keine Song-Einblendungen'
    : '';
  if (!showBanner) fitDisplayToViewport();
}

// Gespeicherte Einstellungen dieses Browsers, optional per URL übersteuert
// (z.B. /display?ansicht=banner&dauer=10 für Kiosk-/OBS-Browser ohne Maus) -
// URL-Werte werden bewusst nicht gespeichert.
function loadDisplayPrefs() {
  const prefs = { ...DEFAULT_DISPLAY_PREFS };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY)) || {});
  } catch (error) {
    // localStorage gesperrt/leer - Defaults reichen
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has('ansicht')) prefs.layout = params.get('ansicht');
  if (params.has('dauer')) prefs.durationSec = Number(params.get('dauer'));

  if (!DISPLAY_LAYOUTS.includes(prefs.layout)) prefs.layout = DEFAULT_DISPLAY_PREFS.layout;
  if (!(prefs.durationSec >= 1 && prefs.durationSec <= 600)) prefs.durationSec = DEFAULT_DISPLAY_PREFS.durationSec;
  return prefs;
}

function saveDisplayPrefs() {
  try {
    localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(displayPrefs));
  } catch (error) {
    // Nicht speicherbar (z.B. privates Fenster) - gilt dann nur bis zum Reload
  }
}

function initDisplayToolbar() {
  const toolbar = document.getElementById('displayToolbar');
  const layoutSelect = document.getElementById('layoutSelect');
  const durationSelect = document.getElementById('durationSelect');

  // Per URL gesetzte Sonderdauer (nicht in der Liste) trotzdem anzeigen
  const durations = [...new Set([...SPOTLIGHT_DURATION_OPTIONS_SEC, displayPrefs.durationSec])].sort((a, b) => a - b);
  durationSelect.innerHTML = durations
    .map((sec) => `<option value="${sec}">${sec} Sekunden</option>`)
    .join('');

  layoutSelect.value = displayPrefs.layout;
  durationSelect.value = String(displayPrefs.durationSec);

  layoutSelect.addEventListener('change', () => {
    displayPrefs.layout = layoutSelect.value;
    saveDisplayPrefs();
    applyViewMode();
    layoutSelect.blur();
  });
  durationSelect.addEventListener('change', () => {
    displayPrefs.durationSec = Number(durationSelect.value);
    saveDisplayPrefs();
    durationSelect.blur();
  });
  document.getElementById('spotlightTestBtn').addEventListener('click', () => {
    showSpotlight(currentPlayingEntry || {
      title: 'Beispiel-Song',
      artist: 'Beispiel-Interpret',
      first_name: 'Max',
      last_name: 'Muster',
    }, { force: true });
  });

  // Vollbild per Button (Browser erlaubt das nur nach einem Klick, nicht
  // automatisch beim Laden). Beschriftung folgt auch einem Verlassen per Esc.
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const updateFullscreenBtn = () => {
    fullscreenBtn.textContent = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild';
  };
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    fullscreenBtn.blur();
  });
  document.addEventListener('fullscreenchange', updateFullscreenBtn);

  const scheduleHide = () => {
    clearTimeout(toolbarHideTimeout);
    toolbarHideTimeout = setTimeout(() => {
      // Offen lassen, solange die Maus drauf ist oder ein Dropdown offen ist
      if (toolbar.matches(':hover') || toolbar.matches(':focus-within')) {
        scheduleHide();
        return;
      }
      toolbar.classList.remove('visible');
    }, TOOLBAR_HIDE_DELAY_MS);
  };
  const reveal = () => {
    toolbar.classList.add('visible');
    scheduleHide();
  };

  document.addEventListener('mousemove', (event) => {
    document.body.classList.remove('cursor-hidden');
    clearTimeout(cursorHideTimeout);
    cursorHideTimeout = setTimeout(() => {
      if (!toolbar.classList.contains('visible')) document.body.classList.add('cursor-hidden');
    }, CURSOR_HIDE_DELAY_MS);

    if (event.clientY <= TOOLBAR_REVEAL_ZONE_PX) reveal();
  });
  document.addEventListener('touchstart', (event) => {
    if (event.touches[0] && event.touches[0].clientY <= TOOLBAR_REVEAL_ZONE_PX) reveal();
  }, { passive: true });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
