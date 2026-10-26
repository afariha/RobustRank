// RobustRank UI: wires panels A-F to the dataset adapters (datasets.js) and the tier search (search.worker.js).
(function () {
  const { DATASETS, axisValues, contexts, rankings } = window.RR;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('en-US');
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const share = (a, b) => { const p = 100 * a / b; return p >= 1 || p === 0 ? Math.round(p) : p >= 0.1 ? p.toFixed(1) : '<0.1'; };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const loaded = new Map();   // dataset id -> prepared data
  let ds = null, P = null, spec = null, last = null, runId = 0;
  const worker = new Worker('js/search.worker.js');

  // ---------------------------------------------------------------- tier colors (the mockup's blue-to-red scale)
  const TIER_COLORS = ['#2E6FBA', '#3A7FC0', '#3A8FB7', '#3A9F9B', '#3FA36B', '#7AA83E', '#B3A62E', '#E0A526', '#E07B26', '#D8673A', '#C8553D'];
  const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function tierColor(i, T) {
    const x = T <= 1 ? 0 : i / (T - 1) * (TIER_COLORS.length - 1), k = Math.min(Math.floor(x), TIER_COLORS.length - 2), f = x - k;
    const a = hex(TIER_COLORS[k]), b = hex(TIER_COLORS[k + 1]);
    return a.map((v, j) => Math.round(v + (b[j] - v) * f));
  }
  const mix = (rgb, w) => `rgb(${rgb.map(v => Math.round(255 + (v - 255) * w)).join(',')})`;   // tint toward white
  const shade = (rgb, w) => `rgb(${rgb.map(v => Math.round(v * w)).join(',')})`;

  // ---------------------------------------------------------------- panel A: data
  DATASETS.forEach(d => $('dataset').add(new Option(d.name, d.id)));
  $('dataset').addEventListener('change', () => selectDataset($('dataset').value));

  async function selectDataset(id) {
    ds = DATASETS.find(d => d.id === id);
    $('dataset').value = id;
    $('result').innerHTML = '<div class="empty busy">Loading data…</div>';
    $('grid').innerHTML = '';
    if (!loaded.has(id)) {
      const raw = await (await fetch(ds.file)).json();
      loaded.set(id, ds.prepare(raw));
    }
    if (ds.id !== id) return;   // another dataset was picked meanwhile
    P = loaded.get(id);
    const fn = ds.functions.find(f => f.id === ds.defaults.fn);
    const tol = Object.assign({ minRobustness: 0.5, borderline: 0.25, crossing: 0.25, tau: 10 }, ds.defaults.tolerance);
    spec = {
      entitySet: ds.defaultEntitySet, fn: fn.id, dir: fn.dir, years: ds.defaults.years.slice(),
      sel: Object.assign({}, JSON.parse(JSON.stringify(ds.defaults.sel)), ds.defaultSel ? ds.defaultSel(P) : {}), ...tol,
    };
    renderAll();
    run();
  }

  function renderData() {
    const [y0, y1] = ds.yearRange(P);
    const ents = ds.entitySets.length > 1
      ? `<select id="entitySet">${ds.entitySets.map(s => `<option value="${s.id}"${s.id === spec.entitySet ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select>`
      : esc(ds.entitySets[0].label);
    $('dataProps').innerHTML = `<dt>Entities</dt><dd>${ents}</dd><dt>Year range</dt><dd>${y0} to ${y1}</dd>` +
      `<dt>Attributes</dt><dd>${ds.attributes.join(', ')}</dd><dt>#rows</dt><dd>${fmt(P.totalRows)}</dd>`;
    const es = $('entitySet');
    if (es) es.addEventListener('change', () => {
      const v = es.value; spec.entitySet = ds.entitySets.find(s => String(s.id) === v).id; changed();
    });
  }

  // ---------------------------------------------------------------- panel B: ranking function
  function renderFunction() {
    $('fn').innerHTML = ds.functions.map(f => `<option value="${f.id}"${f.id === spec.fn ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
    $('dir').value = spec.dir;
    renderFormula();
  }
  function renderFormula() {
    const f = ds.formula(P, spec.fn, spec);
    $('formula').innerHTML = `<div class="head">${f.head}</div><table>${f.notes.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
  }
  $('fn').addEventListener('change', () => {
    spec.fn = $('fn').value; spec.dir = ds.functions.find(f => f.id === spec.fn).dir; $('dir').value = spec.dir;
    renderFormula(); changed();
  });
  $('dir').addEventListener('change', () => { spec.dir = $('dir').value; changed(); });

  // ---------------------------------------------------------------- panel C: tolerance parameters and penalty-free tier size
  const setFill = (inp) => inp.style.setProperty('--pct', `${(inp.value - inp.min) / (inp.max - inp.min) * 100}%`);
  ['minRobustness', 'borderline', 'crossing'].forEach(id => {
    const inp = $(id), out = inp.parentElement.querySelector('output');
    inp.addEventListener('input', () => { spec[id] = inp.value / 100; out.textContent = inp.value + '%'; setFill(inp); changed(); });
  });
  $('tau').addEventListener('input', () => {
    const inp = $('tau'); spec.tau = +inp.value; inp.parentElement.querySelector('output').textContent = inp.value; setFill(inp); changed();
  });
  function renderTolerance() {
    ['minRobustness', 'borderline', 'crossing'].forEach(id => {
      const inp = $(id); inp.value = Math.round(spec[id] * 100);
      inp.parentElement.querySelector('output').textContent = inp.value + '%'; setFill(inp);
    });
    const inp = $('tau'); inp.value = spec.tau;
    inp.parentElement.querySelector('output').textContent = inp.value; setFill(inp);
  }

  // ---------------------------------------------------------------- panel D: context specification
  let openMenu = null;
  document.addEventListener('click', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
  function closeMenu() { if (openMenu) { openMenu.querySelector('.ms-menu')?.remove(); openMenu = null; } }

  function renderAxes() {
    const [y0, y1] = ds.yearRange(P), axes = ds.axes(P), vals = axisValues(ds, P, spec);
    const box = $('axes');
    box.innerHTML = '<div class="th">Axis</div><div class="th">Values</div><div class="th num">Count</div>';
    // year: dual range slider over the data's full year range
    box.insertAdjacentHTML('beforeend', `<div>Year</div>
      <div class="yslider"><span class="bound">${y0}</span>
        <div class="dual"><div class="track"></div><div class="fill"></div>
          <input type="range" class="lo" min="${y0}" max="${y1}" step="1" value="${spec.years[0]}">
          <input type="range" class="hi" min="${y0}" max="${y1}" step="1" value="${spec.years[1]}">
          <span class="val vlo"></span><span class="val vhi"></span></div>
        <span class="bound">${y1}</span></div>
      <div class="num" id="yearCount"></div>`);
    const dual = box.querySelector('.dual'), lo = dual.querySelector('.lo'), hi = dual.querySelector('.hi');
    const paint = () => {
      const f = (v) => (v - y0) / Math.max(1, y1 - y0) * 100;
      dual.querySelector('.fill').style.left = f(spec.years[0]) + '%';
      dual.querySelector('.fill').style.width = (f(spec.years[1]) - f(spec.years[0])) + '%';
      const vl = dual.querySelector('.vlo'), vh = dual.querySelector('.vhi');
      vl.textContent = spec.years[0]; vl.style.left = f(spec.years[0]) + '%';
      vh.textContent = spec.years[1]; vh.style.left = f(spec.years[1]) + '%';
      vh.style.display = spec.years[1] === spec.years[0] ? 'none' : '';
      // keep the two labels apart when the thumbs are close
      const gap = f(spec.years[1]) - f(spec.years[0]);
      vl.style.transform = gap < 12 ? 'translateX(-85%)' : ''; vh.style.transform = gap < 12 ? 'translateX(-15%)' : '';
      $('yearCount').textContent = spec.years[1] - spec.years[0] + 1;
    };
    lo.addEventListener('input', () => { if (+lo.value > spec.years[1]) lo.value = spec.years[1]; spec.years[0] = +lo.value; paint(); changed(); });
    hi.addEventListener('input', () => { if (+hi.value < spec.years[0]) hi.value = spec.years[0]; spec.years[1] = +hi.value; paint(); changed(); });
    paint();

    axes.forEach((ax, i) => {
      const name = document.createElement('div'); name.textContent = ax.name;
      const ms = document.createElement('div'); ms.className = 'ms';
      const cnt = document.createElement('div'); cnt.className = 'num'; cnt.textContent = vals[i].length;
      const sel = spec.sel[ax.id] || [];
      if (!sel.length) ms.innerHTML = `<span class="placeholder">${ax.all ? 'All' : 'Pick at least one value'}</span>`;
      for (const v of (sel.length ? vals[i] : [])) {
        const chip = document.createElement('span'); chip.className = 'vchip';
        chip.innerHTML = `${esc(v === -1 ? 'All' : ax.values[v])}<span class="x" title="Remove">×</span>`;
        chip.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); spec.sel[ax.id] = sel.filter(x => x !== v); closeMenu(); renderAxes(); changed(); });
        ms.appendChild(chip);
      }
      ms.addEventListener('click', (e) => {
        if (e.target.closest('.ms-menu')) return;
        if (openMenu === ms) { closeMenu(); return; }
        closeMenu(); openMenu = ms; ms.appendChild(menuFor(ax));
      });
      box.append(name, ms, cnt);
    });
    renderCtxBox();
  }

  function menuFor(ax) {
    const menu = document.createElement('div'); menu.className = 'ms-menu';
    const sel = new Set(spec.sel[ax.id] || []);
    const order = ax.order || ax.values.map((_, i) => i);
    const items = (ax.all ? [-1] : []).concat(order);
    let cat = null;
    for (const v of items) {
      if (ax.categories && v !== -1 && ax.categories[v] !== cat) {
        cat = ax.categories[v];
        menu.insertAdjacentHTML('beforeend', `<div class="cat">${esc(cat)}</div>`);
      }
      const lab = document.createElement('label');
      lab.innerHTML = `<input type="checkbox"${sel.has(v) ? ' checked' : ''}> ${esc(v === -1 ? 'All' : ax.values[v])}`;
      lab.querySelector('input').addEventListener('change', (e) => {
        const s = new Set(spec.sel[ax.id] || []);
        e.target.checked ? s.add(v) : s.delete(v);
        spec.sel[ax.id] = [...s];
        const keep = openMenu;
        renderAxes(); changed();
        // reopen the menu on the re-rendered box so several values can be picked in a row
        const boxes = $('axes').querySelectorAll('.ms'), idx = ds.axes(P).findIndex(a => a.id === ax.id);
        if (keep) { openMenu = boxes[idx]; openMenu.appendChild(menuFor(ax)); openMenu.querySelector('.ms-menu').scrollTop = menu.scrollTop; }
      });
      menu.appendChild(lab);
    }
    return menu;
  }

  function renderCtxBox() {
    const axes = ds.axes(P), vals = axisValues(ds, P, spec);
    const nYears = spec.years[1] - spec.years[0] + 1;
    const n = nYears * vals.reduce((m, v) => m * v.length, 1);
    const parts = [`${nYears} Year`].concat(axes.map((ax, i) => vals[i].length > 1 ? `${vals[i].length} ${ax.name}` : null).filter(Boolean));
    const missing = axes.filter((ax, i) => !vals[i].length).map(ax => ax.name);
    let html = `<div class="lab">Contexts</div><div class="big">${fmt(n)}</div><div class="sub">${parts.join(' × ')}</div>`;
    if (n) {
      const rows = ds.support(P, spec.entitySet, spec);
      html += `<div class="lab">Support</div><div>${fmt(n)} of ${fmt(ds.possibleContexts(P))} possible contexts</div><div>${fmt(rows)} rows (${share(rows, P.totalRows)}%)</div>`;
    }
    if (missing.length) html += `<div class="warn">Pick at least one value for ${missing.join(' and ')}.</div>`;
    else if (n > 400) html += `<div class="warn">Many contexts: the search may take a while.</div>`;
    $('ctxbox').innerHTML = html;
    $('run').disabled = !n;
  }

  // ---------------------------------------------------------------- search
  function changed() {
    renderCtxBox();
    if (last) { $('panelE').classList.add('stale'); $('panelF').classList.add('stale'); }
  }
  $('run').addEventListener('click', run);

  function run() {
    const ctxs = contexts(ds, P, spec);
    if (!ctxs.length) return;
    const rk = rankings(ds, P, spec, ctxs);
    const id = ++runId;
    if (rk.kept.length < 2) {
      last = null;
      $('result').innerHTML = `<div class="empty">Fewer than two entities have data in every context.</div>`;
      $('grid').innerHTML = '';
      return;
    }
    $('run').disabled = true; $('run').textContent = 'Searching…';
    const snapshot = { ds, P, spec: JSON.parse(JSON.stringify(spec)), ctxs, rk };
    worker.onmessage = (ev) => {
      if (id !== runId) return;
      $('run').disabled = false; $('run').textContent = 'Find robust tiers';
      last = { ...snapshot, res: ev.data };
      $('panelE').classList.remove('stale'); $('panelF').classList.remove('stale');
      renderResult(); renderGrid();
    };
    worker.postMessage({ orders: rk.orders, minRobustness: spec.minRobustness, borderline: spec.borderline, crossing: spec.crossing, tau: spec.tau });
  }

  // ---------------------------------------------------------------- panel E: robust ranking
  function renderResult() {
    const { ds, P, rk, res } = last;
    const name = (i) => ds.shortName(P, rk.kept[i]), full = (i) => ds.entityName(P, rk.kept[i]);
    let html = `<div class="summary"><span>Holds in <b>${res.held} of ${res.C}</b> contexts (${pct(res.held, res.C)}%)</span>` +
      `<span class="order-note">Entities within a tier are ordered alphabetically</span></div>`;
    if (rk.excluded.length) html += `<div class="note">Not ranked (no data in some contexts): ${rk.excluded.map(e => esc(ds.shortName(P, e))).join(', ')}</div>`;
    if (res.held < Math.ceil(last.spec.minRobustness * res.C - 1e-9)) html += `<div class="note">No tiering reaches the minimum robustness except a single tier.</div>`;
    html += '<div class="tiers">';
    res.tiers.forEach((t, i) => {
      const rgb = tierColor(i, res.tiers.length);
      html += `<div class="tl" style="color:${shade(rgb, 0.7)}">Tier ${i + 1}</div><div class="tc">`;
      for (const e of t.slice().sort((a, b) => name(a).localeCompare(name(b), 'en', { sensitivity: 'base' }))) {
        const c = res.crossers[e], cls = c === 'u' ? ' cu' : c === 'd' ? ' cd' : c ? ' cb' : '';
        const arrow = c === 'u' ? '<b class="up">↑</b>' : c === 'd' ? '<b class="down">↓</b>' : c ? '<b class="exc">↕</b>' : '';
        const tip = full(e) + (c === 'u' ? ' (crosses into the tier above)' : c === 'd' ? ' (crosses into the tier below)' : c ? ' (crosses both ways)' : '');
        html += `<div class="chip${cls}" title="${esc(tip)}" style="background:${mix(rgb, 0.18)};${cls ? '' : `border-color:${mix(rgb, 0.7)}`}">${arrow}${esc(name(e))}</div>`;
      }
      html += '</div>';
    });
    $('result').innerHTML = html + '</div>';
  }

  // ---------------------------------------------------------------- panel F: where this ranking holds
  function renderGrid() {
    const { ds, P, spec, ctxs, rk, res } = last;
    const axes = ds.axes(P), vals = axisValues(ds, P, spec);
    const order = (ds.gridOrder || axes.map(a => a.id)).map(id => axes.findIndex(a => a.id === id)).filter(i => i >= 0);
    const shown = order.filter(i => vals[i].length > 1);   // axes with one value are the same in every row
    let combos = [[]];
    for (const i of order) combos = combos.flatMap(c => vals[i].map(v => c.concat([[i, v]])));
    const years = []; for (let y = spec.years[0]; y <= spec.years[1]; y++) years.push(y);
    const idx = new Map(ctxs.map((c, k) => [c.year + '|' + c.v.join(','), k]));
    const label = (combo) => {
      const parts = combo.filter(([i]) => shown.includes(i)).map(([i, v]) => v === -1 ? 'All' : (axes[i].short || axes[i].values)[v]);
      return parts.length ? parts.join(', ') : 'All';
    };
    const cw = Math.max(18, Math.min(36, Math.floor(260 / years.length))), ch = combos.length > 12 ? 22 : 30;
    let html = `<table class="fgrid"><tr><th></th>${years.map(y => `<th class="yr"><div>${y}</div></th>`).join('')}</tr>`;
    for (const combo of combos) {
      const v = axes.map((_, i) => combo.find(([j]) => j === i)[1]);
      html += `<tr><td class="rl">${esc(label(combo))}</td>`;
      for (const y of years) {
        const k = idx.get(y + '|' + v.join(',')), s = res.status[k];
        html += `<td class="c ${s}" data-k="${k}" style="width:${cw}px;height:${ch}px">${s === 'G' ? '✓' : s === 'Y' ? '↕' : '×'}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    const n = (s) => res.status.filter(x => x === s).length;
    html += `<div class="flegend"><div><b class="up">✓</b>holds (${n('G')}/${res.C})</div><div><b class="exc">↕</b>holds with crossings (${n('Y')}/${res.C})</div><div><b class="down">×</b>breaks (${n('R')}/${res.C})</div></div>`;
    $('grid').innerHTML = html;
    $('grid').querySelectorAll('td.c').forEach(td => {
      td.addEventListener('mouseenter', (e) => showTip(e, +td.dataset.k));
      td.addEventListener('mousemove', moveTip);
      td.addEventListener('mouseleave', () => { $('tip').hidden = true; });
    });
  }

  function ctxName(ds, P, ctx) {
    const axes = ds.axes(P);
    return [ctx.year].concat(ctx.v.map((v, i) => v === -1 ? `${axes[i].name}: All` : axes[i].values[v])).join(', ');
  }
  function showTip(e, k) {
    const { ds, P, ctxs, rk, res } = last;
    const s = res.status[k], moved = res.moved[k];
    const name = (i) => esc(ds.shortName(P, rk.kept[i]));
    const tierOf = new Map(); res.tiers.forEach((t, i) => t.forEach(x => tierOf.set(x, i)));
    let body;
    if (s === 'G') body = 'Holds: every entity ranks inside its tier.';
    else if (s === 'Y') body = 'Holds with crossings: ' + moved.map(([x, d]) => `${d < 0 ? '↑' : '↓'} ${name(x)}`).join(', ');
    else {
      const list = moved.slice(0, 10).map(([x, d]) => `${name(x)} (Tier ${tierOf.get(x) + 1} → ${tierOf.get(x) + 1 + d})`);
      body = `Breaks: ${moved.length} ${moved.length === 1 ? 'entity ranks' : 'entities rank'} outside ${moved.length === 1 ? 'its' : 'their'} tier: ${list.join(', ')}${moved.length > 10 ? ', …' : ''}`;
    }
    $('tip').innerHTML = `<div class="t">${esc(ctxName(ds, P, ctxs[k]))}</div>${body}`;
    $('tip').hidden = false; moveTip(e);
  }
  function moveTip(e) {
    const t = $('tip'), w = t.offsetWidth;
    t.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 8) + 'px';
    t.style.top = (e.clientY + 16) + 'px';
  }

  function renderAll() { renderData(); renderFunction(); renderTolerance(); renderAxes(); }

  selectDataset(DATASETS[0].id);
})();
