# RobustRank

RobustRank finds **robust tiered rankings**. The ranking function stays fixed. The app evaluates it on many slices of the data (**contexts**) and searches for the tiered ranking with the most tiers that still holds in enough of those contexts.

- A **context** is one combination of values chosen on the context axes. The context space is the cross product of the chosen values, for example Year × Window × Venue tier.
- A tiered ranking **holds** in a context when every entity ranks inside its own tier in that context.
- **Robustness** is the share of contexts in which the tiered ranking holds. Putting every entity in one tier always holds, so the goal is the largest number of tiers that keeps robustness at or above the minimum.

## Tolerance parameters

| Parameter | Meaning |
|---|---|
| Minimum robustness | fraction of contexts where the ranking must hold |
| Borderline entities per tier | fraction of a tier's entities, rounded down, that may cross into the tier directly above or below |
| Crossing frequency | fraction of contexts, rounded down, in which one such entity may cross |

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

The search runs in the browser, inside a Web Worker. Two strategies run, and the result with the most tiers wins. Ties go to the result that holds in more contexts.

1. **Greedy.** Starting from one tier, repeatedly add the tier boundary that keeps the most contexts holding, while robustness stays at or above the minimum. It runs from three base orders: mean rank, median rank, and the exact search's order.
2. **Exact strict.** A depth-first search over tier boundaries that groups contexts by their top-j sets. It finds the most tiers with no crossings. It is bounded by time, about 4 s.

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
