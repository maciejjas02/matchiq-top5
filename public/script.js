// public/script.js

const datePicker = document.getElementById('datePicker');
const refreshBtn = document.getElementById('refreshBtn');
const searchInput = document.getElementById('searchInput');
const matchCountSpan = document.getElementById('matchCount');
const matchesContainer = document.getElementById('matchesContainer');
const selectionsDiv = document.getElementById('selections');
const combinedOddsP = document.getElementById('combinedOdds');
const bankrollInput = document.getElementById('bankroll');
const calcKellyBtn = document.getElementById('calcKelly');
const kellyResultP = document.getElementById('kellyResult');

const todayStr = new Date().toISOString().slice(0, 10);
datePicker.value = todayStr;

async function loadMatches(dateStr) {
  matchCountSpan.textContent = "Ładowanie..."; 
  try {
    const response = await fetch(`/matches/${dateStr}`);
    const data = await response.json();
    if (data.error) {
      matchCountSpan.textContent = "Błąd ładowania danych";
      return;
    }
    renderMatches(data.leagues);
    applySearchFilter(); 
  } catch (err) {
    console.error("Error fetching matches:", err);
    matchCountSpan.textContent = "Błąd połączenia z API";
  }
}

function renderMatches(leagues) {
  matchesContainer.innerHTML = "";  
  let totalMatches = 0;
  leagues.forEach(league => {
    const leagueName = league.name;
    const matchList = league.matches;
    if (!matchList || matchList.length === 0) return;
    const sectionDiv = document.createElement('div');
    sectionDiv.className = "league-section";
    sectionDiv.dataset.league = leagueName;
    const header = document.createElement('h3');
    header.textContent = leagueName;
    sectionDiv.appendChild(header);
    const table = document.createElement('table');
    table.className = "matches-table";
    table.innerHTML = `
      <thead>
        <tr><th>Czas</th><th>Mecz</th><th>1</th><th>X</th><th>2</th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    matchList.forEach(match => {
      totalMatches++;
      const matchDate = new Date(match.utcDate);
      const hours = matchDate.getHours().toString().padStart(2, '0');
      const minutes = matchDate.getMinutes().toString().padStart(2, '0');
      const timeLocal = `${hours}:${minutes}`;
      const row = document.createElement('tr');
      row.className = "match-row";
      row.dataset.league = leagueName;
      row.innerHTML = `
        <td class="time">${timeLocal}</td>
        <td class="matchup">${match.home} – ${match.away}</td>
        <td class="odd" data-outcome="home" data-home="${match.home}" data-away="${match.away}" data-odd="${match.odds.home}">${match.odds.home.toFixed(2)}</td>
        <td class="odd" data-outcome="draw" data-home="${match.home}" data-away="${match.away}" data-odd="${match.odds.draw}">${match.odds.draw.toFixed(2)}</td>
        <td class="odd" data-outcome="away" data-home="${match.home}" data-away="${match.away}" data-odd="${match.odds.away}">${match.odds.away.toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    });
    sectionDiv.appendChild(table);
    matchesContainer.appendChild(sectionDiv);
  });
  updateMatchCount();
  attachOddsHandlers();
}

function updateMatchCount() {
  const visibleMatches = document.querySelectorAll('.match-row:not(.hidden)');
  const count = visibleMatches.length;
  let label;
  if (count === 1) {
    label = "mecz";
  } else if (count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14)) {
    label = "mecze";
  } else {
    label = "meczów";
  }
  matchCountSpan.textContent = `${count} ${label}`;
}

function attachOddsHandlers() {
  const oddCells = document.querySelectorAll('.matches-table td.odd');
  oddCells.forEach(cell => {
    cell.addEventListener('click', () => {
      const outcome = cell.dataset.outcome;  
      const homeTeam = cell.dataset.home;
      const awayTeam = cell.dataset.away;
      const oddValue = parseFloat(cell.dataset.odd);
      addSelection(homeTeam, awayTeam, outcome, oddValue);
    });
  });
}

