const API_BASE = "https://api.useboardwise.com";

const FILTER_KEYS = [
  "sport",
  "market_key",
  "bookmaker_key",
  "confidence_bucket",
  "model_probability_bucket",
  "model_version",
  "prediction_mode",
  "start_date",
  "end_date",
  "min_model_probability",
  "max_model_probability",
];

const BOOL_KEYS = ["official_only", "settled_only"];
const GROUP_KEY = "group_by";
const DEFAULT_GROUP = "confidence_bucket";
const ALLOWED_GROUPS = new Set([
  "confidence_bucket",
  "model_probability_bucket",
  "model_version",
  "sport",
  "market",
  "book",
  "prediction_mode",
  "date",
]);

const els = {
  form: document.getElementById("filter-form"),
  reset: document.getElementById("reset-filters"),
  groupBy: document.getElementById("group-by"),
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
  emptySummary: document.getElementById("empty-summary"),
  kpiGrid: document.getElementById("kpi-grid"),
  breakdownTable: document.querySelector("#breakdown-table tbody"),
  breakdownEmpty: document.getElementById("breakdown-empty"),
  picksTable: document.querySelector("#picks-table tbody"),
  picksEmpty: document.getElementById("picks-empty"),
  chartContainer: document.getElementById("chart-container"),
  chartEmpty: document.getElementById("chart-empty"),
  chartMeta: document.getElementById("chart-meta"),
  chartTooltip: document.getElementById("chart-tooltip"),
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setHidden(el, hidden) {
  if (!el) return;
  if (hidden) el.setAttribute("hidden", "");
  else el.removeAttribute("hidden");
}

function showError(message) {
  if (!els.error) return;
  els.error.textContent = message;
  setHidden(els.error, false);
}

function clearError() {
  if (!els.error) return;
  els.error.textContent = "";
  setHidden(els.error, true);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  const out = {};
  for (const key of FILTER_KEYS) {
    const v = (params.get(key) || "").trim();
    if (v) out[key] = v;
  }
  for (const key of BOOL_KEYS) {
    const v = params.get(key);
    if (v === "false") out[key] = false;
    else if (v === "true") out[key] = true;
  }
  const g = (params.get(GROUP_KEY) || "").trim();
  out[GROUP_KEY] = ALLOWED_GROUPS.has(g) ? g : DEFAULT_GROUP;
  // defaults
  if (!("official_only" in out)) out.official_only = true;
  if (!("settled_only" in out)) out.settled_only = true;
  return out;
}

function writeFiltersToUrl(filters) {
  const url = new URL(window.location.href);
  for (const key of FILTER_KEYS) {
    if (filters[key]) url.searchParams.set(key, filters[key]);
    else url.searchParams.delete(key);
  }
  for (const key of BOOL_KEYS) {
    if (filters[key] === false) url.searchParams.set(key, "false");
    else url.searchParams.delete(key);
  }
  if (filters[GROUP_KEY] && filters[GROUP_KEY] !== DEFAULT_GROUP) {
    url.searchParams.set(GROUP_KEY, filters[GROUP_KEY]);
  } else {
    url.searchParams.delete(GROUP_KEY);
  }
  window.history.replaceState({}, "", url);
}

function applyFiltersToForm(filters) {
  const map = {
    sport: "f-sport",
    market_key: "f-market",
    bookmaker_key: "f-book",
    confidence_bucket: "f-confidence",
    model_probability_bucket: "f-prob-bucket",
    model_version: "f-model-version",
    prediction_mode: "f-mode",
    start_date: "f-start",
    end_date: "f-end",
    min_model_probability: "f-min-prob",
    max_model_probability: "f-max-prob",
  };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.value = filters[key] || "";
  }
  document.getElementById("f-official").checked = filters.official_only !== false;
  document.getElementById("f-settled").checked = filters.settled_only !== false;
  els.groupBy.value = ALLOWED_GROUPS.has(filters[GROUP_KEY]) ? filters[GROUP_KEY] : DEFAULT_GROUP;
}

