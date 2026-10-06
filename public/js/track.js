// Anonyme Nutzungsstatistik (Auswertung unter /stats). Wird per
// <script src="/js/track.js" data-page="..."> VOR dem Seiten-Skript geladen
// und stellt window.KaraokeStats bereit. Alles hier ist "best effort": ein
// Fehler oder eine fehlende Statistik-Tabelle darf die Seite nie stören.
(function () {
  const script = document.currentScript;
  const page = script ? script.dataset.page : '';
  const HEARTBEAT_MS = 30000;
  // Suchbegriffe erst nach dieser Tipp-Pause zählen - sonst landen "qu",
  // "que", "quee" als eigene Begriffe in der Rangliste (die Suche selbst
  // läuft schon während des Tippens, siehe guest.js).
  const SEARCH_IDLE_MS = 2000;

  function randomId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const visit = randomId();

  function send(payload, useBeacon) {
    const body = JSON.stringify(Object.assign({ visit }, payload));
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon('/api/stats-track.php', body);
        return;
      }
      fetch('/api/stats-track.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* Statistik ist optional */ }
  }

  // Seitenaufruf + Heartbeat (nur solange der Tab sichtbar ist - ein Handy
  // in der Hosentasche mit offenem Tab zählt so nicht stundenlang als
  // "online").
  let heartbeatTimer = null;
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => send({ type: 'heartbeat' }), HEARTBEAT_MS);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (page) {
    const source = new URLSearchParams(location.search).get('src') || '';
    send({ type: 'pageview', page, source, touch: navigator.maxTouchPoints > 1 });
    if (document.visibilityState !== 'hidden') startHeartbeat();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushSearch(true);
        send({ type: 'heartbeat' }, true);
        stopHeartbeat();
      } else {
        send({ type: 'heartbeat' });
        startHeartbeat();
      }
    });
    window.addEventListener('pagehide', () => {
      flushSearch(true);
      send({ type: 'heartbeat' }, true);
    });
  }

  // Suche: pro Eingabe nur den "fertigen" Begriff zählen - nach einer
  // Tipp-Pause, beim Antippen eines Treffers oder beim Verlassen der Seite.
  let pendingSearch = null;
  let lastLoggedTerm = '';
  let searchTimer = null;

  function flushSearch(useBeacon) {
    clearTimeout(searchTimer);
    if (!pendingSearch) return;
    const { term, results } = pendingSearch;
    pendingSearch = null;
    if (term === lastLoggedTerm) return;
    lastLoggedTerm = term;
    send({ type: 'search', term, results }, useBeacon);
  }

  window.KaraokeStats = {
    // Wird nach jeder angezeigten Trefferliste aufgerufen.
    searchResults(term, results) {
      pendingSearch = { term: term.trim().toLowerCase(), results };
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => flushSearch(false), SEARCH_IDLE_MS);
    },
    // Suchfeld geleert/zu kurz - angefangene Eingabe verwerfen.
    searchCleared() {
      clearTimeout(searchTimer);
      pendingSearch = null;
    },
    event(type, data) {
      if (type === 'song_select') flushSearch(false);
      send(Object.assign({ type }, data || {}));
    },
  };
})();
