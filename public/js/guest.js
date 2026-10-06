let selectedSongId = null;
let selectedSongIsDuo = false;
let searchTimeout;
let registrationLocked = false;
let votingLocked = false;
let votesRemaining = 3;

// Event Listeners
document.getElementById('searchInput').addEventListener('input', debounceSearch);
document.getElementById('registrationForm').addEventListener('submit', submitForm);
document.getElementById('goRegisterBtn').addEventListener('click', goToRegister);
document.getElementById('goVoteBtn').addEventListener('click', goToVote);
document.getElementById('backFromSearchBtn').addEventListener('click', showHome);
document.getElementById('backFromVoteBtn').addEventListener('click', showHome);
document.getElementById('votingList').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-vote');
  if (!btn || btn.disabled) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.action === 'remove') {
    removeVote(id);
  } else {
    castVote(id);
  }
});

// Rote Markierung verschwindet wieder, sobald am Feld weitergetippt wird.
document.getElementById('registrationForm').addEventListener('input', (e) => {
  if (!e.target.classList.contains('field-invalid')) return;
  e.target.classList.remove('field-invalid');
  const errorEl = e.target.closest('.form-group')?.querySelector('.field-error-text');
  if (errorEl) errorEl.remove();
});

// Formatiert die Telefonnummer schon beim Verlassen des Feldes (nicht erst
// bei "input", das würde beim Tippen mitten im Wort den Cursor springen
// lassen) - der Gast sieht so direkt, wie die Nummer abgeschickt wird,
// statt das erst nach dem Absenden im Admin zu erfahren.
document.getElementById('phone').addEventListener('blur', (e) => {
  const value = e.target.value.trim();
  if (!value) return;
  e.target.value = normalizeSwissPhone(value);
});

// Delegierter Klick-Handler statt onclick mit eingebetteten Songtiteln:
// Titel mit Apostroph (z.B. "Don't Stop Believin'") haben den alten
// inline-onclick-String gesprengt - die Auswahl blieb dann stumm hängen.
document.getElementById('searchResults').addEventListener('click', (e) => {
  const item = e.target.closest('.song-item');
  if (!item) return;
  if (item.dataset.blocked === '1') {
    showBlockMessage('Dieser Song ist durch die Moderation gesperrt.');
    return;
  }
  if (item.dataset.registered === '1') {
    showBlockMessage('Dieser Song wurde bereits ausgewählt. Bitte wähle einen anderen.');
    return;
  }
  selectSong(Number(item.dataset.id), item.dataset.title, item.dataset.artist, item.dataset.duo === '1');
});

