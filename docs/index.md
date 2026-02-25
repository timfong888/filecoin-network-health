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
const sectorActivity = FileAttachment("data/sector-activity.csv").csv({typed: true});
const spWeeklyTerminations = FileAttachment("data/sp-weekly-terminations.csv").csv({typed: true});
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
    <h2>Block Reward Per Win (USD)</h2>
    <span class="big">${latest.revenue_per_win_usd.toLocaleString("en-US", {style: "currency", currency: "USD"})}</span>
    <span class="${revTrend > 0 ? 'green' : 'red'}">${revTrend > 0 ? '▲' : '▼'} ${revTrend}% WoW</span>
    <span class="small muted">reward_per_wincount × FIL price · excludes gas costs and deal revenue</span>
  </div>
  <div class="card">
    <h2>Power-Weighted Stay Rate</h2>
    <span class="big">${latestStay.stay_rate_4w_avg.toFixed(1)}%</span>
    <span class="small muted">4wk avg · extended / (extended + terminated) raw_power_pibs</span>
  </div>
  <div class="card">
    <h2>Network Power</h2>
    <span class="big">${latestDelta.total_power.toLocaleString("en-US", {maximumFractionDigits: 0})} PiB</span>
    <span class="red">${latestDelta.delta_7d.toFixed(1)} PiB/day</span>
  </div>
</div>

## Block Reward, Network Power & Terminations

Block reward per win (blue) — `reward_per_wincount × fil_token_price_avg_usd` — has fallen from ~$28 to ~$5 over 18 months. Total network raw power (grey) declined from ~5,600 to ~2,200 PiB over the same period. The stacked bars below show **weekly power loss by SPID** — the top 5 SPs losing the most power each week are named, with all others grouped as "Other."

**What the bars show:** Each bar represents the total `raw_power_pibs` lost by providers that shrank week-over-week. This is a proxy for terminations — it includes active terminations, faults, and expirations, since the SP-level data only has `raw_power_pibs` (not `sector_terminated_raw_power_pibs`). The delta between two points on the power trend line should roughly equal the net of termination bars minus new onboarding.

```js
// Helper: convert a date value (Date object or string) to ISO date string "YYYY-MM-DD"
const toISO = (d) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

// Aggregate daily power data to weekly averages for the trend line
const weeklyPower = (() => {
  const byWeek = new Map();
  for (const d of powerDelta) {
    const wk = new Date(d.date);
    wk.setUTCDate(wk.getUTCDate() - ((wk.getUTCDay() + 6) % 7)); // snap to Monday (ISO week, matches DuckDB DATE_TRUNC)
    const key = wk.toISOString().slice(0, 10);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(d.total_power);
  }
  return new Map(Array.from(byWeek, ([week, vals]) => [week, vals.reduce((a, b) => a + b, 0) / vals.length]));
})();

// Merge block reward with weekly power
const merged = revWin.map(r => {
  const rWeek = toISO(r.week);
  const pw = weeklyPower.get(rWeek);
  return pw != null ? { ...r, total_power: pw } : null;
}).filter(Boolean);

// Aggregate terminations per week (total across all providers)
const weeklyTermTotal = (() => {
  const byWeek = new Map();
  for (const d of spWeeklyTerminations) {
    const wk = toISO(d.week);
    if (!byWeek.has(wk)) byWeek.set(wk, { power_lost: 0, sp_count: 0 });
    byWeek.get(wk).power_lost += d.power_lost_pibs;
    byWeek.get(wk).sp_count += d.sp_count;
  }
  return byWeek;
})();

// Scale factors for dual Y-axis simulation
const maxRev = Math.max(...merged.map(d => d.revenue_per_win_usd));
const maxPower = Math.max(...merged.map(d => d.total_power));
const maxTermWeek = Math.max(...Array.from(weeklyTermTotal.values()).map(d => d.power_lost));
const yTop = Math.ceil(maxRev / 5) * 5;
const powerScale = yTop / maxPower;
const termScale = yTop * 0.4 / maxTermWeek; // bars use bottom 40% of chart

// 12-week rolling Pearson correlation between block reward change and termination volume
const correlationData = (() => {
  const window = 12;
  const pairs = merged.map(d => {
    const wk = toISO(d.week);
    const t = weeklyTermTotal.get(wk);
    return { week: d.week, reward: d.revenue_per_win_usd, termVol: t ? t.power_lost : 0 };
  });
  if (pairs.length < window) return null;
  const recent = pairs.slice(-window);
  const n = recent.length;
  const meanR = recent.reduce((s, d) => s + d.reward, 0) / n;
  const meanT = recent.reduce((s, d) => s + d.termVol, 0) / n;
  let num = 0, denR = 0, denT = 0;
  for (const d of recent) {
    const dr = d.reward - meanR;
    const dt = d.termVol - meanT;
    num += dr * dt;
    denR += dr * dr;
    denT += dt * dt;
  }
  const r = denR > 0 && denT > 0 ? num / Math.sqrt(denR * denT) : 0;
  return r;
})();
```

