/* BOT MODE MJK V12 — recoloration sûre des initiales générées par DiceBear.
   Ne modifie ni l'utilisateur, ni la photo personnelle, ni le contenu du texte. */
(() => {
  "use strict";
  const SELECTOR = '#root button[data-testid="nav-user"] img[src^="data:image/svg+xml"]';
  const PALETTE = new Set([
    'd81b60','8e24aa','5e35b1','3949ab','db3733','1b79cc','027cb8',
    '008291','008577','58802f','8a761d','9c6d00','b06200','d1451a'
  ]);
  const COLOR = '#F52999';

  function recolor(url) {
    if (!url || !url.startsWith('data:image/svg+xml;')) return null;
    let svg;
    if (url.startsWith('data:image/svg+xml;utf8,')) {
      try { svg = decodeURIComponent(url.slice('data:image/svg+xml;utf8,'.length)); }
      catch { return null; }
    } else if (url.startsWith('data:image/svg+xml;charset=utf-8,')) {
      try { svg = decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length)); }
      catch { return null; }
    } else if (url.startsWith('data:image/svg+xml;base64,')) {
      try { svg = atob(url.slice('data:image/svg+xml;base64,'.length)); }
      catch { return null; }
    } else return null;

    if (!svg.includes('DiceBear') || !svg.includes('<text') ||
        !svg.includes('id="viewboxMask"')) return null;

    /* Le premier <rect> dans <g mask="url(#viewboxMask)"> est le fond.
       Ne jamais recolorer le masque blanc ni les glyphes blancs. */
    let applied = false;
    const modified = svg.replace(
      /(<g\s+mask="url\(#viewboxMask\)"\s*>\s*<rect\s+fill=")(#[0-9A-Fa-f]{6})("\s+width="100"\s+height="100")/,
      (full, prefix, original, rest) => {
        if (!PALETTE.has(original.slice(1).toLowerCase())) return full;
        applied = true;
        return prefix + COLOR + rest;
      }
    );
    if (!applied || modified === svg) return null;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(modified);
  }

  function recolorAvatars() {
    document.querySelectorAll(SELECTOR).forEach((img) => {
      const original = img.getAttribute('src');
      const changed = recolor(original);
      if (changed) {
        img.setAttribute('src', changed);
        img.dataset.mjkAvatar = 'v12';
      }
    });
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      recolorAvatars();
    });
  }

  function init() {
    const root = document.getElementById('root');
    if (!root) return;
    new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type === 'childList' ||
          (m.type === 'attributes' && m.attributeName === 'src' &&
           m.target.matches?.(SELECTOR)))) schedule();
    }).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
