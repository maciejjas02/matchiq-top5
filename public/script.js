// === Stan aplikacji ===
const state = {
  leagues: [],
  activeLeagues: new Set(),
  selections: [],               // { matchId, home, away, outcome, odd }
  theme: (localStorage.getItem('theme') || 'dark'),
};

// === Elementy DOM ===
const datePicker   = document.getElementById('datePicker');
const refreshBtn   = document.getElementById('refreshBtn');
const searchInput  = document.getElementById('searchInput');
const matchesWrap  = document.getElementById('matchesContainer');
const leagueChips  = document.getElementById('leagueChips');
const matchCount   = document.getElementById('matchCount');
const themeToggle  = document.getElementById('themeToggle');

const slip         = document.getElementById('slip');
const slipToggle   = document.getElementById('slipToggle');
const selectionsEl = document.getElementById('selections');
const combinedOddsEl = document.getElementById('combinedOdds');
const selCountEl   = document.getElementById('selCount');
const bankrollEl   = document.getElementById('bankroll');
const kellyFractionEl = document.getElementById('kellyFraction');
const kellyFractionVal = document.getElementById('kellyFractionVal');
const calcKellyBtn = document.getElementById('calcKelly');
const kellyResult  = document.getElementById('kellyResult');
const toastEl      = document.getElementById('toast');

// === Ustawienia startowe ===
document.documentElement.setAttribute('data-theme', state.theme);
if (themeToggle) themeToggle.textContent = state.theme === 'dark' ? '🌙' : '☀️';

const today = new Date().toISOString().slice(0,10);
if (datePicker) {
  datePicker.value = today;
  datePicker.min = today;
}

// === Utilsy ===
const fmtTime = iso => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const pluralMecz = n => (n===1 ? 'mecz' : (n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14) ? 'mecze' : 'meczów'));
const showToast = msg => { if(!toastEl) return; toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),1500); };
const matchIdOf = (m) => `${m.home}|${m.away}|${m.utcDate}`; // unikalny w obrębie dnia

// === Ładowanie meczów ===
async function loadMatches(dateStr){
  renderSkeleton();
  try {
    const r = await fetch(`/matches/${dateStr}`);
    const data = await r.json();
    state.leagues = Array.isArray(data.leagues) ? data.leagues : [];
    buildLeagueChips();
    renderMatches();   // podczas renderu zaznaczymy wcześniej wybrane selekcje (po matchId)
  } catch(e){
    matchesWrap.innerHTML = `<div class="league glass"><div class="muted" style="padding:12px">Błąd ładowania danych.</div></div>`;
  }
}
function renderSkeleton(){
  matchesWrap.innerHTML = '';
  const skeleton = document.createElement('div');
  skeleton.className = 'league glass';
  skeleton.innerHTML = `
    <div class="league-header skeleton" style="width: 220px; height: 22px;"></div>
    <div class="match-card skeleton"></div>
    <div class="match-card skeleton"></div>
    <div class="match-card skeleton"></div>`;
  matchesWrap.appendChild(skeleton.cloneNode(true));
  matchesWrap.appendChild(skeleton.cloneNode(true));
  matchesWrap.appendChild(skeleton.cloneNode(true));
}

// Chipy lig
function buildLeagueChips(){
  if (!leagueChips) return;
  leagueChips.innerHTML = '';
  const names = state.leagues.map(l => l.name);
  if (state.activeLeagues.size === 0) names.forEach(n => state.activeLeagues.add(n));
  names.forEach(name=>{
    const chip = document.createElement('button');
    chip.className = 'chip' + (state.activeLeagues.has(name) ? ' active' : '');
    chip.textContent = name.replace(/\s*\(.*?\)\s*/,'');
    chip.title = name;
    chip.addEventListener('click', ()=>{
      if (state.activeLeagues.has(name)) state.activeLeagues.delete(name);
      else state.activeLeagues.add(name);
      chip.classList.toggle('active');
      renderMatches();
    });
    leagueChips.appendChild(chip);
  });
}