function readFiltersFromForm() {
  const out = {};
  const map = {
    sport: "f-sport",
    market_key: "f-market",
    bookmaker_key: "f-book",
    confidence_bucket: "f-confidence",
    model_probability_bucket: "f-prob-bucket",
    model_version: "f-model-version",
    prediction_mode: "f-mode",
    start_date: "f-start",
    end_date: "f-end",
    min_model_probability: "f-min-prob",
    max_model_probability: "f-max-prob",
  };
  for (const [key, id] of Object.entries(map)) {
    const v = (document.getElementById(id).value || "").trim();
    if (v) out[key] = v;
  }
  out.official_only = document.getElementById("f-official").checked;
  out.settled_only = document.getElementById("f-settled").checked;
  out[GROUP_KEY] = els.groupBy.value || DEFAULT_GROUP;
  if (out.start_date && !isIsoDate(out.start_date)) delete out.start_date;
  if (out.end_date && !isIsoDate(out.end_date)) delete out.end_date;
  return out;
}

function buildQuery(filters, { includeSettled = true, overrides = {} } = {}) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    if (filters[key]) params.set(key, filters[key]);
  }
  params.set("official_only", filters.official_only === false ? "false" : "true");
  if (includeSettled) {
    params.set("settled_only", filters.settled_only === false ? "false" : "true");
  } else {
    params.set("settled_only", "false");
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === undefined) params.delete(k);
    else params.set(k, v);
  }
  return params.toString();
}

