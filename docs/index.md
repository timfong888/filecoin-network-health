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
const spStayRate = FileAttachment("data/sp-stay-rate.csv").csv({typed: true});
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
    <h2>Network Power</h2>
    <span class="big">${latestDelta.total_power.toLocaleString("en-US", {maximumFractionDigits: 0})} PiB</span>
    <span class="red">${latestDelta.delta_7d.toFixed(1)} PiB/day</span>
  </div>
</div>

## Revenue Per Win vs. Stay Rate

Revenue per win (blue) has fallen steadily from $28 to $5. The **power-weighted stay rate** (orange) — computed from `sector_extended_raw_power_pibs / (extended + terminated)` — swings wildly. But the **SPID-count stay rate** (green) — counting individual `provider_id`s that remain active week-over-week — stays flat at ~90%.

**Power-weighted stay rate (orange):** `sector_extended_raw_power_pibs / (sector_extended_raw_power_pibs + sector_terminated_raw_power_pibs)`. Each PiB counts equally — if one SPID terminates 50 PiB in a week where total activity is 100 PiB, that single SPID drops the ratio by 50 points.

**SPID-count stay rate (green):** Of all `provider_id`s active last week (with `raw_power_pibs > 0`), what percentage are still active this week and haven't shrunk more than 5%? Each SPID counts as 1 regardless of power.

The divergence shows that `raw_power_pibs` decline is concentrated in a small number of high-capacity SPIDs, not distributed across the SPID population. (Note: one operator can run multiple SPIDs — `provider_id` is the finest granularity available on-chain.)

```js
// Merge all three datasets on matching weeks
const merged = revWin.map(r => {
  const rWeek = String(r.week);
  const s = stayRate.find(s => String(s.week) === rWeek);
  const sp = spStayRate.find(sp => String(sp.week) === rWeek);
  return (s && sp) ? {
    ...r,
    stay_rate_4w_avg: s.stay_rate_4w_avg,
    stay_rate_pct: s.stay_rate_pct,
    sp_stay_rate_pct: sp.sp_stay_rate_pct,
    active_sps: sp.active_sps,
    left_sps: sp.left_sps
  } : null;
}).filter(Boolean);

const maxRev = Math.max(...merged.map(d => d.revenue_per_win_usd));
const yTop = Math.ceil(maxRev / 5) * 5;
```

```js
Plot.plot({
  width,
  height: 450,
  y: {label: "← Revenue Per Win (USD) / Stay Rate % →", grid: true, domain: [0, yTop]},
  x: {type: "utc", label: "Week"},
  marks: [
    Plot.ruleY([15], {stroke: "#666", strokeDasharray: "5,5", strokeOpacity: 0.3}),
    Plot.text(["$15 behavioral threshold"], {x: merged[0].week, y: 16, fill: "var(--theme-foreground-muted)", fontSize: 10, textAnchor: "start"}),
    Plot.lineY(merged, {x: "week", y: "revenue_per_win_usd", stroke: "steelblue", strokeWidth: 2.5}),
    Plot.lineY(merged, {x: "week", y: d => d.stay_rate_4w_avg / 100 * yTop, stroke: "#f28e2b", strokeWidth: 2, strokeOpacity: 0.7}),
    Plot.lineY(merged, {x: "week", y: d => d.sp_stay_rate_pct / 100 * yTop, stroke: "#59a14f", strokeWidth: 2.5}),
    Plot.tip(merged, Plot.pointerX({x: "week", y: "revenue_per_win_usd", title: d => `${new Date(d.week).toLocaleDateString()}\n\nRevenue: $${d.revenue_per_win_usd.toFixed(2)}/win\nFIL Price: $${d.price_usd.toFixed(2)}\n\nPower-weighted stay rate: ${d.stay_rate_pct.toFixed(1)}% (4wk: ${d.stay_rate_4w_avg.toFixed(1)}%)\nSPID-count stay rate: ${d.sp_stay_rate_pct.toFixed(1)}%\nActive SPIDs: ${d.active_sps} (${d.left_sps} left this week)`}))
  ]
})
```

<div style="display: flex; gap: 1.5rem; font-size: 0.85rem; color: var(--theme-foreground-muted); margin-top: -0.5rem; flex-wrap: wrap;">
  <span><span style="color: steelblue;">━━</span> Revenue/Win (USD)</span>
  <span><span style="color: #f28e2b;">━━</span> Power-weighted stay rate (4wk avg, 0-100% mapped to y-axis)</span>
  <span><span style="color: #59a14f;">━━</span> SPID-count stay rate (0-100% mapped to y-axis)</span>
</div>

<div class="note">
<strong>The green line is the key.</strong> ~90% of SPIDs remain active each week — stable even as revenue per win fell 82%. The orange power-weighted rate swings ±30 points because a single high-power SPID terminating 50 PiB of `raw_power_pibs` has the same mathematical effect as 50 small SPIDs each terminating 1 PiB. The network's `raw_power_pibs` decline is concentrated in a small number of high-capacity SPIDs, not distributed across the SPID population.
</div>

<div class="note">
<strong>July 2025 structural break:</strong> Before July, the power-weighted 4-week average never dropped below 65%. After it, it hasn't recovered above 70% — triggered by a 567% gas fee spike, not the revenue decline. The SPID-count stay rate barely dipped, indicating the power loss came from a small number of high-capacity SPIDs, not broad SPID attrition.
</div>