// Render listy meczów (karty)
function renderMatches(){
  const q = (searchInput?.value || '').toLowerCase().trim();
  matchesWrap.innerHTML = '';
  let visibleCount = 0;

  state.leagues.forEach(league=>{
    if (!state.activeLeagues.has(league.name)) return;

    const toShow = league.matches.filter(m=>{
      const hay = `${league.name} ${m.home} ${m.away}`.toLowerCase();
      return !q || hay.includes(q);
    });
    if (toShow.length === 0) return;

    const leagueEl = document.createElement('div');
    leagueEl.className = 'league glass';

    const header = document.createElement('div');
    header.className = 'league-header';
    header.textContent = league.name;
    leagueEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'match-list';

    toShow.forEach(m=>{
      visibleCount++;
      const mId = matchIdOf(m);
      const selected = state.selections.find(s => s.matchId === mId)?.outcome || null;

      const card = document.createElement('div');
      card.className = 'match-card';

      const left = document.createElement('div');
      left.className = 'time';
      left.textContent = fmtTime(m.utcDate);

      const mid = document.createElement('div');
      mid.className = 'teams';
      mid.textContent = `${m.home} — ${m.away}`;

      const right = document.createElement('div');
      right.className = 'odds';

      const best = bestKey(m.odds);
      ['home','draw','away'].forEach(k=>{
        const btn = document.createElement('button');
        btn.className = 'odd' + (k===best ? ' best' : '') + (selected===k ? ' selected' : '');
        btn.dataset.key = k;
        btn.dataset.matchId = mId;
        btn.dataset.home = m.home;
        btn.dataset.away = m.away;
        btn.dataset.odd = Number(m.odds[k]).toFixed(2);
        btn.textContent = Number(m.odds[k]).toFixed(2);
        btn.addEventListener('click', ()=> onOddClick(m, k, btn));
        right.appendChild(btn);
      });

      card.appendChild(left);
      card.appendChild(mid);
      card.appendChild(right);
      list.appendChild(card);
    });

    leagueEl.appendChild(list);
    matchesWrap.appendChild(leagueEl);
  });

  matchCount.textContent = `${visibleCount} ${pluralMecz(visibleCount)}`;
}

function bestKey(odds){
  const entries = Object.entries(odds).map(([k,v])=>[k, Number(v)]);
  entries.sort((a,b)=> b[1]-a[1]);
  return entries[0]?.[0] || 'home';
}

// === Jedna selekcja na mecz + toggle ===
function onOddClick(match, outcome, btn){
  const matchId = matchIdOf(match);
  const existing = state.selections.find(s => s.matchId === matchId);

  // 1) jeśli klikamy to samo co już wybrane → odznacz (remove)
  if (existing && existing.outcome === outcome) {
    state.selections = state.selections.filter(s => s.matchId !== matchId);
    updateButtonsSelection(matchId, null);
    renderSlip();
    showToast('Usunięto z kuponu');
    return;
  }

  // 2) w przeciwnym razie ustaw/zmień wybór dla tego meczu (zastępuje poprzedni)
  const odd = Number(match.odds[outcome]);
  if (existing) {
    existing.outcome = outcome;
    existing.odd = odd;
  } else {
    state.selections.push({
      matchId, home: match.home, away: match.away, outcome, odd
    });
  }
  updateButtonsSelection(matchId, outcome);
  renderSlip();
  showToast('Zaktualizowano kupon');
}

// podświetlanie przycisków w karcie meczu
function updateButtonsSelection(matchId, outcome){
  const buttons = document.querySelectorAll(`.odd[data-match-id="${matchId}"]`);
  buttons.forEach(b=>{
    if (outcome && b.dataset.key === outcome) b.classList.add('selected');
    else b.classList.remove('selected');
  });
}

