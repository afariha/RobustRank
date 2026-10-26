// Dataset adapters. Each adapter turns a compact JSON file (data/*.json, built by prep/build_data.py)
// into: entity sets, ranking functions, context axes, one score per (entity, context), and support counts.
//
// A context is { year, v: [value index per axis] }; value index -1 means "All" (axis not filtered).
// score(...) returns NaN when an entity has no data in a context; such entities are excluded (and listed).

(function (root) {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  // ------------------------------------------------------------------ CSRankings
  const CSR_SHORT = {
    'Carnegie Mellon University': 'Carnegie Mellon', 'Univ. of Illinois at Urbana-Champaign': 'UIUC', 'Georgia Institute of Technology': 'Georgia Tech',
    'Univ. of California - San Diego': 'UC San Diego', 'Cornell University': 'Cornell', 'Massachusetts Inst. of Technology': 'MIT',
    'Northeastern University': 'Northeastern', 'Stanford University': 'Stanford', 'Univ. of California - Berkeley': 'UC Berkeley',
    'Univ. of Maryland - College Park': 'Maryland', 'University of Michigan': 'Michigan', 'University of Washington': 'U of Washington',
    'New York University': 'NYU', 'Purdue University': 'Purdue', 'Princeton University': 'Princeton',
    'University of Texas at Austin': 'UT Austin', 'University of Wisconsin - Madison': 'Wisconsin', 'Columbia University': 'Columbia',
    'Univ. of California - Irvine': 'UC Irvine', 'Univ. of California - Los Angeles': 'UCLA', 'Univ. of Massachusetts Amherst': 'UMass Amherst',
    'University of Pennsylvania': 'Penn', 'University of Southern California': 'USC', 'Arizona State University': 'Arizona State',
    'Boston University': 'Boston Univ.', 'Brown University': 'Brown', 'Duke University': 'Duke', 'George Mason University': 'George Mason',
    'Harvard University': 'Harvard', 'Indiana University': 'Indiana', 'Johns Hopkins University': 'Johns Hopkins',
    'North Carolina State University': 'NC State', 'Northwestern University': 'Northwestern', 'Ohio State University': 'Ohio State',
    'Oregon State University': 'Oregon State', 'Pennsylvania State University': 'Penn State', 'Rice University': 'Rice',
    'Rutgers University': 'Rutgers', 'Stony Brook University': 'Stony Brook', 'Texas A&M University': 'Texas A&M',
    'Univ. of California - Davis': 'UC Davis', 'Univ. of California - Riverside': 'UC Riverside', 'Univ. of California - Santa Barbara': 'UC Santa Barbara',
    'Univ. of California - Santa Cruz': 'UC Santa Cruz', 'University of Central Florida': 'Central Florida', 'University of Chicago': 'UChicago',
    'University of Colorado Boulder': 'CU Boulder', 'University of Illinois at Chicago': 'UI Chicago', 'University of Minnesota': 'Minnesota',
    'University of North Carolina': 'UNC Chapel Hill', 'University of Texas at Dallas': 'UT Dallas', 'University of Utah': 'Utah',
    'University of Virginia': 'U of Virginia', 'Virginia Tech': 'Virginia Tech', 'Yale University': 'Yale', 'University at Buffalo': 'Buffalo',
    'University of Rochester': 'Rochester', 'University of Notre Dame': 'Notre Dame', 'Washington University in St. Louis': 'WashU St. Louis',
    'California Inst. of Technology': 'Caltech', 'Univ. of California - Merced': 'UC Merced', 'University of Florida': 'Florida',
    'University of Arizona': 'Arizona', 'University of Pittsburgh': 'Pitt', 'Dartmouth College': 'Dartmouth',
    'Michigan State University': 'Michigan State', 'Iowa State University': 'Iowa State', 'University of Southern Florida': 'USF',
    'University of South Florida': 'USF', 'Clemson University': 'Clemson', 'Drexel University': 'Drexel', 'Lehigh University': 'Lehigh',
    'Florida State University': 'Florida State', 'Florida International University': 'FIU', 'University of Georgia': 'Georgia',
    'University of Houston': 'Houston', 'University of Iowa': 'Iowa', 'University of Oregon': 'Oregon', 'Tufts University': 'Tufts',
    'Vanderbilt University': 'Vanderbilt', 'Emory University': 'Emory', 'Case Western Reserve University': 'Case Western',
    'Colorado State University': 'Colorado State', 'Temple University': 'Temple', 'University of Delaware': 'Delaware',
    'University of Connecticut': 'UConn', 'University of Kentucky': 'Kentucky', 'Rensselaer Polytechnic Institute': 'RPI',
    'Stevens Institute of Technology': 'Stevens', 'Worcester Polytechnic Institute': 'WPI', 'Syracuse University': 'Syracuse',
    'Washington State University': 'Washington State', 'University of Nebraska': 'Nebraska', 'University of Tennessee': 'Tennessee',
    'Shanghai Jiao Tong University': 'Shanghai Jiao Tong', 'Nanyang Technological University': 'NTU Singapore',
    'National University of Singapore': 'NUS', 'Chinese University of Hong Kong': 'CUHK', 'Chinese Academy of Sciences': 'CAS',
    'Seoul National University': 'Seoul National', 'Max Planck Society': 'Max Planck', 'University of Hong Kong': 'HKU',
    'Harbin Institute of Technology': 'Harbin Tech', 'Renmin University of China': 'Renmin', 'Imperial College London': 'Imperial',
    'University of British Columbia': 'UBC', 'Singapore Management University': 'SMU Singapore', 'CISPA Helmholtz Center': 'CISPA',
    'University College London': 'UCL', 'Hebrew University of Jerusalem': 'Hebrew Univ.', 'The Hong Kong Polytechnic Univ.': 'HK PolyU',
    'Tel Aviv University': 'Tel Aviv', 'Simon Fraser University': 'Simon Fraser', 'Sun Yat-sen University': 'Sun Yat-sen',
    'University of Toronto': 'Toronto', 'University of Waterloo': 'Waterloo', 'University of Oxford': 'Oxford',
    'University of Cambridge': 'Cambridge', 'University of Edinburgh': 'Edinburgh', 'University of Tokyo': 'Tokyo',
  };
  const shortUni = (s) => CSR_SHORT[s] || s.replace(/^University of /, '').replace(/^Univ\. of /, '').replace(/ University$/, '')
    .replace(/Institute of Technology/, 'Tech').replace(/Inst\. of Technology/, 'Tech');

  const CSR_WINDOWS = [3, 5, 8, 10];   // publication window lengths in years
  const csrankings = {
    id: 'csrankings', name: 'CSRankings', file: 'data/csrankings.json',
    attributes: ['Year', 'Window', 'Venue tier', 'Area'],
    // top-k by adjusted publications 2011-2024, among US departments or worldwide
    entitySets: [60, 100, 200].map(k => ({ id: `us-${k}`, label: `top ${k} US CS departments` }))
      .concat([60, 80, 100, 500].map(k => ({ id: `world-${k}`, label: `top ${k} CS departments worldwide` }))),
    defaultEntitySet: 'us-60',
    functions: [
      { id: 'csr', name: 'CSRankings score', dir: 'DESC' },
      { id: 'csrraw', name: 'CSRankings score (raw counts)', dir: 'DESC' },
      { id: 'total', name: 'Total publications', dir: 'DESC' },
    ],
    formula(P, fn, spec) {
      const areaSel = spec.sel.area, over = !areaSel.length || (areaSel.length === 1 && areaSel[0] === -1) ? `${P.areas.length} areas` : 'the context’s areas';
      const count = fn === 'csrraw' ? ['Counting', 'raw: one per paper per author'] : ['Counting', 'adjusted: credit split among co-authors'];
      const head = fn === 'total' ? `Sum over ${over} of <b>Pubs</b>` : `Geometric mean over ${over} of (<b>Pubs</b> + 1)`;
      return { head, notes: [['Pubs', 'papers in the area’s venues'], count] };
    },
    prepare(raw) {
      const Y0 = raw.years[0], NY = raw.years.length, A = raw.areas.length, E = raw.entities.length;
      const stride = NY + 1, idx = (e, a, t) => ((e * A + a) * 2 + t) * stride;
      // prefix sums over years of adjusted pubs, raw pubs and data rows, per (entity, area, venue tier)
      const adj = new Float64Array(E * A * 2 * stride), cnt = new Float64Array(E * A * 2 * stride), rowsA = new Float64Array(E * A * 2 * stride);
      for (const [e, a, t, y, ad, r, n] of raw.cells) { const k = idx(e, a, t) + 1 + y - Y0; adj[k] += ad; cnt[k] += r; rowsA[k] += n; }
      for (const arr of [adj, cnt, rowsA]) for (let k = 0; k < E * A * 2; k++) for (let y = 1; y <= NY; y++) arr[k * stride + y] += arr[k * stride + y - 1];
      return { ...raw, Y0, NY, A, adj, cnt, rowsA, idx, stride };
    },
    // label shown in panel A; says "all n" when the data has fewer departments than requested
    setLabel(P, set) {
      const n = this.entities(P, set.id).length, [scope, k] = set.id.split('-');
      return n < +k ? `all ${n} ${scope === 'us' ? 'US CS departments' : 'CS departments worldwide'}` : set.label;
    },
    entities(P, set) {
      const [scope, k] = String(set).split('-');
      const all = range(0, P.entities.length - 1);   // entities are in worldwide order
      return (scope === 'us' ? all.filter(e => P.countries[e] === 'us') : all).slice(0, +k);
    },
    entityName(P, e) { return P.entities[e]; },
    shortName(P, e) { return shortUni(P.entities[e]); },
    yearRange(P) { return [P.years[0], P.years[P.years.length - 1]]; },
    axes(P) {
      return [
        { id: 'window', name: 'Window', values: CSR_WINDOWS.map(w => `${w} years`), short: CSR_WINDOWS.map(w => `${w} yr`), all: false, raw: CSR_WINDOWS },
        { id: 'venue', name: 'Venue tier', values: ['Top-tier only', 'Next-tier only', 'Top + next tier'], short: ['Top', 'Next', 'Top+next'], all: false },
        { id: 'area', name: 'Area', values: P.areaTitles, short: P.areaTitles, all: true },
      ];
    },
    gridOrder: ['venue', 'window', 'area'],
    defaults: { years: [2021, 2025], fn: 'csr', sel: { window: [2, 3], venue: [0, 2], area: [] }, tolerance: { minRobustness: 0.85 } },
    score(P, fn, e, ctx) {
      const [wi, vi, ai] = ctx.v, w = CSR_WINDOWS[wi];
      const lo = Math.max(ctx.year - w + 1, P.Y0) - P.Y0, hi = ctx.year - P.Y0 + 1;
      const tiers = vi === 0 ? [0] : vi === 1 ? [1] : [0, 1];
      const areas = ai === -1 ? range(0, P.A - 1) : [ai];
      const src = fn === 'csrraw' ? P.cnt : P.adj;
      let logSum = 0, total = 0;
      for (const a of areas) {
        let v = 0;
        for (const t of tiers) { const k = P.idx(e, a, t); v += src[k + hi] - src[k + lo]; }
        logSum += Math.log(v + 1); total += v;
      }
      return fn === 'total' ? total : Math.exp(logSum / areas.length);
    },
    support(P, set, spec) {
      const ws = spec.sel.window.map(i => CSR_WINDOWS[i]);
      const lo = Math.max(spec.years[0] - Math.max(...ws) + 1, P.Y0) - P.Y0, hi = spec.years[1] - P.Y0 + 1;
      const tiers = new Set(); for (const v of spec.sel.venue) (v === 0 ? [0] : v === 1 ? [1] : [0, 1]).forEach(t => tiers.add(t));
      const areas = !spec.sel.area.length || spec.sel.area.includes(-1) ? range(0, P.A - 1) : spec.sel.area;
      let n = 0;
      for (const e of this.entities(P, set)) for (const a of areas) for (const t of tiers) { const k = P.idx(e, a, t); n += P.rowsA[k + hi] - P.rowsA[k + lo]; }
      return Math.round(n);
    },
    possibleContexts(P) { return P.years.length * CSR_WINDOWS.length * (P.areas.length + 1) * 3; },
  };

  // ------------------------------------------------------------------ shared: health scores
  const HEALTH_FNS = [
    { id: 'hrs', name: 'Health Risk Score', dir: 'ASC' },
    { id: 'obese', name: 'Obesity rate', dir: 'ASC' },
    { id: 'inactive', name: 'Physical inactivity rate', dir: 'ASC' },
  ];
  const healthFormula = (fn) => {
    const notes = { Obese: '% of adults with BMI 30 or more', Overweight: '% of adults with BMI 25 to 30', Inactive: '% of adults with no leisure-time activity' };
    if (fn === 'obese') return { head: '<b>Obese</b>', notes: [['Obese', notes.Obese]] };
    if (fn === 'inactive') return { head: '<b>Inactive</b>', notes: [['Inactive', notes.Inactive]] };
    return { head: '0.5·<b>Obese</b> + 0.3·<b>Inactive</b> + 0.2·<b>Overweight</b>', notes: Object.entries(notes) };
  };
  const healthScore = (fn, ob, ow, ina) => fn === 'obese' ? ob : fn === 'inactive' ? ina : 0.5 * ob + 0.3 * ina + 0.2 * ow;
  const STATE_NAMES = {
    AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia',
    DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky',
    LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi',
    MT: 'Montana', NC: 'North Carolina', ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
    NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia', VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin',
    WV: 'West Virginia', WY: 'Wyoming',
  };

  // ------------------------------------------------------------------ CDC BRFSS respondent microdata
  const BRFSS_AXES = [['sex', 'Sex'], ['age_group', 'Age group'], ['education', 'Education'], ['income', 'Income']];
  const brfss = {
    id: 'brfss', name: 'CDC BRFSS survey', file: 'data/brfss.json',
    attributes: ['Year', 'Sex', 'Age group', 'Education', 'Income'],
    entitySets: [{ id: 'all', label: '51 US states' }], defaultEntitySet: 'all',
    functions: HEALTH_FNS,
    formula(P, fn) { const f = healthFormula(fn); f.notes = f.notes.concat([['Weights', 'survey weights; cells with under 50 respondents are missing']]); return f; },
    minN: 50,
    prepare(raw) {
      const byYear = new Map();
      for (const c of raw.cells) { if (!byYear.has(c[1])) byYear.set(c[1], []); byYear.get(c[1]).push(c); }
      return { ...raw, byYear, cache: new Map() };
    },
    entities(P) { return range(0, P.entities.length - 1); },
    entityName(P, e) { return STATE_NAMES[P.entities[e]] || P.entities[e]; },
    shortName(P, e) { return P.entities[e]; },
    yearRange(P) { return [P.years[0], P.years[P.years.length - 1]]; },
    axes(P) { return BRFSS_AXES.map(([id, name]) => ({ id, name, values: P.dims[id], short: P.dims[id], all: true })); },
    defaults: { years: [2011, 2018], fn: 'hrs', sel: { sex: [0, 1], age_group: [], education: [], income: [] }, tolerance: { minRobustness: 0.4 } },
    // aggregate all entities for one context at once (cached), then read per entity
    agg(P, ctx) {
      const key = ctx.year + '|' + ctx.v.join(',');
      if (P.cache.has(key)) return P.cache.get(key);
      const S = P.entities.length, acc = new Float64Array(S * 6);
      for (const c of P.byYear.get(ctx.year) || []) {
        if ((ctx.v[0] !== -1 && c[2] !== ctx.v[0]) || (ctx.v[1] !== -1 && c[3] !== ctx.v[1]) || (ctx.v[2] !== -1 && c[4] !== ctx.v[2]) || (ctx.v[3] !== -1 && c[5] !== ctx.v[3])) continue;
        for (let k = 0; k < 6; k++) acc[c[0] * 6 + k] += c[6 + k];
      }
      P.cache.set(key, acc);
      return acc;
    },
    score(P, fn, e, ctx) {
      const a = this.agg(P, ctx), [n, wB, wOb, wOw, wI, wIn] = a.subarray(e * 6, e * 6 + 6);
      if (n < this.minN || wB <= 0 || wI <= 0) return NaN;
      return healthScore(fn, 100 * wOb / wB, 100 * wOw / wB, 100 * wIn / wI);
    },
    support(P, set, spec) {
      const sel = BRFSS_AXES.map(([id]) => spec.sel[id].length && !spec.sel[id].includes(-1) ? new Set(spec.sel[id]) : null);
      let n = 0;
      for (let y = spec.years[0]; y <= spec.years[1]; y++) for (const c of P.byYear.get(y) || []) {
        if (sel.every((s, i) => !s || s.has(c[2 + i]))) n += c[6];
      }
      return n;
    },
    possibleContexts(P) { return P.years.length * BRFSS_AXES.reduce((m, [id]) => m * (P.dims[id].length + 1), 1); },
  };

  // ------------------------------------------------------------------ CDC Nutrition, Physical Activity & Obesity (state estimates)
  const npao = {
    id: 'npao', name: 'CDC obesity estimates', file: 'data/npao.json',
    attributes: ['Year', 'Subgroup'],
    entitySets: [{ id: 'all', label: '51 US states' }], defaultEntitySet: 'all',
    functions: HEALTH_FNS,
    formula(P, fn) { const f = healthFormula(fn); f.notes = f.notes.concat([['Values', 'state estimates published by CDC']]); return f; },
    prepare(raw) {
      const val = new Map();
      for (const [s, y, g, ob, ow, ina] of raw.cells) val.set(`${s}|${y}|${g}`, [ob, ow, ina]);
      const rows = new Map(raw.rows.map(([y, g, n]) => [`${y}|${g}`, n]));
      // value order: Total, Sex, Age, Education, Income, Race/Ethnicity
      const catOrder = ['Total', 'Sex', 'Age (years)', 'Education', 'Income', 'Race/Ethnicity'];
      const order = raw.groups.map((g, i) => i).sort((a, b) => catOrder.indexOf(raw.groups[a].category) - catOrder.indexOf(raw.groups[b].category) || a - b);
      return { ...raw, val, rowsMap: rows, order };
    },
    entities(P) { return range(0, P.entities.length - 1); },
    entityName(P, e) { return STATE_NAMES[P.entities[e]] || P.entities[e]; },
    shortName(P, e) { return P.entities[e]; },
    yearRange(P) { return [P.years[0], P.years[P.years.length - 1]]; },
    axes(P) {
      const label = (g) => g.category === 'Age (years)' ? 'Age ' + g.label.replace(/ - /, ' to ') : g.label.replace(/ - /, ' to ');
      return [{ id: 'group', name: 'Subgroup', values: P.groups.map(label), short: P.groups.map(label), all: false, order: P.order,
                categories: P.groups.map(g => g.category === 'Age (years)' ? 'Age' : g.category) }];
    },
    defaults: { years: [2013, 2018], fn: 'hrs', sel: {} },
    defaultSel(P) { const f = (l) => P.groups.findIndex(g => g.label === l); return { group: [f('Total'), f('Female'), f('Male')] }; },
    score(P, fn, e, ctx) {
      const v = P.val.get(`${e}|${ctx.year}|${ctx.v[0]}`);
      if (!v || v.some(x => x === null)) return NaN;
      return healthScore(fn, v[0], v[1], v[2]);
    },
    support(P, set, spec) {
      let n = 0;
      for (let y = spec.years[0]; y <= spec.years[1]; y++) for (const g of spec.sel.group) n += P.rowsMap.get(`${y}|${g}`) || 0;
      return n;
    },
    possibleContexts(P) { return P.years.length * P.groups.length; },
  };

  // ------------------------------------------------------------------ UN World Population Prospects: remaining life expectancy
  const OECD = 'Australia,Austria,Belgium,Canada,Chile,Colombia,Costa Rica,Czechia,Denmark,Estonia,Finland,France,Germany,Greece,Hungary,Iceland,Ireland,Israel,Italy,Japan,South Korea,Latvia,Lithuania,Luxembourg,Mexico,Netherlands,New Zealand,Norway,Poland,Portugal,Slovakia,Slovenia,Spain,Sweden,Switzerland,Turkey,United Kingdom,United States'.split(',');
  const G20 = 'Argentina,Australia,Brazil,Canada,China,France,Germany,India,Indonesia,Italy,Japan,Mexico,Russia,Saudi Arabia,South Africa,South Korea,Turkey,United Kingdom,United States'.split(',');
  const EU27 = 'Austria,Belgium,Bulgaria,Croatia,Cyprus,Czechia,Denmark,Estonia,Finland,France,Germany,Greece,Hungary,Ireland,Italy,Latvia,Lithuania,Luxembourg,Malta,Netherlands,Poland,Portugal,Romania,Slovakia,Slovenia,Spain,Sweden'.split(',');
  const COUNTRY_SHORT = { 'United States': 'USA', 'United Kingdom': 'UK', 'South Korea': 'Korea', 'New Zealand': 'New Zealand', 'Bosnia and Herzegovina': 'Bosnia & Herz.', 'North Macedonia': 'N. Macedonia', 'Saudi Arabia': 'Saudi Arabia', 'South Africa': 'South Africa' };
  const unle = {
    id: 'unle', name: 'UN life expectancy', file: 'data/unle.json',
    attributes: ['Year', 'Sex', 'Age'],
    entitySets: [{ id: 'oecd', label: '38 OECD countries' }, { id: 'g20', label: '19 G20 countries' }, { id: 'all', label: 'all 237 countries' }],
    defaultEntitySet: 'g20',
    functions: [{ id: 'le', name: 'Remaining life expectancy', dir: 'DESC' }],
    formula() { return { head: 'Expected remaining years of life at <b>Age</b>', notes: [['Age', 'the context’s age'], ['Source', 'UN World Population Prospects (period)']] }; },
    prepare(raw) {
      const val = new Map();
      for (const [c, y, s, a, le] of raw.cells) val.set(`${c}|${y}|${s}|${a}`, le);
      return { ...raw, val };
    },
    entities(P, set) {
      if (set === 'all') return range(0, P.entities.length - 1);
      const names = set === 'g20' ? G20 : OECD;
      return names.map(n => P.entities.indexOf(n)).filter(i => i >= 0);
    },
    entityName(P, e) { return P.entities[e]; },
    shortName(P, e) { return COUNTRY_SHORT[P.entities[e]] || P.entities[e]; },
    yearRange(P) { return [P.years[0], P.years[P.years.length - 1]]; },
    axes(P) {
      const ages = P.ages.map(a => a === 0 ? 'at birth' : `at ${a}`);
      return [{ id: 'sex', name: 'Sex', values: ['Female', 'Male'], short: ['F', 'M'], all: false },
              { id: 'age', name: 'Age', values: ages, short: ages, all: false }];
    },
    defaults: { years: [2014, 2019], fn: 'le', sel: { sex: [0, 1], age: [0, 4, 5] } },
    score(P, fn, e, ctx) { const v = P.val.get(`${e}|${ctx.year}|${ctx.v[0]}|${ctx.v[1]}`); return v === undefined ? NaN : v; },
    support(P, set, spec) {
      let n = 0;
      for (const e of this.entities(P, set)) for (let y = spec.years[0]; y <= spec.years[1]; y++)
        for (const s of spec.sel.sex) for (const a of spec.sel.age) if (P.val.has(`${e}|${y}|${s}|${a}`)) n++;
      return n;
    },
    possibleContexts(P) { return P.years.length * 2 * P.ages.length; },
  };

  // ------------------------------------------------------------------ Eurostat unemployment rates
  const eurostat = {
    id: 'eurostat', name: 'Eurostat unemployment', file: 'data/eurostat.json',
    attributes: ['Year', 'Sex', 'Age'],
    entitySets: [{ id: 'eu', label: '27 EU countries' }, { id: 'all', label: '35 European countries' }], defaultEntitySet: 'eu',
    functions: [{ id: 'unemp', name: 'Unemployment rate', dir: 'ASC' }],
    formula() { return { head: '100 · <b>Unemployed</b> / <b>Labour force</b>', notes: [['Unemployed', 'people without work, seeking work'], ['Labour force', 'employed plus unemployed people']] }; },
    prepare(raw) {
      const val = new Map();
      for (const [c, y, s, a, r] of raw.cells) val.set(`${c}|${y}|${s}|${a}`, r);
      return { ...raw, val };
    },
    entities(P, set) {
      if (set === 'all') return range(0, P.entities.length - 1);
      return EU27.map(n => P.entities.indexOf(n)).filter(i => i >= 0);
    },
    entityName(P, e) { return P.entities[e]; },
    shortName(P, e) { return COUNTRY_SHORT[P.entities[e]] || P.entities[e]; },
    yearRange(P) { return [P.years[0], P.years[P.years.length - 1]]; },
    axes(P) {
      return [{ id: 'sex', name: 'Sex', values: P.sexes, short: P.sexes, all: false },
              { id: 'age', name: 'Age', values: P.ages, short: P.ages, all: false }];
    },
    defaults: { years: [2021, 2025], fn: 'unemp', sel: { sex: [0, 2], age: [2, 5] } },
    score(P, fn, e, ctx) { const v = P.val.get(`${e}|${ctx.year}|${ctx.v[0]}|${ctx.v[1]}`); return v === undefined ? NaN : v; },
    support(P, set, spec) {
      let n = 0;
      for (const e of this.entities(P, set)) for (let y = spec.years[0]; y <= spec.years[1]; y++)
        for (const s of spec.sel.sex) for (const a of spec.sel.age) if (P.val.has(`${e}|${y}|${s}|${a}`)) n++;
      return n;
    },
    possibleContexts(P) { return P.years.length * P.sexes.length * P.ages.length; },
  };

  // ------------------------------------------------------------------ contexts and rankings (shared)
  // Values selected on each axis; an empty selection on an axis that allows All means [All] (-1).
  function axisValues(ds, P, spec) {
    return ds.axes(P).map(ax => {
      const s = spec.sel[ax.id] || [];
      const rank = ax.order ? new Map(ax.order.map((v, i) => [v, i])) : null;   // display order of the axis values
      const key = (v) => v === -1 ? -1 : rank ? rank.get(v) : v;
      return s.length ? s.slice().sort((a, b) => key(a) - key(b)) : (ax.all ? [-1] : []);
    });
  }
  function contexts(ds, P, spec) {
    const vals = axisValues(ds, P, spec);
    let combos = [[]];
    for (const vs of vals) combos = combos.flatMap(c => vs.map(v => c.concat([v])));
    const out = [];
    for (let y = spec.years[0]; y <= spec.years[1]; y++) for (const v of combos) out.push({ year: y, v });
    return out;
  }
  // One ranking (entity positions in the entity list, best first) per context; entities missing anywhere are excluded.
  function rankings(ds, P, spec, ctxs) {
    const ents = ds.entities(P, spec.entitySet);
    const scores = ctxs.map(ctx => ents.map(e => ds.score(P, spec.fn, e, ctx)));
    const keep = ents.map((e, i) => scores.every(s => Number.isFinite(s[i])));
    const kept = ents.filter((e, i) => keep[i]), excluded = ents.filter((e, i) => !keep[i]);
    const sign = spec.dir === 'ASC' ? 1 : -1;
    const orders = scores.map(s => {
      const idx = []; ents.forEach((e, i) => { if (keep[i]) idx.push(i); });
      const pos = new Map(idx.map((i, k) => [i, k]));
      idx.sort((a, b) => sign * (s[a] - s[b]) || a - b);
      return idx.map(i => pos.get(i));
    });
    return { kept, excluded, orders, scores };
  }

  root.RR = { DATASETS: [csrankings, brfss, npao, unle, eurostat], axisValues, contexts, rankings };
  if (typeof module !== 'undefined') module.exports = root.RR;
})(typeof self !== 'undefined' ? self : globalThis);