async function fetchJson(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function fmtPct(value, { digits = 2 } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtUnits(value, { digits = 2 } = {}) {
  if (value === null || value === undefined) return "N/A";
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}u`;
}

function fmtNumber(value) {
  if (value === null || value === undefined) return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtDelta(value, { digits = 2, asPct = true } = {}) {
  if (value === null || value === undefined) return "N/A";
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  const sign = n > 0 ? "+" : "";
  return asPct ? `${sign}${(n * 100).toFixed(digits)}%` : `${sign}${n.toFixed(digits)}`;
}

function kpiCard(label, value, sub, tone) {
  const cls = tone ? `kpi ${tone}` : "kpi";
  return `<div class="${cls}">
    <div class="k-label">${esc(label)}</div>
    <div class="k-value">${esc(value)}</div>
    ${sub ? `<div class="k-sub">${esc(sub)}</div>` : ""}
  </div>`;
}

function renderSummary(summary) {
  if (!summary || summary.pick_count === 0) {
    setHidden(els.kpiGrid, true);
    setHidden(els.emptySummary, false);
    els.emptySummary.textContent =
      "No picks match these filters. Adjust filters or wait for the next published board.";
    return;
  }

  const settled = Number(summary.settled_count || 0);
  const pending = Number(summary.pending_count || 0);
  const roiTone = summary.roi === null || summary.roi === undefined
    ? ""
    : Number(summary.roi) > 0 ? "positive" : Number(summary.roi) < 0 ? "negative" : "";

  if (settled === 0) {
    setHidden(els.kpiGrid, true);
    setHidden(els.emptySummary, false);
    els.emptySummary.innerHTML =
      "Performance tracking is not populated yet for these filters. " +
      "The board can show picks, but record / ROI / CLV require settled official pick history. " +
      `<br><span class="pill-tag">${esc(fmtNumber(pending))} pending pick${pending === 1 ? "" : "s"}</span>`;
    return;
  }

  setHidden(els.emptySummary, true);
  setHidden(els.kpiGrid, false);

  const clvCoverage = summary.clv_coverage;
  const avgClv = summary.avg_clv_prob_delta;
  const clvValue = (clvCoverage && Number(clvCoverage) > 0 && avgClv !== null && avgClv !== undefined)
    ? fmtDelta(avgClv, { digits: 2, asPct: true })
    : "N/A";
  const clvSub = (clvCoverage && Number(clvCoverage) > 0)
    ? `${fmtPct(clvCoverage, { digits: 0 })} coverage (${fmtNumber(summary.clv_count)}/${fmtNumber(settled)})`
    : "No CLV data yet";

  els.kpiGrid.innerHTML = [
    kpiCard("Record", summary.record || "0-0-0", `${fmtNumber(settled)} settled`),
    kpiCard("Net units", fmtUnits(summary.units_won), `Risked ${fmtNumber(summary.units_risked)}u`,
      Number(summary.units_won) > 0 ? "positive" : Number(summary.units_won) < 0 ? "negative" : ""),
    kpiCard("ROI", fmtPct(summary.roi), `${fmtNumber(summary.units_risked)}u risked`, roiTone),
    kpiCard("Avg CLV", clvValue, clvSub),
    kpiCard("CLV coverage", clvCoverage === null || clvCoverage === undefined ? "N/A" : fmtPct(clvCoverage, { digits: 0 }),
      `${fmtNumber(summary.clv_count)} of ${fmtNumber(settled)} settled`),
    kpiCard("Settled / Pending", `${fmtNumber(settled)} / ${fmtNumber(pending)}`,
      `${fmtNumber(summary.pick_count)} total`),
  ].join("");
}

function renderBreakdown(payload) {
  const tbody = els.breakdownTable;
  tbody.innerHTML = "";
  const groups = (payload && Array.isArray(payload.groups)) ? payload.groups : [];
  if (!groups.length) {
    setHidden(els.breakdownEmpty, false);
    els.breakdownEmpty.textContent = "No grouped rows for these filters yet.";
    return;
  }
  setHidden(els.breakdownEmpty, true);

  const html = groups.map((g) => {
    const label = g.group_value === null || g.group_value === undefined || g.group_value === ""
      ? "(unknown)"
      : g.group_value;
    const roi = g.roi === null || g.roi === undefined ? "N/A" : fmtPct(g.roi);
    const avgClv = (g.clv_coverage && Number(g.clv_coverage) > 0 && g.avg_clv_prob_delta !== null && g.avg_clv_prob_delta !== undefined)
      ? fmtDelta(g.avg_clv_prob_delta, { digits: 2, asPct: true })
      : "N/A";
    const clvCov = g.clv_coverage === null || g.clv_coverage === undefined
      ? "N/A"
      : fmtPct(g.clv_coverage, { digits: 0 });
    return `<tr>
      <td>${esc(label)}</td>
      <td class="num">${esc(fmtNumber(g.pick_count))}</td>
      <td class="num">${esc(fmtNumber(g.settled_count))}</td>
      <td>${esc(g.record || "0-0-0")}</td>
      <td class="num">${esc(fmtNumber(g.units_risked))}</td>
      <td class="num">${esc(fmtUnits(g.units_won))}</td>
      <td class="num">${esc(roi)}</td>
      <td class="num">${esc(avgClv)}</td>
      <td class="num">${esc(clvCov)}</td>
    </tr>`;
  }).join("");
  tbody.innerHTML = html;
}

function statusPill(pick) {
  if (!pick.is_settled) return `<span class="pill-tag">Pending</span>`;
  const r = (pick.result_status || "").toLowerCase();
  if (r === "win") return `<span class="pill-tag good">Win</span>`;
  if (r === "loss") return `<span class="pill-tag bad">Loss</span>`;
  if (r === "push") return `<span class="pill-tag">Push</span>`;
  if (r === "void") return `<span class="pill-tag">Void</span>`;
  return `<span class="pill-tag">Settled</span>`;
}

function fmtAmerican(price) {
  if (price === null || price === undefined) return "—";
  const n = Number(price);
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function renderPicks(payload) {
  const tbody = els.picksTable;
  tbody.innerHTML = "";
  const picks = (payload && Array.isArray(payload.picks)) ? payload.picks : [];
  if (!picks.length) {
    setHidden(els.picksEmpty, false);
    els.picksEmpty.textContent = "No picks for these filters.";
    return;
  }
  setHidden(els.picksEmpty, true);
  const html = picks.map((p) => {
    const game = p.game_label || "";
    const selection = [p.outcome_name || p.outcome_side, p.line !== null && p.line !== undefined ? p.line : ""]
      .filter((x) => x !== "" && x !== null && x !== undefined).join(" ");
    const modelPct = p.model_probability === null || p.model_probability === undefined
      ? "N/A"
      : fmtPct(p.model_probability, { digits: 1 });
    const unitsWon = p.is_settled ? fmtUnits(p.units_won) : "—";
    const clv = (p.clv_prob_delta === null || p.clv_prob_delta === undefined)
      ? "N/A"
      : fmtDelta(p.clv_prob_delta, { digits: 2, asPct: true });
    return `<tr>
      <td>${esc(p.target_date || "")}</td>
      <td>${esc(game)}</td>
      <td>${esc(p.market_key || "")}</td>
      <td>${esc(selection)}</td>
      <td>${esc(p.bookmaker_title || p.bookmaker_key || "")}</td>
      <td class="num">${esc(fmtAmerican(p.price_american))}</td>
      <td class="num">${esc(modelPct)}</td>
      <td>${esc(p.confidence_bucket_label || p.confidence_bucket_key || "")}</td>
      <td>${statusPill(p)}</td>
      <td>${esc((p.result_status || "").toUpperCase() || (p.is_settled ? "—" : ""))}</td>
      <td class="num">${esc(unitsWon)}</td>
      <td class="num">${esc(clv)}</td>
    </tr>`;
  }).join("");
  tbody.innerHTML = html;
}

function fmtUnitsSigned(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0u";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)}u`;
}

function buildCumulativeSeries(groups) {
  // Expects /performance/breakdown rows with group_by="date" and group_value=YYYY-MM-DD.
  const rows = (groups || [])
    .filter((g) => g && typeof g.group_value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.group_value))
    .map((g) => ({
      date: g.group_value,
      ts: Date.parse(`${g.group_value}T00:00:00Z`),
      daily_units: Number(g.units_won) || 0,
      daily_risked: Number(g.units_risked) || 0,
      settled_count: Number(g.settled_count) || 0,
      record: g.record || "0-0-0",
    }))
    .filter((r) => Number.isFinite(r.ts))
    .sort((a, b) => a.ts - b.ts);

  let acc = 0;
  return rows.map((r) => {
    acc += r.daily_units;
    return { ...r, cumulative: acc };
  });
}

