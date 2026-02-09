import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

const query = `
WITH daily AS (
  SELECT
    date,
    raw_power_pibs_delta,
    AVG(raw_power_pibs_delta) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS delta_7d
  FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_metrics.parquet')
  WHERE date >= CURRENT_DATE - INTERVAL 8 MONTH
)
SELECT
  CAST(date AS VARCHAR) AS date,
  delta_7d,
  delta_7d - LAG(delta_7d, 7) OVER (ORDER BY date) AS acceleration
FROM daily
WHERE date >= CURRENT_DATE - INTERVAL 6 MONTH
ORDER BY date
`;

const rows = await new Promise((resolve, reject) => {
  db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
});

process.stdout.write("date,delta_7d,acceleration\n");
for (const r of rows) {
  process.stdout.write(`${r.date},${r.delta_7d},${r.acceleration}\n`);
}
