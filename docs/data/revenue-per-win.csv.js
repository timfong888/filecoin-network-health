import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

const query = `
SELECT
  CAST(DATE_TRUNC('week', date) AS VARCHAR) AS week,
  AVG(reward_per_wincount) AS reward_fil,
  AVG(fil_token_price_avg_usd) AS price_usd,
  AVG(reward_per_wincount) * AVG(fil_token_price_avg_usd) AS revenue_per_win_usd
FROM read_parquet('https://data.filecoindataportal.xyz/filecoin_daily_metrics.parquet')
WHERE date >= CURRENT_DATE - INTERVAL 18 MONTH
GROUP BY 1
ORDER BY 1
`;

const rows = await new Promise((resolve, reject) => {
  db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
});

process.stdout.write("week,reward_fil,price_usd,revenue_per_win_usd\n");
for (const r of rows) {
  process.stdout.write(`${r.week},${r.reward_fil},${r.price_usd},${r.revenue_per_win_usd}\n`);
}