function renderChart(payload) {
  const container = els.chartContainer;
  if (!container) return;

  // Strip any prior svg (keep tooltip element).
  const oldSvg = container.querySelector("svg");
  if (oldSvg) oldSvg.remove();
  if (els.chartTooltip) els.chartTooltip.classList.remove("is-visible");

  const series = buildCumulativeSeries(payload && payload.groups);

  if (!series.length) {
    setHidden(els.chartEmpty, false);
    els.chartEmpty.textContent =
      "No settled picks for these filters yet — the curve will appear once results post.";
    if (els.chartMeta) els.chartMeta.textContent = "0 settled days";
    return;
  }
  setHidden(els.chartEmpty, true);

  const W = 800;
  const H = 240;
  const M = { top: 16, right: 18, bottom: 30, left: 50 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const tsMin = series[0].ts;
  const tsMax = series[series.length - 1].ts;
  const tsSpan = Math.max(1, tsMax - tsMin);

  const yVals = series.map((r) => r.cumulative);
  let yMin = Math.min(0, ...yVals);
  let yMax = Math.max(0, ...yVals);
  if (yMin === yMax) {
    // Pure-zero series: still draw a baseline with a touch of head/foot room.
    yMin = -1;
    yMax = 1;
  } else {
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
  }
  const ySpan = yMax - yMin;

  const xFor = (ts) =>
    series.length === 1
      ? M.left + innerW / 2
      : M.left + ((ts - tsMin) / tsSpan) * innerW;
  const yFor = (v) => M.top + ((yMax - v) / ySpan) * innerH;

  const zeroY = yFor(0);
  const linePts = series.map((r) => `${xFor(r.ts).toFixed(2)},${yFor(r.cumulative).toFixed(2)}`);

  // Area path: top edge is the line, bottom edge is the zero baseline.
  const areaParts = [];
  areaParts.push(`M ${xFor(series[0].ts).toFixed(2)} ${zeroY.toFixed(2)}`);
  for (const r of series) {
    areaParts.push(`L ${xFor(r.ts).toFixed(2)} ${yFor(r.cumulative).toFixed(2)}`);
  }
  areaParts.push(`L ${xFor(series[series.length - 1].ts).toFixed(2)} ${zeroY.toFixed(2)}`);
  areaParts.push("Z");
  const areaPath = areaParts.join(" ");

  const linePath =
    series.length === 1
      ? ""
      : `M ${linePts[0]} ${linePts.slice(1).map((p) => `L ${p}`).join(" ")}`;

  // Y-axis ticks: zero, max, min.
  const yTicks = new Set([0, yMax, yMin]);
  const yTickHtml = [...yTicks]
    .map(
      (v) =>
        `<text class="label" x="${(M.left - 6).toFixed(2)}" y="${(yFor(v) + 3).toFixed(2)}" text-anchor="end">${esc(fmtUnitsSigned(v, Math.abs(v) >= 10 ? 0 : 1))}</text>`
    )
    .join("");

  // X-axis labels: first, last, optional middle if >= 4 points.
  const xLabelTs = series.length >= 4
    ? [series[0].ts, series[Math.floor(series.length / 2)].ts, series[series.length - 1].ts]
    : [series[0].ts, series[series.length - 1].ts];
  const xLabelHtml = [...new Set(xLabelTs)]
    .map((ts) => {
      const date = new Date(ts).toISOString().slice(0, 10);
      const anchor = ts === tsMin ? "start" : ts === tsMax ? "end" : "middle";
      return `<text class="label" x="${xFor(ts).toFixed(2)}" y="${(H - 10).toFixed(2)}" text-anchor="${anchor}">${esc(date)}</text>`;
    })
    .join("");

  const pointsHtml = series
    .map((r, i) => {
      const cls = r.daily_units > 0 ? "point win" : r.daily_units < 0 ? "point loss" : "point";
      return `<circle class="${cls}" cx="${xFor(r.ts).toFixed(2)}" cy="${yFor(r.cumulative).toFixed(2)}" r="3.5" data-i="${i}"></circle>`;
    })
    .join("");

  const svg = `
<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Cumulative units curve">
  <defs>
    <clipPath id="chart-clip-pos"><rect x="0" y="0" width="${W}" height="${Math.max(0, zeroY).toFixed(2)}"></rect></clipPath>
    <clipPath id="chart-clip-neg"><rect x="0" y="${zeroY.toFixed(2)}" width="${W}" height="${Math.max(0, H - zeroY).toFixed(2)}"></rect></clipPath>
  </defs>
  <line class="axis" x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${(H - M.bottom).toFixed(2)}"></line>
  <line class="axis" x1="${M.left}" y1="${(H - M.bottom).toFixed(2)}" x2="${(W - M.right).toFixed(2)}" y2="${(H - M.bottom).toFixed(2)}"></line>
  <path class="area-pos" d="${areaPath}" clip-path="url(#chart-clip-pos)"></path>
  <path class="area-neg" d="${areaPath}" clip-path="url(#chart-clip-neg)"></path>
  <line class="zero-line" x1="${M.left}" y1="${zeroY.toFixed(2)}" x2="${(W - M.right).toFixed(2)}" y2="${zeroY.toFixed(2)}"></line>
  ${linePath ? `<path class="line" d="${linePath}"></path>` : ""}
  ${pointsHtml}
  ${yTickHtml}
  ${xLabelHtml}
  <rect class="hover-target" x="${M.left}" y="${M.top}" width="${innerW}" height="${innerH}"></rect>
</svg>`;

  container.insertAdjacentHTML("beforeend", svg);

  // Hover tooltip + nearest-point lookup.
  const svgEl = container.querySelector("svg");
  const tt = els.chartTooltip;

  function showTooltipForIndex(i, clientX, clientY) {
    const r = series[i];
    if (!r || !tt) return;
    const cumCls = r.cumulative > 0 ? "pos" : r.cumulative < 0 ? "neg" : "";
    const dailyCls = r.daily_units > 0 ? "pos" : r.daily_units < 0 ? "neg" : "";
    tt.innerHTML =
      `<div><strong>${esc(r.date)}</strong></div>` +
      `<div class="t-units ${cumCls}">${esc(fmtUnitsSigned(r.cumulative))} cumulative</div>` +
      `<div class="t-sub">Day: <span class="t-units ${dailyCls}">${esc(fmtUnitsSigned(r.daily_units))}</span> · ${esc(r.record)} (${esc(String(r.settled_count))} settled)</div>`;
    const rect = container.getBoundingClientRect();
    tt.style.left = `${clientX - rect.left}px`;
    tt.style.top = `${clientY - rect.top}px`;
    tt.classList.add("is-visible");
  }
  function hideTooltip() {
    if (tt) tt.classList.remove("is-visible");
  }

  svgEl.addEventListener("mousemove", (ev) => {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0) return;
    // Convert client x → viewBox x.
    const vx = ((ev.clientX - rect.left) / rect.width) * W;
    if (vx < M.left || vx > W - M.right) {
      hideTooltip();
      return;
    }
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(xFor(series[i].ts) - vx);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    showTooltipForIndex(bestI, ev.clientX, ev.clientY);
  });
  svgEl.addEventListener("mouseleave", hideTooltip);

  // Header meta: total settled days, last cumulative.
  if (els.chartMeta) {
    const last = series[series.length - 1];
    const totalSettled = series.reduce((s, r) => s + r.settled_count, 0);
    const totalRisked = series.reduce((s, r) => s + r.daily_risked, 0);
    const cumCls = last.cumulative > 0 ? "pos" : last.cumulative < 0 ? "neg" : "";
    els.chartMeta.innerHTML =
      `<strong class="${cumCls}">${esc(fmtUnitsSigned(last.cumulative))}</strong> over ${esc(String(series.length))} settled day${series.length === 1 ? "" : "s"}` +
      ` · ${esc(String(totalSettled))} pick${totalSettled === 1 ? "" : "s"}` +
      ` · ${esc(totalRisked.toFixed(2))}u risked`;
  }
}

