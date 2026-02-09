---
toc: false
---

# Filecoin Network Health

<div class="small muted">Auto-refreshed weekly from <a href="https://data.filecoindataportal.xyz/">Filecoin Data Portal</a> Parquet files. Last build: ${new Date().toLocaleDateString("en-US", {month: "long", day: "numeric", year: "numeric"})}</div>

```js
const revWin = FileAttachment("data/revenue-per-win.csv").csv({typed: true});
const stayRate = FileAttachment("data/stay-rate.csv").csv({typed: true});
const powerDelta = FileAttachment("data/power-delta.csv").csv({typed: true});
const spChurn = FileAttachment("data/sp-churn.csv").csv({typed: true});
```

```js
const latest = revWin[revWin.length - 1];
const prev = revWin[revWin.length - 2];
const revTrend = ((latest.revenue_per_win_usd - prev.revenue_per_win_usd) / prev.revenue_per_win_usd * 100).toFixed(1);

const latestStay = stayRate[stayRate.length - 1];
const latestDelta = powerDelta[powerDelta.length - 1];
```

<div class="grid grid-cols-4" style="grid-auto-rows: auto;">
  <div class="card">
    <h2>FIL Price</h2>
    <span class="big">${latest.price_usd.toLocaleString("en-US", {style: "currency", currency: "USD"})}</span>
  </div>
  <div class="card">
    <h2>Revenue Per Win (USD)</h2>
    <span class="big">${latest.revenue_per_win_usd.toLocaleString("en-US", {style: "currency", currency: "USD"})}</span>
    <span class="${revTrend > 0 ? 'green' : 'red'}">${revTrend > 0 ? '▲' : '▼'} ${revTrend}% WoW</span>
  </div>
  <div class="card">
    <h2>Stay Rate (4wk avg)</h2>
    <span class="big">${latestStay.stay_rate_4w_avg.toFixed(1)}%</span>
  </div>
  <div class="card">
    <h2>Power Delta (7d avg)</h2>
    <span class="big">${latestDelta.delta_7d.toFixed(2)} PiB/day</span>
  </div>
</div>

## Revenue Per Win (USD) — Weekly

The single most important metric for SP economics: block reward × FIL price. When this drops below an SP's cost basis, they leave.

```js
Plot.plot({
  width,
  height: 400,
  y: {label: "USD per Win", grid: true},
  x: {type: "utc", label: "Week"},
  color: {legend: false},
  marks: [
    Plot.ruleY([5], {stroke: "red", strokeDasharray: "5,5", strokeOpacity: 0.7}),
    Plot.text(["$5 danger threshold"], {x: revWin[0].week, y: 5.5, fill: "red", fontSize: 11, textAnchor: "start"}),
    Plot.lineY(revWin, {x: "week", y: "revenue_per_win_usd", stroke: "steelblue", strokeWidth: 2}),
    Plot.dot(revWin, {x: "week", y: "revenue_per_win_usd", fill: "steelblue", r: 2}),
    Plot.tip(revWin, Plot.pointerX({x: "week", y: "revenue_per_win_usd", title: d => `${new Date(d.week).toLocaleDateString()}\n$${d.revenue_per_win_usd.toFixed(2)}/win\nFIL: $${d.price_usd.toFixed(2)}`}))
  ]
})
```

## Stay Rate (4-Week Rolling Average)

Corrected renewal metric: `extended / (extended + terminated)`. The dashboard's "renewal rate" uses expire instead of terminate, masking the real churn. SPs leave via active termination, not passive expiration.

