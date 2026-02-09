import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

const query = `
WITH weekly AS (
  SELECT
    CAST(DATE_TRUNC('week', date) AS VARCHAR) AS week,
    SUM(sector_extended_raw_power_pibs) AS extended,
    SUM(sector_terminated_raw_power_pibs) AS terminated
  FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_metrics.parquet')
  WHERE date >= CURRENT_DATE - INTERVAL 18 MONTH
  GROUP BY 1
)
SELECT
  week,
  extended,
  terminated,
  100.0 * extended / NULLIF(extended + terminated, 0) AS stay_rate_pct,
  100.0 * SUM(extended) OVER (ORDER BY week ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)
    / NULLIF(SUM(extended + terminated) OVER (ORDER BY week ROWS BETWEEN 3 PRECEDING AND CURRENT ROW), 0)
    AS stay_rate_4w_avg
FROM weekly
ORDER BY week
`;

const rows = await new Promise((resolve, reject) => {
  db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
});

process.stdout.write("week,extended,terminated,stay_rate_pct,stay_rate_4w_avg\n");
for (const r of rows) {
  process.stdout.write(`${r.week},${r.extended},${r.terminated},${r.stay_rate_pct},${r.stay_rate_4w_avg}\n`);
}
