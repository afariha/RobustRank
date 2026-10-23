// Robust tier search (runs in a Web Worker).
//
// Input: one ranking per context (entity indices, best first) over the same n entities.
// A tiered ranking HOLDS in a context if every entity's position falls inside its tier's positions,
// except "borderline" entities that sit in the tier directly above or below.
//   - at most floor(borderline * tier size) borderline entities per tier,
//   - each borderline entity may cross in at most floor(crossing * #contexts) contexts.
// Robustness = held contexts / all contexts. Goal: the most tiers with robustness >= minRobustness.
// Two searches are run and the one with more tiers wins (ties: more held, then more strictly held):
//   1. greedy: add the tier boundary that keeps the most contexts holding, while robustness stays >= minimum,
//      starting from three base orders (mean rank, median rank, and the exact search's order);
//   2. exact (no crossings): depth-first search over boundaries, grouping contexts by their top-j sets.

function evaluate(orders, seq, cuts, borderline, crossing) {
  const n = seq.length, C = orders.length;
  const b = [0, ...[...cuts].sort((a, c) => a - c), n];
  const T = b.length - 1;
  const bandOf = new Int32Array(n), tierOf = new Int32Array(n);
  for (let t = 0; t < T; t++) for (let p = b[t]; p < b[t + 1]; p++) { bandOf[p] = t; tierOf[seq[p]] = t; }
  const caps = [];
  for (let t = 0; t < T; t++) caps.push(Math.floor(borderline * (b[t + 1] - b[t]) + 1e-9));
  const budget = Math.floor(crossing * C + 1e-9);
  const out = new Array(C);
  for (let c = 0; c < C; c++) {
    const o = []; let bad = false; const ord = orders[c];
    for (let p = 0; p < n; p++) {
      const e = ord[p], d = bandOf[p] - tierOf[e];
      if (d !== 0) { if (d > 1 || d < -1) { bad = true; break; } o.push([e, d]); }
    }
    out[c] = bad ? null : o;
  }
  const status = new Array(C).fill('R');
  let strict = 0;
  for (let c = 0; c < C; c++) if (out[c] && out[c].length === 0) { status[c] = 'G'; strict++; }
  const jumpers = new Map(), used = new Map(), perTier = new Int32Array(T);
  if (budget > 0) {
    const cand = [];
    for (let c = 0; c < C; c++) if (out[c] && out[c].length) cand.push(c);
    cand.sort((a, c) => out[a].length - out[c].length || a - c);
    for (const c of cand) {
      const o = out[c];
      let ok = true; const add = new Int32Array(T);
      for (const [e] of o) {
        if ((used.get(e) || 0) >= budget) { ok = false; break; }
        if (!jumpers.has(e)) add[tierOf[e]]++;
      }
      if (ok) for (let t = 0; t < T; t++) if (perTier[t] + add[t] > caps[t]) { ok = false; break; }
      if (!ok) continue;
      for (const [e, d] of o) {
        if (!jumpers.has(e)) { jumpers.set(e, new Set()); perTier[tierOf[e]]++; }
        jumpers.get(e).add(d < 0 ? 'u' : 'd');
        used.set(e, (used.get(e) || 0) + 1);
      }
      status[c] = 'Y';
    }
  }
  const held = status.filter(s => s !== 'R').length;
  return { held, strict, status, jumpers, b };
}

function greedySearch(orders, seq, minRob, borderline, crossing) {
  const n = seq.length, C = orders.length, need = Math.ceil(minRob * C - 1e-9);
  const cuts = [];
  for (;;) {
    let best = null;
    for (let j = 1; j < n; j++) {
      if (cuts.includes(j)) continue;
      const r = evaluate(orders, seq, cuts.concat([j]), borderline, crossing);
      if (r.held >= need && (!best || r.held > best.r.held || (r.held === best.r.held && r.strict > best.r.strict))) best = { j, r };
    }
    if (!best) break;
    cuts.push(best.j);
  }
  return cuts;
}

