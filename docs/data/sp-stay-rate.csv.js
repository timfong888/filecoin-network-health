import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

const query = `
WITH weekly_sp AS (
  SELECT
    provider_id,
    DATE_TRUNC('week', date) AS week,
    AVG(raw_power_pibs) AS power
  FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_storage_providers_metrics.parquet')
  WHERE date >= CURRENT_DATE - INTERVAL 19 MONTH
  GROUP BY 1, 2
  HAVING AVG(raw_power_pibs) > 0
),
paired AS (
  SELECT
    COALESCE(c.week, p.week + INTERVAL 1 WEEK) AS week,
    COALESCE(c.provider_id, p.provider_id) AS provider_id,
    p.power AS prev_power,
    c.power AS curr_power
  FROM weekly_sp c
  FULL OUTER JOIN weekly_sp p
    ON c.provider_id = p.provider_id
    AND c.week = p.week + INTERVAL 1 WEEK
  WHERE COALESCE(c.week, p.week + INTERVAL 1 WEEK) >= CURRENT_DATE - INTERVAL 18 MONTH
)
SELECT
  CAST(CAST(week AS DATE) AS VARCHAR) AS week,
  COUNT(CASE WHEN curr_power IS NOT NULL THEN 1 END) AS active_sps,
  COUNT(CASE WHEN prev_power IS NOT NULL AND curr_power IS NULL THEN 1 END) AS left_sps,
  COUNT(CASE WHEN prev_power IS NOT NULL AND curr_power IS NOT NULL AND curr_power < prev_power * 0.95 THEN 1 END) AS shrinking_sps,
  COUNT(CASE WHEN prev_power IS NULL AND curr_power IS NOT NULL THEN 1 END) AS new_sps,
  COUNT(CASE WHEN prev_power IS NOT NULL AND curr_power IS NOT NULL AND curr_power >= prev_power * 0.95 THEN 1 END) AS staying_sps,
  100.0 * COUNT(CASE WHEN prev_power IS NOT NULL AND curr_power IS NOT NULL AND curr_power >= prev_power * 0.95 THEN 1 END)
    / NULLIF(COUNT(CASE WHEN prev_power IS NOT NULL THEN 1 END), 0) AS sp_stay_rate_pct
FROM paired
WHERE week < DATE_TRUNC('week', CURRENT_DATE)
GROUP BY 1
ORDER BY 1
`;

const rows = await new Promise((resolve, reject) => {
  db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
});

process.stdout.write("week,active_sps,left_sps,shrinking_sps,new_sps,staying_sps,sp_stay_rate_pct\n");
for (const r of rows) {
  process.stdout.write(`${r.week},${r.active_sps},${r.left_sps},${r.shrinking_sps},${r.new_sps},${r.staying_sps},${r.sp_stay_rate_pct ?? ""}\n`);
}
