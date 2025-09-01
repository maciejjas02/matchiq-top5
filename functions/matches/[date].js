// Cloudflare Pages Function: GET /matches/:date
// Top 5 lig + najlepsze kursy 1X2. Horyzont 30 dni do przodu.
// Fallback regionów: najpierw EU, potem UK – kursy łączone i wybierane maksymalne.
// Zwraca też: nextDate (najbliższy dzień z meczami >= :date) oraz meta (statusy, limity).

const LEAGUES = [
  { key: "soccer_epl",                name: "Premier League" },
  { key: "soccer_spain_la_liga",      name: "La Liga (Hiszpania)" },
  { key: "soccer_italy_serie_a",      name: "Serie A (Włochy)" },
  { key: "soccer_germany_bundesliga", name: "Bundesliga (Niemcy)" },
  { key: "soccer_france_ligue_one",   name: "Ligue 1 (Francja)" },
];

const REGIONS   = ["eu", "uk"]; // kolejność fallbacku
const DAYS_FROM = 30;           // ile dni do przodu pobieramy
const TTL_SEC   = 600;          // 10 min – cache tylko przy sukcesie

export async function onRequest({ params, request, env }) {
  const date = (params?.date || "").trim(); // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date" }, 400);
  if (!env.ODDS_API_KEY)               return json({ error: "Missing ODDS_API_KEY" }, 500);

  const url = new URL(request.url);
  const noCache = url.searchParams.has("nocache");
  const cacheKey = new Request(`https://cache/matches/${date}`);

  // 1) Edge cache (jeśli nie pomijamy)
  if (!noCache) {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  }

  const meta = { calls: [], errors: [] };
  const allDates = new Set();

  // 2) Dla każdej ligi pobierz dane z kilku regionów i scalaj
  const results = await Promise.all(
    LEAGUES.map(async ({ key, name }) => {
      // mapa meczów w wybranym dniu: matchKey -> {home, away, utcDate, odds}
      const dayMap = new Map();

      for (const region of REGIONS) {
        const api = `https://api.the-odds-api.com/v4/sports/${key}/odds` +
                    `?regions=${region}&markets=h2h&oddsFormat=decimal&daysFrom=${DAYS_FROM}` +
                    `&apiKey=${env.ODDS_API_KEY}`;

        const r = await fetch(api);
        meta.calls.push({
          league: name,
          region,
          status: r.status,
          remaining: r.headers.get("x-requests-remaining") || null
        });

        if (!r.ok) {
          meta.errors.push({ league: name, region, status: r.status });
          continue;
        }

        const games = await r.json();
        if (!Array.isArray(games)) continue;

        for (const g of games) {
          const iso = g?.commence_time;
          if (!iso) continue;
          const day = iso.slice(0, 10);
          allDates.add(day);
          if (day !== date) continue;

          // klucz meczu – kombinacja drużyn i startu
          const matchKey = `${g.home_team}|${g.away_team}|${iso}`;
          const current = dayMap.get(matchKey) || {
            home: g.home_team,
            away: g.away_team,
            utcDate: iso,
            odds: { home: 0, draw: 0, away: 0 }
          };

          // scal najlepsze kursy z tej odpowiedzi
          mergeBestOddsFromGame(g, current.odds);
          dayMap.set(matchKey, current);
        }
      }

      // przekształć mapę na tablicę i odfiltruj mecze bez kompletu kursów
      const matches = Array.from(dayMap.values()).filter(m =>
        m.odds.home && m.odds.draw && m.odds.away
      );

      return matches.length ? { name, matches } : null;
    })
  );

  const leagues  = results.filter(Boolean);
  const nextDate = findNextDate(allDates, date);
  const payload  = { date, nextDate, leagues, meta };

  // 3) Cache tylko, jeśli nie było totalnej porażki (brak lig oraz błędy dla wszystkich wywołań)
  const totalCalls = meta.calls.length;
  const totalErrors = meta.errors.length;
  const allFailed = leagues.length === 0 && totalErrors === totalCalls && totalCalls > 0;

  const res = json(payload, allFailed ? 503 : 200, {
    "Cache-Control": allFailed ? "no-store" : `public, max-age=0, s-maxage=${TTL_SEC}`
  });

  if (!allFailed && !noCache) {
    await caches.default.put(cacheKey, res.clone());
  }
  return res;
}

// --- helpers ---

/** Uzupełnia w obiekcie odds najlepsze kursy z pojedynczej odpowiedzi gry (bookmakers x outcomes). */
function mergeBestOddsFromGame(game, odds) {
  const H = game.home_team;
  const A = game.away_team;

  for (const bm of game.bookmakers || []) {
    const mkt = (bm.markets || []).find(m => m.key === "h2h");
    if (!mkt) continue;

    for (const o of mkt.outcomes || []) {
      const price = Number(o.price);
      if (!isFinite(price)) continue;

      if (o.name === H)      odds.home = Math.max(odds.home || 0, price);
      else if (o.name === A) odds.away = Math.max(odds.away || 0, price);
      else if (/^draw$/i.test(o.name))
                             odds.draw = Math.max(odds.draw || 0, price);
    }
  }
}

/** Zwraca najbliższą datę >= from, dla której pojawiły się wydarzenia w horyzoncie. */
function findNextDate(allDates, from) {
  const arr = Array.from(allDates).filter(d => d >= from).sort();
  return arr[0] || null;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra }
  });
}
