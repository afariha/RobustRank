"""Build the compact JSON datasets used by the RobustRank web app.

Usage:
    python prep/build_data.py <raw-data-folder>
<raw-data-folder> holds CSrankings/, BRFSS/, CDC_Obesity/, UN_LifeExpectancy/ and Eurostat/
(default: the folder that contains this repository). Output goes to data/ in this repository.
Eurostat data is downloaded from the public Eurostat API (no key needed).
"""
import json, re, os, sys, urllib.request
import numpy as np
import pandas as pd

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(REPO)
OUT = os.path.join(REPO, 'data')
os.makedirs(OUT, exist_ok=True)


def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    print(f'{name}: {os.path.getsize(path) / 1e6:.2f} MB')


# ---------------------------------------------------------------- CSRankings
def csrankings():
    R = os.path.join(ROOT, 'CSrankings')
    cfg = open(os.path.join(R, 'src', 'config.ts')).read()
    parent = dict(re.findall(r"'([\w-]+)'\s*:\s*'(\w+)'", cfg[cfg.index('export const parentMap'):cfg.index('export const nextTier')]))
    nt = cfg[cfg.index('export const nextTier'):]
    next_tier = set(re.findall(r"'([\w-]+)'\s*:\s*true", nt[:nt.index('};')]))
    areas = []
    for g in ['aiAreas', 'systemsAreas', 'theoryAreas', 'interdisciplinaryAreas']:
        areas += re.search(r'export const ' + g + r' = \[(.*?)\]', cfg).group(1).replace('"', '').replace(' ', '').split(',')
    titles = dict(re.findall(r'\{\s*area\s*:\s*"(\w+)"\s*,\s*title\s*:\s*"([^"]+)"', cfg))
    raw = pd.read_csv(os.path.join(R, 'generated-author-info.csv'))
    total_rows = int(raw.year.between(2000, 2025).sum())
    inst = pd.read_csv(os.path.join(R, 'institutions.csv'))
    us = set(inst[inst.countryabbrv == 'us'].institution)
    d = raw[raw.dept.isin(us) & raw.year.between(2000, 2025)].copy()
    d['ar'] = d.area.map(lambda v: parent.get(v, v))
    d = d[d.ar.isin(areas)]
    d['tier'] = np.where(d.area.isin(next_tier), 1, 0)
    rank = d[d.year.between(2011, 2024)].groupby('dept').adjustedcount.sum().reindex(sorted(d.dept.unique()), fill_value=0)
    ents = list(rank.sort_values(ascending=False, kind='stable').index)   # ordered by adjusted pubs 2011-2024 (top-N basis)
    ei = {e: i for i, e in enumerate(ents)}
    ai = {a: i for i, a in enumerate(areas)}
    g = d.groupby(['dept', 'ar', 'tier', 'year']).agg(adj=('adjustedcount', 'sum'), raw=('count', 'sum'), rows=('name', 'size')).reset_index()
    cells = [[ei[r.dept], ai[r.ar], int(r.tier), int(r.year), round(float(r.adj), 4), round(float(r.raw), 2), int(r.rows)] for r in g.itertuples()]
    dump('csrankings.json', {'entities': ents, 'areas': areas, 'areaTitles': [titles.get(a, a) for a in areas],
                             'years': list(range(2000, 2026)), 'cells': cells, 'totalRows': total_rows,
                             'nextTierVenues': sorted(next_tier)})


# ---------------------------------------------------------------- CDC BRFSS respondents
def brfss():
    df = pd.read_parquet(os.path.join(ROOT, 'BRFSS', 'brfss_2011_2025.parquet'))
    total_rows = len(df)
    dims = {'sex': ['Female', 'Male'], 'age_group': ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
            'education': ['Less than high school', 'High school graduate', 'Some college', 'College graduate'],
            'income': ['<15k', '15-25k', '25-35k', '35-50k', '50k+']}
    for k, vals in dims.items():                       # last index = unknown (counted only when the axis is All)
        df[k + '_i'] = df[k].map({v: i for i, v in enumerate(vals)}).fillna(len(vals)).astype(int)
    states = sorted(df.state.unique())
    df['s_i'] = df.state.map({s: i for i, s in enumerate(states)})
    w = df.weight
    df['wB'] = np.where(df.bmi_cat.notna(), w, 0)
    df['wOb'] = np.where(df.bmi_cat == 'Obese', w, 0)
    df['wOw'] = np.where(df.bmi_cat == 'Overweight', w, 0)
    df['wI'] = np.where(df.inactive.notna(), w, 0)
    df['wIn'] = np.where(df.inactive == True, w, 0)
    g = df.groupby(['s_i', 'year', 'sex_i', 'age_group_i', 'education_i', 'income_i']).agg(
        n=('weight', 'size'), wB=('wB', 'sum'), wOb=('wOb', 'sum'), wOw=('wOw', 'sum'), wI=('wI', 'sum'), wIn=('wIn', 'sum')).reset_index()
    cells = [[int(r.s_i), int(r.year), int(r.sex_i), int(r.age_group_i), int(r.education_i), int(r.income_i), int(r.n),
              int(round(r.wB)), int(round(r.wOb)), int(round(r.wOw)), int(round(r.wI)), int(round(r.wIn))] for r in g.itertuples()]
    dump('brfss.json', {'entities': states, 'years': list(range(2011, 2026)), 'dims': dims, 'cells': cells, 'totalRows': total_rows})


