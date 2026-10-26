// Guide mode: a step-by-step tour that highlights one part of the page at a time.
// Opens from the Guide button, and once on a visitor's first visit.
(function () {
  const STEPS = [
    { target: '.about', title: 'Welcome to RobustRank',
      text: 'An exact ranking often changes with the data you use. RobustRank groups the entities into tiers that stay the same across most of your data choices. This short tour shows you around.' },
    { target: '#panelA', title: 'Pick the data',
      text: 'Choose a dataset and which entities to rank, e.g., the top 60 US CS departments. The facts below describe the data.' },
    { target: '#panelB', title: 'Pick the ranking function',
      text: 'This is how each entity is scored. It stays fixed. DESC ranks the highest score first, ASC the lowest.' },
    { target: '#panelD', title: 'Pick your data choices',
      text: 'Each combination of the values you pick is one context, i.e., one way to slice the data. Drag the year slider and click a box to add or remove values. The box on the right counts the contexts and the data they use.' },
    { target: '#panelC', title: 'Set how strict to be',
      text: 'Minimum robustness is the share of contexts where the tiers must hold. The next two sliders let a few entities cross into a neighboring tier in a few contexts. Tiers larger than the penalty-free tier size are discouraged. Every change reruns the search on its own.' },
    { target: '#panelE', title: 'Read the robust tiers',
      text: 'A higher tier ranks above a lower tier, and entities within a tier are not ordered. An arrow marks an entity that sometimes crosses into the tier above or below. Scroll to see all tiers.' },
    { target: '#panelF', title: 'See where the tiers hold',
      text: 'Each cell is one context: a green check holds, an amber arrow holds with crossings, and a red cross breaks. Hover over a cell to see the exact ranking in that context.' },
    { target: '#panelC', title: 'Now try it',
      text: 'Lower the minimum robustness and watch the tiers split, or raise it and watch them merge. You can reopen this guide anytime with the Guide button.' },
  ];
  const SEEN_KEY = 'robustrank-guide-seen';
  let step = -1, box = null, card = null;

  function open(i = 0) {
    if (!box) {
      box = document.createElement('div'); box.className = 'guide-spot';
      card = document.createElement('div'); card.className = 'guide-card';
      card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
      document.body.append(box, card);
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      document.addEventListener('keydown', onKey);
    }
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* storage may be unavailable */ }
    show(i);
  }

  function close() {
    if (!box) return;
    box.remove(); card.remove(); box = card = null; step = -1;
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(step + 1);
    else if (e.key === 'ArrowLeft') show(step - 1);
  }

  function show(i) {
    if (i < 0) return;
    if (i >= STEPS.length) { close(); return; }
    step = i;
    const s = STEPS[i], last = i === STEPS.length - 1;
    card.innerHTML = `<div class="guide-count">${i + 1} of ${STEPS.length}</div>
      <div class="guide-title">${s.title}</div><div class="guide-text">${s.text}</div>
      <div class="guide-buttons"><button class="guide-skip">${last ? 'Close' : 'Skip tour'}</button>
        <span>${i ? '<button class="guide-back">Back</button>' : ''}<button class="guide-next">${last ? 'Done' : 'Next'}</button></span></div>`;
    card.querySelector('.guide-skip').onclick = close;
    card.querySelector('.guide-next').onclick = () => show(i + 1);
    const back = card.querySelector('.guide-back'); if (back) back.onclick = () => show(i - 1);
    const el = document.querySelector(s.target);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    place();
    setTimeout(place, 350);   // after smooth scrolling
    card.querySelector('.guide-next').focus({ preventScroll: true });
  }

  // highlight the target and put the card beside it, below it, or above it, whichever fits
  function place() {
    if (!box || step < 0) return;
    const el = document.querySelector(STEPS[step].target);
    if (!el) return;
    const r = el.getBoundingClientRect(), pad = 6, W = window.innerWidth, H = window.innerHeight;
    Object.assign(box.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
    const wide = r.width > W * 0.5;   // wide targets get the card below or above, narrow ones beside
    let x, y;
    if (!wide && r.right + gap + cw <= W - 8) { x = r.right + gap; y = r.top; }
    else if (!wide && r.left - gap - cw >= 8) { x = r.left - gap - cw; y = r.top; }
    else if (r.bottom + gap + ch <= H - 8) { x = r.left; y = r.bottom + gap; }
    else if (r.top - gap - ch >= 8) { x = r.left; y = r.top - gap - ch; }
    else { x = r.right - cw - 8; y = r.top + 8; }   // inside the target's top-right corner
    card.style.left = Math.max(8, Math.min(x, W - cw - 8)) + 'px';
    card.style.top = Math.max(8, Math.min(y, H - ch - 8)) + 'px';
  }

  document.getElementById('guideBtn').addEventListener('click', () => open(0));
  // first visit: open once the first result is on screen
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { seen = true; }
  if (!seen) {
    const wait = setInterval(() => { if (document.querySelector('.tiers')) { clearInterval(wait); open(0); } }, 300);
    setTimeout(() => clearInterval(wait), 15000);
  }
})();
