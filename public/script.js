// ======= STAN =======
const state = {
  leagues: [],
  activeLeagues: new Set(),
  // selection: { matchId, home, away, outcome, odd, prob? (0..1) }
  selections: []
};

// ======= DOM (z bezpiecznymi fallbackami) =======
const datePicker  = document.getElementById('datePicker') || document.querySelector('input[type="date"]');
const refreshBtn  = document.getElementById('refreshBtn') || document.getElementById('refresh');
const searchInput = document.getElementById('searchInput') || document.getElementById('search');
const matchCount  = document.getElementById('matchCount')  || document.querySelector('[data-match-count]');
const matchesWrap =
  document.getElementById('matchesContainer') ||
  document.getElementById('matches') ||
  document.querySelector('#app') || document.body;

// Kupon
const selectionsEl    = document.getElementById('selections');      // kontener na pozycje
const combinedOddsEl  = document.getElementById('combinedOdds');    // łączny kurs
const selCountEl      = document.getElementById('selCount');        // licznik pozycji (opcjonalnie)
const bankrollEl      = document.getElementById('bankroll');        // kapitał
const calcKellyBtn    = document.getElementById('calcKelly');       // przycisk liczenia
const kellyResultEl   = document.getElementById('kellyResult');     // wynik

// ======= Utils =======
const fmtTime = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const idOf = m => `${m.home}|${m.away}|${m.utcDate}`;
const pluralMecz = n => (n===1 ? 'mecz' : (n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14) ? 'mecze' : 'meczów'));

function normalizeDateInput(raw) {
  if (!raw) return new Date().toISOString().slice(0,10);
  const s = String(raw).trim().replace(/\s+/g,'').replace(/[./]/g,'-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;          // 2025-09-13
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);        // 13-09-2025
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return new Date().toISOString().slice(0,10);
}

// ======= PERSIST =======
function saveSlip() {
  try { localStorage.setItem('matchiq_slip', JSON.stringify(state.selections)); } catch {}
}
function loadSlip() {
  try {
    const s = JSON.parse(localStorage.getItem('matchiq_slip') || '[]');
    if (Array.isArray(s)) state.selections = s;
  } catch {}
}

// ======= RENDER MECZÓW =======
function buildLeagueChips() {
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
          <th>1</th><th>X</th><th>2</th>
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

      // odtwórz podświetlenie jeśli było wybrane
      const sel = state.selections.find(s => s.matchId === idOf(m));
      if (sel) updateCellsSelection(idOf(m), sel.outcome);
    });

    section.appendChild(table);
    matchesWrap.appendChild(section);
  });

  if (matchCount) matchCount.textContent = `${visible} ${pluralMecz(visible)}`;
}

// ======= WYBÓR KURSÓW (1 na mecz + toggle) =======
function updateCellsSelection(matchId, outcome) {
  document.querySelectorAll(`td.odd[data-mid="${CSS.escape(matchId)}"]`).forEach(td => {
    if (outcome && td.dataset.outcome === outcome) td.classList.add('selected');
    else td.classList.remove('selected');
  });
}

function toggleSelection(match, outcome, odd) {
  const matchId = idOf(match);
  const existing = state.selections.find(s => s.matchId === matchId);

  if (existing && existing.outcome === outcome) {
    // odznacz (usuń)
    state.selections = state.selections.filter(s => s.matchId !== matchId);
    updateCellsSelection(matchId, null);
  } else if (existing) {
    existing.outcome = outcome;
    existing.odd = odd;
  } else {
    state.selections.push({ matchId, home: match.home, away: match.away, outcome, odd });
  }

  saveSlip();
  renderSlip();
}