function fillSelect(selectId, options, { keyField = null, labelField = null, currentValue = "" } = {}) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const seen = new Set();
  const optsHtml = ['<option value="">All</option>'];
  for (const opt of options || []) {
    let key, label;
    if (typeof opt === "string" || typeof opt === "number") {
      key = String(opt);
      label = String(opt);
    } else if (opt && typeof opt === "object") {
      key = String(opt[keyField] ?? opt.key ?? "");
      label = String(opt[labelField] ?? opt.label ?? opt.title ?? key);
    } else {
      continue;
    }
    if (!key || seen.has(key)) continue;
    seen.add(key);
    optsHtml.push(`<option value="${esc(key)}">${esc(label)}</option>`);
  }
  sel.innerHTML = optsHtml.join("");
  if (currentValue && seen.has(currentValue)) sel.value = currentValue;
}

async function loadFilters(filters) {
  try {
    const qs = filters.sport ? `?sport=${encodeURIComponent(filters.sport)}` : "";
    const data = await fetchJson(`${API_BASE}/api/v1/performance/filters${qs}`);
    fillSelect("f-sport", data.sports || [], { currentValue: filters.sport || "" });
    fillSelect("f-market", data.markets || [], { currentValue: filters.market_key || "" });
    fillSelect("f-book", data.bookmakers || [], { keyField: "key", labelField: "title", currentValue: filters.bookmaker_key || "" });
    fillSelect("f-confidence", data.confidence_buckets || [], { keyField: "key", labelField: "label", currentValue: filters.confidence_bucket || "" });
    fillSelect("f-prob-bucket", data.model_probability_buckets || [], { currentValue: filters.model_probability_bucket || "" });
    fillSelect("f-model-version", data.model_versions || [], { currentValue: filters.model_version || "" });
    fillSelect("f-mode", data.prediction_modes || [], { currentValue: filters.prediction_mode || "" });
  } catch (err) {
    showError(`Failed to load filter options: ${err.message}`);
  }
}

