/* BOT MODE MJK — Vérification volontaire des releases (V13).
   Aucun téléchargement ni installation, uniquement une lecture GitHub après clic. */
(() => {
  'use strict';
  const INSTALLED = 'v1.0.6';
  const REPO = 'Arkos77/LibreChat-BOTMODE-V1';
  const RELEASES_URL = 'https://github.com/' + REPO + '/releases';
  const API_URL = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  const PANEL_ID = 'botmode-update-check-v13';

  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };

  const parseVersion = (v) => {
    const found = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''));
    return found ? found.slice(1).map(Number) : null;
  };
  const compare = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
  };

  function mountIfAbout() {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      const dl = [...dialog.querySelectorAll('dl')].find((candidate) => {
        const labels = [...candidate.querySelectorAll('dt')]
          .map((el) => el.textContent?.trim().toLowerCase());
        return labels.includes('version') && labels.includes('commit');
      });
      if (!dl || !dl.parentElement || dl.parentElement.querySelector('#' + PANEL_ID)) {
        continue;
      }

      const panel = make('section', 'botmode-update-panel-v13');
      panel.id = PANEL_ID;
      panel.setAttribute('aria-label', 'Mises à jour BOT MODE');

      const heading = make('h3', 'botmode-update-heading-v13', 'Mises à jour BOT MODE');
      const installed = make('p', 'botmode-update-installed-v13',
        'Version installée : BOT MODE V1.0.6 · Identité MJK V12');
      const explanation = make('p', 'botmode-update-detail-v13',
        'La version affichée au-dessus est celle du moteur LibreChat. Ce bouton vérifie les releases officielles de BOT MODE, sans installation automatique.');
      const actions = make('div', 'botmode-update-actions-v13');
      const button = make('button', 'botmode-update-button-v13',
        'Vérifier les mises à jour');
      button.type = 'button';
      button.setAttribute('aria-label', 'Vérifier les mises à jour BOT MODE sur GitHub');
      const releases = make('a', 'botmode-update-link-v13', 'Notes des versions ↗');
      releases.href = RELEASES_URL;
      releases.target = '_blank';
      releases.rel = 'noopener noreferrer';
      const result = make('p', 'botmode-update-result-v13',
        'Aucune recherche effectuée. Vérification uniquement sur demande.');
      result.setAttribute('role', 'status');
      result.setAttribute('aria-live', 'polite');
      result.setAttribute('aria-atomic', 'true');
      const latestLink = make('a', 'botmode-update-link-v13', 'Voir la nouvelle version ↗');
      latestLink.target = '_blank';
      latestLink.rel = 'noopener noreferrer';
      latestLink.hidden = true;

      button.addEventListener('click', async () => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Vérification…';
        result.textContent = 'Interrogation des releases officielles sur GitHub…';
        latestLink.hidden = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(API_URL, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'follow',
            headers: { Accept: 'application/vnd.github+json' },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('GitHub API unavailable');
          const data = await response.json();
          const tag = String(data?.tag_name ?? '');
          const published = parseVersion(tag);
          const local = parseVersion(INSTALLED);
          if (!published || !local || data.draft === true || data.prerelease === true) {
            throw new Error('Invalid release metadata');
          }
          const comparison = compare(published, local);
          if (comparison > 0) {
            result.textContent = 'Nouvelle version officielle disponible : ' + tag +
              '. Consulter les notes et sauvegarder avant toute installation.';
            latestLink.href = RELEASES_URL + '/tag/' + encodeURIComponent(tag);
            latestLink.hidden = false;
          } else if (comparison === 0) {
            result.textContent = 'BOT MODE V1.0.6 est à jour parmi les releases officielles. Les personnalisations Git peuvent évoluer séparément.';
          } else {
            result.textContent = 'La version installée est plus récente que la dernière release GitHub (' + tag + ').';
          }
        } catch {
          result.textContent = 'Vérification indisponible (connexion ou GitHub). Consultez les notes des versions via le lien ci-dessus.';
        } finally {
          clearTimeout(timeout);
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = 'Vérifier les mises à jour';
        }
      });

      actions.append(button, releases);
      panel.append(heading, installed, explanation, actions, result, latestLink);
      dl.insertAdjacentElement('afterend', panel);
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mountIfAbout();
    });
  }
  function init() {
    new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type === 'childList')) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    schedule();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