function exactStrict(orders, minRob, workCap, timeCap) {
  const C = orders.length, n = orders[0].length, need = Math.ceil(minRob * C - 1e-9);
  // random 2x32-bit codes per entity; prefix sums identify each context's top-j set
  const r1 = new Uint32Array(n), r2 = new Uint32Array(n);
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  for (let e = 0; e < n; e++) { r1[e] = rnd(); r2[e] = rnd(); }
  const h1 = [], h2 = [];
  for (let c = 0; c < C; c++) {
    const a = new Uint32Array(n + 1), z = new Uint32Array(n + 1);
    for (let p = 0; p < n; p++) { a[p + 1] = (a[p] + r1[orders[c][p]]) >>> 0; z[p + 1] = (z[p] + r2[orders[c][p]]) >>> 0; }
    h1.push(a); h2.push(z);
  }
  let best = { cuts: [], ctx: [...Array(C).keys()] }, work = 0, stop = false;
  const t0 = Date.now();
  function dfs(last, ctx, cuts) {
    if (stop) return;
    if (cuts.length > best.cuts.length || (cuts.length === best.cuts.length && ctx.length > best.ctx.length)) best = { cuts, ctx };
    if (cuts.length + (n - 1 - last) <= best.cuts.length) return;
    for (let j = last + 1; j < n; j++) {
      const groups = new Map();
      work += ctx.length;
      if ((work & 0xfff) < ctx.length && (work > workCap || Date.now() - t0 > timeCap)) { stop = true; return; }
      for (const c of ctx) {
        const key = h1[c][j] + ',' + h2[c][j];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      }
      for (const g of groups.values()) if (g.length >= need) dfs(j, g, cuts.concat([j]));
      if (stop) return;
    }
  }
  dfs(0, best.ctx, []);
  return { seq: orders[best.ctx[0]], cuts: best.cuts, capped: stop };
}

function search({ orders, minRobustness, borderline, crossing }) {
  const C = orders.length, n = orders[0].length;
  // greedy search from three base orders (mean rank, median rank, the exact search's order), plus the exact strict search
  const mean = new Float64Array(n), ranks = Array.from({ length: n }, () => []);
  for (const ord of orders) ord.forEach((e, p) => { mean[e] += p; ranks[e].push(p); });
  const med = ranks.map(r => r.sort((a, b) => a - b)[r.length >> 1]);
  const ex = exactStrict(orders, minRobustness, 4e8, 4000);
  const seqs = [[...Array(n).keys()].sort((a, b) => mean[a] - mean[b] || a - b),
                [...Array(n).keys()].sort((a, b) => med[a] - med[b] || mean[a] - mean[b] || a - b), ex.seq];
  const better = (a, b) => !b || a.T > b.T || (a.T === b.T && (a.r.held > b.r.held || (a.r.held === b.r.held && a.r.strict > b.r.strict)));
  let best = null;
  seqs.forEach((seq, i) => {
    const cuts = greedySearch(orders, seq, minRobustness, borderline, crossing);
    const cand = { seq, T: cuts.length + 1, r: evaluate(orders, seq, cuts, borderline, crossing), method: ['greedy (mean rank)', 'greedy (median rank)', 'greedy (exact order)'][i] };
    if (better(cand, best)) best = cand;
  });
  const candE = { seq: ex.seq, T: ex.cuts.length + 1, r: evaluate(orders, ex.seq, ex.cuts, borderline, crossing), method: 'exact strict' };
  if (better(candE, best)) best = candE;
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
  return { tiers, status: r.status, crossers, moved, held: r.held, strict: r.strict, method: pick, capped: ex.capped, C, n };
}

if (typeof module !== 'undefined') module.exports = { search, evaluate, exactStrict };
else self.onmessage = (ev) => self.postMessage(search(ev.data));