// ======= KUPON =======
function renderSlip() {
  if (!selectionsEl) return;

  selectionsEl.innerHTML = ''; // wyczyść

  // łączny kurs
  const combined = state.selections.reduce((a, s) => a * Number(s.odd || 1), 1);
  if (combinedOddsEl) combinedOddsEl.textContent = state.selections.length ? combined.toFixed(2) : '—';
  if (selCountEl)     selCountEl.textContent     = String(state.selections.length);

  // pozycje
  state.selections.forEach(sel => {
    const row = document.createElement('div');
    row.className = 'selection-item';

    // opis
    const outcomeLabel = sel.outcome === 'home' ? '1'
                       : sel.outcome === 'draw' ? 'X' : '2';
    const desc = document.createElement('div');
    desc.textContent = `${sel.home} — ${sel.away}  ${outcomeLabel} @ `;
    const oddsSpan = document.createElement('span');
    oddsSpan.className = 'odds';
    oddsSpan.textContent = Number(sel.odd).toFixed(2);
    desc.appendChild(oddsSpan);

    // procent prawdopodobieństwa
    const prob = document.createElement('input');
    prob.type = 'number';
    prob.className = 'prob-input';
    prob.min = '0';
    prob.max = '100';
    prob.step = '0.1';
    prob.placeholder = '%';
    if (typeof sel.prob === 'number') prob.value = (sel.prob * 100).toString();

    prob.addEventListener('input', () => {
      const v = Number(prob.value);
      if (!Number.isFinite(v)) { delete sel.prob; saveSlip(); return; }
      sel.prob = Math.min(1, Math.max(0, v / 100)); // 0..1
      saveSlip();
    });

    // usuń
    const remove = document.createElement('button');
    remove.className = 'remove-btn';
    remove.textContent = '✖';
    remove.title = 'Usuń z kuponu';
    remove.addEventListener('click', () => {
      // zdejmij zaznaczenie w liście meczów
      updateCellsSelection(sel.matchId, null);
      // usuń ze stanu
      state.selections = state.selections.filter(s => s.matchId !== sel.matchId);
      saveSlip();
      renderSlip();
    });

    row.appendChild(desc);
    row.appendChild(prob);
    const unit = document.createElement('span');
    unit.textContent = ' %';
    row.appendChild(unit);
    row.appendChild(remove);

    selectionsEl.appendChild(row);
  });
}

function calcKelly() {
  if (!kellyResultEl) return;

  if (!state.selections.length) {
    kellyResultEl.textContent = 'Brak wybranych typów.';
    kellyResultEl.className = 'negative';
    return;
  }

  // sprawdź prawdopodobieństwa
  const probs = [];
  for (const sel of state.selections) {
    if (typeof sel.prob !== 'number') {
      kellyResultEl.textContent = 'Uzupełnij % prawdopodobieństwa dla każdego typu.';
      kellyResultEl.className = 'negative';
      return;
    }
    probs.push(sel.prob);
  }

  // łączny kurs i łączne prawdopodobieństwo (parlay)
  const totalOdds = state.selections.reduce((a, s) => a * Number(s.odd || 1), 1);
  const totalProb = probs.reduce((a, p) => a * p, 1);

  const bankroll = Math.max(0, Number(bankrollEl?.value || 0));
  if (!bankroll) {
    kellyResultEl.textContent = 'Podaj kapitał (PLN).';
    kellyResultEl.className = 'negative';
    return;
  }

  const b = totalOdds - 1;
  const p = totalProb;
  const q = 1 - p;
  const f = (b * p - q) / b;         // Kelly
  const fClamped = Math.max(0, f);
  const stake = bankroll * fClamped;

  if (f <= 0) {
    kellyResultEl.textContent = 'Kelly ≤ 0 — nie obstawiaj (brak dodatniej wartości oczekiwanej).';
    kellyResultEl.className = 'zero';
    return;
  }

  kellyResultEl.textContent =
    `Kelly: ${(f * 100).toFixed(2)}% • Łączny kurs: ${totalOdds.toFixed(2)} • Stawka ≈ ${stake.toFixed(2)} PLN`;
  kellyResultEl.className = 'positive';
}

// ======= ŁADOWANIE DANYCH =======
async function loadMatchesFor(dateISO) {
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
  if (state.activeLeagues.size === 0) state.leagues.forEach(l => state.activeLeagues.add(l.name));

  buildLeagueChips();
  renderMatches();
  renderSlip();

  // Banner z „przeskocz do najbliższej daty”, jeśli pusto
  const bannerId = 'infoBanner';
  document.getElementById(bannerId)?.remove();
  const visible = matchesWrap.querySelectorAll('.league-section').length > 0;
  if (!visible && data.nextDate && data.nextDate !== dateISO) {
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

// ======= ZDARZENIA =======
refreshBtn && refreshBtn.addEventListener('click', () => {
  const iso = normalizeDateInput(datePicker?.value || '');
  loadMatchesFor(iso);
});
datePicker && datePicker.addEventListener('change', () => {
  const iso = normalizeDateInput(datePicker.value);
  loadMatchesFor(iso);
});
searchInput && searchInput.addEventListener('input', () => renderMatches());
calcKellyBtn && calcKellyBtn.addEventListener('click', calcKelly);

// ======= START =======
(function boot(){
  loadSlip();
  const todayISO = new Date().toISOString().slice(0,10);
  if (datePicker && !datePicker.value) datePicker.value = todayISO;
  loadMatchesFor(normalizeDateInput(datePicker?.value || todayISO));
})();