# ---------------------------------------------------------------- CDC Nutrition, Physical Activity & Obesity (state summaries)
def npao():
    t = pd.read_csv(os.path.join(ROOT, 'CDC_Obesity', 'nutrition_physical_activity_obesity_brfss.csv'), low_memory=False)
    total_rows = len(t)
    t = t[~t.LocationAbbr.isin(['US', 'GU', 'PR', 'VI'])]
    strata = t[['StratificationCategory1', 'Stratification1']].drop_duplicates().sort_values(['StratificationCategory1', 'Stratification1'])
    groups = [(c, s) for c, s in strata.itertuples(index=False) if s != 'Data not reported']
    gi = {s: i for i, (c, s) in enumerate(groups)}
    states = sorted(t.LocationAbbr.unique()); si = {s: i for i, s in enumerate(states)}
    q = t[t.QuestionID.isin(['Q036', 'Q037', 'Q047']) & t.Stratification1.isin(gi)]
    p = q.pivot_table(index=['LocationAbbr', 'YearStart', 'Stratification1'], columns='QuestionID', values='Data_Value', aggfunc='first').reset_index()
    cells = []
    for r in p.itertuples(index=False):
        vals = [None if pd.isna(getattr(r, k)) else float(getattr(r, k)) for k in ['Q036', 'Q037', 'Q047']]
        cells.append([si[r.LocationAbbr], int(r.YearStart), gi[r.Stratification1]] + vals)
    rowcount = t.groupby(['YearStart', 'Stratification1']).size()
    rows = [[int(y), gi[s], int(n)] for (y, s), n in rowcount.items() if s in gi]
    dump('npao.json', {'entities': states, 'years': sorted(int(y) for y in t.YearStart.unique()),
                       'groups': [{'category': c, 'label': s} for c, s in groups], 'cells': cells, 'rows': rows, 'totalRows': total_rows})


# ---------------------------------------------------------------- UN life expectancy (Our World in Data)
def unle():
    parts = []
    for sx in ['female', 'male']:
        t = pd.read_csv(os.path.join(ROOT, 'UN_LifeExpectancy', f'remaining-life-expectancy-at-different-ages-{sx}s.csv'))
        t = t[t.code.astype(str).str.fullmatch(r'[A-Z]{3}') | (t.code == 'OWID_KOS')]   # countries only (no regions or income groups)
        long = t.melt(id_vars=['entity', 'code', 'year'], var_name='col', value_name='le').dropna()
        long['age'] = long.col.str.extract(r'age_(\d+)').astype(int)
        long['sex'] = 0 if sx == 'female' else 1
        parts.append(long)
    T = pd.concat(parts)
    total_rows = len(T)
    T = T[T.year.between(1990, 2023)]
    ages = sorted(int(a) for a in T.age.unique())
    ents = sorted(T.entity.unique()); ei = {e: i for i, e in enumerate(ents)}
    cells = [[ei[r.entity], int(r.year), int(r.sex), ages.index(int(r.age)), round(float(r.le), 2)] for r in T.itertuples()]
    dump('unle.json', {'entities': ents, 'years': list(range(1990, 2024)), 'ages': ages, 'cells': cells, 'totalRows': total_rows})


# ---------------------------------------------------------------- Eurostat unemployment
def eurostat():
    url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_a?format=JSON&lang=EN&unit=PC_ACT&sinceTimePeriod=2005'
    cache = os.path.join(ROOT, 'Eurostat', 'une_rt_a.json')   # fetched with: curl -o Eurostat/une_rt_a.json "<url>"
    if os.path.exists(cache):
        d = json.load(open(cache))
    else:
        d = json.load(urllib.request.urlopen(url, timeout=120))
    ids, size = d['id'], d['size']
    cat = {k: d['dimension'][k]['category'] for k in ids}
    order = {k: sorted(cat[k]['index'], key=lambda c: cat[k]['index'][c]) for k in ids}
    geos = [g for g in order['geo'] if not re.search(r'\d', g) and not g.startswith(('EU', 'EA'))]
    sexes, ages, years = ['T', 'F', 'M'], order['age'], order['time']
    cells = []
    strides = [int(np.prod(size[i + 1:])) for i in range(len(size))]
    for key, val in d['value'].items():
        k = int(key); idx = {}
        for i, dim in enumerate(ids):
            idx[dim] = order[dim][k // strides[i] % size[i]]
        if idx['geo'] not in geos: continue
        cells.append([geos.index(idx['geo']), int(idx['time']), sexes.index(idx['sex']), ages.index(idx['age']), float(val)])
    dump('eurostat.json', {'entities': [cat['geo']['label'][g] for g in geos], 'years': [int(y) for y in years],
                           'sexes': ['Total', 'Females', 'Males'], 'ages': [cat['age']['label'][a].replace('From ', '').replace(' years', '') for a in ages],
                           'cells': cells, 'totalRows': len(d['value'])})


if __name__ == '__main__':
    only = sys.argv[2:]   # optional dataset names, e.g. unle
    for f in [csrankings, brfss, npao, unle, eurostat]:
        if not only or f.__name__ in only: f()
