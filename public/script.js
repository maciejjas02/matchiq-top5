// === Prosty stan ===
const state = {
  leagues: [],
  selections: [], // [{matchId, outcome, odd, home, away}]
  activeLeagues: new Set()
};

// === Elementy DOM (z bezpiecznymi fallbackami) ===
const datePicker  = document.getElementById('datePicker') || document.querySelector('input[type="date"]') || document.querySelector('#date');
const refreshBtn  = document.getElementById('refreshBtn') || document.getElementById('refresh');
const searchInput = document.getElementById('searchInput') || document.getElementById('search');
const matchCount  = document.getElementById('matchCount')  || document.querySelector('[data-match-count]');
const matchesWrap =
  document.getElementById('matchesContainer') ||
  document.getElementById('matches') ||
  document.querySelector('#app') ||
  document.body;

// === Utils ===
const fmtTime = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const idOf = m => `${m.home}|${m.away}|${m.utcDate}`;

// Akcent PL: 1 mecz / 2–4 mecze / 5+ meczów
const pluralMecz = n => (n===1 ? 'mecz' : (n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14) ? 'mecze' : 'meczów'));

// Parsowanie różnych formatów daty -> YYYY-MM-DD
function normalizeDateInput(raw) {
  if (!raw) return new Date().toISOString().slice(0,10);
  const s = String(raw).trim().replace(/\s+/g,'').replace(/\./g,'-').replace(/\//g,'-');
  // 2025-09-13
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 13-09-2025
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Fallback: dziś
  return new Date().toISOString().slice(0,10);
}

// === Selekcja kursów: jedna selekcja na mecz + toggle ===
function toggleSelection(match, outcome, odd) {
  const matchId = idOf(match);
  const existing = state.selections.find(s => s.matchId === matchId);

  // kliknięto ten sam wybór -> usuń
  if (existing && existing.outcome === outcome) {
    state.selections = state.selections.filter(s => s.matchId !== matchId);
    updateCellsSelection(matchId, null);
    saveSlip();
    renderSlip();
    return;
  }

  if (existing) {
    existing.outcome = outcome;
    existing.odd = odd;
  } else {
    state.selections.push({ matchId, outcome, odd, home: match.home, away: match.away });
  }
  updateCellsSelection(matchId, outcome);
  saveSlip();
  renderSlip();
}

function updateCellsSelection(matchId, outcome) {
  document.querySelectorAll(`td.odd[data-mid="${CSS.escape(matchId)}"]`).forEach(td => {
    if (outcome && td.dataset.outcome === outcome) td.classList.add('selected');
    else td.classList.remove('selected');
  });
}

function saveSlip() {
  try { localStorage.setItem('matchiq_slip', JSON.stringify(state.selections)); } catch {}
}
function loadSlip() {
  try {
    const s = JSON.parse(localStorage.getItem('matchiq_slip') || '[]');
    if (Array.isArray(s)) state.selections = s;
  } catch {}
}

// === Render ===
function buildLeagueChips() {
  // jeśli w HTML masz pasek z chipami lig, możesz tu dodać ich generowanie
  // na razie: domyślnie włącz wszystkie ligi
  if (state.activeLeagues.size === 0) {
    state.leagues.forEach(l => state.activeLeagues.add(l.name));
  }
}

function renderMatches() {
  const q = (searchInput?.value || '').toLowerCase().trim();
  matchesWrap.querySelectorAll('.league-section').forEach(n => n.remove());

  let visible = 0;

  state.leagues.forEach(league => {
    if (!state.activeLeagues.has(league.name)) return;

    const filtered = league.matches.filter(m => {
      if (!q) return true;
      const hay = `${league.name} ${m.home} ${m.away}`.toLowerCase();
      return hay.includes(q);
    });
    if (!filtered.length) return;

    const section = document.createElement('section');
    section.className = 'league-section';

    const h3 = document.createElement('h3');
    h3.textContent = league.name;
    section.appendChild(h3);

    const table = document.createElement('table');
    table.className = 'matches-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="time">Czas</th>
          <th class="matchup">Mecz</th>
          <th>1</th>
          <th>X</th>
          <th>2</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    filtered.forEach(m => {
      visible++;
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td');
      tdTime.className = 'time';
      tdTime.textContent = fmtTime(m.utcDate);

      const tdMatch = document.createElement('td');
      tdMatch.className = 'matchup';
      tdMatch.textContent = `${m.home} — ${m.away}`;

      const makeOddCell = (key) => {
        const td = document.createElement('td');
        td.className = 'odd';
        td.tabIndex = 0;
        td.dataset.mid = idOf(m);
        td.dataset.outcome = key;
        td.textContent = Number(m.odds[key]).toFixed(2);
        td.addEventListener('click', () => toggleSelection(m, key, Number(m.odds[key])));
        td.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); td.click(); }
        });
        return td;
      };

      const td1 = makeOddCell('home');
      const tdX = makeOddCell('draw');
      const td2 = makeOddCell('away');

      tr.appendChild(tdTime);
      tr.appendChild(tdMatch);
      tr.appendChild(td1);
      tr.appendChild(tdX);
      tr.appendChild(td2);
      tbody.appendChild(tr);

      // podświetl już wybrane po odświeżeniu
      const sel = state.selections.find(s => s.matchId === idOf(m));
      if (sel) updateCellsSelection(idOf(m), sel.outcome);
    });

    section.appendChild(table);
    matchesWrap.appendChild(section);
  });

  if (matchCount) matchCount.textContent = `${visible} ${pluralMecz(visible)}`;
}