async function loadAll(filters) {
  clearError();
  setHidden(els.loading, false);
  setHidden(els.kpiGrid, true);
  setHidden(els.emptySummary, true);

  const summaryQs = buildQuery(filters, { includeSettled: false, overrides: { settled_only: filters.settled_only === false ? "false" : "true" } });
  const breakdownQs = buildQuery(filters, { overrides: { group_by: filters[GROUP_KEY] || DEFAULT_GROUP, settled_only: filters.settled_only === false ? "false" : "true" } });
  const picksQs = buildQuery(filters, { includeSettled: false, overrides: { limit: "100", settled_only: "false" } });
  // Chart always reflects settled history (cumulative units only makes sense for graded picks),
  // but otherwise inherits the active filters so the curve matches the rest of the page.
  const chartQs = buildQuery(filters, { includeSettled: false, overrides: { group_by: "date", settled_only: "true" } });

  try {
    const [summary, breakdown, picks, chart] = await Promise.all([
      fetchJson(`${API_BASE}/api/v1/performance/summary?${summaryQs}`),
      fetchJson(`${API_BASE}/api/v1/performance/breakdown?${breakdownQs}`),
      fetchJson(`${API_BASE}/api/v1/performance/picks?${picksQs}`),
      fetchJson(`${API_BASE}/api/v1/performance/breakdown?${chartQs}`),
    ]);
    renderSummary(summary && summary.summary);
    renderBreakdown(breakdown);
    renderPicks(picks);
    renderChart(chart);
  } catch (err) {
    showError(`Failed to load performance data: ${err.message}`);
    setHidden(els.kpiGrid, true);
  } finally {
    setHidden(els.loading, true);
  }
}

async function refresh(filters) {
  applyFiltersToForm(filters);
  writeFiltersToUrl(filters);
  await loadFilters(filters);
  // Re-apply form values in case the selects only just got populated.
  applyFiltersToForm(filters);
  await loadAll(filters);
}

function init() {
  const filters = readFilters();
  applyFiltersToForm(filters);

  els.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const next = readFiltersFromForm();
    refresh(next);
  });

  els.reset.addEventListener("click", () => {
    const next = { official_only: true, settled_only: true, [GROUP_KEY]: DEFAULT_GROUP };
    refresh(next);
  });

  els.groupBy.addEventListener("change", () => {
    const next = readFiltersFromForm();
    refresh(next);
  });

  refresh(filters);
}

init();
