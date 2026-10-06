// Branding (Logo, Event-Name, Untertitel, Banner) kommt aus den Settings
// (Admin → Einstellungen → Branding) statt fix im HTML. Wird auf allen
// Seiten VOR dem Seiten-Skript geladen und setzt:
//   img[data-brand-logo]           -> hochgeladenes Logo (sonst neutrales Default-Logo)
//   [data-brand-event-name]        -> Event-Name (leer = Element ausgeblendet)
//   [data-brand-subtitle]          -> Untertitel/Ort (leer = Element ausgeblendet)
//   [data-brand-app-name]          -> "<Event-Name> Karaoke" bzw. nur "Karaoke"
//   img[data-brand-banner]         -> Banner-Bild fürs Display (falls hochgeladen) ...
//   [data-brand-banner-fallback]   -> ... sonst dieser aus Logo + Texten gebaute Banner
// Der Seitentitel bekommt den Event-Namen vorangestellt. Seiten, die
// settings-public.php ohnehin pollen (Display), rufen
// window.karaokeApplyBranding(data) mit derselben Antwort erneut auf, damit
// eine Logo-Änderung im Admin ohne Neuladen übernommen wird.
(function () {
  const DEFAULT_LOGO = '/img/default-logo.svg';
  const baseTitle = document.title;
  let bannerFailed = '';

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.textContent !== value) el.textContent = value;
      el.hidden = value === '';
    });
  }

  function setImage(img, url) {
    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
  }

  function apply(data) {
    data = data || {};
    const logoUrl = data.logo_url || DEFAULT_LOGO;
    const bannerUrl = data.banner_url || '';
    const eventName = (data.event_name || '').trim();
    const subtitle = (data.event_subtitle || '').trim();
    const appName = eventName ? `${eventName} Karaoke` : 'Karaoke';

    document.querySelectorAll('img[data-brand-logo]').forEach((img) => {
      // Hochgeladenes Logo nicht ladbar (Datei gelöscht, Ordner gesperrt,
      // kaputtes Bild) -> neutrales Default-Logo statt Bild-Platzhalter.
      img.onerror = () => {
        if (img.getAttribute('src') !== DEFAULT_LOGO) img.setAttribute('src', DEFAULT_LOGO);
      };
      setImage(img, logoUrl);
      img.alt = appName;
      img.classList.add('brand-ready');
    });
    setText('[data-brand-event-name]', eventName);
    setText('[data-brand-subtitle]', subtitle);
    document.querySelectorAll('[data-brand-app-name]').forEach((el) => {
      if (el.textContent !== appName) el.textContent = appName;
    });

    // Banner-Bild nicht ladbar -> automatischer Banner statt schwarzem Bild.
    // bannerFailed merkt sich die kaputte URL, damit das Display-Polling
    // nicht bei jedem Durchlauf wieder auf das kaputte Bild umschaltet.
    const useBanner = bannerUrl !== '' && bannerUrl !== bannerFailed;
    document.querySelectorAll('img[data-brand-banner]').forEach((img) => {
      img.onerror = () => {
        bannerFailed = img.getAttribute('src');
        img.hidden = true;
        document.querySelectorAll('[data-brand-banner-fallback]').forEach((el) => { el.hidden = false; });
      };
      if (useBanner) {
        setImage(img, bannerUrl);
        img.alt = appName;
      }
      img.hidden = !useBanner;
    });
    document.querySelectorAll('[data-brand-banner-fallback]').forEach((el) => {
      el.hidden = useBanner;
    });

    document.title = eventName ? `${eventName} ${baseTitle}` : baseTitle;
  }

  window.karaokeApplyBranding = apply;

  async function load() {
    try {
      const response = await fetch('/api/settings-public.php', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      apply(await response.json());
    } catch (error) {
      console.error('Branding error:', error);
      apply({});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
