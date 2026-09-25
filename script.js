const API = "https://sahkotin.fi/prices?vat&fix";
const state = { today: [], tomorrow: [], activeDay: "today", lastUpdate: null };

const $ = (id) => document.getElementById(id);
const fmt = (n) =>
  Number(n).toLocaleString("fi-FI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }) + " snt/kWh";

function localDateISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function classify(prices) {
  const nums = prices
    .map((x) => x.value)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!nums.length) return () => "normal";
  const low = nums[Math.floor(nums.length * 0.25)];
  const high = nums[Math.floor(nums.length * 0.75)];
  return (v) => (v <= low ? "cheap" : v >= high ? "expensive" : "normal");
}
function parseRows(rows) {
  return rows
    .map((x, i) => ({
      value: Number(x.value),
      date: new Date(x.date),
      hour: new Date(x.date).getHours(),
      index: i,
    }))
    .filter((x) => Number.isFinite(x.value));
}
async function fetchPrices(start, end) {
  const url = `${API}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Hintadatan haku epäonnistui");
  const json = await res.json();
  return parseRows(json.prices || []);
}
async function load() {
  document.body.classList.add("loading");
  try {
    const today = localDateISO(0),
      tomorrow = localDateISO(1),
      dayAfter = localDateISO(2);
    const [a, b] = await Promise.all([
      fetchPrices(`${today}T00:00:00`, `${tomorrow}T00:00:00`),
      fetchPrices(`${tomorrow}T00:00:00`, `${dayAfter}T00:00:00`),
    ]);
    state.today = a;
    state.tomorrow = b;
    state.lastUpdate = new Date();
    render();
  } catch (e) {
    $("currentMeta").innerHTML =
      `<span class="error">${e.message}. Tarkista verkkoyhteys.</span>`;
  } finally {
    document.body.classList.remove("loading");
  }
}
function render() {
  const data = state[state.activeDay] || [];
  $("chartSubtitle").textContent =
    state.activeDay === "today" ? "Tänään" : "Huomenna";
  renderStats(data);
  renderGrid(data);
  drawChart(data);
  $("updatedAt").textContent = state.lastUpdate
    ? `Päivitetty ${state.lastUpdate.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}`
    : "—";
  calculate();
}
function renderStats(data) {
  if (!data.length) return;
  const vals = data.map((x) => x.value),
    min = Math.min(...vals),
    max = Math.max(...vals),
    avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const mi = data.find((x) => x.value === min),
    ma = data.find((x) => x.value === max);
  $("minPrice").textContent = fmt(min);
  $("minTime").textContent = timeLabel(mi);
  $("maxPrice").textContent = fmt(max);
  $("maxTime").textContent = timeLabel(ma);
  $("avgPrice").textContent = fmt(avg);
  const now = new Date();
  let current = data.find(
    (x) => x.date <= now && new Date(x.date.getTime() + 60 * 60 * 1000) > now,
  );
  if (state.activeDay === "tomorrow") current = null;
  if (current) {
    $("currentPrice").textContent = fmt(current.value);
    $("currentMeta").textContent = `${timeLabel(current)} · Suomi`;
    const badge = $("priceBadge"),
      cls = classify(data)(current.value);
    badge.className = `badge ${cls}`;
    badge.textContent =
      cls === "cheap" ? "HALPA" : cls === "expensive" ? "KALLIS" : "NORMAALI";
  } else if (state.activeDay === "tomorrow") {
    $("currentPrice").textContent = "—";
    $("currentMeta").textContent = "Huomisen hinta";
    $("priceBadge").className = "badge";
    $("priceBadge").textContent = "HUOMENNA";
  } else {
    $("currentPrice").textContent = "—";
    $("currentMeta").textContent = "Nykyistä tuntia ei löytynyt";
  }
}
function timeLabel(x) {
  if (!x) return "—";
  return `${String(x.date.getHours()).padStart(2, "0")}:00–${String((x.date.getHours() + 1) % 24).padStart(2, "0")}:00`;
}
function renderGrid(data) {
  const box = $("priceGrid");
  box.innerHTML = "";
  if (!data.length) {
    box.textContent = "Ei hintadataa.";
    return;
  }
  const fn = classify(data),
    now = new Date();
  data.forEach((x) => {
    const cls = fn(x.value);
    const el = document.createElement("div");
    const isCurrent =
      state.activeDay === "today" &&
      x.date <= now &&
      new Date(x.date.getTime() + 3600000) > now;
    el.className = `hour ${cls} ${isCurrent ? "current" : ""}`;
    el.innerHTML = `<span class="hour-time">${timeLabel(x)}</span><span class="hour-price">${Number(x.value).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span><span class="hour-tag">${cls === "cheap" ? "halpa" : cls === "expensive" ? "kallis" : "normaali"}</span>`;
    box.appendChild(el);
  });
}
function drawChart(data) {
  const svg = $("chart");
  svg.innerHTML = "";
  if (!data.length) return;
  const W = 1000,
    H = 360,
    pad = { l: 55, r: 18, t: 20, b: 38 };
  const min = Math.min(0, ...data.map((x) => x.value)),
    max = Math.max(...data.map((x) => x.value)),
    range = Math.max(1, max - min);
  const x = (i) =>
    pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v) => H - pad.b - ((v - min) * (H - pad.t - pad.b)) / range;
  for (let i = 0; i <= 4; i++) {
    const yy = pad.t + (i * (H - pad.t - pad.b)) / 4,
      val = max - ((max - min) * i) / 4;
    svg.insertAdjacentHTML(
      "beforeend",
      `<line class="grid-line" x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}"/><text class="axis-label" x="5" y="${yy + 4}">${val.toFixed(1)}</text>`,
    );
  }
  for (
    let i = 0;
    i < data.length;
    i += Math.max(1, Math.ceil(data.length / 12))
  ) {
    svg.insertAdjacentHTML(
      "beforeend",
      `<text class="axis-label" text-anchor="middle" x="${x(i)}" y="${H - 10}">${String(data[i].date.getHours()).padStart(2, "0")}</text>`,
    );
  }
  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const area = `${pad.l},${H - pad.b} ${points} ${x(data.length - 1)},${H - pad.b}`;
  svg.insertAdjacentHTML(
    "beforeend",
    `<polygon class="area" points="${area}" style="color:#e8edf4"/><polyline class="line" points="${points}" style="color:#e8edf4"/>`,
  );
  data.forEach((d, i) => {
    if (i % 2 === 0 || i === data.length - 1)
      svg.insertAdjacentHTML(
        "beforeend",
        `<circle class="point" cx="${x(i)}" cy="${y(d.value)}" r="4" style="color:#e8edf4"><title>${timeLabel(d)} — ${fmt(d.value)}</title></circle>`,
      );
  });
}
function calculate() {
  const kwh = Math.max(0, Number($("consumption").value) || 0);
  const margin = Math.max(0, Number($("margin").value) || 0);
  const data = state.today;
  if (!data.length) {
    $("calcResult").textContent = "—";
    return;
  }
  const now = new Date(),
    cur = data.find(
      (x) => x.date <= now && new Date(x.date.getTime() + 3600000) > now,
    );
  if (!cur) {
    $("calcResult").textContent = "—";
    return;
  }
  const euros = (kwh * (cur.value + margin)) / 100;
  $("calcResult").textContent = euros.toLocaleString("fi-FI", {
    style: "currency",
    currency: "EUR",
  });
}
$("refreshBtn").addEventListener("click", load);
document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");
    state.activeDay = btn.dataset.day;
    render();
  }),
);
["consumption", "margin"].forEach((id) =>
  $(id).addEventListener("input", calculate),
);
load();
setInterval(load, 5 * 60 * 1000);