function addSelection(home, away, outcome, odd) {
  let description = "";
  if (outcome === "home") {
    description = `${home} wygra z ${away}`;
  } else if (outcome === "away") {
    description = `${away} wygra z ${home}`;
  } else if (outcome === "draw") {
    description = `${home} zremisuje z ${away}`;
  }
  const itemDiv = document.createElement('div');
  itemDiv.className = "selection-item";
  itemDiv.innerHTML = `
    <span>${description} @ <span class="odds">${odd.toFixed(2)}</span></span>
    <input type="number" class="prob-input" min="0" max="100" placeholder="%" />
    <span>%</span>
    <button class="remove-btn" title="Usuń">✖</button>
  `;
  selectionsDiv.appendChild(itemDiv);
  updateCombinedOdds();
  const removeBtn = itemDiv.querySelector('.remove-btn');
  removeBtn.addEventListener('click', () => {
    itemDiv.remove();
    updateCombinedOdds();
  });
}

function updateCombinedOdds() {
  const oddsSpans = selectionsDiv.querySelectorAll('.selection-item .odds');
  let combined = 1;
  oddsSpans.forEach(span => {
    const oddVal = parseFloat(span.textContent);
    combined *= oddVal;
  });
  if (oddsSpans.length === 0) {
    combinedOddsP.textContent = ""; 
    return;
  }
  combinedOddsP.textContent = `Łączny kurs: ${combined.toFixed(2)}`;
}

function applySearchFilter() {
  const query = searchInput.value.toLowerCase().trim();
  const allRows = document.querySelectorAll('.match-row');
  if (query === "") {
    allRows.forEach(row => row.classList.remove('hidden'));
    document.querySelectorAll('.league-section').forEach(sec => sec.classList.remove('hidden'));
    updateMatchCount();
    return;
  }
  allRows.forEach(row => {
    const leagueName = row.dataset.league.toLowerCase();
    const text = row.textContent.toLowerCase();
    if (text.includes(query) || leagueName.includes(query)) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
  const sections = document.querySelectorAll('.league-section');
  sections.forEach(sec => {
    const hasVisible = sec.querySelector('.match-row:not(.hidden)') !== null;
    if (!hasVisible) {
      sec.classList.add('hidden');
    } else {
      sec.classList.remove('hidden');
    }
  });
  updateMatchCount();
}

function calculateKelly() {
  const selections = document.querySelectorAll('.selection-item');
  if (selections.length === 0) {
    kellyResultP.textContent = "Brak wybranych zakładów.";
    kellyResultP.className = "";
    return;
  }

  let combinedOdds = 1;
  let combinedProb = 1;
  let allProbProvided = true;
  selections.forEach(item => {
    const oddVal = parseFloat(item.querySelector('.odds').textContent);
    const probInput = item.querySelector('.prob-input');
    let p = parseFloat(probInput.value);
    if (isNaN(p)) {
      allProbProvided = false;
      return;
    }
    if (p > 1) p = p / 100;  
    else if (p <= 1) {
    }
    if (p > 1) p = 1;  
    if (p < 0) p = 0;
    combinedOdds *= oddVal;
    combinedProb *= p;
  });
  if (!allProbProvided) {
    kellyResultP.textContent = "Uzupełnij prawdopodobieństwo dla każdego typu.";
    kellyResultP.className = "negative";
    return;
  }

  const b = combinedOdds - 1;
  const p = combinedProb;
  const q = 1 - p;
  const fraction = (b * p - q) / b;
  const bankroll = parseFloat(bankrollInput.value) || 0;
  if (fraction <= 0 || bankroll <= 0) {
    kellyResultP.textContent = "Nie obstawiaj (brak dodatniej wartości oczekiwanej).";
    kellyResultP.className = fraction < 0 ? "negative" : "zero";
  } else {
    let percent = (fraction * 100).toFixed(2);
    if (percent > 100) percent = "100";  
    const stake = (bankroll * fraction).toFixed(2);
    kellyResultP.textContent = `Zalecana stawka: ${percent}% (≈ ${stake} PLN)`;
    kellyResultP.className = "positive";
  }
}


refreshBtn.addEventListener('click', () => {
  const date = datePicker.value;
  loadMatches(date);
});
datePicker.addEventListener('change', () => {

  loadMatches(datePicker.value);
});
searchInput.addEventListener('input', () => {
  applySearchFilter();
});
calcKellyBtn.addEventListener('click', () => {
  calculateKelly();
});

loadMatches(todayStr);
