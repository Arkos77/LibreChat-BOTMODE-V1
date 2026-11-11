/* BOT MODE MJK V14 — update check visible, accessible and resilient to React rerenders.
   GitHub release metadata is read only after an explicit click; never install. */
(() => {
  'use strict';

  const INSTALLED = 'v1.0.6';
  const REPO = 'Arkos77/LibreChat-BOTMODE-V1';
  const API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  const RELEASES = 'https://github.com/' + REPO + '/releases';
  const PANEL = 'botmode-update-check-v14';
  const TIMEOUT_MS = 8000;

  const label = (state) => ({
    idle: 'Vérifier les mises à jour',
    checking: 'Vérification en cours…',
    current: '✓ BOT MODE est à jour',
    newer: '↗ Nouvelle version disponible',
    ahead: '✓ Version locale plus récente',
    error: '⚠ Vérification impossible',
  }[state] || 'Vérifier les mises à jour');

  let last = {
    state: 'idle',
    message: 'Cliquez pour consulter la dernière release officielle.',
    tag: '',
  };
  let checking = false;

  const element = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  };

  const parse = (tag) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag || ''));
    return match ? match.slice(1).map(Number) : null;
  };

  const compare = (left, right) => {
    for (let i = 0; i < 3; i++) {
      if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
    }
    return 0;
  };

  function render() {
    document.querySelectorAll('section[id="' + PANEL + '"]').forEach((panel) => {
      const button = panel.querySelector('button[data-botmode-update-button]');
      const status = panel.querySelector('[data-botmode-update-result]');
      const version = panel.querySelector('[data-botmode-new-release]');
      if (!button || !status || !version) return;
      panel.dataset.state = last.state;
      button.disabled = checking;
      if (checking) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
      button.textContent = label(last.state);
      status.textContent = last.message;
      if (last.state === 'newer' && /^v?\d+\.\d+\.\d+$/.test(last.tag)) {
        version.href = RELEASES + '/tag/' + encodeURIComponent(last.tag);
        version.hidden = false;
      } else {
        version.hidden = true;
        version.removeAttribute('href');
      }
    });
  }

  async function check() {
    if (checking) return;
    checking = true;
    last = { state: 'checking', message: 'Recherche des versions officielles sur GitHub…', tag: '' };
    render();

    const controller = new AbortController();
    let timer;
    try {
      const release = await Promise.race([
        (async () => {
          const response = await fetch(API, {
            method: 'GET',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/vnd.github+json' },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('GitHub HTTP ' + response.status);
          return response.json();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('timeout'));
          }, TIMEOUT_MS);
        }),
      ]);
      const tag = String(release?.tag_name || '');
      const remote = parse(tag);
      const local = parse(INSTALLED);
      if (!remote || !local || release.draft || release.prerelease) {
        throw new Error('Invalid version information');
      }
      const comparison = compare(remote, local);
      if (comparison > 0) {
        last = { state: 'newer', tag, message: 'Une nouvelle version officielle (' + tag +
          ') est disponible. Consultez les notes avant toute installation.' };
      } else if (comparison === 0) {
        last = { state: 'current', tag, message: 'BOT MODE ' + INSTALLED +
          ' est la dernière release officielle. Aucune mise à jour nécessaire.' };
      } else {
        last = { state: 'ahead', tag, message: 'La version installée (' + INSTALLED +
          ') est plus récente que la release GitHub (' + tag + ').' };
      }
    } catch {
      last = { state: 'error', tag: '', message: 'Impossible de vérifier GitHub actuellement. Réessayez ou ouvrez les notes des versions.' };
    } finally {
      if (timer) clearTimeout(timer);
      checking = false;
      render();
    }
  }

  function mount() {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      const dl = [...dialog.querySelectorAll('dl')].find((candidate) => {
        const headers = [...candidate.querySelectorAll('dt')]
          .map((dt) => dt.textContent?.trim().toLowerCase());
        return headers.includes('version') && headers.includes('commit');
      });
      if (!dl || !dl.parentElement ||
          dl.parentElement.querySelector('section[id="' + PANEL + '"]')) continue;

      const panel = element('section', 'botmode-update-panel-v14');
      panel.id = PANEL;
      panel.setAttribute('aria-label', 'Mises à jour BOT MODE');
      const h = element('h3', 'botmode-update-heading-v14', 'Mises à jour BOT MODE');
      const installed = element('p', 'botmode-update-installed-v14', 'BOT MODE V1.0.6 · Habillage MJK V13');
      const detail = element('p', 'botmode-update-detail-v14',
        'La version affichée plus haut concerne le moteur LibreChat. La recherche des releases ne déclenche aucune installation.');
      const result = element('p', 'botmode-update-result-v14', '');
      result.dataset.botmodeUpdateResult = 'true';
      result.setAttribute('role', 'status');
      result.setAttribute('aria-live', 'polite');
      result.setAttribute('aria-atomic', 'true');

      const actions = element('div', 'botmode-update-actions-v14');
      const button = element('button', 'botmode-update-button-v14');
      button.type = 'button';
      button.dataset.botmodeUpdateButton = 'true';
      button.setAttribute('aria-label', 'Vérifier les mises à jour de BOT MODE');
      button.addEventListener('click', check);

      const releases = element('a', 'botmode-update-link-v14', 'Toutes les releases ↗');
      releases.href = RELEASES;
      releases.target = '_blank';
      releases.rel = 'noopener noreferrer';
      const latest = element('a', 'botmode-update-link-v14', 'Voir cette mise à jour ↗');
      latest.dataset.botmodeNewRelease = 'true';
      latest.target = '_blank';
      latest.rel = 'noopener noreferrer';
      latest.hidden = true;

      actions.append(button, releases);
      panel.append(h, installed, detail, result, actions, latest);
      dl.insertAdjacentElement('afterend', panel);
      render();
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mount(); });
  }
  function init() {
    new MutationObserver((records) => {
      if (records.some((rec) => rec.type === 'childList')) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    schedule();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
