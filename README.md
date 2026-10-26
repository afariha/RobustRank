# RobustRank

RobustRank finds **robust tiered rankings**. The ranking function stays fixed. The app evaluates it on many slices of the data (**contexts**) and searches for the most informative tiered ranking that still holds in enough of those contexts.

- A **context** is one combination of values chosen on the context axes. The context space is the cross product of the chosen values, for example Year × Window × Venue tier.
- A tiered ranking **holds** in a context when every entity ranks inside its own tier in that context.
- **Robustness** is the share of contexts in which the tiered ranking holds. Putting every entity in one tier always holds, so the goal is the most informative tiering that keeps robustness at or above the minimum.
- **Informativeness** is the number of tiers minus a penalty for large tiers. A tier with at most τ entities (the penalty-free tier size, 10 by default) costs nothing. A larger tier costs 2^(size − τ) − 1, so the penalty grows exponentially with the tier's size.

## Tolerance parameters

| Parameter | Meaning |
|---|---|
| Minimum robustness | fraction of contexts where the ranking must hold |
| Borderline entities per tier | fraction of a tier's entities, rounded down, that may cross into the tier directly above or below in a context; the crossing entities may differ from context to context |
| Crossing frequency | fraction of contexts, rounded down, in which one entity may cross |
| Penalty-free tier size | tiers with at most this many entities are not penalized |

In panel F, each context is shown as:
- **holds**: green ✓
- **holds with crossings**: amber ↕
- **breaks**: red ×

## Datasets

| Dataset | Entities | Context axes | Ranking functions |
|---|---|---|---|
| CSRankings | top 20 to 100 US CS departments | Year, Window, Venue tier, Area | CSRankings score (geometric mean over areas of pubs + 1), raw-count variant, total pubs |
| CDC BRFSS survey (respondent microdata, 2011 to 2025) | 51 US states (DC included) | Year, Sex, Age group, Education, Income | Health Risk Score, obesity rate, physical inactivity rate (survey weighted) |
| CDC obesity estimates (Nutrition, Physical Activity, and Obesity table) | 51 US states | Year, Subgroup | same as BRFSS, from CDC's published state estimates |
| UN life expectancy (UN WPP via Our World in Data) | G20, OECD or all 237 countries | Year, Sex, Age | remaining life expectancy |
| Eurostat unemployment (une_rt_a) | EU 27 or 35 European countries | Year, Sex, Age | unemployment rate |

Entities are never dropped to improve a result. The only exception is an entity with no data in some chosen context. It is left out, and panel E lists it.

## Search

The search runs in the browser, inside a Web Worker. It is a greedy tier finder. It orders the entities by a reference order and starts with one tier. In each step, it adds the tier boundary that most raises informativeness, while robustness stays at or above the minimum. Ties go to the boundary that keeps the most contexts holding. Splitting a tier never raises the penalty, so it stops only when no boundary keeps the robustness.

The greedy runs from several reference orders: the median rank, the mean rank, and each context's own ranking. The most informative result wins, with ties going to the result that holds in more contexts. Once 4 s have passed, the remaining reference orders are skipped, so large inputs stay interactive.

## Run locally

It is a static site with no build step. Serve the folder with any static server:

```bash
npx serve .
```

## Deploy to Vercel

Import this GitHub repository in Vercel (**Add New → Project → Import**). Use framework preset **Other**, no build command, and output directory `.` (the root). Alternatively, run `npx vercel` in this folder.

## Rebuild the data

`data/*.json` are compact extracts built from the raw downloads:

```bash
python prep/build_data.py "<folder with CSrankings/, BRFSS/, CDC_Obesity/, UN_LifeExpectancy/, Eurostat/>"
```
