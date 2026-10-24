// Shows one sidebar tab at a time, keyed by the URL hash.
(() => {
  const pages = {
    overview: ['#overview', '.content > .section-heading:first-child', '.stats-grid', '.analysis-grid'],
    'team-drivers': ['#team-drivers'],
    log: ['#log'],
    history: ['#history'],
    scouting: ['#scouting']
  };
  const all = [...new Set(Object.values(pages).flat())].flatMap(sel => [...document.querySelectorAll(sel)]);

  function show() {
    const page = location.hash.slice(1) in pages ? location.hash.slice(1) : 'overview';
    const visible = new Set(pages[page].flatMap(sel => [...document.querySelectorAll(sel)]));
    all.forEach(el => { el.hidden = !visible.has(el); });
    document.body.dataset.page = page;
    document.querySelectorAll('.nav-link').forEach(link => {
      const active = link.getAttribute('href') === '#' + page;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      if (active) requestAnimationFrame(() => { link.parentElement.scrollLeft = link.offsetLeft - 12; });
    });
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', show);
  show();
})();
