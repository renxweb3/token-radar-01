[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/renxweb3/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/renxweb3/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar

A token launch radar: the 40 watchlist protocols with at least $50M of TVL and no token on record, plus 160 pre-token protocols below that floor, ranked by implied value — and a farm plan for each one, with the net economics stated honestly.

Built for the [Make.fun bounty "Build the best token launch radar"](https://make.fun/bounty/token-radar-01) (token-radar-01).

## How it works

`main.ts` reads the sealed snapshot at `/input/snapshot.json` and writes:

- `/output/board.json` — 200 ranked rows (40 watchlist + 160 early), each with an implied value and a 7-step farm plan
- `/output/data.js` — the dashboard's data, beside the page
- `/output/dashboard/` — the static, no-network dashboard
- `/output/screenshots/` — three screenshots (board, detail, filtered)
- `/output/dossier.json` — built with `buildDossier` from `vendor/makefun-board.ts`

Run it:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## The model (radar-2)

Implied value is one function of the snapshot figures, applied to every protocol alike:

```
implied = round(tvl_usd x 0.25
  x (1 + clamp(change_7d, -50, 50) / 100 x 0.5)
  x (0.5 + min(age_days, 365) / 365 x 0.5)
  x category_shift)
```

`category_shift` is cautious, not wholesale: the median ratio of a category's live comparables' market cap to the base model, winsorized to [0.05, 10], shrunk toward 1 by n/(n+5), clamped to [0.67, 1.5], and 1.0 when the category has fewer than 3 live comparables. No 400x outlier is imported — the largest live ratio in the snapshot is 2650x, and the shift never follows it.

Blind test (leave-one-out on the 119 live-token protocols that record a market cap above $0): median |log error| 1.66 without shifts, **1.52 with them**; within 5x of the market 49.6% to 52.9%; within 2x 30.3% to 25.2%. The gain is real for the typical case and a loss for rows already accurate — reported as measured, in the dashboard, above the fold.

## Farm economics — assumptions labelled

Each row carries net farming economics under one stated assumption: **one farmer captures 0.01% of implied value**. Costs are $4–$8 of setup gas plus $2 of gas a week; time is 15 minutes to set up, 10 minutes a week, 10 minutes to claim, 5 minutes to log. Net is est. return minus gas.

- **FARM**: net $500+ an hour — 62 rows
- **THIN**: net $100–500 an hour — 113 rows
- **SKIP**: net under $100 an hour, or no net — 25 rows

Every farm plan states its break-even capture, so the decision can be checked and changes if the capture assumption is wrong.

## The dashboard

A static page (`dashboard/`, no network): the board with sortable implied value, net $/hr, est. return and TVL; a Decision filter (FARM / THIN / SKIP); a family strip (33 categories, each with row count, median implied value and top protocol); a detail view per protocol with its model, its category shift and its economics; the full live-token set (144 protocols that record a market cap, $0-or-less records flagged, not hidden); and a self-check badge the page computes live from its own data (watchlist coverage, rank order, farm-plan length, page recompute vs board.json).

## License

MIT — see [LICENSE](LICENSE).