## Network Raw Power (`raw_power_pibs`) — Level and Rate of Change

Total `raw_power_pibs` across all SPIDs — the sum of sealed sectors actively being proven via WindowPoSt. When an SPID stops proving sectors (faults) or terminates them, their `raw_power_pibs` is removed from the total. This is physical storage capacity, not quality-adjusted power (QAP).

The bottom chart shows the **slope** of the power curve — how many PiB/day the network is gaining or losing, smoothed over two windows.

**How to read the slope chart:**
- **Flat line at a negative number** (e.g., steady at −6) = linear decline at a constant rate
- **Line trending more negative** (e.g., −4 → −8) = decline is accelerating — losing power faster each month
- **Line trending toward zero** = decline is slowing, possible stabilization
- **Line crosses zero** = growth

```js
// Filter to 18 months for display (loader fetches 19 months for smoothing warmup)
const power18m = powerDelta.filter(d => new Date(d.date) >= new Date(Date.now() - 18 * 30.5 * 86400000));
```

```js
Plot.plot({
  width,
  height: 300,
  y: {label: "Network Power (PiB)", grid: true},
  x: {type: "utc", label: null},
  marks: [
    Plot.areaY(power18m, {x: "date", y: "total_power", fill: "var(--theme-foreground-focus)", fillOpacity: 0.1}),
    Plot.lineY(power18m, {x: "date", y: "total_power", stroke: "var(--theme-foreground-focus)", strokeWidth: 2}),
    Plot.tip(power18m, Plot.pointerX({x: "date", y: "total_power", title: d => `${new Date(d.date).toLocaleDateString()}\nTotal Power: ${d.total_power.toFixed(0)} PiB`}))
  ]
})
```

```js
Plot.plot({
  width,
  height: 250,
  y: {label: "Rate of Change (PiB/day)", grid: true},
  x: {type: "utc", label: "Date"},
  marks: [
    Plot.ruleY([0], {stroke: "#59a14f", strokeWidth: 1.5, strokeOpacity: 0.5}),
    Plot.text(["zero = stable"], {x: power18m[0].date, y: 1, fill: "#59a14f", fontSize: 10, textAnchor: "start"}),
    Plot.lineY(power18m, {x: "date", y: "delta_7d", stroke: "#e15759", strokeWidth: 0.7, strokeOpacity: 0.35}),
    Plot.lineY(power18m, {x: "date", y: "delta_28d", stroke: "#e15759", strokeWidth: 2.5}),
    Plot.tip(power18m, Plot.pointerX({x: "date", y: "delta_28d", title: d => `${new Date(d.date).toLocaleDateString()}\n\n4-week avg: ${d.delta_28d >= 0 ? "+" : ""}${d.delta_28d.toFixed(2)} PiB/day\n7-day avg: ${d.delta_7d >= 0 ? "+" : ""}${d.delta_7d.toFixed(2)} PiB/day\n\nTotal power: ${d.total_power.toFixed(0)} PiB`}))
  ]
})
```

<div style="display: flex; gap: 1.5rem; font-size: 0.85rem; color: var(--theme-foreground-muted); margin-top: -0.5rem; flex-wrap: wrap;">
  <span><span style="color: #e15759;">━━</span> 4-week smoothed rate (the trend)</span>
  <span><span style="color: #e15759; opacity: 0.35;">━━</span> 7-day smoothed rate (the noise)</span>
  <span><span style="color: #59a14f;">━━</span> Zero line (breakeven)</span>
</div>

<div class="note">
<strong>Reading the slope:</strong> The 4-week line has hovered between −4 and −10 PiB/day for the past year with no sustained trend in either direction. This is a roughly linear decline — not a death spiral (which would show the line getting steadily more negative) but also not stabilizing (which would show it trending toward zero). The 7-day line shows how noisy the daily data is — individual weeks can swing ±15 PiB/day, which is why the 4-week smoothing matters.
</div>

## SPID Churn — 90-Day Snapshot

How SPIDs changed over the last 90 days: LEFT (power went to zero), SHRUNK (>5% power loss), STABLE (±5%), GREW (>5% gain), NEW (first appeared). Each bar counts by SPID, not by operator — one operator may control multiple SPIDs.

```js
const churnOrder = ["LEFT", "SHRUNK", "STABLE", "NEW", "GREW"];
const churnColors = {"LEFT": "#e15759", "SHRUNK": "#f28e2b", "STABLE": "#76b7b2", "NEW": "#59a14f", "GREW": "#4e79a7"};
const sortedChurn = churnOrder.map(s => spChurn.find(d => d.status === s)).filter(Boolean);
```

```js
Plot.plot({
  width,
  height: 300,
  x: {label: "Net raw_power_pibs Change (PiB)", grid: true},
  y: {label: null, domain: churnOrder},
  marks: [
    Plot.barX(sortedChurn, {
      x: "net_power_change",
      y: "status",
      fill: d => churnColors[d.status],
      tip: true,
      title: d => `${d.status}: ${d.sp_count} SPIDs\nNet raw_power_pibs: ${d.net_power_change > 0 ? '+' : ''}${d.net_power_change} PiB`
    }),
    Plot.ruleX([0]),
    Plot.text(sortedChurn, {
      x: d => d.net_power_change > 0 ? d.net_power_change + 10 : d.net_power_change - 10,
      y: "status",
      text: d => `${d.sp_count} SPIDs`,
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
