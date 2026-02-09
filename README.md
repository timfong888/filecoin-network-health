# Filecoin Network Health Dashboard

Four derived metrics that predict Filecoin network economic health — metrics the existing data portal doesn't surface.

## Metrics

1. **Revenue Per Win (USD)** — `reward_per_wincount × FIL price`. SP revenue in real dollars.
2. **Stay Rate** — `extended / (extended + terminated)`. Corrects the misleading "renewal rate" that ignores active termination.
3. **Power Delta Acceleration** — Second derivative of smoothed power delta. Detects whether decline is accelerating (spiral) or stabilizing.
4. **SP Churn** — 90-day behavioral cohort snapshot: LEFT, SHRUNK, STABLE, NEW, GREW.

## Data Source

All data comes from public Parquet files at [data.filecoindataportal.xyz](https://data.filecoindataportal.xyz/), queried with DuckDB at build time.

## Development

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # Static site in dist/
```

## Analysis

See [research/numbers-analysis.md](https://github.com/timfong888/filecoin-network-health/blob/main/research/numbers-analysis.md) in the Filecoin project repo for the full analysis that motivated this dashboard.

## Architecture

Built with [Observable Framework](https://observablehq.com/framework/). Data loaders run DuckDB queries against remote Parquet files at build time, outputting small CSVs. The dashboard renders with Observable Plot. Deployed to Vercel as a static site, rebuilt weekly via GitHub Actions.
