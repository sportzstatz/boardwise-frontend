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

  try {
    const [summary, breakdown, picks] = await Promise.all([
      fetchJson(`${API_BASE}/api/v1/performance/summary?${summaryQs}`),
      fetchJson(`${API_BASE}/api/v1/performance/breakdown?${breakdownQs}`),
      fetchJson(`${API_BASE}/api/v1/performance/picks?${picksQs}`),
    ]);
    renderSummary(summary && summary.summary);
    renderBreakdown(breakdown);
    renderPicks(picks);
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
