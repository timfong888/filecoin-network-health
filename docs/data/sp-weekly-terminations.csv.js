import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

const query = `
WITH weekly_sp AS (
  SELECT
    provider_id,
    DATE_TRUNC('week', date) AS week,
    AVG(raw_power_pibs) AS avg_power
  FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_storage_providers_metrics.parquet')
  WHERE date >= CURRENT_DATE - INTERVAL 19 MONTH
  GROUP BY 1, 2
  HAVING AVG(raw_power_pibs) > 0
),
deltas AS (
  SELECT
    c.week,
    c.provider_id,
    COALESCE(c.avg_power, 0) - COALESCE(p.avg_power, 0) AS power_delta
  FROM weekly_sp c
  LEFT JOIN weekly_sp p ON c.provider_id = p.provider_id AND c.week = p.week + INTERVAL 1 WEEK
  WHERE c.week >= CURRENT_DATE - INTERVAL 18 MONTH
),
losers AS (
  SELECT week, provider_id, ABS(power_delta) AS power_lost
  FROM deltas
  WHERE power_delta < 0
),
ranked AS (
  SELECT *, RANK() OVER (PARTITION BY week ORDER BY power_lost DESC) AS rnk
  FROM losers
)
SELECT
  CAST(CAST(week AS DATE) AS VARCHAR) AS week,
  CASE WHEN rnk <= 5 THEN provider_id ELSE 'Other' END AS provider,
  ROUND(SUM(power_lost), 2) AS power_lost_pibs,
  COUNT(DISTINCT provider_id) AS sp_count
FROM ranked
GROUP BY 1, 2
ORDER BY 1, 3 DESC
`;

const rows = await new Promise((resolve, reject) => {
  db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
});

process.stdout.write("week,provider,power_lost_pibs,sp_count\n");
for (const r of rows) {
  process.stdout.write(`${r.week},${r.provider},${r.power_lost_pibs},${r.sp_count}\n`);
}