<div class="grid grid-cols-2" style="grid-auto-rows: auto; margin-bottom: 0.5rem;">
  <div class="card">
    <h2>12-Week Correlation: Block Reward ↔ Terminations</h2>
    <span class="big">${correlationData != null ? correlationData.toFixed(2) : "N/A"}</span>
    <span class="small muted">${correlationData != null ? (correlationData < -0.3 ? "Negative — as reward falls, terminations rise" : correlationData > 0.3 ? "Positive — reward and terminations move together" : "Weak — no strong linear relationship") : ""}</span>
  </div>
  <div class="card">
    <h2>Latest Week Terminations</h2>
    <span class="big">${(() => { const lastWk = Array.from(weeklyTermTotal.entries()).sort((a,b) => a[0].localeCompare(b[0])).pop(); return lastWk ? lastWk[1].power_lost.toFixed(0) + " PiB" : "N/A"; })()}</span>
    <span class="small muted">${(() => { const lastWk = Array.from(weeklyTermTotal.entries()).sort((a,b) => a[0].localeCompare(b[0])).pop(); return lastWk ? lastWk[1].sp_count + " SPs lost power" : ""; })()}</span>
  </div>
</div>

```js
Plot.plot({
  width,
  height: 500,
  y: {label: "Block Reward Per Win (USD)", grid: true, domain: [-yTop * 0.45, yTop]},
  x: {type: "utc", label: "Week"},
  marks: [
    // Zero line separating trends from termination bars
    Plot.ruleY([0], {stroke: "var(--theme-foreground-muted)", strokeWidth: 1}),
    // Termination bars (negative, stacked by provider) — "Other" in grey, named SPs in categorical colors
    Plot.rectY(spWeeklyTerminations, Plot.stackY({
      x: "week",
      interval: d3.utcMonday,
      y: d => -d.power_lost_pibs * termScale,
      fill: d => d.provider === "Other" ? "#bbb" : d.provider,
      title: d => `${new Date(d.week).toLocaleDateString()}\n${d.provider}: ${d.power_lost_pibs.toFixed(1)} PiB lost (${d.sp_count} SPs)`
    })),
    // Total power trend line (scaled to left axis)
    Plot.lineY(merged, {x: "week", y: d => d.total_power * powerScale, stroke: "#999", strokeWidth: 2, strokeDasharray: "6,3"}),
    // Block reward line
    Plot.lineY(merged, {x: "week", y: "revenue_per_win_usd", stroke: "steelblue", strokeWidth: 2.5}),
    // Right-axis label for power
    Plot.text([`${merged[merged.length - 1].total_power.toFixed(0)} PiB →`], {
      x: merged[merged.length - 1].week,
      y: merged[merged.length - 1].total_power * powerScale,
      fill: "#999", fontSize: 10, textAnchor: "start", dx: 5
    }),
    // Tooltip
    Plot.tip(merged, Plot.pointerX({x: "week", y: "revenue_per_win_usd", title: d => {
      const wk = toISO(d.week);
      const t = weeklyTermTotal.get(wk);
      return `${new Date(d.week).toLocaleDateString()}\n\nBlock Reward: $${d.revenue_per_win_usd.toFixed(2)}/win\nFIL Price: $${d.price_usd.toFixed(2)}\nTotal Power: ${d.total_power.toFixed(0)} PiB${t ? `\n\nPower Lost: ${t.power_lost.toFixed(1)} PiB (${t.sp_count} SPs)` : ""}`;
    }}))
  ]
})
```

