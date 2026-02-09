import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

const query = `
SELECT
  CAST(date AS VARCHAR) AS date,
  raw_power_pibs AS total_power,
  raw_power_pibs_delta AS daily_delta,
  AVG(raw_power_pibs_delta) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS delta_7d,
  AVG(raw_power_pibs_delta) OVER (ORDER BY date ROWS BETWEEN 27 PRECEDING AND CURRENT ROW) AS delta_28d
FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_metrics.parquet')
WHERE date >= CURRENT_DATE - INTERVAL 19 MONTH
ORDER BY date
`;

const rows = await new Promise((resolve, reject) => {
  db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
});

process.stdout.write("date,total_power,daily_delta,delta_7d,delta_28d\n");
for (const r of rows) {
  process.stdout.write(`${r.date},${r.total_power},${r.daily_delta},${r.delta_7d},${r.delta_28d}\n`);
}