function renderSlip() {
  // jeżeli masz własny markup kuponu, uzupełnij ten renderer.
  // Tu tylko aktualizujemy łączny kurs i licznik pozycji (jeśli istnieją).
  const combined = state.selections.reduce((acc, s) => acc * Number(s.odd || 1), 1);
  const combinedEl = document.getElementById('combinedOdds');
  const selCountEl = document.getElementById('selCount');
  if (combinedEl) combinedEl.textContent = state.selections.length ? combined.toFixed(2) : '—';
  if (selCountEl) selCountEl.textContent = String(state.selections.length);
}

// === Ładowanie danych ===
async function loadMatchesFor(dateISO) {
  // wymuszamy świeże dane – omijamy edge cache
  const url = `/matches/${dateISO}?nocache=1`;
  let data;
  try {
    const r = await fetch(url);
    data = await r.json();
  } catch (e) {
    console.error('Fetch error', e);
    data = { leagues: [] };
  }

  state.leagues = Array.isArray(data.leagues) ? data.leagues : [];

  // domyślnie aktywuj wszystkie ligi (przy pierwszym załadowaniu)
  if (state.activeLeagues.size === 0) state.leagues.forEach(l => state.activeLeagues.add(l.name));

  buildLeagueChips();
  renderMatches();

  // Gdy pusto, a backend podał nextDate – zaproponuj przeskok
  const bannerId = 'infoBanner';
  document.getElementById(bannerId)?.remove();
  if ((!state.leagues.length || (matchCount && matchCount.textContent.startsWith('0 '))) && data.nextDate && data.nextDate !== dateISO) {
    const box = document.createElement('div');
    box.id = bannerId;
    box.style.margin = '10px';
    box.style.padding = '10px';
    box.style.background = '#232';
    box.style.border = '1px solid #333';
    box.style.borderRadius = '8px';
    box.style.color = '#ddd';
    box.innerHTML = `Brak kursów dla tej daty. Najbliższe mecze: <b>${data.nextDate}</b>
      <button id="jumpNext" style="margin-left:8px;padding:4px 8px;cursor:pointer;">Przejdź</button>`;
    matchesWrap.parentElement?.insertBefore(box, matchesWrap);
    box.querySelector('#jumpNext').addEventListener('click', () => {
      if (datePicker) datePicker.value = data.nextDate;
      loadMatchesFor(data.nextDate);
    });
  }
}

// === Zdarzenia ===
refreshBtn && refreshBtn.addEventListener('click', () => {
  const iso = normalizeDateInput(datePicker?.value || '');
  loadMatchesFor(iso);
});

datePicker && datePicker.addEventListener('change', () => {
  const iso = normalizeDateInput(datePicker.value);
  loadMatchesFor(iso);
});

searchInput && searchInput.addEventListener('input', () => renderMatches());

// === Start ===
(function boot(){
  loadSlip();
  // ustaw domyślnie dziś (nie zmieniaj użytkownikowi formatu)
  const todayISO = new Date().toISOString().slice(0,10);
  if (datePicker && !datePicker.value) datePicker.value = todayISO;
  loadMatchesFor(normalizeDateInput(datePicker?.value || todayISO));
})();
