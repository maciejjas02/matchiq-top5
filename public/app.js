const $ = (s) => document.querySelector(s);
const listEl = $("#list");
const sourceEl = $("#source");
const dateEl = $("#d");
const qEl = $("#q");
const reloadBtn = $("#reload");
const infoEl = $("#info");
const nocacheEl = $("#nocache");

let last = { items: [], source: "" };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Odporny parser – usuwa +HH:MM, dopina Z, itp.
function toLocalHM(isoOrNull) {
  if (!isoOrNull) return "—";
  let s = String(isoOrNull);
  if (/\+\d{2}:\d{2}$/.test(s)) s = s.replace(/\+\d{2}:\d{2}$/, "Z");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    if (/^\d{2}:\d{2}$/.test(s)) s += ":00";
    s = `${todayISO()}T${s}Z`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function load() {
  const ymd = dateEl.value || todayISO();
  const url = `/matches/${ymd}${nocacheEl.checked ? "?nocache=1" : ""}`;

  infoEl.textContent = "Ładowanie…";
  sourceEl.textContent = "";
  listEl.innerHTML = "";

  const r = await fetch(url);
  if (!r.ok) {
    infoEl.textContent = "Błąd ładowania.";
    return;
  }
  const data = await r.json();
  const items = Array.isArray(data.items) ? data.items : [];
  last = { items, source: data.source || "" };
  render();
}

function render() {
  const { items, source } = last;
  const q = (qEl.value || "").toLowerCase().trim();
  const filtered = !q
    ? items
    : items.filter(
        (x) =>
          x.home.toLowerCase().includes(q) ||
          x.away.toLowerCase().includes(q) ||
          x.league.toLowerCase().includes(q)
      );

  listEl.innerHTML = "";
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty">Brak meczów do wyświetlenia.</div>`;
  } else {
    for (const m of filtered) {
      const time = toLocalHM(m.utcDate);
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div>
          <div style="font-weight:700">${time}</div>
          <div class="league">${m.league || ""}</div>
        </div>
        <div class="teams">${m.home}</div>
        <div class="teams">${m.away}</div>
      `;
      listEl.appendChild(el);
    }
  }
  sourceEl.textContent = source ? `źródło: ${source}` : "";
  infoEl.textContent = `${filtered.length} mecz(e/ów)`;
}

dateEl.value = todayISO();
qEl.addEventListener("input", render);
reloadBtn.addEventListener("click", load);
dateEl.addEventListener("change", load);
nocacheEl.addEventListener("change", load);
window.addEventListener("load", load);