document.addEventListener('DOMContentLoaded', () => {
  checkLocks();
  loadFooter();
  // Alle paar Sekunden erneut prüfen - eine Sperre muss auch mitten in einer
  // laufenden Anmeldung/eines laufenden Votings sofort greifen, nicht erst
  // beim nächsten Laden.
  setInterval(checkLocks, 4000);
  // Songliste/Stimmen aktuell halten, solange die Voting-Ansicht offen ist
  // (z.B. wenn zwischenzeitlich ein weiterer Song genehmigt wird).
  setInterval(() => {
    if (document.getElementById('votingSection').style.display !== 'none') {
      loadVotingList();
    }
  }, 5000);
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

async function checkLocks() {
  try {
    const response = await fetch('/api/settings-public.php');
    const data = await response.json();
    const isLocked = !!data.registration_locked;
    const isVotingLocked = !!data.voting_locked;

    if (isLocked && !registrationLocked) {
      applyLock();
    } else if (!isLocked && registrationLocked) {
      releaseLock();
    }
    registrationLocked = isLocked;

    if (isVotingLocked && !votingLocked) {
      applyVotingLock();
    } else if (!isVotingLocked && votingLocked) {
      releaseVotingLock();
    }
    votingLocked = isVotingLocked;

    // Ist auf der Startauswahl nur einer der beiden Bereiche gesperrt, gleich
    // in den jeweils anderen (noch offenen) springen - sonst müsste man erst
    // die falsche Option antippen, nur um dort die Sperr-Meldung zu sehen.
    // Sind beide gesperrt (oder keiner), bleibt die normale Auswahl stehen.
    const onHome = document.getElementById('homeChoice').style.display !== 'none';
    if (onHome) {
      if (registrationLocked && !votingLocked) {
        goToVote();
      } else if (votingLocked && !registrationLocked) {
        goToRegister();
      }
    }
    updateBackButtonsVisibility();

    const banner = document.getElementById('announcementBanner');
    if (data.announcement) {
      banner.textContent = data.announcement;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  } catch (error) {
    console.error('Lock check error:', error);
  }
}

// Wurde man automatisch in den einzig offenen Bereich geschickt (siehe oben
// in checkLocks()), gäbe es hinter "← Zurück" nur die Startauswahl, die
// sofort wieder hierhin zurückschicken würde - der Button macht dann keinen
// Sinn und wird ausgeblendet. Sind beide oder keiner gesperrt, bleibt er wie
// gewohnt sichtbar (Startauswahl ist dann eine echte Wahl).
function updateBackButtonsVisibility() {
  const onlyRegistrationOpen = votingLocked && !registrationLocked;
  const onlyVotingOpen = registrationLocked && !votingLocked;
  document.getElementById('backFromSearchBtn').style.display = onlyRegistrationOpen ? 'none' : 'inline-block';
  document.getElementById('backFromVoteBtn').style.display = onlyVotingOpen ? 'none' : 'inline-block';
}

function applyLock() {
  // Bricht eine gerade laufende Anmeldung sofort ab (Suche, ausgewählter
  // Song, offenes Formular) und zeigt stattdessen den Sperr-Hinweis - aber
  // nur, wenn der Gast gerade wirklich mitten in der Anmeldung war. Wer auf
  // der Startauswahl steht oder gerade votet, soll davon nicht unterbrochen
  // werden (Voting ist unabhängig von der Anmeldesperre).
  const wasRegistering = ['searchSection', 'selectedSongSection', 'formSection']
    .some((id) => document.getElementById(id).style.display !== 'none');

  if (wasRegistering) {
    hideAllSections();
    document.getElementById('lockedMessage').style.display = 'block';
  }

  selectedSongId = null;
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
}

function releaseLock() {
  if (document.getElementById('lockedMessage').style.display !== 'none') {
    showHome();
  }
}

// Analog zu applyLock()/releaseLock(), aber unabhängig davon - eine
// Anmeldesperre soll das Voten nicht unterbrechen und umgekehrt.
function applyVotingLock() {
  const wasVoting = document.getElementById('votingSection').style.display !== 'none';
  if (wasVoting) {
    hideAllSections();
    document.getElementById('votingLockedMessage').style.display = 'block';
  }
}

function releaseVotingLock() {
  if (document.getElementById('votingLockedMessage').style.display !== 'none') {
    showHome();
  }
}

function hideAllSections() {
  ['homeChoice', 'searchSection', 'selectedSongSection', 'formSection', 'votingSection', 'lockedMessage', 'votingLockedMessage']
    .forEach((id) => { document.getElementById(id).style.display = 'none'; });
  document.getElementById('songTakenMessage').style.display = 'none';
}

function showHome() {
  hideAllSections();
  document.getElementById('homeChoice').style.display = 'block';
}

function goToRegister() {
  hideAllSections();
  window.KaraokeStats?.event('choose_register');
  if (registrationLocked) {
    document.getElementById('lockedMessage').style.display = 'block';
    return;
  }
  document.getElementById('searchSection').style.display = 'block';
  document.getElementById('searchInput').focus();
}

function goToVote() {
  hideAllSections();
  window.KaraokeStats?.event('choose_vote');
  if (votingLocked) {
    document.getElementById('votingLockedMessage').style.display = 'block';
    return;
  }
  document.getElementById('votingSection').style.display = 'block';
  loadVotingList();
}

function showBlockMessage(message) {
  const el = document.getElementById('songTakenMessage');
  el.textContent = message;
  el.style.display = 'block';
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  const query = document.getElementById('searchInput').value.trim();

  if (registrationLocked || query.length < 2) {
    document.getElementById('searchResults').innerHTML = '';
    window.KaraokeStats?.searchCleared();
    return;
  }

  searchTimeout = setTimeout(() => searchSongs(query), 300);
}

async function searchSongs(query) {
  if (registrationLocked) return;

  document.getElementById('songTakenMessage').style.display = 'none';

  try {
    const response = await fetch(`/api/songs-search.php?query=${encodeURIComponent(query)}`);
    const songs = await response.json();

    if (!Array.isArray(songs)) {
      document.getElementById('searchResults').innerHTML = '<p>Fehler bei der Suche</p>';
      return;
    }

    let html = '';
    songs.forEach(song => {
      // "blocked" hat Vorrang vor "bereits angemeldet" - eine gesperrte
      // Anmeldung kann es normalerweise gar nicht geben, ausser der Song
      // wurde erst nachträglich (nach einer bestehenden Anmeldung) gesperrt.
      const dimClass = (song.blocked || song.registered) ? ' taken' : '';
      const hint = song.blocked ? ' · gesperrt' : (song.registered ? ' · bereits angemeldet' : '');
      html += `
        <div class="song-item${dimClass}" data-id="${song.id}" data-title="${escapeHtml(song.title)}" data-artist="${escapeHtml(song.artist)}" data-duo="${song.duo ? 1 : 0}" data-registered="${song.registered ? 1 : 0}" data-blocked="${song.blocked ? 1 : 0}">
          <h4>${escapeHtml(song.title)}${song.duo ? ' 👥' : ''}</h4>
          <p>${escapeHtml(song.artist)}</p>
          <p style="font-size: 0.8em; color: #999;">${song.genre || ''} • ${song.year || ''}${hint}</p>
        </div>
      `;
    });

    document.getElementById('searchResults').innerHTML = html;
    // Gezählt wird erst nach einer Tipp-Pause (siehe track.js), nicht jede
    // Zwischeneingabe.
    window.KaraokeStats?.searchResults(query, songs.length);
  } catch (error) {
    console.error('Search error:', error);
    document.getElementById('searchResults').innerHTML = '<p>Suchfehler - bitte später versuchen</p>';
  }
}

function selectSong(songId, title, artist, isDuo) {
  if (registrationLocked) return;

  selectedSongId = songId;
  selectedSongIsDuo = !!isDuo;
  window.KaraokeStats?.event('song_select', { song_id: songId });

  // Suchbereich ausblenden - Rücksprung nur noch über "Song wechseln"
  document.getElementById('searchSection').style.display = 'none';
  document.getElementById('searchResults').innerHTML = '';

  // Show selected song
  document.getElementById('selectedSongSection').style.display = 'block';
  document.getElementById('selectedSongCard').innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <p style="color: #666;">${escapeHtml(artist)}</p>
    ${selectedSongIsDuo ? '<p style="color: #999; font-size: 0.9em;">👥 Duett-Song</p>' : ''}
    <button onclick="changeSong()" class="btn btn-secondary" style="margin-top: 10px;">Song wechseln</button>
  `;

  // Duett-Feld ein-/ausblenden
  document.getElementById('duetGroup').style.display = selectedSongIsDuo ? 'block' : 'none';

  // Show form
  document.getElementById('formSection').style.display = 'block';

  // Scroll to form
  document.getElementById('formSection').scrollIntoView({ behavior: 'smooth' });
}

function changeSong() {
  selectedSongId = null;
  selectedSongIsDuo = false;
  document.getElementById('selectedSongSection').style.display = 'none';
  document.getElementById('formSection').style.display = 'none';
  document.getElementById('duetGroup').style.display = 'none';
  // Duett-Partner gehört zum vorherigen Song - sonst bliebe bei einem
  // Songwechsel der alte Name stehen und könnte für den neuen Song
  // unbemerkt mit-abgeschickt werden.
  document.getElementById('duetFirstName').value = '';
  document.getElementById('duetLastName').value = '';
  document.getElementById('searchSection').style.display = 'block';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('searchInput').focus();
}

const PHONE_PATTERN = /^\+?[0-9 \-/]{6,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Für +41-Nummern reicht die generische Zeichen-/Längenprüfung nicht: z.B.
// "+41 79 123 44" hat gültige Zeichen/Länge, aber zu wenige Ziffern -
// normalizeSwissPhone() formatiert das dann fälschlich als generische
// Auslandsnummer statt es abzulehnen. Bei anderen Landesvorwahlen bewusst
// keine strengere Prüfung (unbekannte Formate nicht zu stark einschränken).
function isValidPhoneNumber(formatted) {
  if (formatted.startsWith('+41 ')) {
    return /^\+41 \d{2} \d{3} \d{2} \d{2}$/.test(formatted);
  }
  return PHONE_PATTERN.test(formatted);
}

// Spiegelt normalizeSwissPhone()/formatSwissPhone()/formatInternationalPhone()
// aus lib/db.php - Gäste sehen ihre Nummer schon im Formular formatiert,
// nicht erst nachträglich im Admin.
function normalizeSwissPhone(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const hasPlus = trimmed[0] === '+';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return raw;

  if (!hasPlus) {
    if (digits.slice(0, 4) === '0041') {
      digits = digits.slice(2);
    } else if (digits.slice(0, 2) === '00') {
      digits = digits.slice(2);
    } else if (digits.slice(0, 1) === '0') {
      digits = '41' + digits.slice(1);
    } else {
      digits = '41' + digits;
    }
  }

  if (digits.slice(0, 2) === '41' && digits.length === 11) {
    return formatSwissPhone(digits);
  }

  return formatInternationalPhone(digits);
}

function formatSwissPhone(digits) {
  const rest = digits.slice(2);
  return `+41 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}`;
}

// ITU-T E.164 Landesvorwahlen, längste zuerst geprüft.
const COUNTRY_CODES_3 = new Set([
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224',
  '225', '226', '227', '228', '229', '230', '231', '232', '233', '234',
  '235', '236', '237', '238', '239', '240', '241', '242', '243', '244',
  '245', '246', '247', '248', '249', '250', '251', '252', '253', '254',
  '255', '256', '257', '258', '260', '261', '262', '263', '264', '265',
  '266', '267', '268', '269', '290', '291', '297', '298', '299',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378', '379',
  '380', '381', '382', '383', '385', '386', '387', '389',
  '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
  '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
  '670', '672', '673', '674', '675', '676', '677', '678', '679',
  '680', '681', '682', '683', '685', '686', '687', '688', '689',
  '690', '691', '692',
  '850', '852', '853', '855', '856', '880', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970',
  '971', '972', '973', '974', '975', '976', '977',
  '992', '993', '994', '995', '996', '998',
]);
const COUNTRY_CODES_2 = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41',
  '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54',
  '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
]);
const COUNTRY_CODES_1 = new Set(['1', '7']);

function detectCountryCallingCode(digits) {
  const p3 = digits.slice(0, 3);
  if (p3.length === 3 && COUNTRY_CODES_3.has(p3)) return p3;
  const p2 = digits.slice(0, 2);
  if (p2.length === 2 && COUNTRY_CODES_2.has(p2)) return p2;
  const p1 = digits.slice(0, 1);
  if (COUNTRY_CODES_1.has(p1)) return p1;
  return null;
}

function groupPhoneDigits(digits) {
  const len = digits.length;
  if (len === 0) return '';

  const chunks = [];
  let i = 0;
  while (len - i >= 2) {
    if (len - i === 3) {
      chunks.push(digits.slice(i, i + 3));
      i += 3;
      break;
    }
    chunks.push(digits.slice(i, i + 2));
    i += 2;
  }
  if (i < len) {
    chunks.push(digits.slice(i));
  }

  return chunks.join(' ');
}

function formatInternationalPhone(digits) {
  const countryCode = detectCountryCallingCode(digits);
  if (countryCode === null) {
    return '+' + digits;
  }

  const national = digits.slice(countryCode.length);
  const grouped = groupPhoneDigits(national);

  return '+' + countryCode + (grouped !== '' ? ' ' + grouped : '');
}

function setFieldError(input, message) {
  input.classList.add('field-invalid');
  const group = input.closest('.form-group') || input.parentElement;
  let errorEl = group.querySelector('.field-error-text');
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.className = 'field-error-text';
    group.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field-invalid').forEach((el) => el.classList.remove('field-invalid'));
  form.querySelectorAll('.field-error-text').forEach((el) => el.remove());
}

// Eigene statt der nativen Browser-Validierung (siehe novalidate am
// <form>): die native Hinweisblase des Browsers war auf dem dunklen
// Design leicht zu übersehen - eine Anmeldung schien dann "einfach nichts
// zu tun", obwohl der Browser sie nur blockiert hat. Jetzt wird das
// betroffene Feld rot und die Ursache steht direkt daneben.
function validateForm() {
  const form = document.getElementById('registrationForm');
  clearFieldErrors(form);

  let firstInvalid = null;
  const fail = (input, message) => {
    setFieldError(input, message);
    if (!firstInvalid) firstInvalid = input;
  };

  const firstName = document.getElementById('firstName');
  if (!firstName.value.trim()) fail(firstName, 'Bitte Vorname eingeben.');

  const lastName = document.getElementById('lastName');
  if (!lastName.value.trim()) fail(lastName, 'Bitte Nachname eingeben.');

  const phone = document.getElementById('phone');
  if (!phone.value.trim()) {
    fail(phone, 'Bitte Telefonnummer eingeben.');
  } else {
    phone.value = normalizeSwissPhone(phone.value.trim());
    if (!isValidPhoneNumber(phone.value)) {
      fail(phone, 'Das sieht nicht nach einer gültigen Telefonnummer aus (z.B. +41 79 123 45 67).');
    }
  }

  const email = document.getElementById('email');
  if (!email.value.trim()) {
    fail(email, 'Bitte E-Mail-Adresse eingeben.');
  } else if (!EMAIL_PATTERN.test(email.value.trim())) {
    fail(email, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  }

  if (selectedSongIsDuo) {
    const duetFirstName = document.getElementById('duetFirstName');
    if (!duetFirstName.value.trim()) fail(duetFirstName, 'Bitte Vorname eingeben.');

    const duetLastName = document.getElementById('duetLastName');
    if (!duetLastName.value.trim()) fail(duetLastName, 'Bitte Nachname eingeben.');
  }

  if (firstInvalid) {
    window.KaraokeStats?.event('form_error', { detail: firstInvalid.id.toLowerCase() });
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  return true;
}

async function submitForm(e) {
  e.preventDefault();

  if (registrationLocked) {
    alert('Die Anmeldung ist derzeit geschlossen');
    return;
  }

  if (!selectedSongId) {
    alert('Bitte wählen Sie einen Song aus');
    return;
  }

  if (!validateForm()) {
    return;
  }

  const formData = {
    song_id: selectedSongId,
    first_name: document.getElementById('firstName').value.trim(),
    last_name: document.getElementById('lastName').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    comment: document.getElementById('comment').value.trim(),
  };

  if (selectedSongIsDuo) {
    formData.duet_first_name = document.getElementById('duetFirstName').value.trim();
    formData.duet_last_name = document.getElementById('duetLastName').value.trim();
  }

  try {
    const response = await fetch('/api/queue-add.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (result.success) {
      // Hide form sections
      document.getElementById('selectedSongSection').style.display = 'none';
      document.getElementById('formSection').style.display = 'none';

      // Show success message
      document.getElementById('positionMessage').textContent =
        `Du bist auf Position ${result.position}. Viel Spass beim Singen! 🎤`;
      document.getElementById('successMessage').style.display = 'block';
      document.getElementById('successMessage').scrollIntoView({ behavior: 'smooth' });
    } else {
      alert('Fehler: ' + result.error);
      if (response.status === 423) {
        checkLocks();
      } else if (response.status === 409 || response.status === 403) {
        // Song wurde zwischenzeitlich von jemand anderem angemeldet oder
        // ist gesperrt - zurück zur Suche, damit gleich ein anderer Song
        // gewählt werden kann.
        changeSong();
      }
    }
  } catch (error) {
    console.error('Submit error:', error);
    alert('Fehler beim Anmelden - bitte später versuchen');
  }
}

/* ---------- Voting ---------- */

async function loadVotingList() {
  try {
    const response = await fetch('/api/votes-queue.php');
    const data = await response.json();

    votesRemaining = Number(data.remaining) || 0;
    renderVotesRemaining();
    renderVotingList(Array.isArray(data.songs) ? data.songs : []);
  } catch (error) {
    console.error('Voting list error:', error);
    document.getElementById('votingList').innerHTML = '<div class="empty-state">Fehler beim Laden.</div>';
  }
}

function renderVotesRemaining() {
  const hint = document.getElementById('votesRemainingHint');
  hint.textContent = votesRemaining > 0
    ? `Du hast noch ${votesRemaining} von 3 Stimmen.`
    : 'Du hast alle 3 Stimmen vergeben.';
}

function renderVotingList(songs) {
  const list = document.getElementById('votingList');

  if (songs.length === 0) {
    list.innerHTML = '<div class="empty-state">Noch keine genehmigten Songs zum Voten.</div>';
    return;
  }

  list.innerHTML = songs.map((song) => {
    // Bereits fertig gesungen: nur die eigene Stimmenzahl dezent anzeigen,
    // kein Zurücknehmen/Hinzufügen mehr möglich (siehe votes-queue.php -
    // taucht hier nur auf, wenn man selbst dafür gevotet hat).
    if (song.status === 'completed') {
      const count = song.my_votes || 0;
      return `
        <div class="vote-item vote-item-played">
          <div class="vote-item-info">
            <div class="vote-title">${escapeHtml(song.title)} <span class="vote-locked-hint">(bereits gesungen)</span></div>
            <div class="vote-artist">${escapeHtml(song.artist)}</div>
          </div>
          <div class="vote-controls">
            <span class="vote-played-note">Du hast ${count} ${count === 1 ? 'Stimme' : 'Stimmen'} vergeben</span>
          </div>
        </div>
      `;
    }

    const locked = song.status === 'playing';
    const canRemove = song.my_votes > 0 && !locked;
    const canAdd = votesRemaining > 0;

    // Ein einziger Toggle-Button statt getrennter Auf-/Ab-Buttons: solange
    // noch Stimmen übrig sind, wird hochgevotet (▲) - erst wenn alle 3
    // vergeben sind, kippt der Button bei Songs mit eigener Stimme auf
    // Zurücknehmen (▼). Sobald dadurch wieder eine Stimme frei wird, kippt
    // er überall sofort zurück auf ▲. Der Button sitzt in einem fix breiten
    // Slot (immer ganz rechts, gleiche Position) - ist gerade weder Hoch-
    // noch Runter-Voten möglich, bleibt der Slot leer statt zu verschwinden,
    // damit die Stimmenzahl links davon nicht hin- und herspringt.
    let button = '<span class="btn-vote-slot"></span>';
    if (canAdd) {
      button = `<button type="button" class="btn-vote" data-id="${song.id}" data-action="add" title="Stimme geben">▲</button>`;
    } else if (canRemove) {
      button = `<button type="button" class="btn-vote" data-id="${song.id}" data-action="remove" title="Stimme zurücknehmen">▼</button>`;
    }

    return `
      <div class="vote-item">
        <div class="vote-item-info">
          <div class="vote-title">${escapeHtml(song.title)}${locked ? ' <span class="vote-locked-hint">(singt gerade)</span>' : ''}</div>
          <div class="vote-artist">${escapeHtml(song.artist)}</div>
        </div>
        <div class="vote-controls">
          <span class="vote-count">${song.votes}</span>
          ${button}
        </div>
      </div>
    `;
  }).join('');
}

async function castVote(queueEntryId) {
  try {
    const response = await fetch('/api/votes-add.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue_entry_id: queueEntryId }),
    });
    const result = await response.json();

    if (!result.success) {
      alert(result.error || 'Fehler beim Voten');
    }
    await loadVotingList();
  } catch (error) {
    console.error('Vote error:', error);
    alert('Fehler beim Voten');
  }
}

async function removeVote(queueEntryId) {
  try {
    const response = await fetch('/api/votes-remove.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue_entry_id: queueEntryId }),
    });
    const result = await response.json();

    if (!result.success) {
      alert(result.error || 'Fehler beim Zurücknehmen');
    }
    await loadVotingList();
  } catch (error) {
    console.error('Remove vote error:', error);
    alert('Fehler beim Zurücknehmen');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  // textContent->innerHTML escaped kein " oder ' (nur fuer Text noetig,
  // nicht fuer Attribute) - wird hier aber auch in data-*-Attribute
  // eingesetzt, darum zusaetzlich ersetzen (73 Songs im Katalog haben
  // eingebettete Anfuehrungszeichen im Titel/Interpret).
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