<div style="display: flex; gap: 1.5rem; font-size: 0.85rem; color: var(--theme-foreground-muted); margin-top: -0.5rem; flex-wrap: wrap;">
  <span><span style="color: steelblue;">━━</span> Block Reward/Win (USD, left axis)</span>
  <span><span style="color: #999;">╌╌</span> Total Raw Power (PiB, scaled)</span>
  <span>▊ Weekly power loss by SPID (top 5 named + Other)</span>
</div>

<div class="note">
<strong>Concentrated losses.</strong> The termination bars show that weekly power loss is dominated by a small number of high-capacity SPs. A single SP departing can account for more power loss than hundreds of small SPs combined. The correlation metric above measures whether termination volume tracks block reward decline — a strong negative value means SPs leave faster as rewards drop.
</div>

<div class="note">
<strong>Proxy, not exact.</strong> "Terminations" here are proxied as weekly power loss per `provider_id` (negative `raw_power_pibs` delta). This conflates active terminations with faults and sector expirations. The network-level `sector_terminated_raw_power_pibs` metric is only available in aggregate, not per SP.
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

## Sector Activity — Extended vs Unlocked

Each week, sectors reaching their commitment expiration face a decision: **extend** (renew) or **leave** (terminate early or let expire). Extended power (green, above zero) represents retained capacity. Terminated (red) and expired (orange) power — shown below zero — represents collateral unlocked back into circulation.

Most sector exits are **active terminations** (SP pays a fee per [FIP-0098](https://github.com/filecoin-project/FIPs/blob/master/FIPS/fip-0098.md) to exit early), not natural expirations. The extend/terminate ratio is a better signal of SP commitment than the "renewal rate" (which only measures extend/expire and is artificially high).

```js
const activityLong = sectorActivity.flatMap(d => [
  {week: d.week, category: "Extended", pibs: d.extended_pibs},
  {week: d.week, category: "Terminated", pibs: -d.terminated_pibs},
  {week: d.week, category: "Expired", pibs: -d.expired_pibs}
]);
```

```js
Plot.plot({
  width,
  height: 400,
  y: {label: "Raw Power (PiB)", grid: true},
  x: {type: "utc", label: "Week"},
  color: {
    domain: ["Extended", "Terminated", "Expired"],
    range: ["#59a14f", "#e15759", "#f28e2b"],
    legend: true
  },
  marks: [
    Plot.rectY(activityLong, Plot.stackY({
      x: "week",
      interval: d3.utcMonday,
      y: "pibs",
      fill: "category",
      title: d => `${new Date(d.week).toLocaleDateString()}\n${d.category}: ${Math.abs(d.pibs).toFixed(1)} PiB`
    })),
    Plot.ruleY([0])
  ]
})
```

<div class="note">
<strong>Forward-looking data unavailable.</strong> Scheduled sector expiration dates require on-chain state queries not yet available in the Filecoin Data Portal. A data request has been filed — see <a href="https://github.com/davidgasquez/filecoin-data-portal/issues/208">filecoin-data-portal#208</a>.
</div>

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
/* Fix tooltip visibility on dark theme */
[role="tooltip"], figure [aria-label="tip"] {
  --plot-background: var(--theme-background-alt);
}
</style>
