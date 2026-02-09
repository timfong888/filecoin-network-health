import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

const query = `
WITH t0 AS (
  SELECT provider_id, raw_power_pibs
  FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_storage_providers_metrics.parquet')
  WHERE date = (
    SELECT MAX(date) - 90
    FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_storage_providers_metrics.parquet')
  )
  AND raw_power_pibs > 0
),
t1 AS (
  SELECT provider_id, raw_power_pibs
  FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_storage_providers_metrics.parquet')
  WHERE date = (
    SELECT MAX(date)
    FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_storage_providers_metrics.parquet')
  )
  AND raw_power_pibs > 0
)
SELECT
  CASE
    WHEN t1.provider_id IS NULL THEN 'LEFT'
    WHEN t0.provider_id IS NULL THEN 'NEW'
    WHEN t1.raw_power_pibs > t0.raw_power_pibs * 1.05 THEN 'GREW'
    WHEN t1.raw_power_pibs < t0.raw_power_pibs * 0.95 THEN 'SHRUNK'
    ELSE 'STABLE'
  END AS status,
  COUNT(*) AS sp_count,
  ROUND(SUM(COALESCE(t0.raw_power_pibs, 0)), 1) AS power_before,
  ROUND(SUM(COALESCE(t1.raw_power_pibs, 0)), 1) AS power_after,
  ROUND(SUM(COALESCE(t1.raw_power_pibs, 0)) - SUM(COALESCE(t0.raw_power_pibs, 0)), 1) AS net_power_change
FROM t0 FULL OUTER JOIN t1 ON t0.provider_id = t1.provider_id
GROUP BY 1
`;

const rows = await new Promise((resolve, reject) => {
  db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
});

process.stdout.write("status,sp_count,power_before,power_after,net_power_change\n");
for (const r of rows) {
  process.stdout.write(`${r.status},${r.sp_count},${r.power_before},${r.power_after},${r.net_power_change}\n`);
}
