// Robust tier search (runs in a Web Worker).
//
// Input: one ranking per context (entity indices, best first) over the same n entities.
// A tiered ranking HOLDS in a context if every entity's position falls inside its tier's positions,
// except entities that cross into the tier directly above or below, where
//   - in each context, at most floor(borderline * tier size) entities of a tier cross (which entities cross may
//     differ from context to context),
//   - each entity crosses in at most floor(crossing * #contexts) of the holding contexts.
// Entities that cross in some holding context are "borderline" and get arrows in the UI.
// Robustness = held contexts / all contexts.
// Informativeness = #tiers - sum of tier penalties, where a tier with at most tau entities costs nothing and a
// larger tier costs 2^(size - tau) - 1. Goal: the most informative tiering with robustness >= minRobustness.
// Splitting a tier never raises the penalty, so every boundary that keeps the robustness raises informativeness.
// Tier finder (greedy): order the entities by a reference order and start with a single tier. In each step, add the
// tier boundary that most raises informativeness (ties: keeps the most contexts holding, then the most holding
// strictly) while robustness stays >= minimum; stop when every boundary would drop robustness below the minimum.
// The greedy runs from several reference orders (median rank, mean rank, and each context's own ranking) and the
// most informative result wins (ties: more held, then more strictly held).

const penalty = (size, tau) => size > tau ? 2 ** (size - tau) - 1 : 0;
function informativeness(b, tau) {
  let I = b.length - 1;
  for (let t = 0; t + 1 < b.length; t++) I -= penalty(b[t + 1] - b[t], tau);
  return I;
}

function evaluate(orders, seq, cuts, borderline, crossing) {
  const n = seq.length, C = orders.length;
  const b = [0, ...[...cuts].sort((a, c) => a - c), n];
  const T = b.length - 1;
  const bandOf = new Int32Array(n), tierOf = new Int32Array(n);
  for (let t = 0; t < T; t++) for (let p = b[t]; p < b[t + 1]; p++) { bandOf[p] = t; tierOf[seq[p]] = t; }
  const caps = [];
  for (let t = 0; t < T; t++) caps.push(Math.floor(borderline * (b[t + 1] - b[t]) + 1e-9));
  const budget = Math.floor(crossing * C + 1e-9);
  const status = new Array(C).fill('R'), out = new Array(C), cand = [];
  let strict = 0;
  for (let c = 0; c < C; c++) {
    const o = [], per = new Int32Array(T); let bad = false; const ord = orders[c];
    for (let p = 0; p < n; p++) {
      const e = ord[p], d = bandOf[p] - tierOf[e];
      if (d !== 0) { o.push([e, d]); if (d > 1 || d < -1) bad = true; else per[tierOf[e]]++; }
    }
    out[c] = o;
    if (!o.length) { status[c] = 'G'; strict++; }
    else if (!bad && per.every((k, t) => k <= caps[t])) cand.push(c);
  }
  // excuse contexts with crossings, fewest crossing entities first, while every crossing entity has crossings left
  cand.sort((a, c) => out[a].length - out[c].length || a - c);
  const used = new Map(), jumpers = new Map();
  for (const c of cand) {
    if (!out[c].every(([e]) => (used.get(e) || 0) < budget)) continue;
    for (const [e, d] of out[c]) {
      used.set(e, (used.get(e) || 0) + 1);
      if (!jumpers.has(e)) jumpers.set(e, new Set());
      jumpers.get(e).add(d < 0 ? 'u' : 'd');
    }
    status[c] = 'Y';
  }
  const held = status.filter(s => s !== 'R').length;
  return { held, strict, status, jumpers, b };
}

function greedySearch(orders, seq, minRob, borderline, crossing, tau) {
  const n = seq.length, C = orders.length, need = Math.ceil(minRob * C - 1e-9);
  const cuts = [];
  for (;;) {
    let best = null;
    for (let j = 1; j < n; j++) {
      if (cuts.includes(j)) continue;
      const r = evaluate(orders, seq, cuts.concat([j]), borderline, crossing);
      if (r.held < need) continue;
      const I = informativeness(r.b, tau);
      if (!best || I > best.I || (I === best.I && (r.held > best.r.held || (r.held === best.r.held && r.strict > best.r.strict)))) best = { j, r, I };
    }
    if (!best) break;
    cuts.push(best.j);
  }
  return cuts;
}

function search({ orders, minRobustness, borderline, crossing, tau = Infinity }) {
  const C = orders.length, n = orders[0].length;
  const mean = new Float64Array(n), ranks = Array.from({ length: n }, () => []);
  for (const ord of orders) ord.forEach((e, p) => { mean[e] += p; ranks[e].push(p); });
  const med = ranks.map(r => r.sort((a, b) => a - b)[r.length >> 1]);
  const starts = [['median rank', [...Array(n).keys()].sort((a, b) => med[a] - med[b] || mean[a] - mean[b] || a - b)],
                  ['mean rank', [...Array(n).keys()].sort((a, b) => mean[a] - mean[b] || a - b)]]
    .concat(orders.map((o, c) => [`ranking in context ${c + 1}`, o]));
  const better = (a, b) => !b || a.I > b.I || (a.I === b.I && (a.r.held > b.r.held || (a.r.held === b.r.held && a.r.strict > b.r.strict)));
  // the median-rank start always runs; further starts run while the time budget lasts (keeps large inputs interactive)
  const t0 = Date.now(), timeCap = 4000;
  let best = null, capped = false;
  for (const [name, seq] of starts) {
    if (best && Date.now() - t0 > timeCap) { capped = true; break; }
    const cuts = greedySearch(orders, seq, minRobustness, borderline, crossing, tau);
    const r = evaluate(orders, seq, cuts, borderline, crossing);
    const cand = { seq, I: informativeness(r.b, tau), r, method: 'greedy from ' + name };
    if (better(cand, best)) best = cand;
  }
  const seq = best.seq, r = best.r, pick = best.method;
  const tiers = [];
  for (let t = 0; t + 1 < r.b.length; t++) tiers.push(seq.slice(r.b[t], r.b[t + 1]));
  const crossers = {};
  for (const [e, dirs] of r.jumpers) crossers[e] = [...dirs].sort().join('');
  // per context: entities outside their tier, with the tier they landed in (for the F grid tooltips)
  const tierOf = new Int32Array(n), bandOf = new Int32Array(n);
  tiers.forEach((t, i) => t.forEach(e => { tierOf[e] = i; }));
  for (let t = 0; t + 1 < r.b.length; t++) for (let p = r.b[t]; p < r.b[t + 1]; p++) bandOf[p] = t;
  const moved = orders.map(ord => { const m = []; ord.forEach((e, p) => { if (bandOf[p] !== tierOf[e]) m.push([e, bandOf[p] - tierOf[e]]); }); return m; });
  return { tiers, status: r.status, crossers, moved, held: r.held, strict: r.strict, informativeness: best.I, method: pick, capped, C, n };
}

if (typeof module !== 'undefined') module.exports = { search, evaluate, greedySearch, informativeness };
else self.onmessage = (ev) => self.postMessage(search(ev.data));