// === Kupon ===
function renderSlip(){
  selectionsEl.innerHTML = '';
  selCountEl.textContent = state.selections.length;

  state.selections.forEach(sel=>{
    const el = document.createElement('div');
    el.className = 'sel';

    const desc = document.createElement('div');
    desc.className = 'desc';
    const label =
      sel.outcome==='home' ? `${sel.home} wygra z ${sel.away}` :
      sel.outcome==='away' ? `${sel.away} wygra z ${sel.home}` :
      `${sel.home} zremisuje z ${sel.away}`;
    desc.innerHTML = `${label} @ <span class="odds">${sel.odd.toFixed(2)}</span>`;

    const ctr = document.createElement('div');
    ctr.className = 'controls';
    const prob = document.createElement('input');
    prob.className = 'prob';
    prob.type = 'number'; prob.min = '0'; prob.max='100';
    prob.placeholder = '%'; prob.title = 'Twoje prawdopodobieństwo (w %)';
    const rm = document.createElement('button');
    rm.className = 'remove'; rm.title = 'Usuń'; rm.textContent = '✖';
    rm.addEventListener('click', ()=>{
      // usuń ze stanu
      state.selections = state.selections.filter(s => s.matchId !== sel.matchId);
      // odznacz w widoku meczów
      updateButtonsSelection(sel.matchId, null);
      renderSlip();
    });

    ctr.appendChild(prob);
    ctr.appendChild(document.createTextNode('%'));
    ctr.appendChild(rm);
    el.appendChild(desc);
    el.appendChild(ctr);
    selectionsEl.appendChild(el);
  });

  // łączny kurs
  const total = state.selections.reduce((acc,s)=> acc*s.odd, 1);
  combinedOddsEl.textContent = state.selections.length ? total.toFixed(2) : '—';

  // zapisz kupon
  localStorage.setItem('matchiq_slip', JSON.stringify(state.selections));
}

function restoreSlip(){
  try {
    const saved = JSON.parse(localStorage.getItem('matchiq_slip') || '[]');
    if (Array.isArray(saved)) {
      state.selections = saved;
      renderSlip();
    }
  } catch {}
}

// Kelly
function calcKelly(){
  if (!state.selections.length) {
    kellyResult.textContent = 'Brak wybranych zakładów.'; kellyResult.className='kelly-result';
    return;
  }
  const bankroll = Math.max(0, Number(bankrollEl.value)||0);
  const kFrac   = Math.max(0, Math.min(1, Number(kellyFractionEl?.value)||1)); // gdy brak suwaka, weź 1

  let combinedOdds = 1;
  let combinedProb = 1;
  const probInputs = selectionsEl.querySelectorAll('.sel .prob');
  if (probInputs.length !== state.selections.length) return;

  for (let i=0;i<state.selections.length;i++){
    const odd = state.selections[i].odd;
    combinedOdds *= odd;

    const raw = Number(probInputs[i].value);
    if (Number.isNaN(raw)) {
      kellyResult.textContent = 'Uzupełnij prawdopodobieństwo dla każdego typu.'; 
      kellyResult.className='kelly-result negative';
      return;
    }
    let p = raw > 1 ? raw/100 : raw; // 60 => 0.6
    p = Math.min(1, Math.max(0, p));
    combinedProb *= p;
  }

  const b = combinedOdds - 1;
  const p = combinedProb;
  const q = 1 - p;
  const f = (b*p - q) / b;
  const fAdj = Math.max(0, f) * kFrac;

  if (f <= 0 || bankroll <= 0) {
    kellyResult.textContent = 'Nie obstawiaj (brak dodatniej wartości oczekiwanej).';
    kellyResult.className = 'kelly-result ' + (f < 0 ? 'negative' : 'zero');
    return;
  }
  const stake = bankroll * fAdj;
  kellyResult.textContent = `Kelly: ${(f*100).toFixed(2)}% • Frakcja: ${(fAdj*100).toFixed(2)}% • Stawka ≈ ${stake.toFixed(2)} PLN`;
  kellyResult.className = 'kelly-result positive';
}

// === Zdarzenia ===
if (refreshBtn) refreshBtn.addEventListener('click', ()=> loadMatches(datePicker.value));
if (datePicker)  datePicker.addEventListener('change', ()=> loadMatches(datePicker.value));
if (searchInput) searchInput.addEventListener('input', ()=> renderMatches());
if (kellyFractionEl) kellyFractionEl.addEventListener('input', ()=> kellyFractionVal.textContent = `${Number(kellyFractionEl.value).toFixed(2)}×`);
if (calcKellyBtn) calcKellyBtn.addEventListener('click', calcKelly);
if (slipToggle)   slipToggle.addEventListener('click', ()=> slip.classList.toggle('open'));
if (themeToggle)  themeToggle.addEventListener('click', ()=>{
  state.theme = (state.theme === 'dark' ? 'light' : 'dark');
  localStorage.setItem('theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  themeToggle.textContent = state.theme === 'dark' ? '🌙' : '☀️';
});

// === Start ===
restoreSlip();
loadMatches(datePicker.value);