```js
Plot.plot({
  width,
  height: 400,
  y: {label: "Stay Rate %", grid: true, domain: [0, 100]},
  x: {type: "utc", label: "Week"},
  marks: [
    Plot.ruleY([50], {stroke: "red", strokeDasharray: "5,5", strokeOpacity: 0.7}),
    Plot.text(["50% danger threshold"], {x: stayRate[0].week, y: 53, fill: "red", fontSize: 11, textAnchor: "start"}),
    Plot.lineY(stayRate, {x: "week", y: "stay_rate_pct", stroke: "#ccc", strokeWidth: 1, strokeOpacity: 0.5}),
    Plot.lineY(stayRate, {x: "week", y: "stay_rate_4w_avg", stroke: "var(--theme-foreground-focus)", strokeWidth: 2.5}),
    Plot.tip(stayRate, Plot.pointerX({x: "week", y: "stay_rate_4w_avg", title: d => `${new Date(d.week).toLocaleDateString()}\n4wk avg: ${d.stay_rate_4w_avg.toFixed(1)}%\nWeekly: ${d.stay_rate_pct.toFixed(1)}%`}))
  ]
})
```

<div class="note">
<strong>July 2025 structural break:</strong> Before July, the 4-week average never dropped below 65%. After it, the average hasn't recovered above 70%. The volatility itself signals extreme concentration — individual large SP decisions now dominate the weekly numbers.
</div>

## Power Delta Acceleration — 6 Months

Second derivative of 7-day smoothed raw power delta. **Red = decline accelerating**, blue = decline slowing or reversing. Sustained red bars would signal a death spiral.

```js
Plot.plot({
  width,
  height: 350,
  y: {label: "Acceleration (PiB/day²)", grid: true},
  x: {type: "utc", label: "Date"},
  color: {legend: false},
  marks: [
    Plot.ruleY([0], {stroke: "#666"}),
    Plot.rectY(powerDelta, {
      x: "date",
      y: "acceleration",
      fill: d => d.acceleration >= 0 ? "steelblue" : "#e15759",
      interval: "day"
    }),
    Plot.tip(powerDelta, Plot.pointerX({x: "date", y: "acceleration", title: d => `${new Date(d.date).toLocaleDateString()}\nAcceleration: ${d.acceleration?.toFixed(3)} PiB/day²\n7d avg delta: ${d.delta_7d.toFixed(3)} PiB/day`}))
  ]
})
```

## SP Churn — 90-Day Snapshot

How storage providers changed over the last 90 days: LEFT (gone entirely), SHRUNK (>5% power loss), STABLE (±5%), GREW (>5% gain), NEW (joined).

```js
const churnOrder = ["LEFT", "SHRUNK", "STABLE", "NEW", "GREW"];
const churnColors = {"LEFT": "#e15759", "SHRUNK": "#f28e2b", "STABLE": "#76b7b2", "NEW": "#59a14f", "GREW": "#4e79a7"};
const sortedChurn = churnOrder.map(s => spChurn.find(d => d.status === s)).filter(Boolean);
```

```js
Plot.plot({
  width,
  height: 300,
  x: {label: "Net Power Change (PiB)", grid: true},
  y: {label: null, domain: churnOrder},
  marks: [
    Plot.barX(sortedChurn, {
      x: "net_power_change",
      y: "status",
      fill: d => churnColors[d.status],
      tip: true,
      title: d => `${d.status}: ${d.sp_count} SPs\nNet: ${d.net_power_change > 0 ? '+' : ''}${d.net_power_change} PiB`
    }),
    Plot.ruleX([0]),
    Plot.text(sortedChurn, {
      x: d => d.net_power_change > 0 ? d.net_power_change + 10 : d.net_power_change - 10,
      y: "status",
      text: d => `${d.sp_count} SPs`,
      textAnchor: d => d.net_power_change > 0 ? "start" : "end",
      fontSize: 12
    })
  ]
})
```

---

<div class="small muted">
Built with <a href="https://observablehq.com/framework/">Observable Framework</a>. Data from <a href="https://data.filecoindataportal.xyz/">Filecoin Data Portal</a> Parquet files.
Analysis: <a href="https://github.com/timfong888/filecoin-network-health">timfong888/filecoin-network-health</a>
</div>

<style>
.big { font-size: 2rem; font-weight: 700; line-height: 1; }
.green { color: #59a14f; }
.red { color: #e15759; }
.small { font-size: 0.85rem; }
.muted { color: var(--theme-foreground-muted); }
.note { background: var(--theme-foreground-faintest); border-left: 3px solid var(--theme-foreground-focus); padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 0 4px 4px 0; }
</style>
