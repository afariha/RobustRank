# RobustRank

**Live demo:** https://robustrank.vercel.app/

A ranking often changes with the data it is computed on, such as the years or the subgroups, so the exact position of an item is fragile. RobustRank keeps the ranking function fixed, ranks the items in every data context the user specifies, and finds the most informative **tiered ranking**, i.e., tiers that are strictly ordered but unordered within, that holds in most of these contexts. It also shows where the tiered ranking holds and where it breaks.

## Datasets

- **CSRankings**: publications of computer science departments, by year, publication window, venue tier, and area.
- **CDC BRFSS survey**: health survey of US adults, by state, year, sex, age group, education, and income.
- **CDC obesity estimates**: state rates of obesity and physical inactivity, by year and subgroup.
- **UN life expectancy**: remaining life expectancy, by country, year, sex, and age.
- **Eurostat unemployment**: unemployment rates of European countries, by year, sex, and age.

## Disclaimer

RobustRank is a research prototype. Its results should not be used as the sole basis for admissions, hiring, funding, or policy decisions.
